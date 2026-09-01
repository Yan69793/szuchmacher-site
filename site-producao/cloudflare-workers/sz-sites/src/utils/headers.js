// CSP base, sem unsafe-eval e sem unsafe-inline. Estrito em todos os hosts:
// o szuchmacher.com.br externalizou na Fase A (blocos style/script e atributos
// style viraram assets) e o multi-assets.com na Fase B (136 handlers e 257
// estilos inline do multiasset-app.html viraram data-ev + utilities css +
// multi-app-{1,2,3}.js). Dominio futuro nao mapeado cai no mesmo estrito, nao
// herda politica fraca por omissao.
function buildCSP() {
  return [
    "default-src 'self'",
    "script-src 'self' https://www.clarity.ms https://scripts.clarity.ms https://plausible.io https://s3.tradingview.com https://s.tradingview.com https://cdnjs.cloudflare.com https://static.cloudflareinsights.com",
    "style-src 'self' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
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
  h.set('Content-Security-Policy', buildCSP());
  h.set('X-Served-By', 'sz-sites-worker');
  if (host) h.set('X-Site-Host', host);
  h.delete('Server');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: h,
  });
}