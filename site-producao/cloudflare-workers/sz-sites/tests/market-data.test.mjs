import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleMarketData } from '../src/handlers/market-data.js';
import { fetchJsonStrict } from '../src/utils/http.js';

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

// Yahoo v8 com meta valido
function yahooChart(price, prevClose = null) {
  return jsonRes({
    chart: {
      result: [{
        meta: {
          regularMarketPrice: price,
          chartPreviousClose: prevClose,
          currency: 'BRL',
          exchangeName: 'B3',
        },
        timestamp: [Math.floor(Date.now() / 1000) - 3600],
      }],
    },
  });
}

afterEach(() => { globalThis.fetch = realFetch; });

test('todas as fontes mortas: rotulo honesto, stale completo e health persistido', async () => {
  globalThis.fetch = async () => jsonRes({}, 500);
  const env = makeEnv();
  const r = await handleMarketData(env, undefined);
  const body = await r.json();
  assert.equal(r.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.source, 'fontes indisponíveis (cache/seed)');
  assert.deepEqual(body.stale, ['ibov', 'sp500', 'wti', 'treasury10y', 'ntnb11']);
  assert.equal(body.ibov.value, 137000.0, 'cai no SEED');
  assert.equal(body.ntnb11.value, 95.0, 'cai no SEED');
  assert.equal(body.source_health.ibov.ok, false);
  assert.equal(body.source_health.ibov.status, 500);
  const health = JSON.parse(await env.CACHE.get('market-data-sources-health'));
  assert.equal(health.sources.ntnb11.ok, false);
});

test('fonte unica sem dados (200 com result vazio, caso NTNB11) cai no fallback e marca health', async () => {
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('IB5M11.SA')) return jsonRes({ chart: { result: [] } });
    return yahooChart(100);
  };
  const env = makeEnv();
  const r = await handleMarketData(env, undefined);
  const body = await r.json();
  assert.equal(body.source, 'Yahoo Finance · parcial');
  assert.deepEqual(body.stale, ['ntnb11']);
  assert.equal(body.ntnb11.value, 95.0);
  assert.equal(body.source_health.ntnb11.ok, false);
  assert.equal(body.source_health.ntnb11.status, 200, '200 vazio: fonte existe, simbolo nao');
  assert.equal(body.source_health.ibov.ok, true);
});

test('hit de cache preserva rotulo de parcial', async () => {
  const env = makeEnv();
  await env.CACHE.put('market-data', JSON.stringify({
    ok: true,
    ibov: { value: 1 },
    sp500: { value: 2 },
    wti: { value: 3 },
    treasury10y: { value: 4 },
    ntnb11: { value: 95 },
    stale: ['ntnb11'],
    ts: Math.floor(Date.now() / 1000),
  }));
  const r = await handleMarketData(env, undefined);
  const body = await r.json();
  assert.equal(r.status, 200);
  assert.ok(body.source.includes('(parcial)'), `rotulo de parcial no cache: ${body.source}`);
});

test('todas as fontes vivas: ao vivo e health ok', async () => {
  globalThis.fetch = async () => yahooChart(100, 99);
  const env = makeEnv();
  const r = await handleMarketData(env, undefined);
  const body = await r.json();
  assert.equal(body.source, 'Yahoo Finance · ao vivo');
  assert.deepEqual(body.stale, []);
  assert.equal(body.source_health.ntnb11.ok, true);
});

test('fetchJsonStrict: 200 com corpo nao-JSON preserva o status real na telemetria', async () => {
  globalThis.fetch = async () => new Response('<html>WAF error</html>', {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  });
  const r = await fetchJsonStrict('https://fonte.exemplo/api', { timeout: 2000 });
  assert.equal(r.ok, false);
  assert.equal(r.status, 200, 'status 0 esconderia que a fonte respondeu, mas com corpo errado');
  assert.match(r.error, /nao-JSON/);
});
