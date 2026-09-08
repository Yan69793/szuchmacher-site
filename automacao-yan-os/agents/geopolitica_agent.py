#!/usr/bin/env python3
"""
geopolitica_agent.py — Agente do Radar Geopolítico Semanal
szuchmacher.com.br

Pipeline: pesquisar -> deduplicar -> validar fontes -> sintetizar (OpenRouter,
mesmo provider do MacroAgent no Worker) -> gerar JSON -> validar schema ->
gravar edicao + historico. A publicacao fica a cargo do runner PowerShell
(scripts/run-geopolitica-agent.ps1), que usa publicar-com-rollback.ps1,
exatamente como o par macro_agent.py / run-macro-agent.ps1.

Regras editoriais (brief 2026-09-07):
- 4 a 6 temas materiais por semana.
- Minimo 2 fontes independentes por fato material; 3 para tese de alto impacto.
- LinkedIn/Reddit/foruns nunca sustentam afirmacao factual sozinhos (tipo
  'secundaria' entra apenas como sinal).
- Sem probabilidades numericas (campo probabilidade sempre null).
- Nao inventar informacao: o sintetizador so usa o dossie pesquisado.

Uso:
  python agents/geopolitica_agent.py                    # executa pipeline completo
  python agents/geopolitica_agent.py --dry-run          # nao grava arquivo final
  python agents/geopolitica_agent.py --force            # regera mesmo se fresco
  python agents/geopolitica_agent.py --fontes-min 4     # endurece guarda de coleta

Deve ser rodado a partir de automacao-yan-os/ (importa config do data/).
"""

import argparse
import shutil
import json
import re
import sys
import unicodedata
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

_AGENTS_DIR  = Path(__file__).parent
_BASE_DIR    = _AGENTS_DIR.parent
_PROJECT_DIR = _BASE_DIR.parent
_DATA_DIR    = _BASE_DIR / "data"

sys.path.insert(0, str(_DATA_DIR))

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

try:
    import requests  # noqa: E402  (sondado pelo runner: venv-task tem requests)
except ImportError:  # permite validar funções puras com o Python base
    requests = None

SITE_DIR       = _PROJECT_DIR / "site-producao"
DATA_JSON      = SITE_DIR / "geopolitica-data.json"
HISTORICO_DIR  = SITE_DIR / "geopolitica-historico"
CONFIG_PHP     = SITE_DIR / "config.php"
LOG_DIR        = _BASE_DIR / "logs"
LOG_PATH       = LOG_DIR / f"geopolitica_agent_{datetime.now().strftime('%Y%m%d')}.log"

STALE_GERACAO_DIAS = 2   # edicao fresca = gerada a partir de (start - 2 dias)
UA = {"User-Agent": "SzuchmacherGeopoliticaAgent/1.0 (pesquisa editorial)"}
BRT = timezone(timedelta(hours=-3))
MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho",
         "agosto", "setembro", "outubro", "novembro", "dezembro"]
REGIOES = (
    "panorama_global", "eua", "europa", "china_asia", "oriente_medio",
    "russia_ucrania", "energia_commodities", "comercio_sancoes", "riscos_sistemicos",
)
MERCADOS = (
    "petroleo", "inflacao", "juros_globais", "treasury", "dolar", "ouro",
    "acoes", "credito", "commodities", "brasil", "curva_di", "brl",
)


