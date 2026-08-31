import { handlePrices } from './handlers/prices.js';
import { handleMarketData } from './handlers/market-data.js';
import { handleMacroApi } from './handlers/macro-api.js';
import { handleMacroPanel } from './handlers/macro-panel.js';
import { handleAgenda } from './handlers/agenda.js';
import { handleFechamento } from './handlers/fechamento.js';
import { handleStripeWebhook } from './handlers/stripe-webhook.js';
import { handleRelatorioSignup } from './handlers/relatorio-signup.js';
import { handleBtcScenarios } from './handlers/btc-scenarios.js';
import { handleCdiScenarios } from './handlers/cdi-scenarios.js';
import { handleNtnbScenarios } from './handlers/ntnb-scenarios.js';
import { handleUsdbrlScenarios } from './handlers/usdbrl-scenarios.js';
import { handleRelatorioPrices } from './handlers/relatorio-prices.js';
import { applySecurityHeaders } from './utils/headers.js';

const SITE_MAP = {
  'szuchmacher.com.br': 'sz',
  'www.szuchmacher.com.br': 'sz',
  'multi-assets.com': 'multi',
  'www.multi-assets.com': 'multi',
};

const API_ROUTES = {
  '/prices.php': (req, env, ctx) => handlePrices(env, ctx),
  '/market-data.php': (req, env, ctx) => handleMarketData(env, ctx),
  '/relatorio-prices.php': (req, env, ctx) => handleRelatorioPrices(env, ctx),
  '/macro_api.php': (req, env, ctx) => handleMacroApi(req, env),
  '/assets/macro.php': (req, env, ctx) => handleMacroPanel(env, req),
  '/assets/agenda.php': (req, env, ctx) => handleAgenda(env, req),
  '/stripe-webhook': (req, env, ctx) => handleStripeWebhook(req, env, ctx),
  '/relatorio-signup': (req, env, ctx) => handleRelatorioSignup(req, env),
  '/api/btc-scenarios': (req, env, ctx) => handleBtcScenarios(env, ctx),
  '/api/cdi-scenarios': (req, env, ctx) => handleCdiScenarios(env, ctx),
  '/api/ntnb-scenarios': (req, env, ctx) => handleNtnbScenarios(env, ctx),
  '/api/usdbrl-scenarios': (req, env, ctx) => handleUsdbrlScenarios(env, ctx),
  '/health': (req, env, ctx) => handleHealth(env),
};

