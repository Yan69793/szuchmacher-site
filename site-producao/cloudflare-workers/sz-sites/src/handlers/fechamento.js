const SLUG_RE = /^[0-9]{8}-[0-9a-f]{8}$/;

const NOT_FOUND_HTML = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Not found</title>
<style>body{font-family:Georgia,serif;background:#faf7f2;color:#2a2a2a;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}main{text-align:center;max-width:480px;padding:32px}h1{font-weight:300;letter-spacing:2px;color:#0c1e3a}p{color:#6b6b6b}</style>
</head><body><main><h1>404</h1><p>Documento não disponível.</p></main></body></html>`;

function notFound() {
  return new Response(NOT_FOUND_HTML, {
    status: 404,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

export async function handleFechamento(request, env) {
  const url = new URL(request.url);
  const slug = url.pathname.replace(/^\/fechamento\/?/, '').replace(/\/$/, '');

  if (!SLUG_RE.test(slug)) return notFound();

  const origin = (env.BRIEFING_ORIGIN || 'https://szuchmacher-briefing.prospects-intel.workers.dev').replace(/\/$/, '');
  const fetchToken = env.BRIEFING_FETCH_TOKEN;
  if (!fetchToken) {
    return new Response('Service unavailable', { status: 503 });
  }

  let upstream;
  try {
    upstream = await fetch(`${origin}/${slug}`, {
      headers: { 'X-Fetch-Token': fetchToken },
      cf: { cacheTtl: 300 },
    });
  } catch {
    return notFound();
  }

  if (!upstream.ok) return notFound();

  const html = await upstream.text();
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300',
      'x-robots-tag': 'noindex, nofollow',
      'referrer-policy': 'no-referrer',
    },
  });
}