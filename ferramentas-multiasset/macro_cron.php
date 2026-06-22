<?php
/**
 * macro_cron.php — Szuchmacher Consultoria
 *
 * Chamado pelo Cron Job do HostGator uma vez por dia (ex: 23:00 BRT).
 * Chama OpenRouter, gera análise macro atualizada, salva em macro_data.json.
 *
 * SETUP NO HOSTGATOR:
 *   cPanel → Cron Jobs → Add New Cron Job
 *   Minute: 0  |  Hour: 2  |  Day: *  |  Month: *  |  Weekday: *
 *   (02:00 UTC = 23:00 BRT)
 *   Command: /usr/local/bin/php /home/SEU_USUARIO/public_html/macro_cron.php >> /dev/null 2>&1
 *
 * SEGURANÇA: Este arquivo NÃO deve ser acessível publicamente.
 * Adicione ao .htaccess na raiz:
 *   <Files "macro_cron.php">
 *       Order allow,deny
 *       Deny from all
 *   </Files>
 */

// ── CONFIGURAÇÃO ──────────────────────────────────────────────────
// OBSOLETO (2026-06-14): substituído pela Opção B — macro_api.php lê macro_data.json
// editorial curado. NÃO reagendar este cron: ele sobrescreve o editorial via LLM.
// Chave removida do código; defina OPENROUTER_KEY no ambiente apenas se for reutilizar.
define('OPENROUTER_KEY', getenv('OPENROUTER_KEY') ?: '');
define('OUTPUT_FILE',    __DIR__ . '/macro_data.json');
define('LOG_FILE',       __DIR__ . '/macro_cron.log');
define('MAX_AGE_HOURS',  23); // não regera se o arquivo tiver menos de 23h

// ── FUNÇÕES AUXILIARES ────────────────────────────────────────────
function logMsg($msg) {
    $ts = date('Y-m-d H:i:s T');
    file_put_contents(LOG_FILE, "[{$ts}] {$msg}\n", FILE_APPEND);
}

function fileIsStale() {
    if (!file_exists(OUTPUT_FILE)) return true;
    $age = (time() - filemtime(OUTPUT_FILE)) / 3600;
    return $age >= MAX_AGE_HOURS;
}

function callOpenRouter($model, $prompt) {
    $payload = json_encode([
        'model'       => $model,
        'messages'    => [['role' => 'user', 'content' => $prompt]],
        'temperature' => 0.3,
        'max_tokens'  => 3000,
    ]);

    $ch = curl_init('https://openrouter.ai/api/v1/chat/completions');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_TIMEOUT        => 45,
        CURLOPT_HTTPHEADER     => [
            'Authorization: Bearer ' . OPENROUTER_KEY,
            'Content-Type: application/json',
            'HTTP-Referer: https://szuchmacher.com.br',
            'X-Title: Szuchmacher Macro Cron',
        ],
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200 || !$response) return null;

    $json = json_decode($response, true);
    $text = $json['choices'][0]['message']['content'] ?? '';

    // Extrai o bloco JSON da resposta
    if (preg_match('/\{[\s\S]*\}/u', $text, $m)) {
        $parsed = json_decode($m[0], true);
        if (json_last_error() === JSON_ERROR_NONE) return $parsed;
    }
    return null;
}

// ── MAIN ──────────────────────────────────────────────────────────
logMsg('Iniciando geração de análise macro.');

if (!fileIsStale()) {
    logMsg('Arquivo recente (< ' . MAX_AGE_HOURS . 'h). Nenhuma ação necessária.');
    exit(0);
}

// Data de hoje no fuso de Brasília
$tz   = new DateTimeZone('America/Sao_Paulo');
$hoje = (new DateTime('now', $tz))->format('d \d\e F \d\e Y');

$prompt = <<<PROMPT
Você é um analista macroeconômico sênior. Gere uma análise macro atualizada para hoje ({$hoje}) em formato JSON estrito, sem markdown, sem explicações fora do JSON.

REGRA ABSOLUTA: Nunca inclua citações ou referências numéricas nos textos. Proibido usar [1], [2], [3] ou qualquer colchete com número. Escreva de forma fluida e direta.

