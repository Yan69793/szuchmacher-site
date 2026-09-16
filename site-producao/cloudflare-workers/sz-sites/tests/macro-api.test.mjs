import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleMacroApi, normalizarAtivos, coerceLlmContent, buildLlmChain, parseAffordableTokens } from '../src/handlers/macro-api.js';
import { runScheduledMacro } from '../src/index.js';

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
    CRON_SECRET: 'teste-cron-secret',
  };
}

function cronReq(secret = 'teste-cron-secret') {
  const headers = { Origin: 'https://szuchmacher.com.br' };
  if (secret) headers['X-Cron-Secret'] = secret;
  return new Request('https://szuchmacher.com.br/macro_api.php?cron=1', { headers });
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
  const r = await handleMacroApi(new Request('https://szuchmacher.com.br/macro_api.php?cron=1'), env, { forceRefresh: true });
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

test('cron=1 sem header devolve 403 e nao chama OpenRouter', async () => {
  const env = makeEnv();
  const r = await handleMacroApi(cronReq(null), env);
  const body = await r.json();
  assert.equal(r.status, 403);
  assert.equal(body.ok, false);
  assert.match(body.error, /CRON_SECRET/);
  assert.equal(openRouterCalls, 0);
});

test('cron=1 com secret errado devolve 403', async () => {
  const env = makeEnv();
  const r = await handleMacroApi(cronReq('errado'), env);
  assert.equal(r.status, 403);
  assert.equal(openRouterCalls, 0);
});

test('cron=1 autenticado respeita o rate limit de 1h', async () => {
  const env = makeEnv();
  await env.CACHE.put('macro-refresh-rate', String(Math.floor(Date.now() / 1000) - 60));
  const r = await handleMacroApi(cronReq(), env);
  const body = await r.json();
  assert.equal(r.status, 429);
  assert.equal(body.error, 'Rate limit');
  assert.equal(openRouterCalls, 0);
});

test('cron=1 autenticado fora da janela grava o KV', async () => {
  const env = makeEnv();
  await env.CACHE.put('macro-refresh-rate', String(Math.floor(Date.now() / 1000) - 7200));
  const r = await handleMacroApi(cronReq(), env);
  const body = await r.json();
  assert.equal(r.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.cache, false);
  assert.equal(openRouterCalls, 1);
  const gravado = JSON.parse(await env.CACHE.get('macro-api'));
  assert.equal(gravado.data.eyebrow, 'Cenário teste');
});

test('forceRefresh interno nao exige header e nao consome rate limit', async () => {
  const env = makeEnv();
  await env.CACHE.put('macro-refresh-rate', String(Math.floor(Date.now() / 1000) - 60));
  const r = await handleMacroApi(req(), env, { forceRefresh: true });
  const body = await r.json();
  assert.equal(r.status, 200);
  assert.equal(body.ok, true);
  assert.equal(openRouterCalls, 1);
});

test('coerceLlmContent aceita array de partes do Anthropic/OpenRouter', () => {
  assert.equal(coerceLlmContent('{"a":1}'), '{"a":1}');
  assert.equal(
    coerceLlmContent([{ type: 'text', text: '{"eyebrow":"x"}' }]),
    '{"eyebrow":"x"}',
  );
  assert.equal(coerceLlmContent(null), '');
});

test('content em array grava o KV no refresh forcado', async () => {
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('bcdata.sgs.432')) return jsonRes([{ valor: '14.75', data: '05/08/2026' }]);
    if (u.includes('bcdata.sgs.1')) return jsonRes([{ valor: '5.20', data: '05/08/2026' }]);
    if (u.includes('ExpectativasMercadoAnuais')) return jsonRes({ value: [{ Mediana: 14.5 }] });
    if (u.includes('openrouter.ai')) {
      openRouterCalls++;
      return jsonRes({
        choices: [{
          finish_reason: 'stop',
          message: { content: [{ type: 'text', text: JSON.stringify({ eyebrow: 'via-array' }) }] },
        }],
      });
    }
    return jsonRes({});
  };
  const env = makeEnv();
  const r = await handleMacroApi(req(), env, { forceRefresh: true });
  const body = await r.json();
  assert.equal(r.status, 200);
  assert.equal(body.data.eyebrow, 'via-array');
  const gravado = JSON.parse(await env.CACHE.get('macro-api'));
  assert.equal(gravado.data.eyebrow, 'via-array');
});

