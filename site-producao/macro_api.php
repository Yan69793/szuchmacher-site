<?php
/**
 * macro_api.php — Szuchmacher Consultoria
 *
 * Fluxo:
 *  1. Cache de 7 dias: se macro_data.json existe e é recente, retorna direto
 *  2. Busca dados ao vivo do BCB (SGS + Olinda/Focus)
 *  3. Monta prompt e chama OpenRouter (claude-haiku-4-5)
 *  4. Persiste resposta em macro_data.json
 *  5. Retorna JSON ao frontend
 *
 * Cron de pré-aquecimento (opcional, toda segunda 09h BRT = 12h UTC):
 *   0 12 * * 1   /usr/local/bin/php /home/USERNAME/public_html/macro_api.php?cron=1
 *
 * Resposta ao front (gerarAnaliseMacro):
 *   { ok: true, generated_at: "...", cache: bool,
 *     data: { eyebrow, alert_*, canais, brasil,
 *             beneficiados, penalizados, cenarios_brent, ativos, premissas_* } }
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Access-Control-Allow-Origin: https://szuchmacher.com.br');
header('Vary: Accept-Encoding');

date_default_timezone_set('America/Sao_Paulo');

$CACHE_FILE = __DIR__ . '/macro_data.json';
$CACHE_TTL  = 7 * 24 * 3600; // 7 dias

// ─── 1. Verificar cache ───────────────────────────────────────────────────
$isCron = isset($_GET['cron']) && $_GET['cron'] === '1';

// Fail-closed no refresh: o caminho cron dispara chamada paga ao OpenRouter e
// regrava macro_data.json. Sem CRON_SECRET definido na origem, o refresh fica
// desativado. O cron agendado (Szuchmacher-MacroCron) bate na URL publica, que
// e servida pelo Worker, nao neste arquivo, entao nada que existe hoje quebra.
$cronSecret = getenv('CRON_SECRET');
if ($isCron) {
    $tokenOk = is_string($cronSecret) && $cronSecret !== ''
        && isset($_GET['token']) && hash_equals($cronSecret, (string) $_GET['token']);
    if (!$tokenOk) {
        http_response_code(403);
        echo json_encode(['ok' => false, 'error' => 'Refresh não autorizado: CRON_SECRET ausente ou token inválido']);
        exit;
    }
}

if (!$isCron && file_exists($CACHE_FILE)) {
    $age = time() - filemtime($CACHE_FILE);
    if ($age < $CACHE_TTL) {
        $raw     = file_get_contents($CACHE_FILE);
        $payload = json_decode($raw, true);
        if ($payload && isset($payload['data'])) {
            echo json_encode([
                'ok'           => true,
                'generated_at' => $payload['generated_at'] ?? '',
                'cache'        => true,
                'data'         => $payload['data'],
            ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            exit;
        }
    }
}

// ─── Carregar credenciais ─────────────────────────────────────────────────
$cfg = __DIR__ . '/config.php';
if (!file_exists($cfg)) {
    http_response_code(503);
    echo json_encode(['ok' => false, 'error' => 'config.php ausente no servidor']);
    exit;
}
require_once $cfg;

if (!defined('OPENROUTER_KEY') || strpos(OPENROUTER_KEY, 'NOVA_CHAVE') !== false) {
    http_response_code(503);
    echo json_encode(['ok' => false, 'error' => 'OPENROUTER_KEY não configurada em config.php']);
    exit;
}

// ─── 2. Buscar dados BCB ──────────────────────────────────────────────────

function bcb_sgs(int $serie): ?array
{
    $url = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.{$serie}/dados/ultimos/1?formato=json";
    $ctx = stream_context_create(['http' => ['timeout' => 8, 'ignore_errors' => true]]);
    $raw = @file_get_contents($url, false, $ctx);
    if ($raw === false) return null;
    $arr = json_decode($raw, true);
    return (is_array($arr) && isset($arr[0])) ? $arr[0] : null;
}

function bcb_focus(string $indicador, int $anoRef): ?float
{
    $filter = "Indicador eq '{$indicador}' and baseCalculo eq 0 and DataReferencia eq '{$anoRef}'";
    $enc = rawurlencode($filter);
    $url = "https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/"
         . "ExpectativasMercadoAnuais?\$filter={$enc}&\$top=1&\$orderby=Data%20desc"
         . "&\$format=json";
    $ctx = stream_context_create(['http' => ['timeout' => 8, 'ignore_errors' => true]]);
    $raw = @file_get_contents($url, false, $ctx);
    if ($raw === false) return null;
    $arr = json_decode($raw, true);
    if (!isset($arr['value'][0]['Mediana'])) return null;
    return (float)$arr['value'][0]['Mediana'];
}

// Selic meta (série 432)
$selic_sgs   = bcb_sgs(432);
$selic_valor = $selic_sgs['valor'] ?? '14.75';
$selic_data  = $selic_sgs['data']  ?? date('d/m/Y');

// PTAX — cotação de venda do dólar (série 1)
$ptax_sgs   = bcb_sgs(1);
$ptax_valor = $ptax_sgs['valor'] ?? '5.20';
$ptax_data  = $ptax_sgs['data']  ?? date('d/m/Y');

// Focus — medianas do mercado para o ano corrente
$anoAtual     = (int)date('Y');
$focus_selic  = bcb_focus('Selic',     $anoAtual) ?? 14.75;
$focus_ipca   = bcb_focus('IPCA',      $anoAtual) ?? 5.5;
$focus_cambio = bcb_focus('Câmbio',    $anoAtual) ?? 5.20;
$focus_pib    = bcb_focus('PIB Total', $anoAtual) ?? 2.0;

// ─── 3. Montar prompt ─────────────────────────────────────────────────────
$dataHoje = date('d/m/Y');

$prompt = <<<PROMPT
Você é o analista de macro do Szuchmacher Consultoria, advisory patrimonial independente voltado para investidores de alta renda.
Data de hoje: {$dataHoje}.

DADOS BCB AO VIVO:
- Selic meta: {$selic_valor}% a.a. (referência: {$selic_data})
- PTAX USD/BRL: R\$ {$ptax_valor} (referência: {$ptax_data})

FOCUS — Medianas do mercado ({$anoAtual}):
- Selic fim de ano: {$focus_selic}% a.a.
- IPCA: {$focus_ipca}%
- Câmbio (USD/BRL): R\$ {$focus_cambio}
- PIB Real: {$focus_pib}%

Gere um JSON VÁLIDO com a estrutura EXATA abaixo. Tom técnico, analítico, para investidores sofisticados. Português do Brasil. Não inclua nada fora do JSON.

Em "ativos", o campo "alocacao_sugerida" é a faixa de percentual DO PATRIMÔNIO a alocar no ativo. Nunca é retorno esperado nem taxa ao ano. As premissas de retorno da plataforma são curadas fora deste payload e não devem ser inferidas aqui.

{
  "eyebrow": "string — ex: 'Cenário Global · Junho 2026'",
  "alert_title": "string — headline com 3 dados de mercado chave: Selic, câmbio e evento dominante",
  "alert_text": "string — 4 a 6 linhas analisando o cenário macro com base nos dados acima",
  "alert_badge": "string — evento dominante da semana, ex: 'COPOM 18/JUN' ou 'FOCUS SEG'",
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
    "<strong>Nome do Ativo/Setor</strong> — motivo em 1 linha",
    "<strong>Nome</strong> — motivo",
    "<strong>Nome</strong> — motivo",
    "<strong>Nome</strong> — motivo",
    "<strong>Nome</strong> — motivo"
  ],
  "penalizados": [
    "<strong>Nome do Ativo/Setor</strong> — motivo em 1 linha",
    "<strong>Nome</strong> — motivo",
    "<strong>Nome</strong> — motivo",
    "<strong>Nome</strong> — motivo",
    "<strong>Nome</strong> — motivo"
  ],
  "cenarios_brent": [
    "<strong>Cenário 1 — Título:</strong> análise de 2 a 3 linhas",
    "<strong>Cenário 2 — Título:</strong> ...",
    "<strong>Cenário 3 — Título:</strong> ...",
    "<strong>Cenário 4 — Título:</strong> ...",
    "<strong>Cenário 5 — Título:</strong> ..."
  ],
  "ativos": {
    "ouro":    {"conservador": {"alocacao_sugerida": "faixa de % do patrimônio, ex: '5-8% do patrimônio'", "desc": "string"}, "moderado": {"alocacao_sugerida": "string", "desc": "string"}, "agressivo": {"alocacao_sugerida": "string", "desc": "string"}},
    "prata":   {"conservador": {"alocacao_sugerida": "string", "desc": "string"}, "moderado": {"alocacao_sugerida": "string", "desc": "string"}, "agressivo": {"alocacao_sugerida": "string", "desc": "string"}},
    "platina": {"conservador": {"alocacao_sugerida": "string", "desc": "string"}, "moderado": {"alocacao_sugerida": "string", "desc": "string"}, "agressivo": {"alocacao_sugerida": "string", "desc": "string"}},
    "bitcoin": {"conservador": {"alocacao_sugerida": "string", "desc": "string"}, "moderado": {"alocacao_sugerida": "string", "desc": "string"}, "agressivo": {"alocacao_sugerida": "string", "desc": "string"}}
  },
  "premissas_perfis":   {"conservador": "1 frase", "moderado": "1 frase", "arrojado": "1 frase"},
  "premissas_cenarios": {"pessimista": "1 frase",  "base": "1 frase",     "otimista": "1 frase"}
}
PROMPT;

// ─── 4. Chamar OpenRouter ─────────────────────────────────────────────────
$req_body = json_encode([
    'model'       => OPENROUTER_MODEL,
    'messages'    => [['role' => 'user', 'content' => $prompt]],
    'temperature' => 0.3,
    'max_tokens'  => 8192,
], JSON_UNESCAPED_UNICODE);

$ch = curl_init(OPENROUTER_URL);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 60,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $req_body,
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json',
        'Authorization: Bearer ' . OPENROUTER_KEY,
        'HTTP-Referer: ' . OPENROUTER_SITE,
        'X-Title: Szuchmacher Macro',
    ],
]);

$or_raw = curl_exec($ch);
$or_err = curl_error($ch);
curl_close($ch);

if ($or_raw === false || !empty($or_err)) {
    error_log('[macro_api] OpenRouter curl error: ' . $or_err);
    http_response_code(503);
    echo json_encode(['ok' => false, 'error' => 'OpenRouter falhou (erro de rede)']);
    exit;
}

$or_resp = json_decode($or_raw, true);
if (empty($or_resp['choices'][0]['message']['content'])) {
    // O corpo bruto do upstream nao pode ecoar para o cliente (pode conter
    // detalhes da resposta do provedor). Vai para o log do servidor.
    error_log('[macro_api] OpenRouter resposta inválida: ' . substr($or_raw, 0, 500));
    http_response_code(503);
    echo json_encode(['ok' => false, 'error' => 'OpenRouter resposta inválida']);
    exit;
}

$content = trim($or_resp['choices'][0]['message']['content']);

// Extrair JSON de bloco markdown se o modelo o empacotar (```json ... ```)
if (preg_match('/```(?:json)?\s*([\s\S]+?)\s*```/i', $content, $m)) {
    $content = trim($m[1]);
} elseif (str_starts_with($content, '```')) {
    // Backtick de abertura mas sem fechamento (truncamento) — extrair o que há entre { e último }
    if (preg_match('/\{[\s\S]+\}/s', $content, $m)) {
        $content = $m[0];
    }
}

$data = json_decode($content, true);
if (json_last_error() !== JSON_ERROR_NONE || !isset($data['eyebrow'])) {
    error_log('[macro_api] JSON do LLM inválido (' . json_last_error_msg() . '): ' . substr($content, 0, 400));
    http_response_code(503);
    echo json_encode(['ok' => false, 'error' => 'JSON do LLM inválido']);
    exit;
}

// ─── 5. Persistir cache ───────────────────────────────────────────────────
$generated_at  = date('d/m/Y \à\s H:i \B\R\T');
$cache_payload = [
    'generated_at' => $generated_at,
    'data'         => $data,
];

// Escrita atomica (temp + rename): dois refreshes concorrentes truncando o
// mesmo arquivo deixariam macro_data.json corrompido para o proximo leitor.
$tmp = $CACHE_FILE . '.tmp';
file_put_contents(
    $tmp,
    json_encode($cache_payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
);
rename($tmp, $CACHE_FILE);

// ─── 6. Retornar ao frontend ──────────────────────────────────────────────
echo json_encode([
    'ok'           => true,
    'generated_at' => $generated_at,
    'cache'        => false,
    'data'         => $data,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
