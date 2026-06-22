<?php
/**
 * agenda-cron.php — Szuchmacher Consultoria
 * Executa todo domingo às 20h BRT (23h UTC) via cPanel Cron.
 * Gera agenda-data.json para a semana seguinte (seg–sex).
 *
 * Cron entry (cPanel):
 *   0 23 * * 0   /usr/local/bin/php /home/USERNAME/public_html/scripts/agenda-cron.php >> /home/USERNAME/logs/agenda-cron.log 2>&1
 */

date_default_timezone_set('America/Sao_Paulo');

// ─── Datas da janela seg–sex da semana corrente/próxima ──────────────────
$hoje      = new DateTime();
$diaSemana = (int)$hoje->format('N'); // 1=seg … 7=dom

if ($diaSemana <= 5) {
    // Seg–Sex: recua até a segunda desta semana
    $proxSeg = (clone $hoje)->modify('-' . ($diaSemana - 1) . ' days')->setTime(0, 0, 0);
} else {
    // Sáb (6) ou Dom (7): avança até a próxima segunda
    $proxSeg = (clone $hoje)->modify('+' . (8 - $diaSemana) . ' days')->setTime(0, 0, 0);
}

$proxSex = (clone $proxSeg)->modify('+4 days');

$janela_inicio = $proxSeg->format('Y-m-d');
$janela_fim    = $proxSex->format('Y-m-d');

// ─── Calendários fixos 2026 ───────────────────────────────────────────────

// COPOM 2026 (segundo dia de reunião — decisão publicada ~18h30 BRT)
$copom_2026 = [
    '2026-01-29', '2026-03-19', '2026-05-07',
    '2026-06-17', '2026-07-30', '2026-09-17',
    '2026-11-05', '2026-12-10',
];

// Feriados NYSE/Nasdaq 2026 — mercados EUA fechados (nyse.com/markets/hours-calendars)
$feriados_us_2026 = [
    '2026-01-01' => 'Ano-Novo',
    '2026-01-19' => 'Martin Luther King Jr. Day',
    '2026-02-16' => 'Presidents Day',
    '2026-04-03' => 'Good Friday',
    '2026-05-25' => 'Memorial Day',
    '2026-06-19' => 'Juneteenth National Independence Day',
    '2026-07-03' => 'Independence Day (observado)',
    '2026-09-07' => 'Labor Day',
    '2026-11-26' => 'Thanksgiving Day',
    '2026-12-25' => 'Christmas Day',
];

// FOMC 2026 (decisão 15h EST / 16h ou 17h BRT dependendo do horário de verão EUA)
// dot_plot = true → acompanha Summary of Economic Projections
$fomc_2026 = [
    ['data' => '2026-01-29', 'dot_plot' => false],
    ['data' => '2026-03-19', 'dot_plot' => true],
    ['data' => '2026-04-30', 'dot_plot' => false],
    ['data' => '2026-06-17', 'dot_plot' => true],
    ['data' => '2026-07-30', 'dot_plot' => false],
    ['data' => '2026-09-17', 'dot_plot' => true],
    ['data' => '2026-11-05', 'dot_plot' => false],
    ['data' => '2026-12-10', 'dot_plot' => true],
];

// ─── Funções auxiliares ───────────────────────────────────────────────────

/** Primeiro dia útil <= $data (recua no calendário se cair em fim de semana) */
function proxUtilAnterior(DateTime $data): DateTime
{
    $d = clone $data;
    while (in_array((int)$d->format('N'), [6, 7])) {
        $d->modify('-1 day');
    }
    return $d;
}

/** Primeira sexta-feira do mês/ano informado */
function primeiraSextaDoMes(int $ano, int $mes): DateTime
{
    $d = new DateTime("{$ano}-{$mes}-01");
    while ((int)$d->format('N') !== 5) {
        $d->modify('+1 day');
    }
    return $d;
}

/** Retorna true se $dataStr está dentro da janela [ini, fim] */
function naJanela(string $dataStr, string $ini, string $fim): bool
{
    return $dataStr >= $ini && $dataStr <= $fim;
}

// ─── Construção dos eventos ───────────────────────────────────────────────
$eventos = [];

$anoSeg  = (int)$proxSeg->format('Y');
$mesSeg  = (int)$proxSeg->format('n');
$anoSex  = (int)$proxSex->format('Y');
$mesSex  = (int)$proxSex->format('n');

// Par único de (ano, mês) que aparece na janela seg–sex
$meses = [];
$ptr = clone $proxSeg;
while ($ptr <= $proxSex) {
    $chave = $ptr->format('Y-n');
    if (!isset($meses[$chave])) {
        $meses[$chave] = [(int)$ptr->format('Y'), (int)$ptr->format('n')];
    }
    $ptr->modify('+1 day');
}

