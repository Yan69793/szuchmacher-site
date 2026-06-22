<?php
/**
 * market-data.php — Szuchmacher Consultoria
 * Ibovespa, S&P 500, WTI crude, Treasury 10y via Yahoo Finance v8 (server-side)
 *
 * Sem chave de API. Cache em arquivo (TTL 10 min). Nunca retorna erro HTTP —
 * fallback automático para último cache ou semente hardcoded.
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=300');
header('Access-Control-Allow-Origin: *');

ini_set('serialize_precision', '-1');

define('MD_CACHE_FILE', __DIR__ . '/market_data_cache.json');
define('MD_CACHE_TTL',  600); // 10 min

// Sementes — último valor razoável caso APIs e cache falhem (atualizado 15/06/2026)
$SEED = [
    'ibov'        => ['value' => 137000.0, 'change_pct' => 0.0],
    'sp500'       => ['value' => 5420.0,   'change_pct' => 0.0],
    'wti'         => ['value' => 74.0,     'change_pct' => 0.0],
    'treasury10y' => ['value' => 4.45,     'change_pct' => 0.0],
    'ntnb11'      => ['value' => 95.0,     'change_pct' => 0.0],
];

// ── HTTP helper ─────────────────────────────────────────────────────────────
function md_http_json($url, $timeout = 10) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => $timeout,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => true,
        // Yahoo Finance exige user-agent reconhecível
        CURLOPT_USERAGENT      => 'Mozilla/5.0 (compatible; SzuchmacherBot/1.0; +https://szuchmacher.com.br)',
        CURLOPT_HTTPHEADER     => [
            'Accept: application/json',
            'Accept-Language: en-US,en;q=0.9',
        ],
    ]);
    $res  = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code !== 200 || !$res) return null;
    $j = json_decode($res, true);
    return (json_last_error() === JSON_ERROR_NONE) ? $j : null;
}

// ── Yahoo Finance v8 ─────────────────────────────────────────────────────────
// Retorna ['value' => float, 'change_pct' => float] ou null se falhar
function fetch_yahoo($encoded_symbol) {
    $url  = "https://query1.finance.yahoo.com/v8/finance/chart/{$encoded_symbol}?interval=1d&range=1d";
    $json = md_http_json($url);
    if (!$json) return null;

    $result = $json['chart']['result'][0] ?? null;
    if (!$result) return null;

    $meta  = $result['meta'] ?? [];
    $price = isset($meta['regularMarketPrice']) ? (float) $meta['regularMarketPrice'] : null;
    $prev  = isset($meta['chartPreviousClose']) ? (float) $meta['chartPreviousClose'] : null;

    if ($price === null) return null;

    $change_pct = ($prev && $prev > 0) ? round(($price - $prev) / $prev * 100, 2) : 0.0;

    return ['value' => round($price, 2), 'change_pct' => $change_pct];
}

// ── Cache ────────────────────────────────────────────────────────────────────
function md_ler_cache() {
    if (!file_exists(MD_CACHE_FILE)) return null;
    $raw = @file_get_contents(MD_CACHE_FILE);
    if ($raw === false) return null;
    $j = json_decode($raw, true);
    return (json_last_error() === JSON_ERROR_NONE && isset($j['ts'])) ? $j : null;
}

$cache = md_ler_cache();

// Cache fresco → serve direto
if ($cache && (time() - (int) $cache['ts']) < MD_CACHE_TTL) {
    $cache['source'] = 'Yahoo Finance · cache';
    echo json_encode($cache, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// ── Coleta ao vivo ────────────────────────────────────────────────────────────
$prev_data = ($cache && isset($cache['ibov'])) ? $cache : null;

$ibov        = fetch_yahoo('%5EBVSP');    // ^BVSP
$sp500       = fetch_yahoo('%5EGSPC');   // ^GSPC
$wti         = fetch_yahoo('CL%3DF');    // CL=F
$treasury10y = fetch_yahoo('%5ETNX');    // ^TNX
$ntnb11      = fetch_yahoo('NTNB11.SA'); // NTNB11

// Fallback para cache anterior ou semente
function fallback_val($live, $prev_key, $prev_data, $seed) {
    if ($live !== null) return $live;
    if ($prev_data && isset($prev_data[$prev_key])) return $prev_data[$prev_key];
    return $seed;
}

$ibov        = fallback_val($ibov,        'ibov',        $prev_data, $SEED['ibov']);
$sp500       = fallback_val($sp500,       'sp500',       $prev_data, $SEED['sp500']);
$wti         = fallback_val($wti,         'wti',         $prev_data, $SEED['wti']);
$treasury10y = fallback_val($treasury10y, 'treasury10y', $prev_data, $SEED['treasury10y']);
$ntnb11      = fallback_val($ntnb11,      'ntnb11',      $prev_data, $SEED['ntnb11']);

$now_brt = (new DateTime('now', new DateTimeZone('America/Sao_Paulo')))->format('d/m/Y H:i');

$payload = [
    'ok'          => true,
    'ibov'        => $ibov,
    'sp500'       => $sp500,
    'wti'         => $wti,
    'treasury10y' => $treasury10y,
    'ntnb11'      => $ntnb11,
    'updated_at'  => $now_brt . ' BRT',
    'source'      => 'Yahoo Finance · ao vivo',
    'ts'          => time(),
];

// Persiste cache
@file_put_contents(MD_CACHE_FILE, json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
