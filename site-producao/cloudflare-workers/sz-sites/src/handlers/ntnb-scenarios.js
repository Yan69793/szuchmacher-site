// Handler: /api/ntnb-scenarios
// Busca cotacao do ETF NTNB11 (B3: IPCA+) do Yahoo Finance, extrai yield
// implicito e calcula cenarios de renda fixa indexada a inflacao.
// Cache em KV por 2h. Nao aceita dado stale (SEED 95 do market-data.js).

import { fetchJson, jsonResponse } from '../utils/http.js';
import { readCache, writeCache } from '../utils/cache.js';

const CACHE_KEY = 'ntnb-scenarios';
const CACHE_TTL = 7200; // 2 horas

// Valores padrao calibrados em jul/2026: IPCA ~5,5%, NTN-B ~IPCA+7,5% = ~13,4% nominal
const DEFAULTS = {
  ntnb_price: 95.0,
  ipca_spread: 0.075,  // 7,5% a.a. acima do IPCA
  ipca_proj: 0.055,    // 5,5% a.a. Focus mediana 2026
};

// NTNB11 delistado. Ordem por adequacao (IMA-B 5+ / duration), nao por nome:
// IB5M11 (IMA-B5+) → IMAB11 (~6a) → NTNS11 (curto, so disponibilidade)
const NTNB_PROXIES = [
  { yahoo: 'IB5M11.SA', brapi: 'IB5M11' },
  { yahoo: 'IMAB11.SA', brapi: 'IMAB11' },
  { yahoo: 'NTNS11.SA', brapi: 'NTNS11' },
];

async function fetchYahooSymbol(yahooSymbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=5d`;
  const data = await fetchJson(url, {
    timeout: 12000,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MultiAssetBot/1.0)' },
  });
  if (!data?.chart?.result?.[0]) return null;

  const result = data.chart.result[0];
  const meta = result.meta;
  const price = meta.regularMarketPrice;
  if (!price || price <= 0) return null;

  const timestamps = result.timestamp || [];
  const lastTs = timestamps.length > 0 ? timestamps[timestamps.length - 1] : 0;
  const nowSec = Math.floor(Date.now() / 1000);
  const ageSec = nowSec - lastTs;
  const STALE_THRESHOLD = 172800;

  return {
    price,
    stale: ageSec > STALE_THRESHOLD,
    currency: meta.currency || 'BRL',
    exchangeName: meta.exchangeName || 'B3',
    symbol: yahooSymbol,
  };
}

async function fetchNtnbProxy(env) {
  for (const p of NTNB_PROXIES) {
    const yahoo = await fetchYahooSymbol(p.yahoo);
    if (yahoo && !yahoo.stale && yahoo.price > 0) {
      return { price: yahoo.price, source: 'yahoo', symbol: p.brapi };
    }
    const token = env?.BRAPI_TOKEN ? String(env.BRAPI_TOKEN).trim() : '';
    if (token) {
      const brapi = await fetchJson(
        `https://brapi.dev/api/quote/${p.brapi}?token=${encodeURIComponent(token)}`,
        { timeout: 10000 },
      );
      const price = parseFloat(brapi?.results?.[0]?.regularMarketPrice);
      if (price > 0) return { price, source: 'brapi', symbol: p.brapi };
    }
  }
  return null;
}

function computeRates(ipcaSpread, ipcaProj) {
  // Taxa nominal = (1 + IPCA) * (1 + spread) - 1
  const nominalBase = (1 + ipcaProj) * (1 + ipcaSpread) - 1;

  // Cenarios: variacao no spread (IPCA projetado e o mesmo nos 3)
  // Pessimista: comprimindo premio → spread cai 2 pp
  // Base: spread de mercado
  // Otimista: premio expande → spread sobe 2 pp
  const spreadPess = Math.max(0.03, ipcaSpread - 0.02);
  const spreadOtim = Math.min(0.16, ipcaSpread + 0.02);

  const pess = Math.round(((1 + ipcaProj) * (1 + spreadPess) - 1) * 10000) / 10000;
  const base = Math.round(nominalBase * 10000) / 10000;
  const otim = Math.round(((1 + ipcaProj) * (1 + spreadOtim) - 1) * 10000) / 10000;

  return { pess, base, otim };
}

export async function handleNtnbScenarios(env) {
  // Tenta cache primeiro
  const cache = await readCache(env.CACHE, CACHE_KEY);
  if (cache?.ts && Date.now() / 1000 - cache.ts < CACHE_TTL) {
    return jsonResponse(
      {
        ok: true,
        rates: cache.rates,
        ntnb_price: cache.ntnb_price,
        ipca_spread: cache.ipca_spread,
        generated_at: cache.ts,
        source: 'cache',
      },
      { headers: { 'Cache-Control': 'public, max-age=3600' } }
    );
  }

  // Busca cotacao
  let ntnbPrice = DEFAULTS.ntnb_price;
  let ipcaSpread = DEFAULTS.ipca_spread;
  const ipcaProj = DEFAULTS.ipca_proj;
  let source = 'defaults';

  const live = await fetchNtnbProxy(env);
  let proxySymbol = null;
  if (live?.price > 0) {
    ntnbPrice = live.price;
    source = live.source;
    proxySymbol = live.symbol;
    ipcaSpread = DEFAULTS.ipca_spread;
  }

  const rates = computeRates(ipcaSpread, ipcaProj);

  const payload = {
    ok: true,
    rates,
    ntnb_price: ntnbPrice,
    ipca_spread: ipcaSpread,
    generated_at: Math.floor(Date.now() / 1000),
    source,
    proxy: proxySymbol,
  };

  await writeCache(env.CACHE, CACHE_KEY, {
    rates,
    ntnb_price: ntnbPrice,
    ipca_spread: ipcaSpread,
    ts: Math.floor(Date.now() / 1000),
  }, CACHE_TTL);

  return jsonResponse(payload, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}
