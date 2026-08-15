import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleMacroApi, normalizarAtivos } from '../src/handlers/macro-api.js';

const realFetch = globalThis.fetch;
let openRouterCalls = 0;

function jsonRes(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubFetch() {
  openRouterCalls = 0;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('bcdata.sgs.432')) return jsonRes([{ valor: '14.75', data: '05/08/2026' }]);
    if (u.includes('bcdata.sgs.1')) return jsonRes([{ valor: '5.20', data: '05/08/2026' }]);
    if (u.includes('ExpectativasMercadoAnuais')) return jsonRes({ value: [{ Mediana: 14.5 }] });
    if (u.includes('openrouter.ai')) {
      openRouterCalls++;
      return jsonRes({ choices: [{ message: { content: JSON.stringify({
        eyebrow: 'Cenário teste',
        alert_title: 'titulo',
        alert_text: 'texto',
        alert_badge: 'badge',
      }) } }] });
    }
    return jsonRes({});
  };
}

function makeEnv({ withStaticFallback = false } = {}) {
  const store = new Map();
  return {
    CACHE: {
      async get(key) { return store.get(key) ?? null; },
      async put(key, value) { store.set(key, value); },
    },
    ASSETS: {
      async fetch(req) {
        if (withStaticFallback && String(req.url).includes('/sz/macro_data.json')) {
          return jsonRes({ generated_at: '14/08/2026, 19:00 BRT', data: { eyebrow: 'estatico' } });
        }
        return new Response('nf', { status: 404 });
      },
    },
    OPENROUTER_KEY: 'sk-teste-123',
  };
}

function req() {
  return new Request('https://szuchmacher.com.br/macro_api.php', {
    headers: { Origin: 'https://szuchmacher.com.br' },
  });
}

beforeEach(stubFetch);
afterEach(() => { globalThis.fetch = realFetch; });

test('cache fresco responde do KV sem chamar OpenRouter', async () => {
  const env = makeEnv();
  await env.CACHE.put('macro-api', JSON.stringify({
    generated_at: '14/08/2026, 19:00 BRT',
    data: { eyebrow: 'do cache' },
    ts: Math.floor(Date.now() / 1000),
  }));
  const r = await handleMacroApi(req(), env);
  const body = await r.json();
  assert.equal(r.status, 200);
  assert.equal(body.cache, true);
  assert.equal(body.data.eyebrow, 'do cache');
  assert.equal(openRouterCalls, 0, 'cache fresco nao pode disparar cascata paga');
});

test('cache vencido dentro da janela de refresh serve fallback estatico', async () => {
  const env = makeEnv({ withStaticFallback: true });
  await env.CACHE.put('macro-refresh-rate', String(Math.floor(Date.now() / 1000) - 60));
  const r = await handleMacroApi(req(), env);
  const body = await r.json();
  assert.equal(r.status, 200);
  assert.equal(body.cache, true);
  assert.equal(body.note, 'refresh_janela_ativa');
  assert.equal(body.data.eyebrow, 'estatico');
  assert.equal(openRouterCalls, 0);
});

test('cache vencido dentro da janela sem fallback devolve 503 com retry-after', async () => {
  const env = makeEnv({ withStaticFallback: false });
  await env.CACHE.put('macro-refresh-rate', String(Math.floor(Date.now() / 1000) - 60));
  const r = await handleMacroApi(req(), env);
  const body = await r.json();
  assert.equal(r.status, 503);
  assert.equal(body.ok, false);
  assert.ok(body.retry_after_seconds > 0);
  assert.equal(openRouterCalls, 0);
});

test('cache vencido fora da janela roda a cascata uma vez e grava o KV', async () => {
  const env = makeEnv();
  await env.CACHE.put('macro-refresh-rate', String(Math.floor(Date.now() / 1000) - 7200));
  const r = await handleMacroApi(req(), env);
  const body = await r.json();
  assert.equal(r.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.cache, false);
  assert.equal(openRouterCalls, 1);
  const gravado = JSON.parse(await env.CACHE.get('macro-api'));
  assert.equal(gravado.data.eyebrow, 'Cenário teste');
});

