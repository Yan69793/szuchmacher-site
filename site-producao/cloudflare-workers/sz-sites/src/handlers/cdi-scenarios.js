// Handler: /api/cdi-scenarios
// Busca a taxa CDI da BrasilAPI (fallback BCB SGS 12), computa cenarios
// de renda fixa e retorna apenas os numeros finais. Cache em KV por 4h.
// CDI e risk-free: spread entre cenarios e fixo e pequeno.

import { jsonResponse } from '../utils/http.js';
import { writeCache, readCacheOrRevalidate, staleTtl } from '../utils/cache.js';

// Limite inclui leitura do corpo. Uma repeticao apenas para GET transitorio.
async function fetchScenarioJson(url, options = {}) {
  const timeout = options.timeout ?? 10000;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    let timer, status = 0, retryAfter = 0;
    try {
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, timeout);
      });
      const result = await Promise.race([deadline, (async () => {
        const res = await fetch(url, { headers: options.headers, signal: controller.signal });
        status = res.status;
        if (!res.ok) {
          const raw = res.headers.get('Retry-After');
          if (raw) retryAfter = /^\d+$/.test(raw) ? Number(raw) * 1000 : Math.max(0, Date.parse(raw) - Date.now());
          return { ok: false, status, data: null, error: 'HTTP ' + status };
        }
        return { ok: true, status, data: await res.json(), error: null };
      })()]);
      if (result.ok || attempt || !(status === 429 || status >= 500) || retryAfter > 2000) return result;
    } catch (error) {
      if (attempt || error instanceof SyntaxError) return { ok: false, status, data: null, error: error.message };
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
    await new Promise(resolve => setTimeout(resolve, Math.max(retryAfter || 0, 250 + Math.random() * 250)));
  }
}

const CACHE_KEY = 'cdi-scenarios';
const CACHE_TTL = 14400; // 4 horas
const DEFAULTS = { rate: 0.1425 }; // fallback ~14,25% a.a.

async function fetchBrasilApi() {
  const { data } = await fetchScenarioJson('https://brasilapi.com.br/api/taxas/v1', { timeout: 10000 });
  if (!data || !Array.isArray(data)) return null;
  const cdi = data.find(function(t) { return /^cdi$/i.test(t.nome); });
  if (cdi && cdi.valor != null && cdi.valor !== '' && Number.isFinite(Number(cdi.valor)) && Number(cdi.valor) >= 0) return Number(cdi.valor) / 100;
  return null;
}

async function fetchBcbCdi() {
  // BCB SGS serie 12: taxa CDI diaria (Over/Selic)
  const { data } = await fetchScenarioJson(
    'https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados/ultimos/1?formato=json',
    { timeout: 10000 }
  );
  if (data && data[0] && data[0].valor != null && data[0].valor !== '' && Number.isFinite(Number(data[0].valor)) && Number(data[0].valor) >= 0) {
    const daily = Number(data[0].valor) / 100;
    // Anualizar: (1 + diario)^252 - 1. 252 dias uteis por ano.
    return Math.pow(1 + daily, 252) - 1;
  }
  return null;
}

// Semantica dos cenarios (fechamento P1.4, 08/09/2026): pessimista macro =
// juros altos em renda fixa. Antes este handler invertia: pess = corte de
// juros, otim = choque, e o front reaplicava os numeros sobre os cards,
// deixando a narrativa "Selic ate 17%" com +11%. A direcao foi trocada para
// casar com o literal curado do motor (cdi pess 0.165/base 0.1425/otim 0.12)
// e com os textos estaticos do multiasset-app.html.
export function computeRates(cdiRate) {
  if (!Number.isFinite(cdiRate) || cdiRate < 0) throw new RangeError('CDI invalido');
  // CDI e essencialmente a Selic menos um pequeno spread (~0,10 pp).
  // Spread dos cenarios e fixo: o CDI nao tem volatilidade de mercado relevante.
  // Pessimista: choque inflacionario → CDI sobe com a Selic (~2 pp acima)
  // Base: Selic mantida com cortes graduais
  // Otimista: ciclo de cortes acelerado → CDI cai ~2 pp
  return {
    pess: Math.round((cdiRate + 0.025) * 10000) / 10000,
    base: Math.round(cdiRate * 10000) / 10000,
    otim: Math.round((cdiRate - 0.025) * 10000) / 10000,
  };
}

async function revalidate(env) {
  let cdiRate = await fetchBrasilApi();
  let source = 'brasilapi';
  if (cdiRate == null) { cdiRate = await fetchBcbCdi(); source = 'bcb'; }
  if (cdiRate == null) { cdiRate = DEFAULTS.rate; source = 'defaults'; }

  const rates = computeRates(cdiRate);
  const ts = Math.floor(Date.now() / 1000);
  const cdi_rate = Math.round(cdiRate * 10000) / 10000;

  await writeCache(env.CACHE, CACHE_KEY, { rates, cdi_rate, ts, source }, staleTtl(CACHE_TTL));

  return { ok: true, rates, cdi_rate, generated_at: ts, source, stale: source === 'defaults' };
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
      { ok: true, rates: computeRates(Number.isFinite(cached.cdi_rate) && cached.cdi_rate >= 0 ? cached.cdi_rate : DEFAULTS.rate), cdi_rate: cached.cdi_rate, generated_at: cached.ts, source: cached.source ?? 'unknown', cache_state: state, stale: state === 'stale' || !cached.source || cached.source === 'defaults' },
      { headers: { 'Cache-Control': 'public, max-age=7200' } }
    );
  }

  return jsonResponse(await revalidate(env), {
    headers: { 'Cache-Control': 'public, max-age=7200' },
  });
}
