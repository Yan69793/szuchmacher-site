import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { handleStripeWebhook } from '../src/handlers/stripe-webhook.js';

const SECRET = 'whsec_test_local';

function makeKV() {
  const m = new Map();
  return {
    m,
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async put(k, v) { m.set(k, v); },
    async delete(k) { m.delete(k); },
  };
}

function makeEnv(kv) {
  return {
    CACHE: kv,
    STRIPE_WEBHOOK_SECRET: SECRET,
    RESEND_API_KEY: 're_test_dummy',
    FROM_EMAIL: 'teste@example.com',
    ASSETS: { fetch: async () => new Response(JSON.stringify({ latest_slug: '2026-10-13' }), { status: 200 }) },
  };
}

function signedRequest(event, { ts = Math.floor(Date.now() / 1000), secret = SECRET } = {}) {
  const body = JSON.stringify(event);
  const sig = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
  return new Request('https://szuchmacher.com.br/stripe-webhook', {
    method: 'POST',
    headers: { 'stripe-signature': `t=${ts},v1=${sig}`, 'content-type': 'application/json' },
    body,
  });
}

const evt = (id) => ({
  id,
  type: 'checkout.session.completed',
  data: { object: { customer_details: { email: 'cliente@example.com' } } },
});

let realFetch;
let resendCalls;
let resendStatus;
beforeEach(() => {
  realFetch = globalThis.fetch;
  resendCalls = 0;
  resendStatus = 200;
  globalThis.fetch = async (url) => {
    if (String(url).includes('api.resend.com')) {
      resendCalls++;
      return new Response(resendStatus === 200 ? '{"id":"x"}' : '{"error":"x"}', { status: resendStatus });
    }
    throw new Error(`fetch inesperado: ${url}`);
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

test('primeiro evento envia 1 e-mail e marca done', async () => {
  const kv = makeKV();
  const res = await handleStripeWebhook(signedRequest(evt('evt_1')), makeEnv(kv), null);
  assert.equal(res.status, 200);
  assert.equal(resendCalls, 1);
  assert.equal(kv.m.get('stripe-evt:evt_1'), 'done');
});

test('reentrega do mesmo event.id nao reenvia e-mail', async () => {
  const kv = makeKV();
  const env = makeEnv(kv);
  await handleStripeWebhook(signedRequest(evt('evt_2')), env, null);
  const res2 = await handleStripeWebhook(signedRequest(evt('evt_2')), env, null);
  assert.equal(res2.status, 200);
  assert.equal((await res2.json()).duplicate, true);
  assert.equal(resendCalls, 1);
});

test('evento em processamento e tratado como duplicado', async () => {
  const kv = makeKV();
  kv.m.set('stripe-evt:evt_3', 'processing');
  const res = await handleStripeWebhook(signedRequest(evt('evt_3')), makeEnv(kv), null);
  assert.equal(res.status, 200);
  assert.equal(resendCalls, 0);
});

test('falha do Resend devolve 500 e libera a chave para a reentrega', async () => {
  const kv = makeKV();
  const env = makeEnv(kv);
  resendStatus = 500;
  const res = await handleStripeWebhook(signedRequest(evt('evt_4')), env, null);
  assert.equal(res.status, 500);
  assert.equal(kv.m.has('stripe-evt:evt_4'), false);
  resendStatus = 200;
  const res2 = await handleStripeWebhook(signedRequest(evt('evt_4')), env, null);
  assert.equal(res2.status, 200);
  assert.equal(resendCalls, 2);
  assert.equal(kv.m.get('stripe-evt:evt_4'), 'done');
});

test('evento sem id devolve 400', async () => {
  const kv = makeKV();
  const res = await handleStripeWebhook(signedRequest({ type: 'checkout.session.completed' }), makeEnv(kv), null);
  assert.equal(res.status, 400);
  assert.equal(resendCalls, 0);
});

test('assinatura invalida continua 401', async () => {
  const res = await handleStripeWebhook(signedRequest(evt('evt_5'), { secret: 'outro' }), makeEnv(makeKV()), null);
  assert.equal(res.status, 401);
});

test('timestamp com mais de 300 s continua 401', async () => {
  const old = Math.floor(Date.now() / 1000) - 301;
  const res = await handleStripeWebhook(signedRequest(evt('evt_6'), { ts: old }), makeEnv(makeKV()), null);
  assert.equal(res.status, 401);
});

test('evento de outro tipo e marcado done sem enviar e-mail', async () => {
  const kv = makeKV();
  const res = await handleStripeWebhook(signedRequest({ id: 'evt_7', type: 'invoice.paid', data: { object: {} } }), makeEnv(kv), null);
  assert.equal(res.status, 200);
  assert.equal(resendCalls, 0);
  assert.equal(kv.m.get('stripe-evt:evt_7'), 'done');
});