import { jsonResponse } from '../utils/http.js';

// Radar Geopolítico: mesma arquitetura do regulário — arquivo estático
// versionado servido pelo binding ASSETS com cache curto. 503 explícito
// quando o JSON não existe, para o painel esconder a seção em vez de quebrar.
export async function handleGeopolitica(env, request) {
  const url = new URL(request.url);
  url.pathname = '/sz/geopolitica-data.json';
  // Mesmo fix do regulatorio.js (P3-1 de 30/08): reconstrói só method e
  // headers, sem body, porque o construtor rejeita body em GET/HEAD.
  const res = await env.ASSETS.fetch(
    new Request(url, { method: request.method, headers: request.headers }),
  );
  if (!res.ok) {
    return jsonResponse({ ok: false, error: 'geopolitica-data.json nao encontrado' }, { status: 503 });
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
