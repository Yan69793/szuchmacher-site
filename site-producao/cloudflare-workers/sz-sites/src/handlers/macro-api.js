import { fetchJson, fetchJsonStrict, jsonResponse } from '../utils/http.js';
import { readCache, writeCache, singleFlight } from '../utils/cache.js';

const CACHE_KEY = 'macro-api';
const CACHE_TTL = 7 * 24 * 3600;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL = 'anthropic/claude-haiku-4-5';

// Cadeia de provedores (16/09/2026, P1-001). Ate aqui o handler falava com uma
// unica perna, a OpenRouter, e a conta dessas chaves esta com credito zerado:
// medido no endpoint oficial, 304.005857678 de uso contra 304.0 de credito
// comprado. O modo de falha nao e "sem credito nenhum": a OpenRouter rejeita
// antes de chegar ao modelo quando o max_tokens pedido nao cabe no saldo
// (HTTP 402 "can only afford 7763"), entao o refresh morria com 503 mesmo com a
// chave valida. O DeepSeek (api.deepseek.com, contrato de resposta identico ao
// da OpenAI/OpenRouter) e a segunda perna: mesma conta de operador, credito
// proprio, e fecha a cascata sem depender de recarga da OpenRouter.
const DEEPSEEK_URL_DEFAULT = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL_DEFAULT = 'deepseek-flash';
const LLM_MAX_TOKENS_DEFAULT = 8192;
// Os modelos DeepSeek desta conta sao de raciocinio: parte do orcamento de
// `max_tokens` vai para `reasoning_content` antes de sair qualquer conteudo.
// Medido em 16/09/2026 no endpoint: com max_tokens=400 a resposta voltou com
// content vazio e reasoning_tokens=400 (finish_reason=length); com max_tokens
// 3000 o JSON saiu completo. Por isso a perna DeepSeek pede o dobro do teto da
// OpenRouter, em vez de herdar 8192 e devolver conteudo vazio.
const DEEPSEEK_MAX_TOKENS_DEFAULT = 16384;

// Retry por affordability: quando o 402 traz "can only afford N", o mesmo
// provedor aceita a mesma chamada com max_tokens=N. Abaixo deste piso o payload
// do macro nao cabe e insistir so queima a latencia do visitante.
const LLM_MIN_AFFORDABLE_TOKENS = 1024;

export function parseAffordableTokens(errBody) {
  const m = /can only afford (\d+)/i.exec(String(errBody ?? ''));
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

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
//
// O carimbo e gravado em duas fases desde 31/08/2026. Antes disso ele saia com
// 1h fixa ANTES da cascata rodar, entao qualquer tentativa que nao fechasse
// (upstream 503, cliente desistindo antes dos ~40s) queimava a janela inteira
// sem gravar nada, e o cache ficava vazio ate o cron da segunda seguinte. Agora
// a tentativa em curso carimba 60s, so para conter estouro de manada, e a janela
// cheia e gravada por stampRefreshSuccess depois do writeCache.
const RATE_KEY = 'macro-refresh-rate';
const RATE_TTL = 3600;        // janela cheia, so apos a cascata fechar
const RATE_TTL_INFLIGHT = 60; // janela curta da tentativa em curso

// Valor corrente e {ts, ttl}. Inteiro solto e o formato legado e continua sendo
// lido com a semantica antiga (1h), para nao ignorar chave gravada por uma
// versao anterior do Worker durante o rollout.
function parseRateValue(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.ts === 'number') {
      return { ts: parsed.ts, ttl: typeof parsed.ttl === 'number' ? parsed.ttl : RATE_TTL };
    }
  } catch (e) {
    // formato legado, cai no parseInt abaixo
  }
  const ts = parseInt(raw, 10);
  return Number.isFinite(ts) ? { ts, ttl: RATE_TTL } : null;
}

async function putRateStamp(env, ttl) {
  const now = Math.floor(Date.now() / 1000);
  try {
    await env.CACHE.put(RATE_KEY, JSON.stringify({ ts: now, ttl }), { expirationTtl: ttl });
  } catch (e) {
    // O KV aceita 1 write/s por chave: dois requests concorrentes no
    // vencimento do cache de 7 dias colidem aqui com 429. Engolir (padrao
    // writeCache do cache.js); o custo de permitir outro refresh e
    // irrelevante perto de devolver 500 ao visitante.
    console.warn('[macro-api] KV put macro-refresh-rate falhou:', e.message);
  }
}

async function checkRefreshRate(env, request) {
  const now = Math.floor(Date.now() / 1000);
  let raw = null;
  try {
    raw = await env.CACHE.get(RATE_KEY);
  } catch (e) {
    // Falha transitoria do KV nao pode derrubar o request do macro: sem
    // leitura, o refresh segue permitido (comportamento pre-auditoria).
    console.warn('[macro-api] KV get macro-refresh-rate falhou:', e.message);
  }
  const atual = parseRateValue(raw);
  if (atual) {
    const elapsed = now - atual.ts;
    if (elapsed < atual.ttl) {
      return { allowed: false, retryAfter: atual.ttl - elapsed };
    }
  }
  await putRateStamp(env, RATE_TTL_INFLIGHT);
  return { allowed: true };
}

