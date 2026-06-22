import { fetchJson, jsonResponse, brtNow } from '../utils/http.js';
import { readCache, writeCache } from '../utils/cache.js';

const CACHE_KEY = 'prices';
const CACHE_TTL = 900;
const SEED = { gold: 4220.0, silver: 68.0, platinum: 1726.0, bitcoin: 63762.0 };

async function fromGoldApi(sym) {
  const j = await fetchJson(`https://api.gold-api.com/price/${sym}`, { timeout: 8000 });
  return j?.price != null && !Number.isNaN(Number(j.price)) ? Number(j.price) : null;
}

async function fromAwesome(pair) {
  const j = await fetchJson(`https://economia.awesomeapi.com.br/json/last/${pair}`, { timeout: 8000 });
  if (!j) return null;
  const key = pair.replace('-', '');
  const bid = j[key]?.bid;
  return bid != null && !Number.isNaN(Number(bid)) ? Number(bid) : null;
}

export async function handlePrices(env) {
  const cache = await readCache(env.CACHE, CACHE_KEY);
  if (cache?.ts && Date.now() / 1000 - cache.ts < CACHE_TTL) {
    return jsonResponse({ ...cache, source_state: 'cache' }, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  }

  const prev = cache?._raw ?? SEED;
  let gold = await fromGoldApi('XAU');
  if (gold == null) gold = await fromAwesome('XAU-USD');
  let silver = await fromGoldApi('XAG');
  if (silver == null) silver = await fromAwesome('XAG-USD');
  const platinum = await fromGoldApi('XPT');
  let bitcoin = await fromGoldApi('BTC');
  if (bitcoin == null) bitcoin = await fromAwesome('BTC-USD');

  const fontes = [];
  if ([gold, silver, platinum, bitcoin].some((v) => v != null)) fontes.push('gold-api.com');

  const vals = { gold, silver, platinum, bitcoin };
  let stale = false;
  for (const k of Object.keys(vals)) {
    if (vals[k] == null) {
      vals[k] = prev[k] ?? SEED[k];
      stale = true;
    }
  }

  const raw = {
    gold: Math.round(vals.gold * 100) / 100,
    silver: Math.round(vals.silver * 100) / 100,
    platinum: Math.round(vals.platinum * 100) / 100,
    bitcoin: Math.round(vals.bitcoin * 100) / 100,
  };

  const payload = {
    ok: true,
    gold: raw.gold,
    silver: raw.silver,
    platinum: raw.platinum,
    bitcoin: raw.bitcoin,
    sources: fontes.length ? fontes : ['cache/seed'],
    stale,
    generated_at: brtNow(),
    ts: Math.floor(Date.now() / 1000),
    _raw: raw,
  };

  await writeCache(env.CACHE, CACHE_KEY, payload, CACHE_TTL * 2);

  if (stale && cache && !fontes.length) {
    return jsonResponse({ ...cache, ok: true, source_state: 'stale-cache' }, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  }

  return jsonResponse(payload, { headers: { 'Cache-Control': 'public, max-age=300' } });
}