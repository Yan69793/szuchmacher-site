// Handler: /api/btc-scenarios
// Busca dados do BTC Radar server-side, processa taxas de cenarios
// e retorna apenas os numeros finais. Nenhum dado bruto do BTC Radar
// vaza para o cliente. Cache em KV por 2h.

import { fetchJson, jsonResponse } from '../utils/http.js';
import { readCache, writeCache } from '../utils/cache.js';

const CACHE_KEY = 'btc-scenarios';
const CACHE_TTL = 7200; // 2 horas
const BTC_API = 'https://btc-radar.prospects-intel.workers.dev/api';

// Taxas padrao (hardcoded no HTML). Usadas como fallback.
const DEFAULTS = { pess: null, base: 0.40, otim: 1.20 };

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

async function fetchSignals() {
  const data = await fetchJson(BTC_API + '/signals', { timeout: 12000 });
  if (!data?.success || !data?.data?.signals) return null;
  return data.data.signals;
}

async function fetchFearGreed() {
  const data = await fetchJson(BTC_API + '/sentiment/fear-greed', { timeout: 8000 });
  if (!data?.success || data?.data?.value == null) return null;
  return data.data.value; // 0-100
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

export async function handleBtcScenarios(env) {
  // Tenta cache primeiro
  const cache = await readCache(env.CACHE, CACHE_KEY);
  if (cache?.ts && Date.now() / 1000 - cache.ts < CACHE_TTL) {
    return jsonResponse(
      { ok: true, rates: cache.rates, generated_at: cache.ts, source: 'cache' },
      { headers: { 'Cache-Control': 'public, max-age=3600' } }
    );
  }

  // Busca dados do BTC Radar (server-side, invisivel para o cliente)
  const [signals, fgValue] = await Promise.all([
    fetchSignals(),
    fetchFearGreed(),
  ]);

  const rates = computeRates(signals, fgValue);

  const payload = {
    ok: true,
    rates,
    generated_at: Math.floor(Date.now() / 1000),
  };

  await writeCache(env.CACHE, CACHE_KEY, { rates, ts: Math.floor(Date.now() / 1000) }, CACHE_TTL);

  return jsonResponse(payload, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}