test('scheduled registra falha no KV e lanca quando o refresh devolve 503', async () => {
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('bcdata.sgs')) return jsonRes({}, 500);
    return jsonRes({});
  };
  const env = makeEnv();
  await assert.rejects(() => runScheduledMacro(env, { cron: '0 3 * * MON' }), /macro cron falhou/);
  const last = JSON.parse(await env.CACHE.get('macro-cron-last'));
  assert.equal(last.ok, false);
  assert.equal(last.status, 503);
  assert.match(last.error, /BCB SGS/);
});

test('scheduled grava macro-cron-last e o KV macro-api quando a cascata fecha', async () => {
  const env = makeEnv();
  const rec = await runScheduledMacro(env, { cron: '0 3 * * MON' });
  assert.equal(rec.ok, true);
  const last = JSON.parse(await env.CACHE.get('macro-cron-last'));
  assert.equal(last.ok, true);
  assert.equal(last.status, 200);
  // O watchdog local compara este campo com o schedule declarado no wrangler.jsonc.
  // Se um dos dois mudar sozinho, a comparacao la nunca fecha e o alerta vira ruido.
  assert.equal(last.cron, '0 3 * * MON');
  const gravado = JSON.parse(await env.CACHE.get('macro-api'));
  assert.equal(gravado.data.eyebrow, 'Cenário teste');
});

test('CORS: origin exato da allowlist e ecoado, os 4 hosts do SITE_MAP', async () => {
  const env = makeEnv();
  for (const origin of ['https://szuchmacher.com.br', 'https://www.szuchmacher.com.br', 'https://multi-assets.com', 'https://www.multi-assets.com']) {
    const r = await handleMacroApi(new Request('https://szuchmacher.com.br/macro_api.php', { method: 'OPTIONS', headers: { Origin: origin } }), env);
    assert.equal(r.status, 204);
    assert.equal(r.headers.get('Access-Control-Allow-Origin'), origin, origin);
  }
});

test('CORS: substring maliciosa NAO e ecoada, cai no fallback fixo', async () => {
  const env = makeEnv();
  const maliciosos = ['https://multi-assets.com.evil.io', 'https://evilmulti-assets.com', 'https://szuchmacher.com.br.attacker.net', 'null', ''];
  for (const origin of maliciosos) {
    const headers = origin ? { Origin: origin } : {};
    const r = await handleMacroApi(new Request('https://szuchmacher.com.br/macro_api.php', { method: 'OPTIONS', headers }), env);
    assert.equal(r.status, 204);
    assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://szuchmacher.com.br', `origin "${origin}"`);
  }
});

// --- Regressao do cache vazio (auditoria de 31/08/2026, DIAGNOSTICO §7.1) ---
// Tres defeitos somados deixavam macro-api vazio do deploy ate o cron da segunda
// seguinte. Os testes abaixo cobrem os dois que vivem neste arquivo.

function envComPutsGravados(opts) {
  const env = makeEnv(opts);
  const puts = [];
  const putOriginal = env.CACHE.put.bind(env.CACHE);
  env.CACHE.put = async (key, value, o) => {
    puts.push({ key, value, opts: o });
    return putOriginal(key, value, o);
  };
  return { env, puts };
}

function carimbosDeRate(puts) {
  return puts.filter((p) => p.key === 'macro-refresh-rate');
}

test('tentativa de refresh que falha carimba janela curta, nao a hora cheia', async () => {
  const { env, puts } = envComPutsGravados();
  const stubBase = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('openrouter.ai')) return new Response('upstream down', { status: 503 });
    return stubBase(url, init);
  };

  const r = await handleMacroApi(req(), env);
  assert.equal(r.status, 503, 'sem fallback estatico, a cascata falhada devolve 503');

  const carimbos = carimbosDeRate(puts);
  assert.ok(carimbos.length > 0, 'a janela precisa ser carimbada para conter estouro de manada');
  assert.equal(
    carimbos[carimbos.length - 1].opts?.expirationTtl,
    60,
    'tentativa que nao fechou nao pode bloquear a proxima por 1h',
  );
});

test('refresh que fecha a cascata carimba a hora cheia', async () => {
  const { env, puts } = envComPutsGravados();

  const r = await handleMacroApi(req(), env);
  assert.equal(r.status, 200);

  const carimbos = carimbosDeRate(puts);
  assert.ok(carimbos.length > 0);
  assert.equal(
    carimbos[carimbos.length - 1].opts?.expirationTtl,
    3600,
    'sucesso mantem a janela de 1h que protege o custo da cascata',
  );
});

