import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maskEmail, safeErrorBody } from '../src/utils/pii.js';
import { handleRelatorioSignup } from '../src/handlers/relatorio-signup.js';

test('maskEmail preserva so a inicial e o dominio', () => {
  assert.equal(maskEmail('Yan.Teste@Example.com'), 'y***@example.com');
  assert.equal(maskEmail(''), '(sem-email)');
  assert.equal(maskEmail('semarroba'), '***');
});

test('safeErrorBody mascara e-mails e corta o corpo', () => {
  const out = safeErrorBody('{"to":"fulano@dominio.com.br","msg":"' + 'x'.repeat(500) + '"}');
  assert.ok(!out.includes('fulano@dominio.com.br'));
  assert.ok(out.includes('f***@dominio.com.br'));
  assert.ok(out.length <= 220);
});

test('signup nao escreve o e-mail completo em nenhum log', async () => {
  const logs = [];
  const orig = { log: console.log, error: console.error, warn: console.warn };
  for (const k of Object.keys(orig)) console[k] = (...a) => logs.push(a.join(' '));
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{"error":"to fulano@example.com rejeitado"}', { status: 422 });
  try {
    const kv = new Map();
    const env = {
      RESEND_API_KEY: 're_dummy',
      CACHE: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => kv.set(k, v), delete: async (k) => kv.delete(k) },
      ASSETS: { fetch: async () => new Response('{}', { status: 200 }) },
    };
    const req = new Request('https://szuchmacher.com.br/relatorio-signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://szuchmacher.com.br', 'cf-connecting-ip': '203.0.113.9' },
      body: JSON.stringify({ email: 'fulano@example.com', consent: true, policy_version: '2026-07-26' }),
    });
    await handleRelatorioSignup(req, env);
  } finally {
    Object.assign(console, orig);
    globalThis.fetch = realFetch;
  }
  assert.ok(logs.length > 0, 'esperava ao menos um log');
  for (const l of logs) assert.ok(!l.includes('fulano@example.com'), `log com e-mail completo: ${l}`);
});