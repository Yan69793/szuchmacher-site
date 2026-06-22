#!/usr/bin/env python3
"""
agenda_agent.py — Agent 2: Agenda Agent
Gera agenda-data.json (espelho de scripts/agenda-cron.php) e publica via FTP.

Uso:
  python agents/agenda_agent.py
  python agents/agenda_agent.py --dry-run
"""

import argparse
import json
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

from config import SITE_FTP_HOST, SITE_PASS, SITE_REMOTE_DIR  # noqa: E402
from atualizador_site import FTPClient  # noqa: E402

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


def prox_util_anterior(d: date) -> date:
    while d.isoweekday() >= 6:
        d -= timedelta(days=1)
    return d


def primeira_sexta(ano: int, mes: int) -> date:
    d = date(ano, mes, 1)
    while d.isoweekday() != 5:
        d += timedelta(days=1)
    return d


def na_janela(data_str: str, ini: str, fim: str) -> bool:
    return ini <= data_str <= fim


def janela_seg_sex(hoje: date | None = None) -> tuple[date, date]:
    hoje = hoje or date.today()
    wd = hoje.isoweekday()
    if wd <= 5:
        prox_seg = hoje - timedelta(days=wd - 1)
    else:
        prox_seg = hoje + timedelta(days=8 - wd)
    prox_sex = prox_seg + timedelta(days=4)
    return prox_seg, prox_sex


def meses_na_janela(prox_seg: date, prox_sex: date) -> list[tuple[int, int]]:
    meses = []
    ptr = prox_seg
    while ptr <= prox_sex:
        chave = (ptr.year, ptr.month)
        if chave not in meses:
            meses.append(chave)
        ptr += timedelta(days=1)
    return meses


