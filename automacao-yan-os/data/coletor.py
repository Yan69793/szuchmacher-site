"""
coletor.py — YAN OS
Coleta dados de fechamento de mercado via Yahoo Finance + B3.

Ativos automáticos (Yahoo Finance):
  Ibovespa, Dólar, S&P 500, Nasdaq, Dow Jones, DAX, CAC, FTSE,
  Nikkei, Hang Seng, Shanghai, Treasury 10Y, WTI, Ouro, Minério

Ativos semi-manuais (fallback via entrada do analista):
  DI Jan/28 (B3 API instável), Bund 10Y, JGB 10Y
"""

import json
import sys
import time
import requests
from datetime import datetime, date
from pathlib import Path
from typing import Optional

try:
    import yfinance as yf
except ImportError:
    print("[ERRO] yfinance não instalado. Execute: pip install yfinance")
    sys.exit(1)

# Corrige UnicodeEncodeError (charmap) ao imprimir ✓/✗ em consoles cp1252 (Windows)
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


# ─── Mapa de tickers Yahoo Finance ─────────────────────────────────────────

TICKERS = {
    # Brasil
    "brasil.ibovespa": ("^BVSP",    "pontos", 0),
    "brasil.dolar":    ("BRL=X",    "valor",  4),

    # EUA
    "eua.sp500":  ("^GSPC", "pontos", 0),
    "eua.nasdaq": ("^IXIC", "pontos", 0),
    "eua.dow":    ("^DJI",  "pontos", 0),

    # Europa
    "europa.dax":  ("^GDAXI", "pontos", 0),
    "europa.cac":  ("^FCHI",  "pontos", 0),
    "europa.ftse": ("^FTSE",  "pontos", 0),

    # Ásia
    "asia.nikkei":    ("^N225",  "pontos", 0),
    "asia.hang_seng": ("^HSI",   "pontos", 0),
    "asia.shanghai":  ("000001.SS", "pontos", 2),

    # Yields
    "yields.treasury_10y": ("^TNX", "taxa", 3),
    "yields.bund_10y":     (None,   "taxa", 3),  # entrada manual
    "yields.jgb_10y":      (None,   "taxa", 3),  # entrada manual

    # Commodities
    "commodities.wti":    ("CL=F",  "preco", 2),
    "commodities.ouro":   ("GC=F",  "preco", 2),
    "commodities.minerio":("TIO=F", "preco", 2),
}


# ─── Coleta automática ──────────────────────────────────────────────────────

def _coletar_ticker(ticker_sym: str, decimais: int) -> Optional[dict]:
    """Coleta preço e variação de um ticker via yfinance."""
    try:
        t = yf.Ticker(ticker_sym)
        hist = t.history(period="2d", interval="1d")
        if hist.empty or len(hist) < 2:
            # Tenta com 5 dias para garantir pelo menos 2 dias úteis
            hist = t.history(period="5d", interval="1d")
        if hist.empty:
            return None

        fechamento_hoje    = hist["Close"].iloc[-1]
        fechamento_ontem   = hist["Close"].iloc[-2] if len(hist) > 1 else fechamento_hoje
        variacao_pct       = ((fechamento_hoje - fechamento_ontem) / fechamento_ontem) * 100
        sinal              = "+" if variacao_pct >= 0 else ""

        fmt = f"{{:.{decimais}f}}"
        return {
            "valor_raw":  fechamento_hoje,
            "pontos":     fmt.format(round(fechamento_hoje, decimais)),
            "valor":      fmt.format(round(fechamento_hoje, decimais)),
            "taxa":       fmt.format(round(fechamento_hoje, decimais)),
            "preco":      fmt.format(round(fechamento_hoje, decimais)),
            "variacao":   f"{sinal}{variacao_pct:.2f}%",
            "fonte":      "Yahoo Finance",
        }
    except Exception as e:
        return None


def _coletar_di_b3() -> Optional[dict]:
    """Tenta coletar DI Jan/28 via API pública da B3."""
    urls = [
        "https://cotacao.b3.com.br/mds/api/v1/FutureContractTrade/DI1F28",
        "https://www2.bmf.com.br/pages/portal/bmfbovespa/boletim1/TxRef1.asp",
    ]
    for url in urls:
        try:
            r = requests.get(url, timeout=8,
                            headers={"User-Agent": "Mozilla/5.0"})
            if r.status_code == 200:
                data = r.json()
                # Extrai taxa do formato B3
                taxa = None
                if isinstance(data, dict):
                    taxa = (data.get("trade", {}).get("lastPrice") or
                            data.get("lastPrice") or
                            data.get("taxa"))
                if taxa:
                    return {
                        "taxa":     f"{float(taxa):.2f}",
                        "variacao": "—",
                        "fonte":    "B3",
                    }
        except Exception:
            continue
    return None