def log(msg: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    linha = f"[{ts}] {msg}"
    print(linha)
    try:
        LOG_DIR.mkdir(exist_ok=True)
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(linha + "\n")
    except Exception:
        pass


# ─── Pesquisa ────────────────────────────────────────────────────────────────

# Registro de fontes. 'rss' e o parser preferido (estruturado); 'html' extrai
# manchetes de h1-h4. Tipo segue o schema do JSON: primaria/analise/mercado/
# secundaria. LinkedIn/Reddit/foruns ficam fora do registro: nunca sustentam
# fato sozinhos, e o pipeline nao depende deles.
FONTES = [
    {"veiculo": "BBC News",            "url": "https://feeds.bbci.co.uk/news/world/rss.xml", "tipo": "primaria", "parser": "rss"},
    {"veiculo": "Al Jazeera",          "url": "https://www.aljazeera.com/xml/rss/all.xml",   "tipo": "primaria", "parser": "rss"},
    {"veiculo": "Deutsche Welle",      "url": "https://rss.dw.com/rdf/rss-en-eu",            "tipo": "primaria", "parser": "rss"},
    {"veiculo": "ONU News",            "url": "https://news.un.org/feed/subscribe/en/news/all/rss.xml", "tipo": "primaria", "parser": "rss"},
    {"veiculo": "OilPrice",            "url": "https://oilprice.com/rss/main",               "tipo": "mercado",  "parser": "rss"},
    {"veiculo": "South China Morning Post", "url": "https://www.scmp.com/rss/4/feed",        "tipo": "primaria", "parser": "rss"},
    {"veiculo": "AP News",             "url": "https://apnews.com/",                         "tipo": "primaria", "parser": "html"},
    {"veiculo": "CSIS",                "url": "https://www.csis.org/analysis",               "tipo": "analise",  "parser": "html"},
    {"veiculo": "CFR",                 "url": "https://www.cfr.org/global-conflict-tracker", "tipo": "analise",  "parser": "html"},
    {"veiculo": "Federal Reserve",     "url": "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm", "tipo": "primaria", "parser": "html"},
]

TAG = re.compile(r"<[^>]+>")
RSS_ITEM = re.compile(r"<item[\s>].*?</item>", re.S | re.I)
RSS_TITLE = re.compile(r"<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</title>", re.S | re.I)
RSS_LINK = re.compile(r"<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</link>", re.S | re.I)
HTML_HEAD = re.compile(r"<h[1-4][^>]*>.*?</h[1-4]>", re.S | re.I)
HTML_ANCHOR = re.compile(r"<a[^>]*>(.*?)</a>", re.S | re.I)


def _get(url: str, timeout: int = 20) -> str | None:
    if requests is None:
        log("AVISO: requests não instalado; coleta indisponível neste interpretador")
        return None
    try:
        r = requests.get(url, headers=UA, timeout=timeout)
        if r.status_code != 200:
            log(f"AVISO: {url} -> HTTP {r.status_code}")
            return None
        r.encoding = r.apparent_encoding or "utf-8"
        return r.text
    except Exception as e:
        log(f"AVISO: falha de rede em {url}: {e}")
        return None


def _limpa(s: str) -> str:
    s = TAG.sub("", s or "")
    s = (s.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
          .replace("&quot;", '"').replace("&#39;", "'").replace("&nbsp;", " "))
    return re.sub(r"\s+", " ", s).strip()


# ─── Deduplicação ────────────────────────────────────────────────────────────

STOPWORDS = set("""a o e de da do em no na com para por que as os um uma ao aos às
the of to in on for and with from as is are at by an be this that it its de la el
en los del las un una para con como mais se sobre entre apos antes contra""".split())


def _tokens(s: str) -> set[str]:
    s = unicodedata.normalize("NFKD", s.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return {t for t in re.findall(r"[a-z0-9]{3,}", s) if t not in STOPWORDS}


def deduplicar(itens: list[dict]) -> list[dict]:
    """
    Manchete repetida em varios veiculos = a MESMA historia. Agrupa por
    similaridade de tokens (Jaccard >= 0.6) e mantem a primeira ocorrencia,
    guardando quantos veiculos independentes registraram o fato.
    """
    grupos: list[dict] = []
    for it in itens:
        tk = _tokens(it["titulo"])
        achou = None
        for g in grupos:
            if len(tk & g["_tk"]) / max(1, len(tk | g["_tk"])) >= 0.6:
                achou = g
                break
        if achou:
            achou["veiculos"].add(it["veiculo"])
        else:
            grupos.append({**it, "_tk": tk, "veiculos": {it["veiculo"]}})
    for g in grupos:
        g["independentes"] = len(g["veiculos"])
        g.pop("_tk", None)
        g["veiculos"] = sorted(g["veiculos"])
    return grupos


def validar_coleta(grupos: list[dict], minimo_fontes_vivas: int, minimo_itens: int) -> bool:
    """Falha parcial de fontes e tolerada; coleta insuficiente nao publica."""
    vivos = {g["veiculo"] for g in grupos}
    if len(vivos) < minimo_fontes_vivas:
        log(f"ERRO: apenas {len(vivos)} fontes vivas (minimo {minimo_fontes_vivas}). Abortando sem publicar.")
        return False
    if len(grupos) < minimo_itens:
        log(f"ERRO: apenas {len(grupos)} itens deduplicados (minimo {minimo_itens}). Abortando.")
        return False
    primarias = {g["veiculo"] for g in grupos if g["tipo"] == "primaria"}
    if len(primarias) < 2:
        log("ERRO: menos de 2 fontes primarias vivas. Abortando.")
        return False
    return True


# ─── Níveis de mercado (cruzados com o macro interno) ────────────────────────

def niveis_mercado() -> list[dict]:
    nivel_yahoo = (
        ("Treasury 10y", "%5ETNX"),
        ("DXY", "DX-Y.NYB"),
        ("S&P 500", "%5EGSPC"),
        ("Ouro (COMEX)", "GC%3DF"),
    )
    saida = []
    for nome, simbolo in nivel_yahoo:
        corpo = _get(
            f"https://query1.finance.yahoo.com/v8/finance/chart/{simbolo}?interval=1d&range=1d",
            timeout=15,
        )
        if not corpo:
            continue
        try:
            meta = json.loads(corpo)["chart"]["result"][0]["meta"]
            preco = meta.get("regularMarketPrice")
            if preco is not None:
                saida.append({"referencia": nome, "valor": preco,
                              "data": datetime.utcfromtimestamp(meta["regularMarketTime"]).date().isoformat(),
                              "fonte": "Yahoo Finance"})
        except Exception:
            continue
        time.sleep(0.4)
    # Macro interno (BCB/Focus) sempre entra como referencia domestica.
    macro = SITE_DIR / "macro_data.json"
    if macro.exists():
        try:
            d = json.loads(macro.read_text(encoding="utf-8"))
            texto = d.get("data", {}).get("alert_title", "")
            if texto:
                saida.append({"referencia": "Macro interno (Selic/PTAX/COPOM)", "valor": texto,
                              "data": None, "fonte": "macro_data.json"})
        except Exception:
            pass
    return saida


def coletar_fonte(f: dict) -> list[dict]:
    corpo = _get(f["url"])
    if not corpo:
        return []
    itens: list[dict] = []
    if f["parser"] == "rss":
        for item in RSS_ITEM.findall(corpo)[:14]:
            titulo = _limpa(RSS_TITLE.search(item).group(1)) if RSS_TITLE.search(item) else ""
            link = _limpa(RSS_LINK.search(item).group(1)) if RSS_LINK.search(item) else f["url"]
            if len(titulo) >= 25:
                itens.append({"titulo": titulo, "url": link or f["url"],
                              "veiculo": f["veiculo"], "tipo": f["tipo"],
                              "data": brt_now().date().isoformat()})
    else:
        # HTML: cada bloco h1-h4, a manchete e o texto do primeiro <a> (ou o
        # proprio bloco quando o titulo nao esta ancorado).
        for bloco in HTML_HEAD.findall(corpo)[:60]:
            m = HTML_ANCHOR.search(bloco)
            titulo = _limpa(m.group(1) if m else bloco)
            if len(titulo) >= 25:
                itens.append({"titulo": titulo, "url": f["url"],
                              "veiculo": f["veiculo"], "tipo": f["tipo"],
                              "data": brt_now().date().isoformat()})
    log(f"coleta {f['veiculo']}: {len(itens)} itens")
    return itens

def brt_now() -> datetime:
    return datetime.now(BRT)


def _rotulo_janela(inicio: date, fim: date) -> str:
    if inicio.year == fim.year and inicio.month == fim.month:
        return f"{inicio.day:02d} a {fim.day:02d} de {MESES[fim.month - 1]} de {fim.year}"
    if inicio.year == fim.year:
        return (f"{inicio.day:02d} de {MESES[inicio.month - 1]} a "
                f"{fim.day:02d} de {MESES[fim.month - 1]} de {fim.year}")
    return (f"{inicio.day:02d} de {MESES[inicio.month - 1]} de {inicio.year} a "
            f"{fim.day:02d} de {MESES[fim.month - 1]} de {fim.year}")


def _semana_a_partir_de(inicio: date, fim: date | None = None) -> tuple[str, str, str, str]:
    fim = fim or (inicio + timedelta(days=6))
    iso = f"{inicio.isocalendar().year:04d}-W{inicio.isocalendar().week:02d}"
    return iso, inicio.isoformat(), fim.isoformat(), _rotulo_janela(inicio, fim)


def janela_domingo(data_execucao: date) -> tuple[str, str, str, str]:
    """Calcula a edição publicada no domingo, de segunda a domingo seguinte."""
    inicio = data_execucao + timedelta(days=1)
    fim = inicio + timedelta(days=6 - inicio.weekday())
    return _semana_a_partir_de(inicio, fim)


def janela_segunda(data_execucao: date) -> tuple[str, str, str, str]:
    """Calcula a edição corrente usada pelo fallback de segunda-feira."""
    inicio = data_execucao - timedelta(days=data_execucao.weekday())
    return _semana_a_partir_de(inicio)


def semana_alvo() -> tuple[str, str, str, str]:
    """
    Rotina (brief): domingo apos o fechamento gera a semana seguinte; segunda
    de manha recupera a semana corrente; outros dias (manual) geram a proxima.

    Retorna (iso, start, end, label).
    """
    hoje = brt_now()
    if hoje.weekday() == 6:            # domingo: a semana que começa amanhã
        return janela_domingo(hoje.date())
    elif hoje.weekday() == 0 and hoje.hour < 14:  # segunda cedo: recuperacao
        return janela_segunda(hoje.date())
    else:                              # manual: proxima segunda estritamente futura
        inicio = hoje.date() - timedelta(days=hoje.weekday()) + timedelta(days=7)
        return _semana_a_partir_de(inicio)


# ─── Síntese e contrato de saída ─────────────────────────────────────────────

def _config_openrouter() -> tuple[str, str, str]:
    """Lê apenas configuração local. Nunca imprime a chave nem a inclui na URL."""
    if not CONFIG_PHP.exists():
        raise RuntimeError(f"config.php ausente: {CONFIG_PHP}")
    texto = CONFIG_PHP.read_text(encoding="utf-8")

    def campo(nome: str, padrao: str = "") -> str:
        m = re.search(r"define\('" + re.escape(nome) + r"'\s*,\s*'([^']*)'\)", texto)
        return m.group(1) if m else padrao

    chave = campo("OPENROUTER_KEY")
    url = campo("OPENROUTER_URL", "https://openrouter.ai/api/v1/chat/completions")
    modelo = campo("OPENROUTER_MODEL", "anthropic/claude-haiku-4-5")
    if not chave:
        raise RuntimeError("OPENROUTER_KEY ausente em config.php")
    if not url.startswith("https://"):
        raise RuntimeError("OPENROUTER_URL precisa usar HTTPS")
    return chave, url, modelo


def pesquisar(minimo_fontes: int) -> tuple[list[dict], list[dict]]:
    itens: list[dict] = []
    fontes_vivas: list[dict] = []
    for fonte in FONTES:
        antes = len(itens)
        itens.extend(coletar_fonte(fonte))
        if len(itens) > antes:
            fontes_vivas.append(fonte)
        time.sleep(0.2)
    grupos = deduplicar(itens)
    if not validar_coleta(grupos, minimo_fontes, 8):
        raise RuntimeError("coleta insuficiente para publicar uma edição")
    return grupos, fontes_vivas


def _dossie(grupos: list[dict], mercados: list[dict], semana: tuple[str, str, str, str]) -> str:
    iso, inicio, fim, label = semana
    return json.dumps({
        "semana": {"iso": iso, "start": inicio, "end": fim, "label": label},
        "itens": grupos,
        "niveis_mercado": mercados,
        "regras": [
            "Use somente fatos e fontes presentes neste dossie.",
            "Cada fato material deve manter pelo menos duas fontes independentes.",
            "Teses de risco elevado ou critico devem manter pelo menos tres fontes.",
            "probabilidade de todo cenario deve ser null, sem percentuais inventados.",
        ],
    }, ensure_ascii=False, indent=2)


def sintetizar(grupos: list[dict], mercados: list[dict], semana: tuple[str, str, str, str]) -> dict:
    if requests is None:
        raise RuntimeError("requests não instalado")
    chave, url, modelo = _config_openrouter()
    iso, inicio, fim, label = semana
    prompt = f"""Gere a edição semanal do Radar Geopolítico em PT-BR.
Retorne somente JSON válido, sem markdown, com exatamente estes campos de alto nível:
schema_version, generated_at, week, executive_summary, disclaimer, confidence,
themes, regions, market_impacts, scenarios, triggers, sources.

Contrato: schema_version=1; week={{iso:'{iso}', start:'{inicio}', end:'{fim}', label:'{label}'}}.
themes tem 4 a 6 itens com id, titulo, fato, impacto_mercados, proximo_gatilho,
nivel_risco (baixo|moderado|elevado|critico), confianca (alta|media|baixa) e sources.
regions contém as nove chaves exigidas no dossie, cada uma com titulo, resumo e teses.
Cada tese tem fato, interpretacao, cenario_base, risco_alternativo, gatilhos, confianca e sources.
market_impacts contém petroleo, inflacao, juros_globais, treasury, dolar, ouro,
acoes, credito, commodities, brasil, curva_di e brl. Cada item tem direcao
(alta|baixa|neutro|volatil) e comentario.
scenarios tem titulo, tipo (base|alternativo|cauda), descricao, implicacoes e probabilidade:null.
triggers tem evento, janela e relevancia. sources tem url https, titulo, veiculo, data e tipo.
Não crie fatos, URLs, datas ou fontes fora do dossie. Não use probabilidades numéricas.
Se não houver novidade material em um tópico, mantenha-o apenas se continuar relevante e
deixe isso explícito em executive_summary ou confidence.nota.
O disclaimer deve dizer que o material é informativo e não constitui recomendação.

DOSSIE:
{_dossie(grupos, mercados, semana)}"""
    resposta = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {chave}",
            "HTTP-Referer": "https://szuchmacher.com.br",
            "Content-Type": "application/json",
        },
        json={
            "model": modelo,
            "max_tokens": 12000,
            "temperature": 0.1,
            "messages": [
                {"role": "system", "content": "Editor factual. Responda somente JSON válido."},
                {"role": "user", "content": prompt},
            ],
        },
        timeout=180,
    )
    if resposta.status_code != 200:
        raise RuntimeError(f"OpenRouter HTTP {resposta.status_code}")
    bruto = resposta.json()["choices"][0]["message"]["content"].strip()
    bruto = re.sub(r"^```(?:json)?\s*|\s*```$", "", bruto, flags=re.I)
    trecho = re.search(r"\{[\s\S]*\}", bruto)
    if not trecho:
        raise RuntimeError("OpenRouter não devolveu um objeto JSON")
    try:
        payload = json.loads(trecho.group(0))
    except json.JSONDecodeError as e:
        raise RuntimeError(f"JSON do sintetizador inválido: {e}") from e
    payload["generated_at"] = brt_now().isoformat(timespec="seconds")
    payload["week"] = {"iso": iso, "start": inicio, "end": fim, "label": label}
    return payload