// ── BOLETIM FOCUS (toda segunda-feira, 08:25 BRT) ────────────────────────
$eventos[] = [
    'data'         => $janela_inicio,
    'hora_brt'     => '08:25',
    'regiao'       => 'BR',
    'evento'       => 'Boletim Focus',
    'evento_en'    => 'Focus Market Report',
    'descricao'    => 'Medianas semanais do mercado para Selic, IPCA, câmbio e PIB — principais referências de expectativas para a curva de juros e decisão do COPOM.',
    'descricao_en' => 'Weekly market medians for Selic, CPI, FX and GDP — key forward-guidance inputs for the rate curve and COPOM decisions.',
    'fonte'        => 'BCB',
    'relevancia'   => 'alta',
];

// ── IPCA-15 (dia 22 do mês, ou dia útil anterior se cair em fim de semana) ──
foreach ($meses as [$ano, $mes]) {
    $dia22      = new DateTime("{$ano}-{$mes}-22");
    $divulgacao = proxUtilAnterior($dia22);
    $dataStr    = $divulgacao->format('Y-m-d');
    if (naJanela($dataStr, $janela_inicio, $janela_fim)) {
        $eventos[] = [
            'data'         => $dataStr,
            'hora_brt'     => '09:00',
            'regiao'       => 'BR',
            'evento'       => 'IPCA-15 (' . $divulgacao->format('M/Y') . ')',
            'evento_en'    => 'IPCA-15 (' . $divulgacao->format('M/Y') . ')',
            'descricao'    => 'Prévia da inflação oficial — antecede o IPCA cheio em ~15 dias. Influencia a função de reação do BCB e a precificação das NTN-B.',
            'descricao_en' => 'Consumer price preview, released ~15 days before the full CPI. Key input for BCB reaction function and inflation-linked bond pricing.',
            'fonte'        => 'IBGE',
            'relevancia'   => 'alta',
        ];
    }
}

// ── NFP — Non-Farm Payrolls (1ª sexta do mês, 09:30 ET / 10:30–11:30 BRT) ─
foreach ($meses as [$ano, $mes]) {
    $nfp     = primeiraSextaDoMes($ano, $mes);
    $dataStr = $nfp->format('Y-m-d');
    if (naJanela($dataStr, $janela_inicio, $janela_fim)) {
        $eventos[] = [
            'data'         => $dataStr,
            'hora_brt'     => '09:30',
            'regiao'       => 'US',
            'evento'       => 'NFP — Non-Farm Payrolls (' . $nfp->format('M/Y') . ')',
            'evento_en'    => 'Non-Farm Payrolls (' . $nfp->format('M/Y') . ')',
            'descricao'    => 'Principal termômetro do mercado de trabalho americano. Surpresas no NFP movem o dólar, os Treasuries e, por extensão, o real e a curva de juros brasileira.',
            'descricao_en' => 'Primary US labor market gauge. NFP surprises move the USD, Treasuries, and consequently BRL and Brazilian rate curve.',
            'fonte'        => 'BLS',
            'relevancia'   => 'alta',
        ];
    }
}

// ── COPOM (datas fixas 2026) ──────────────────────────────────────────────
foreach ($copom_2026 as $dataStr) {
    if (naJanela($dataStr, $janela_inicio, $janela_fim)) {
        $d = new DateTime($dataStr);
        $eventos[] = [
            'data'         => $dataStr,
            'hora_brt'     => '18:30',
            'regiao'       => 'BR',
            'evento'       => 'COPOM — Decisão de juros (' . $d->format('M/Y') . ')',
            'evento_en'    => 'COPOM — Rate Decision (' . $d->format('M/Y') . ')',
            'descricao'    => 'O BCB divulga a decisão sobre a Selic ao final do segundo dia de reunião. O comunicado e a ata subsequente moldam a curva de juros doméstica e o câmbio.',
            'descricao_en' => 'BCB releases the Selic decision at the end of day two. The statement and subsequent minutes shape the domestic rate curve and BRL.',
            'fonte'        => 'BCB',
            'relevancia'   => 'alta',
        ];
    }
}

// ── Feriados EUA (NYSE fechado) ───────────────────────────────────────────
foreach ($feriados_us_2026 as $dataStr => $nome) {
    if (naJanela($dataStr, $janela_inicio, $janela_fim)) {
        $eventos[] = [
            'data'         => $dataStr,
            'hora_brt'     => 'pregão fechado',
            'regiao'       => 'US',
            'evento'       => 'Feriado nos EUA — ' . $nome,
            'evento_en'    => 'US market holiday — ' . $nome,
            'descricao'    => 'Mercados americanos fechados (NYSE/Nasdaq). Divulgações do BLS, BEA e dados macro dos EUA ficam suspensas ou são antecipadas. O pregão brasileiro segue em horário regular.',
            'descricao_en' => 'US equity markets closed (NYSE/Nasdaq). BLS, BEA and US macro releases are suspended or brought forward. Brazilian session trades as usual.',
            'fonte'        => 'NYSE',
            'relevancia'   => 'media',
        ];
    }
}

