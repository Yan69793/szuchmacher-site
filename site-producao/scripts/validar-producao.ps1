# validar-producao.ps1 — porta de qualidade de szuchmacher.com.br + multi-assets.com
#
# Uso:
#   .\scripts\validar-producao.ps1
#   .\scripts\validar-producao.ps1 -Json          # saida estruturada, para a rotina
#
# Sai com codigo 1 se qualquer verificacao falhar. E o gate que a rotina de
# domingo usa para decidir entre manter o deploy e reverter.
#
# Verifica CONTEUDO, nao so status. O incidente de 19/07/2026 teve todas as
# paginas em 200 enquanto 8 assets respondiam 404: checagem de status sozinha
# nao teria pegado nada.
#
# Contem e comparacao LITERAL, nao regex. Regex com barra invertida vira uma
# fonte de falso positivo silencioso quando o padrao atravessa camadas de shell,
# e um check que sempre passa e pior do que nao ter check.

param(
    [switch]$Json,
    [int]$TimeoutSeg = 30
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http

$SZ    = 'https://szuchmacher.com.br'
$MULTI = 'https://multi-assets.com'

# Url, Status esperado, Contem (substring literal), MinBytes, Timeout, Rotulo
$checks = @(
    # --- paginas do site institucional ---
    @{ Url = "$SZ/";                 Status = 200; Contem = 'Szuchmacher' }
    @{ Url = "$SZ/relatorios.html";  Status = 200 }
    @{ Url = "$SZ/honorarios.html";  Status = 200 }
    @{ Url = "$SZ/assinatura.html";  Status = 200; Contem = 'data-stripe-carta' }
    @{ Url = "$SZ/radar-roic.html";  Status = 301; Rotulo = 'radar-roic -> assinatura' }
    @{ Url = "$SZ/privacidade.html"; Status = 200 }

    # --- os 8 assets que sumiram no incidente de 19/07/2026 ---
    @{ Url = "$SZ/sitemap.xml";           Status = 200; Contem = '<loc>https://szuchmacher.com.br/</loc>' }
    @{ Url = "$SZ/og-cover.jpg";          Status = 200; MinBytes = 10000 }
    @{ Url = "$SZ/logo.png";              Status = 200; MinBytes = 10000 }
    @{ Url = "$SZ/macro_data.json";       Status = 200; MinBytes = 500 }
    @{ Url = "$SZ/relatorio_cache.json";  Status = @(200, 404); Rotulo = 'relatorio_cache.json (cache regeneravel)' }
    @{ Url = "$SZ/agenda-data.json";      Status = 200; MinBytes = 100 }

    # --- config: a guarda do checkout de teste nao pode se perder num rollback ---
    @{ Url = "$SZ/assets/sz-config.js"; Status = 200; Contem = 'test_/.test(v)) return false';
       Rotulo = 'sz-config.js: guarda de checkout de teste' }
    @{ Url = "$SZ/assets/sz-design.css"; Status = 200; Contem = '--navy' }

    # --- endpoints ---
    @{ Url = "$SZ/prices.php";        Status = 200; Contem = '"ok"' }
    @{ Url = "$SZ/market-data.php";   Status = 200; Contem = '"ok"' }
    # cascata de LLM a frio ja levou 32 s; 30 s de timeout dava falso negativo
    @{ Url = "$SZ/macro_api.php";     Status = 200; Timeout = 90 }
    @{ Url = "$SZ/assets/macro.php";  Status = 200 }
    @{ Url = "$SZ/assets/agenda.php"; Status = 200 }

    # --- redirects que precisam continuar redirecionando ---
    @{ Url = "$SZ/ebook";           Status = 301; Rotulo = 'ebook -> home' }
    @{ Url = "$SZ/multiasset.html"; Status = 301; Rotulo = 'multiasset.html -> multi-assets.com' }

    # --- plataforma ---
    @{ Url = "$MULTI/";            Status = 200; Contem = 'szuchmacher.com.br';
       Rotulo = 'multi home, com link institucional' }
    @{ Url = "$MULTI/consultoria"; Status = 200; Contem = 'szuchmacher.com.br';
       Rotulo = 'consultoria, com link institucional' }
    # multi-assets.com coleta e-mail no popup do simulador. Ate 26/07/2026 o
    # dominio respondia 404 aqui: coleta sem aviso ao titular. O popup linka
    # /privacidade.html, entao esta pagina nao pode sumir de novo em silencio.
    @{ Url = "$MULTI/privacidade.html"; Status = 200; Contem = 'Privacidade';
       Rotulo = 'multi: politica de privacidade (linkada no popup de lead)' }
    @{ Url = "$MULTI/og-cover.jpg";                     Status = 200; MinBytes = 10000 }
    @{ Url = "$MULTI/prices.php";                       Status = 200; Contem = '"ok"' }
    @{ Url = "$MULTI/assets/video/demo-multiasset.mp4"; Status = 200; MinBytes = 100000 }
    @{ Url = "$MULTI/assets/sz-config.js";              Status = 200 }
)

# HttpClient em vez de Invoke-WebRequest: o cmdlet lanca
# "Operation is not valid due to the current state of the object" em 3xx mesmo
# com -MaximumRedirection 0, o que tornava impossivel validar redirect COMO
# redirect. Aqui AllowAutoRedirect = false devolve o 301 como resposta normal.
$script:Clients = @{}
function Get-Client([int]$Seg) {
    if (-not $script:Clients.ContainsKey($Seg)) {
        $h = [System.Net.Http.HttpClientHandler]::new()
        $h.AllowAutoRedirect = $false
        $cli = [System.Net.Http.HttpClient]::new($h)
        $cli.Timeout = [TimeSpan]::FromSeconds($Seg)
        $script:Clients[$Seg] = $cli
    }
    return $script:Clients[$Seg]
}

function Test-Url([hashtable]$c) {
    $rotulo = if ($c.ContainsKey('Rotulo')) { $c.Rotulo } else { ($c.Url -replace '^https://', '') }
    $tmo    = if ($c.ContainsKey('Timeout')) { $c.Timeout } else { $TimeoutSeg }
    $falha  = { param($m) @{ Rotulo = $rotulo; Url = $c.Url; Ok = $false; Motivo = $m } }

    try {
        $resp = (Get-Client $tmo).GetAsync($c.Url).GetAwaiter().GetResult()
    } catch {
        if ($_.Exception.InnerException -and $_.Exception.InnerException.Message) { $msg = $_.Exception.InnerException.Message } else { $msg = $_.Exception.Message }
        return & $falha "erro de rede: $msg"
    }

    try {
        $status = [int]$resp.StatusCode
        $esperados = if ($c.Status -is [array]) { $c.Status } else { @($c.Status) }
        if ($status -notin $esperados) { return & $falha "HTTP $status, esperado $($esperados -join ' ou ')" }

        if ($c.ContainsKey('MinBytes') -or $c.ContainsKey('Contem')) {
            $buf = $resp.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()

            if ($c.ContainsKey('MinBytes') -and $buf.Length -lt $c.MinBytes) {
                return & $falha "$($buf.Length) bytes, minimo $($c.MinBytes)"
            }
            if ($c.ContainsKey('Contem')) {
                $texto = [System.Text.Encoding]::UTF8.GetString($buf)
                if (-not $texto.Contains($c.Contem)) { return & $falha "nao contem: $($c.Contem)" }
            }
        }
        return @{ Rotulo = $rotulo; Url = $c.Url; Ok = $true; Motivo = "HTTP $status" }
    } finally {
        $resp.Dispose()
    }
}

$resultados = @()
foreach ($c in $checks) { $resultados += Test-Url $c }
$falhas = @($resultados | Where-Object { -not $_.Ok })

if ($Json) {
    [pscustomobject]@{
        total   = $resultados.Count
        falhas  = $falhas.Count
        ok      = ($falhas.Count -eq 0)
        detalhe = $resultados
    } | ConvertTo-Json -Depth 4
} else {
    Write-Host "`n=== VALIDACAO DE PRODUCAO ===" -ForegroundColor Cyan
    foreach ($r in $resultados) {
        if ($r.Ok) { Write-Host ("  OK     {0}" -f $r.Rotulo) -ForegroundColor DarkGray }
        else       { Write-Host ("  FALHA  {0}: {1}" -f $r.Rotulo, $r.Motivo) -ForegroundColor Red }
    }
    Write-Host ""
    if ($falhas.Count -eq 0) {
        Write-Host "$($resultados.Count) verificacoes, 0 falha." -ForegroundColor Green
    } else {
        Write-Host "$($resultados.Count) verificacoes, $($falhas.Count) falha(s)." -ForegroundColor Red
    }
}

if ($falhas.Count -gt 0) { exit 1 }
exit 0