def _coletar_todos_automatico() -> dict:
    """Coleta todos os ativos disponíveis via Yahoo Finance."""
    print("  Coletando via Yahoo Finance...")
    dados = {}
    erros = []

    for chave, (ticker_sym, campo, decimais) in TICKERS.items():
        if ticker_sym is None:
            continue  # manual

        secao, ativo = chave.split(".", 1)
        if secao not in dados:
            dados[secao] = {}

        print(f"    {ativo}...", end=" ", flush=True)
        resultado = _coletar_ticker(ticker_sym, decimais)

        if resultado:
            dados[secao][ativo] = resultado
            print(f"✓ {resultado[campo]}")
        else:
            dados[secao][ativo] = {}
            erros.append(f"{ativo} ({ticker_sym})")
            print("✗")

        time.sleep(0.3)  # rate limit gentil

    # DI Jan/28 via B3
    print("    di_jan28 (B3)...", end=" ", flush=True)
    di = _coletar_di_b3()
    if di:
        dados.setdefault("brasil", {})["di_jan28"] = di
        print(f"✓ {di['taxa']}%")
    else:
        dados.setdefault("brasil", {})["di_jan28"] = {}
        erros.append("di_jan28 (B3 indisponível)")
        print("✗ (solicitará manual)")

    if erros:
        print(f"\n  Itens não coletados automaticamente: {', '.join(erros)}")

    return dados


# ─── Complementação manual ──────────────────────────────────────────────────

def _formatar_input_var(valor_str: str, campo: str) -> dict:
    """
    Converte entrada do usuário em dict padronizado.
    Formatos aceitos: '14.50' ou '14.50 / +2bps' ou '14.50, +2'
    """
    partes = [p.strip() for p in valor_str.replace(",", " ").replace("/", " ").split()]
    resultado = {}
    if partes:
        resultado[campo] = partes[0]
        if len(partes) > 1:
            var = partes[1]
            if not var.startswith(("+", "-")):
                var = "+" + var
            resultado["variacao"] = var
        else:
            resultado["variacao"] = "—"
    return resultado


def _pedir_manual(nome: str, exemplo: str, campo: str) -> dict:
    """Solicita entrada manual de um dado com fallback para omitir."""
    print(f"\n  {nome}")
    print(f"  Exemplo: {exemplo}")
    print(f"  (ENTER para omitir)")
    entrada = input(f"  > ").strip()
    if not entrada:
        return {}
    return _formatar_input_var(entrada, campo)


def _complementar_manual(dados: dict) -> dict:
    """Pede ao analista os dados que não foram coletados automaticamente."""
    print("\n  Completando dados que precisam de entrada manual:")
    print("  (TradingView é a fonte mais confiável para estes valores)\n")

    # DI Jan/28
    if not dados.get("brasil", {}).get("di_jan28", {}).get("taxa"):
        di = _pedir_manual(
            "DI Jan/28 — taxa (% a.a.) e variação (bps)",
            "14.50 / +2bps  ou  14.50",
            "taxa"
        )
        if di:
            dados.setdefault("brasil", {})["di_jan28"] = di

    # Bund 10Y
    if not dados.get("yields", {}).get("bund_10y", {}).get("taxa"):
        bund = _pedir_manual(
            "Bund 10Y — taxa (%) e variação (bps)",
            "2.78 / -3bps  ou  2.78",
            "taxa"
        )
        if bund:
            dados.setdefault("yields", {})["bund_10y"] = bund

    # JGB 10Y
    if not dados.get("yields", {}).get("jgb_10y", {}).get("taxa"):
        jgb = _pedir_manual(
            "JGB 10Y (Japão) — taxa (%) e variação (bps)",
            "1.52 / +1bps  ou  1.52",
            "taxa"
        )
        if jgb:
            dados.setdefault("yields", {})["jgb_10y"] = jgb

    # Verifica se Ibovespa e Dólar foram coletados (os mais críticos)
    ibov_ok  = bool(dados.get("brasil", {}).get("ibovespa", {}).get("pontos"))
    dolar_ok = bool(dados.get("brasil", {}).get("dolar", {}).get("valor"))

    if not ibov_ok:
        ibov = _pedir_manual("Ibovespa — pontos e variação", "128.543 / +1,35%", "pontos")
        if ibov:
            dados["brasil"]["ibovespa"] = ibov

    if not dolar_ok:
        dolar = _pedir_manual("Dólar à vista — R$ e variação", "5,42 / -0,48%", "valor")
        if dolar:
            dados["brasil"]["dolar"] = dolar

    return dados


