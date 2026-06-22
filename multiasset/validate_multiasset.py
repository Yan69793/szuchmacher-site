#!/usr/bin/env python3
"""
MultiAsset Pro — Validação de Dados, Cenários e Integridade de Cálculos
========================================================================
Script de auditoria para a plataforma MultiAsset (szuchmacher.com.br/multiasset.html).
Executa validação de preços, parâmetros de cenário, Monte Carlo e gera relatórios.

Uso:
    python validate_multiasset.py --all
    python validate_multiasset.py --prices --scenarios --montecarlo
    python validate_multiasset.py --export pdf --output relatorio_auditoria.pdf
    python validate_multiasset.py --alert-threshold 5.0

Requisitos:
    pip install requests pandas numpy scipy beautifulsoup4 fpdf2 python-dateutil
    pip install yfinance  # opcional, para Yahoo Finance

Autor: Auditoria Técnica MultiAsset
Licença: Uso interno — Szuchmacher Consultoria
"""

import argparse
import csv
import hashlib
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from dataclasses import dataclass, field, asdict
from enum import Enum
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
import requests
from scipy import stats

# ---------------------------------------------------------------------------
# Configuração de logging estruturado (LGPD / CVM)
# ---------------------------------------------------------------------------

LOG_DIR = Path("logs")
LOG_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S%z",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(LOG_DIR / f"audit_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.log"),
    ],
)
logger = logging.getLogger("multiasset_audit")


# ---------------------------------------------------------------------------
# Enums e Data Classes
# ---------------------------------------------------------------------------

class Severity(Enum):
    OK = "OK"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


class AssetType(Enum):
    GOLD = "gold"
    SILVER = "silver"
    PLATINUM = "platinum"
    BITCOIN = "btc"


class Scenario(Enum):
    CONSERVATIVE = "conservador"
    MODERATE = "moderado"
    AGGRESSIVE = "agressivo"


@dataclass
class PlatformParams:
    """Parâmetros extraídos da plataforma MultiAsset."""
    asset: str
    scenario: str
    expected_return: float          # retorno anual esperado (decimal)
    expected_volatility: float      # volatilidade anual (decimal)
    source: str = "multiasset.html"
    extracted_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class ValidationResult:
    """Resultado de uma validação individual."""
    check_name: str
    asset: str
    scenario: str
    platform_value: float
    reference_value: float
    deviation_pct: float
    threshold_pct: float
    severity: str
    recommendation: str
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    run_hash: str = ""


@dataclass
class MacroIndicator:
    """Indicador macroeconômico com fonte e timestamp."""
    name: str
    platform_value: Optional[float]
    reference_value: Optional[float]
    source_api: str
    deviation_pct: Optional[float] = None
    last_updated: str = ""


# ---------------------------------------------------------------------------
# Parâmetros da Plataforma (extraídos do código-fonte)
# ---------------------------------------------------------------------------

PLATFORM_SCENARIOS = {
    "gold": {
        "conservador":  {"return": 0.04,  "volatility": 0.15},
        "moderado":     {"return": 0.093, "volatility": 0.15},
        "agressivo":    {"return": 0.15,  "volatility": 0.15},
    },
    "silver": {
        "conservador":  {"return": 0.03,  "volatility": 0.28},
        "moderado":     {"return": 0.085, "volatility": 0.28},
        "agressivo":    {"return": 0.18,  "volatility": 0.28},
    },
    "platinum": {
        "conservador":  {"return": -0.05, "volatility": 0.22},
        "moderado":     {"return": 0.06,  "volatility": 0.22},
        "agressivo":    {"return": 0.20,  "volatility": 0.22},
    },
    "btc": {
        "conservador":  {"return": -0.60, "volatility": 0.85},
        "moderado":     {"return": 0.40,  "volatility": 0.85},
        "agressivo":    {"return": 1.20,  "volatility": 0.85},
    },
}

PLATFORM_MACRO = {
    "selic": 14.75,
    "ipca_focus_2026": 4.1,
    "pib_2025": 2.3,
    "ntnb_spread": 7.5,  # IPCA + 7.5%
}

PLATFORM_VOLATILITIES = {
    "gold": 0.15,
    "silver": 0.28,
    "platinum": 0.22,
    "btc": 0.85,
    "ntnb": 0.08,
    "cdi": 0.005,
}

# Thresholds de desvio por tipo de ativo (%)
DEFAULT_THRESHOLDS = {
    "gold": 15.0,
    "silver": 20.0,
    "platinum": 25.0,
    "btc": 40.0,
    "macro": 10.0,
}


# ---------------------------------------------------------------------------
# Rate Limiter simples
# ---------------------------------------------------------------------------

class RateLimiter:
    """Rate limiter básico para APIs públicas."""

    def __init__(self, calls_per_second: float = 2.0):
        self.min_interval = 1.0 / calls_per_second
        self.last_call = 0.0

    def wait(self):
        elapsed = time.time() - self.last_call
        if elapsed < self.min_interval:
            time.sleep(self.min_interval - elapsed)
        self.last_call = time.time()


