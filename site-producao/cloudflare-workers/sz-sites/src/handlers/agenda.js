import { jsonResponse } from '../utils/http.js';

export async function handleAgenda(env, request) {
  const url = new URL(request.url);
  url.pathname = '/sz/agenda-data.json';
  const res = await env.ASSETS.fetch(new Request(url, request));
  if (!res.ok) {
    return jsonResponse({ ok: false, error: 'agenda-data.json nao encontrado' }, { status: 503 });
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