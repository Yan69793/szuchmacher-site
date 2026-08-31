import { fetchJson, fetchJsonStrict, jsonResponse } from '../utils/http.js';
import { readCache, writeCache, singleFlight } from '../utils/cache.js';

const CACHE_KEY = 'macro-api';
const CACHE_TTL = 7 * 24 * 3600;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL = 'anthropic/claude-haiku-4-5';

async function bcbSgs(serie) {
  const r = await fetchJsonStrict(
    `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados/ultimos/1?formato=json`,
    { timeout: 8000 },
  );
  if (!r.ok) return null;
  const j = r.data;
  return Array.isArray(j) && j[0] ? j[0] : null;
}

const FOCUS_BASE =
  'https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais';

function focusUrl(indicador, anoRef) {
  const filter = `Indicador eq '${indicador}' and baseCalculo eq 0 and DataReferencia eq '${anoRef}'`;
  return (
    `${FOCUS_BASE}?$top=1` +
    `&$filter=${encodeURIComponent(filter)}` +
    `&$orderby=${encodeURIComponent('Data desc')}` +
    '&$format=json'
  );
}

async function bcbFocus(indicador, anoRef) {
  const r = await fetchJsonStrict(focusUrl(indicador, anoRef), { timeout: 12000 });
  if (!r.ok) return null;
  const med = r.data?.value?.[0]?.Mediana;
  return med != null ? Number(med) : null;
}

function brtDate() {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date());
}

function buildPrompt(data) {
  return `Você é o analista de macro do Szuchmacher Consultoria, advisory patrimonial independente voltado para investidores de alta renda.
Data de hoje: ${data.dataHoje}.

DADOS BCB AO VIVO:
- Selic meta: ${data.selic_valor}% a.a. (referência: ${data.selic_data})
- PTAX USD/BRL: R$ ${data.ptax_valor} (referência: ${data.ptax_data})

FOCUS — Medianas do mercado (${data.anoAtual}):
- Selic fim de ano: ${data.focus_selic}
- IPCA: ${data.focus_ipca}
- Câmbio (USD/BRL): ${data.focus_cambio}
- PIB Real: ${data.focus_pib}

Gere um JSON VÁLIDO com a estrutura EXATA abaixo. Tom técnico, analítico, para investidores sofisticados. Português do Brasil. Não inclua nada fora do JSON.

Em "ativos", o campo "alocacao_sugerida" é a faixa de percentual DO PATRIMÔNIO a alocar no ativo. Nunca é retorno esperado nem taxa ao ano. As premissas de retorno da plataforma são curadas fora deste payload e não devem ser inferidas aqui.

{
  "eyebrow": "string — ex: 'Cenário Global · Junho 2026'",
  "alert_title": "string — headline com 3 dados de mercado chave: Selic, câmbio e evento dominante",
  "alert_text": "string — 4 a 6 linhas analisando o cenário macro com base nos dados acima",
  "alert_badge": "string — evento dominante da semana, ex: 'COPOM 17/JUN' ou 'FOCUS SEG'",
  "canais": [
    {"variavel": "Petróleo (WTI/Brent)", "direcao": "up|down|neutral", "mecanismo": "3 a 4 linhas sobre canal de transmissão"},
    {"variavel": "Inflação Global",       "direcao": "up|down|neutral", "mecanismo": "..."},
    {"variavel": "Juros (Fed / BCB)",     "direcao": "up|down|neutral", "mecanismo": "..."},
    {"variavel": "PIB Global",            "direcao": "up|down|neutral", "mecanismo": "..."},
    {"variavel": "Dólar (DXY)",           "direcao": "up|down|neutral", "mecanismo": "..."},
    {"variavel": "Real (BRL)",            "direcao": "up|down|neutral", "mecanismo": "..."},
    {"variavel": "Ouro",                  "direcao": "up|down|neutral", "mecanismo": "..."},
    {"variavel": "Bitcoin",               "direcao": "up|down|neutral", "mecanismo": "..."}
  ],
  "brasil": [
    {"label": "SELIC e COPOM",                        "text": "4 a 6 linhas"},
    {"label": "Câmbio e Contas Externas",             "text": "..."},
    {"label": "Renda Fixa — Prêmio em NTN-B e DI longo", "text": "..."},
    {"label": "Atividade e Fiscal",                   "text": "..."}
  ],
  "beneficiados": [
    "<strong>Nome do Ativo/Setor</strong> — motivo em 1 linha"
  ],
  "penalizados": [
    "<strong>Nome do Ativo/Setor</strong> — motivo em 1 linha"
  ],
  "cenarios_brent": [
    "<strong>Cenário 1 — Título:</strong> análise de 2 a 3 linhas"
  ],
  "ativos": {
    "ouro":    {"conservador": {"alocacao_sugerida": "faixa de % do patrimônio, ex: '5-8% do patrimônio'", "desc": "string"}, "moderado": {"alocacao_sugerida": "string", "desc": "string"}, "agressivo": {"alocacao_sugerida": "string", "desc": "string"}},
    "prata":   {"conservador": {"alocacao_sugerida": "string", "desc": "string"}, "moderado": {"alocacao_sugerida": "string", "desc": "string"}, "agressivo": {"alocacao_sugerida": "string", "desc": "string"}},
    "platina": {"conservador": {"alocacao_sugerida": "string", "desc": "string"}, "moderado": {"alocacao_sugerida": "string", "desc": "string"}, "agressivo": {"alocacao_sugerida": "string", "desc": "string"}},
    "bitcoin": {"conservador": {"alocacao_sugerida": "string", "desc": "string"}, "moderado": {"alocacao_sugerida": "string", "desc": "string"}, "agressivo": {"alocacao_sugerida": "string", "desc": "string"}}
  },
  "premissas_perfis":   {"conservador": "1 frase", "moderado": "1 frase", "arrojado": "1 frase"},
  "premissas_cenarios": {"pessimista": "1 frase",  "base": "1 frase",     "otimista": "1 frase"}
}`;
}


