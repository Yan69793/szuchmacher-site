import { fetchJson, jsonResponse, brtNow } from '../utils/http.js';
import { readCache, writeCache } from '../utils/cache.js';

const CACHE_KEY = 'market-data';
const CACHE_TTL = 600;
const SEED = {
  ibov: { value: 137000.0, change_pct: 0.0 },
  sp500: { value: 5420.0, change_pct: 0.0 },
  wti: { value: 74.0, change_pct: 0.0 },
  treasury10y: { value: 4.45, change_pct: 0.0 },
  ntnb11: { value: 95.0, change_pct: 0.0 },
};

async function fetchYahoo(encodedSymbol, { range = '1d' } = {}) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodedSymbol}?interval=1d&range=${range}`;
  const j = await fetchJson(url, {
    timeout: 12000,
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (compatible; MultiAssetBot/1.0)',
    },
  });
  const meta = j?.chart?.result?.[0]?.meta;
  if (!meta) return null;
  const price = meta.regularMarketPrice != null ? Number(meta.regularMarketPrice) : null;
  const prev = meta.chartPreviousClose != null ? Number(meta.chartPreviousClose) : null;
  if (price == null || !(price > 0)) return null;
  const change_pct = prev && prev > 0 ? Math.round(((price - prev) / prev) * 10000) / 100 : 0;
  return { value: Math.round(price * 100) / 100, change_pct };
}

/** Fallback server-side NTNB11: brapi so com token (evita 401 publico no edge). */
async function fetchBrapiNtnb(env) {
  const token = env?.BRAPI_TOKEN ? String(env.BRAPI_TOKEN).trim() : '';
  if (!token) return null;
  const url = `https://brapi.dev/api/quote/NTNB11?token=${encodeURIComponent(token)}`;
  const j = await fetchJson(url, { timeout: 10000 });
  const p = j?.results?.[0]?.regularMarketPrice;
  const ch = j?.results?.[0]?.regularMarketChangePercent;
  if (!(p > 0)) return null;
  return {
    value: Math.round(Number(p) * 100) / 100,
    change_pct: ch != null ? Math.round(Number(ch) * 100) / 100 : 0,
  };
}

function fallbackVal(live, key, prevData) {
  if (live) return live;
  if (prevData?.[key]) return prevData[key];
  return SEED[key];
}

export async function handleMarketData(env) {
  const cache = await readCache(env.CACHE, CACHE_KEY);
  if (cache?.ts && Date.now() / 1000 - cache.ts < CACHE_TTL) {
    const cacheSource = cache.stale?.length ? 'Yahoo Finance · cache (parcial)' : 'Yahoo Finance · cache';
    return jsonResponse({ ...cache, source: cacheSource }, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  }

  const prevData = cache?.ibov ? cache : null;
  // NTNB11: range=5d (mais robusto que 1d em feriado/B3); brapi so com BRAPI_TOKEN.
  let ntnbLive = await fetchYahoo('NTNB11.SA', { range: '5d' });
  if (!ntnbLive) ntnbLive = await fetchBrapiNtnb(env);

  const [ibovLive, sp500Live, wtiLive, treasuryLive] = await Promise.all([
    fetchYahoo('%5EBVSP'),
    fetchYahoo('%5EGSPC'),
    fetchYahoo('CL%3DF'),
    fetchYahoo('%5ETNX'),
  ]);

  const ibov = fallbackVal(ibovLive, 'ibov', prevData);
  const sp500 = fallbackVal(sp500Live, 'sp500', prevData);
  const wti = fallbackVal(wtiLive, 'wti', prevData);
  const treasury10y = fallbackVal(treasuryLive, 'treasury10y', prevData);
  const ntnb11 = fallbackVal(ntnbLive, 'ntnb11', prevData);

  // stale lista quais ativos vieram do fallback (cache anterior ou SEED) em vez
  // de fetch ao vivo bem-sucedido — sem isso, 'source' mentia 'ao vivo' mesmo
  // quando um ou mais ativos vinham do SEED hardcoded de 15/06/2026.
  const stale = [];
  if (!ibovLive) stale.push('ibov');
  if (!sp500Live) stale.push('sp500');
  if (!wtiLive) stale.push('wti');
  if (!treasuryLive) stale.push('treasury10y');
  if (!ntnbLive) stale.push('ntnb11');

  const payload = {
    ok: true,
    ibov,
    sp500,
    wti,
    treasury10y,
    ntnb11,
    updated_at: brtNow(),
    source: stale.length === 0 ? 'Yahoo Finance · ao vivo' : 'Yahoo Finance · parcial',
    stale,
    ts: Math.floor(Date.now() / 1000),
  };

  await writeCache(env.CACHE, CACHE_KEY, payload, CACHE_TTL * 2);
  return jsonResponse(payload, { headers: { 'Cache-Control': 'public, max-age=300' } });
}