test('KV put da rate key falhando (429 de corrida) nao derruba o request', async () => {
  const env = makeEnv();
  const putOriginal = env.CACHE.put.bind(env.CACHE);
  env.CACHE.put = async (key, value, opts) => {
    if (key === 'macro-refresh-rate') throw new Error('KV write limit excedido');
    return putOriginal(key, value, opts);
  };
  await putOriginal('macro-refresh-rate', String(Math.floor(Date.now() / 1000) - 7200));
  await putOriginal('macro-api', JSON.stringify({
    generated_at: '07/08/2026, 19:00 BRT',
    data: { eyebrow: 'velho' },
    ts: Math.floor(Date.now() / 1000) - 8 * 24 * 3600,
  }));
  const r = await handleMacroApi(req(), env);
  const body = await r.json();
  assert.equal(r.status, 200);
  assert.equal(body.ok, true);
  assert.equal(openRouterCalls, 1, 'a cascata segue mesmo com o put da rate key falhando');
});

test('SGS fora do ar no refresh forcado: 503 sem dados fabricados e sem OpenRouter', async () => {
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('bcdata.sgs')) return jsonRes({}, 500);
    if (u.includes('openrouter.ai')) { openRouterCalls++; return jsonRes({ choices: [] }); }
    return jsonRes({});
  };
  const env = makeEnv();
  const r = await handleMacroApi(new Request('https://szuchmacher.com.br/macro_api.php?cron=1'), env);
  const body = await r.json();
  assert.equal(r.status, 503);
  assert.equal(body.ok, false);
  assert.match(body.error, /BCB SGS/);
  assert.equal(openRouterCalls, 0, 'narrativa com numero fabricado nao pode chegar ao LLM');
});

test('SGS fora do ar na leitura implicita: fallback estatico com warn, sem fabricacao', async () => {
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('bcdata.sgs')) return jsonRes({}, 500);
    if (u.includes('openrouter.ai')) { openRouterCalls++; return jsonRes({ choices: [] }); }
    return jsonRes({});
  };
  const env = makeEnv({ withStaticFallback: true });
  await env.CACHE.put('macro-refresh-rate', String(Math.floor(Date.now() / 1000) - 7200));
  const r = await handleMacroApi(req(), env);
  const body = await r.json();
  assert.equal(r.status, 200);
  assert.equal(body.cache, true);
  assert.equal(body.warn, 'bcb_indisponivel');
  assert.equal(body.data.eyebrow, 'estatico');
  assert.equal(openRouterCalls, 0);
});

test('Focus fora do ar nao bloqueia: prompt recebe marcador de indisponibilidade', async () => {
  // Stub: SGS ok, Focus falha, OpenRouter captura o prompt enviado.
  let promptEnviado = null;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('bcdata.sgs.432')) return jsonRes([{ valor: '14.75', data: '05/08/2026' }]);
    if (u.includes('bcdata.sgs.1')) return jsonRes([{ valor: '5.20', data: '05/08/2026' }]);
    if (u.includes('ExpectativasMercadoAnuais')) return jsonRes({}, 500);
    if (u.includes('openrouter.ai')) {
      openRouterCalls++;
      promptEnviado = JSON.parse(init.body).messages[0].content;
      return jsonRes({ choices: [{ message: { content: JSON.stringify({ eyebrow: 'ok' }) } }] });
    }
    return jsonRes({});
  };
  const env = makeEnv();
  await env.CACHE.put('macro-refresh-rate', String(Math.floor(Date.now() / 1000) - 7200));
  const r = await handleMacroApi(req(), env);
  const body = await r.json();
  assert.equal(r.status, 200);
  assert.equal(body.ok, true);
  assert.equal(openRouterCalls, 1);
  assert.ok(promptEnviado.includes('indisponível'), 'prompt nao pode receber numero fabricado de Focus');
  assert.ok(!promptEnviado.includes('14.5'), 'mediana inventada nao pode entrar no prompt');
});

test('normalizarAtivos renomeia taxa para alocacao_sugerida sem sobrescrever o novo', () => {
  const data = {
    ativos: {
      ouro: {
        conservador: { taxa: '5-8% do patrimonio' },
        moderado: { taxa: '8-12%', alocacao_sugerida: '10-15%' },
      },
    },
  };
  normalizarAtivos(data);
  assert.equal(data.ativos.ouro.conservador.alocacao_sugerida, '5-8% do patrimonio');
  assert.equal(data.ativos.ouro.conservador.taxa, undefined);
  assert.equal(data.ativos.ouro.moderado.alocacao_sugerida, '10-15%');
});
