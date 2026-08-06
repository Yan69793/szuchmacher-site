// Handler: /api/cdi-scenarios
// Busca a taxa CDI da BrasilAPI (fallback BCB SGS 12), computa cenarios
// de renda fixa e retorna apenas os numeros finais. Cache em KV por 4h.
// CDI e risk-free: spread entre cenarios e fixo e pequeno.

import { fetchJson, jsonResponse } from '../utils/http.js';
import { writeCache, readCacheOrRevalidate, staleTtl } from '../utils/cache.js';

const CACHE_KEY = 'cdi-scenarios';
const CACHE_TTL = 14400; // 4 horas
const DEFAULTS = { rate: 0.1425 }; // fallback ~14,25% a.a.

async function fetchBrasilApi() {
  const data = await fetchJson('https://brasilapi.com.br/api/taxas/v1', { timeout: 10000 });
  if (!data || !Array.isArray(data)) return null;
  const cdi = data.find(function(t) { return /^cdi$/i.test(t.nome); });
  if (cdi && parseFloat(cdi.valor) > 0) return parseFloat(cdi.valor) / 100;
  return null;
}

async function fetchBcbCdi() {
  // BCB SGS serie 12: taxa CDI diaria (Over/Selic)
  const data = await fetchJson(
    'https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados/ultimos/1?formato=json',
    { timeout: 10000 }
  );
  if (data && data[0] && parseFloat(data[0].valor) > 0) {
    const daily = parseFloat(data[0].valor) / 100;
    // Anualizar: (1 + diario)^252 - 1. 252 dias uteis por ano.
    return Math.pow(1 + daily, 252) - 1;
  }
  return null;
}

function computeRates(cdiRate) {
  // CDI e essencialmente a Selic menos um pequeno spread (~0,10 pp).
  // Spread dos cenarios e fixo: o CDI nao tem volatilidade de mercado relevante.
  // Pessimista: ciclo de cortes acelerado → CDI cai ~2 pp
  // Base: Selic mantida em 14,25% com cortes graduais
  // Otimista: choque inflacionario → CDI sobe com Selic
  return {
    pess: Math.round((cdiRate - 0.025) * 10000) / 10000,
    base: Math.round(cdiRate * 10000) / 10000,
    otim: Math.round(Math.min(cdiRate + 0.025, 0.18) * 10000) / 10000,
  };
}

async function revalidate(env) {
  let cdiRate = await fetchBrasilApi();
  if (!cdiRate) cdiRate = await fetchBcbCdi();
  if (!cdiRate) cdiRate = DEFAULTS.rate;

  const rates = computeRates(cdiRate);
  const ts = Math.floor(Date.now() / 1000);
  const cdi_rate = Math.round(cdiRate * 10000) / 10000;

  await writeCache(env.CACHE, CACHE_KEY, { rates, cdi_rate, ts }, staleTtl(CACHE_TTL));

  return { ok: true, rates, cdi_rate, generated_at: ts };
}

export async function handleCdiScenarios(env, ctx) {
  const { cached, state } = await readCacheOrRevalidate(
    env.CACHE,
    CACHE_KEY,
    CACHE_TTL,
    ctx,
    () => revalidate(env)
  );

  if (cached) {
    return jsonResponse(
      { ok: true, rates: cached.rates, cdi_rate: cached.cdi_rate, generated_at: cached.ts, source: state },
      { headers: { 'Cache-Control': 'public, max-age=7200' } }
    );
  }

  return jsonResponse(await revalidate(env), {
    headers: { 'Cache-Control': 'public, max-age=7200' },
  });
}
