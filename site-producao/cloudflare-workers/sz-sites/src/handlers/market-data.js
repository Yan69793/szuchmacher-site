import { fetchJson, jsonResponse, brtNow } from '../utils/http.js';
import { readCache, writeCache, readCacheOrRevalidate, staleTtl } from '../utils/cache.js';

const CACHE_KEY = 'market-data';
const CACHE_TTL = 600;
const SEED = {
  ibov: { value: 137000.0, change_pct: 0.0 },
  sp500: { value: 5420.0, change_pct: 0.0 },
  wti: { value: 74.0, change_pct: 0.0 },
  treasury10y: { value: 4.45, change_pct: 0.0 },
  ntnb11: { value: 95.0, change_pct: 0.0 },
};

async function fetchYahoo(encodedSymbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodedSymbol}?interval=1d&range=1d`;
  const j = await fetchJson(url, {
    timeout: 10000,
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
  if (price == null) return null;
  const change_pct = prev && prev > 0 ? Math.round(((price - prev) / prev) * 10000) / 100 : 0;
  return { value: Math.round(price * 100) / 100, change_pct };
}

function fallbackVal(live, key, prevData) {
  if (live) return live;
  if (prevData?.[key]) return prevData[key];
  return SEED[key];
}

async function revalidate(env) {
  const cache = await readCache(env.CACHE, CACHE_KEY);
  const prevData = cache?.ibov ? cache : null;
  const [ibovLive, sp500Live, wtiLive, treasuryLive, ntnbLive] = await Promise.all([
    fetchYahoo('%5EBVSP'),
    fetchYahoo('%5EGSPC'),
    fetchYahoo('CL%3DF'),
    fetchYahoo('%5ETNX'),
    fetchYahoo('NTNB11.SA'),
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

  await writeCache(env.CACHE, CACHE_KEY, payload, staleTtl(CACHE_TTL));
  return payload;
}

export async function handleMarketData(env, ctx) {
  const { cached, state } = await readCacheOrRevalidate(
    env.CACHE,
    CACHE_KEY,
    CACHE_TTL,
    ctx,
    () => revalidate(env)
  );

  if (cached) {
    const rotulo = state === 'stale' ? 'cache (revalidando)' : 'cache';
    const source = cached.stale?.length
      ? `Yahoo Finance · ${rotulo} (parcial)`
      : `Yahoo Finance · ${rotulo}`;
    return jsonResponse({ ...cached, source }, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  }

  return jsonResponse(await revalidate(env), {
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}