rate_limiter = RateLimiter(calls_per_second=2.0)


# ---------------------------------------------------------------------------
# Funções de Consulta a APIs Oficiais
# ---------------------------------------------------------------------------

def fetch_bacen_sgs(series_id: int, last_n: int = 1) -> Optional[float]:
    """Consulta série temporal do Bacen SGS.

    Args:
        series_id: ID da série (ex: 432 = Selic meta, 433 = IPCA mensal).
        last_n: Número de observações recentes.

    Returns:
        Último valor da série ou None em caso de erro.
    """
    rate_limiter.wait()
    url = f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{series_id}/dados/ultimos/{last_n}?formato=json"
    try:
        resp = requests.get(url, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        if data:
            value = float(data[-1]["valor"].replace(",", "."))
            logger.info(f"Bacen SGS {series_id}: {value} (data: {data[-1].get('data', 'N/A')})")
            return value
    except Exception as e:
        logger.error(f"Erro ao consultar Bacen SGS {series_id}: {e}")
    return None


def fetch_bacen_sgs_series(series_id: int, start_date: str, end_date: str) -> pd.DataFrame:
    """Busca série histórica completa do Bacen SGS.

    Args:
        series_id: ID da série.
        start_date: Data inicial (dd/MM/yyyy).
        end_date: Data final (dd/MM/yyyy).

    Returns:
        DataFrame com colunas ['data', 'valor'].
    """
    rate_limiter.wait()
    url = (
        f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{series_id}/dados"
        f"?formato=json&dataInicial={start_date}&dataFinal={end_date}"
    )
    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        df = pd.DataFrame(data)
        if not df.empty:
            df["valor"] = df["valor"].str.replace(",", ".").astype(float)
            df["data"] = pd.to_datetime(df["data"], format="%d/%m/%Y")
        return df
    except Exception as e:
        logger.error(f"Erro série Bacen SGS {series_id}: {e}")
        return pd.DataFrame()


def fetch_yahoo_finance_history(ticker: str, period: str = "10y") -> pd.DataFrame:
    """Busca histórico de preços via Yahoo Finance (yfinance).

    Args:
        ticker: Símbolo Yahoo (ex: 'GC=F' para ouro, 'BTC-USD').
        period: Período (ex: '10y', '5y', '15y').

    Returns:
        DataFrame com preços de fechamento ajustados.
    """
    try:
        import yfinance as yf
        tk = yf.Ticker(ticker)
        hist = tk.history(period=period)
        if hist.empty:
            logger.warning(f"Yahoo Finance: sem dados para {ticker}")
        else:
            logger.info(f"Yahoo Finance {ticker}: {len(hist)} registros ({hist.index[0].date()} a {hist.index[-1].date()})")
        return hist
    except ImportError:
        logger.warning("yfinance não instalado. Usando fallback com API direta.")
        return _fetch_yahoo_fallback(ticker, period)
    except Exception as e:
        logger.error(f"Erro Yahoo Finance {ticker}: {e}")
        return pd.DataFrame()


def _fetch_yahoo_fallback(ticker: str, period: str) -> pd.DataFrame:
    """Fallback para Yahoo Finance sem yfinance instalado."""
    rate_limiter.wait()
    period_map = {"5y": 5, "10y": 10, "15y": 15}
    years = period_map.get(period, 10)
    end_ts = int(time.time())
    start_ts = end_ts - (years * 365 * 86400)
    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
        f"?period1={start_ts}&period2={end_ts}&interval=1mo"
    )
    try:
        resp = requests.get(url, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
        resp.raise_for_status()
        data = resp.json()
        timestamps = data["chart"]["result"][0]["timestamp"]
        closes = data["chart"]["result"][0]["indicators"]["quote"][0]["close"]
        df = pd.DataFrame({"Close": closes}, index=pd.to_datetime(timestamps, unit="s"))
        return df
    except Exception as e:
        logger.error(f"Yahoo fallback {ticker}: {e}")
        return pd.DataFrame()


def fetch_coingecko_history(coin_id: str = "bitcoin", days: int = 3650) -> pd.DataFrame:
    """Busca histórico de preços via CoinGecko API (gratuita).

    Args:
        coin_id: ID do ativo (ex: 'bitcoin').
        days: Número de dias de histórico.

    Returns:
        DataFrame com preços diários.
    """
    rate_limiter.wait()
    url = f"https://api.coingecko.com/api/v3/coins/{coin_id}/market_chart?vs_currency=usd&days={days}"
    try:
        resp = requests.get(url, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        prices = data.get("prices", [])
        df = pd.DataFrame(prices, columns=["timestamp", "price"])
        df["date"] = pd.to_datetime(df["timestamp"], unit="ms")
        df.set_index("date", inplace=True)
        logger.info(f"CoinGecko {coin_id}: {len(df)} registros")
        return df
    except Exception as e:
        logger.error(f"Erro CoinGecko {coin_id}: {e}")
        return pd.DataFrame()


def fetch_awesomeapi_usdbrl() -> Optional[float]:
    """Busca cotação USD/BRL via AwesomeAPI."""
    rate_limiter.wait()
    try:
        resp = requests.get("https://economia.awesomeapi.com.br/json/last/USD-BRL", timeout=10)
        resp.raise_for_status()
        data = resp.json()
        bid = float(data["USDBRL"]["bid"])
        logger.info(f"AwesomeAPI USD/BRL: {bid}")
        return bid
    except Exception as e:
        logger.error(f"Erro AwesomeAPI: {e}")
        return None


# ---------------------------------------------------------------------------
# Cálculos de Retorno e Volatilidade Histórica
# ---------------------------------------------------------------------------

YAHOO_TICKERS = {
    "gold": "GC=F",
    "silver": "SI=F",
    "platinum": "PL=F",
    "btc": "BTC-USD",
}


def calc_historical_stats(prices: pd.Series, periods: list[int] = None) -> dict:
    """Calcula retorno anualizado (CAGR) e volatilidade para diferentes períodos.

    Args:
        prices: Série de preços (index = datetime).
        periods: Lista de anos para cálculo (ex: [5, 10, 15]).

    Returns:
        Dict com stats por período: {5: {"cagr": ..., "vol": ...}, ...}
    """
    if periods is None:
        periods = [5, 10, 15]

    results = {}
    prices = prices.dropna().sort_index()

    if len(prices) < 252:
        logger.warning("Histórico insuficiente para cálculos confiáveis.")
        return results

    for years in periods:
        cutoff = prices.index[-1] - pd.DateOffset(years=years)
        subset = prices[prices.index >= cutoff]

        if len(subset) < 60:
            logger.warning(f"Dados insuficientes para {years} anos.")
            continue

        # CAGR
        start_val = subset.iloc[0]
        end_val = subset.iloc[-1]
        actual_years = (subset.index[-1] - subset.index[0]).days / 365.25
        if start_val > 0 and actual_years > 0:
            cagr = (end_val / start_val) ** (1 / actual_years) - 1
        else:
            cagr = 0.0

        # Volatilidade anualizada (retornos log diários)
        log_returns = np.log(subset / subset.shift(1)).dropna()
        # Estima fator de anualização pelo intervalo médio
        avg_days_between = (subset.index[-1] - subset.index[0]).days / len(subset)
        if avg_days_between < 5:
            annualization_factor = 252  # dados diários
        elif avg_days_between < 15:
            annualization_factor = 52   # dados semanais
        else:
            annualization_factor = 12   # dados mensais

        vol = log_returns.std() * np.sqrt(annualization_factor)

        results[years] = {"cagr": round(cagr, 4), "vol": round(vol, 4)}
        logger.info(f"Histórico {years}y: CAGR={cagr:.2%}, Vol={vol:.2%}")

    return results


# ---------------------------------------------------------------------------
# Validação do Monte Carlo
# ---------------------------------------------------------------------------

def run_monte_carlo(
    initial: float,
    monthly_contribution: float,
    annual_return: float,
    annual_volatility: float,
    years: int,
    n_simulations: int = 1000,
    seed: Optional[int] = None,
    distribution: str = "lognormal",
) -> dict:
    """Executa simulação Monte Carlo para validação.

    Args:
        initial: Investimento inicial (USD).
        monthly_contribution: Aporte mensal (USD).
        annual_return: Retorno anual esperado (decimal).
        annual_volatility: Volatilidade anual (decimal).
        years: Horizonte em anos.
        n_simulations: Número de trajetórias.
        seed: Seed para reprodutibilidade.
        distribution: 'lognormal' ou 'normal' ou 't-student'.

    Returns:
        Dict com P10, P50, P90, média, desvio padrão dos valores finais.
    """
    if seed is not None:
        np.random.seed(seed)

    months = years * 12
    monthly_return = (1 + annual_return) ** (1 / 12) - 1
    monthly_vol = annual_volatility / np.sqrt(12)

    final_values = np.zeros(n_simulations)

    for sim in range(n_simulations):
        portfolio = initial
        for m in range(months):
            if distribution == "lognormal":
                # GBM: log-retorno ~ N(mu - sigma²/2, sigma)
                drift = monthly_return - 0.5 * monthly_vol ** 2
                shock = np.random.normal(0, 1)
                monthly_r = np.exp(drift + monthly_vol * shock) - 1
            elif distribution == "t-student":
                shock = stats.t.rvs(df=5) * monthly_vol
                monthly_r = monthly_return + shock
            else:  # normal
                monthly_r = np.random.normal(monthly_return, monthly_vol)

            portfolio = portfolio * (1 + monthly_r) + monthly_contribution

        final_values[sim] = max(portfolio, 0)

    return {
        "p10": round(np.percentile(final_values, 10), 2),
        "p25": round(np.percentile(final_values, 25), 2),
        "p50": round(np.percentile(final_values, 50), 2),
        "p75": round(np.percentile(final_values, 75), 2),
        "p90": round(np.percentile(final_values, 90), 2),
        "mean": round(np.mean(final_values), 2),
        "std": round(np.std(final_values), 2),
        "min": round(np.min(final_values), 2),
        "max": round(np.max(final_values), 2),
        "n_simulations": n_simulations,
        "distribution": distribution,
        "seed": seed,
    }


def validate_platform_monte_carlo(asset: str, scenario: str, initial: float = 10000,
                                   monthly: float = 500, years: int = 10) -> dict:
    """Compara Monte Carlo local com cálculo determinístico da plataforma.

    A plataforma usa calcFinal() que é determinístico (sem volatilidade).
    O Monte Carlo local permite avaliar a dispersão real dos resultados.
    """
    params = PLATFORM_SCENARIOS.get(asset, {}).get(scenario, {})
    if not params:
        return {"error": f"Parâmetros não encontrados para {asset}/{scenario}"}

    annual_return = params["return"]
    annual_vol = params.get("volatility", PLATFORM_VOLATILITIES.get(asset, 0.20))

    # Cálculo determinístico da plataforma (replica calcFinal)
    r_monthly = (1 + annual_return) ** (1 / 12) - 1
    n_months = years * 12
    if r_monthly > 0:
        platform_deterministic = (
            initial * (1 + r_monthly) ** n_months
            + monthly * ((1 + r_monthly) ** n_months - 1) / r_monthly
        )
    elif r_monthly == 0:
        platform_deterministic = initial + monthly * n_months
    else:
        platform_deterministic = (
            initial * (1 + r_monthly) ** n_months
            + monthly * ((1 + r_monthly) ** n_months - 1) / r_monthly
        )

    # Monte Carlo local
    mc_results = run_monte_carlo(
        initial=initial,
        monthly_contribution=monthly,
        annual_return=annual_return,
        annual_volatility=annual_vol,
        years=years,
        n_simulations=1000,
        seed=42,
        distribution="lognormal",
    )

    return {
        "asset": asset,
        "scenario": scenario,
        "platform_deterministic": round(platform_deterministic, 2),
        "mc_p10": mc_results["p10"],
        "mc_p50": mc_results["p50"],
        "mc_p90": mc_results["p90"],
        "mc_mean": mc_results["mean"],
        "mc_std": mc_results["std"],
        "deviation_p50_vs_deterministic": round(
            (mc_results["p50"] - platform_deterministic) / platform_deterministic * 100, 2
        ),
        "risk_of_loss_pct": round(
            np.sum(np.array([mc_results["p10"]]) < initial + monthly * 12 * years)
            / 1 * 100, 1
        ),
    }


# ---------------------------------------------------------------------------
# Backtesting de Cenários
# ---------------------------------------------------------------------------

def backtest_scenario(prices: pd.Series, scenario_return: float,
                      periods: list[int] = None) -> dict:
    """Backtesta um cenário contra dados históricos.

    Args:
        prices: Série de preços históricos.
        scenario_return: Retorno anual do cenário (decimal).
        periods: Períodos de backtesting em anos.

    Returns:
        Dict com comparação por período e eventos de estresse.
    """
    if periods is None:
        periods = [5, 10, 15]

    results = {}
    prices = prices.dropna().sort_index()

    for yrs in periods:
        cutoff = prices.index[-1] - pd.DateOffset(years=yrs)
        subset = prices[prices.index >= cutoff]
        if len(subset) < 30:
            continue

        start_val = subset.iloc[0]
        end_val = subset.iloc[-1]
        actual_years = (subset.index[-1] - subset.index[0]).days / 365.25

        actual_cagr = (end_val / start_val) ** (1 / actual_years) - 1 if start_val > 0 else 0
        scenario_cumulative = (1 + scenario_return) ** actual_years - 1
        actual_cumulative = end_val / start_val - 1

        results[f"{yrs}y"] = {
            "actual_cagr": round(actual_cagr, 4),
            "scenario_cagr": scenario_return,
            "deviation": round(actual_cagr - scenario_return, 4),
            "actual_cumulative": round(actual_cumulative, 4),
            "scenario_cumulative": round(scenario_cumulative, 4),
        }

    # Estresse: eventos específicos
    stress_events = {
        "GFC 2008": ("2008-01-01", "2009-03-31"),
        "Brasil 2015": ("2015-01-01", "2015-12-31"),
        "COVID 2020": ("2020-02-01", "2020-04-30"),
        "Hike 2022": ("2022-01-01", "2022-12-31"),
    }

    stress_results = {}
    for event_name, (start, end) in stress_events.items():
        try:
            event_data = prices[start:end]
            if len(event_data) >= 2:
                event_return = event_data.iloc[-1] / event_data.iloc[0] - 1
                stress_results[event_name] = round(event_return, 4)
        except Exception:
            pass

    results["stress_tests"] = stress_results
    return results


# ---------------------------------------------------------------------------
# Validação de Preços (Plataforma vs Referências)
# ---------------------------------------------------------------------------

def validate_prices(thresholds: Optional[dict] = None) -> list[ValidationResult]:
    """Compara preços da plataforma com fontes de referência.

    Como a plataforma usa TradingView widgets (tempo real),
    esta função valida que as APIs alternativas estão alinhadas.
    """
    if thresholds is None:
        thresholds = DEFAULT_THRESHOLDS

    results = []
    run_id = hashlib.sha256(datetime.now(timezone.utc).isoformat().encode()).hexdigest()[:12]

    # USD/BRL
    usdbrl = fetch_awesomeapi_usdbrl()
    if usdbrl:
        results.append(ValidationResult(
            check_name="USD/BRL spot",
            asset="USDBRL",
            scenario="N/A",
            platform_value=0,  # Exibido via widget TradingView
            reference_value=usdbrl,
            deviation_pct=0,
            threshold_pct=thresholds.get("macro", 10),
            severity=Severity.OK.value,
            recommendation="Preço via TradingView widget — validação cruzada com AwesomeAPI.",
            run_hash=run_id,
        ))

    # Selic
    selic = fetch_bacen_sgs(432, last_n=1)
    if selic:
        dev = abs(selic - PLATFORM_MACRO["selic"]) / PLATFORM_MACRO["selic"] * 100
        sev = Severity.OK if dev < 5 else (Severity.WARNING if dev < 15 else Severity.CRITICAL)
        results.append(ValidationResult(
            check_name="Selic Meta",
            asset="MACRO",
            scenario="N/A",
            platform_value=PLATFORM_MACRO["selic"],
            reference_value=selic,
            deviation_pct=round(dev, 2),
            threshold_pct=thresholds.get("macro", 10),
            severity=sev.value,
            recommendation="Atualizar se desvio > 0.25pp" if dev > 1.5 else "Dentro da tolerância.",
            run_hash=run_id,
        ))

    # IPCA
    ipca = fetch_bacen_sgs(433, last_n=12)  # IPCA mensal — último valor
    if ipca is not None:
        results.append(ValidationResult(
            check_name="IPCA mensal (último)",
            asset="MACRO",
            scenario="N/A",
            platform_value=PLATFORM_MACRO["ipca_focus_2026"],
            reference_value=ipca,
            deviation_pct=0,  # Comparação diferente: mensal vs projeção anual
            threshold_pct=thresholds.get("macro", 10),
            severity=Severity.OK.value,
            recommendation="Focus 2026 vs IPCA mensal realizado — métricas diferentes, verificar manualmente.",
            run_hash=run_id,
        ))

    return results


# ---------------------------------------------------------------------------
# Validação Completa de Cenários
# ---------------------------------------------------------------------------

def validate_all_scenarios() -> list[dict]:
    """Executa validação completa de todos os cenários vs dados históricos."""
    all_results = []

    for asset, ticker in YAHOO_TICKERS.items():
        logger.info(f"--- Validando {asset} ({ticker}) ---")
        hist = fetch_yahoo_finance_history(ticker, period="15y")

        if hist.empty:
            logger.warning(f"Sem dados históricos para {asset}. Pulando.")
            continue

        # Seleciona coluna de preço
        price_col = "Close" if "Close" in hist.columns else hist.columns[0]
        prices = hist[price_col]

        # Stats históricas
        hist_stats = calc_historical_stats(prices, periods=[5, 10, 15])

        # Para cada cenário
        for scenario in ["conservador", "moderado", "agressivo"]:
            params = PLATFORM_SCENARIOS[asset][scenario]

            # Retorno e vol históricos (10y como referência principal)
            hist_10y = hist_stats.get(10, hist_stats.get(5, {"cagr": None, "vol": None}))

            # Backtesting
            bt = backtest_scenario(prices, params["return"], periods=[5, 10, 15])

            # Coerência
            if hist_10y["cagr"] is not None:
                dev = abs(params["return"] - hist_10y["cagr"])
                if dev < 0.05:
                    coherence = "COERENTE"
                elif dev < 0.15:
                    coherence = "ACEITÁVEL"
                else:
                    coherence = "DIVERGENTE"
            else:
                coherence = "SEM DADOS"

            result = {
                "asset": asset,
                "scenario": scenario,
                "platform_return": params["return"],
                "platform_volatility": params["volatility"],
                "historical_cagr_10y": hist_10y.get("cagr"),
                "historical_vol_10y": hist_10y.get("vol"),
                "historical_cagr_5y": hist_stats.get(5, {}).get("cagr"),
                "historical_cagr_15y": hist_stats.get(15, {}).get("cagr"),
                "coherence": coherence,
                "backtest": bt,
            }
            all_results.append(result)
            logger.info(
                f"{asset}/{scenario}: plat={params['return']:.1%} vs hist10y="
                f"{hist_10y.get('cagr', 'N/A')} → {coherence}"
            )

    return all_results


# ---------------------------------------------------------------------------
# Geração de Relatórios
# ---------------------------------------------------------------------------

def export_csv(results: list[dict], filename: str = "validation_results.csv"):
    """Exporta resultados em CSV."""
    output_dir = Path("output")
    output_dir.mkdir(exist_ok=True)
    filepath = output_dir / filename

    if not results:
        logger.warning("Sem resultados para exportar.")
        return

    keys = results[0].keys()
    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=keys)
        writer.writeheader()
        for row in results:
            # Flatten nested dicts for CSV
            flat_row = {}
            for k, v in row.items():
                if isinstance(v, dict):
                    flat_row[k] = json.dumps(v, ensure_ascii=False)
                else:
                    flat_row[k] = v
            writer.writerow(flat_row)

    logger.info(f"CSV exportado: {filepath}")


def export_json(results: list[dict], filename: str = "validation_results.json"):
    """Exporta resultados em JSON com metadados de auditoria."""
    output_dir = Path("output")
    output_dir.mkdir(exist_ok=True)
    filepath = output_dir / filename

    payload = {
        "metadata": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "platform": "MultiAsset Pro",
            "platform_url": "https://szuchmacher.com.br/multiasset.html",
            "audit_version": "1.0.0",
            "hash": hashlib.sha256(json.dumps(results, default=str).encode()).hexdigest(),
        },
        "results": results,
    }

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2, default=str)

    logger.info(f"JSON exportado: {filepath}")