test('leitura implicita com cache vazio responde fallback e regenera em background', async () => {
  const { env } = envComPutsGravados({ withStaticFallback: true });
  const background = [];
  const ctx = { waitUntil: (p) => background.push(p) };

  const r = await handleMacroApi(req(), env, {}, ctx);
  const body = await r.json();

  assert.equal(r.status, 200);
  assert.equal(body.data.eyebrow, 'estatico', 'visitante recebe o fallback na hora, sem esperar os ~40s');
  assert.equal(background.length, 1, 'a cascata precisa ir para o ctx.waitUntil');

  await Promise.all(background);
  const gravado = JSON.parse(await env.CACHE.get('macro-api'));
  assert.equal(
    gravado.data.eyebrow,
    'Cenário teste',
    'o KV precisa ficar gravado mesmo que o cliente feche a aba',
  );
});

test('sem ctx a leitura implicita continua aguardando a cascata em foreground', async () => {
  const { env } = envComPutsGravados({ withStaticFallback: true });

  const r = await handleMacroApi(req(), env);
  const body = await r.json();

  assert.equal(r.status, 200);
  assert.equal(body.cache, false, 'sem waitUntil disponivel o comportamento antigo se mantem');
  assert.equal(body.data.eyebrow, 'Cenário teste');
});

test('carimbo legado (inteiro solto) continua sendo respeitado como janela de 1h', async () => {
  const env = makeEnv({ withStaticFallback: true });
  await env.CACHE.put('macro-refresh-rate', String(Math.floor(Date.now() / 1000) - 120));

  const r = await handleMacroApi(req(), env);
  const body = await r.json();

  assert.equal(body.note, 'refresh_janela_ativa', 'chave gravada pela versao anterior do Worker nao pode ser ignorada');
  assert.equal(openRouterCalls, 0);
});

// --- Cadeia de provedores (P1-001, 16/09/2026) -----------------------------
// A conta OpenRouter das chaves desta maquina esta com credito zerado (medido:
// 304.005857678 de uso contra 304.0 de credito) e rejeita o refresh com HTTP
// 402 ANTES de chegar ao modelo quando o max_tokens pedido nao cabe no saldo
// ("can only afford 7763"). Eram esses dois defeitos que deixavam o refresh em
// 503: perna unica e retry inexistente. Os testes abaixo cobrem a cadeia com
// DeepSeek e o rebaixamento de max_tokens.

// Corpo real do 402 de affordability, colado do endpoint em 16/09/2026.
const MSG_402_AFFORD = JSON.stringify({
  error: {
    message:
      'This request requires more credits, or fewer max_tokens. You requested up to 8192 tokens, but can only afford 4096. To increase, visit https://openrouter.ai/settings/credits and add more credits',
    code: 402,
    metadata: { limit_source: 'openrouter_credits' },
  },
});

function resposta402(corpo = MSG_402_AFFORD) {
  return new Response(corpo, { status: 402, headers: { 'Content-Type': 'application/json' } });
}

function corpoOk(eyebrow) {
  return jsonRes({ choices: [{ message: { content: JSON.stringify({ eyebrow }) } }] });
}

// Stub por perna: cada entrada e uma funcao (init, n) => Response ou um Response.
function stubCadeia({ openrouter, deepseek } = {}) {
  const chamadas = { openrouter: [], deepseek: [] };
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('bcdata.sgs.432')) return jsonRes([{ valor: '14.75', data: '05/08/2026' }]);
    if (u.includes('bcdata.sgs.1')) return jsonRes([{ valor: '5.20', data: '05/08/2026' }]);
    if (u.includes('ExpectativasMercadoAnuais')) return jsonRes({ value: [{ Mediana: 14.5 }] });
    if (u.includes('deepseek.com')) {
      chamadas.deepseek.push(init);
      return typeof deepseek === 'function' ? deepseek(init, chamadas.deepseek.length) : (deepseek ?? corpoOk('via-deepseek'));
    }
    if (u.includes('openrouter.ai')) {
      chamadas.openrouter.push(init);
      return typeof openrouter === 'function' ? openrouter(init, chamadas.openrouter.length) : (openrouter ?? corpoOk('via-openrouter'));
    }
    return jsonRes({});
  };
  return chamadas;
}

function envCadeia(extra = {}) {
  return { ...makeEnv(), DEEPSEEK_KEY: 'sk-deepseek-teste-123', ...extra };
}

