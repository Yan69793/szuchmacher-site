import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = "https://szuchmacher.com.br";
const OUT_DIR = join(__dirname, "..", "diagnosticos");
mkdirSync(OUT_DIR, { recursive: true });

const now = new Date();
const TS = now.toISOString().replace(/[:.]/g, "").replace("T", "_").substring(0, 15);

const PAGES = [
  { url: `${BASE}/`, name: "home" },
  { url: `${BASE}/multiasset-app.html`, name: "multiasset-app" },
];

const VIEWPORTS = [
  { width: 1280, height: 800, label: "desktop" },
  { width: 390, height: 844, label: "mobile390" },
  { width: 320, height: 568, label: "mobile320" },
];

async function auditPage(page, name, vp) {
  const errors = [], warnings = [], consoleMsgs = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      consoleMsgs.push({ type: msg.type(), text: msg.text().substring(0, 300) });
    }
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message.substring(0, 200)}`));

  const t0 = Date.now();
  const url = PAGES.find(p => p.name === name).url;
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  } catch (e) {
    warnings.push(`goto_timeout: ${e.message.substring(0, 120)}`);
    try { await page.goto(url, { waitUntil: "commit", timeout: 60000 }); } catch (_) {}
  }
  if (name === "multiasset-app") await page.waitForTimeout(4000);

  let checks = {};
  if (name === "home") {
    try {
      await page.waitForSelector('#macroPanel[data-state="ready"]', { timeout: 35000 });
      const items = await page.locator(".mp-evento").count();
      checks = { macro_ready: true, eventos: items };
    } catch (e) {
      checks = { macro_ready: false, error: e.message.substring(0, 200) };
      warnings.push("macro panel not ready");
    }
  } else {
    for (const [sel, label] of [
      ["#macro-ibov", "ibov_strip"],
      ["#bench-assume-selic", "bench_selic"],
      ["#g-pess", "sim_gold"],
    ]) {
      const el = page.locator(sel);
      if (await el.count() > 0) {
        const txt = (await el.first().innerText()).trim();
        checks[label] = txt.substring(0, 80);
        if (txt === "" || txt === "—" || txt === "-") warnings.push(`${label} empty`);
      } else {
        warnings.push(`${label} missing`);
      }
    }
  }

  const loadMs = Date.now() - t0;
  const shot = join(OUT_DIR, `audit-${name}-${vp.label}-${TS}.png`);
  await page.screenshot({ path: shot, fullPage: false });

  const overflow = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    let bad = 0;
    document.querySelectorAll("*").forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width > w + 2 && r.right > w + 2) bad++;
    });
    return bad;
  });
  if (overflow > 0) warnings.push(`horizontal_overflow_elements=${overflow}`);

  return {
    viewport: vp.label,
    load_ms: loadMs,
    screenshot: shot,
    checks,
    console: consoleMsgs.slice(0, 15),
    errors,
    warnings,
  };
}

async function main() {
  const report = {
    generated_at: now.toISOString(),
    base: BASE,
    pages: [],
  };

  const browser = await chromium.launch({ headless: true });

  for (const pageDef of PAGES) {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.width < 500 ? 2 : 1,
      });
      const page = await context.newPage();
      const result = await auditPage(page, pageDef.name, vp);
      result.page = pageDef.name;
      report.pages.push(result);
      console.log(`UI ${pageDef.name} ${vp.label}: load=${result.loadMs}ms errors=${result.errors.length} warnings=${result.warnings.length}`);
      await context.close();
    }
  }

  await browser.close();

  const outJson = join(OUT_DIR, `audit-raw-${TS}.json`);
  writeFileSync(outJson, JSON.stringify(report, null, 2), "utf-8");
  console.log(`\nRAW: ${outJson}`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