def _fonte_valida(f: dict) -> bool:
    return (isinstance(f, dict) and isinstance(f.get("url"), str)
            and f["url"].startswith("https://") and bool(f.get("titulo"))
            and bool(f.get("veiculo")) and bool(f.get("data"))
            and f.get("tipo") in {"primaria", "analise", "mercado", "secundaria", "interna"})


def validar_payload(data: dict, urls_permitidas: set[str] | None = None) -> list[str]:
    erros: list[str] = []
    if not isinstance(data, dict) or data.get("schema_version") != 1:
        return ["schema_version ausente ou diferente de 1"]
    week = data.get("week", {})
    if not re.fullmatch(r"\d{4}-W\d{2}", str(week.get("iso", ""))): erros.append("week.iso inválido")
    if not all(isinstance(week.get(k), str) and week[k] for k in ("start", "end", "label")): erros.append("week incompleta")
    try:
        inicio = date.fromisoformat(week["start"])
        fim = date.fromisoformat(week["end"])
        esperado = _semana_a_partir_de(inicio)
        if inicio.weekday() != 0 or fim != inicio + timedelta(days=6):
            erros.append("week não representa uma janela segunda-domingo")
        if (week.get("iso"), week.get("start"), week.get("end"), week.get("label")) != esperado:
            erros.append("week.iso, start, end e label são incoerentes")
    except (KeyError, TypeError, ValueError):
        erros.append("week.start ou week.end inválido")
    try:
        gerada = datetime.fromisoformat(str(data.get("generated_at", "")))
        if gerada.tzinfo is None or gerada.utcoffset() != timedelta(hours=-3):
            erros.append("generated_at precisa ser ISO 8601 com timezone BRT")
    except ValueError:
        erros.append("generated_at inválido")
    for k in ("executive_summary", "disclaimer"):
        if not isinstance(data.get(k), str) or not data[k].strip(): erros.append(f"{k} vazio")
    themes = data.get("themes")
    if not isinstance(themes, list) or not 4 <= len(themes) <= 6: erros.append("themes deve ter 4 a 6 itens")
    else:
        for i, t in enumerate(themes):
            for k in ("id", "titulo", "fato", "impacto_mercados", "proximo_gatilho"):
                if not isinstance(t.get(k), str) or not t[k].strip(): erros.append(f"themes[{i}].{k} vazio")
            if t.get("nivel_risco") not in {"baixo", "moderado", "elevado", "critico"}: erros.append(f"themes[{i}].nivel_risco inválido")
            if t.get("confianca") not in {"alta", "media", "baixa"}: erros.append(f"themes[{i}].confianca inválida")
            if not isinstance(t.get("sources"), list) or not all(_fonte_valida(f) for f in t["sources"]): erros.append(f"themes[{i}].sources inválidas")
            if len(t.get("sources", [])) < (3 if t.get("nivel_risco") in {"elevado", "critico"} else 2): erros.append(f"themes[{i}] sem fontes independentes suficientes")
    if data.get("confidence", {}).get("overall") not in {"alta", "media", "baixa"}: erros.append("confidence.overall inválido")
    regions = data.get("regions")
    if not isinstance(regions, dict) or any(not isinstance(regions.get(id), dict) for id in REGIOES):
        erros.append("regions incompletas")
    market_impacts = data.get("market_impacts")
    if (not isinstance(market_impacts, dict)
            or any(not isinstance(market_impacts.get(k), dict)
                   or market_impacts[k].get("direcao") not in {"alta", "baixa", "neutro", "volatil"}
                   or not isinstance(market_impacts[k].get("comentario"), str)
                   or not market_impacts[k]["comentario"].strip()
                   for k in MERCADOS)):
        erros.append("market_impacts incompletos")
    fontes = data.get("sources")
    if not isinstance(fontes, list) or len(fontes) < 8 or not all(_fonte_valida(f) for f in fontes): erros.append("sources global inválido")
    if urls_permitidas is not None and isinstance(fontes, list):
        fora = [f.get("url") for f in fontes if f.get("url") not in urls_permitidas]
        if fora: erros.append(f"sources fora do dossiê: {len(fora)}")
    for i, s in enumerate(data.get("scenarios", [])):
        if s.get("probabilidade") is not None: erros.append(f"scenarios[{i}].probabilidade não é null")
    if not isinstance(data.get("scenarios"), list) or not data["scenarios"]: erros.append("scenarios vazio")
    if not isinstance(data.get("triggers"), list) or not data["triggers"]: erros.append("triggers vazio")
    return erros