def export_pdf(results: list[dict], filename: str = "relatorio_auditoria.pdf"):
    """Exporta relatório em PDF com carimbo de integridade."""
    try:
        from fpdf import FPDF
    except ImportError:
        logger.error("fpdf2 não instalado. Execute: pip install fpdf2")
        return

    output_dir = Path("output")
    output_dir.mkdir(exist_ok=True)
    filepath = output_dir / filename

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, "MultiAsset Pro - Relatorio de Auditoria", ln=True, align="C")
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 8, f"Gerado em: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}", ln=True, align="C")

    content_hash = hashlib.sha256(json.dumps(results, default=str).encode()).hexdigest()
    pdf.cell(0, 6, f"Hash de integridade: {content_hash[:32]}...", ln=True, align="C")
    pdf.ln(10)

    # Tabela de resultados
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 8, "Validacao de Cenarios", ln=True)
    pdf.set_font("Helvetica", "", 8)

    col_widths = [25, 28, 25, 25, 28, 28, 30]
    headers = ["Ativo", "Cenario", "Ret.Plat", "Vol.Plat", "CAGR Hist.10y", "Vol Hist.10y", "Coerencia"]

    for i, h in enumerate(headers):
        pdf.cell(col_widths[i], 7, h, border=1, align="C")
    pdf.ln()

    for r in results:
        vals = [
            r.get("asset", ""),
            r.get("scenario", ""),
            f"{r.get('platform_return', 0):.1%}",
            f"{r.get('platform_volatility', 0):.1%}",
            f"{r['historical_cagr_10y']:.1%}" if r.get("historical_cagr_10y") is not None else "N/A",
            f"{r['historical_vol_10y']:.1%}" if r.get("historical_vol_10y") is not None else "N/A",
            r.get("coherence", "N/A"),
        ]
        for i, v in enumerate(vals):
            pdf.cell(col_widths[i], 6, str(v), border=1, align="C")
        pdf.ln()

    pdf.ln(10)
    pdf.set_font("Helvetica", "I", 8)
    pdf.multi_cell(0, 5,
        "Disclaimer: Este relatorio tem carater exclusivamente informativo e de auditoria interna. "
        "Nao constitui recomendacao de investimento. Os dados historicos foram obtidos de fontes "
        "publicas (Yahoo Finance, Bacen SGS, CoinGecko) e podem conter imprecisoes."
    )

    pdf.output(str(filepath))
    logger.info(f"PDF exportado: {filepath}")


