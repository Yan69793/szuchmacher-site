<?php
/* =============================================================
 * macro.php — Proxy BCB com cache (15 min) e fallback stale
 *
 * Retorna JSON consolidado com:
 *   - Selic meta atual (SGS 432)
 *   - USD/BRL PTAX (SGS 1)
 *   - Focus agregado (Olinda) para IPCA, Selic, Câmbio, PIB (2026 + 2027)
 *
 * Disciplina probabilística: expomos mediana + p25 + p75 + min/max
 * + nº de respondentes + data da última coleta. Sem projeção própria.
 *
 * Cache: /assets/.cache-macro.json (TTL 15 min)
 * Fallback: se BCB falhar, serve cache ainda que stale, com flag.
 * ============================================================= */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=300');
header('Access-Control-Allow-Origin: *');

define('CACHE_FILE', __DIR__ . '/.cache-macro.json');
define('CACHE_TTL',  900);   // 15 min
define('HTTP_TIMEOUT', 10);
define('FOCUS_TIMEOUT', 12);
define('FOCUS_BASE', 'https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais');

$GLOBALS['MACRO_DIAG'] = [];

function http_get($url, $timeout = HTTP_TIMEOUT) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => $timeout,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_USERAGENT      => 'Mozilla/5.0 (compatible; SzuchmacherMacroProxy/1.1; +https://szuchmacher.com.br)',
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_ENCODING       => '',
        CURLOPT_HTTPHEADER     => ['Accept: application/json'],
    ]);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);
    $GLOBALS['MACRO_DIAG'][] = ['url' => $url, 'code' => $code, 'err' => $err, 'bytes' => strlen((string)$body)];
    if ($code !== 200 || !$body) return null;
    return json_decode($body, true);
}

function focus_url($indicador, $ano) {
    $filter = sprintf(
        "Indicador eq '%s' and baseCalculo eq 0 and DataReferencia eq '%s'",
        $indicador, $ano
    );
    $qs = '$top=1'
        . '&$filter='  . rawurlencode($filter)
        . '&$orderby=' . rawurlencode('Data desc')
        . '&$format=json';
    return FOCUS_BASE . '?' . $qs;
}

function focus_parse_row($row, $indicador, $ano) {
    if (!is_array($row)) return null;
    $resp = $row['numeroRespondentes'] ?? $row['NumeroRespondentes'] ?? null;
    return [
        'indicador'     => $indicador,
        'referencia'    => $ano,
        'data'          => $row['Data'] ?? null,
        'mediana'       => isset($row['Mediana']) ? floatval($row['Mediana']) : null,
        'media'         => isset($row['Media']) ? floatval($row['Media']) : null,
        'desvio_padrao' => isset($row['DesvioPadrao']) ? floatval($row['DesvioPadrao']) : null,
        'minimo'        => isset($row['Minimo']) ? floatval($row['Minimo']) : null,
        'maximo'        => isset($row['Maximo']) ? floatval($row['Maximo']) : null,
        'respondentes'  => $resp !== null ? intval($resp) : null,
    ];
}

function focus_fetch_batch(array $specs) {
    if (empty($specs)) return [];

    $mh = curl_multi_init();
    $handles = [];

    foreach ($specs as $key => $spec) {
        $url = focus_url($spec['indicador'], $spec['ano']);
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => FOCUS_TIMEOUT,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_USERAGENT      => 'Mozilla/5.0 (compatible; SzuchmacherMacroProxy/1.1; +https://szuchmacher.com.br)',
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_ENCODING       => '',
            CURLOPT_HTTPHEADER     => ['Accept: application/json'],
        ]);
        curl_multi_add_handle($mh, $ch);
        $handles[$key] = ['ch' => $ch, 'url' => $url, 'spec' => $spec];
    }

    $running = null;
    do {
        $status = curl_multi_exec($mh, $running);
        if ($running > 0) {
            curl_multi_select($mh, 1.0);
        }
    } while ($running > 0 && $status === CURLM_OK);

    $out = [];
    foreach ($handles as $key => $meta) {
        $ch = $meta['ch'];
        $body = curl_multi_getcontent($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err  = curl_error($ch);
        $GLOBALS['MACRO_DIAG'][] = [
            'url'   => $meta['url'],
            'code'  => $code,
            'err'   => $err,
            'bytes' => strlen((string)$body),
            'key'   => $key,
        ];
        $parsed = null;
        if ($code === 200 && $body) {
            $data = json_decode($body, true);
            if (is_array($data) && !empty($data['value'][0])) {
                $parsed = focus_parse_row($data['value'][0], $meta['spec']['indicador'], $meta['spec']['ano']);
            }
        }
        $out[$key] = $parsed;
        curl_multi_remove_handle($mh, $ch);
        curl_close($ch);
    }
    curl_multi_close($mh);

    return $out;
}

function sgs_last($series) {
    $data = http_get("https://api.bcb.gov.br/dados/serie/bcdata.sgs.{$series}/dados/ultimos/1?formato=json");
    if (!is_array($data) || empty($data[0])) return null;
    return [
        'data'  => $data[0]['data']  ?? null,
        'valor' => isset($data[0]['valor']) ? floatval(str_replace(',', '.', $data[0]['valor'])) : null,
    ];
}