// Chamada so depois do writeCache do macro-api: promove a janela curta da
// tentativa para a janela cheia de 1h, que e o que protege o custo da cascata.
async function stampRefreshSuccess(env) {
  await putRateStamp(env, RATE_TTL);
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

function resolveSecret(env, name) {
  const raw = env == null ? null : env[name];
  if (raw == null) return '';
  return String(raw).trim();
}

function positiveInt(raw, fallback) {
  const n = parseInt(String(raw ?? '').trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Monta a cadeia de provedores na ordem de tentativa.
// 'auto' (padrao) tenta DeepSeek primeiro quando a chave existe: a perna
// OpenRouter esta com credito zerado e todo refresh comecava por um 402
// garantido. A OpenRouter continua na cadeia como segunda perna, para voltar a
// funcionar no dia em que a conta for recarregada, sem precisar de novo deploy.
// MACRO_LLM_PROVIDER aceita uma ordem explicita separada por virgula
// ('openrouter,deepseek' ou 'deepseek,openrouter') e so ignora provedor sem
// chave configurada. Uma perna so ('openrouter') tambem e aceita.
export function buildLlmChain(env) {
  const pref = (resolveSecret(env, 'MACRO_LLM_PROVIDER') || 'auto').toLowerCase();
  const openrouter = {
    id: 'openrouter',
    label: 'OpenRouter',
    url: resolveSecret(env, 'OPENROUTER_URL') || OPENROUTER_URL,
    key: resolveSecret(env, 'OPENROUTER_KEY'),
    model: resolveSecret(env, 'OPENROUTER_MODEL') || OPENROUTER_MODEL,
    maxTokens: positiveInt(resolveSecret(env, 'OPENROUTER_MAX_TOKENS'), LLM_MAX_TOKENS_DEFAULT),
  };
  const deepseek = {
    id: 'deepseek',
    label: 'DeepSeek',
    url: resolveSecret(env, 'DEEPSEEK_URL') || DEEPSEEK_URL_DEFAULT,
    key: resolveSecret(env, 'DEEPSEEK_KEY') || resolveSecret(env, 'DEEPSEEK_API_KEY'),
    model: resolveSecret(env, 'DEEPSEEK_MODEL') || DEEPSEEK_MODEL_DEFAULT,
    maxTokens: positiveInt(resolveSecret(env, 'DEEPSEEK_MAX_TOKENS'), DEEPSEEK_MAX_TOKENS_DEFAULT),
  };
  // A OpenRouter tem historico de secret truncado/errado em producao, entao
  // mantem a guarda de prefixo. A chave do DeepSeek so precisa existir.
  const disponivel = (p) => (p.id === 'openrouter' ? p.key.startsWith('sk-') : p.key.length > 0);
  const catalogo = { openrouter, deepseek };
  const pedidas = pref.split(',').map((s) => s.trim()).filter((id) => catalogo[id]);
  const ordem = pref === 'auto' || pedidas.length === 0
    ? (disponivel(deepseek) ? ['deepseek', 'openrouter'] : ['openrouter'])
    : pedidas;
  return ordem.map((id) => catalogo[id]).filter(disponivel);
}

// Uma chamada a um provedor da cadeia. Devolve {ok,res} no sucesso e
// {ok:false,status,error} na falha, sem nunca ecoar a chave no erro.
async function callLlmProvider(provider, prompt) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${provider.key}`,
  };
  if (provider.id === 'openrouter') {
    headers['HTTP-Referer'] = 'https://szuchmacher.com.br';
    headers['X-Title'] = 'Szuchmacher Macro API';
  }
  let maxTokens = provider.maxTokens;
  let ultimo = { status: null, error: 'sem tentativa' };
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    let res;
    try {
      res = await fetch(provider.url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: provider.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' },
        }),
      });
    } catch (e) {
      return { ok: false, status: null, error: `fetch falhou: ${e?.message ?? e}` };
    }
    if (!res.ok) {
      const errBody = (await res.text()).slice(0, 500);
      ultimo = { status: res.status, error: errBody.slice(0, 300) };
      // 402 de saldo: o corpo diz quantos tokens ainda cabem, e a mesma chamada
      // passa com esse numero. Sem isso, todo saldo residual era inutil e o
      // visitante recebia 503 com a conta ainda capaz de responder.
      const afford = res.status === 402 ? parseAffordableTokens(errBody) : null;
      if (afford != null && afford < maxTokens && afford >= LLM_MIN_AFFORDABLE_TOKENS) {
        console.warn(`[macro-api] ${provider.label} 402: rebaixando max_tokens ${maxTokens} -> ${afford}`);
        maxTokens = afford;
        continue;
      }
      return { ok: false, ...ultimo };
    }
    // 200 sem conteudo util nao e sucesso: o modelo de raciocinio pode ter
    // gastado todo o max_tokens em reasoning_content (finish_reason=length) ou
    // devolvido resposta ilegivel. Sem isto a perna "venceria" com texto vazio
    // e a cascata morreria em 503 sem consultar a proxima.
    let orJson;
    try {
      orJson = await res.json();
    } catch (e) {
      return { ok: false, status: res.status, error: `resposta ilegivel: ${e?.message ?? e}` };
    }
    const escolha = orJson?.choices?.[0];
    const finish = escolha?.finish_reason ?? escolha?.native_finish_reason ?? null;
    const conteudo = coerceLlmContent(escolha?.message?.content).trim();
    if (!conteudo) {
      console.error(`[macro-api] ${provider.label} resposta vazia`, { finish, status: res.status });
      return {
        ok: false,
        status: res.status,
        error: `resposta vazia (finish_reason=${finish})`,
      };
    }
    if (finish === 'length') {
      // Bateu no teto de max_tokens: o JSON volta cortado e nao ha como salvar
      // o payload. Falha explicita para a proxima perna responder em vez de
      // devolver 503 depois de um JSON.parse que nunca ia fechar.
      console.error(`[macro-api] ${provider.label} bateu no teto de max_tokens`, { finish });
      return { ok: false, status: res.status, error: `conteudo cortado (finish_reason=length, max_tokens=${maxTokens})` };
    }
    return { ok: true, content: conteudo, finish };
  }
  return { ok: false, ...ultimo };
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

export async function handleMacroApi(request, env, { forceRefresh: forceRefreshOpt = false } = {}, ctx = null) {
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

    // Cache vazio, janela livre. Com ctx.waitUntil e fallback estatico na mao, o
    // visitante recebe o estatico imediatamente e a cascata termina em
    // background. Antes desta mudanca a regeneracao rodava em foreground, entao
    // quem fechasse a aba antes dos ~40s tinha a execucao cancelada pelo runtime
    // e o KV nunca era gravado, enquanto o carimbo de rate ja tinha bloqueado a
    // proxima hora. Era o que mantinha o cache vazio depois de todo deploy.
    if (ctx?.waitUntil) {
      const fallback = await loadStaticMacro(env, request);
      if (fallback?.data) {
        ctx.waitUntil(
          singleFlight('macro-api-refresh', () => gerarMacro(env, request, { cors, forceRefresh }))
            .catch((err) => {
              console.error('[macro-api] regeneracao em background falhou:', err?.message ?? err);
            }),
        );
        return jsonResponse({
          ok: true,
          generated_at: fallback.generated_at ?? '',
          cache: true,
          data: fallback.data,
          note: 'regenerando_em_background',
        }, { headers: cors });
      }
    }

    // Single-flight: requests concorrentes que passaram juntos pelo rate check
    // compartilham UMA execucao da cascata, em vez de uma por visitante.
    return await singleFlight('macro-api-refresh', () => gerarMacro(env, request, { cors, forceRefresh }));
  }

  return await gerarMacro(env, request, { cors, forceRefresh });

  // Cascata completa: BCB + Focus + LLM (cadeia DeepSeek/OpenRouter) +
  // persistencia. Extraida em funcao
  // para o caminho de leitura conseguir embrulhar em singleFlight.
  async function gerarMacro(env, request, { cors, forceRefresh }) {
  const chain = buildLlmChain(env);
  if (chain.length === 0) {
    if (forceRefresh) {
      return jsonResponse(
        { ok: false, error: 'Nenhum provedor de LLM configurado no Worker (OPENROUTER_KEY ou DEEPSEEK_KEY)' },
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
    return jsonResponse({ ok: false, error: 'Nenhum provedor de LLM configurado no Worker' }, { status: 503, headers: cors });
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

  // Cadeia de provedores: a primeira perna que responder fecha a cascata. A
  // falha de uma perna nao aborta o refresh, so registra o motivo e passa para
  // a seguinte. So quando TODAS falham o visitante recebe 503.
  const falhas = [];
  let llm = null;
  for (const provider of chain) {
    const out = await callLlmProvider(provider, prompt);
    if (out.ok) {
      llm = { provider, content: out.content, finish: out.finish };
      break;
    }
    falhas.push({ provedor: provider.label, status: out.status ?? null });
    console.error('[macro-api] LLM falhou:', provider.label, out.status ?? '', out.error ?? '');
  }

  if (!llm) {
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
    const ultima = falhas[falhas.length - 1] ?? {};
    return jsonResponse(
      { ok: false, error: `${ultima.provedor ?? 'LLM'} falhou`, status: ultima.status ?? null, provedores_falhos: falhas },
      { status: 503, headers: cors },
    );
  }

  const content = llm.content;
  const finish = llm.finish ?? null;

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
  // A cascata fechou e o KV esta gravado: so agora a janela vira 1h cheia.
  await stampRefreshSuccess(env);

  return jsonResponse({ ok: true, generated_at, cache: false, data }, { headers: { ...cors, 'Cache-Control': 'no-store' } });
  }
}