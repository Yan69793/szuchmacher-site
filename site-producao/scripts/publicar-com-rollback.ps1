# publicar-com-rollback.ps1 — deploy com validacao bloqueante e reversao automatica
#
# Uso:
#   .\scripts\publicar-com-rollback.ps1
#   .\scripts\publicar-com-rollback.ps1 -Simular   # nao publica, so mostra o plano
#
# Sequencia:
#   1. anota a versao viva do Worker, que e o alvo de rollback
#   2. build (o proprio build reprova saida incompleta e aborta aqui)
#   3. deploy
#   4. espera propagar e valida producao
#   5. se a validacao falhar, volta para a versao anotada e valida de novo
#
# Sai 0 so quando producao termina validada. Qualquer outro caminho sai 1.
#
# Existe porque em 19/07/2026 um deploy publicou public/ pela metade e ficou 10
# horas no ar: 8 arquivos em 404, a pagina de consultoria fora e todo preview de
# link quebrado nos dois dominios. Ninguem percebeu porque o wrangler saiu 0.

param(
    [switch]$Simular,
    [int]$EsperaSeg = 12
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RAIZ     = Split-Path -Parent $PSScriptRoot
$WORKER   = Join-Path $RAIZ 'cloudflare-workers\sz-sites'
$DEPLOY   = Join-Path $PSScriptRoot 'deploy-cloudflare.ps1'
$VALIDAR  = Join-Path $PSScriptRoot 'validar-producao.ps1'
$LOGDIR   = Join-Path $RAIZ 'diagnosticos'
$carimbo  = Get-Date -Format 'yyyy-MM-dd_HHmm'

if (-not (Test-Path $LOGDIR)) { New-Item -ItemType Directory -Path $LOGDIR -Force | Out-Null }
$LOG = Join-Path $LOGDIR "publicacao_$carimbo.md"

$linhas = @()
function Registrar([string]$txt, [string]$cor = 'Gray') {
    Write-Host $txt -ForegroundColor $cor
    $script:linhas += $txt
}

Registrar "# Publicacao $carimbo" 'Cyan'
Registrar ""

# Le a versao com 100% do trafego. Vale para antes e depois do deploy: parsear a
# saida do deploy nao funciona, porque o deploy-cloudflare.ps1 manda o wrangler
# para Out-Host, que escreve no console e nao na saida capturavel.
function Get-VersaoViva {
    Push-Location $WORKER
    try { $s = (npx wrangler deployments status 2>&1 | Out-String) } finally { Pop-Location }
    $mm = [regex]::Match($s, '\(100%\)\s+([0-9a-f-]{36})')
    if ($mm.Success) { return @{ Id = $mm.Groups[1].Value; Bruto = $s } }
    return @{ Id = $null; Bruto = $s }
}

# O validador imprime com Write-Host, que tambem nao e capturavel. Por isso a
# rotina conversa com ele por -Json, que sai pelo stream de saida de verdade.
function Invoke-Validacao {
    $bruto = (& $VALIDAR -Json 2>&1 | Out-String)
    $codigo = $LASTEXITCODE
    try   { $obj = $bruto | ConvertFrom-Json }
    catch { return @{ Ok = $false; Resumo = 'validador nao devolveu JSON'; Falhas = @(); Bruto = $bruto } }

    $falhas = @($obj.detalhe | Where-Object { -not $_.Ok })
    return @{
        Ok     = ($codigo -eq 0 -and $obj.falhas -eq 0)
        Resumo = "$($obj.total) verificacoes, $($obj.falhas) falha(s)"
        Falhas = $falhas
        Bruto  = $bruto
    }
}

function Escrever-Validacao($v) {
    Registrar $v.Resumo
    if ($v.Falhas.Count -gt 0) {
        foreach ($f in $v.Falhas) { Registrar ("- **$($f.Rotulo)**: $($f.Motivo)") }
    }
}

# --- 1. versao viva, alvo do rollback ---------------------------------------
$vv = Get-VersaoViva
$status = $vv.Bruto

if (-not $vv.Id) {
    Registrar "ABORTADO: nao consegui ler a versao viva do Worker." 'Red'
    Registrar "Sem alvo de rollback, publicar seria apostar. Saida do wrangler:" 'Red'
    Registrar '```'; Registrar $status.Trim(); Registrar '```'
    $linhas | Set-Content -Path $LOG -Encoding utf8
    exit 1
}
$versaoAnterior = $vv.Id
Registrar "Versao viva antes de publicar: ``$versaoAnterior``"
Registrar ""

if ($Simular) {
    Registrar "Modo simulacao. Nada foi publicado." 'Yellow'
    Registrar "Rollback iria para: $versaoAnterior"
    $linhas | Set-Content -Path $LOG -Encoding utf8
    exit 0
}

# --- 2 e 3. build e deploy ---------------------------------------------------
# O build reprova saida incompleta e o deploy-cloudflare.ps1 aborta antes de
# chamar o wrangler, entao um build quebrado nunca chega a virar deploy.
Registrar "## Build e deploy"
$deployOk = $true
try {
    # Sem captura de proposito: o deploy escreve direto no console e o progresso
    # do wrangler fica visivel. A versao nova vem do wrangler depois, nao daqui.
    & $DEPLOY
    if ($LASTEXITCODE -ne 0) { $deployOk = $false }
} catch {
    $deployOk = $false
    Registrar "Excecao no deploy: $($_.Exception.Message)" 'Red'
}

if (-not $deployOk) {
    Registrar "FALHOU. Producao segue na versao $versaoAnterior, intocada." 'Red'
    $linhas | Set-Content -Path $LOG -Encoding utf8
    exit 1
}

$versaoNova = (Get-VersaoViva).Id
if (-not $versaoNova) { $versaoNova = '(nao lida)' }
Registrar "Publicado. Versao nova: ``$versaoNova``" 'Green'
Registrar ""

# --- 4. validacao bloqueante -------------------------------------------------
Registrar "## Validacao"
Start-Sleep -Seconds $EsperaSeg
$val = Invoke-Validacao
Escrever-Validacao $val

if ($val.Ok) {
    Registrar ""
    Registrar "PUBLICACAO CONFIRMADA. Producao validada na versao $versaoNova." 'Green'
    $linhas | Set-Content -Path $LOG -Encoding utf8
    Write-Host "`nRelatorio: $LOG" -ForegroundColor DarkGray
    exit 0
}

# --- 5. rollback -------------------------------------------------------------
Registrar ""
Registrar "## Rollback" 'Yellow'
Registrar "A validacao reprovou. Revertendo para $versaoAnterior." 'Yellow'

Push-Location $WORKER
try {
    $saidaRb = (npx wrangler rollback $versaoAnterior -y -m "Rollback automatico: validacao pos-deploy reprovou" 2>&1 | Out-String)
    $rbOk = ($LASTEXITCODE -eq 0)
} finally { Pop-Location }

# Guarda so a ultima linha util do wrangler: a saida completa vem cheia de
# desenho de caixa que vira mojibake no arquivo e nao ajuda em nada.
$resumoRb = @($saidaRb -split "`n" | Where-Object { $_ -match 'SUCCESS|ERROR|has been deployed' }) -join ' '
Registrar "wrangler: $($resumoRb.Trim())"

if (-not $rbOk) {
    Registrar ""
    Registrar "ROLLBACK FALHOU. Producao pode estar quebrada na versao $versaoNova." 'Red'
    Registrar "Intervencao manual necessaria:" 'Red'
    Registrar "    cd $WORKER"
    Registrar "    npx wrangler rollback $versaoAnterior -y"
    $linhas | Set-Content -Path $LOG -Encoding utf8
    exit 1
}

Start-Sleep -Seconds $EsperaSeg
Registrar ""
Registrar "### Validacao apos rollback"
$val2 = Invoke-Validacao
Escrever-Validacao $val2

Registrar ""
if ($val2.Ok) {
    Registrar "REVERTIDO. Producao de volta em $versaoAnterior e validada." 'Yellow'
    Registrar "A versao $versaoNova foi rejeitada. Veja a validacao acima para o motivo."
} else {
    Registrar "REVERTIDO, MAS AINDA REPROVANDO." 'Red'
    Registrar "A falha e anterior a este deploy, entao rollback nao resolve. Investigar a mao."
}

$linhas | Set-Content -Path $LOG -Encoding utf8
Write-Host "`nRelatorio: $LOG" -ForegroundColor DarkGray
exit 1
