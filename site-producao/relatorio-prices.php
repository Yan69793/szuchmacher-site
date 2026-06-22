<?php
/**
 * relatorio-prices.php — Preços de mercado para relatorios.html
 *
 * Fontes:
 *   USD/BRL  : AwesomeAPI  (economia.awesomeapi.com.br)
 *   Ibovespa : Stooq CSV   (^bvsp)
 *   S&P 500  : Stooq CSV   (^spx)
 *   WTI      : Stooq CSV   (cl.f — crude oil futures)
 *
 * Padrão idêntico a prices.php: cURL → cache 15 min → seed fallback.
 * Nunca devolve erro ao front; os cards nunca ficam em branco.
 *
 * Consumido por relatorios.html → fetchLiveMarketPrices().
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=300');

ini_set('serialize_precision', '-1');

define('CACHE_FILE', __DIR__ . '/relatorio-prices-cache.json');
define('CACHE_TTL',  900); // 15 min

// Sementes: último valor conhecido (atualizado 14/06/2026)
$SEED = [
    'usd_brl'  => 5.0626,
    'ibovespa' => 171132.0,
    'sp500'    => 7431.46,
    'wti'      => 80.72,
];

// ── HTTP helper ────────────────────────────────────────────────────────────
function http_get($url, $timeout = 10) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => $timeout,
        CURLOPT_CONNECTTIMEOUT => 6,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_USERAGENT      => 'SzuchmacherRelatorio/1.0 (+https://szuchmacher.com.br)',
        CURLOPT_HTTPHEADER     => ['Accept: text/csv,application/json,*/*'],
    ]);
    $res  = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ($code === 200 && $res !== false) ? $res : null;
}

// ── Fontes ─────────────────────────────────────────────────────────────────

// Stooq CSV: Symbol,Date,Time,Open,High,Low,Close,Volume  (índice 6 = Close)
function from_stooq($symbol) {
    $url = 'https://stooq.com/q/l/?s=' . urlencode($symbol) . '&f=sd2t2ohlcv&h&e=csv';
    $raw = http_get($url);
    if ($raw === null) return null;

    $lines = array_filter(explode("\n", trim($raw)));
    if (count($lines) < 2) return null; // sem dados (só header)

    $row = str_getcsv($lines[1]);
    if (count($row) < 7) return null;

    $close = (float) $row[6];
    return ($close > 0) ? $close : null;
}

// AwesomeAPI JSON: {"USDBRL":{"bid":"5.0626",...}}
function from_awesomeapi_usdbrl() {
    $raw = http_get('https://economia.awesomeapi.com.br/json/last/USD-BRL');
    if ($raw === null) return null;
    $j = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE) return null;
    if (!isset($j['USDBRL']['bid']) || !is_numeric($j['USDBRL']['bid'])) return null;
    return (float) $j['USDBRL']['bid'];
}

// ── Cache ──────────────────────────────────────────────────────────────────
function ler_cache() {
    if (!file_exists(CACHE_FILE)) return null;
    $raw = @file_get_contents(CACHE_FILE);
    if ($raw === false) return null;
    $j = json_decode($raw, true);
    return (json_last_error() === JSON_ERROR_NONE && isset($j['ts'])) ? $j : null;
}

$cache = ler_cache();

if ($cache && (time() - (int) $cache['ts']) < CACHE_TTL) {
    $cache['source'] = 'cache';
    echo json_encode($cache, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// ── Coleta ao vivo ─────────────────────────────────────────────────────────
$prev = ($cache && isset($cache['_raw'])) ? $cache['_raw'] : $SEED;

$usd_brl  = from_awesomeapi_usdbrl();
$ibovespa = from_stooq('^bvsp');
$sp500    = from_stooq('^spx');
$wti      = from_stooq('cl.f');

// Preenche buracos com último valor conhecido
$vals  = compact('usd_brl', 'ibovespa', 'sp500', 'wti');
$stale = false;
foreach ($vals as $k => $v) {
    if ($v === null) {
        $vals[$k] = isset($prev[$k]) ? (float) $prev[$k] : $SEED[$k];
        $stale = true;
    }
}

$raw_out = [
    'usd_brl'  => round($vals['usd_brl'],  4),
    'ibovespa' => round($vals['ibovespa'], 2),
    'sp500'    => round($vals['sp500'],    2),
    'wti'      => round($vals['wti'],      2),
];

$payload = [
    'ok'           => true,
    'usd_brl'      => $raw_out['usd_brl'],
    'ibovespa'     => $raw_out['ibovespa'],
    'sp500'        => $raw_out['sp500'],
    'wti'          => $raw_out['wti'],
    'stale'        => $stale,
    'generated_at' => (new DateTime('now', new DateTimeZone('America/Sao_Paulo')))->format('d/m/Y H:i') . ' BRT',
    'ts'           => time(),
    '_raw'         => $raw_out,
];

@file_put_contents(CACHE_FILE, json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

// Se tudo falhou e havia cache antigo, prefere cache antigo
if ($stale && $cache && !($usd_brl || $ibovespa || $sp500 || $wti)) {
    $cache['ok']     = true;
    $cache['source'] = 'stale-cache';
    echo json_encode($cache, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
