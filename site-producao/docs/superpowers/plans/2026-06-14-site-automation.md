# Site Automation + Fixes — szuchmacher.com.br — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir email de contato (contato@ → yan@) em 7 arquivos, publicar assinatura.html, automatizar a agenda semanal via cron e restaurar a narrativa macro via OpenRouter com cache de 7 dias.

**Architecture:** Servidor-first (Abordagem 1) — PHP + cron HostGator + OPENROUTER_KEY no servidor via `config.php`. Sem Cloudflare Workers, sem Node.js, sem alterações de front-end. Deploy via FTP curl.exe.

**Tech Stack:** PHP 8.x (HostGator), curl (PHP), cPanel Cron, OpenRouter (claude-haiku-4-5), BCB SGS + Olinda APIs, FTP curl.exe (PowerShell), Cloudflare CDN (Purge manual por Yan).

---

## Mapa de arquivos

| Arquivo | Ação |
|---------|------|
| `index.html` | Modificar: schema JSON email + JS string |
| `relatorios.html` | Modificar: JS string |
| `multiasset.html` | Modificar: JS string |
| `multiasset-app.html` | Modificar: mailto hardcoded |
| `honorarios.html` | Modificar: schema JSON + 2× mailto hardcoded |
| `assinatura.html` | Modificar: __STRIPE__ placeholders + mailto rodapé |
| `privacidade.html` | Modificar: 3× mailto hardcoded |
| `scripts/agenda-cron.php` | Criar: cron dominical de eventos econômicos |
| `macro_api.php` | Reescrever: cache → BCB → OpenRouter → JSON |
| `config.php` | Criar: constante OPENROUTER_KEY (gitignored) |

---

## Task 1 — Track A: Substituição de email em 7 arquivos HTML

**Files:**
- Modify: `index.html` (linhas 314, 774)
- Modify: `relatorios.html` (linha 564)
- Modify: `multiasset.html` (linha 679)
- Modify: `multiasset-app.html` (linha 2615)
- Modify: `honorarios.html` (linhas 39, 428, 529)
- Modify: `privacidade.html` (linhas 73, 119, 131)

- [ ] **Passo 1.1 — index.html: schema JSON (linha 314)**

  Trocar:
  ```
  "email": "contato@szuchmacher.com.br",
  ```
  Por:
  ```
  "email": "yan@szuchmacher.com.br",
  ```

- [ ] **Passo 1.2 — index.html: JS string (linha 774)**

  Trocar:
  ```javascript
  var em = 'contato' + String.fromCharCode(64) + 'szuchmacher.com.br';
  ```
  Por:
  ```javascript
  var em = 'yan' + String.fromCharCode(64) + 'szuchmacher.com.br';
  ```
  *(O padrão exato neste arquivo usa `String.fromCharCode(64)` para ofuscação de bot — manter o padrão, trocar apenas `'contato'` → `'yan'`)*

- [ ] **Passo 1.3 — relatorios.html: JS string (linha 564)**

  Trocar:
  ```javascript
  var e = 'contato' + '@' + 'szuchmacher.com.br';
  ```
  Por:
  ```javascript
  var e = 'yan' + '@' + 'szuchmacher.com.br';
  ```

- [ ] **Passo 1.4 — multiasset.html: JS string (linha 679)**

  Trocar:
  ```javascript
  var em = 'contato' + String.fromCharCode(64) + 'szuchmacher.com.br';
  ```
  Por:
  ```javascript
  var em = 'yan' + String.fromCharCode(64) + 'szuchmacher.com.br';
  ```

- [ ] **Passo 1.5 — multiasset-app.html: mailto hardcoded (linha 2615)**

  Trocar:
  ```html
  <li><a href="mailto:contato@szuchmacher.com.br"><i class="fas fa-envelope" style="margin-right:7px;opacity:0.5;"></i>contato@szuchmacher.com.br</a></li>
  ```
  Por:
  ```html
  <li><a href="mailto:yan@szuchmacher.com.br"><i class="fas fa-envelope" style="margin-right:7px;opacity:0.5;"></i>yan@szuchmacher.com.br</a></li>
  ```

- [ ] **Passo 1.6 — honorarios.html: schema JSON (linha 39)**

  Trocar:
  ```
  "email": "contato@szuchmacher.com.br",
  ```
  Por:
  ```
  "email": "yan@szuchmacher.com.br",
  ```

- [ ] **Passo 1.7 — honorarios.html: mailto chip (linha 428)**

  Trocar:
  ```html
  <a href="mailto:contato@szuchmacher.com.br" class="contact-chip" data-ga="cta_email" data-ga-location="honorarios"><i class="fas fa-envelope"></i> contato@szuchmacher.com.br</a>
  ```
  Por:
  ```html
  <a href="mailto:yan@szuchmacher.com.br" class="contact-chip" data-ga="cta_email" data-ga-location="honorarios"><i class="fas fa-envelope"></i> yan@szuchmacher.com.br</a>
  ```

