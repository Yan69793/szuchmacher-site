import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applySecurityHeaders } from '../src/utils/headers.js';

const csp = applySecurityHeaders(new Response('x'), 'multi-assets.com').headers.get('Content-Security-Policy');
const directive = (name) => csp.split(';').map((s) => s.trim()).find((s) => s.startsWith(name + ' ')) || '';
const HTML = readFileSync(new URL('../../../multiasset-app.html', import.meta.url), 'utf8');
const APP2 = readFileSync(new URL('../../../assets/multi-app-2.js', import.meta.url), 'utf8');

test('script-src nao libera o cdnjs inteiro', () => {
  assert.ok(!directive('script-src').includes('cdnjs.cloudflare.com'));
});

test('multi nao carrega script do cdnjs (Chart.js e jsPDF servidos do proprio dominio)', () => {
  assert.ok(!/<script[^>]+cdnjs\.cloudflare\.com/.test(HTML));
  assert.ok(!APP2.includes('cdnjs.cloudflare.com/ajax/libs/jspdf'));
  assert.ok(HTML.includes('/assets/chart.umd.min.js'));
});

test('todo stylesheet de terceiro no multi tem integrity (SRI)', () => {
  const links = HTML.match(/<link[^>]+cdnjs\.cloudflare\.com[^>]*>/g) || [];
  assert.ok(links.length >= 1);
  for (const l of links) {
    assert.match(l, /integrity="sha384-[A-Za-z0-9+/=]+"/);
    assert.match(l, /crossorigin="anonymous"/);
  }
});

test('Chart.js nao e mais render-blocking no <head>', () => {
  const head = HTML.slice(0, HTML.indexOf('</head>'));
  assert.ok(!head.includes('chart.umd'));
  assert.ok(!/<link[^>]+font-awesome/.test(head));
});