Retorne APENAS este JSON (preencha todos os campos com conteúdo real e atualizado):
{
  "eyebrow": "Cenário Global · [Mês Ano]",
  "alert_title": "[Título do principal evento macro/geopolítico atual]",
  "alert_text": "[2-3 frases descrevendo o contexto macro global atual de forma objetiva e fundamentada]",
  "alert_badge": "[ALERTA ATIVO ou CENÁRIO ESTÁVEL ou ATENÇÃO]",
  "canais": [
    {"variavel": "Petróleo (Brent)", "direcao": "up|down|neutral", "mecanismo": "..."},
    {"variavel": "Inflação Global",  "direcao": "up|down|neutral", "mecanismo": "..."},
    {"variavel": "Juros (Fed / BCB)","direcao": "up|down|neutral", "mecanismo": "..."},
    {"variavel": "PIB Global",       "direcao": "up|down|neutral", "mecanismo": "..."},
    {"variavel": "Dólar (DXY)",      "direcao": "up|down|neutral", "mecanismo": "..."},
    {"variavel": "Real (BRL)",       "direcao": "up|down|neutral", "mecanismo": "..."},
    {"variavel": "Ouro / Prata",     "direcao": "up|down|neutral", "mecanismo": "..."},
    {"variavel": "Bitcoin",          "direcao": "up|down|neutral", "mecanismo": "..."}
  ],
  "brasil": [
    {"label": "SELIC e Ciclo de Cortes",   "text": "..."},
    {"label": "Câmbio e Contas Externas",  "text": "..."},
    {"label": "Renda Fixa e NTN-B",        "text": "..."},
    {"label": "Petrobras e Energia",       "text": "..."}
  ],
  "beneficiados":   ["Setor 1 — motivo", "Setor 2 — motivo", "Setor 3 — motivo", "Setor 4 — motivo", "Setor 5 — motivo"],
  "penalizados":    ["Setor 1 — motivo", "Setor 2 — motivo", "Setor 3 — motivo", "Setor 4 — motivo", "Setor 5 — motivo"],
  "cenarios_brent": ["Cenário 1: descrição", "Cenário 2: descrição", "Cenário 3: descrição", "Cenário 4: descrição"],
  "ativos": {
    "ouro": {
      "conservador": {"taxa": "+X% a.a.", "desc": "1-2 frases sobre cenário conservador para ouro no contexto macro atual"},
      "moderado":    {"taxa": "+X% a.a.", "desc": "1-2 frases sobre cenário moderado para ouro"},
      "agressivo":   {"taxa": "+X% a.a.", "desc": "1-2 frases sobre cenário agressivo para ouro"}
    },
    "prata": {
      "conservador": {"taxa": "+X% a.a.", "desc": "..."},
      "moderado":    {"taxa": "+X% a.a.", "desc": "..."},
      "agressivo":   {"taxa": "+X% a.a.", "desc": "..."}
    },
    "platina": {
      "conservador": {"taxa": "−X% a.a. ou +X% a.a.", "desc": "..."},
      "moderado":    {"taxa": "+X% a.a.", "desc": "..."},
      "agressivo":   {"taxa": "+X% a.a.", "desc": "..."}
    },
    "bitcoin": {
      "conservador": {"taxa": "−X% total ou +X% a.a.", "desc": "..."},
      "moderado":    {"taxa": "+X% a.a.", "desc": "..."},
      "agressivo":   {"taxa": "+X% a.a.", "desc": "..."}
    }
  },
  "fontes": "Reuters, Agência Brasil, BCB, Bloomberg"
}
PROMPT;

// Modelos em ordem de prioridade
// Perplexity primeiro — tem busca web real (custo ~R$0,05/chamada)
// Gratuitos como fallback
$models = [
    'perplexity/sonar',                              // busca web real, ~$0.005/call
    'google/gemini-2.5-flash-preview-05-20:free',   // gratuito, bom contexto
    'google/gemini-2.0-flash-exp:free',             // gratuito
    'deepseek/deepseek-r1:free',                    // gratuito, boa qualidade
    'meta-llama/llama-3.3-70b-instruct:free',       // gratuito, fallback
    'qwen/qwen3-14b:free',                          // gratuito, fallback
];

$data = null;
foreach ($models as $model) {
    logMsg("Tentando modelo: {$model}");
    $result = callOpenRouter($model, $prompt);
    if ($result !== null) {
        $data = $result;
        logMsg("Sucesso com modelo: {$model}");
        break;
    }
    logMsg("Falhou: {$model}");
    sleep(2); // pequena pausa entre tentativas
}

if ($data === null) {
    logMsg('ERRO: Todos os modelos falharam. Análise não atualizada.');
    exit(1);
}

// Salva com timestamp
$output = json_encode([
    'timestamp'    => time(),
    'generated_at' => (new DateTime('now', $tz))->format('d/m/Y H:i') . ' BRT',
    'data'         => $data,
], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);

if (file_put_contents(OUTPUT_FILE, $output) === false) {
    logMsg('ERRO: Não foi possível salvar ' . OUTPUT_FILE);
    exit(1);
}

logMsg('Análise salva com sucesso em macro_data.json (' . strlen($output) . ' bytes).');
exit(0);
