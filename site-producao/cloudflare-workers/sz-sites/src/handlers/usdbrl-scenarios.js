// Handler: /api/usdbrl-scenarios
// Busca cotacao USD/BRL da AwesomeAPI, calcula volatilidade implicita
// e constroi cenarios direcionais de cambio. Cache em KV por 30min.
// Diferente dos outros ativos: USD/BRL e uma aposta direcional,
// nao long-only. O investidor aposta na direcao do cambio.

import { fetchJson, jsonResponse } from '../utils/http.js';
import { readCache, writeCache } from '../utils/cache.js';

const CACHE_KEY = 'usdbrl-scenarios';
const CACHE_TTL = 1800; // 30 minutos
const DEFAULTS = { bid: 5.09, ask: 5.11, vol: 0.12 };

async function fetchAwesome() {
  const data = await fetchJson(
    'https://economia.awesomeapi.com.br/json/last/USD-BRL',
    { timeout: 8000 }
  );
  if (!data?.USDBRL) return null;

  const q = data.USDBRL;
  const bid = parseFloat(q.bid);
  const ask = parseFloat(q.ask);
  if (!bid || bid <= 0) return null;

  return {
    bid,
    ask: ask || bid,
    high: parseFloat(q.high) || bid,
    low: parseFloat(q.low) || bid,
    varBid: parseFloat(q.varBid) || 0,
    pctChange: parseFloat(q.pctChange) || 0,
  };
}

function computeRates(bid, volAnual) {
  // USD/BRL e direcional: nao existe "retorno esperado positivo" como nos outros ativos.
  // O cenario base e neutro (cambio estavel, retorno 0%). O spread dos cenarios
  // reflete a volatilidade cambial: quanto maior a vol, maior o spread.
  //
  // Pessimista: BRL deprecia (USD sobe) — investidor perde em BRL
  //   Retorno negativo proporcional a meia-volatilidade
  // Base: cambio estavel — retorno ~0%
  // Otimista: BRL aprecia (USD cai) — investidor ganha com a queda
  //   Retorno positivo proporcional a meia-volatilidade

  var halfSpread = volAnual * 1.2; // 1.2 sigma para o spread

  return {
    pess: Math.round(-halfSpread * 10000) / 10000,
    base: 0.0,
    otim: Math.round(halfSpread * 10000) / 10000,
  };
}

function computeVol(quote) {
  // Volatilidade implicita diaria a partir do range high-low
  if (!quote.high || !quote.low || !quote.bid) return DEFAULTS.vol;
  var rangePct = (quote.high - quote.low) / quote.bid;
  // Anualizar: range diario * sqrt(252)
  var annualVol = rangePct * Math.sqrt(252);
  // Clamp entre 8% e 25%
  return Math.max(0.08, Math.min(0.25, annualVol));
}

export async function handleUsdbrlScenarios(env) {
  // Tenta cache primeiro
  var cache = await readCache(env.CACHE, CACHE_KEY);
  if (cache?.ts && Date.now() / 1000 - cache.ts < CACHE_TTL) {
    return jsonResponse(
      {
        ok: true,
        rates: cache.rates,
        usdbrl_bid: cache.usdbrl_bid,
        usdbrl_vol: cache.usdbrl_vol,
        generated_at: cache.ts,
        source: 'cache',
      },
      { headers: { 'Cache-Control': 'public, max-age=900' } }
    );
  }

  var quote = await fetchAwesome();
  var source = 'live';

  if (!quote) {
    // Fallback para cache stale se existir
    if (cache) {
      source = 'stale';
      return jsonResponse(
        {
          ok: true,
          rates: cache.rates,
          usdbrl_bid: cache.usdbrl_bid,
          usdbrl_vol: cache.usdbrl_vol,
          generated_at: cache.ts,
          source: 'stale',
        },
        { headers: { 'Cache-Control': 'public, max-age=300' } }
      );
    }
    // Sem cache, usa defaults
    quote = { bid: DEFAULTS.bid, ask: DEFAULTS.ask };
    source = 'defaults';
  }

  var vol = computeVol(quote);
  var rates = computeRates(quote.bid, vol);

  var payload = {
    ok: true,
    rates,
    usdbrl_bid: quote.bid,
    usdbrl_vol: vol,
    generated_at: Math.floor(Date.now() / 1000),
    source,
  };

  await writeCache(env.CACHE, CACHE_KEY, {
    rates,
    usdbrl_bid: payload.usdbrl_bid,
    usdbrl_vol: payload.usdbrl_vol,
    ts: Math.floor(Date.now() / 1000),
  }, CACHE_TTL);

  return jsonResponse(payload, {
    headers: { 'Cache-Control': 'public, max-age=900' },
  });
}