async function handleHealth(env) {
  const checks = {};
  // KV cache check
  try {
    const ts = Date.now();
    await env.CACHE.put('health-check', String(ts), { expirationTtl: 60 });
    const val = await env.CACHE.get('health-check');
    checks.kv = val ? 'ok' : 'write-read-mismatch';
  } catch (e) {
    checks.kv = 'fail';
  }
  // Macro cache freshness
  try {
    const macro = await env.CACHE.get('macro-api', { type: 'json' });
    checks.macro_cache = macro?.generated_at ?? 'empty';
  } catch {
    checks.macro_cache = 'unavailable';
  }
  try {
    const last = await env.CACHE.get('macro-cron-last', { type: 'json' });
    checks.macro_cron_last = last ?? 'empty';
  } catch {
    checks.macro_cron_last = 'unavailable';
  }
  return new Response(JSON.stringify({
    status: 'ok',
    version: 'sz-sites-worker',
    checks,
    ts: Math.floor(Date.now() / 1000),
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// Extensoes de midia que exigem suporte a Range (video/audio). O binding
// env.ASSETS.fetch() ignora o header Range e devolve o arquivo inteiro (HTTP 200),
// o que quebra o playback no Safari/iOS. Para esses tipos, o Worker sintetiza o 206.
const RANGE_TYPES = /\.(mp4|webm|mov|m4v|m4a|ogg|ogv|mp3|wav)$/i;

// Adiciona Range/206 a respostas de midia. So bufferiza quando ha header Range;
// sem Range apenas anuncia Accept-Ranges e repassa o stream (custo zero).
async function withRangeSupport(res, request, path) {
  if (!RANGE_TYPES.test(path)) return res;
  if (res.status !== 200) return res; // 206 do ASSETS, 304, 404 etc.: repassa

  const range = request.headers.get('Range');
  if (!range) {
    const h = new Headers(res.headers);
    h.set('Accept-Ranges', 'bytes');
    return new Response(res.body, { status: 200, statusText: res.statusText, headers: h });
  }

  const buf = await res.arrayBuffer();
  const total = buf.byteLength;
  const h = new Headers(res.headers);
  h.set('Accept-Ranges', 'bytes');

  // Formatos aceitos: bytes=start-end, bytes=start-, bytes=-suffix
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!m || (m[1] === '' && m[2] === '')) {
    h.set('Content-Length', String(total));
    return new Response(buf, { status: 200, statusText: 'OK', headers: h });
  }

  let start, end;
  if (m[1] === '') {
    const suffix = parseInt(m[2], 10);
    start = suffix <= 0 ? total : Math.max(0, total - suffix);
    end = total - 1;
  } else {
    start = parseInt(m[1], 10);
    end = m[2] === '' ? total - 1 : Math.min(parseInt(m[2], 10), total - 1);
  }

  if (start >= total || start > end) {
    h.set('Content-Range', `bytes */${total}`);
    return new Response(null, { status: 416, statusText: 'Range Not Satisfiable', headers: h });
  }

  const slice = buf.slice(start, end + 1);
  h.set('Content-Range', `bytes ${start}-${end}/${total}`);
  h.set('Content-Length', String(slice.byteLength));
  return new Response(slice, { status: 206, statusText: 'Partial Content', headers: h });
}

function normalizeHost(host) {
  return (host || '').toLowerCase();
}

function redirect(url, status = 301) {
  return Response.redirect(url, status);
}

export async function fetchAsset(request, env, assetUrl, hops = 0) {
  if (hops > 3) return new Response('Asset loop', { status: 500 });
  // new Request(assetUrl, request) repassava o request inteiro, e o construtor
  // rejeita body em GET/HEAD. Cliente que manda GET com Content-Length: 0
  // (ex.: .NET) 500ava aqui. Reconstroi so com method e headers, sem body.
  const res = await env.ASSETS.fetch(
    new Request(assetUrl, { method: request.method, headers: request.headers }),
  );
  if (![301, 302, 307, 308].includes(res.status)) return res;
  const loc = res.headers.get('Location');
  if (!loc) return res;
  const next = new URL(loc, assetUrl);
  return fetchAsset(request, env, next, hops + 1);
}

async function serveStatic(request, env, siteKey) {
  const publicUrl = new URL(request.url);
  let path = publicUrl.pathname;

  if (path.endsWith('/') && path.length > 1) path = path.slice(0, -1);
  if (path === '/') path = '/index.html';
  else if (!/\.\w+$/.test(path)) path += '.html';

  const assetUrl = new URL(request.url);
  assetUrl.pathname = `/${siteKey}${path}`;
  let res = await fetchAsset(request, env, assetUrl);

  if (res.status === 404 && path.endsWith('.html')) {
    const bare = path.replace(/\.html$/, '');
    if (bare !== path) {
      assetUrl.pathname = `/${siteKey}${bare}`;
      res = await fetchAsset(request, env, assetUrl);
    }
  }

  if ([301, 302, 307, 308].includes(res.status)) {
    return new Response('Asset missing', { status: 404 });
  }

  // Garantir charset UTF-8 em HTML/JSON/JS/CSS (evita mojibake no browser)
  const ct = res.headers.get('Content-Type') || '';
  const pathLower = path.toLowerCase();
  let nextType = null;
  if (pathLower.endsWith('.html') || pathLower.endsWith('/')) {
    nextType = 'text/html; charset=utf-8';
  } else if (pathLower.endsWith('.js')) {
    nextType = 'application/javascript; charset=utf-8';
  } else if (pathLower.endsWith('.css')) {
    nextType = 'text/css; charset=utf-8';
  } else if (pathLower.endsWith('.json')) {
    nextType = 'application/json; charset=utf-8';
  }
  if (nextType && !/charset=/i.test(ct)) {
    const headers = new Headers(res.headers);
    headers.set('Content-Type', nextType);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  }

  return withRangeSupport(res, request, path);
}

async function routeRequest(request, env, ctx) {
  const url = new URL(request.url);
  const host = normalizeHost(url.hostname);
  const siteKey = SITE_MAP[host];

  if (!siteKey) {
    return applySecurityHeaders(
      new Response('Site não configurado', { status: 404 }),
      host
    );
  }

  if (host.startsWith('www.')) {
    const apex = host.replace(/^www\./, '');
    return redirect(`${url.protocol}//${apex}${url.pathname}${url.search}`);
  }

  if (url.pathname.startsWith('/sz/') || url.pathname.startsWith('/multi/')) {
    return applySecurityHeaders(
      new Response('Not found', { status: 404 }),
      host
    );
  }

  if (siteKey === 'sz') {
    if (url.pathname === '/multiasset-app.html' || url.pathname === '/multiasset.html') {
      return redirect('https://multi-assets.com/');
    }
    // Ebook descontinuado (2026-07-18). A pagina estava indexada e no sitemap:
    // 301 para a home preserva o historico de link em vez de devolver 404.
    if (url.pathname === '/ebook' || url.pathname === '/ebook.html') {
      return redirect(`${url.protocol}//${host}/`);
    }
    // Radar ROIC descontinuado (2026-07-22): a amostra publica, com ranking e
    // carteira-modelo por ativo, ficava proxima demais de relatorio de analise
    // (Resolucao CVM 20/2021). 301 para a assinatura preserva o historico de link.
    if (url.pathname === '/radar-roic.html' || url.pathname === '/radar-roic') {
      return redirect(`${url.protocol}//${host}/assinatura.html`);
    }
    if (url.pathname.startsWith('/fechamento/')) {
      const result = await handleFechamento(request, env);
      return applySecurityHeaders(result, host);
    }
  }

  const apiHandler = API_ROUTES[url.pathname];
  if (apiHandler) {
    const result = await apiHandler(request, env, ctx);
    return applySecurityHeaders(result, host);
  }

  const staticRes = await serveStatic(request, env, siteKey);
  return applySecurityHeaders(staticRes, host);
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await routeRequest(request, env, ctx);
    } catch (err) {
      console.error('worker error:', err?.message ?? err);
      const res = new Response(JSON.stringify({ ok: false, error: 'Erro interno do servidor' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
      return applySecurityHeaders(res, (new URL(request.url)).hostname);
    }
  },

  async scheduled(event, env, ctx) {
    // Await (nao so waitUntil): um Response 503 resolve a promise e o
    // painel de Cron Events marca sucesso mesmo sem gravar o KV. O throw
    // depois do registro e o que o runtime observa como falha.
    await runScheduledMacro(env, event);
  },
};

export async function runScheduledMacro(env, event = {}) {
  const started = Date.now();
  const rec = {
    ts: Math.floor(Date.now() / 1000),
    cron: event.cron ?? '0 3 * * MON',
    ok: false,
    status: 0,
    error: null,
    generated_at: null,
    ms: 0,
  };
  try {
    const res = await handleMacroApi(
      new Request('https://cron.local/macro_api.php?cron=1'),
      env,
      { forceRefresh: true },
    );
    const body = await res.clone().json().catch(() => ({}));
    rec.status = res.status;
    rec.ok = !!body.ok;
    rec.error = body.error ?? null;
    rec.generated_at = body.generated_at ?? null;
    rec.ms = Date.now() - started;
    console.log('[scheduled] macro refresh', rec);
    try {
      await env.CACHE.put('macro-cron-last', JSON.stringify(rec), { expirationTtl: 30 * 24 * 3600 });
    } catch (e) {
      console.warn('[scheduled] nao gravou macro-cron-last:', e?.message ?? e);
    }
    if (!rec.ok) {
      throw new Error(`macro cron falhou status=${rec.status} error=${rec.error ?? 'sem detalhe'}`);
    }
    return rec;
  } catch (err) {
    rec.ms = Date.now() - started;
    if (!rec.error) rec.error = err?.message ?? String(err);
    console.error('[scheduled] macro refresh threw', rec.error);
    try {
      await env.CACHE.put('macro-cron-last', JSON.stringify(rec), { expirationTtl: 30 * 24 * 3600 });
    } catch { /* ignore */ }
    throw err;
  }
}