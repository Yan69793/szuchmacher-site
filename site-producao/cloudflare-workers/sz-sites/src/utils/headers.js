// CSP base, sem unsafe-eval. O unsafe-inline e allowlist por host, default
// estrito: so quem ainda precisa recebe. O multi-assets.com ainda tem 136
// handlers inline e 257 estilos inline no multiasset-app.html (Fase B do CSP),
// entao mantem unsafe-inline em script-src e style-src. O szuchmacher.com.br
// ja externalizou tudo na Fase A (blocos style/script e atributos style
// viraram assets), entao tira. Host fora desta allowlist (dominio futuro nao
// mapeado) cai no estrito, nao herda politica fraca por omissao.
const MULTI_HOSTS = new Set(['multi-assets.com', 'www.multi-assets.com']);

function buildCSP(host) {
  const inline = MULTI_HOSTS.has(host) ? " 'unsafe-inline'" : '';
  return [
    "default-src 'self'",
    "script-src 'self'" + inline + " https://www.clarity.ms https://scripts.clarity.ms https://plausible.io https://s3.tradingview.com https://s.tradingview.com https://cdnjs.cloudflare.com https://static.cloudflareinsights.com",
    "style-src 'self'" + inline + " https://fonts.googleapis.com https://cdnjs.cloudflare.com",
    "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com data:",
    "img-src 'self' data: https://s3.tradingview.com https://static.cloudflareinsights.com https://*.clarity.ms https://c.bing.com https://szuchmacher.com.br https://multi-assets.com",
    "connect-src 'self' https://szuchmacher.com.br https://multi-assets.com https://economia.awesomeapi.com.br https://api.bcb.gov.br https://brapi.dev https://brasilapi.com.br https://api.coingecko.com https://www.clarity.ms https://*.clarity.ms https://c.clarity.ms https://plausible.io https://formspree.io https://query1.finance.yahoo.com https://cloudflareinsights.com",
    "frame-src https://s.tradingview.com https://www.tradingview.com https://tradingview-widget.com https://www.tradingview-widget.com https://cal.com https://*.cal.com",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self' https://szuchmacher.com.br https://multi-assets.com https://formspree.io https://cal.com",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join('; ');
}

export function applySecurityHeaders(response, host) {
  const h = new Headers(response.headers);
  h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  h.set('X-Frame-Options', 'SAMEORIGIN');
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('Permissions-Policy', 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()');
  h.set('Content-Security-Policy', buildCSP(host));
  h.set('X-Served-By', 'sz-sites-worker');
  if (host) h.set('X-Site-Host', host);
  h.delete('Server');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: h,
  });
}