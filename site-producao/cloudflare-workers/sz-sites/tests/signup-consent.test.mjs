import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleRelatorioSignup, handleRelatorioConfirm, handleUnsubscribe, pickAttr } from '../src/handlers/relatorio-signup.js';
import { signEmail, sha256Hex } from '../src/utils/subscriber.js';

const SECRET = 'hmac-test-secret';

function makeEnv() {
  const m = new Map();
  return {
    m,
    RESEND_API_KEY: 're_dummy',
    SUBSCRIBER_HMAC_SECRET: SECRET,
    CACHE: {
      async get(k, o) { const v = m.has(k) ? m.get(k) : null; return v && o?.type === 'json' ? JSON.parse(v) : v; },
      async put(k, v) { m.set(k, v); },
      async delete(k) { m.delete(k); },
    },
    ASSETS: { fetch: async () => new Response('{"latest_slug":"2026-10-13"}', { status: 200 }) },
  };
}

let realFetch, sent;
beforeEach(() => {
  realFetch = globalThis.fetch;
  sent = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('api.resend.com')) { sent.push(JSON.parse(init.body)); return new Response('{"id":"x"}', { status: 200 }); }
    throw new Error('fetch inesperado ' + url);
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

const post = (body, ip = '198.51.100.1') => new Request('https://szuchmacher.com.br/relatorio-signup', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: 'https://szuchmacher.com.br', 'cf-connecting-ip': ip },
  body: JSON.stringify(body),
});

test('sem consentimento: 422 e nada gravado', async () => {
  const env = makeEnv();
  const res = await handleRelatorioSignup(post({ email: 'a@example.com' }), env);
  assert.equal(res.status, 422);
  assert.equal([...env.m.keys()].some((k) => k.startsWith('subscriber:')), false);
  assert.equal(sent.length, 0);
});

test('com consentimento: pending com prova e e-mail de confirmacao (nao boas-vindas)', async () => {
  const env = makeEnv();
  const res = await handleRelatorioSignup(post({ email: 'A@Example.com', consent: true, policy_version: '2026-07-26', source: 'multiasset_exit_popup' }), env);
  assert.equal(res.status, 200);
  const rec = JSON.parse(env.m.get('subscriber:a@example.com'));
  assert.equal(rec.status, 'pending');
  assert.equal(rec.consent.policy_version, '2026-07-26');
  assert.equal(rec.source, 'multiasset_exit_popup');
  assert.match(rec.consent.ip_hash, /^[0-9a-f]{32}$/);
  assert.ok(!JSON.stringify(rec).includes('198.51.100.1'), 'IP nao pode ficar em claro');
  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /Confirme/);
  assert.equal([...env.m.keys()].filter((k) => k.startsWith('optin:')).length, 1);
});

test('confirmacao: token valido confirma, envia boas-vindas com descadastro e e de uso unico', async () => {
  const env = makeEnv();
  await handleRelatorioSignup(post({ email: 'b@example.com', consent: true }), env);
  const link = sent[0].text.match(/relatorio-confirm\?t=([0-9a-f]{64})/);
  assert.ok(link);
  const url = `https://szuchmacher.com.br/relatorio-confirm?t=${link[1]}`;
  const r1 = await handleRelatorioConfirm(new Request(url), env);
  assert.equal(r1.status, 200);
  const rec = JSON.parse(env.m.get('subscriber:b@example.com'));
  assert.equal(rec.status, 'confirmed');
  assert.ok(rec.confirmed_at);
  assert.equal(sent.length, 2);
  assert.match(sent[1].text, /unsubscribe\?e=/);
  assert.match(sent[1].headers['List-Unsubscribe'], /^<https:\/\/szuchmacher\.com\.br\/unsubscribe\?e=/);
  const r2 = await handleRelatorioConfirm(new Request(url), env);
  assert.equal(r2.status, 410);
});

test('token invalido: 400', async () => {
  const res = await handleRelatorioConfirm(new Request('https://szuchmacher.com.br/relatorio-confirm?t=xyz'), makeEnv());
  assert.equal(res.status, 400);
});

test('inscrito ja confirmado nao recebe novo e-mail nem volta a pending', async () => {
  const env = makeEnv();
  env.m.set('subscriber:c@example.com', JSON.stringify({ email: 'c@example.com', status: 'confirmed' }));
  const res = await handleRelatorioSignup(post({ email: 'c@example.com', consent: true }), env);
  assert.equal(res.status, 200);
  assert.equal(sent.length, 0);
  assert.equal(JSON.parse(env.m.get('subscriber:c@example.com')).status, 'confirmed');
});