// Rate limiting: prevent abuse of LLM refresh (costs credits). Uses KV to track
// last refresh timestamp. Minimum 1h between external refresh requests.
async function checkRefreshRate(env, request) {
  const RATE_TTL = 3600; // 1 hour between refreshes
  const key = 'macro-refresh-rate';
  const now = Math.floor(Date.now() / 1000);
  let lastRefresh = null;
  try {
    lastRefresh = await env.CACHE.get(key);
  } catch (e) {
    // Falha transitoria do KV nao pode derrubar o request do macro: sem
    // leitura, o refresh segue permitido (comportamento pre-auditoria).
    console.warn('[macro-api] KV get macro-refresh-rate falhou:', e.message);
  }
  if (lastRefresh) {
    const elapsed = now - parseInt(lastRefresh, 10);
    if (elapsed < RATE_TTL) {
      return { allowed: false, retryAfter: RATE_TTL - elapsed };
    }
  }
  try {
    await env.CACHE.put(key, String(now), { expirationTtl: RATE_TTL });
  } catch (e) {
    // O KV aceita 1 write/s por chave: dois requests concorrentes no
    // vencimento do cache de 7 dias colidem aqui com 429. Engolir (padrao
    // writeCache do cache.js); o custo de permitir outro refresh e
    // irrelevante perto de devolver 500 ao visitante.
    console.warn('[macro-api] KV put macro-refresh-rate falhou:', e.message);
  }
  return { allowed: true };
}

function extractJson(content) {
  let text = content.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/i);
  if (fence) text = fence[1].trim();
  const brace = text.match(/\{[\s\S]*\}/);
  if (brace) text = brace[0];
  try {
    return JSON.parse(text);
  } catch {
    const repaired = text
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/\u201c|\u201d/g, '"')
      .replace(/\u2018|\u2019/g, "'");
    return JSON.parse(repaired);
  }
}

// Renomeia o campo legado `taxa` para `alocacao_sugerida` em ativos[x][perfil].
//
// O schema do prompt ja pede `alocacao_sugerida`, mas o modelo continua
// devolvendo `taxa`: verificado no refresh de 27/07/2026, que gerou texto novo
// e sem `warn: llm_json_fallback`, ou seja, veio do LLM com o schema novo e
// mesmo assim ignorou o nome. Instrucao no prompt nao e barreira. A garantia
// tem que estar depois da resposta, onde nao depende do modelo obedecer.
//
// O campo sempre foi faixa de alocacao ("8-12% do patrimonio"), nunca retorno
// esperado. Ate 27/07/2026 o frontend parseava esse texto como taxa anual e
// capturava o segundo numero da faixa junto com o hifen, projetando ouro a -12%
// a.a. no cenario base. O frontend ja parou de ler o campo; isto fecha a
// origem, para que o nome ambiguo nao volte a circular no payload.
const PERFIS_ATIVO = ['conservador', 'moderado', 'agressivo'];