test('buildLlmChain: auto prioriza a perna com credito e so usa chave configurada', () => {
  const semDeepseek = makeEnv();
  assert.deepEqual(buildLlmChain(semDeepseek).map((p) => p.id), ['openrouter']);

  const completa = envCadeia();
  assert.deepEqual(buildLlmChain(completa).map((p) => p.id), ['deepseek', 'openrouter']);

  assert.deepEqual(
    buildLlmChain(envCadeia({ MACRO_LLM_PROVIDER: 'openrouter,deepseek' })).map((p) => p.id),
    ['openrouter', 'deepseek'],
  );
  assert.deepEqual(
    buildLlmChain(envCadeia({ MACRO_LLM_PROVIDER: 'openrouter' })).map((p) => p.id),
    ['openrouter'],
  );
  assert.deepEqual(buildLlmChain({}).map((p) => p.id), [], 'sem chave nenhuma nao ha perna');
  assert.deepEqual(
    buildLlmChain({ OPENROUTER_KEY: 'chave-sem-prefixo' }).map((p) => p.id),
    [],
    'secret OpenRouter truncado/errado nao pode virar perna',
  );
});

test('parseAffordableTokens le o N do corpo real do 402', () => {
  assert.equal(parseAffordableTokens(MSG_402_AFFORD), 4096);
  assert.equal(parseAffordableTokens('saldo insuficiente'), null);
  assert.equal(parseAffordableTokens(null), null);
});

test('auto: a cascata fecha pelo DeepSeek e nao toca a OpenRouter sem credito', async () => {
  const chamadas = stubCadeia();
  const env = envCadeia();
  await env.CACHE.put('macro-refresh-rate', String(Math.floor(Date.now() / 1000) - 7200));

  const r = await handleMacroApi(req(), env);
  const body = await r.json();

  assert.equal(r.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.cache, false);
  assert.equal(body.data.eyebrow, 'via-deepseek');
  assert.equal(chamadas.deepseek.length, 1);
  assert.equal(chamadas.openrouter.length, 0, 'a perna sem credito nao pode ser queimada a cada refresh');

  const envio = JSON.parse(chamadas.deepseek[0].body);
  assert.equal(chamadas.deepseek[0].headers.Authorization, 'Bearer sk-deepseek-teste-123');
  assert.equal(envio.model, 'deepseek-flash');
  assert.equal(envio.max_tokens, 16384, 'a perna de raciocinio precisa de orcamento para reasoning + conteudo');
  assert.deepEqual(envio.response_format, { type: 'json_object' });

  const gravado = JSON.parse(await env.CACHE.get('macro-api'));
  assert.equal(gravado.data.eyebrow, 'via-deepseek');
});

test('perna primaria falhando cai para a seguinte em vez de devolver 503', async () => {
  const chamadas = stubCadeia({ deepseek: new Response('unauthorized', { status: 401 }), openrouter: corpoOk('via-openrouter') });
  const env = envCadeia();
  await env.CACHE.put('macro-refresh-rate', String(Math.floor(Date.now() / 1000) - 7200));

  const r = await handleMacroApi(req(), env);
  const body = await r.json();

  assert.equal(r.status, 200);
  assert.equal(body.data.eyebrow, 'via-openrouter');
  assert.equal(chamadas.deepseek.length, 1);
  assert.equal(chamadas.openrouter.length, 1);
});

test('402 de affordability rebaixa o max_tokens e repete a MESMA perna', async () => {
  const chamadas = stubCadeia({
    openrouter: (init, n) => (n === 1 ? resposta402() : corpoOk('depois-do-rebaixe')),
  });
  const env = envCadeia({ MACRO_LLM_PROVIDER: 'openrouter' });
  await env.CACHE.put('macro-refresh-rate', String(Math.floor(Date.now() / 1000) - 7200));

  const r = await handleMacroApi(req(), env);
  const body = await r.json();

  assert.equal(r.status, 200);
  assert.equal(body.data.eyebrow, 'depois-do-rebaixe');
  assert.equal(chamadas.openrouter.length, 2, 'o 402 de saldo nao pode ser terminal');
  assert.equal(JSON.parse(chamadas.openrouter[0].body).max_tokens, 8192);
  assert.equal(JSON.parse(chamadas.openrouter[1].body).max_tokens, 4096, 'o retry usa o N do corpo, nao uma constante nova');
});

test('402 sem N parseavel nao gera retry e a perna falha uma vez so', async () => {
  const chamadas = stubCadeia({ openrouter: () => resposta402('{"error":{"message":"Insufficient credits"}}') });
  const env = envCadeia({ MACRO_LLM_PROVIDER: 'openrouter' });
  await env.CACHE.put('macro-refresh-rate', String(Math.floor(Date.now() / 1000) - 7200));

  const r = await handleMacroApi(req(), env);
  const body = await r.json();

  assert.equal(r.status, 503);
  assert.equal(body.error, 'OpenRouter falhou');
  assert.equal(body.status, 402);
  assert.equal(chamadas.openrouter.length, 1);
});

