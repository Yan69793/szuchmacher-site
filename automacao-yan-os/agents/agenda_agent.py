#!/usr/bin/env python3
"""
agenda_agent.py — Agent 2: Agenda Agent
Gera agenda-data.json a partir de FONTES OFICIAIS e publica via FTP.

Fontes:
  - BR dinâmico: API de calendário do IBGE (servicodados.ibge.gov.br/api/v3/calendario)
  - BR dinâmico: BCB Olinda (CalendarioEvento) — REMOVIDO 2026-07-19: endpoint
    nunca existiu no Olinda/IFDATA (HTTP 400 "Cannot find EntitySet ... CalendarioEvento").
    Não há substituto público de calendário de eventos do BCB no portal Olinda.
  - BR determinístico: Boletim Focus (2ª feira), COPOM (datas fixas 2026)
  - US determinístico: calendário anual oficial 2026 — CPI, PPI, Retail Sales,
    Nonfarm Payrolls (BLS/Census) e FOMC (Fed). Datas hardcoded a partir dos
    schedules oficiais; horários convertidos de ET para BRT com regra de DST dos EUA.

Guarda anti-regressão: se a agenda recém-gerada tiver MENOS eventos que a agenda
vigente para a MESMA janela, a vigente é preservada e um alerta é logado — evita
publicar uma agenda empobrecida (incidente 2026-07-13).

Uso:
  python agents/agenda_agent.py
  python agents/agenda_agent.py --dry-run
"""

import argparse
import gzip
import json
import re
import sys
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path

_AGENTS_DIR = Path(__file__).parent
_BASE_DIR = _AGENTS_DIR.parent
_PROJECT_DIR = _BASE_DIR.parent
_AGENDA_PATH = _PROJECT_DIR / "site-producao" / "agenda-data.json"
_LOG_DIR = _BASE_DIR / "logs"

sys.path.insert(0, str(_BASE_DIR / "data"))

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

from config import SITE_FTP_HOST, SITE_PASS, SITE_REMOTE_DIR  # noqa: E402,F401
from atualizador_site import FTPClient  # noqa: E402

# ---------------------------------------------------------------------------
# Calendários determinísticos 2026
# ---------------------------------------------------------------------------

COPOM_2026 = [
    "2026-01-29", "2026-03-19", "2026-05-07",
    "2026-06-17", "2026-07-30", "2026-09-17",
    "2026-11-05", "2026-12-10",
]

FOMC_2026 = [
    {"data": "2026-01-29", "dot_plot": False},
    {"data": "2026-03-19", "dot_plot": True},
    {"data": "2026-04-30", "dot_plot": False},
    {"data": "2026-06-17", "dot_plot": True},
    {"data": "2026-07-30", "dot_plot": False},
    {"data": "2026-09-17", "dot_plot": True},
    {"data": "2026-11-05", "dot_plot": False},
    {"data": "2026-12-10", "dot_plot": True},
]

# Schedules oficiais 2026 (data de divulgação; hora 08:30 ET). A referência é
# sempre o mês anterior ao mês da divulgação. Fontes:
#   CPI/PPI/NFP: bls.gov/schedule/news_release/  | Retail: census.gov/retail/release_schedule.html
US_CPI_2026 = [
    "2026-02-13", "2026-03-11", "2026-04-10", "2026-05-12", "2026-06-10",
    "2026-07-14", "2026-08-12", "2026-09-11", "2026-10-14", "2026-11-10", "2026-12-10",
]
US_PPI_2026 = [
    "2026-02-27", "2026-03-18", "2026-04-14", "2026-05-13", "2026-06-11",
    "2026-07-15", "2026-08-13", "2026-09-10", "2026-10-15", "2026-11-13", "2026-12-15",
]
US_RETAIL_2026 = [
    "2026-03-06", "2026-04-01", "2026-04-21", "2026-05-14", "2026-06-17",
    "2026-07-16", "2026-08-14", "2026-09-16", "2026-10-15", "2026-11-17", "2026-12-16",
]
US_NFP_2026 = [
    "2026-02-11", "2026-03-06", "2026-04-03", "2026-05-08", "2026-06-05",
    "2026-07-02", "2026-08-07", "2026-09-04", "2026-10-02", "2026-11-06", "2026-12-04",
]

