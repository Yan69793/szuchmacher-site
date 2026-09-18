// Handler: /api/usdbrl-scenarios
// Cotacao primaria AwesomeAPI, com procedencia e idade separadas do estado do KV.

import { fetchJson, jsonResponse } from '../utils/http.js';
import { readCache, writeCache, readCacheOrRevalidate, staleTtl } from '../utils/cache.js';

const CACHE_KEY = 'usdbrl-scenarios';
const CACHE_TTL = 1800;
const DEFAULTS = { bid: 5.09, ask: 5.11, vol: 0.12 };
const SOURCES = new Set(['awesomeapi', 'bcb_ptax', 'defaults']);

function nowSeconds() { return Math.floor(Date.now() / 1000); }

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function validSource(source) { return SOURCES.has(source); }

export function validCache(cache) {
  return Boolean(cache && validSource(cache.source) && finitePositive(cache.usdbrl_bid)
    && cache.rates && Number.isFinite(Number(cache.rates.pess))
    && Number.isFinite(Number(cache.rates.base)) && Number.isFinite(Number(cache.rates.otim))
    && finitePositive(cache.quote_at));
}

export function responseFromCache(cache, cacheState, warning = null) {
  const fallback = cache.source !== 'awesomeapi' || cacheState !== 'fresh';
  return {
    ok: true,
    rates: cache.rates,
    usdbrl_bid: cache.usdbrl_bid,
    usdbrl_vol: cache.usdbrl_vol,
    generated_at: cache.quote_at,
    quote_at: cache.quote_at,
    fetched_at: cache.fetched_at ?? cache.ts ?? cache.quote_at,
    source: cache.source,
    served_from: 'kv',
    cache_state: cacheState,
    stale: fallback,
    warning: warning ?? cache.warning ?? (fallback ? 'upstream_unavailable' : null),
  };
}

async function fetchAwesome() {
  const data = await fetchJson('https://economia.awesomeapi.com.br/json/last/USD-BRL', { timeout: 8000 });
  const quote = data?.USDBRL;
  const bid = finitePositive(quote?.bid);
  if (!bid) return null;
  return {
    bid,
    ask: finitePositive(quote.ask) ?? bid,
    high: finitePositive(quote.high) ?? bid,
    low: finitePositive(quote.low) ?? bid,
    quoteAt: finitePositive(quote.timestamp),
  };
}

function bcbDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).reduce((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.month}-${parts.day}-${parts.year}`;
}

async function fetchBcbPtax() {
  let date = new Date();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const dataCotacao = bcbDateParts(date);
    const url = 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/'
      + `CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${dataCotacao}'&$top=1&$format=json`;
    const data = await fetchJson(url, { timeout: 8000 });
    const row = data?.value?.[0];
    const bid = finitePositive(row?.cotacaoCompra);
    const ask = finitePositive(row?.cotacaoVenda);
    if (bid && ask) {
      const quoteAt = Date.parse(row.dataHoraCotacao) / 1000;
      return { bid, ask, high: bid, low: bid, quoteAt: Number.isFinite(quoteAt) ? quoteAt : nowSeconds() };
    }
    date = new Date(date.getTime() - 86400000);
  }
  return null;
}

export function computeRates(bid, volAnual) {
  const halfSpread = volAnual * 1.2;
  return {
    pess: Math.round(-halfSpread * 10000) / 10000,
    base: 0.0,
    otim: Math.round(halfSpread * 10000) / 10000,
  };
}

function computeVol(quote) {
  if (!quote.high || !quote.low || !quote.bid) return DEFAULTS.vol;
  const rangePct = (quote.high - quote.low) / quote.bid;
  return Math.max(0.08, Math.min(0.25, rangePct * Math.sqrt(252)));
}

async function revalidate(env) {
  let quote = await fetchAwesome();
  let source = 'awesomeapi';
  let warning = null;

  if (!quote) {
    const cache = await readCache(env.CACHE, CACHE_KEY);
    if (validCache(cache)) return responseFromCache(cache, 'stale', 'upstream_unavailable');
    quote = await fetchBcbPtax();
    source = quote ? 'bcb_ptax' : 'defaults';
    warning = quote ? 'daily_reference' : 'no_upstream_data';
    quote ??= { bid: DEFAULTS.bid, ask: DEFAULTS.ask, high: DEFAULTS.bid, low: DEFAULTS.bid };
  }

  const fetchedAt = nowSeconds();
  const quoteAt = quote.quoteAt ?? fetchedAt;
  const vol = computeVol(quote);
  const payload = {
    rates: computeRates(quote.bid, vol), usdbrl_bid: quote.bid, usdbrl_vol: vol,
    quote_at: quoteAt, fetched_at: fetchedAt, source, served_from: 'upstream',
    cache_state: source === 'awesomeapi' ? 'fresh' : 'fallback', stale: source !== 'awesomeapi',
    warning, ts: fetchedAt,
  };
  await writeCache(env.CACHE, CACHE_KEY, payload, staleTtl(CACHE_TTL));
  return { ...responseFromCache(payload, payload.cache_state, warning), served_from: 'upstream' };
}

export async function handleUsdbrlScenarios(env, ctx) {
  const res = await readCacheOrRevalidate(env.CACHE, CACHE_KEY, CACHE_TTL, ctx, () => revalidate(env));
  if (res.cached && validCache(res.cached)) {
    const cacheState = res.state === 'cache' ? 'fresh' : res.state;
    return jsonResponse(responseFromCache(res.cached, cacheState), { headers: { 'Cache-Control': 'public, max-age=900' } });
  }
  return jsonResponse(await revalidate(env), { headers: { 'Cache-Control': 'public, max-age=900' } });
}
