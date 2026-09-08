// headless-test-multi-asset.mjs — Teste headless da pagina multi-asset
// Uso: node headless-test-multi-asset.mjs
// Requer playwright instalado globalmente (npm install -g playwright)

import { chromium } from 'playwright';
import { createServer } from 'net';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { createServer as createHttpServer } from 'http';

const PORT = 9876;
const PUBLIC = new URL('../../cloudflare-workers/sz-sites/public/multi', import.meta.url);
const BASE = `http://localhost:${PORT}`;

// MIME types
const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
};

const server = createHttpServer((req, res) => {
  let path = new URL(req.url, BASE).pathname;
  if (path === '/') path = '/index.html';
  const filePath = join(PUBLIC.pathname, path);
  if (!existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const ext = extname(filePath);
  const content = readFileSync(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  res.end(content);
});

async function main() {
  // Start server
  await new Promise(resolve => server.listen(PORT, resolve));
  console.log(`Servidor em ${BASE}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(`pageerror: ${err.message}`));

  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Wait for scripts to load
    await page.waitForTimeout(1500);

    console.log(`\nURL: ${page.url()}`);
    console.log(`Titulo: ${await page.title()}`);

    // Check for NaN/Infinity in page text
    const bodyText = await page.locator('body').innerText();
    const hasNaN = bodyText.includes('NaN');
    const hasInfinity = bodyText.includes('Infinity');
    console.log(`NaN no texto: ${hasNaN}`);
    console.log(`Infinity no texto: ${hasInfinity}`);

    // Check for "NaN" or "Infinity" in all visible elements
    const allText = await page.evaluate(() => {
      const els = document.querySelectorAll('*');
      for (const el of els) {
        if (el.children.length === 0 && el.textContent) {
          if (el.textContent.includes('NaN') || el.textContent.includes('Infinity')) {
            return el.textContent.slice(0, 100);
          }
        }
      }
      return null;
    });
    if (allText) {
      console.log(`\nNaN/Infinity encontrado em elemento: ${allText}`);
    }

    // Check for console errors
    console.log(`\nErros de console: ${consoleErrors.length}`);
    for (const err of consoleErrors) {
      console.log(`  ERRO: ${err.slice(0, 200)}`);
    }

    // Check for financial calculation elements
    const hasSimulator = await page.locator('.sim-panel').count();
    console.log(`\nPaineis de simulacao: ${hasSimulator}`);

    const hasChart = await page.locator('canvas').count();
    console.log(`Canvas (graficos): ${hasChart}`);

    const pass = !hasNaN && !hasInfinity && consoleErrors.length === 0;
    console.log(`\n=== RESULTADO: ${pass ? 'PASS' : 'FAIL'} ===`);
    process.exit(pass ? 0 : 1);
  } catch (err) {
    console.error(`Erro no teste: ${err.message}`);
    process.exit(1);
  } finally {
    await browser.close();
    server.close();
  }
}

main();