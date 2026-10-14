// Funil Plausible atras da flag SZ_PLAUSIBLE_DOMAIN (item 5.4). Playwright;
// pula sem browser.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CONFIG = readFileSync(new URL('../../../assets/sz-config.js', import.meta.url), 'utf8');
const HTML = '<!doctype html><html><head><script src="/assets/sz-config.js"></script></head><body><a href="#" data-stripe-pro data-ga-location="teste" id="pro">Pro</a></body></html>';

let browser = null, skip = false;
before(async () => { try { const { chromium } = await import('playwright'); browser = await chromium.launch(); } catch { skip = true; } });
after(async () => { if (browser) await browser.close(); });

async function open(flagOn) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const hits = { plausible: 0 };
  const cfg = flagOn ? CONFIG.replace("window.SZ_PLAUSIBLE_DOMAIN = '';", "window.SZ_PLAUSIBLE_DOMAIN = 'multi-assets.com';") : CONFIG;
  assert.ok(!flagOn || cfg !== CONFIG, 'flag nao encontrada no sz-config.js');
  await page.route('**/*', (r) => {
    const u = r.request().url();
    if (u.includes('plausible.io')) { hits.plausible++; return r.fulfill({ status: 200, body: '' }); }
    if (u.endsWith('/assets/sz-config.js')) return r.fulfill({ status: 200, contentType: 'application/javascript', body: cfg });
    if (u === 'https://multi.test/') return r.fulfill({ status: 200, contentType: 'text/html', body: HTML });
    if (u.includes('stripe.com')) return r.fulfill({ status: 200, body: '' });
    return r.fulfill({ status: 404, body: '' });
  });
  await page.goto('https://multi.test/');
  await page.waitForTimeout(100);
  return { ctx, page, hits };
}

test('flag desligada: nada vai para o Plausible', async (t) => {
  if (skip) return t.skip('playwright indisponivel');
  const { ctx, page, hits } = await open(false);
  await page.evaluate(() => window.ga('lead_capture', { source: 'x', email: 'a@b.com' }));
  assert.equal(hits.plausible, 0);
  assert.equal(await page.evaluate(() => typeof window.plausible), 'undefined');
  await ctx.close();
});

test('flag ligada: evento do funil vai sem dado pessoal; evento fora do funil nao vai', async (t) => {
  if (skip) return t.skip('playwright indisponivel');
  const { ctx, page, hits } = await open(true);
  assert.ok(hits.plausible >= 1, 'script do Plausible carregado');
  const q = await page.evaluate(() => {
    window.ga('lead_capture', { source: 'exit_popup', email: 'a@b.com', nome: 'Fulano' });
    window.ga('evento_qualquer', { x: 1 });
    return (window.plausible.q || []).map((a) => [a[0], a[1]]);
  });
  assert.deepEqual(q, [['lead_capture', { props: { source: 'exit_popup' } }]]);
  await ctx.close();
});

test('flag ligada: clique no Pro registra checkout_start', async (t) => {
  if (skip) return t.skip('playwright indisponivel');
  const { ctx, page } = await open(true);
  await page.evaluate(() => { window.SZ.wireStripeButtons(); document.getElementById('pro').addEventListener('click', (e) => e.preventDefault()); });
  await page.click('#pro');
  const q = await page.evaluate(() => (window.plausible.q || []).map((a) => a[0]));
  assert.ok(q.includes('checkout_start'));
  await ctx.close();
});