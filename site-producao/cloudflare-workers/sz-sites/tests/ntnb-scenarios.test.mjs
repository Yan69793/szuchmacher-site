import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleNtnbScenarios } from '../src/handlers/ntnb-scenarios.js';

const realFetch = globalThis.fetch;

function jsonRes(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeEnv() {
  const store = new Map();
  return {
    CACHE: {
      async get(key) { return store.get(key) ?? null; },
      async put(key, value) { store.set(key, value); },
    },
    _store: store,
  };
}

function yahooImaB(price, staleTs = false) {
  const ts = staleTs
    ? Math.floor(Date.now() / 1000) - 3 * 24 * 3600
    : Math.floor(Date.now() / 1000) - 3600;
  return jsonRes({
    chart: {
      result: [{
        meta: { regularMarketPrice: price, currency: 'BRL', exchangeName: 'B3' },
        timestamp: [ts],
      }],
    },
  });
}

afterEach(() => { globalThis.fetch = realFetch; });

test('fonte morta: defaults honestos com warning e stale true', async () => {
  globalThis.fetch = async () => jsonRes({}, 500);
  const env = makeEnv();
  const r = await handleNtnbScenarios(env, undefined);
  const body = await r.json();
  assert.equal(r.status, 200);
  assert.equal(body.source, 'defaults');
  assert.equal(body.stale, true);
  assert.ok(body.warning, 'warning obrigatorio quando os cenarios vem de premissas fixas');
  assert.equal(body.ntnb_price, 95.0);
});

test('IB5M11 vivo: source yahoo, sem warning, preco do meta', async () => {
  globalThis.fetch = async (url) => {
    assert.ok(String(url).includes('IB5M11.SA'), 'fonte deve ser o ETF IB5M11 (IMA-B 5+)');
    return yahooImaB(68.5);
  };
  const env = makeEnv();
  const r = await handleNtnbScenarios(env, undefined);
  const body = await r.json();
  assert.equal(body.source, 'yahoo');
  assert.equal(body.stale, false);
  assert.equal(body.warning, null);
  assert.equal(body.ntnb_price, 68.5);
});

test('hit de cache NAO apaga a origem real: defaults continuam defaults', async () => {
  const env = makeEnv();
  await env.CACHE.put('ntnb-scenarios', JSON.stringify({
    rates: { pess: 0.1, base: 0.13, otim: 0.16 },
    ntnb_price: 95.0,
    ipca_spread: 0.075,
    ts: Math.floor(Date.now() / 1000),
    source: 'defaults',
    warning: 'aviso de defaults',
  }));
  const r = await handleNtnbScenarios(env, undefined);
  const body = await r.json();
  assert.equal(body.source, 'defaults', 'origem real preservada no cache hit');
  assert.equal(body.stale, true);
  assert.equal(body.warning, 'aviso de defaults');
  assert.equal(body.cache_state, 'cache');
});

test('cache legacy sem source (era pre-contrato) mapeia para defaults com stale true', async () => {
  const env = makeEnv();
  await env.CACHE.put('ntnb-scenarios', JSON.stringify({
    rates: { pess: 0.1, base: 0.13, otim: 0.16 },
    ntnb_price: 95.0,
    ipca_spread: 0.075,
    ts: Math.floor(Date.now() / 1000),
  }));
  const r = await handleNtnbScenarios(env, undefined);
  const body = await r.json();
  assert.equal(body.source, 'defaults', 'payload antigo era da era defaults (NTNB11.SA nunca existiu)');
  assert.equal(body.stale, true, 'legacy nao pode passar 12h como fonte viva');
});

test('cache de fonte viva devolve source yahoo e stale false', async () => {
  const env = makeEnv();
  await env.CACHE.put('ntnb-scenarios', JSON.stringify({
    rates: { pess: 0.1, base: 0.13, otim: 0.16 },
    ntnb_price: 68.5,
    ipca_spread: 0.075,
    ts: Math.floor(Date.now() / 1000),
    source: 'yahoo',
    warning: null,
  }));
  const r = await handleNtnbScenarios(env, undefined);
  const body = await r.json();
  assert.equal(body.source, 'yahoo');
  assert.equal(body.stale, false);
  assert.equal(body.warning, null);
});
