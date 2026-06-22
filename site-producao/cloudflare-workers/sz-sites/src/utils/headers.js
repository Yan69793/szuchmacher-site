const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.clarity.ms https://scripts.clarity.ms https://plausible.io https://s3.tradingview.com https://s.tradingview.com https://cdnjs.cloudflare.com https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
  "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com data:",
  "img-src 'self' data: https:",
  "connect-src 'self' https://szuchmacher.com.br https://multi-assets.com https://economia.awesomeapi.com.br https://api.bcb.gov.br https://brapi.dev https://brasilapi.com.br https://api.coingecko.com https://www.clarity.ms https://*.clarity.ms https://c.clarity.ms https://plausible.io https://formspree.io https://query1.finance.yahoo.com https://cloudflareinsights.com",
  "frame-src https://s.tradingview.com https://www.tradingview.com https://tradingview-widget.com https://www.tradingview-widget.com https://cal.com https://*.cal.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self' https://szuchmacher.com.br https://multi-assets.com https://formspree.io https://cal.com",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join('; ');

export function applySecurityHeaders(response, host) {
  const h = new Headers(response.headers);
  h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  h.set('X-Frame-Options', 'SAMEORIGIN');
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('Permissions-Policy', 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()');
  h.set('Content-Security-Policy', CSP);
  h.set('X-Served-By', 'sz-sites-worker');
  if (host) h.set('X-Site-Host', host);
  h.delete('Server');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: h,
  });
}