# run-geopolitica-agent.ps1, gera a edicao semanal e publica com rollback.
# Gatilho normal: domingo. Gatilho de recuperacao: segunda antes das 14:00 BRT.
# O agente calcula a semana alvo, preserva historico e valida o JSON antes de
# qualquer publicacao. A segunda usa --force para recuperar uma falha de domingo.

param([switch]$Simular)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

$ROOT     = Split-Path -Parent $PSScriptRoot
$REPO     = Split-Path -Parent $ROOT
$YAN      = Join-Path $REPO 'automacao-yan-os'
$AGENT    = Join-Path $YAN 'agents\geopolitica_agent.py'
$PUBLICAR = Join-Path $PSScriptRoot 'publicar-com-rollback.ps1'
$ALERT    = Join-Path $PSScriptRoot 'send-alert-email.ps1'
$LOGDIR   = Join-Path $YAN 'logs'
$LOG      = Join-Path $LOGDIR ("geopolitica_scheduled_{0:yyyyMMdd}.log" -f (Get-Date))

$PY_CANDIDATOS = @(
    (Join-Path $YAN 'venv-task\Scripts\python.exe'),
    (Join-Path $YAN 'venv\Scripts\python.exe'),
    (Join-Path $YAN 'venv-py312\Scripts\python.exe'),
    'C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe'
)

function Resolve-Python {
    $tentados = @()
    foreach ($p in $PY_CANDIDATOS) {
        if (-not (Test-Path -LiteralPath $p)) { $tentados += "$p (ausente)"; continue }
        $saida = & $p -c "import sys, requests; sys.stdout.write(sys.version.split()[0])" 2>&1
        $rc = $LASTEXITCODE
        if ($rc -ne 0) { $tentados += "$p (sem requests, exit $rc)"; continue }
        $v = ("$saida" -split "`r?`n")[0].Trim()
        if ($v -match '^(\d+)\.(\d+)') {
            $major = [int]$Matches[1]; $minor = [int]$Matches[2]
            if ($major -gt 3 -or ($major -eq 3 -and $minor -ge 10)) {
                return @{ Exe = $p; Versao = $v }
            }
        }
        $tentados += "$p ($v, abaixo de 3.10)"
    }
    throw ('nenhum Python 3.10+ com requests encontrado. Testados: ' + ($tentados -join ' | '))
}

function Write-Log([string]$Msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Msg
    Write-Host $line
    New-Item -ItemType Directory -Force -Path $LOGDIR | Out-Null
    Add-Content -LiteralPath $LOG -Value $line -Encoding UTF8
}

try {
    Write-Log '=== INICIO geopolitica automatizada ==='
    if (-not (Test-Path -LiteralPath $AGENT)) { throw "Agent nao encontrado: $AGENT" }
    if (-not (Test-Path -LiteralPath $PUBLICAR)) { throw "Publicador nao encontrado: $PUBLICAR" }
    $py = Resolve-Python
    Write-Log ("Python: {0} ({1})" -f $py.Exe, $py.Versao)

    $argsAgent = @('--dry-run')
    $agora = Get-Date
    if ($agora.DayOfWeek -eq 'Monday' -and $agora.Hour -lt 14) {
        $argsAgent += '--force'
        Write-Log 'Fallback de segunda-feira ativo: regeracao forcada da semana corrente.'
    }

    $env:YAN_OS_BATCH = '1'
    Push-Location $YAN
    try {
        & $py.Exe $AGENT @argsAgent
        $rcAgent = $LASTEXITCODE
    } finally { Pop-Location }
    if ($rcAgent -ne 0) { throw "geopolitica_agent.py falhou (exit $rcAgent)" }

    $json = Join-Path $ROOT 'geopolitica-data.json'
    if (-not (Test-Path -LiteralPath $json)) { throw "geopolitica-data.json nao encontrado: $json" }
    $payload = Get-Content -LiteralPath $json -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($payload.schema_version -ne 1) { throw 'geopolitica-data.json com schema inesperado' }
    Write-Log ("JSON OK: semana {0}, {1} bytes" -f $payload.week.iso, (Get-Item -LiteralPath $json).Length)

    if ($Simular) {
        Write-Log 'SIMULACAO: publicacao pulada.'
        exit 0
    }
    & $PUBLICAR
    if ($LASTEXITCODE -eq 2) {
        Write-Log 'AVISO: outro publicador (provavelmente AgendaAgent) estava rodando, lock ocupado. Nao e falha, sem alerta. Edicao gerada fica pendente para o proximo gatilho.'
        exit 0
    }
    if ($LASTEXITCODE -ne 0) { throw "publicar-com-rollback.ps1 falhou (exit $LASTEXITCODE)" }
    Write-Log 'Publicado e validado pelo publicador com rollback.'
    Write-Log '=== FIM OK ==='
    exit 0
} catch {
    Write-Log "ERRO: $($_.Exception.Message)"
    if (-not $Simular) {
        $alertaOk = & $ALERT -Subject '[Szuchmacher] Falha no Radar Geopolitico' -Body "run-geopolitica-agent.ps1 falhou em $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss').`n`nErro: $($_.Exception.Message)`n`nLog: $LOG"
        if ($alertaOk) { Write-Log 'Alerta por e-mail: enviado.' }
        else { Write-Log 'Alerta por e-mail: NAO ENVIADO.' }
    }
    exit 1
} finally {
    if ((Get-Location).Path -eq $YAN) { Pop-Location }
}
