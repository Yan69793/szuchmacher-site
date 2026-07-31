<?php
/**
 * prices.php — Preços ao vivo (ouro, prata, platina, cobre, bitcoin) em USD
 *
 * Fonte primária : gold-api.com  (XAU/XAG/XPT/HG/BTC — grátis, sem chave)
 * Fallback       : AwesomeAPI    (XAU-USD/XAG-USD/BTC-USD — não tem platina nem cobre)
 * Resiliência    : cache em arquivo (TTL 15min) + fallback p/ último valor
 *                  conhecido. Nunca devolve erro ao front; o card nunca quebra.
 *
 * Cobre é cotado em USD por libra-peso, não por onça troy como os três metais
 * preciosos. O símbolo no gold-api é HG, o mesmo código do contrato COMEX.
 *
 * Consumido por multiasset-app.html → loadLivePrices():
 *   espera { ok:true, gold, silver, platinum, copper, bitcoin } como números.
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=300');
header('Access-Control-Allow-Origin: *');

// Evita ruído de precisão de float no JSON (4220.3 em vez de 4220.30000000018)
ini_set('serialize_precision', '-1');

define('CACHE_FILE', __DIR__ . '/prices_cache.json');
define('CACHE_TTL',  900); // 15 min — janela de "ao vivo" sem martelar as APIs

// Sementes: último valor conhecido caso APIs e cache falhem (atualizado 14/06/2026;
// cobre acrescentado em 30/07/2026, medido em USD 6,27/lb)
$SEED = ['gold' => 4220.0, 'silver' => 68.0, 'platinum' => 1726.0, 'copper' => 6.27, 'bitcoin' => 63762.0];

// ── HTTP helper ────────────────────────────────────────────────────
function http_json($url, $timeout = 8) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => $timeout,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_USERAGENT      => 'SzuchmacherPrices/1.0 (+https://szuchmacher.com.br)',
        CURLOPT_HTTPHEADER     => ['Accept: application/json'],
    ]);
    $res  = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code !== 200 || !$res) return null;
    $j = json_decode($res, true);
    return (json_last_error() === JSON_ERROR_NONE) ? $j : null;
}

// ── Fontes ─────────────────────────────────────────────────────────
// gold-api.com → { "price": <num>, ... }
function from_goldapi($sym) {
    $j = http_json("https://api.gold-api.com/price/{$sym}");
    return (is_array($j) && isset($j['price']) && is_numeric($j['price'])) ? (float) $j['price'] : null;
}
// AwesomeAPI → { "XAUUSD": { "bid": "<num>" } }
function from_awesome($pair) {
    $j = http_json("https://economia.awesomeapi.com.br/json/last/{$pair}");
    if (!is_array($j)) return null;
    $key = str_replace('-', '', $pair); // XAU-USD → XAUUSD
    return (isset($j[$key]['bid']) && is_numeric($j[$key]['bid'])) ? (float) $j[$key]['bid'] : null;
}

// ── Cache ──────────────────────────────────────────────────────────
function ler_cache() {
    if (!file_exists(CACHE_FILE)) return null;
    $raw = @file_get_contents(CACHE_FILE);
    if ($raw === false) return null;
    $j = json_decode($raw, true);
    return (json_last_error() === JSON_ERROR_NONE && isset($j['ts'])) ? $j : null;
}

$cache = ler_cache();

// Cache fresco → serve direto
if ($cache && (time() - (int) $cache['ts']) < CACHE_TTL) {
    $cache['source_state'] = 'cache';
    echo json_encode($cache, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// ── Coleta ao vivo (primária gold-api, fallback AwesomeAPI) ─────────
$prev = ($cache && isset($cache['_raw'])) ? $cache['_raw'] : $SEED;

$gold     = from_goldapi('XAU'); if ($gold     === null) $gold     = from_awesome('XAU-USD');
$silver   = from_goldapi('XAG'); if ($silver   === null) $silver   = from_awesome('XAG-USD');
$platinum = from_goldapi('XPT'); // sem fallback de platina
$copper   = from_goldapi('HG');  // sem fallback de cobre
$bitcoin  = from_goldapi('BTC'); if ($bitcoin  === null) $bitcoin  = from_awesome('BTC-USD');

$fontes = [];
if ($gold !== null || $silver !== null || $platinum !== null || $copper !== null || $bitcoin !== null) $fontes[] = 'gold-api.com';

// Preenche buracos com último valor conhecido (cache anterior ou semente)
$vals  = ['gold' => $gold, 'silver' => $silver, 'platinum' => $platinum, 'copper' => $copper, 'bitcoin' => $bitcoin];
$stale = false;
foreach ($vals as $k => $v) {
    if ($v === null) {
        $vals[$k] = isset($prev[$k]) ? (float) $prev[$k] : $SEED[$k];
        $stale = true;
    }
}

// Arredonda
$raw = [
    'gold'     => round($vals['gold'], 2),
    'silver'   => round($vals['silver'], 2),
    'platinum' => round($vals['platinum'], 2),
    'copper'   => round($vals['copper'], 2), // USD/lb, cotado em centavos por libra
    'bitcoin'  => round($vals['bitcoin'], 2),
];

$payload = [
    'ok'           => true,
    'gold'         => $raw['gold'],
    'silver'       => $raw['silver'],
    'platinum'     => $raw['platinum'],
    'copper'       => $raw['copper'],
    'bitcoin'      => $raw['bitcoin'],
    'sources'      => $fontes ?: ['cache/seed'],
    'stale'        => $stale,
    'generated_at' => (new DateTime('now', new DateTimeZone('America/Sao_Paulo')))->format('d/m/Y H:i') . ' BRT',
    'ts'           => time(),
    '_raw'         => $raw, // base p/ próximo fallback
];

// Persiste cache (silencioso se diretório não for gravável)
@file_put_contents(CACHE_FILE, json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

// Se TUDO falhou e havia cache antigo, prefere o cache antigo (mais informativo)
if ($stale && $cache && empty($fontes)) {
    $cache['ok'] = true;
    $cache['source_state'] = 'stale-cache';
    echo json_encode($cache, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