- [ ] **Passo 1.8 — honorarios.html: mailto rodapé (linha 529)**

  Trocar:
  ```html
  <li><a href="mailto:contato@szuchmacher.com.br"><i class="fas fa-envelope" style="margin-right:7px;opacity:0.5;"></i>contato@szuchmacher.com.br</a></li>
  ```
  Por:
  ```html
  <li><a href="mailto:yan@szuchmacher.com.br"><i class="fas fa-envelope" style="margin-right:7px;opacity:0.5;"></i>yan@szuchmacher.com.br</a></li>
  ```

- [ ] **Passo 1.9 — privacidade.html: DPO (linha 73)**

  Trocar:
  ```html
  <a href="mailto:contato@szuchmacher.com.br">contato@szuchmacher.com.br</a>
  ```
  Por:
  ```html
  <a href="mailto:yan@szuchmacher.com.br">yan@szuchmacher.com.br</a>
  ```
  *(Substituir todas as 3 ocorrências: linhas 73, 119, 131 — mesmo padrão)*

- [ ] **Passo 1.10 — Verificar ausência de `contato@`**

  Run:
  ```powershell
  Select-String -Path "E:\Diretorio\Claude\Site\site-producao\*.html" -Pattern "contato@szuchmacher"
  ```
  Expected: nenhum resultado (zero matches).

---

## Task 2 — Track A: assinatura.html — botões e rodapé

**Files:**
- Modify: `assinatura.html` (linhas 271, 289, 400)

- [ ] **Passo 2.1 — Substituir __STRIPE_CARTA__ (linha 271)**

  Trocar:
  ```html
  <a href="__STRIPE_CARTA__" class="btn-ghost" data-ga="cta_assinar_carta" data-ga-location="assinatura">Assinar a Carta</a>
  ```
  Por:
  ```html
  <a href="mailto:yan@szuchmacher.com.br" class="btn-ghost" data-ga="cta_assinar_carta" data-ga-location="assinatura">Assinar a Carta</a>
  ```

- [ ] **Passo 2.2 — Substituir __STRIPE_PRO__ (linha 289)**

  Trocar:
  ```html
  <a href="__STRIPE_PRO__" class="btn-primary" data-ga="cta_assinar_pro" data-ga-location="assinatura">Assinar o Pro</a>
  ```
  Por:
  ```html
  <a href="mailto:yan@szuchmacher.com.br" class="btn-primary" data-ga="cta_assinar_pro" data-ga-location="assinatura">Assinar o Pro</a>
  ```

- [ ] **Passo 2.3 — Corrigir email rodapé (linha 400)**

  Trocar:
  ```html
  <li><a href="mailto:contato@szuchmacher.com.br"><i class="fas fa-envelope" style="margin-right:7px;opacity:0.5;"></i>contato@szuchmacher.com.br</a></li>
  ```
  Por:
  ```html
  <li><a href="mailto:yan@szuchmacher.com.br"><i class="fas fa-envelope" style="margin-right:7px;opacity:0.5;"></i>yan@szuchmacher.com.br</a></li>
  ```

- [ ] **Passo 2.4 — Verificar ausência de placeholders e `contato@` em assinatura.html**

  Run:
  ```powershell
  Select-String -Path "E:\Diretorio\Claude\Site\site-producao\assinatura.html" -Pattern "__STRIPE__|contato@"
  ```
  Expected: nenhum resultado.

---

## Task 3 — Track A: Deploy dos 8 arquivos HTML via FTP

Credenciais no `.env`: `FTP_USER`, `FTP_PASS`, `FTP_HOST`.

- [ ] **Passo 3.1 — Ler .env e montar variáveis**

  Run:
  ```powershell
  $env_content = Get-Content "E:\Diretorio\Claude\Site\site-producao\.env"
  $env_content | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]*)=(.*)$') {
      [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process')
    }
  }
  $FTP = "ftp://$($env:FTP_USER)@$($env:FTP_HOST)/public_html/"
  $CRED = "$($env:FTP_USER):$($env:FTP_PASS)"
  Write-Host "FTP pronto: $FTP"
  ```
  Expected: `FTP pronto: ftp://deploy@szuchmacher.com.br@sh00110.hostgator.com.br/public_html/`

