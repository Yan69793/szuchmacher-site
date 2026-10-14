// Gate de consentimento do Clarity (sz-config.js). Usa Playwright quando o
// Chromium esta instalado; sem browser (ex.: CI sem `playwright install`) os
// testes sao pulados em vez de falhar.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CONFIG = readFileSync(new URL('../../../assets/sz-config.js', import.meta.url), 'utf8');
const HTML = '<!doctype html><html><head><script src="/assets/sz-config.js"></script></head><body><p>x</p><a href="#" data-consent-reset id="reset">prefs</a></body></html>';

let browser = null;
let skip = false;
before(async () => {
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch();
  } catch {
    skip = true;
  }
});
after(async () => { if (browser) await browser.close(); });

async function openPage(consent) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const clarityHits = [];
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (u.includes('clarity.ms')) { clarityHits.push(u); return route.fulfill({ status: 200, body: '' }); }
    if (u.endsWith('/assets/sz-config.js')) return route.fulfill({ status: 200, contentType: 'application/javascript', body: CONFIG });
    if (u === 'https://szuchmacher.test/') return route.fulfill({ status: 200, contentType: 'text/html', body: HTML });
    return route.fulfill({ status: 404, body: '' });
  });
  if (consent) await ctx.addInitScript((v) => localStorage.setItem('sz-consent', v), consent);
  await page.goto('https://szuchmacher.test/');
  await page.waitForTimeout(150);
  return { ctx, page, clarityHits };
}

test('sem escolha: banner aparece e Clarity nao carrega', async (t) => {
  if (skip) return t.skip('playwright indisponivel');
  const { ctx, page, clarityHits } = await openPage(null);
  assert.equal(await page.locator('#sz-consent-banner').count(), 1);
  assert.equal(clarityHits.length, 0);
  assert.equal(await page.evaluate(() => typeof window.clarity), 'undefined');
  await ctx.close();
});

test('Recusar: banner some, Clarity nao carrega, escolha persiste', async (t) => {
  if (skip) return t.skip('playwright indisponivel');
  const { ctx, page, clarityHits } = await openPage(null);
  await page.click('[data-consent="essential"]');
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#sz-consent-banner').count(), 0);
  assert.equal(await page.evaluate(() => localStorage.getItem('sz-consent')), 'essential');
  assert.equal(clarityHits.length, 0);
  await ctx.close();
});

test('Aceitar: Clarity carrega na hora', async (t) => {
  if (skip) return t.skip('playwright indisponivel');
  const { ctx, page, clarityHits } = await openPage(null);
  await page.click('[data-consent="analytics"]');
  await page.waitForTimeout(150);
  assert.ok(clarityHits.length >= 1);
  await ctx.close();
});

test('consentimento salvo: Clarity carrega sem banner', async (t) => {
  if (skip) return t.skip('playwright indisponivel');
  const { ctx, page, clarityHits } = await openPage('analytics');
  assert.equal(await page.locator('#sz-consent-banner').count(), 0);
  assert.ok(clarityHits.length >= 1);
  await ctx.close();
});

test('data-consent-reset reabre o banner', async (t) => {
  if (skip) return t.skip('playwright indisponivel');
  const { ctx, page } = await openPage('essential');
  assert.equal(await page.locator('#sz-consent-banner').count(), 0);
  await page.click('#reset');
  assert.equal(await page.locator('#sz-consent-banner').count(), 1);
  await ctx.close();
});