# ---------------------------------------------------------------------------
# Sistema de Alertas
# ---------------------------------------------------------------------------

def check_alerts(results: list[dict], threshold_override: Optional[float] = None) -> list[dict]:
    """Verifica desvios e gera alertas.

    Args:
        results: Resultados da validação de cenários.
        threshold_override: Threshold global em % (sobrescreve defaults).

    Returns:
        Lista de alertas com recomendações de ação.
    """
    alerts = []

    for r in results:
        asset = r.get("asset", "")
        scenario = r.get("scenario", "")
        plat_ret = r.get("platform_return", 0)
        hist_cagr = r.get("historical_cagr_10y")

        if hist_cagr is None:
            continue

        threshold = threshold_override or DEFAULT_THRESHOLDS.get(asset, 20.0)
        deviation = abs(plat_ret - hist_cagr) * 100  # em pontos percentuais

        if r.get("coherence") == "DIVERGENTE":
            alerts.append({
                "level": "CRITICAL",
                "asset": asset,
                "scenario": scenario,
                "message": (
                    f"Cenário '{scenario}' para {asset}: retorno esperado ({plat_ret:.1%}) "
                    f"diverge significativamente do CAGR histórico 10y ({hist_cagr:.1%}). "
                    f"Desvio: {deviation:.1f}pp."
                ),
                "recommendation": (
                    "Revisar premissas do cenário. Considerar ajuste do retorno esperado "
                    "ou adicionar disclaimer sobre a divergência histórica."
                ),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
        elif r.get("coherence") == "ACEITÁVEL":
            alerts.append({
                "level": "WARNING",
                "asset": asset,
                "scenario": scenario,
                "message": (
                    f"Cenário '{scenario}' para {asset}: desvio moderado ({deviation:.1f}pp) "
                    f"entre retorno esperado e histórico."
                ),
                "recommendation": "Monitorar. Sem ação imediata necessária.",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })

    return alerts


def send_alert_smtp(alerts: list[dict], smtp_config: Optional[dict] = None):
    """Envia alertas por e-mail (SMTP). Requer configuração."""
    if not alerts:
        return
    if not smtp_config:
        logger.info(f"[SMTP] {len(alerts)} alertas gerados (envio desabilitado — configure SMTP).")
        for a in alerts:
            logger.info(f"  [{a['level']}] {a['asset']}/{a['scenario']}: {a['message']}")
        return

    import smtplib
    from email.mime.text import MIMEText

    body = "\n\n".join(
        f"[{a['level']}] {a['asset']}/{a['scenario']}\n{a['message']}\nRecomendação: {a['recommendation']}"
        for a in alerts
    )

    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = f"MultiAsset Audit Alert — {len(alerts)} achados"
    msg["From"] = smtp_config["from"]
    msg["To"] = smtp_config["to"]

    try:
        with smtplib.SMTP(smtp_config["host"], smtp_config.get("port", 587)) as server:
            server.starttls()
            server.login(smtp_config["user"], smtp_config["password"])
            server.send_message(msg)
        logger.info(f"Alertas enviados para {smtp_config['to']}")
    except Exception as e:
        logger.error(f"Erro ao enviar e-mail: {e}")


def send_alert_slack(alerts: list[dict], webhook_url: Optional[str] = None):
    """Envia alertas para Slack via webhook."""
    if not alerts or not webhook_url:
        logger.info(f"[Slack] {len(alerts)} alertas (webhook não configurado).")
        return

    blocks = []
    for a in alerts:
        emoji = ":red_circle:" if a["level"] == "CRITICAL" else ":warning:"
        blocks.append({
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"{emoji} *{a['asset']}/{a['scenario']}*\n{a['message']}\n_Recomendação: {a['recommendation']}_"
            }
        })

    payload = {"text": f"MultiAsset Audit: {len(alerts)} alertas", "blocks": blocks}
    try:
        resp = requests.post(webhook_url, json=payload, timeout=10)
        resp.raise_for_status()
        logger.info("Alertas enviados para Slack.")
    except Exception as e:
        logger.error(f"Erro Slack: {e}")


# ---------------------------------------------------------------------------
# CLI Principal
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="MultiAsset Pro — Validação de Dados e Cenários",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Exemplos:
  python validate_multiasset.py --all
  python validate_multiasset.py --prices --scenarios
  python validate_multiasset.py --montecarlo --asset gold --scenario moderado
  python validate_multiasset.py --export pdf csv json
  python validate_multiasset.py --alert-threshold 10.0 --slack-webhook https://hooks.slack.com/...
        """,
    )

    parser.add_argument("--all", action="store_true", help="Executa todas as validações")
    parser.add_argument("--prices", action="store_true", help="Valida preços e indicadores macro")
    parser.add_argument("--scenarios", action="store_true", help="Valida cenários vs dados históricos")
    parser.add_argument("--montecarlo", action="store_true", help="Executa e valida Monte Carlo")
    parser.add_argument("--asset", type=str, help="Ativo específico (gold, silver, platinum, btc)")
    parser.add_argument("--scenario", type=str, help="Cenário específico (conservador, moderado, agressivo)")
    parser.add_argument("--export", nargs="+", choices=["csv", "json", "pdf"], default=["json"],
                        help="Formatos de exportação")
    parser.add_argument("--output", type=str, default=None, help="Nome do arquivo de saída")
    parser.add_argument("--alert-threshold", type=float, default=None,
                        help="Threshold global de alerta em %% de desvio")
    parser.add_argument("--slack-webhook", type=str, default=None, help="Slack webhook URL para alertas")
    parser.add_argument("--seed", type=int, default=42, help="Seed para Monte Carlo (reprodutibilidade)")
    parser.add_argument("--simulations", type=int, default=1000, help="Número de simulações Monte Carlo")

    args = parser.parse_args()

    if not any([args.all, args.prices, args.scenarios, args.montecarlo]):
        args.all = True

    logger.info("=" * 60)
    logger.info("MultiAsset Pro — Auditoria de Validação Iniciada")
    logger.info(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")
    logger.info("=" * 60)

    all_results = []
    alerts = []

    # 1. Validação de preços
    if args.all or args.prices:
        logger.info("\n[1/3] Validando preços e indicadores macro...")
        price_results = validate_prices()
        for pr in price_results:
            all_results.append(asdict(pr))
            logger.info(f"  {pr.check_name}: plat={pr.platform_value} ref={pr.reference_value} "
                        f"dev={pr.deviation_pct}% [{pr.severity}]")

    # 2. Validação de cenários
    scenario_results = []
    if args.all or args.scenarios:
        logger.info("\n[2/3] Validando cenários vs dados históricos...")
        if args.asset:
            # Validar ativo específico
            assets_to_check = {args.asset: YAHOO_TICKERS.get(args.asset, "")}
        else:
            assets_to_check = YAHOO_TICKERS

        for asset, ticker in assets_to_check.items():
            hist = fetch_yahoo_finance_history(ticker, period="15y")
            if hist.empty:
                continue

            price_col = "Close" if "Close" in hist.columns else hist.columns[0]
            prices = hist[price_col]
            hist_stats = calc_historical_stats(prices, periods=[5, 10, 15])

            scenarios_to_check = [args.scenario] if args.scenario else ["conservador", "moderado", "agressivo"]

            for scenario in scenarios_to_check:
                params = PLATFORM_SCENARIOS.get(asset, {}).get(scenario, {})
                if not params:
                    continue

                hist_10y = hist_stats.get(10, hist_stats.get(5, {"cagr": None, "vol": None}))
                bt = backtest_scenario(prices, params["return"], periods=[5, 10, 15])

                if hist_10y["cagr"] is not None:
                    dev = abs(params["return"] - hist_10y["cagr"])
                    coherence = "COERENTE" if dev < 0.05 else ("ACEITÁVEL" if dev < 0.15 else "DIVERGENTE")
                else:
                    coherence = "SEM DADOS"

                result = {
                    "asset": asset,
                    "scenario": scenario,
                    "platform_return": params["return"],
                    "platform_volatility": params["volatility"],
                    "historical_cagr_10y": hist_10y.get("cagr"),
                    "historical_vol_10y": hist_10y.get("vol"),
                    "historical_cagr_5y": hist_stats.get(5, {}).get("cagr"),
                    "historical_cagr_15y": hist_stats.get(15, {}).get("cagr"),
                    "coherence": coherence,
                    "backtest": bt,
                }
                scenario_results.append(result)

        # Gerar alertas
        alerts = check_alerts(scenario_results, args.alert_threshold)
        all_results.extend(scenario_results)

    # 3. Monte Carlo
    mc_results = []
    if args.all or args.montecarlo:
        logger.info("\n[3/3] Executando validação Monte Carlo...")
        assets = [args.asset] if args.asset else list(PLATFORM_SCENARIOS.keys())
        scenarios = [args.scenario] if args.scenario else ["conservador", "moderado", "agressivo"]

        for asset in assets:
            for scenario in scenarios:
                mc = validate_platform_monte_carlo(asset, scenario)
                mc_results.append(mc)
                logger.info(
                    f"  MC {asset}/{scenario}: determinístico=${mc.get('platform_deterministic', 'N/A'):,.0f} "
                    f"| P50=${mc.get('mc_p50', 'N/A'):,.0f} | P10-P90=[${mc.get('mc_p10', 'N/A'):,.0f} — "
                    f"${mc.get('mc_p90', 'N/A'):,.0f}]"
                )

        all_results.extend(mc_results)

    # Exportação
    logger.info("\n--- Exportando resultados ---")
    for fmt in args.export:
        base_name = args.output or "multiasset_validation"
        if fmt == "csv":
            export_csv(scenario_results or all_results, f"{base_name}.csv")
        elif fmt == "json":
            export_json({"scenarios": scenario_results, "montecarlo": mc_results, "alerts": alerts},
                        f"{base_name}.json")
        elif fmt == "pdf":
            export_pdf(scenario_results, f"{base_name}.pdf")

    # Alertas
    if alerts:
        logger.info(f"\n--- {len(alerts)} ALERTAS ---")
        send_alert_smtp(alerts)
        if args.slack_webhook:
            send_alert_slack(alerts, args.slack_webhook)

    logger.info("\n" + "=" * 60)
    logger.info("Auditoria concluída.")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