def gerar_agenda() -> dict:
    prox_seg, prox_sex = janela_seg_sex()
    janela_inicio = prox_seg.isoformat()
    janela_fim = prox_sex.isoformat()
    eventos: list[dict] = []

    eventos.append({
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
    })

    for ano, mes in meses_na_janela(prox_seg, prox_sex):
        div = prox_util_anterior(date(ano, mes, 22))
        data_str = div.isoformat()
        if na_janela(data_str, janela_inicio, janela_fim):
            eventos.append({
                "data": data_str,
                "hora_brt": "09:00",
                "regiao": "BR",
                "evento": f"IPCA-15 ({mes:02d}/{ano})",
                "evento_en": f"IPCA-15 ({mes:02d}/{ano})",
                "descricao": (
                    "Prévia da inflação oficial — antecede o IPCA cheio em ~15 dias. "
                    "Influencia a função de reação do BCB e a precificação das NTN-B."
                ),
                "descricao_en": (
                    "Consumer price preview, released ~15 days before the full CPI. "
                    "Key input for BCB reaction function and inflation-linked bond pricing."
                ),
                "fonte": "IBGE",
                "relevancia": "alta",
            })

        nfp = primeira_sexta(ano, mes)
        data_str = nfp.isoformat()
        if na_janela(data_str, janela_inicio, janela_fim):
            eventos.append({
                "data": data_str,
                "hora_brt": "09:30",
                "regiao": "US",
                "evento": f"NFP — Non-Farm Payrolls ({mes:02d}/{ano})",
                "evento_en": f"Non-Farm Payrolls ({mes:02d}/{ano})",
                "descricao": (
                    "Principal termômetro do mercado de trabalho americano. Surpresas no NFP "
                    "movem o dólar, os Treasuries e, por extensão, o real e a curva de juros brasileira."
                ),
                "descricao_en": (
                    "Primary US labor market gauge. NFP surprises move the USD, Treasuries, "
                    "and consequently BRL and Brazilian rate curve."
                ),
                "fonte": "BLS",
                "relevancia": "alta",
            })

    for data_str in COPOM_2026:
        if na_janela(data_str, janela_inicio, janela_fim):
            d = date.fromisoformat(data_str)
            eventos.append({
                "data": data_str,
                "hora_brt": "18:30",
                "regiao": "BR",
                "evento": f"COPOM — Decisão de juros ({d.month:02d}/{d.year})",
                "evento_en": f"COPOM — Rate Decision ({d.month:02d}/{d.year})",
                "descricao": (
                    "O BCB divulga a decisão sobre a Selic ao final do segundo dia de reunião. "
                    "O comunicado e a ata subsequente moldam a curva de juros doméstica e o câmbio."
                ),
                "descricao_en": (
                    "BCB releases the Selic decision at the end of day two. "
                    "The statement and subsequent minutes shape the domestic rate curve and BRL."
                ),
                "fonte": "BCB",
                "relevancia": "alta",
            })

    for fomc in FOMC_2026:
        data_str = fomc["data"]
        if na_janela(data_str, janela_inicio, janela_fim):
            d = date.fromisoformat(data_str)
            sufixo = " + Dot Plot" if fomc["dot_plot"] else ""
            extra = (
                " Inclui o Summary of Economic Projections (Dot Plot) com projeção de trajetória de juros dos diretores."
                if fomc["dot_plot"] else ""
            )
            extra_en = (
                " Includes Summary of Economic Projections (Dot Plot) with directors' rate path forecast."
                if fomc["dot_plot"] else ""
            )
            eventos.append({
                "data": data_str,
                "hora_brt": "15:00",
                "regiao": "US",
                "evento": f"FOMC — Decisão de juros{sufixo} ({d.month:02d}/{d.year})",
                "evento_en": f"FOMC — Rate Decision{sufixo} ({d.month:02d}/{d.year})",
                "descricao": (
                    "Decisão do Federal Reserve sobre os Fed Funds." + extra +
                    " Impacto direto no diferencial Brasil–EUA e no real."
                ),
                "descricao_en": (
                    "Federal Reserve decision on Fed Funds rates." + extra_en +
                    " Direct impact on Brazil-US rate differential and BRL."
                ),
                "fonte": "Fed",
                "relevancia": "alta",
            })

    try:
        url = (
            "https://olinda.bcb.gov.br/olinda/servico/IFDATA/versao/v1/odata/"
            f"CalendarioEvento?$filter=Data%20ge%20%27{janela_inicio}%27%20and%20Data%20le%20%27{janela_fim}%27"
            "&$select=Data,Descricao,Hora&$format=json&$top=20"
        )
        with urllib.request.urlopen(url, timeout=8) as resp:
            bcb = json.loads(resp.read().decode("utf-8"))
        for ev in bcb.get("value", []):
            data_str = str(ev.get("Data", ""))[:10]
            desc = str(ev.get("Descricao", "")).strip()
            if not na_janela(data_str, janela_inicio, janela_fim) or len(desc) < 4:
                continue
            if any(e["data"] == data_str and e.get("fonte") == "BCB" for e in eventos):
                continue
            hora = str(ev.get("Hora", "09:00"))[:5] or "09:00"
            eventos.append({
                "data": data_str,
                "hora_brt": hora,
                "regiao": "BR",
                "evento": desc,
                "evento_en": desc,
                "descricao": "Evento do calendário oficial do Banco Central do Brasil.",
                "descricao_en": "Event from the official Banco Central do Brasil calendar.",
                "fonte": "BCB",
                "relevancia": "media",
            })
    except Exception as e:
        log(f"BCB Olinda opcional falhou: {e}")

    eventos.sort(key=lambda e: (e["data"], e["hora_brt"]))

    return {
        "meta": {
            "version": date.today().isoformat(),
            "curator": "Szuchmacher Consultoria",
            "fontes_primarias": [
                "BCB — Calendário de divulgações (bcb.gov.br/calendariodivulgacao)",
                "BLS — US economic release schedule (bls.gov/schedule)",
                "Fed — FOMC calendar (federalreserve.gov)",
                "IBGE — Calendário de divulgações (ibge.gov.br)",
            ],
            "disciplina": "Eventos programados em fontes oficiais. Sem antecipação de resultado.",
            "disciplina_en": "Scheduled releases from official sources. No result anticipation.",
            "idiomas": ["pt-BR", "en"],
        },
        "gerado": datetime.now().astimezone().isoformat(timespec="seconds"),
        "janela": {"inicio": janela_inicio, "fim": janela_fim},
        "eventos": eventos,
    }


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

    payload = gerar_agenda()
    qtd = len(payload["eventos"])
    j = payload["janela"]
    log(f"Janela {j['inicio']} → {j['fim']} · {qtd} evento(s)")

    if not salvar_local(payload):
        sys.exit(1)

    if args.dry_run:
        log("DRY-RUN: FTP pulado.")
    elif not upload_ftp(payload):
        sys.exit(1)

    log("AGENDA AGENT CONCLUÍDO")


if __name__ == "__main__":
    main()