// Handler: /api/btc-scenarios
// Busca dados do BTC Radar server-side, processa taxas de cenarios
// e retorna apenas os numeros finais. Nenhum dado bruto do BTC Radar
// vaza para o cliente. Cache em KV por 2h.

import { jsonResponse } from '../utils/http.js';
import { writeCache, readCacheOrRevalidate, staleTtl } from '../utils/cache.js';
import { fetchBtcEndpoint } from './btc-intelligence.js';

const CACHE_KEY = 'btc-scenarios';
const CACHE_TTL = 7200; // 2 horas
// Taxas padrao (hardcoded no HTML). Usadas como fallback.
const DEFAULTS = { pess: null, base: 0.40, otim: 1.20 };

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

async function fetchSignals(env) {
  const result = await fetchBtcEndpoint(env, '/api/signals', 12000);
  const data = result.body;
  if (!result.ok || !data?.success || !data?.data?.signals) return null;
  return data.data.signals;
}

async function fetchFearGreed(env) {
  const result = await fetchBtcEndpoint(env, '/api/sentiment/fear-greed', 8000);
  const data = result.body;
  if (!result.ok || !data?.success || data?.data?.value == null) return null;
  return data.data.value; // 0-100
}

export async function fetchEmpirical365(env) {
  const result = await fetchBtcEndpoint(env, '/api/scenarios', 10000);
  const data = result.body?.data;
  const annual = data?.horizons?.['365'];
  const effectiveSampleSize = Number(annual?.effective_sample_size ?? 0);
  if (!result.ok || !annual?.available || annual.sample_size < 30 || effectiveSampleSize < 6) return null;
  const values = [annual.p10, annual.p50, annual.p90].map(Number);
  if (!values.every(Number.isFinite)) return null;
  return {
    rates: {
      pess: values[0] / 100,
      base: values[1] / 100,
      otim: values[2] / 100,
    },
    method: 'empirical-forward-returns',
    sample_size: annual.sample_size,
    effective_sample_size: effectiveSampleSize,
    confidence: annual.confidence ?? 'limited',
    conditioning: annual.conditioning,
    regime: data.current_regime ?? null,
    horizon_days: 365,
  };
}

function computeRates(signals, fgValue) {
  if (!signals && fgValue == null) return DEFAULTS;

  let base = 0.40; // taxa base moderada (40% a.a.)

  // ── Fear & Greed: indicador contrarian ──
  // Medo extremo (0-25): bom momento de entrada → vies altista
  // Ganancia extrema (76-100): momento de cautela → vies baixista
  if (fgValue != null) {
    const fgBias = (50 - fgValue) / 200; // -0.25 a +0.25
    base = clamp(0.40 + fgBias, 0.22, 0.58);
  }

  // ── Sinais de longo prazo: direcao da tendencia ──
  if (signals) {
    const long = signals.filter(function(s) { return s.timeframe === 'long'; });
    const buys = long.filter(function(s) { return s.verdict === 'COMPRAR'; }).length;
    if (buys >= 4) base = clamp(base + 0.06, 0.22, 0.58);
    else if (buys <= 1) base = clamp(base - 0.06, 0.22, 0.58);
  }

  // ── Volatilidade (ATR medio dos sinais de medio prazo) ──
  // ATR alto → spread maior entre pessimista e otimista
  let atrRatio = 0.02; // default: 2% do preco
  if (signals) {
    const medium = signals.filter(function(s) { return s.timeframe === 'medium'; });
    const atrVals = medium
      .map(function(s) { return s.payload?.atr_value; })
      .filter(function(v) { return v != null; });
    if (atrVals.length > 0) {
      const avgAtr = atrVals.reduce(function(a, b) { return a + b; }, 0) / atrVals.length;
      const price = medium[0]?.entry_price || 64800;
      atrRatio = avgAtr / price; // ex: 332 / 64800 = 0.005 (0.5%)
    }
  }

  // Spread: base +- (0.55 + atrRatio * 8)
  // ATR 0.5% → spread ~0.59 | ATR 3% → spread ~0.79
  const halfSpread = clamp(0.55 + atrRatio * 8, 0.50, 0.85);

  // Cenarios
  const btcBase = Math.round(base * 100) / 100;

  // Pessimista: BTC Radar nunca gera "perda total". No pior cenario (FG extremo + todos AGUARDAR/VENDER),
  // a taxa pessimista pode chegar a -40% a.a., mas nao usamos o null do HTML (que significa drawdown total).
  // Convertemos para taxa anual negativa.
  const btcPess = Math.round((base - halfSpread) * 100) / 100;

  const btcOtim = Math.round(clamp(base + halfSpread, 0.70, 1.80) * 100) / 100;

  return {
    pess: btcPess,
    base: btcBase,
    otim: btcOtim,
  };
}

async function revalidate(env) {
  // A banda empirica e coletada quando o horizonte anual tem amostra suficiente.
  // Ela nao substitui automaticamente o drift recorrente usado nas projecoes longas.
  const [empirical, signals, fgValue] = await Promise.all([
    fetchEmpirical365(env),
    fetchSignals(env),
    fetchFearGreed(env),
  ]);

  const ts = Math.floor(Date.now() / 1000);
  // Importante: P10/P50/P90 de uma janela de 365 dias descrevem a distribuicao
  // de UM ano. Nao podem virar automaticamente o drift recorrente de uma projecao
  // de 5-10 anos. Por isso as taxas do simulador permanecem no modelo atual, e a
  // distribuicao empirica entra como banda diagnostica separada.
  const metadata = {
    rates: computeRates(signals, fgValue),
    method: empirical ? 'heuristic-drift-with-empirical-band' : 'heuristic-fallback',
    empirical_band: empirical,
    horizon_days: 365,
  };

  await writeCache(env.CACHE, CACHE_KEY, { ...metadata, ts }, staleTtl(CACHE_TTL));

  return { ok: true, ...metadata, generated_at: ts };
}

export async function handleBtcScenarios(env, ctx) {
  const { cached, state } = await readCacheOrRevalidate(
    env.CACHE,
    CACHE_KEY,
    CACHE_TTL,
    ctx,
    () => revalidate(env)
  );

  if (cached) {
    return jsonResponse(
      {
        ok: true,
        rates: cached.rates,
        method: cached.method ?? 'heuristic-fallback',
        empirical_band: cached.empirical_band ?? null,
        horizon_days: cached.horizon_days ?? 365,
        generated_at: cached.ts,
        source: state,
      },
      { headers: { 'Cache-Control': 'public, max-age=3600' } }
    );
  }

  return jsonResponse(await revalidate(env), {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}
