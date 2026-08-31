import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchAsset } from '../src/index.js';

// P3-1 de 30/08: GET/HEAD com Content-Length: 0 em rota HTML devolvia 500.
// new Request(assetUrl, request) repassava o request inteiro e o construtor
// rejeita body em GET/HEAD. O fix reconstroi so com method e headers.

function reqComBody(method) {
  const req = new Request('https://szuchmacher.com.br/', { method });
  // Simula o runtime entregando GET/HEAD com body nao-nulo (Content-Length: 0).
  Object.defineProperty(req, 'body', { value: new ReadableStream(), configurable: true });
  return req;
}

test('fetchAsset: GET com body nao quebra o reempacotamento', async () => {
  const req = reqComBody('GET');
  let seen = null;
  const env = { ASSETS: { async fetch(r) { seen = r; return new Response('ok', { status: 200 }); } } };
  const res = await fetchAsset(req, env, new URL('https://szuchmacher.com.br/sz/index.html'));
  assert.equal(res.status, 200);
  assert.equal(seen.method, 'GET');
  assert.equal(seen.url, 'https://szuchmacher.com.br/sz/index.html');
});

test('fetchAsset: HEAD com body nao quebra', async () => {
  const req = reqComBody('HEAD');
  const env = { ASSETS: { async fetch() { return new Response(null, { status: 200 }); } } };
  const res = await fetchAsset(req, env, new URL('https://szuchmacher.com.br/sz/index.html'));
  assert.equal(res.status, 200);
});

test('fetchAsset: redirect em cadeia ainda segue com limite de hops', async () => {
  let calls = 0;
  const env = {
    ASSETS: {
      async fetch() {
        calls++;
        if (calls === 1) {
          return new Response(null, { status: 301, headers: { Location: 'https://szuchmacher.com.br/sz/home.html' } });
        }
        return new Response('ok', { status: 200 });
      },
    },
  };
  const req = new Request('https://szuchmacher.com.br/', { method: 'GET' });
  const res = await fetchAsset(req, env, new URL('https://szuchmacher.com.br/sz/index.html'));
  assert.equal(res.status, 200);
  assert.equal(calls, 2);
});

test('fetchAsset: hop em excesso para com 500 (Asset loop)', async () => {
  const env = { ASSETS: { async fetch() { return new Response(null, { status: 301, headers: { Location: 'https://szuchmacher.com.br/x' } }); } } };
  const req = new Request('https://szuchmacher.com.br/', { method: 'GET' });
  const res = await fetchAsset(req, env, new URL('https://szuchmacher.com.br/sz/a.html'));
  assert.equal(res.status, 500);
});
