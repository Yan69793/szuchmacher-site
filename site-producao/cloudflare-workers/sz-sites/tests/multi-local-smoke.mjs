// Smoke local do multi-assets.com montado em public/multi (rodar apos o build):
//   node tests/multi-local-smoke.mjs
// Serve public/multi com a mesma CSP do Worker, abre no Chromium e verifica:
// sem violacao de CSP, sem erro de console proprio, Chart.js carregado do
// proprio dominio, banner de consentimento presente, Clarity ausente sem aceite,
// checkbox de consentimento no popup. Nao toca producao.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { applySecurityHeaders } from '../src/utils/headers.js';
import { chromium } from 'playwright';

const ROOT = new URL('../public/multi/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.svg': 'image/svg+xml' };

const server = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  const file = normalize(join(ROOT, p));
  let body, status = 200, type = TYPES[extname(file)] || 'application/octet-stream';
  try { body = await readFile(file); } catch { status = 404; body = 'nf'; type = 'text/plain'; }
  const r = applySecurityHeaders(new Response(body, { status, headers: { 'Content-Type': type } }), 'multi-assets.com');
  const h = Object.fromEntries(r.headers);
  delete h['strict-transport-security'];
  h['content-security-policy'] = h['content-security-policy'].replace('; upgrade-insecure-requests', '').replace(/'self'/g, "'self' http://127.0.0.1:8789");
  res.writeHead(status, h);
  res.end(Buffer.from(await r.arrayBuffer()));
});
await new Promise((r) => server.listen(8789, '127.0.0.1', r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const problems = [];
const csp = [];
const hits = { clarity: 0, cdnChart: 0, cdnJspdf: 0 };
page.on('console', (m) => {
  const t = m.text();
  if (/Content Security Policy|Refused to/.test(t)) csp.push(t.slice(0, 200));
  else if (m.type() === 'error' && !/tradingview|Failed to load resource|net::ERR|awesomeapi|bcb\.gov|brasilapi|brapi|coingecko|plausible|404/i.test(t)) problems.push(t.slice(0, 200));
});
page.on('pageerror', (e) => problems.push('pageerror: ' + String(e.message).slice(0, 200)));
await page.route('**/*', (route) => {
  const u = route.request().url();
  if (u.includes('clarity.ms')) { hits.clarity++; return route.abort(); }
  if (u.includes('cdnjs.cloudflare.com/ajax/libs/Chart.js')) hits.cdnChart++;
  if (u.includes('cdnjs.cloudflare.com/ajax/libs/jspdf')) hits.cdnJspdf++;
  if (/tradingview/.test(u)) return route.abort();
  return route.continue();
});
const t0 = Date.now();
await page.goto('http://127.0.0.1:8789/', { waitUntil: 'load', timeout: 60000 });
const loadMs = Date.now() - t0;
await page.waitForTimeout(1500);
const out = {
  loadMs,
  chart: await page.evaluate(() => typeof window.Chart),
  consentBanner: await page.locator('#sz-consent-banner').count(),
  popupConsentCheckbox: await page.locator('#popup-consent-input').count(),
  canvases: await page.locator('canvas').count(),
  jspdf: await page.evaluate(() => (typeof ensurePdfExportLib === 'function' ? ensurePdfExportLib().then(() => 'ok', (e) => e.message) : 'n/a')),
  hits,
  cspViolations: csp,
  consoleErrors: problems,
};
console.log(JSON.stringify(out, null, 2));
await browser.close();
server.close();
const ok = out.jspdf === 'ok' && out.chart === 'function' && out.consentBanner === 1 && out.popupConsentCheckbox === 1 && hits.clarity === 0 && hits.cdnChart === 0 && csp.length === 0 && problems.length === 0;
console.log(ok ? 'SMOKE OK' : 'SMOKE FALHOU');
process.exit(ok ? 0 : 1);