// Exportada para teste. Os tres pontos de aplicacao (cache, fallback estatico e
// resposta ao vivo) usam esta mesma funcao, mas so o do fallback e alcancavel
// sem chave do LLM, entao a precedencia entre os dois campos precisa de teste
// direto.
export function normalizarAtivos(data) {
  if (!data || typeof data.ativos !== 'object' || data.ativos === null) return data;
  let renomeados = 0;
  for (const ativo of Object.values(data.ativos)) {
    if (!ativo || typeof ativo !== 'object') continue;
    for (const perfil of PERFIS_ATIVO) {
      const bloco = ativo[perfil];
      if (!bloco || typeof bloco !== 'object' || !('taxa' in bloco)) continue;
      // Se o modelo acertar o nome, o valor certo vence. So preenche a partir
      // do legado quando `alocacao_sugerida` esta ausente ou nula.
      if (bloco.alocacao_sugerida == null) bloco.alocacao_sugerida = bloco.taxa;
      delete bloco.taxa;
      renomeados++;
    }
  }
  if (renomeados > 0) {
    console.warn(`[macro-api] campo legado 'taxa' normalizado para 'alocacao_sugerida' em ${renomeados} bloco(s)`);
  }
  return data;
}

async function loadStaticMacro(env, request) {
  const base = new URL(request.url);
  for (const path of ['/sz/macro_data.json', '/multi/macro_data.json']) {
    const url = new URL(base);
    url.pathname = path;
    const res = await env.ASSETS.fetch(new Request(url, request));
    if (!res.ok) continue;
    try {
      const payload = await res.json();
      // O macro_data.json versionado ainda traz `taxa`. Normaliza aqui para o
      // fallback nao reintroduzir o nome legado que os outros caminhos limpam.
      if (payload?.data) {
        normalizarAtivos(payload.data);
        return payload;
      }
    } catch {
      /* try next path */
    }
  }
  return null;
}

function resolveOpenRouterKey(env) {
  const raw = env.OPENROUTER_KEY;
  if (raw == null) return '';
  return String(raw).trim();
}

const CRON_HEADER = 'X-Cron-Secret';

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const enc = new TextEncoder();
  const aa = enc.encode(a);
  const bb = enc.encode(b);
  if (aa.byteLength !== bb.byteLength) return false;
  let out = 0;
  for (let i = 0; i < aa.byteLength; i++) out |= aa[i] ^ bb[i];
  return out === 0;
}

function cronSecretOk(request, env) {
  const expected = env.CRON_SECRET == null ? '' : String(env.CRON_SECRET).trim();
  if (!expected) return false;
  const got = request.headers.get(CRON_HEADER) ?? '';
  return safeEqual(got, expected);
}

function httpRefreshRequested(reqUrl) {
  return reqUrl.searchParams.get('cron') === '1' || reqUrl.searchParams.has('refresh');
}

// OpenRouter/Anthropic às vezes devolve content como array de partes
// ({type:'text', text:'...'}). Sem isto, content.trim() estoura e o cron
// aborta com 503 sem gravar o KV. Medido no GET de 15/08 (warn llm_json_fallback
// com macro-api ausente).
export function coerceLlmContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((p) => {
      if (typeof p === 'string') return p;
      if (p && typeof p.text === 'string') return p.text;
      return '';
    }).join('');
  }
  if (content && typeof content === 'object' && typeof content.text === 'string') {
    return content.text;
  }
  return '';
}

