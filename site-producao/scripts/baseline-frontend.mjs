// baseline-frontend.mjs — baseline visual e medido do frontend, antes/depois.
//
// Sobe um servidor estatico local sobre site-producao/ (o mesmo diretorio que o
// build publica) e captura os 5 viewports acordados, com metrica, para comparar
// antes e depois de mexer no CSS.
//
// O endpoint /assets/geopolitica.php nao existe localmente (quem responde e o
// Worker). Sem o shim, o painel do Radar cai em estado de erro e o print nao
// serve para comparar. O shim devolve exatamente o mesmo JSON que o Worker, que
// e o proprio geopolitica-data.json.
//
// Uso (a partir de site-producao/cloudflare-workers/sz-sites, onde playwright resolve):
//   node ../../scripts/baseline-frontend.mjs <pasta-saida>
// Exemplo:
//   node ../../scripts/baseline-frontend.mjs ../../diagnosticos/baseline-frontend-20260918/antes

import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, dirname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE = normalize(join(__dirname, ".."));           // site-producao/
const OUT = join(__dirname, "..", process.argv[2] || "diagnosticos/baseline-frontend");

// playwright vive em cloudflare-workers/sz-sites/node_modules, que nao esta no
// caminho de resolucao deste arquivo (import ESM resolve pela pasta do script,
// nao pelo cwd). Resolver pelo package.json de la evita depender do cwd.
const requirePlaywright = createRequire(join(SITE, "cloudflare-workers", "sz-sites", "package.json"));
const { chromium } = requirePlaywright("playwright");

const PAGES = [
  { file: "index.html", name: "home" },
  { file: "honorarios.html", name: "honorarios" },
  { file: "assinatura.html", name: "assinatura" },
  { file: "relatorios.html", name: "relatorios" },
  { file: "metodologia.html", name: "metodologia" },
  { file: "geopolitica.html", name: "geopolitica" },
];

const VIEWPORTS = [320, 390, 768, 1024, 1440];

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2",
  ".pdf": "application/pdf", ".xml": "application/xml",
};

// Endpoints que o Worker serve e o disco nao tem. Devolvem o mesmo arquivo que
// o Worker devolveria, para o painel renderizar igual.
const SHIMS = {
  "/assets/geopolitica.php": "geopolitica-data.json",
  "/assets/agenda.php": "agenda-data.json",
  "/assets/regulatorio.php": "regulatorio-data.json",
};

