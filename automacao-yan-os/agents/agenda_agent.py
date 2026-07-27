#!/usr/bin/env python3
"""
agenda_agent.py — Agent 2: Agenda Agent
Gera agenda-data.json a partir de FONTES OFICIAIS.
Publicacao via deploy-cloudflare.ps1 (Cloudflare Workers).

Fontes:
  - BR dinâmico: API de calendário do IBGE (servicodados.ibge.gov.br/api/v3/calendario)
  - BR dinâmico: BCB Olinda (CalendarioEvento) — REMOVIDO 2026-07-19: endpoint
    nunca existiu no Olinda/IFDATA (HTTP 400 "Cannot find EntitySet ... CalendarioEvento").
    Não há substituto público de calendário de eventos do BCB no portal Olinda.
  - BR determinístico: Boletim Focus (2ª feira), COPOM (datas fixas 2026)
  - US determinístico: calendário anual oficial 2026 — CPI, PPI, Retail Sales,
    Nonfarm Payrolls (BLS/Census) e FOMC (Fed). Datas hardcoded a partir dos
    schedules oficiais; horários convertidos de ET para BRT com regra de DST dos EUA.
  - EU determinístico: ECB decisões de juros (8 reuniões, ecb.europa.eu)
  - UK determinístico: BoE MPC decisões (8 reuniões, bankofengland.co.uk)
  - JP determinístico: BoJ Monetary Policy Meetings (8 reuniões, boj.or.jp)
  - CN determinístico: China GDP trimestral, CPI mensal, PMI industrial (NBS stats.gov.cn)
  - EU determinístico: Eurozone CPI Flash mensal (Eurostat ec.europa.eu/eurostat)

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
import os
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

# Publicação via deploy-cloudflare.ps1 (Cloudflare Workers), sem FTP.
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

# ECB: Governing Council monetary policy meetings 2026. Announcement 14:15 CET (10:15 BRT
# in winter Nov-Feb, 09:15 BRT in summer Mar-Oct). Source: ecb.europa.eu/press/calendars
ECB_2026 = [
    "2026-02-05", "2026-03-19", "2026-04-30", "2026-06-11",
    "2026-07-23", "2026-09-10", "2026-10-29", "2026-12-17",
]

# BoE: MPC announcement dates 2026. 12:00 UK (08:00 BRT summer, 09:00 BRT winter).
# Source: bankofengland.co.uk/monetary-policy/upcoming-mpc-dates
BOE_2026 = [
    "2026-02-05", "2026-03-19", "2026-04-30", "2026-06-18",
    "2026-07-30", "2026-09-17", "2026-11-05", "2026-12-17",
]

# BoJ: Monetary Policy Meetings 2026. Decision on second day, announcement ~11:30 JST
# (= 23:30 BRT previous day). Source: boj.or.jp/en/mopo/mpmsche_minu/
BOJ_2026 = [
    "2026-01-23", "2026-03-19", "2026-04-28", "2026-06-16",
    "2026-07-31", "2026-09-18", "2026-10-30", "2026-12-18",
]

# China GDP: quarterly release, ~10:00 CST (= 23:00 BRT previous day). Mid-month.
# Tentative dates based on historical pattern; source: NBS (stats.gov.cn)
CHINA_GDP_2026 = [
    "2026-01-16",  # Q4 2025
    "2026-04-16",  # Q1 2026
    "2026-07-15",  # Q2 2026
    "2026-10-19",  # Q3 2026
]

# China CPI / PMI: monthly, ~9-12th day. CPI 09:30 CST, PMI 09:00 CST.
# Tentative dates; source: NBS (stats.gov.cn)
CHINA_CPI_2026 = [
    "2026-07-10", "2026-08-10", "2026-09-10", "2026-10-13",
    "2026-11-10", "2026-12-10",
]
CHINA_PMI_2026 = [
    "2026-07-01", "2026-08-03", "2026-09-01", "2026-10-01",
    "2026-11-02", "2026-12-01",
]

# Eurozone CPI Flash: ~last business day of reference month.
# Tentative dates; source: Eurostat (ec.europa.eu/eurostat)
EUROZONE_CPI_2026 = [
    "2026-07-31", "2026-08-31", "2026-09-30", "2026-10-30",
    "2026-11-30",
]

# UK CPI (monthly, ~16-22). Source: ONS (ons.gov.uk)
UK_CPI_2026 = [
    "2026-07-22", "2026-08-19", "2026-09-16", "2026-10-21",
    "2026-11-18", "2026-12-16",
]

# UK Unemployment / Labour Market (monthly, ~14-19). Source: ONS
UK_LABOUR_2026 = [
    "2026-07-21", "2026-08-18", "2026-09-15", "2026-10-20",
    "2026-11-17", "2026-12-15",
]

# UK Retail Sales (monthly, ~20-24). Source: ONS
UK_RETAIL_2026 = [
    "2026-07-24", "2026-08-21", "2026-09-18", "2026-10-23",
    "2026-11-20", "2026-12-18",
]

# Japan CPI (monthly, ~18-25). Source: Statistics Bureau (stat.go.jp)
JP_CPI_2026 = [
    "2026-07-24", "2026-08-21", "2026-09-18", "2026-10-23",
    "2026-11-20", "2026-12-18",
]

# Global Flash PMIs — US, EU, UK, Germany, France (monthly, ~24th).
# S&P Global releases Manufacturing + Services + Composite.
# Source: S&P Global PMI schedule
GLOBAL_PMI_2026 = [
    "2026-07-24", "2026-08-21", "2026-09-23", "2026-10-23",
    "2026-11-23", "2026-12-16",
]

# Germany/Eurozone ZEW Economic Sentiment (monthly, ~18-22, Tuesday).
# Source: ZEW (zew.de)
ZEW_2026 = [
    "2026-07-21", "2026-08-18", "2026-09-15", "2026-10-20",
    "2026-11-17", "2026-12-15",
]

# China Loan Prime Rate (monthly, 20th or next business day).
# Source: PBOC (pbc.gov.cn)
CHINA_LPR_2026 = [
    "2026-07-20", "2026-08-20", "2026-09-21", "2026-10-20",
    "2026-11-20", "2026-12-21",
]

# Canada CPI (monthly, ~18-23). Source: Statistics Canada
CANADA_CPI_2026 = [
    "2026-07-20", "2026-08-19", "2026-09-16", "2026-10-21",
    "2026-11-18", "2026-12-16",
]

# US New Home Sales (monthly, ~23-26). Source: Census Bureau
US_NEW_HOME_2026 = [
    "2026-07-24", "2026-08-25", "2026-09-24", "2026-10-26",
    "2026-11-25", "2026-12-23",
]

# US Existing Home Sales (monthly, ~19-23). Source: NAR
US_EXISTING_HOME_2026 = [
    "2026-07-22", "2026-08-20", "2026-09-22", "2026-10-22",
    "2026-11-19", "2026-12-22",
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


def _eventos_ecb(ini: str, fim: str) -> list[dict]:
    """ECB Governing Council monetary policy decisions. 14:15 CET/CEST."""
    eventos: list[dict] = []
    tpl = {
        "evento": "BCE — Decisão de juros na Zona do Euro",
        "evento_en": "ECB — Eurozone Rate Decision",
        "descricao": (
            "Decisão do European Central Bank sobre as três taxas de juro de referência "
            "(deposit facility, MRO, MLF). A presidente Christine Lagarde concede coletiva "
            "às 14:45 CET. Impacto direto no euro (EUR/USD) e nos juros soberanos da Zona do Euro."
        ),
        "descricao_en": (
            "ECB decision on the three key interest rates (deposit facility, MRO, MLF). "
            "President Lagarde holds press conference at 14:45 CET. Direct impact on EUR/USD "
            "and Eurozone sovereign yields."
        ),
        "fonte": "ECB",
        "relevancia": "alta",
    }
    for data_str in ECB_2026:
        if not na_janela(data_str, ini, fim):
            continue
        # CET/CEST → BRT: summer (Mar-Oct) UTC+2→BRT+5, winter UTC+1→BRT+4
        d = date.fromisoformat(data_str)
        is_summer = d.month in (3, 4, 5, 6, 7, 8, 9, 10)
        offset = 5 if is_summer else 4
        hora = f"{14 + offset:02d}:15"
        eventos.append({
            "data": data_str,
            "hora_brt": hora,
            "regiao": "EU",
            "evento": tpl["evento"],
            "evento_en": tpl["evento_en"],
            "descricao": tpl["descricao"],
            "descricao_en": tpl["descricao_en"],
            "fonte": tpl["fonte"],
            "relevancia": tpl["relevancia"],
        })
    return eventos


def _eventos_boe(ini: str, fim: str) -> list[dict]:
    """Bank of England MPC decisions. 12:00 UK (BST/GMT)."""
    eventos: list[dict] = []
    tpl = {
        "evento": "BoE — Decisão de juros no Reino Unido (MPC)",
        "evento_en": "BoE — UK Rate Decision (MPC)",
        "descricao": (
            "O Monetary Policy Committee do Bank of England divulga a decisão sobre a Bank Rate "
            "e a ata da reunião simultaneamente. Impacto direto na GBP e nos gilts. "
            "Quatro das oito reuniões incluem o Monetary Policy Report com projeções macro."
        ),
        "descricao_en": (
            "The MPC announces the Bank Rate decision and minutes simultaneously. "
            "Four meetings per year include the Monetary Policy Report with macro projections. "
            "Direct impact on GBP and gilt yields."
        ),
        "fonte": "Bank of England",
        "relevancia": "alta",
    }
    for data_str in BOE_2026:
        if not na_janela(data_str, ini, fim):
            continue
        # UK → BRT: summer (BST=UTC+1) → BRT+4; winter (GMT=UTC+0) → BRT+3
        d = date.fromisoformat(data_str)
        is_summer = d.month in (3, 4, 5, 6, 7, 8, 9, 10)
        offset = 4 if is_summer else 3
        hora = f"{12 + offset:02d}:00"
        eventos.append({
            "data": data_str,
            "hora_brt": hora,
            "regiao": "UK",
            "evento": tpl["evento"],
            "evento_en": tpl["evento_en"],
            "descricao": tpl["descricao"],
            "descricao_en": tpl["descricao_en"],
            "fonte": tpl["fonte"],
            "relevancia": tpl["relevancia"],
        })
    return eventos


def _eventos_boj(ini: str, fim: str) -> list[dict]:
    """Bank of Japan Monetary Policy Meetings. Announcement ~11:30 JST."""
    eventos: list[dict] = []
    tpl = {
        "evento": "BoJ — Decisão de juros no Japão",
        "evento_en": "BoJ — Japan Rate Decision",
        "descricao": (
            "O Bank of Japan divulga a decisão sobre a policy rate e publica o Outlook Report "
            "trimestral (jan, abr, jul, out). Impacto no USD/JPY, Nikkei 225 e JGBs. "
            "Divulgação ocorre de madrugada no horário brasileiro (11:30 JST = 23:30 BRT do dia anterior)."
        ),
        "descricao_en": (
            "The BoJ announces its policy rate decision and publishes the quarterly Outlook Report "
            "(Jan, Apr, Jul, Oct). Impact on USD/JPY, Nikkei 225 and JGBs."
        ),
        "fonte": "Bank of Japan",
        "relevancia": "alta",
    }
    for data_str in BOJ_2026:
        if not na_janela(data_str, ini, fim):
            continue
        # JST (UTC+9) → BRT (UTC-3) → JST = BRT + 12. 11:30 JST = 23:30 BRT (dia anterior).
        # Colocamos no dia da reunião com horário "23:30" para indicar que é do dia seguinte JST.
        eventos.append({
            "data": data_str,
            "hora_brt": "23:30",
            "regiao": "JP",
            "evento": tpl["evento"],
            "evento_en": tpl["evento_en"],
            "descricao": tpl["descricao"],
            "descricao_en": tpl["descricao_en"],
            "fonte": tpl["fonte"],
            "relevancia": tpl["relevancia"],
        })
    return eventos


def _eventos_china(ini: str, fim: str) -> list[dict]:
    """China GDP (quarterly), CPI (monthly), PMI (monthly). NBS releases ~09:30-10:00 CST."""
    eventos: list[dict] = []

    # GDP — quarterly
    tpl_gdp = {
        "evento": "China — PIB trimestral",
        "evento_en": "China — Quarterly GDP",
        "descricao": (
            "Produto Interno Bruto da China, segunda maior economia global. Divulgado pelo "
            "National Bureau of Statistics (NBS) com breakdown por setor (indústria, serviços, "
            "agricultura). Driver de commodities (minério de ferro, cobre, petróleo) e EM FX."
        ),
        "descricao_en": (
            "China GDP released by NBS with sector breakdown. Key driver for commodities "
            "(iron ore, copper, crude) and EM FX."
        ),
        "fonte": "NBS China",
        "relevancia": "alta",
    }
    for data_str in CHINA_GDP_2026:
        if not na_janela(data_str, ini, fim):
            continue
        eventos.append({
            "data": data_str, "hora_brt": "23:00", "regiao": "CN",
            "evento": tpl_gdp["evento"], "evento_en": tpl_gdp["evento_en"],
            "descricao": tpl_gdp["descricao"], "descricao_en": tpl_gdp["descricao_en"],
            "fonte": tpl_gdp["fonte"], "relevancia": tpl_gdp["relevancia"],
        })

    # CPI — monthly
    tpl_cpi = {
        "evento": "China — IPC ao consumidor (CPI)",
        "evento_en": "China — Consumer Price Index (CPI)",
        "descricao": (
            "Inflação ao consumidor na China. Leituras baixas sinalizam risco deflacionário "
            "e fraqueza de demanda doméstica, com impacto em commodities e moedas de países "
            "exportadores de matérias-primas (BRL, AUD, NZD, CLP)."
        ),
        "descricao_en": (
            "China consumer inflation. Low readings signal deflation risk and weak domestic "
            "demand, impacting commodities and commodity-exporting currencies (BRL, AUD, NZD, CLP)."
        ),
        "fonte": "NBS China",
        "relevancia": "media",
    }
    for data_str in CHINA_CPI_2026:
        if not na_janela(data_str, ini, fim):
            continue
        eventos.append({
            "data": data_str, "hora_brt": "22:30", "regiao": "CN",
            "evento": tpl_cpi["evento"], "evento_en": tpl_cpi["evento_en"],
            "descricao": tpl_cpi["descricao"], "descricao_en": tpl_cpi["descricao_en"],
            "fonte": tpl_cpi["fonte"], "relevancia": tpl_cpi["relevancia"],
        })

    # PMI — monthly (Manufacturing + Services composite)
    tpl_pmi = {
        "evento": "China — PMI Industrial (NBS)",
        "evento_en": "China — Manufacturing PMI (NBS)",
        "descricao": (
            "Índice de Gerentes de Compras da indústria chinesa, compilado pelo NBS. "
            "Abaixo de 50 indica contração. Indicador antecedente de atividade industrial e "
            "demanda por commodities. Também relevante o Caixin PMI (setor privado, ~2 dias depois)."
        ),
        "descricao_en": (
            "China manufacturing PMI by NBS. Below 50 signals contraction. Leading indicator "
            "for industrial activity and commodity demand."
        ),
        "fonte": "NBS China",
        "relevancia": "media",
    }
    for data_str in CHINA_PMI_2026:
        if not na_janela(data_str, ini, fim):
            continue
        eventos.append({
            "data": data_str, "hora_brt": "22:00", "regiao": "CN",
            "evento": tpl_pmi["evento"], "evento_en": tpl_pmi["evento_en"],
            "descricao": tpl_pmi["descricao"], "descricao_en": tpl_pmi["descricao_en"],
            "fonte": tpl_pmi["fonte"], "relevancia": tpl_pmi["relevancia"],
        })

    return eventos


def _eventos_eurozone(ini: str, fim: str) -> list[dict]:
    """Eurozone CPI Flash (~last business day of month) + GDP Flash."""
    eventos: list[dict] = []
    tpl = {
        "evento": "Zona do Euro — IPC Flash",
        "evento_en": "Eurozone — CPI Flash Estimate",
        "descricao": (
            "Estimativa preliminar da inflação ao consumidor na Zona do Euro (índice cheio "
            "e núcleo). Divulgado pelo Eurostat. Principal dado de inflação para o BCE "
            "antes da decisão de juros seguinte."
        ),
        "descricao_en": (
            "Preliminary Eurozone CPI estimate (headline and core) by Eurostat. Key inflation "
            "data point ahead of ECB rate decisions."
        ),
        "fonte": "Eurostat",
        "relevancia": "alta",
    }
    for data_str in EUROZONE_CPI_2026:
        if not na_janela(data_str, ini, fim):
            continue
        eventos.append({
            "data": data_str, "hora_brt": "06:00", "regiao": "EU",
            "evento": tpl["evento"], "evento_en": tpl["evento_en"],
            "descricao": tpl["descricao"], "descricao_en": tpl["descricao_en"],
            "fonte": tpl["fonte"], "relevancia": tpl["relevancia"],
        })
    return eventos


def _eventos_semanais(ini: str, fim: str) -> list[dict]:
    """Eventos recorrentes toda semana: Jobless Claims (qui), EIA Oil (qua)."""
    eventos: list[dict] = []
    d0 = date.fromisoformat(ini)
    d1 = date.fromisoformat(fim)
    cursor = d0
    while cursor <= d1:
        iso = cursor.isoformat()
        if cursor.weekday() == 2:  # Wednesday
            eventos.append({
                "data": iso, "hora_brt": "11:30", "regiao": "US",
                "evento": "EUA — Estoques de petróleo bruto (EIA)",
                "evento_en": "US — EIA Crude Oil Inventories",
                "descricao": (
                    "Relatório semanal da Energy Information Administration com a variação "
                    "dos estoques de petróleo bruto, gasolina e destilados nos EUA. Impacto "
                    "direto nos preços do WTI/Brent e nas ações de energia."
                ),
                "descricao_en": "Weekly EIA crude oil inventory report. Direct impact on WTI/Brent and energy equities.",
                "fonte": "EIA", "relevancia": "media",
            })
        elif cursor.weekday() == 3:  # Thursday
            eventos.append({
                "data": iso, "hora_brt": "09:30", "regiao": "US",
                "evento": "EUA — Novos pedidos de seguro-desemprego",
                "evento_en": "US — Initial Jobless Claims",
                "descricao": (
                    "Número semanal de novos pedidos de auxílio-desemprego nos EUA. "
                    "Indicador antecedente da saúde do mercado de trabalho americano, "
                    "com impacto em Treasuries, DXY e expectativas para o FOMC."
                ),
                "descricao_en": "Weekly initial jobless claims. Leading indicator of US labor market health. Impacts Treasuries, DXY and FOMC expectations.",
                "fonte": "Department of Labor", "relevancia": "media",
            })
        cursor += timedelta(days=1)
    return eventos


def _eventos_uk_cpi(ini: str, fim: str) -> list[dict]:
    eventos: list[dict] = []
    for data_str in UK_CPI_2026:
        if not na_janela(data_str, ini, fim):
            continue
        eventos.append({
            "data": data_str, "hora_brt": "03:00", "regiao": "UK",
            "evento": "Reino Unido — IPC ao consumidor (CPI)",
            "evento_en": "UK — Consumer Price Index (CPI)",
            "descricao": (
                "Inflação ao consumidor no Reino Unido, cheia e núcleo. Principal "
                "referência de inflação para o Bank of England. Impacto em GBP, gilts e FTSE 100."
            ),
            "descricao_en": "UK headline and core CPI. Key inflation benchmark for Bank of England. Impacts GBP, gilts and FTSE 100.",
            "fonte": "ONS", "relevancia": "alta",
        })
    return eventos


def _eventos_uk_labour(ini: str, fim: str) -> list[dict]:
    eventos: list[dict] = []
    for data_str in UK_LABOUR_2026:
        if not na_janela(data_str, ini, fim):
            continue
        eventos.append({
            "data": data_str, "hora_brt": "03:00", "regiao": "UK",
            "evento": "Reino Unido — Taxa de desemprego (ILO)",
            "evento_en": "UK — ILO Unemployment Rate",
            "descricao": (
                "Taxa de desemprego e variação de rendimentos médios no Reino Unido. "
                "Indicador-chave para o MPC do BoE calibrar o mercado de trabalho."
            ),
            "descricao_en": "UK unemployment rate and average earnings. Key labour market gauge for MPC decisions.",
            "fonte": "ONS", "relevancia": "media",
        })
    return eventos


def _eventos_uk_retail(ini: str, fim: str) -> list[dict]:
    eventos: list[dict] = []
    for data_str in UK_RETAIL_2026:
        if not na_janela(data_str, ini, fim):
            continue
        eventos.append({
            "data": data_str, "hora_brt": "03:00", "regiao": "UK",
            "evento": "Reino Unido — Vendas no varejo",
            "evento_en": "UK — Retail Sales",
            "descricao": (
                "Vendas no varejo do Reino Unido (variação mensal e anual). "
                "Termômetro do consumo das famílias e da atividade econômica britânica."
            ),
            "descricao_en": "UK monthly and annual retail sales. Household consumption gauge for the British economy.",
            "fonte": "ONS", "relevancia": "media",
        })
    return eventos


def _eventos_jp_cpi(ini: str, fim: str) -> list[dict]:
    eventos: list[dict] = []
    for data_str in JP_CPI_2026:
        if not na_janela(data_str, ini, fim):
            continue
        eventos.append({
            "data": data_str, "hora_brt": "20:30", "regiao": "JP",
            "evento": "Japão — IPC nacional (CPI)",
            "evento_en": "Japan — National Consumer Price Index",
            "descricao": (
                "Inflação ao consumidor no Japão (cheia e núcleo, excluindo alimentos "
                "frescos). Dado essencial para a trajetória da taxa do BoJ. Impacto em "
                "USD/JPY, Nikkei 225 e JGBs."
            ),
            "descricao_en": "Japan headline and core CPI. Key data point for BoJ rate trajectory. Impacts USD/JPY, Nikkei 225 and JGBs.",
            "fonte": "Statistics Bureau of Japan", "relevancia": "alta",
        })
    return eventos


def _eventos_global_pmi(ini: str, fim: str) -> list[dict]:
    """Flash PMIs: US, Eurozone, UK, Germany, France (S&P Global, ~24th)."""
    eventos: list[dict] = []
    regioes = [
        ("US", "EUA", "S&P Global US"),
        ("EU", "Zona do Euro", "S&P Global Eurozone"),
        ("UK", "Reino Unido", "S&P Global UK"),
        ("DE", "Alemanha", "S&P Global Germany"),
    ]
    for data_str in GLOBAL_PMI_2026:
        if not na_janela(data_str, ini, fim):
            continue
        for reg, nome, fonte in regioes:
            eventos.append({
                "data": data_str, "hora_brt": "10:45" if reg == "US" else "05:00", "regiao": reg,
                "evento": f"{nome} — PMI Industrial e Serviços (Flash)",
                "evento_en": f"{nome} — Manufacturing & Services PMI (Flash)",
                "descricao": (
                    f"Índice de Gerentes de Compras ({nome}) — leitura preliminar (flash) "
                    f"da indústria e serviços. Abaixo de 50 indica contração. Impacto direto "
                    f"em expectativas de PIB, juros e moedas."
                ),
                "descricao_en": f"{nome} flash PMI for manufacturing and services. Below 50 signals contraction.",
                "fonte": fonte, "relevancia": "alta",
            })
    return eventos


def _eventos_zew(ini: str, fim: str) -> list[dict]:
    eventos: list[dict] = []
    for data_str in ZEW_2026:
        if not na_janela(data_str, ini, fim):
            continue
        eventos.append({
            "data": data_str, "hora_brt": "06:00", "regiao": "EU",
            "evento": "Alemanha/Zona do Euro — ZEW de Sentimento Econômico",
            "evento_en": "Germany/Eurozone — ZEW Economic Sentiment",
            "descricao": (
                "Índice ZEW de sentimento econômico na Alemanha e Zona do Euro, baseado "
                "em survey com analistas e investidores institucionais. Indicador antecedente "
                "de atividade e confiança na maior economia europeia."
            ),
            "descricao_en": "ZEW survey of economic sentiment among analysts and institutional investors. Leading indicator for German/Eurozone activity.",
            "fonte": "ZEW", "relevancia": "alta",
        })
    return eventos


def _eventos_china_lpr(ini: str, fim: str) -> list[dict]:
    eventos: list[dict] = []
    for data_str in CHINA_LPR_2026:
        if not na_janela(data_str, ini, fim):
            continue
        eventos.append({
            "data": data_str, "hora_brt": "22:15", "regiao": "CN",
            "evento": "China — Taxa de Juros de Referência (LPR)",
            "evento_en": "China — Loan Prime Rate (LPR)",
            "descricao": (
                "O PBOC anuncia a taxa LPR de 1 e 5 anos, referência para o crédito "
                "bancário na China. Impacto no mercado imobiliário chinês, commodities, "
                "minério de ferro e moedas de países exportadores (AUD, BRL, CLP)."
            ),
            "descricao_en": "PBOC announces 1Y and 5Y Loan Prime Rate. Impacts Chinese property, commodities, iron ore and exporter currencies (AUD, BRL, CLP).",
            "fonte": "PBOC", "relevancia": "alta",
        })
    return eventos


def _eventos_canada_cpi(ini: str, fim: str) -> list[dict]:
    eventos: list[dict] = []
    for data_str in CANADA_CPI_2026:
        if not na_janela(data_str, ini, fim):
            continue
        eventos.append({
            "data": data_str, "hora_brt": "09:30", "regiao": "CA",
            "evento": "Canadá — IPC ao consumidor (CPI)",
            "evento_en": "Canada — Consumer Price Index (CPI)",
            "descricao": (
                "Inflação ao consumidor no Canadá, referência para o Bank of Canada. "
                "Impacto em CAD, bonds canadenses e expectativas de política monetária."
            ),
            "descricao_en": "Canada headline CPI. Key benchmark for Bank of Canada. Impacts CAD and rate expectations.",
            "fonte": "Statistics Canada", "relevancia": "media",
        })
    return eventos


def _eventos_us_housing(ini: str, fim: str) -> list[dict]:
    """US New Home Sales + Existing Home Sales (monthly)."""
    eventos: list[dict] = []
    for data_str in US_NEW_HOME_2026:
        if not na_janela(data_str, ini, fim):
            continue
        eventos.append({
            "data": data_str, "hora_brt": "11:00", "regiao": "US",
            "evento": "EUA — Vendas de imóveis novos",
            "evento_en": "US — New Home Sales",
            "descricao": (
                "Vendas de imóveis residenciais novos nos EUA (annualized rate). "
                "Indicador do mercado imobiliário e da saúde do consumo americano."
            ),
            "descricao_en": "US new single-family home sales. Housing market and consumer health indicator.",
            "fonte": "Census Bureau", "relevancia": "media",
        })
    for data_str in US_EXISTING_HOME_2026:
        if not na_janela(data_str, ini, fim):
            continue
        eventos.append({
            "data": data_str, "hora_brt": "11:00", "regiao": "US",
            "evento": "EUA — Vendas de imóveis usados",
            "evento_en": "US — Existing Home Sales",
            "descricao": (
                "Vendas de imóveis residenciais existentes nos EUA. Cobre ~90% "
                "do mercado imobiliário americano. Indicador de atividade e preços."
            ),
            "descricao_en": "US existing home sales. Covers ~90% of US housing market. Activity and price indicator.",
            "fonte": "NAR", "relevancia": "media",
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
    eventos += _eventos_semanais(ini, fim)
    eventos += _eventos_ecb(ini, fim)
    eventos += _eventos_boe(ini, fim)
    eventos += _eventos_boj(ini, fim)
    eventos += _eventos_china(ini, fim)
    eventos += _eventos_eurozone(ini, fim)
    eventos += _eventos_uk_cpi(ini, fim)
    eventos += _eventos_uk_labour(ini, fim)
    eventos += _eventos_uk_retail(ini, fim)
    eventos += _eventos_jp_cpi(ini, fim)
    eventos += _eventos_global_pmi(ini, fim)
    eventos += _eventos_zew(ini, fim)
    eventos += _eventos_china_lpr(ini, fim)
    eventos += _eventos_canada_cpi(ini, fim)
    eventos += _eventos_us_housing(ini, fim)

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
                "ECB — Governing Council calendar (ecb.europa.eu)",
                "Bank of England — MPC calendar (bankofengland.co.uk)",
                "Bank of Japan — MPM schedule (boj.or.jp)",
                "NBS China — GDP, CPI, PMI (stats.gov.cn)",
                "Eurostat — CPI Flash calendar (ec.europa.eu/eurostat)",
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
    # Escrita atomica (tmp + os.replace). A escrita direta deixava o arquivo
    # truncado se o processo morresse no meio — Ctrl+C, timeout do Task Scheduler,
    # queda de energia. E isso anulava a protecao deste proprio modulo:
    # _agenda_vigente() devolve None ao ler JSON corrompido, e entao
    # anti_regressao() aceita a nova agenda sem comparar com nada, que e
    # exatamente a regressao do incidente de 2026-07-13.
    tmp = _AGENDA_PATH.with_suffix(_AGENDA_PATH.suffix + ".tmp")
    try:
        _AGENDA_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, _AGENDA_PATH)
        log(f"Salvo: {_AGENDA_PATH}")
        return True
    except Exception as e:
        log(f"ERRO ao salvar: {e}")
        try:
            tmp.unlink(missing_ok=True)
        except OSError:
            pass
        return False


# Publicação: deploy-cloudflare.ps1 cuida do upload. O agenda_agent apenas
# gera e salva localmente. A task Szuchmacher-AgendaAgent (run-agenda-agent.ps1)
# chama deploy-cloudflare.ps1 apos este script.

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
        log("DRY-RUN: deploy pulado (agenda-data.json salvo localmente).")

    log("AGENDA AGENT CONCLUÍDO (deploy via run-agenda-agent.ps1 → deploy-cloudflare.ps1)")


if __name__ == "__main__":
    main()
