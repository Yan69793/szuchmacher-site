import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleUsdbrlScenarios, responseFromCache, validCache } from '../src/handlers/usdbrl-scenarios.js';

const realFetch = globalThis.fetch;

function jsonRes(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeEnv(seed = null) {
  const store = new Map(seed ? [['usdbrl-scenarios', JSON.stringify(seed)]] : []);
  return {
    CACHE: {
      async get(key) { return store.get(key) ?? null; },
      async put(key, value) { store.set(key, value); },
    },
    _store: store,
  };
}

function liveCache(overrides = {}) {
  return {
    rates: { pess: -0.144, base: 0, otim: 0.144 },
    usdbrl_bid: 5.1262,
    usdbrl_vol: 0.12,
    quote_at: 1789165806,
    fetched_at: 1789195854,
    source: 'awesomeapi',
    served_from: 'upstream',
    cache_state: 'fresh',
    stale: false,
    warning: null,
    ts: Math.floor(Date.now() / 1000) - 60,
    ...overrides,
  };
}

afterEach(() => { globalThis.fetch = realFetch; });

test('AwesomeAPI valida preserva origem, quote_at e estado fresco', async () => {
  globalThis.fetch = async (url) => {
    assert.equal(String(url), 'https://economia.awesomeapi.com.br/json/last/USD-BRL');
    return jsonRes({ USDBRL: { bid: '5.1262', ask: '5.1266', high: '5.1315', low: '5.0711', timestamp: '1789165806' } });
  };
  const env = makeEnv();
  const body = await (await handleUsdbrlScenarios(env)).json();
  assert.equal(body.source, 'awesomeapi');
  assert.equal(body.served_from, 'upstream');
  assert.equal(body.cache_state, 'fresh');
  assert.equal(body.stale, false);
  assert.equal(body.quote_at, 1789165806);
  assert.equal(body.warning, null);
  assert.equal(validCache(JSON.parse(env._store.get('usdbrl-scenarios'))), true);
});

test('cache fresco preserva source upstream e informa served_from KV', async () => {
  const env = makeEnv(liveCache());
  const body = await (await handleUsdbrlScenarios(env, { waitUntil() { throw new Error('nao deveria revalidar'); } })).json();
  assert.equal(body.source, 'awesomeapi');
  assert.equal(body.served_from, 'kv');
  assert.equal(body.cache_state, 'fresh');
  assert.equal(body.stale, false);
});

test('cache vencido preserva origem e quote_at sem reestampar a cotacao', async () => {
  globalThis.fetch = async () => null;
  const env = makeEnv(liveCache({ ts: Math.floor(Date.now() / 1000) - 4000 }));
  const body = await (await handleUsdbrlScenarios(env, { waitUntil(task) { task; } })).json();
  assert.equal(body.source, 'awesomeapi');
  assert.equal(body.served_from, 'kv');
  assert.equal(body.cache_state, 'stale');
  assert.equal(body.stale, true);
  assert.equal(body.quote_at, 1789165806);
  assert.equal(body.warning, 'upstream_unavailable');
});

test('cache sem procedencia nao e tratado como cotacao valida', async () => {
  globalThis.fetch = async () => null;
  const env = makeEnv({
    rates: { pess: -0.1, base: 0, otim: 0.1 }, usdbrl_bid: 5.09,
    quote_at: 1789165806, ts: Math.floor(Date.now() / 1000),
  });
  const body = await (await handleUsdbrlScenarios(env)).json();
  assert.equal(body.source, 'defaults');
  assert.equal(body.cache_state, 'fallback');
  assert.equal(body.stale, true);
  assert.equal(body.warning, 'no_upstream_data');
});

test('responseFromCache nao confunde source com estado de armazenamento', () => {
  const body = responseFromCache(liveCache(), 'stale', 'upstream_unavailable');
  assert.deepEqual({ source: body.source, served_from: body.served_from, cache_state: body.cache_state }, {
    source: 'awesomeapi', served_from: 'kv', cache_state: 'stale',
  });
});