export async function handleMacroApi(request, env, { forceRefresh: forceRefreshOpt = false } = {}) {
  const reqUrl = new URL(request.url);
  const httpRefresh = httpRefreshRequested(reqUrl);

  const origin = request.headers.get('Origin') || '';
  // Allowlist exata, nunca substring. O antigo includes() deixava passar
  // https://multi-assets.com.evil.io e https://evilmulti-assets.com e ecoava
  // o origin de volta no ACAO, liberando leitura cross-origin da API.
  // Fechado em 30/08/2026. Os hosts sao os 4 do SITE_MAP do index.js.
  const ALLOWED_ORIGINS = new Set([
    'https://szuchmacher.com.br',
    'https://www.szuchmacher.com.br',
    'https://multi-assets.com',
    'https://www.multi-assets.com',
  ]);
  const cors = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://szuchmacher.com.br',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': CRON_HEADER,
    Vary: 'Origin',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  // HTTP cron=1/refresh exige header. O cron nativo passa forceRefreshOpt e
  // nao depende deste token. Sem secret no Worker, o refresh HTTP fecha.
  if (httpRefresh && !forceRefreshOpt) {
    if (!cronSecretOk(request, env)) {
      return jsonResponse(
        { ok: false, error: 'Refresh não autorizado: CRON_SECRET ausente ou token inválido' },
        { status: 403, headers: cors },
      );
    }
  }

  const forceRefresh = forceRefreshOpt || httpRefresh;

  // Rate limit so nas chamadas HTTP manuais. scheduled() nao passa por aqui.
  if (forceRefresh && !forceRefreshOpt) {
    const rate = await checkRefreshRate(env, request);
    if (!rate.allowed) {
      return jsonResponse(
        { ok: false, error: 'Rate limit', retry_after_seconds: rate.retryAfter },
        { status: 429, headers: { ...cors, 'Retry-After': String(rate.retryAfter) } },
      );
    }
  }

  if (!forceRefresh) {
    const cached = await readCache(env.CACHE, CACHE_KEY);
    if (cached?.data && cached.ts && Date.now() / 1000 - cached.ts < CACHE_TTL) {
      // O cache tem TTL de 7 dias, entao o payload gravado antes desta mudanca
      // ainda circula com `taxa`. Normaliza na leitura tambem, senao a saida do
      // endpoint fica inconsistente ate o cache velho expirar.
      normalizarAtivos(cached.data);
      return jsonResponse(
        {
          ok: true,
          generated_at: cached.generated_at,
          cache: true,
          data: cached.data,
        },
        { headers: { ...cors, 'Cache-Control': 'no-store' } },
      );
    }

    // Cache vencido ou ausente: o refresh implicito agora respeita a mesma
    // janela de 1h do refresh explicito. Antes desta mudanca, cada visitante
    // que chegasse no vencimento disparava a cascata completa (2 SGS + 4 Focus
    // + OpenRouter pago) em foreground, ~30s de resposta para cada um.
    // Quem chega durante a janela recebe o fallback estatico, que e instantaneo.
    const rate = await checkRefreshRate(env, request);
    if (!rate.allowed) {
      const fallback = await loadStaticMacro(env, request);
      if (fallback?.data) {
        return jsonResponse({
          ok: true,
          generated_at: fallback.generated_at ?? '',
          cache: true,
          data: fallback.data,
          note: 'refresh_janela_ativa',
        }, { headers: cors });
      }
      return jsonResponse(
        { ok: false, error: 'Macro em atualizacao, tente em instantes', retry_after_seconds: rate.retryAfter },
        { status: 503, headers: { ...cors, 'Retry-After': String(rate.retryAfter) } },
      );
    }

    // Single-flight: requests concorrentes que passaram juntos pelo rate check
    // compartilham UMA execucao da cascata, em vez de uma por visitante.
    return await singleFlight('macro-api-refresh', () => gerarMacro(env, request, { cors, forceRefresh }));
  }

  return await gerarMacro(env, request, { cors, forceRefresh });

  // Cascata completa: BCB + Focus + OpenRouter + persistencia. Extraida em funcao
  // para o caminho de leitura conseguir embrulhar em singleFlight.
  async function gerarMacro(env, request, { cors, forceRefresh }) {
  const key = resolveOpenRouterKey(env);
  if (!key || !key.startsWith('sk-')) {
    if (forceRefresh) {
      return jsonResponse(
        { ok: false, error: 'OPENROUTER_KEY inválida ou ausente no Worker' },
        { status: 503, headers: cors },
      );
    }
    const fallback = await loadStaticMacro(env, request);
    if (fallback?.data) {
      return jsonResponse({
        ok: true,
        generated_at: fallback.generated_at ?? '',
        cache: true,
        data: fallback.data,
      }, { headers: cors });
    }
    return jsonResponse({ ok: false, error: 'OPENROUTER_KEY não configurada' }, { status: 503, headers: cors });
  }

  const selicSgs = await bcbSgs(432);
  const ptaxSgs = await bcbSgs(1);

  // Fail-closed: se o BCB SGS nao responde, NAO gerar narrativa com numero
  // fabricado apresentado como "DADOS BCB AO VIVO". Antes desta mudanca o
  // prompt recebia 14.75/5.20 hardcoded em silencio e o texto do LLM saia
  // com cenario falso. O fallback estatico (macro_data.json versionado) e o
  // unico substituto aceitavel para leitura; para refresh forcado, 503 claro.
  if (!selicSgs?.valor || !selicSgs?.data || !ptaxSgs?.valor || !ptaxSgs?.data) {
    console.error('[macro-api] BCB SGS indisponível (selic/ptax ausentes); refresh abortado sem dados fabricados');
    if (!forceRefresh) {
      const fallback = await loadStaticMacro(env, request);
      if (fallback?.data) {
        return jsonResponse({
          ok: true,
          generated_at: fallback.generated_at ?? '',
          cache: true,
          data: fallback.data,
          warn: 'bcb_indisponivel',
        }, { headers: cors });
      }
    }
    return jsonResponse(
      { ok: false, error: 'BCB SGS indisponível, tente mais tarde' },
      { status: 503, headers: cors },
    );
  }

  const anoAtual = new Date().getFullYear();
  const focusSelic = await bcbFocus('Selic', anoAtual);
  const focusIpca = await bcbFocus('IPCA', anoAtual);
  const focusCambio = await bcbFocus('Câmbio', anoAtual);
  const focusPib = await bcbFocus('PIB Total', anoAtual);
  // Focus e complementar, nao bloqueia: mediana ausente vira 'indisponível'
  // no prompt, nunca numero inventado. Campo a campo, para uma mediana fora
  // do ar nao apagar as outras tres que estavam vivas.
  const focusFmt = (v, fmt) => (v != null ? fmt(v) : 'indisponível');

  const prompt = buildPrompt({
    dataHoje: brtDate(),
    selic_valor: selicSgs.valor,
    selic_data: selicSgs.data,
    ptax_valor: ptaxSgs.valor,
    ptax_data: ptaxSgs.data,
    anoAtual,
    focus_selic: focusFmt(focusSelic, (v) => `${v}% a.a.`),
    focus_ipca: focusFmt(focusIpca, (v) => `${v}%`),
    focus_cambio: focusFmt(focusCambio, (v) => `R$ ${v}`),
    focus_pib: focusFmt(focusPib, (v) => `${v}%`),
  });

  const orHeaders = new Headers({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
    'HTTP-Referer': 'https://szuchmacher.com.br',
    'X-Title': 'Szuchmacher Macro API',
  });

  const orRes = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: orHeaders,
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 8192,
      response_format: { type: 'json_object' },
    }),
  });

  if (!orRes.ok) {
    const errBody = (await orRes.text()).slice(0, 300);
    if (!forceRefresh) {
      const fallback = await loadStaticMacro(env, request);
      if (fallback?.data) {
        return jsonResponse({
          ok: true,
          generated_at: fallback.generated_at ?? '',
          cache: true,
          data: fallback.data,
        }, { headers: cors });
      }
    }
    console.error('OpenRouter failed:', orRes.status);
    return jsonResponse(
      { ok: false, error: 'OpenRouter falhou', status: orRes.status },
      { status: 503, headers: cors },
    );
  }

  const orJson = await orRes.json();
  const choice = orJson?.choices?.[0];
  const finish = choice?.finish_reason ?? choice?.native_finish_reason ?? null;
  const content = coerceLlmContent(choice?.message?.content);
  if (!content) {
    console.error('[macro-api] OpenRouter resposta vazia', { finish, status: orRes.status });
    return jsonResponse({ ok: false, error: 'OpenRouter resposta inválida' }, { status: 503, headers: cors });
  }

  let data;
  try {
    data = extractJson(content);
  } catch (e) {
    console.error('[macro-api] LLM JSON parse error', {
      message: e?.message ?? e,
      finish,
      len: content.length,
    });
    if (!forceRefresh) {
      const fallback = await loadStaticMacro(env, request);
      if (fallback?.data) {
        return jsonResponse({
          ok: true,
          generated_at: fallback.generated_at ?? '',
          cache: true,
          data: fallback.data,
          warn: 'llm_json_fallback',
        }, { headers: cors });
      }
    }
    return jsonResponse({ ok: false, error: "JSON do LLM inválido" }, { status: 503, headers: cors });
  }

  if (!data?.eyebrow) {
    return jsonResponse({ ok: false, error: 'JSON do LLM sem campos obrigatórios' }, { status: 503, headers: cors });
  }

  // Antes do writeCache: o cache tem que guardar o payload ja normalizado, para
  // a proxima leitura nao precisar corrigir de novo.
  normalizarAtivos(data);

  const generated_at = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date()) + ' BRT';

  await writeCache(env.CACHE, CACHE_KEY, { generated_at, data, ts: Math.floor(Date.now() / 1000) }, CACHE_TTL);

  return jsonResponse({ ok: true, generated_at, cache: false, data }, { headers: { ...cors, 'Cache-Control': 'no-store' } });
  }
}