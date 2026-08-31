import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applySecurityHeaders } from '../src/utils/headers.js';

function cspOf(host) {
  const res = applySecurityHeaders(new Response('ok', { status: 200 }), host);
  return res.headers.get('Content-Security-Policy');
}

test('CSP nao tem unsafe-eval (nenhum eval/new Function no JS publico)', () => {
  assert.ok(!cspOf('szuchmacher.com.br').includes("'unsafe-eval'"));
});

test('CSP mantem unsafe-inline em script-src e style-src (handlers inline do multiasset)', () => {
  const csp = cspOf('multi-assets.com');
  assert.ok(csp.includes("'unsafe-inline'"));
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
