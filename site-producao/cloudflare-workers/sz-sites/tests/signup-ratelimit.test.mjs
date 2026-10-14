import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleRelatorioSignup } from '../src/handlers/relatorio-signup.js';

function env(extra = {}) {
  const m = new Map();
  return {
    RESEND_API_KEY: '',
    CACHE: { async get(k) { return m.get(k) ?? null; }, async put(k, v) { m.set(k, v); }, async delete(k) { m.delete(k); } },
    ASSETS: { fetch: async () => new Response('{}') },
    ...extra,
  };
}
const req = (headers) => new Request('https://szuchmacher.com.br/relatorio-signup', {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify({ email: 'x@example.com', consent: true }),
});

test('4a tentativa do mesmo IP em 15 min: 429', async () => {
  const e = env();
  for (let i = 0; i < 3; i++) assert.notEqual((await handleRelatorioSignup(req({ 'cf-connecting-ip': '203.0.113.5' }), e)).status, 429);
  assert.equal((await handleRelatorioSignup(req({ 'cf-connecting-ip': '203.0.113.5' }), e)).status, 429);
});

test('KV falhando: fail-closed (429)', async () => {
  const e = env();
  e.CACHE = { async get() { throw new Error('down'); }, async put() { throw new Error('down'); }, async delete() {} };
  assert.equal((await handleRelatorioSignup(req({ 'cf-connecting-ip': '203.0.113.6' }), e)).status, 429);
});

test('sem cf-connecting-ip (x-forwarded-for ignorado): 429', async () => {
  assert.equal((await handleRelatorioSignup(req({ 'x-forwarded-for': '1.2.3.4' }), env())).status, 429);
});

test('binding SIGNUP_RL, quando existe, decide', async () => {
  let calls = 0;
  const e = env({ SIGNUP_RL: { async limit({ key }) { calls++; assert.equal(key, 'signup:203.0.113.7'); return { success: false }; } } });
  assert.equal((await handleRelatorioSignup(req({ 'cf-connecting-ip': '203.0.113.7' }), e)).status, 429);
  assert.equal(calls, 1);
});