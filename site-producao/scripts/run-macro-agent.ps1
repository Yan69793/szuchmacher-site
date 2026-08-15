# run-macro-agent.ps1 — Gera macro_data.json (via Claude) e publica com validacao e rollback
# Usado pelo Task Scheduler (Szuchmacher-MacroAgent)
#
# FALHA-002 (corrigido 2026-08-15): antes usava $ErrorActionPreference = 'Stop',
# que aborta o script antes do exit e faz o Task Scheduler reportar LastResult 0
# com falha real. Agora 'Continue', com o sucesso decidido por $LASTEXITCODE.
# A publicacao passou de deploy-cloudflare.ps1 (sem validacao) para
# publicar-com-rollback.ps1, que valida producao e reverte em caso de falha.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

$ROOT     = Split-Path -Parent $PSScriptRoot
$YAN      = Join-Path (Split-Path -Parent $ROOT) 'automacao-yan-os'
$PY       = Join-Path $YAN 'venv\Scripts\python.exe'
$AGENT    = Join-Path $YAN 'agents\macro_agent.py'
$PUBLICAR = Join-Path $PSScriptRoot 'publicar-com-rollback.ps1'
$ALERT    = Join-Path $PSScriptRoot 'send-alert-email.ps1'
$LOGDIR   = Join-Path $YAN 'logs'
$LOG      = Join-Path $LOGDIR ("macro_agent_scheduled_{0:yyyyMMdd}.log" -f (Get-Date))

function Write-Log([string]$Msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Msg
    Write-Host $line
    New-Item -ItemType Directory -Force -Path $LOGDIR | Out-Null
    Add-Content -Path $LOG -Value $line -Encoding UTF8
}

try {
    Write-Log '=== INICIO macro agent automatizado ==='

    if (-not (Test-Path $PY)) { throw "Python não encontrado: $PY" }
    if (-not (Test-Path $AGENT)) { throw "Agent não encontrado: $AGENT" }

    $env:YAN_OS_BATCH = '1'
    Push-Location $YAN
    & $PY $AGENT --dry-run
    if ($LASTEXITCODE -ne 0) { throw "macro_agent.py falhou (exit $LASTEXITCODE)" }
    Pop-Location

    $json = Join-Path $ROOT 'macro_data.json'
    if (-not (Test-Path $json)) { throw "macro_data.json não gerado em $json" }
    Write-Log "JSON OK: $json"

    & $PUBLICAR
    if ($LASTEXITCODE -ne 0) { throw "publicar-com-rollback.ps1 falhou (exit $LASTEXITCODE)" }

    Write-Log '=== FIM OK ==='
    exit 0
} catch {
    Write-Log "ERRO: $($_.Exception.Message)"
    & $ALERT -Subject "[Szuchmacher] Falha na automação de macro agent" -Body "run-macro-agent.ps1 falhou em $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss').`n`nErro: $($_.Exception.Message)`n`nLog: $LOG"
    exit 1
} finally {
    if ((Get-Location).Path -eq $YAN) { Pop-Location }
}