_MESES_PT = [
    "", "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]
_MESES_EN = [
    "", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]

# Incluir eventos IBGE de baixa relevância (setoriais como LSPA, Logística dos
# Transportes)? False = agenda macro mais limpa (padrão para wealth advisory).
INCLUIR_IBGE_BAIXA = False

# Relevância por padrão no título/alias do produto IBGE (macro para wealth advisory).
_IBGE_RELEVANCIA = [
    (r"ipca|inpc|índice nacional de preços|indice nacional de precos", "alta"),
    (r"pnad|desemprego|desocupação|desocupacao|mercado de trabalho", "alta"),
    (r"\bpib\b|contas nacionais|produto interno", "alta"),
    (r"produção industrial|producao industrial|pim", "alta"),
    (r"pesquisa mensal de serviços|pesquisa mensal de servicos", "media"),
    (r"pesquisa mensal de comércio|pesquisa mensal de comercio", "media"),
    (r"índice de preços ao produtor|indice de precos ao produtor|ipp", "media"),
    (r"pesquisa industrial mensal", "media"),
]


# ---------------------------------------------------------------------------
# Helpers de data/hora
# ---------------------------------------------------------------------------

def log(msg: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    try:
        _LOG_DIR.mkdir(exist_ok=True)
        path = _LOG_DIR / f"agenda_agent_{datetime.now():%Y%m%d}.log"
        with open(path, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


def na_janela(data_str: str, ini: str, fim: str) -> bool:
    return ini <= data_str <= fim


def janela_seg_sex(hoje: date | None = None) -> tuple[date, date]:
    """Semana corrente (segunda a sexta) contendo `hoje`; se fim de semana, a próxima."""
    hoje = hoje or date.today()
    wd = hoje.isoweekday()
    if wd <= 5:
        prox_seg = hoje - timedelta(days=wd - 1)
    else:
        prox_seg = hoje + timedelta(days=8 - wd)
    prox_sex = prox_seg + timedelta(days=4)
    return prox_seg, prox_sex


def _nth_weekday(ano: int, mes: int, weekday_iso: int, n: int) -> date:
    d = date(ano, mes, 1)
    count = 0
    while True:
        if d.isoweekday() == weekday_iso:
            count += 1
            if count == n:
                return d
        d += timedelta(days=1)


def is_us_dst(d: date) -> bool:
    """DST dos EUA: 2º domingo de março ate 1º domingo de novembro."""
    inicio = _nth_weekday(d.year, 3, 7, 2)   # 2º domingo de março
    fim = _nth_weekday(d.year, 11, 7, 1)     # 1º domingo de novembro
    return inicio <= d < fim


def et_para_brt(data_str: str, hora_et: str) -> str:
    """Converte HH:MM em horário do Leste (ET) para BRT (America/Sao_Paulo, sem DST)."""
    d = date.fromisoformat(data_str)
    h, m = (int(x) for x in hora_et.split(":"))
    offset = 1 if is_us_dst(d) else 2  # EDT=UTC-4 -> BRT+1 ; EST=UTC-5 -> BRT+2
    total = h * 60 + m + offset * 60
    total %= 24 * 60
    return f"{total // 60:02d}:{total % 60:02d}"


def ref_mes_anterior(data_str: str) -> tuple[int, int]:
    """Mês/ano de referência = mês anterior ao mês da data de divulgação."""
    d = date.fromisoformat(data_str)
    mes = d.month - 1 or 12
    ano = d.year if d.month > 1 else d.year - 1
    return mes, ano


def relevancia_ibge(titulo: str) -> str:
    t = (titulo or "").lower()
    for pat, rel in _IBGE_RELEVANCIA:
        if re.search(pat, t):
            return rel
    return "baixa"


# ---------------------------------------------------------------------------
# Blocos de eventos
# ---------------------------------------------------------------------------

def _evento_focus(janela_inicio: str) -> dict:
    return {
        "data": janela_inicio,
        "hora_brt": "08:25",
        "regiao": "BR",
        "evento": "Boletim Focus",
        "evento_en": "Focus Market Report",
        "descricao": (
            "Medianas semanais do mercado para Selic, IPCA, câmbio e PIB — "
            "principais referências de expectativas para a curva de juros e decisão do COPOM."
        ),
        "descricao_en": (
            "Weekly market medians for Selic, CPI, FX and GDP — "
            "key forward-guidance inputs for the rate curve and COPOM decisions."
        ),
        "fonte": "BCB",
        "relevancia": "alta",
    }


def _eventos_us(ini: str, fim: str) -> list[dict]:
    eventos: list[dict] = []
    series = [
        (US_CPI_2026, "CPI", "media_alta"),
        (US_PPI_2026, "PPI", None),
        (US_RETAIL_2026, "RETAIL", None),
        (US_NFP_2026, "NFP", None),
    ]
    templates = {
        "CPI": {
            "evento": "Índice de Preços ao Consumidor (CPI) — {ref}",
            "evento_en": "Consumer Price Index (CPI) — {ref_en}",
            "descricao": (
                "Inflação ao consumidor nos EUA, cheia e núcleo. Principal referência de "
                "curto prazo para a trajetória de juros do Fed e para o apetite a risco global."
            ),
            "descricao_en": (
                "US consumer inflation, headline and core. The key near-term input for the "
                "Fed's rate path and global risk appetite."
            ),
            "relevancia": "alta",
        },
        "PPI": {
            "evento": "Índice de Preços ao Produtor (PPI) — {ref}",
            "evento_en": "Producer Price Index (PPI) — {ref_en}",
            "descricao": (
                "Inflação no atacado nos EUA. Antecede pressões de custo que se transmitem "
                "ao consumidor e complementa a leitura do CPI para o Fed."
            ),
            "descricao_en": (
                "US wholesale inflation. Signals cost pressures that feed through to consumers "
                "and complements the CPI read for the Fed."
            ),
            "relevancia": "media",
        },
        "RETAIL": {
            "evento": "Vendas no Varejo (Advance) — {ref}",
            "evento_en": "Advance Retail Sales — {ref_en}",
            "descricao": (
                "Vendas do varejo nos EUA. Principal leitura de curto prazo sobre a força do "
                "consumo americano, que responde por cerca de dois terços do PIB."
            ),
            "descricao_en": (
                "US retail sales. The key near-term read on the strength of American consumer "
                "spending, which drives roughly two-thirds of GDP."
            ),
            "relevancia": "alta",
        },
        "NFP": {
            "evento": "Payroll (Nonfarm Payrolls) — {ref}",
            "evento_en": "Nonfarm Payrolls — {ref_en}",
            "descricao": (
                "Principal termômetro do mercado de trabalho americano. Surpresas no NFP movem "
                "o dólar, os Treasuries e, por extensão, o real e a curva de juros brasileira."
            ),
            "descricao_en": (
                "Primary US labor market gauge. NFP surprises move the USD, Treasuries, and "
                "consequently BRL and the Brazilian rate curve."
            ),
            "relevancia": "alta",
        },
    }
    for datas, tipo, _ in series:
        tpl = templates[tipo]
        for data_str in datas:
            if not na_janela(data_str, ini, fim):
                continue
            mes, ano = ref_mes_anterior(data_str)
            ref = f"{_MESES_PT[mes]}/{ano}"
            ref_en = f"{_MESES_EN[mes]} {ano}"
            eventos.append({
                "data": data_str,
                "hora_brt": et_para_brt(data_str, "08:30"),
                "regiao": "US",
                "evento": tpl["evento"].format(ref=ref),
                "evento_en": tpl["evento_en"].format(ref_en=ref_en),
                "descricao": tpl["descricao"],
                "descricao_en": tpl["descricao_en"],
                "fonte": "Census Bureau" if tipo == "RETAIL" else "BLS",
                "relevancia": tpl["relevancia"],
            })
    return eventos


def _eventos_copom_fomc(ini: str, fim: str) -> list[dict]:
    eventos: list[dict] = []
    for data_str in COPOM_2026:
        if na_janela(data_str, ini, fim):
            d = date.fromisoformat(data_str)
            eventos.append({
                "data": data_str, "hora_brt": "18:30", "regiao": "BR",
                "evento": f"COPOM — Decisão de juros ({d.month:02d}/{d.year})",
                "evento_en": f"COPOM — Rate Decision ({d.month:02d}/{d.year})",
                "descricao": (
                    "O BCB divulga a decisão sobre a Selic ao final do segundo dia de reunião. "
                    "O comunicado e a ata subsequente moldam a curva de juros doméstica e o câmbio."
                ),
                "descricao_en": (
                    "BCB releases the Selic decision at the end of day two. The statement and "
                    "subsequent minutes shape the domestic rate curve and BRL."
                ),
                "fonte": "BCB", "relevancia": "alta",
            })
    for fomc in FOMC_2026:
        data_str = fomc["data"]
        if na_janela(data_str, ini, fim):
            d = date.fromisoformat(data_str)
            sufixo = " + Dot Plot" if fomc["dot_plot"] else ""
            extra = (" Inclui o Summary of Economic Projections (Dot Plot) com projeção de "
                     "trajetória de juros dos diretores." if fomc["dot_plot"] else "")
            extra_en = (" Includes the Summary of Economic Projections (Dot Plot) with "
                        "directors' rate-path forecast." if fomc["dot_plot"] else "")
            eventos.append({
                "data": data_str, "hora_brt": et_para_brt(data_str, "14:00"), "regiao": "US",
                "evento": f"FOMC — Decisão de juros{sufixo} ({d.month:02d}/{d.year})",
                "evento_en": f"FOMC — Rate Decision{sufixo} ({d.month:02d}/{d.year})",
                "descricao": ("Decisão do Federal Reserve sobre os Fed Funds." + extra +
                              " Impacto direto no diferencial Brasil–EUA e no real."),
                "descricao_en": ("Federal Reserve decision on the Fed Funds rate." + extra_en +
                                 " Direct impact on the Brazil–US rate differential and BRL."),
                "fonte": "Fed", "relevancia": "alta",
            })
    return eventos


def _eventos_ibge(ini: str, fim: str) -> list[dict]:
    """Calendário oficial do IBGE (dinâmico). Hora convertida de UTC para BRT.

    A API v3 ignora ou deforma filtros `de`/`ate` estreitos em ISO (retorna 0
    itens). Buscamos o(s) mês(es) civil(is) que cobrem a janela e filtramos
    localmente por `ini`..`fim`.
    """
    eventos: list[dict] = []
    d0 = date.fromisoformat(ini)
    d1 = date.fromisoformat(fim)
    meses: list[tuple[int, int]] = []
    cursor = date(d0.year, d0.month, 1)
    last = date(d1.year, d1.month, 1)
    while cursor <= last:
        meses.append((cursor.year, cursor.month))
        if cursor.month == 12:
            cursor = date(cursor.year + 1, 1, 1)
        else:
            cursor = date(cursor.year, cursor.month + 1, 1)

    items: list[dict] = []
    for ano, mes in meses:
        # intervalo civil do mês (ISO); testado 2026-07: retorna releases de julho
        mes_ini = f"{ano:04d}-{mes:02d}-01"
        if mes == 12:
            mes_fim = f"{ano:04d}-12-31"
        else:
            mes_fim = (date(ano, mes + 1, 1) - timedelta(days=1)).isoformat()
        url = (
            "https://servicodados.ibge.gov.br/api/v3/calendario/"
            f"?de={mes_ini}&ate={mes_fim}&qtd=100"
        )
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=12) as resp:
                raw = resp.read()
                if resp.headers.get("Content-Encoding") == "gzip" or raw[:2] == b"\x1f\x8b":
                    raw = gzip.decompress(raw)
                data = json.loads(raw.decode("utf-8"))
            items.extend(data.get("items") or [])
            log(f"IBGE mês {ano}-{mes:02d}: {len(data.get('items') or [])} item(ns)")
        except Exception as e:
            log(f"IBGE calendário falhou (opcional) {ano}-{mes:02d}: {e}")

    for item in items:
        titulo = str(item.get("titulo", "")).strip()
        div = str(item.get("data_divulgacao", "")).strip()
        if not titulo or not div:
            continue
        try:
            dt = datetime.strptime(div[:19], "%d/%m/%Y %H:%M:%S")
        except Exception:
            try:
                dt = datetime.strptime(div[:10], "%d/%m/%Y")
            except Exception:
                continue
        data_str = dt.date().isoformat()
        if not na_janela(data_str, ini, fim):
            continue
        rel = relevancia_ibge(titulo)
        if rel == "baixa" and not INCLUIR_IBGE_BAIXA:
            continue
        # IBGE devolve horário em UTC (campo sem fuso). Converter para BRT (UTC-3).
        hora_brt = (dt - timedelta(hours=3)).strftime("%H:%M")
        eventos.append({
            "data": data_str,
            "hora_brt": hora_brt,
            "regiao": "BR",
            "evento": titulo,
            "evento_en": titulo,
            "descricao": f"Divulgação programada do IBGE: {titulo}.",
            "descricao_en": f"Scheduled IBGE release: {titulo}.",
            "fonte": "IBGE",
            "relevancia": rel,
        })
    return eventos


_PESO_RELEVANCIA = {"alta": 3, "media": 2, "baixa": 1}


def _dedupe(eventos: list[dict]) -> list[dict]:
    """Remove duplicatas por (data, regiao, evento) — mantém a de maior relevância.

    A chave era (data, regiao, hora_brt), o que tratava horário como identidade:
    divulgações distintas no mesmo horário colapsavam numa só. Em 10/07/2026 o
    IBGE publica IPCA, INPC e Pesquisa Industrial todas às 09:00 BRT; sobrava
    uma, e como o critério era "primeira ocorrência" e a ordem vem da API, a
    sobrevivente era a Pesquisa Industrial (média) enquanto o IPCA (alta) sumia.
    Todo mês de divulgação de IPCA a agenda do site perdia o dado mais
    importante do calendário brasileiro.
    """
    melhor: dict[tuple, dict] = {}
    ordem: list[tuple] = []
    for e in eventos:
        chave = (e["data"], e.get("regiao"), (e.get("evento") or "").strip().casefold())
        atual = melhor.get(chave)
        if atual is None:
            melhor[chave] = e
            ordem.append(chave)
            continue
        # duplicata de verdade (mesmo evento, mesmo dia): fica a de maior relevância
        if _PESO_RELEVANCIA.get(e.get("relevancia"), 0) > _PESO_RELEVANCIA.get(atual.get("relevancia"), 0):
            melhor[chave] = e
    return [melhor[k] for k in ordem]


# ---------------------------------------------------------------------------
# Geração
# ---------------------------------------------------------------------------

def gerar_agenda(hoje: date | None = None) -> dict:
    prox_seg, prox_sex = janela_seg_sex(hoje)
    ini, fim = prox_seg.isoformat(), prox_sex.isoformat()

    eventos: list[dict] = [_evento_focus(ini)]
    eventos += _eventos_us(ini, fim)
    eventos += _eventos_copom_fomc(ini, fim)
    eventos += _eventos_ibge(ini, fim)

    eventos = _dedupe(eventos)
    eventos.sort(key=lambda e: (e["data"], e["hora_brt"]))

    return {
        "meta": {
            "version": (hoje or date.today()).isoformat(),
            "curator": "Szuchmacher Consultoria",
            "fontes_primarias": [
                "IBGE — Calendário de divulgações (API v3/calendario)",
                "BCB — Calendário de divulgações + Boletim Focus/COPOM",
                "BLS — CPI, PPI, Nonfarm Payrolls (schedule oficial 2026)",
                "Census Bureau — Advance Retail Sales (schedule oficial 2026)",
                "Fed — FOMC calendar (federalreserve.gov)",
            ],
            "disciplina": "Eventos programados em fontes oficiais. Sem antecipação de resultado.",
            "disciplina_en": "Scheduled releases from official sources. No result anticipation.",
            "idiomas": ["pt-BR", "en"],
        },
        "gerado": datetime.now().astimezone().isoformat(timespec="seconds"),
        "janela": {"inicio": ini, "fim": fim},
        "eventos": eventos,
    }


def _agenda_vigente() -> dict | None:
    try:
        with open(_AGENDA_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def anti_regressao(nova: dict) -> tuple[dict, str | None]:
    """Protege contra o modo de falha real (incidente 2026-07-13): quando TODAS as
    fontes de eventos caem e resta só o Boletim Focus determinístico. Nesse caso,
    se a vigente da MESMA janela era saudável, ela é preservada.

    Reduções legítimas (ex.: filtro de baixa relevância, semana naturalmente mais
    curta) NÃO são bloqueadas — só o colapso para <=1 evento contra uma vigente rica."""
    vig = _agenda_vigente()
    if not vig:
        return nova, None
    jn, jv = nova.get("janela", {}), vig.get("janela", {})
    if jn.get("inicio") != jv.get("inicio") or jn.get("fim") != jv.get("fim"):
        return nova, None  # janela diferente: semana nova, sempre substitui
    n_novo, n_vig = len(nova.get("eventos", [])), len(vig.get("eventos", []))
    if n_novo <= 1 and n_vig >= 3:
        aviso = (f"REGRESSAO EVITADA: nova agenda colapsou para {n_novo} evento(s) "
                 f"(fontes provavelmente caídas) contra vigente saudável de {n_vig} na "
                 f"janela {jn.get('inicio')}→{jn.get('fim')}. Vigente preservada.")
        return vig, aviso
    return nova, None


def salvar_local(payload: dict) -> bool:
    try:
        _AGENDA_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(_AGENDA_PATH, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        log(f"Salvo: {_AGENDA_PATH}")
        return True
    except Exception as e:
        log(f"ERRO ao salvar: {e}")
        return False


def upload_ftp(payload: dict) -> bool:
    if not SITE_PASS:
        log("ERRO: SITE_PASS não configurada.")
        return False
    ftp = FTPClient()
    if not ftp.conectar():
        return False
    remote_dir = SITE_REMOTE_DIR.rstrip("/")
    if not ftp.ir_para(remote_dir):
        for alt in ["/public_html", "public_html", "/home1/hg545631/public_html"]:
            if ftp.ir_para(alt):
                break
    ok = ftp.upload_json("agenda-data.json", payload)
    ftp.fechar()
    log(f"FTP {'OK' if ok else 'ERRO'} — agenda-data.json")
    return ok


def main():
    parser = argparse.ArgumentParser(description="Agenda Agent — MultiAsset")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    log("=" * 56)
    log(f"AGENDA AGENT  {'[DRY-RUN]' if args.dry_run else '[PRODUÇÃO]'}")
    log("=" * 56)

    nova = gerar_agenda()
    payload, aviso = anti_regressao(nova)
    if aviso:
        log(aviso)

    qtd = len(payload["eventos"])
    j = payload["janela"]
    log(f"Janela {j['inicio']} → {j['fim']} · {qtd} evento(s)")
    for e in payload["eventos"]:
        log(f"  {e['data']} {e['hora_brt']} [{e['regiao']}] {e['evento']} ({e['relevancia']})")

    if qtd < 1:
        log("ERRO: agenda vazia — abortando.")
        sys.exit(1)

    if not salvar_local(payload):
        sys.exit(1)

    if args.dry_run:
        log("DRY-RUN: FTP pulado.")
    elif not upload_ftp(payload):
        sys.exit(1)

    log("AGENDA AGENT CONCLUÍDO")


if __name__ == "__main__":
    main()