def _coletar_modo_manual() -> dict:
    """Coleta todos os dados via entrada manual."""
    print("\n  Modo manual: digite os valores de fechamento do dia.")
    print("  Formato: valor / variação%  (ex: 128.543 / +1,35%)")
    print("  Para yields: taxa / variação em bps  (ex: 4,85 / +3bps)\n")

    campos = [
        # (secao, ativo, nome_display, campo_principal, exemplo)
        ("brasil",      "ibovespa",     "Ibovespa (pontos)",    "pontos", "128.543 / +1,35%"),
        ("brasil",      "dolar",        "Dólar (R$)",           "valor",  "5,42 / -0,48%"),
        ("brasil",      "di_jan28",     "DI Jan/28 (% a.a.)",   "taxa",   "14,50 / +2bps"),
        ("eua",         "sp500",        "S&P 500",              "pontos", "5.234 / +0,85%"),
        ("eua",         "nasdaq",       "Nasdaq",               "pontos", "16.823 / +1,12%"),
        ("eua",         "dow",          "Dow Jones",            "pontos", "39.142 / +0,45%"),
        ("europa",      "dax",          "DAX",                  "pontos", "18.234 / +0,32%"),
        ("europa",      "cac",          "CAC 40",               "pontos", "7.823 / -0,15%"),
        ("europa",      "ftse",         "FTSE 100",             "pontos", "8.134 / +0,18%"),
        ("asia",        "nikkei",       "Nikkei 225",           "pontos", "38.920 / -0,78%"),
        ("asia",        "hang_seng",    "Hang Seng",            "pontos", "17.234 / -1,23%"),
        ("asia",        "shanghai",     "Shanghai Composite",   "pontos", "3.012 / +0,45%"),
        ("yields",      "treasury_10y", "Treasury 10Y (%)",     "taxa",   "4,85 / +3bps"),
        ("yields",      "bund_10y",     "Bund 10Y (%)",         "taxa",   "2,78 / -2bps"),
        ("yields",      "jgb_10y",      "JGB 10Y (%)",          "taxa",   "1,52 / +1bps"),
        ("commodities", "wti",          "WTI (US$)",            "preco",  "88,45 / -1,23%"),
        ("commodities", "ouro",         "Ouro spot (US$)",      "preco",  "2.314 / +0,45%"),
        ("commodities", "minerio",      "Minério de Ferro (US$)","preco", "105,40 / -0,82%"),
    ]

    dados = {}
    for secao, ativo, nome, campo, exemplo in campos:
        dados.setdefault(secao, {})
        resultado = _pedir_manual(nome, exemplo, campo)
        if resultado:
            dados[secao][ativo] = resultado
        else:
            dados[secao][ativo] = {}

    return dados


# ─── Ponto de entrada público ───────────────────────────────────────────────

def coletar(modo_manual: bool = False) -> dict:
    """
    Coleta dados de fechamento de mercado.

    Args:
        modo_manual: se True, todos os dados via teclado (sem APIs)

    Returns:
        Dicionário estruturado com todos os dados de mercado.
    """
    hoje = date.today().isoformat()
    print(f"\n[coletor] Data: {hoje}")

    if modo_manual:
        print("[coletor] Modo manual — todos os dados via teclado")
        dados = _coletar_modo_manual()
    else:
        print("[coletor] Coletando dados automaticamente...")
        dados = _coletar_todos_automatico()
        import os
        from config import is_interativo
        batch = os.environ.get("YAN_OS_BATCH", "").lower() in ("1", "true", "yes")
        if is_interativo() and not batch:
            dados = _complementar_manual(dados)
        else:
            print("[coletor] Modo nao-interativo — pulando complementacao manual.")

    dados["data"] = hoje
    dados["horario_coleta"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Resumo do que foi coletado
    total = sum(
        1 for s in dados.values() if isinstance(s, dict)
        for v in s.values() if isinstance(v, dict) and any(v.values())
    )
    print(f"\n[coletor] ✓ {total} ativos coletados.")
    return dados


if __name__ == "__main__":
    import json
    dados = coletar(modo_manual="--manual" in sys.argv)
    print(json.dumps(dados, indent=2, ensure_ascii=False))
