import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applySecurityHeaders } from '../src/utils/headers.js';

function cspOf(host) {
  const res = applySecurityHeaders(new Response('ok', { status: 200 }), host);
  return res.headers.get('Content-Security-Policy');
}

test('CSP nao tem unsafe-eval (nenhum eval/new Function no JS publico)', () => {
  assert.ok(!cspOf('szuchmacher.com.br').includes("'unsafe-eval'"));
  assert.ok(!cspOf('multi-assets.com').includes("'unsafe-eval'"));
});

test('CSP do sz nao tem unsafe-inline (Fase A externalizou tudo)', () => {
  const csp = cspOf('szuchmacher.com.br');
  assert.ok(!csp.includes("'unsafe-inline'"), 'sz nao pode ter unsafe-inline');
  const www = cspOf('www.szuchmacher.com.br');
  assert.ok(!www.includes("'unsafe-inline'"), 'www.szuchmacher.com.br nao pode ter unsafe-inline');
});

test('CSP do multi mantem unsafe-inline (handlers inline do multiasset, Fase B)', () => {
  const csp = cspOf('multi-assets.com');
  assert.ok(csp.includes("'unsafe-inline'"));
  const www = cspOf('www.multi-assets.com');
  assert.ok(www.includes("'unsafe-inline'"));
});

test('CSP aplica headers de seguranca e marca o servidor', () => {
  const res = applySecurityHeaders(new Response('ok', { status: 200 }), 'szuchmacher.com.br');
  assert.equal(res.headers.get('Strict-Transport-Security'), 'max-age=31536000; includeSubDomains');
  assert.equal(res.headers.get('X-Frame-Options'), 'SAMEORIGIN');
  assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(res.headers.get('X-Served-By'), 'sz-sites-worker');
  assert.equal(res.headers.get('X-Site-Host'), 'szuchmacher.com.br');
  assert.equal(res.headers.get('Server'), null);
});
