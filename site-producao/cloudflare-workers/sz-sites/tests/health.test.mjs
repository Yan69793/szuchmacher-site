import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleHealth } from '../src/handlers/health.js';

const NOW = Date.parse('2026-10-14T08:00:00Z');

function kv(data, { fail = false } = {}) {
  let puts = 0;
  return {
    get puts() { return puts; },
    async get(k) { if (fail) throw new Error('kv down'); return data[k] ?? null; },
    async put() { puts++; },
  };
}

test('/health nao escreve no KV', async () => {
  const store = kv({ 'macro-api': { generated_at: '2026-10-12T03:00:00Z' } });
  await handleHealth({ CACHE: store }, NOW);
  assert.equal(store.puts, 0);
});

test('macro fresco: 200 ok', async () => {
  const res = await handleHealth({ CACHE: kv({ 'macro-api': { generated_at: '2026-10-12T03:00:00Z' }, 'macro-cron-last': { ts: 1 } }) }, NOW);
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.status, 'ok');
  assert.equal(j.checks.kv, 'ok');
  assert.equal(j.checks.macro_fresh, true);
  assert.deepEqual(j.checks.macro_cron_last, { ts: 1 });
});

test('macro com mais de 8 dias: 200 degraded (watchdog continua lendo)', async () => {
  const res = await handleHealth({ CACHE: kv({ 'macro-api': { generated_at: '2026-10-01T00:00:00Z' } }) }, NOW);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, 'degraded');
});

test('macro vazio: 200 degraded', async () => {
  const res = await handleHealth({ CACHE: kv({}) }, NOW);
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.status, 'degraded');
  assert.equal(j.checks.macro_cache, 'empty');
});

test('KV falhando: 503 fail', async () => {
  const res = await handleHealth({ CACHE: kv({}, { fail: true }) }, NOW);
  assert.equal(res.status, 503);
  const j = await res.json();
  assert.equal(j.status, 'fail');
  assert.equal(j.checks.kv, 'fail');
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
});