function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const pathname = decodeURIComponent(url.pathname);

      const shim = SHIMS[pathname];
      const rel = shim || pathname.replace(/^\/+/, "");
      const target = normalize(join(SITE, rel));

      // nao servir fora de site-producao
      if (!target.startsWith(SITE)) {
        res.writeHead(403).end("fora do diretorio");
        return;
      }
      if (!existsSync(target)) {
        res.writeHead(404).end("nao encontrado");
        return;
      }
      const body = await readFile(target);
      res.writeHead(200, { "content-type": MIME[extname(target)] || "application/octet-stream" });
      res.end(body);
    } catch (e) {
      res.writeHead(500).end(String(e));
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

async function medir(page, vpWidth) {
  return page.evaluate((w) => {
    const out = {};

    // overflow horizontal real
    let overflow = 0;
    const culpados = [];
    document.querySelectorAll("*").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > w + 2 && r.right > w + 2) {
        overflow++;
        if (culpados.length < 5) culpados.push(el.tagName.toLowerCase() + "." + String(el.className).split(" ")[0]);
      }
    });
    out.overflowEls = overflow;
    out.overflowExemplos = culpados;

    // familias de fonte realmente aplicadas em texto visivel
    const fams = new Set();
    let menorFonte = Infinity;
    let qtdTexto = 0;
    document.querySelectorAll("body *").forEach((el) => {
      const t = (el.textContent || "").trim();
      if (!t || el.children.length) return;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      qtdTexto++;
      const fam = (cs.fontFamily || "").split(",")[0].replace(/["']/g, "").trim();
      if (fam) fams.add(fam);
      const px = parseFloat(cs.fontSize);
      if (px && px < menorFonte) menorFonte = px;
    });
    out.fontes = [...fams].sort();
    out.menorFontSizePx = menorFonte === Infinity ? null : Math.round(menorFonte * 10) / 10;
    out.elementosTexto = qtdTexto;

    // folhas de estilo carregadas
    out.cssLinks = document.querySelectorAll('link[rel="stylesheet"]').length;
    out.cssHrefs = [...document.querySelectorAll('link[rel="stylesheet"]')]
      .map((l) => l.getAttribute("href"))
      .filter(Boolean);

    // links de fonte do Google
    out.googleFontLinks = [...document.querySelectorAll("link")]
      .filter((l) => (l.getAttribute("href") || "").includes("fonts.googleapis.com/css2"))
      .map((l) => l.getAttribute("href"));

    // primeira dobra: H1 e CTA principal acima do corte?
    const h1 = document.querySelector("h1");
    if (h1) {
      const r = h1.getBoundingClientRect();
      out.h1Top = Math.round(r.top + window.scrollY);
      out.h1VisivelNaDobra = r.top < window.innerHeight && r.bottom > 0;
      out.h1Texto = (h1.textContent || "").trim().slice(0, 90);
    }
    const cta = document.querySelector(".hero .btn, .hero a.btn, .hero .btn-primary, .hero .btn-outline");
    if (cta) {
      const r = cta.getBoundingClientRect();
      out.ctaTop = Math.round(r.top + window.scrollY);
      out.ctaVisivelNaDobra = r.top < window.innerHeight && r.bottom > 0;
    }

    // cabeçalho: qual vocabulario de logo esta em uso
    const lock = document.querySelector("header .ysz-lockup, header .ysz-stack, header .brand-lockup, header .logo");
    out.lockupHeader = lock ? lock.className : null;

    // grids principais: quantas colunas de fato
    out.grids = {};
    for (const sel of [".hero-metrics", ".pillars-grid", ".offers-grid", ".for-whom-grid",
                       ".method-grid", ".credentials-grid", ".situacoes-grid", ".geo-merc-grid",
                       ".cv-figures__grid"]) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const cols = getComputedStyle(el).gridTemplateColumns;
      out.grids[sel] = cols === "none" ? getComputedStyle(el).display : cols.split(" ").filter(Boolean).length;
    }

    out.docHeight = document.documentElement.scrollHeight;
    return out;
  }, vpWidth);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const { server, port } = await startServer();
  const base = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch({ headless: true });
  const report = { gerado_em: new Date().toISOString(), base_local: base, paginas: [] };

  for (const p of PAGES) {
    const url = `${base}/${p.file}`;
    for (const w of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: w, height: w <= 390 ? 720 : 900 },
        deviceScaleFactor: w <= 390 ? 2 : 1,
      });
      const page = await context.newPage();
      const erros = [];
      page.on("pageerror", (e) => erros.push(`pageerror: ${String(e.message).slice(0, 180)}`));
      page.on("console", (m) => { if (m.type() === "error") erros.push(`console: ${m.text().slice(0, 180)}`); });

      let http = null;
      try {
        const resp = await page.goto(url, { waitUntil: "load", timeout: 45000 });
        http = resp ? resp.status() : null;
      } catch (e) {
        erros.push(`goto: ${String(e.message).slice(0, 150)}`);
      }
      await page.waitForTimeout(1200);

      const medida = await medir(page, w);
      const shot = join(OUT, `${p.name}-${w}.png`);
      await page.screenshot({ path: shot, fullPage: false });

      report.paginas.push({ pagina: p.name, arquivo: p.file, viewport: w, http, print: shot,
                            erros: erros.slice(0, 10), ...medida });
      console.log(`  ${p.name} ${w}px http=${http} overflow=${medida.overflowEls} menorFonte=${medida.menorFontSizePx}px erros=${erros.length}`);
      await context.close();
    }
  }

  await browser.close();
  server.close();

  const json = join(OUT, "medidas.json");
  await writeFile(json, JSON.stringify(report, null, 2), "utf-8");
  console.log(`\n${report.paginas.length} capturas`);
  console.log(`medidas: ${json}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