async function unsubReq(email, action, sig) {
  const s = sig ?? await signEmail(email, SECRET);
  const body = new URLSearchParams({ e: email, s, action });
  return new Request('https://szuchmacher.com.br/unsubscribe', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
}

test('descadastro com HMAC valido marca unsubscribed', async () => {
  const env = makeEnv();
  env.m.set('subscriber:d@example.com', JSON.stringify({ email: 'd@example.com', status: 'confirmed', attribution: { first: { ts: 1, landing: '/', utms: { utm_source: 'x' } }, last: null } }));
  const res = await handleUnsubscribe(await unsubReq('d@example.com', 'unsubscribe'), env);
  assert.equal(res.status, 200);
  const rec = JSON.parse(env.m.get('subscriber:d@example.com'));
  assert.equal(rec.status, 'unsubscribed');
  assert.equal('attribution' in rec, false, 'descadastro descarta a origem de campanha');
});

test('exclusao remove o inscrito e guarda so o hash', async () => {
  const env = makeEnv();
  env.m.set('subscriber:e@example.com', JSON.stringify({ email: 'e@example.com', status: 'confirmed' }));
  const res = await handleUnsubscribe(await unsubReq('e@example.com', 'delete'), env);
  assert.equal(res.status, 200);
  assert.equal(env.m.has('subscriber:e@example.com'), false);
  assert.ok(env.m.has(`deleted:${await sha256Hex('e@example.com')}`));
});

test('HMAC invalido: 403 e nada muda', async () => {
  const env = makeEnv();
  env.m.set('subscriber:f@example.com', JSON.stringify({ email: 'f@example.com', status: 'confirmed' }));
  const res = await handleUnsubscribe(await unsubReq('f@example.com', 'delete', '0'.repeat(64)), env);
  assert.equal(res.status, 403);
  assert.ok(env.m.has('subscriber:f@example.com'));
});

test('GET de descadastro mostra a pagina sem alterar nada', async () => {
  const env = makeEnv();
  env.m.set('subscriber:g@example.com', JSON.stringify({ email: 'g@example.com', status: 'confirmed' }));
  const s = await signEmail('g@example.com', SECRET);
  const res = await handleUnsubscribe(new Request(`https://szuchmacher.com.br/unsubscribe?e=g%40example.com&s=${s}`), env);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes('action="/unsubscribe"'));
  assert.ok(!/style=/.test(html), 'pagina sem style inline (CSP)');
  assert.equal(JSON.parse(env.m.get('subscriber:g@example.com')).status, 'confirmed');
});

test('sem SUBSCRIBER_HMAC_SECRET o descadastro responde 503 com contato', async () => {
  const env = makeEnv();
  delete env.SUBSCRIBER_HMAC_SECRET;
  const res = await handleUnsubscribe(new Request('https://szuchmacher.com.br/unsubscribe?e=x%40y.com&s=1'), env);
  assert.equal(res.status, 503);
});

test('pickAttr guarda so as 5 UTMs, sem click id, referrer nem e-mail', () => {
  const a = pickAttr({
    first_touch: {
      ts: 1789000000000,
      landing: '/relatorios.html?email=x%40y.com',
      referrer: 'https://www.google.com/search?q=fulano',
      utms: { utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'c'.repeat(300), utm_content: 'fulano@example.com', gclid: 'abc', fbclid: 'def', li_fat_id: 'ghi' },
    },
    last_touch: { ts: null, landing: '/', utms: { utm_source: 'newsletter' } },
  });
  assert.deepEqual(Object.keys(a.first.utms).sort(), ['utm_campaign', 'utm_medium', 'utm_source']);
  assert.equal(a.first.utms.utm_campaign.length, 100);
  assert.equal(a.first.landing, '/relatorios.html');
  assert.equal(a.first.ts, 1789000000000);
  assert.equal(a.last.ts, null, 'ts null nao pode virar 0');
  const s = JSON.stringify(a);
  for (const proibido of ['gclid', 'abc', 'fbclid', 'li_fat_id', 'referrer', 'google.com/search', '@']) {
    assert.ok(!s.includes(proibido), `nao pode conter ${proibido}`);
  }
});

test('pickAttr devolve null para entrada invalida ou sem toque valido', () => {
  assert.equal(pickAttr(null), null);
  assert.equal(pickAttr('x'), null);
  assert.equal(pickAttr({ first_touch: null, last_touch: null }), null);
  assert.equal(pickAttr({ first_touch: { utms: 'x' } }), null);
  assert.equal(pickAttr({ first_touch: { ts: 1, landing: '/', utms: { gclid: 'abc', utm_content: 'a@b.com' } } }), null, 'sem UTM valida nao grava landing/ts soltos');
});

test('signup grava atribuicao filtrada e a confirmacao preserva', async () => {
  const env = makeEnv();
  const attribution = { first_touch: { ts: 1, landing: '/', utms: { utm_source: 'li', gclid: 'zzz' } }, last_touch: null };
  await handleRelatorioSignup(post({ email: 'h@example.com', consent: true, attribution }, '198.51.100.9'), env);
  const rec = JSON.parse(env.m.get('subscriber:h@example.com'));
  assert.deepEqual(rec.attribution, { first: { ts: 1, landing: '/', utms: { utm_source: 'li' } }, last: null });
  const t = sent[0].text.match(/relatorio-confirm\?t=([0-9a-f]{64})/)[1];
  await handleRelatorioConfirm(new Request(`https://szuchmacher.com.br/relatorio-confirm?t=${t}`), env);
  const conf = JSON.parse(env.m.get('subscriber:h@example.com'));
  assert.equal(conf.status, 'confirmed');
  assert.deepEqual(conf.attribution, rec.attribution);
});