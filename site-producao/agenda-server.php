<?php
/* =============================================================
 * assets/agenda.php — Calendário macro curado, semana corrente
 *
 * Lê agenda-data.json (gerado toda segunda-feira pelo agente
 * remoto szuchmacher-domingo). Não contém dados hardcoded —
 * edite apenas agenda-data.json para atualizar o conteúdo.
 * ============================================================= */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=600');
header('Access-Control-Allow-Origin: *');

$file = __DIR__ . '/../agenda-data.json';

if (!file_exists($file)) {
    http_response_code(503);
    echo json_encode(['ok' => false, 'error' => 'agenda-data.json nao encontrado']);
    exit;
}

$content = file_get_contents($file);
if ($content === false) {
    http_response_code(503);
    echo json_encode(['ok' => false, 'error' => 'Falha ao ler agenda-data.json']);
    exit;
}

echo $content;
