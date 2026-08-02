import { fetchJson, jsonResponse } from '../utils/http.js';
import { readCache, writeCache } from '../utils/cache.js';

const CACHE_KEY = 'macro-api';
const CACHE_TTL = 7 * 24 * 3600;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL = 'anthropic/claude-haiku-4-5';

async function bcbSgs(serie) {
  const j = await fetchJson(
    `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados/ultimos/1?formato=json`,
    { timeout: 8000 },
  );
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
  const j = await fetchJson(focusUrl(indicador, anoRef), { timeout: 12000 });
  const med = j?.value?.[0]?.Mediana;
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
- Selic fim de ano: ${data.focus_selic}% a.a.
- IPCA: ${data.focus_ipca}%
- Câmbio (USD/BRL): R$ ${data.focus_cambio}
- PIB Real: ${data.focus_pib}%

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
// IMPORTANT: only CHECK here — markRefreshDone() after successful generation.
// Putting the key before success caused 429 "ghost" after 503 (audit P1/P2).
const RATE_TTL = 3600; // 1 hour between refreshes
const RATE_KEY = 'macro-refresh-rate';

async function checkRefreshRate(env) {
  const now = Math.floor(Date.now() / 1000);
  const lastRefresh = await env.CACHE.get(RATE_KEY);
  if (lastRefresh) {
    const elapsed = now - parseInt(lastRefresh, 10);
    if (elapsed < RATE_TTL) {
      return { allowed: false, retryAfter: RATE_TTL - elapsed };
    }
  }
  return { allowed: true };
}

async function markRefreshDone(env) {
  const now = Math.floor(Date.now() / 1000);
  await env.CACHE.put(RATE_KEY, String(now), { expirationTtl: RATE_TTL });
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

export async function handleMacroApi(request, env, { forceRefresh: forceRefreshOpt = false } = {}) {
  const reqUrl = new URL(request.url);
  const forceRefresh =
    forceRefreshOpt || reqUrl.searchParams.get('cron') === '1' || reqUrl.searchParams.has('refresh');

  const origin = request.headers.get('Origin') || '';
  const cors = {
    'Access-Control-Allow-Origin':
      origin.includes('multi-assets.com') || origin.includes('szuchmacher.com.br')
        ? origin
        : 'https://szuchmacher.com.br',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    Vary: 'Origin',
  };

  // Rate limit external refresh. Internal scheduled cron uses forceRefreshOpt=true.
  // Optional CRON_SECRET header bypasses rate limit for local Task Scheduler.
  const cronSecret = env.CRON_SECRET ? String(env.CRON_SECRET).trim() : '';
  const providedSecret = (request.headers.get('X-Cron-Secret') || '').trim();
  const secretOk = Boolean(cronSecret && providedSecret && providedSecret === cronSecret);
  if (forceRefresh && !forceRefreshOpt && !secretOk) {
    const rate = await checkRefreshRate(env);
    if (!rate.allowed) {
      return jsonResponse(
        { ok: false, error: 'Rate limit', retry_after_seconds: rate.retryAfter },
        { status: 429, headers: { ...cors, 'Retry-After': String(rate.retryAfter) } },
      );
    }
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
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
  }

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
  const anoAtual = new Date().getFullYear();
  const prompt = buildPrompt({
    dataHoje: brtDate(),
    selic_valor: selicSgs?.valor ?? '14.75',
    selic_data: selicSgs?.data ?? brtDate(),
    ptax_valor: ptaxSgs?.valor ?? '5.20',
    ptax_data: ptaxSgs?.data ?? brtDate(),
    anoAtual,
    focus_selic: (await bcbFocus('Selic', anoAtual)) ?? 14.75,
    focus_ipca: (await bcbFocus('IPCA', anoAtual)) ?? 5.5,
    focus_cambio: (await bcbFocus('Câmbio', anoAtual)) ?? 5.2,
    focus_pib: (await bcbFocus('PIB Total', anoAtual)) ?? 2.0,
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
      max_tokens: 4096,
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
  const content = orJson?.choices?.[0]?.message?.content;
  if (!content) {
    return jsonResponse({ ok: false, error: 'OpenRouter resposta inválida' }, { status: 503, headers: cors });
  }

  let data;
  try {
    data = extractJson(content);
  } catch (e) {
    console.error("LLM JSON parse error:", e?.message ?? e);
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

  // Count rate limit only after a successful LLM refresh (not on 503/parse failure).
  if (forceRefresh && !forceRefreshOpt) {
    try {
      await markRefreshDone(env);
    } catch {
      /* non-fatal */
    }
  }

  return jsonResponse({ ok: true, generated_at, cache: false, data }, { headers: { ...cors, 'Cache-Control': 'no-store' } });
}