import { handlePrices } from './handlers/prices.js';
import { handleMarketData } from './handlers/market-data.js';
import { handleMacroApi } from './handlers/macro-api.js';
import { handleMacroPanel } from './handlers/macro-panel.js';
import { handleAgenda } from './handlers/agenda.js';
import { handleFechamento } from './handlers/fechamento.js';
import { applySecurityHeaders } from './utils/headers.js';

const SITE_MAP = {
  'szuchmacher.com.br': 'sz',
  'www.szuchmacher.com.br': 'sz',
  'multi-assets.com': 'multi',
  'www.multi-assets.com': 'multi',
};

const API_ROUTES = {
  '/prices.php': (req, env) => handlePrices(env),
  '/market-data.php': (req, env) => handleMarketData(env),
  '/macro_api.php': (req, env) => handleMacroApi(req, env),
  '/assets/macro.php': (req, env) => handleMacroPanel(env, req),
  '/assets/agenda.php': (req, env) => handleAgenda(env, req),
};

function normalizeHost(host) {
  return (host || '').toLowerCase();
}

function redirect(url, status = 301) {
  return Response.redirect(url, status);
}

async function fetchAsset(request, env, assetUrl, hops = 0) {
  if (hops > 3) return new Response('Asset loop', { status: 500 });
  const res = await env.ASSETS.fetch(new Request(assetUrl, request));
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

  return res;
}

async function routeRequest(request, env) {
  const url = new URL(request.url);
  const host = normalizeHost(url.hostname);
  const siteKey = SITE_MAP[host];

  if (!siteKey) {
    return new Response('Site não configurado', { status: 404 });
  }

  if (host.startsWith('www.')) {
    const apex = host.replace(/^www\./, '');
    return redirect(`${url.protocol}//${apex}${url.pathname}${url.search}`);
  }

  if (url.pathname.startsWith('/sz/') || url.pathname.startsWith('/multi/')) {
    return new Response('Not found', { status: 404 });
  }

  if (siteKey === 'sz') {
    if (url.pathname === '/multiasset-app.html' || url.pathname === '/multiasset.html') {
      return redirect('https://multi-assets.com/');
    }
    if (url.pathname.startsWith('/fechamento/')) {
      const result = await handleFechamento(request, env);
      return applySecurityHeaders(result, host);
    }
  }

  const apiHandler = API_ROUTES[url.pathname];
  if (apiHandler) {
    const result = await apiHandler(request, env);
    return applySecurityHeaders(result, host);
  }

  const staticRes = await serveStatic(request, env, siteKey);
  return applySecurityHeaders(staticRes, host);
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await routeRequest(request, env);
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleMacroApi(new Request('https://cron.local/macro_api.php?cron=1'), env, { forceRefresh: true }));
  },
};