- [ ] **Passo 3.2 — Upload dos 8 arquivos HTML**

  Run:
  ```powershell
  $BASE = "E:\Diretorio\Claude\Site\site-producao"
  $FILES = @("index.html","relatorios.html","multiasset.html","multiasset-app.html","honorarios.html","assinatura.html","privacidade.html")
  foreach ($f in $FILES) {
    $result = curl.exe --ssl-reqd -s -S -w "%{http_code}" -T "$BASE\$f" `
      "ftp://$($env:FTP_USER):$($env:FTP_PASS)@$($env:FTP_HOST)/public_html/$f"
    Write-Host "$f → $result"
  }
  ```
  Expected: cada linha mostra o nome do arquivo seguido de `226` (FTP transfer complete) ou `0` (curl retorna 0 para FTP com sucesso).
  
  *Nota: para FTP com curl.exe, saída bem-sucedida é exit code 0 — não HTTP 200.*

- [ ] **Passo 3.3 — Verificar HTTP 200 nos arquivos chave**

  Run:
  ```powershell
  foreach ($f in @("assinatura.html","honorarios.html","privacidade.html")) {
    $code = curl.exe -s -o $null -w "%{http_code}" "https://szuchmacher.com.br/$f"
    Write-Host "$f → HTTP $code"
  }
  ```
  Expected: `HTTP 200` para todos.
  
  *Se retornar 404 para assinatura.html, verificar upload do passo 3.2.*

- [ ] **Passo 3.4 — Verificar email no rodapé de produção**

  Run:
  ```powershell
  $html = curl.exe -s "https://szuchmacher.com.br/honorarios.html"
  if ($html -match "yan@szuchmacher") { "OK: yan@ encontrado" } else { "ERRO: yan@ ausente" }
  if ($html -match "contato@szuchmacher") { "ERRO: contato@ ainda presente" } else { "OK: contato@ removido" }
  ```
  Expected: `OK: yan@ encontrado` e `OK: contato@ removido`.
  
  *Se retornar conteúdo antigo, Yan deve fazer Purge no Cloudflare (Dashboard → Caching → Purge Everything).*

---

## Task 4 — Track B: Criar scripts/agenda-cron.php

**Files:**
- Create: `scripts/agenda-cron.php`

- [ ] **Passo 4.1 — Criar o diretório scripts/ se não existir**

  Run:
  ```powershell
  $dir = "E:\Diretorio\Claude\Site\site-producao\scripts"
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir }
  Get-Item $dir
  ```

- [ ] **Passo 4.2 — Criar scripts/agenda-cron.php**

  Conteúdo completo:

  ```php
  <?php
  /**
   * agenda-cron.php — Szuchmacher Consultoria
   * Executa todo domingo às 20h BRT (23h UTC) via cPanel Cron.
   * Gera agenda-data.json para a semana seguinte (seg–sex).
   *
   * Cron entry:  0 23 * * 0   /usr/local/bin/php /home/USERNAME/public_html/scripts/agenda-cron.php
   */

  date_default_timezone_set('America/Sao_Paulo');

  // ─── Datas da janela seg–sex da próxima semana ────────────────────────────
  $hoje       = new DateTime();
  $diaSemana  = (int)$hoje->format('N'); // 1=seg … 7=dom
  $diasAteSeg = ($diaSemana === 7) ? 1 : (8 - $diaSemana);
  $proxSeg    = (clone $hoje)->modify("+{$diasAteSeg} days")->setTime(0,0,0);
  $proxSex    = (clone $proxSeg)->modify('+4 days');

  $janela_inicio = $proxSeg->format('Y-m-d');
  $janela_fim    = $proxSex->format('Y-m-d');

  // ─── Calendários fixos 2026 ───────────────────────────────────────────────
  // COPOM 2026 (segunda noite da reunião — decisão publicada ~18h30 BRT)
  $copom_2026 = [
    '2026-01-29', '2026-03-19', '2026-05-07',
    '2026-06-18', '2026-07-30', '2026-09-17',
    '2026-11-05', '2026-12-10',
  ];

  // FOMC 2026 (decisão: 15h EST / 17h BRT; Dot Plot: datas com asterisco)
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

  /** Primeiro dia útil >= $data (pula sáb/dom) */
  function proxUtilMaior(DateTime $data): DateTime {
    $d = clone $data;
    while (in_array((int)$d->format('N'), [6, 7])) {
      $d->modify('+1 day');
    }
    return $d;
  }

  /** Primeiro dia útil <= $data (pula sáb/dom para trás) */
  function proxUtilMenor(DateTime $data): DateTime {
    $d = clone $data;
    while (in_array((int)$d->format('N'), [6, 7])) {
      $d->modify('-1 day');
    }
    return $d;
  }

  /** Primeira sexta-feira de determinado mês/ano */
  function primeiraSextaDoMes(int $ano, int $mes): DateTime {
    $d = new DateTime("{$ano}-{$mes}-01");
    while ((int)$d->format('N') !== 5) {
      $d->modify('+1 day');
    }
    return $d;
  }

  /** Verifica se uma data está na janela seg–sex */
  function naJanela(string $data, string $ini, string $fim): bool {
    return $data >= $ini && $data <= $fim;
  }

  // ─── Construção dos eventos ───────────────────────────────────────────────
  $eventos = [];

  // Ano e semanas que cobrem a janela
  $anoSeg = (int)$proxSeg->format('Y');
  $mesSeg = (int)$proxSeg->format('n');
  $mesSex = (int)$proxSex->format('n');
  $meses  = array_unique([$mesSeg, $mesSex]);

  // ── BOLETIM FOCUS (toda segunda, 08:25 BRT) ──────────────────────────────
  if (naJanela($janela_inicio, $janela_inicio, $janela_fim)) {
    $eventos[] = [
      'data'        => $janela_inicio,
      'hora_brt'    => '08:25',
      'regiao'      => 'BR',
      'evento'      => 'Boletim Focus',
      'evento_en'   => 'Focus Market Report',
      'descricao'   => 'Medianas semanais do mercado para Selic, IPCA, câmbio e PIB — principais referências de expectativas para a curva de juros e decisão do COPOM.',
      'descricao_en'=> 'Weekly market medians for Selic, CPI, FX and GDP — key forward-guidance inputs for the rate curve and COPOM decisions.',
      'fonte'       => 'BCB',
      'relevancia'  => 'alta',
    ];
  }

  // ── IPCA-15 (dia 22 do mês, ou dia útil anterior) ────────────────────────
  foreach ($meses as $mes) {
    $ano  = ($mes < $mesSeg) ? $anoSeg + 1 : $anoSeg;
    $dia22 = new DateTime("{$ano}-{$mes}-22");
    $divulgacao = proxUtilMenor($dia22);
    $dataStr = $divulgacao->format('Y-m-d');
    if (naJanela($dataStr, $janela_inicio, $janela_fim)) {
      $eventos[] = [
        'data'        => $dataStr,
        'hora_brt'    => '09:00',
        'regiao'      => 'BR',
        'evento'      => 'IPCA-15 (' . $divulgacao->format('M/Y') . ')',
        'evento_en'   => 'IPCA-15 (' . $divulgacao->format('M/Y') . ')',
        'descricao'   => 'Prévia da inflação oficial — antecede o IPCA cheio em ~15 dias. Influencia a função de reação do BCB e a precificação das NTN-B.',
        'descricao_en'=> 'Consumer price preview, released ~15 days before the full CPI. Key input for BCB reaction function and inflation-linked bond pricing.',
        'fonte'       => 'IBGE',
        'relevancia'  => 'alta',
      ];
    }
  }

  // ── NFP — Non-Farm Payrolls (1ª sexta do mês, 09:30 ET / 10:30 ou 11:30 BRT) ──
  foreach ($meses as $mes) {
    $ano   = ($mes < $mesSeg) ? $anoSeg + 1 : $anoSeg;
    $nfp   = primeiraSextaDoMes($ano, $mes);
    $dataStr = $nfp->format('Y-m-d');
    if (naJanela($dataStr, $janela_inicio, $janela_fim)) {
      $eventos[] = [
        'data'        => $dataStr,
        'hora_brt'    => '09:30',
        'regiao'      => 'US',
        'evento'      => 'NFP — Non-Farm Payrolls (' . $nfp->format('M/Y') . ')',
        'evento_en'   => 'Non-Farm Payrolls (' . $nfp->format('M/Y') . ')',
        'descricao'   => 'Principal termômetro do mercado de trabalho americano. Surpresas no NFP movem o dólar, os Treasuries e, por extensão, o real e a curva de juros brasileira.',
        'descricao_en'=> 'Primary US labor market gauge. NFP surprises move the USD, Treasuries, and consequently BRL and Brazilian rate curve.',
        'fonte'       => 'BLS',
        'relevancia'  => 'alta',
      ];
    }
  }

  // ── COPOM (datas fixas 2026) ──────────────────────────────────────────────
  foreach ($copom_2026 as $dataStr) {
    if (naJanela($dataStr, $janela_inicio, $janela_fim)) {
      $d = new DateTime($dataStr);
      $eventos[] = [
        'data'        => $dataStr,
        'hora_brt'    => '18:30',
        'regiao'      => 'BR',
        'evento'      => 'COPOM — Decisão de juros (' . $d->format('M/Y') . ')',
        'evento_en'   => 'COPOM — Rate Decision (' . $d->format('M/Y') . ')',
        'descricao'   => 'O BCB divulga a decisão sobre a Selic ao final do segundo dia de reunião. O comunicado e a ata subsequente moldam a curva de juros doméstica e o câmbio.',
        'descricao_en'=> 'BCB releases the Selic decision at the end of day two. The statement and subsequent minutes shape the domestic rate curve and BRL.',
        'fonte'       => 'BCB',
        'relevancia'  => 'alta',
      ];
    }
  }

  // ── FOMC (datas fixas 2026) ───────────────────────────────────────────────
  foreach ($fomc_2026 as $fomc) {
    $dataStr = $fomc['data'];
    if (naJanela($dataStr, $janela_inicio, $janela_fim)) {
      $d = new DateTime($dataStr);
      $sufixo    = $fomc['dot_plot'] ? ' + Dot Plot' : '';
      $sufixoEn  = $fomc['dot_plot'] ? ' + Dot Plot' : '';
      $eventos[] = [
        'data'        => $dataStr,
        'hora_brt'    => '15:00',
        'regiao'      => 'US',
        'evento'      => 'FOMC — Decisão de juros' . $sufixo . ' (' . $d->format('M/Y') . ')',
        'evento_en'   => 'FOMC — Rate Decision' . $sufixoEn . ' (' . $d->format('M/Y') . ')',
        'descricao'   => 'Decisão do Federal Reserve sobre os Fed Funds.' . ($fomc['dot_plot'] ? ' Inclui o Summary of Economic Projections (Dot Plot) com projeção de trajetória de juros dos diretores.' : '') . ' Impacto direto no diferencial Brasil–EUA e no real.',
        'descricao_en'=> 'Federal Reserve decision on Fed Funds rates.' . ($fomc['dot_plot'] ? ' Includes Summary of Economic Projections (Dot Plot) with directors\' rate path forecast.' : '') . ' Direct impact on Brazil-US differential and BRL.',
        'fonte'       => 'Fed',
        'relevancia'  => 'alta',
      ];
    }
  }

  // ─── Tentar buscar eventos BCB adicionais via API Olinda ─────────────────
  // (releases oficiais: reuniões, atas, relatórios)
  $bcb_api_url = 'https://olinda.bcb.gov.br/olinda/servico/IFDATA/versao/v1/odata/'
    . 'CalendarioEvento?$filter=Data%20ge%20%27' . $janela_inicio . '%27%20and%20Data%20le%20%27' . $janela_fim . '%27'
    . '&$select=Data,Descricao,Hora&$format=json&$top=20';

  $ctx = stream_context_create(['http' => ['timeout' => 5, 'ignore_errors' => true]]);
  $bcb_raw = @file_get_contents($bcb_api_url, false, $ctx);
  if ($bcb_raw !== false) {
    $bcb_json = json_decode($bcb_raw, true);
    if (isset($bcb_json['value']) && is_array($bcb_json['value'])) {
      foreach ($bcb_json['value'] as $ev) {
        $dataStr = substr($ev['Data'] ?? '', 0, 10);
        $desc    = $ev['Descricao'] ?? '';
        // Evitar duplicar eventos já inseridos
        $jaExiste = false;
        foreach ($eventos as $e) {
          if ($e['data'] === $dataStr && stripos($e['evento'], 'bcb') !== false) {
            $jaExiste = true; break;
          }
        }
        if (!$jaExiste && naJanela($dataStr, $janela_inicio, $janela_fim) && strlen($desc) > 3) {
          $hora = isset($ev['Hora']) ? substr($ev['Hora'], 0, 5) : '09:00';
          $eventos[] = [
            'data'        => $dataStr,
            'hora_brt'    => $hora,
            'regiao'      => 'BR',
            'evento'      => $desc,
            'evento_en'   => $desc,
            'descricao'   => 'Evento do calendário oficial do Banco Central do Brasil.',
            'descricao_en'=> 'Event from the official Banco Central do Brasil calendar.',
            'fonte'       => 'BCB',
            'relevancia'  => 'media',
          ];
        }
      }
    }
  }

  // ─── Ordenar por data + hora ──────────────────────────────────────────────
  usort($eventos, function($a, $b) {
    $cmp = strcmp($a['data'], $b['data']);
    return $cmp !== 0 ? $cmp : strcmp($a['hora_brt'], $b['hora_brt']);
  });

  // ─── Montar JSON final ────────────────────────────────────────────────────
  $output = [
    'meta' => [
      'version'           => date('Y-m-d'),
      'curator'           => 'Szuchmacher Consultoria',
      'fontes_primarias'  => [
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

  // ─── Escrever agenda-data.json (um nível acima de scripts/) ──────────────
  $dest = __DIR__ . '/../agenda-data.json';
  $ok   = file_put_contents($dest, json_encode($output, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

  if ($ok === false) {
    error_log('[agenda-cron] ERRO ao gravar ' . $dest);
    exit(1);
  }

  $qtd = count($eventos);
  echo "[agenda-cron] OK — {$qtd} evento(s) para {$janela_inicio} a {$janela_fim}\n";
  exit(0);
  ```

---

## Task 5 — Track B: Testar agenda-cron.php localmente

- [ ] **Passo 5.1 — Verificar que PHP está disponível**

  Run:
  ```powershell
  php --version
  ```
  Expected: `PHP 8.x.x ...`
  
  Se não tiver PHP local instalado, pular para o Passo 5.3 (teste direto no servidor via SSH/cPanel terminal).

- [ ] **Passo 5.2 — Executar o cron localmente**

  Run:
  ```powershell
  php "E:\Diretorio\Claude\Site\site-producao\scripts\agenda-cron.php"
  ```
  Expected: saída como `[agenda-cron] OK — 3 evento(s) para 2026-06-22 a 2026-06-26`

- [ ] **Passo 5.3 — Verificar Focus na segunda-feira**

  Run:
  ```powershell
  $json = Get-Content "E:\Diretorio\Claude\Site\site-producao\agenda-data.json" | ConvertFrom-Json
  $json.janela
  $json.eventos | Where-Object { $_.evento -like "*Focus*" } | Select-Object data, hora_brt, evento
  ```
  Expected: Focus na data igual a `janela.inicio` (segunda-feira).

---

## Task 6 — Track B: Deploy agenda-cron.php + configurar cron no cPanel

- [ ] **Passo 6.1 — Upload de agenda-cron.php**

  Run:
  ```powershell
  curl.exe --ssl-reqd -s -S -w "%{http_code}" `
    -T "E:\Diretorio\Claude\Site\site-producao\scripts\agenda-cron.php" `
    "ftp://$($env:FTP_USER):$($env:FTP_PASS)@$($env:FTP_HOST)/public_html/scripts/agenda-cron.php"
  ```
  Expected: exit 0 (FTP sucesso) — curl.exe FTP não retorna HTTP codes.

- [ ] **Passo 6.2 — Verificar que o arquivo existe no servidor**

  Run:
  ```powershell
  curl.exe --ssl-reqd -s --list-only `
    "ftp://$($env:FTP_USER):$($env:FTP_PASS)@$($env:FTP_HOST)/public_html/scripts/"
  ```
  Expected: `agenda-cron.php` listado.

- [ ] **Passo 6.3 — Configurar cron no cPanel (ação manual de Yan)**

  No cPanel → Cron Jobs → Add New Cron Job:
  ```
  Minute:    0
  Hour:      23
  Day:       *
  Month:     *
  Weekday:   0
  Command:   /usr/local/bin/php /home/USERNAME/public_html/scripts/agenda-cron.php >> /home/USERNAME/logs/agenda-cron.log 2>&1
  ```
  Substituir `USERNAME` pelo nome do usuário HostGator (visível no cPanel → General Information).
  
  Resultado: cron executa todo domingo às 23h UTC = 20h BRT.

- [ ] **Passo 6.4 — Primeiro teste no servidor (execução manual)**

  Via cPanel → Terminal (ou SSH):
  ```bash
  php /home/USERNAME/public_html/scripts/agenda-cron.php
  ```
  Expected: `[agenda-cron] OK — N evento(s) para ...`

- [ ] **Passo 6.5 — Verificar agenda via endpoint de produção**

  Run:
  ```powershell
  $r = curl.exe -s "https://szuchmacher.com.br/assets/agenda.php"
  $j = $r | ConvertFrom-Json
  Write-Host "Janela: $($j.janela.inicio) a $($j.janela.fim)"
  Write-Host "Eventos: $($j.eventos.Count)"
  $j.eventos | Where-Object { $_.evento -like "*Focus*" } | Select-Object data, hora_brt
  ```
  Expected: Focus na segunda-feira da próxima semana.

---

## Task 7 — Track C: Criar config.php (gitignored)

**Files:**
- Create: `config.php`

- [ ] **Passo 7.1 — Criar config.php com nova chave OpenRouter**

  ⚠️ **ANTES DE CRIAR:** Verificar que a chave anterior foi **revogada** em openrouter.ai/keys e que uma nova chave foi gerada.

  Conteúdo de `config.php`:
  ```php
  <?php
  // Credenciais do servidor — não commitar, não exibir em logs
  define('OPENROUTER_KEY', 'sk-or-v1-NOVA_CHAVE_AQUI');
  define('OPENROUTER_URL', 'https://openrouter.ai/api/v1/chat/completions');
  define('OPENROUTER_MODEL', 'anthropic/claude-haiku-4-5');
  define('OPENROUTER_SITE', 'https://szuchmacher.com.br');
  ```

- [ ] **Passo 7.2 — Adicionar config.php ao .gitignore**

  Verificar/criar `.gitignore` na raiz do repositório com:
  ```
  site-producao/config.php
  site-producao/.env
  site-producao/_arquivo/
  ```

---

## Task 8 — Track C: Reescrever macro_api.php

**Files:**
- Modify: `macro_api.php`

- [ ] **Passo 8.1 — Escrever macro_api.php completo**

  Conteúdo completo:
  ```php
  <?php
  /**
   * macro_api.php — Szuchmacher Consultoria
   * 1. Cache de 7 dias: serve macro_data.json se fresco
   * 2. Busca dados BCB (SGS + Focus/Olinda)
   * 3. Gera narrativa via OpenRouter (claude-haiku-4-5)
   * 4. Persiste em macro_data.json e retorna ao frontend
   */

  header('Content-Type: application/json; charset=utf-8');
  header('Cache-Control: no-store, no-cache, must-revalidate');
  header('Access-Control-Allow-Origin: https://szuchmacher.com.br');
  header('Vary: Accept-Encoding');

  date_default_timezone_set('America/Sao_Paulo');

  $CACHE_FILE = __DIR__ . '/macro_data.json';
  $CACHE_TTL  = 7 * 24 * 3600; // 7 dias em segundos

  // ─── 1. Verificar cache ───────────────────────────────────────────────────
  $isCron = isset($_GET['cron']) && $_GET['cron'] === '1';

  if (!$isCron && file_exists($CACHE_FILE)) {
    $age = time() - filemtime($CACHE_FILE);
    if ($age < $CACHE_TTL) {
      $raw = file_get_contents($CACHE_FILE);
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
    echo json_encode(['ok' => false, 'error' => 'OPENROUTER_KEY não configurada']);
    exit;
  }

  // ─── 2. Buscar dados BCB ──────────────────────────────────────────────────

  function bcb_sgs(int $serie): ?array {
    $url = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.{$serie}/dados/ultimos/1?formato=json";
    $ctx = stream_context_create(['http' => ['timeout' => 8, 'ignore_errors' => true]]);
    $raw = @file_get_contents($url, false, $ctx);
    if ($raw === false) return null;
    $arr = json_decode($raw, true);
    return (is_array($arr) && isset($arr[0])) ? $arr[0] : null;
  }

  function bcb_focus(string $indicador, int $anoRef): ?float {
    $enc = rawurlencode("Indicador eq '{$indicador}' and anoReferencia eq {$anoRef}");
    $url = "https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/"
         . "ExpectativaMercadoAnuais?\$filter={$enc}&\$top=1&\$orderby=Data%20desc"
         . "&\$select=Mediana&\$format=json";
    $ctx = stream_context_create(['http' => ['timeout' => 8, 'ignore_errors' => true]]);
    $raw = @file_get_contents($url, false, $ctx);
    if ($raw === false) return null;
    $arr = json_decode($raw, true);
    if (!isset($arr['value'][0]['Mediana'])) return null;
    return (float)$arr['value'][0]['Mediana'];
  }

  // Selic meta (série 432)
  $selic_sgs = bcb_sgs(432);
  $selic_valor = $selic_sgs['valor'] ?? '14.75';
  $selic_data  = $selic_sgs['data'] ?? date('d/m/Y');

  // PTAX (série 1)
  $ptax_sgs = bcb_sgs(1);
  $ptax_valor = $ptax_sgs['valor'] ?? '5.15';
  $ptax_data  = $ptax_sgs['data'] ?? date('d/m/Y');

  // Focus medianas 2026
  $anoAtual = (int)date('Y');
  $focus_selic  = bcb_focus('Selic',  $anoAtual) ?? 14.75;
  $focus_ipca   = bcb_focus('IPCA',   $anoAtual) ?? 5.5;
  $focus_cambio = bcb_focus('Câmbio', $anoAtual) ?? 5.20;
  $focus_pib    = bcb_focus('PIB Total', $anoAtual) ?? 2.0;

  // ─── 3. Montar prompt ─────────────────────────────────────────────────────

  $dataHoje = date('d/m/Y');
  $mesAno   = date('F Y');

  $prompt = <<<PROMPT
Você é o analista de macro do Szuchmacher Consultoria, advisory patrimonial independente.
Data de hoje: {$dataHoje}.

DADOS BCB AO VIVO:
- Selic meta: {$selic_valor}% a.a. (data: {$selic_data})
- PTAX (USD/BRL): R$ {$ptax_valor} (data: {$ptax_data})

FOCUS — Medianas do mercado ({$anoAtual}):
- Selic fim de ano: {$focus_selic}% a.a.
- IPCA: {$focus_ipca}%
- Câmbio (USD/BRL): R$ {$focus_cambio}
- PIB Real: {$focus_pib}%

Gere um JSON **válido** com a estrutura EXATA abaixo. Use português do Brasil, tom técnico e analítico, voltado para investidores de alta renda. Sem comentários fora do JSON.

{
  "eyebrow": "string — ex: 'Cenário Global · Junho 2026'",
  "alert_title": "string — headline com 3 dados de mercado chave (S&P, câmbio, Selic ou commodity relevante)",
  "alert_text": "string — parágrafo de 4-6 linhas analisando o cenário macro global e doméstico com base nos dados fornecidos",
  "alert_badge": "string — evento dominante da semana (ex: 'COPOM 18/JUN')",
  "canais": [
    {"variavel": "string", "direcao": "up|down|neutral", "mecanismo": "string — 3-4 linhas de análise do canal de transmissão"},
    ... 6 a 8 canais totais cobrindo: Petróleo, Inflação Global, Juros (Fed/BCB), PIB Global, Dólar (DXY), Real (BRL), Ouro, Bitcoin
  ],
  "brasil": [
    {"label": "string", "text": "string — 4-6 linhas de análise"},
    ... 4 itens: SELIC e COPOM, Câmbio e Contas Externas, Renda Fixa, Atividade e Fiscal
  ],
  "beneficiados": ["string HTML com <strong>Nome</strong> — motivo", ... 5 itens],
  "penalizados": ["string HTML com <strong>Nome</strong> — motivo", ... 5 itens],
  "cenarios_brent": ["string HTML com <strong>Cenário N — Título:</strong> análise", ... 5 cenários],
  "ativos": {
    "ouro": {
      "conservador": {"taxa": "string ex '+4% a.a.'", "desc": "string — 3-4 linhas"},
      "moderado": {"taxa": "string", "desc": "string"},
      "agressivo": {"taxa": "string", "desc": "string"}
    },
    "prata": { ... mesmo formato ... },
    "platina": { ... mesmo formato ... },
    "bitcoin": {
      "conservador": {"taxa": "string ex '-60% total'", "desc": "string"},
      "moderado": {"taxa": "string", "desc": "string"},
      "agressivo": {"taxa": "string", "desc": "string"}
    }
  },
  "premissas_perfis": {
    "conservador": "string",
    "moderado": "string",
    "arrojado": "string"
  },
  "premissas_cenarios": {
    "pessimista": "string",
    "base": "string",
    "otimista": "string"
  }
}
PROMPT;

  // ─── 4. Chamar OpenRouter ─────────────────────────────────────────────────

  $req_body = json_encode([
    'model'    => OPENROUTER_MODEL,
    'messages' => [['role' => 'user', 'content' => $prompt]],
    'temperature' => 0.3,
    'max_tokens'  => 4096,
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

  $or_raw  = curl_exec($ch);
  $or_err  = curl_error($ch);
  $or_info = curl_getinfo($ch);
  curl_close($ch);

  if ($or_raw === false || !empty($or_err)) {
    http_response_code(503);
    echo json_encode(['ok' => false, 'error' => 'OpenRouter curl error: ' . $or_err]);
    exit;
  }

  $or_resp = json_decode($or_raw, true);
  if (empty($or_resp['choices'][0]['message']['content'])) {
    http_response_code(503);
    echo json_encode(['ok' => false, 'error' => 'OpenRouter resposta inválida', 'raw' => substr($or_raw, 0, 500)]);
    exit;
  }

  $content = trim($or_resp['choices'][0]['message']['content']);

  // Extrair JSON do conteúdo (pode vir com markdown ```json ... ```)
  if (preg_match('/```(?:json)?\s*([\s\S]+?)\s*```/i', $content, $m)) {
    $content = $m[1];
  }

  $data = json_decode($content, true);
  if (json_last_error() !== JSON_ERROR_NONE || !isset($data['eyebrow'])) {
    http_response_code(503);
    echo json_encode(['ok' => false, 'error' => 'JSON do LLM inválido: ' . json_last_error_msg(), 'raw' => substr($content, 0, 300)]);
    exit;
  }

  // ─── 5. Persistir cache ───────────────────────────────────────────────────

  $generated_at = date('d/m/Y \à\s H:i \B\R\T');
  $cache_payload = [
    'generated_at' => $generated_at,
    'data'         => $data,
  ];

  file_put_contents($CACHE_FILE, json_encode($cache_payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

  // ─── 6. Retornar ao frontend ──────────────────────────────────────────────

  echo json_encode([
    'ok'           => true,
    'generated_at' => $generated_at,
    'cache'        => false,
    'data'         => $data,
  ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  ```

---

## Task 9 — Track C: Deploy de config.php e macro_api.php

- [ ] **Passo 9.1 — Preencher config.php com nova chave OpenRouter**

  Editar `config.php` substituindo `NOVA_CHAVE_AQUI` pela chave gerada em openrouter.ai/keys.

- [ ] **Passo 9.2 — Upload de config.php**

  Run:
  ```powershell
  curl.exe --ssl-reqd -s -S -w "config.php: %{http_code}\n" `
    -T "E:\Diretorio\Claude\Site\site-producao\config.php" `
    "ftp://$($env:FTP_USER):$($env:FTP_PASS)@$($env:FTP_HOST)/public_html/config.php"
  ```

- [ ] **Passo 9.3 — Upload de macro_api.php**

  Run:
  ```powershell
  curl.exe --ssl-reqd -s -S -w "macro_api.php: %{http_code}\n" `
    -T "E:\Diretorio\Claude\Site\site-producao\macro_api.php" `
    "ftp://$($env:FTP_USER):$($env:FTP_PASS)@$($env:FTP_HOST)/public_html/macro_api.php"
  ```

- [ ] **Passo 9.4 — Testar macro_api.php em produção**

  Run:
  ```powershell
  $r = curl.exe -s "https://szuchmacher.com.br/macro_api.php"
  $j = $r | ConvertFrom-Json
  Write-Host "ok: $($j.ok)"
  Write-Host "cache: $($j.cache)"
  Write-Host "generated_at: $($j.generated_at)"
  Write-Host "eyebrow: $($j.data.eyebrow)"
  ```
  Expected: `ok: True`, `generated_at` com data de hoje, `eyebrow` com string não vazia.
  
  Se retornar `ok: False`, verificar `$j.error` para diagnóstico.

- [ ] **Passo 9.5 — Forçar regeneração (invalidar cache)**

  Run:
  ```powershell
  $r = curl.exe -s "https://szuchmacher.com.br/macro_api.php?cron=1"
  ($r | ConvertFrom-Json).ok
  ```
  Expected: `True` com `cache: False` (nova geração).

---

## Verificação final (todos os tracks)

```powershell
# Track A — email
$check = curl.exe -s "https://szuchmacher.com.br/honorarios.html"
if ($check -match "yan@szuchmacher") { "A ✓ yan@" } else { "A ✗ yan@ ausente" }

# Track A — assinatura.html
$code = curl.exe -s -o $null -w "%{http_code}" "https://szuchmacher.com.br/assinatura.html"
"A ✓ assinatura HTTP $code"

# Track B — agenda
$agenda = curl.exe -s "https://szuchmacher.com.br/assets/agenda.php" | ConvertFrom-Json
$focus = $agenda.eventos | Where-Object { $_.evento -like "*Focus*" }
if ($focus) { "B ✓ Focus em $($focus.data)" } else { "B ✗ Focus ausente" }

# Track C — macro
$macro = curl.exe -s "https://szuchmacher.com.br/macro_api.php" | ConvertFrom-Json
if ($macro.ok) { "C ✓ macro ok, gerado $($macro.generated_at)" } else { "C ✗ $($macro.error)" }
```
