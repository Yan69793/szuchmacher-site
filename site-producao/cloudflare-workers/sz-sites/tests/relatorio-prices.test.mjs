import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { SEED, yahooClose, awesomeUsdbrl, completar, publico, handleRelatorioPrices } from '../src/handlers/relatorio-prices.js';

const realFetch = globalThis.fetch;
let jobs = [];

beforeEach(() => {
  jobs = [];
  // Todas as fontes falham (429): o fluxo de "tudo defasado" e exercitado.
  globalThis.fetch = async () => new Response('upstream indisponivel', { status: 429 });
});
afterEach(() => { globalThis.fetch = realFetch; });

function makeEnv(initialCache) {
  const store = new Map();
  if (initialCache) store.set('relatorio-prices', JSON.stringify(initialCache));
  return {
    CACHE: {
      async get(key) { return store.get(key) ?? null; },
      async put(key, value) { store.set(key, value); },
    },
    _store: store,
  };
}

function ctx() {
  return { waitUntil: (p) => { jobs.push(p); } };
}

test('yahooClose extrai regularMarketPrice do meta', () => {
  assert.equal(yahooClose({ chart: { result: [{ meta: { regularMarketPrice: 171132.5 } }] } }), 171132.5);
});

test('yahooClose devolve null para payload malformado', () => {
  assert.equal(yahooClose(null), null);
  assert.equal(yahooClose({}), null);
  assert.equal(yahooClose({ chart: { result: [] } }), null);
  assert.equal(yahooClose({ chart: { result: [{ meta: { regularMarketPrice: 'abc' } }] } }), null);
});

test('awesomeUsdbrl converte bid numerico', () => {
  assert.equal(awesomeUsdbrl({ USDBRL: { bid: '5.2621' } }), 5.2621);
});

test('awesomeUsdbrl rejeita bid invalido ou nao positivo', () => {
  assert.equal(awesomeUsdbrl(null), null);
  assert.equal(awesomeUsdbrl({}), null);
  assert.equal(awesomeUsdbrl({ USDBRL: {} }), null);
  assert.equal(awesomeUsdbrl({ USDBRL: { bid: 'abc' } }), null);
  assert.equal(awesomeUsdbrl({ USDBRL: { bid: '-1' } }), null);
});

test('completar preenche buracos com SEED e lista os defasados', () => {
  const { out, stale } = completar({ usd_brl: 5.1, ibovespa: null, sp500: null, wti: null }, null);
  assert.equal(out.usd_brl, 5.1);
  assert.equal(out.ibovespa, SEED.ibovespa);
  assert.equal(out.sp500, SEED.sp500);
  assert.equal(out.wti, SEED.wti);
  assert.deepEqual(stale.sort(), ['ibovespa', 'sp500', 'wti']);
});

test('completar prefere o cache anterior ao SEED', () => {
  const prev = { usd_brl: 5.0, ibovespa: 170000, sp500: 7400, wti: 79 };
  const { out, stale } = completar({ usd_brl: null, ibovespa: null, sp500: 7500, wti: null }, prev);
  assert.equal(out.usd_brl, 5.0);
  assert.equal(out.ibovespa, 170000);
  assert.equal(out.sp500, 7500);
  assert.equal(out.wti, 79);
  assert.deepEqual(stale.sort(), ['ibovespa', 'usd_brl', 'wti']);
});

test('completar com tudo ao vivo nao marca nada defasado', () => {
  const live = { usd_brl: 5.2, ibovespa: 171000, sp500: 7430, wti: 80.5 };
  const { out, stale } = completar(live, null);
  assert.deepEqual(out, live);
  assert.deepEqual(stale, []);
});

test('falha total com cache antigo persiste stale com os 4 ativos defasados', async () => {
  // O carimbo reestampado precisa marcar os 4 ativos como defasados. Antes o
  // spread preservava o stale anterior ([] de coleta boa) e por 900s o front
  // rotulava valores antigos como "Cotação atual" a cada reestampagem.
  const antigo = {
    ok: true,
    usd_brl: 5.0,
    ibovespa: 170000,
    sp500: 7400,
    wti: 79,
    stale: [],
    generated_at: '14/08/2026, 19:00 BRT',
    ts: Math.floor(Date.now() / 1000) - 7200,
    _raw: { usd_brl: 5.0, ibovespa: 170000, sp500: 7400, wti: 79 },
  };
  const env = makeEnv(antigo);
  const r = await handleRelatorioPrices(env, ctx());
  assert.equal(r.status, 200);
  await Promise.all(jobs); // deixa a revalidacao em background concluir

  const gravado = JSON.parse(await env.CACHE.get('relatorio-prices'));
  assert.deepEqual(
    gravado.stale.slice().sort(),
    ['ibovespa', 'sp500', 'usd_brl', 'wti'],
    'o cache reestampado precisa marcar os 4 ativos como defasados'
  );
});

test('falta de cache com tudo falhando devolve seed marcado defasado', async () => {
  const env = makeEnv(null);
  const r = await handleRelatorioPrices(env, ctx());
  const body = await r.json();
  assert.equal(r.status, 200);
  assert.deepEqual(body.stale.slice().sort(), ['ibovespa', 'sp500', 'usd_brl', 'wti']);
  assert.equal(body.ibovespa, SEED.ibovespa);
});

test('publico remove _raw e ts do contrato com o front', () => {
  const payload = {
    ok: true,
    usd_brl: 5.2,
    ibovespa: 171000,
    sp500: 7430,
    wti: 80.5,
    stale: [],
    generated_at: '15/08/2026, 10:00 BRT',
    ts: 1234567890,
    _raw: { usd_brl: 5.2, ibovespa: 171000, sp500: 7430, wti: 80.5 },
  };
  const p = publico(payload);
  assert.equal(p.ts, undefined);
  assert.equal(p._raw, undefined);
  assert.equal(p.usd_brl, 5.2);
  assert.equal(p.ibovespa, 171000);
});
