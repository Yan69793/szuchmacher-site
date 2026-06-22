# run-agenda-agent.ps1 — Gera agenda-data.json e publica via deploy-all.ps1
# Usado pelo Task Scheduler (Szuchmacher-AgendaAgent)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ROOT   = Split-Path -Parent $PSScriptRoot
$YAN    = Join-Path (Split-Path -Parent $ROOT) 'automacao-yan-os'
$PY     = Join-Path $YAN 'venv\Scripts\python.exe'
$AGENT  = Join-Path $YAN 'agents\agenda_agent.py'
$DEPLOY = Join-Path $PSScriptRoot 'deploy-all.ps1'
$LOGDIR = Join-Path $YAN 'logs'
$LOG    = Join-Path $LOGDIR ("agenda_scheduled_{0:yyyyMMdd}.log" -f (Get-Date))

function Write-Log([string]$Msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Msg
    Write-Host $line
    New-Item -ItemType Directory -Force -Path $LOGDIR | Out-Null
    Add-Content -Path $LOG -Value $line -Encoding UTF8
}

try {
    Write-Log '=== INICIO agenda automatizada ==='

    if (-not (Test-Path $PY)) { throw "Python não encontrado: $PY" }
    if (-not (Test-Path $AGENT)) { throw "Agent não encontrado: $AGENT" }

    $env:YAN_OS_BATCH = '1'
    Push-Location $YAN
    & $PY $AGENT --dry-run
    if ($LASTEXITCODE -ne 0) { throw "agenda_agent.py falhou (exit $LASTEXITCODE)" }
    Pop-Location

    $json = Join-Path $ROOT 'agenda-data.json'
    if (-not (Test-Path $json)) { throw "agenda-data.json não gerado em $json" }
    Write-Log "JSON OK: $json"

    & $DEPLOY
    if ($LASTEXITCODE -ne 0) { throw "deploy-all.ps1 falhou (exit $LASTEXITCODE)" }

    Write-Log '=== FIM OK ==='
    exit 0
} catch {
    Write-Log "ERRO: $($_.Exception.Message)"
    exit 1
} finally {
    if ((Get-Location).Path -eq $YAN) { Pop-Location }
}