// ── FOMC (datas fixas 2026) ───────────────────────────────────────────────
foreach ($fomc_2026 as $fomc) {
    $dataStr = $fomc['data'];
    if (naJanela($dataStr, $janela_inicio, $janela_fim)) {
        $d      = new DateTime($dataStr);
        $dp     = $fomc['dot_plot'];
        $sufixo = $dp ? ' + Dot Plot' : '';
        $eventos[] = [
            'data'         => $dataStr,
            'hora_brt'     => '15:00',
            'regiao'       => 'US',
            'evento'       => 'FOMC — Decisão de juros' . $sufixo . ' (' . $d->format('M/Y') . ')',
            'evento_en'    => 'FOMC — Rate Decision' . $sufixo . ' (' . $d->format('M/Y') . ')',
            'descricao'    => 'Decisão do Federal Reserve sobre os Fed Funds.'
                . ($dp ? ' Inclui o Summary of Economic Projections (Dot Plot) com projeção de trajetória de juros dos diretores.' : '')
                . ' Impacto direto no diferencial Brasil–EUA e no real.',
            'descricao_en' => 'Federal Reserve decision on Fed Funds rates.'
                . ($dp ? ' Includes Summary of Economic Projections (Dot Plot) with directors\' rate path forecast.' : '')
                . ' Direct impact on Brazil-US rate differential and BRL.',
            'fonte'        => 'Fed',
            'relevancia'   => 'alta',
        ];
    }
}

// ── Tentar buscar eventos adicionais via API Olinda BCB ───────────────────
// (endpoint de calendário institucional — best-effort, sem quebrar se falhar)
$bcb_url = 'https://olinda.bcb.gov.br/olinda/servico/IFDATA/versao/v1/odata/'
    . 'CalendarioEvento?$filter=Data%20ge%20%27' . $janela_inicio
    . '%27%20and%20Data%20le%20%27' . $janela_fim . '%27'
    . '&$select=Data,Descricao,Hora&$format=json&$top=20';

$ctx     = stream_context_create(['http' => ['timeout' => 5, 'ignore_errors' => true]]);
$bcb_raw = @file_get_contents($bcb_url, false, $ctx);

if ($bcb_raw !== false) {
    $bcb_json = json_decode($bcb_raw, true);
    if (isset($bcb_json['value']) && is_array($bcb_json['value'])) {
        foreach ($bcb_json['value'] as $ev) {
            $dataStr = substr($ev['Data'] ?? '', 0, 10);
            $desc    = trim($ev['Descricao'] ?? '');
            if (!naJanela($dataStr, $janela_inicio, $janela_fim) || strlen($desc) < 4) continue;

            // Evitar duplicar eventos do BCB já inseridos pelas regras fixas
            $duplicado = false;
            foreach ($eventos as $e) {
                if ($e['data'] === $dataStr && $e['fonte'] === 'BCB') {
                    $duplicado = true;
                    break;
                }
            }
            if ($duplicado) continue;

            $hora      = isset($ev['Hora']) ? substr($ev['Hora'], 0, 5) : '09:00';
            $eventos[] = [
                'data'         => $dataStr,
                'hora_brt'     => $hora,
                'regiao'       => 'BR',
                'evento'       => $desc,
                'evento_en'    => $desc,
                'descricao'    => 'Evento do calendário oficial do Banco Central do Brasil.',
                'descricao_en' => 'Event from the official Banco Central do Brasil calendar.',
                'fonte'        => 'BCB',
                'relevancia'   => 'media',
            ];
        }
    }
}

// ─── Ordenar por data + hora ──────────────────────────────────────────────
usort($eventos, function ($a, $b) {
    $cmp = strcmp($a['data'], $b['data']);
    return $cmp !== 0 ? $cmp : strcmp($a['hora_brt'], $b['hora_brt']);
});

// ─── Montar JSON final ────────────────────────────────────────────────────
$output = [
    'meta' => [
        'version'          => date('Y-m-d'),
        'curator'          => 'Szuchmacher Consultoria',
        'fontes_primarias' => [
            'BCB — Calendário de divulgações (bcb.gov.br/calendariodivulgacao)',
            'BLS — US economic release schedule (bls.gov/schedule)',
            'Fed — FOMC calendar (federalreserve.gov)',
            'IBGE — Calendário de divulgações (ibge.gov.br)',
        ],
        'disciplina'    => 'Eventos programados em fontes oficiais. Sem antecipação de resultado.',
        'disciplina_en' => 'Scheduled releases from official sources. No result anticipation.',
        'idiomas'       => ['pt-BR', 'en'],
    ],
    'gerado'  => date('Y-m-d\TH:i:sP'),
    'janela'  => ['inicio' => $janela_inicio, 'fim' => $janela_fim],
    'eventos' => $eventos,
];

// ─── Persistir agenda-data.json ───────────────────────────────────────────
$dest = __DIR__ . '/../agenda-data.json';
$ok   = file_put_contents(
    $dest,
    json_encode($output, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
);

if ($ok === false) {
    error_log('[agenda-cron] ERRO ao gravar ' . $dest);
    exit(1);
}

$qtd = count($eventos);
echo "[agenda-cron] OK — {$qtd} evento(s) para {$janela_inicio} a {$janela_fim}\n";
exit(0);