test('saldo residual abaixo do piso nao vira retry (payload do macro nao caberia)', async () => {
  const chamadas = stubCadeia({
    openrouter: () => resposta402('{"error":{"message":"You requested up to 8192 tokens, but can only afford 300."}}'),
  });
  const env = envCadeia({ MACRO_LLM_PROVIDER: 'openrouter' });
  await env.CACHE.put('macro-refresh-rate', String(Math.floor(Date.now() / 1000) - 7200));

  const r = await handleMacroApi(req(), env);
  assert.equal(r.status, 503);
  assert.equal(chamadas.openrouter.length, 1);
});

test('todas as pernas falhando: 503 com o motivo de cada uma e sem vazar chave', async () => {
  const chamadas = stubCadeia({
    deepseek: () => new Response('{"error":"saldo"}', { status: 402 }),
    openrouter: () => resposta402('{"error":{"message":"Insufficient credits","code":402}}'),
  });
  const env = envCadeia();
  await env.CACHE.put('macro-refresh-rate', String(Math.floor(Date.now() / 1000) - 7200));

  const r = await handleMacroApi(req(), env);
  const body = await r.json();

  assert.equal(r.status, 503);
  assert.equal(body.ok, false);
  assert.equal(body.error, 'OpenRouter falhou', 'a ultima perna da a cara do erro');
  assert.deepEqual(body.provedores_falhos, [
    { provedor: 'DeepSeek', status: 402 },
    { provedor: 'OpenRouter', status: 402 },
  ]);
  assert.equal(chamadas.deepseek.length, 1);
  assert.equal(chamadas.openrouter.length, 1);
  const serializado = JSON.stringify(body);
  assert.ok(!serializado.includes('sk-deepseek-teste-123'), 'a resposta nao pode ecoar a chave');
  assert.ok(!serializado.includes('sk-teste-123'), 'a resposta nao pode ecoar a chave');
});

test('200 com conteudo vazio nao vence a perna: a cascata segue para a proxima', async () => {
  const chamadas = stubCadeia({
    deepseek: () => jsonRes({ choices: [{ finish_reason: 'length', message: { content: '' } }] }),
    openrouter: () => corpoOk('via-openrouter'),
  });
  const env = envCadeia();
  await env.CACHE.put('macro-refresh-rate', String(Math.floor(Date.now() / 1000) - 7200));

  const r = await handleMacroApi(req(), env);
  const body = await r.json();

  assert.equal(r.status, 200);
  assert.equal(body.data.eyebrow, 'via-openrouter', 'perna com resposta vazia nao pode fechar a cascata');
  assert.equal(chamadas.deepseek.length, 1);
  assert.equal(chamadas.openrouter.length, 1);
});

test('conteudo cortado no teto (finish_reason=length) nao vence a perna', async () => {
  const chamadas = stubCadeia({
    deepseek: () => jsonRes({ choices: [{ finish_reason: 'length', message: { content: '{"eyebrow":"cortado"' } }] }),
    openrouter: () => corpoOk('via-openrouter'),
  });
  const env = envCadeia();
  await env.CACHE.put('macro-refresh-rate', String(Math.floor(Date.now() / 1000) - 7200));

  const r = await handleMacroApi(req(), env);
  const body = await r.json();

  assert.equal(r.status, 200, 'JSON cortado nao pode virar 503 se a proxima perna responde');
  assert.equal(body.data.eyebrow, 'via-openrouter');
  assert.equal(chamadas.deepseek.length, 1);
  assert.equal(chamadas.openrouter.length, 1);
});

test('todas as pernas falhando na leitura implicita: cai no fallback estatico', async () => {
  stubCadeia({ deepseek: () => new Response('down', { status: 500 }), openrouter: () => resposta402() });
  const env = { ...makeEnv({ withStaticFallback: true }), DEEPSEEK_KEY: 'sk-deepseek-teste-123' };
  await env.CACHE.put('macro-refresh-rate', String(Math.floor(Date.now() / 1000) - 7200));

  const r = await handleMacroApi(req(), env);
  const body = await r.json();

  assert.equal(r.status, 200);
  assert.equal(body.cache, true);
  assert.equal(body.data.eyebrow, 'estatico');
});

test('sem nenhuma chave o Worker devolve 503 explicito, nao erro opaco', async () => {
  const env = { ...makeEnv(), OPENROUTER_KEY: undefined };
  const r = await handleMacroApi(req(), env, { forceRefresh: true });
  const body = await r.json();
  assert.equal(r.status, 503);
  assert.match(body.error, /Nenhum provedor de LLM/);
});
