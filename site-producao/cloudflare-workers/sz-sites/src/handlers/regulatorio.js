import { jsonResponse } from '../utils/http.js';

export async function handleRegulatorio(env, request) {
  const url = new URL(request.url);
  url.pathname = '/sz/regulatorio-data.json';
  // new Request(url, request) repassava o request inteiro, e o construtor
  // rejeita body em GET/HEAD. Cliente que manda GET com Content-Length: 0
  // (ex.: .NET) 500ava aqui. Reconstroi so com method e headers, sem body.
  // Mesmo fix de fetchAsset em src/index.js para o mesmo bug (P3-1 de 30/08).
  const res = await env.ASSETS.fetch(
    new Request(url, { method: request.method, headers: request.headers }),
  );
  if (!res.ok) {
    return jsonResponse({ ok: false, error: 'regulatorio-data.json nao encontrado' }, { status: 503 });
  }
  const body = await res.text();
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
