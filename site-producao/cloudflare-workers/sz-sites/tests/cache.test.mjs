import { test } from 'node:test';
import assert from 'node:assert/strict';
import { singleFlight, readCacheOrRevalidate } from '../src/utils/cache.js';

test('singleFlight deduplica execuções concorrentes da mesma chave', async () => {
  let runs = 0;
  const task = async () => {
    runs++;
    await new Promise((r) => setTimeout(r, 30));
    return 42;
  };
  const [a, b, c] = await Promise.all([
    singleFlight('k', task),
    singleFlight('k', task),
    singleFlight('k', task),
  ]);
  assert.equal(runs, 1, 'três chamadas concorrentes devem compartilhar uma execução');
  assert.equal(a, 42);
  assert.equal(b, 42);
  assert.equal(c, 42);
  const d = await singleFlight('k', task);
  assert.equal(runs, 2, 'após o settle, uma nova chamada executa de novo');
  assert.equal(d, 42);
});

test('singleFlight propaga rejeição e libera a chave', async () => {
  let runs = 0;
  const task = async () => {
    runs++;
    throw new Error('upstream');
  };
  await assert.rejects(() => singleFlight('k2', task));
  await assert.rejects(() => singleFlight('k2', async () => { throw new Error('upstream'); }));
  assert.equal(runs, 1);
});

test('readCacheOrRevalidate: cache fresco volta como cache sem revalidar', async () => {
  const now = Math.floor(Date.now() / 1000);
  const kv = {
    async get() { return JSON.stringify({ ts: now }); },
    async put() { throw new Error('put não deveria ser chamado'); },
  };
  let revalidou = false;
  const r = await readCacheOrRevalidate(kv, 'k', 60, null, async () => { revalidou = true; });
  assert.equal(r.state, 'cache');
  assert.equal(revalidou, false);
});

test('readCacheOrRevalidate: cache vencido volta stale e revalida em background', async () => {
  const now = Math.floor(Date.now() / 1000) - 2000;
  const kv = {
    async get() { return JSON.stringify({ ts: now }); },
    async put() {},
  };
  let calls = 0;
  let done;
  const finished = new Promise((r) => { done = r; });
  const ctx = {
    waitUntil(p) { p.finally(done); },
  };
  const r = await readCacheOrRevalidate(kv, 'k', 60, ctx, async () => { calls++; return {}; });
  assert.equal(r.state, 'stale');
  await finished;
  assert.equal(calls, 1);
});

test('readCacheOrRevalidate: sem ctx e vencido volta miss para o chamador revalidar', async () => {
  const now = Math.floor(Date.now() / 1000) - 2000;
  const kv = { async get() { return JSON.stringify({ ts: now }); } };
  const r = await readCacheOrRevalidate(kv, 'k', 60, null, async () => ({}));
  assert.equal(r.state, 'miss');
  assert.equal(r.cached, null);
});