function focus_all_null($focus) {
    if (!is_array($focus)) return true;
    foreach ($focus as $v) {
        if (is_array($v) && isset($v['mediana']) && $v['mediana'] !== null) {
            return false;
        }
    }
    return true;
}

function focus_cache_poisoned($payload) {
    if (!is_array($payload)) return false;
    // Port da correcao do Worker: o cache so vale com os DOIS indicadores SGS.
    // O `||` anterior declarava o payload completo com um dos dois de pe e
    // regravava o cache envenenado (mesmo mecanismo do incidente de 26/07/2026).
    $sgsMissing = ($payload['selic_meta'] ?? null) === null || ($payload['cambio_ptax'] ?? null) === null;
    return $sgsMissing || focus_all_null($payload['focus'] ?? []);
}

function read_cache() {
    if (!is_file(CACHE_FILE)) return null;
    $raw = @file_get_contents(CACHE_FILE);
    if (!$raw) return null;
    $j = json_decode($raw, true);
    return is_array($j) ? $j : null;
}

function write_cache($payload) {
    $tmp = CACHE_FILE . '.tmp';
    @file_put_contents($tmp, json_encode($payload, JSON_UNESCAPED_UNICODE));
    @rename($tmp, CACHE_FILE);
}

function delete_cache() {
    if (is_file(CACHE_FILE)) {
        @unlink(CACHE_FILE);
    }
}

/* ── cache válido? serve direto ───────────────────────────────── */
$cache = read_cache();
$forceLive = isset($_GET['nocache']);
// Fail-closed: antes, o fallback `?: ''` fazia token vazio bater com CRON_SECRET
// ausente e ligava o debug sem segredo nenhum. Agora exige segredo definido e
// comparação em tempo constante.
$cronSecret = getenv('CRON_SECRET');
$debugMode = isset($_GET['debug'])
    && is_string($cronSecret) && $cronSecret !== ''
    && isset($_GET['token'])
    && hash_equals($cronSecret, (string) $_GET['token']);

if (
    !$forceLive
    && $cache
    && isset($cache['ts'])
    && (time() - $cache['ts']) < CACHE_TTL
    && !focus_cache_poisoned($cache)
) {
    $cache['fresh']  = true;
    $cache['served'] = 'cache';
    echo json_encode($cache, JSON_UNESCAPED_UNICODE);
    exit;
}

if ($cache && focus_cache_poisoned($cache)) {
    delete_cache();
    $cache = null;
}

/* ── busca BCB ────────────────────────────────────────────────── */
// Anos dinamicos: o Worker gera ipca_<anoAtual> e ipca_<anoProx> via
// getFullYear(), e o front (macro-panel.js) descobre as chaves em tempo de
// execucao. O PHP de origem precisa acompanhar, senao o rollback serviria
// chaves de 2026/2027 para sempre.
$anoAtual = (int) date('Y');
$anoProx  = $anoAtual + 1;
$focusSpecs = [
    "ipca_{$anoAtual}"   => ['indicador' => 'IPCA',      'ano' => $anoAtual],
    "ipca_{$anoProx}"    => ['indicador' => 'IPCA',      'ano' => $anoProx],
    "selic_{$anoAtual}"  => ['indicador' => 'Selic',     'ano' => $anoAtual],
    "selic_{$anoProx}"   => ['indicador' => 'Selic',     'ano' => $anoProx],
    "cambio_{$anoAtual}" => ['indicador' => "C\u00e2mbio", 'ano' => $anoAtual],
    "cambio_{$anoProx}"  => ['indicador' => "C\u00e2mbio", 'ano' => $anoProx],
    "pib_{$anoAtual}"    => ['indicador' => 'PIB Total', 'ano' => $anoAtual],
    "pib_{$anoProx}"     => ['indicador' => 'PIB Total', 'ano' => $anoProx],
];

$payload = [
    'ts'         => time(),
    'source'     => 'BCB (SGS + Olinda Focus)',
    'disclaimer' => 'Dados agregados do mercado. Medianas, mínimos e máximos do Relatório Focus refletem expectativas de analistas, não previsão própria nem recomendação.',
    'selic_meta'  => sgs_last(432),
    'cambio_ptax' => sgs_last(1),
    'focus'       => focus_fetch_batch($focusSpecs),
];

/* ── Focus falhou mas cache antigo tinha dados? reaproveita ───── */
if (focus_all_null($payload['focus']) && $cache && !focus_all_null($cache['focus'] ?? [])) {
    $payload['focus'] = $cache['focus'];
    $payload['focus_recovered'] = 'stale_cache';
}

/* ── se BCB falhou em tudo, cai para stale cache ─────────────── */
$allNull = (
    $payload['selic_meta']  === null &&
    $payload['cambio_ptax'] === null &&
    focus_all_null($payload['focus'])
);

if ($allNull && $cache) {
    $cache['fresh']  = false;
    $cache['served'] = 'stale_cache';
    echo json_encode($cache, JSON_UNESCAPED_UNICODE);
    exit;
}

if (!focus_cache_poisoned($payload)) {
    write_cache($payload);
}

$payload['fresh']  = true;
$payload['served'] = 'live';
if ($debugMode) {
    $payload['_diag'] = $GLOBALS['MACRO_DIAG'];
}
echo json_encode($payload, JSON_UNESCAPED_UNICODE);