def salvar(data: dict, dry_run: bool) -> None:
    if dry_run:
        log("DRY-RUN: payload validado; nenhum arquivo final alterado")
        return
    DATA_JSON.parent.mkdir(parents=True, exist_ok=True)
    if DATA_JSON.exists():
        HISTORICO_DIR.mkdir(parents=True, exist_ok=True)
        anterior = HISTORICO_DIR / f"{datetime.now():%Y%m%d_%H%M%S}_geopolitica-data.json"
        shutil.copy2(DATA_JSON, anterior)
    temporario = DATA_JSON.with_suffix(".json.tmp")
    temporario.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporario.replace(DATA_JSON)
    log(f"Salvo: {DATA_JSON}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Radar Geopolítico semanal")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--fontes-min", type=int, default=4)
    parser.add_argument("--itens-min", type=int, default=8)
    args = parser.parse_args()
    log(f"GEOPOLITICA AGENT {'[DRY-RUN]' if args.dry_run else '[PRODUÇÃO]'}")
    semana = semana_alvo()
    log(f"Semana alvo: {semana[0]} ({semana[1]} a {semana[2]})")
    if DATA_JSON.exists() and not args.force:
        try:
            anterior = json.loads(DATA_JSON.read_text(encoding="utf-8"))
            if anterior.get("week", {}).get("iso") == semana[0]:
                gerada = datetime.fromisoformat(anterior["generated_at"])
                if brt_now() - gerada < timedelta(days=STALE_GERACAO_DIAS):
                    log("Edição da semana ainda fresca; use --force para regerar")
                    return 0
        except Exception as e:
            log(f"AVISO: edição anterior ilegível, continuando: {e}")
    grupos, fontes = pesquisar(args.fontes_min)
    if len(grupos) < args.itens_min:
        raise RuntimeError(f"itens deduplicados abaixo do mínimo: {len(grupos)} < {args.itens_min}")
    mercados = niveis_mercado()
    payload = sintetizar(grupos, mercados, semana)
    urls_permitidas = {i["url"] for g in grupos for i in [g] if i.get("url")}
    erros = validar_payload(payload, urls_permitidas)
    if erros:
        raise RuntimeError("payload reprovado: " + " | ".join(erros[:12]))
    log(f"Payload validado: {len(payload['themes'])} temas, {len(payload['sources'])} fontes, {len(fontes)} fontes vivas")
    salvar(payload, args.dry_run)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        log(f"ERRO: {e}")
        raise SystemExit(1)
