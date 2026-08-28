# test-scripts.ps1 — validação estática dos scripts de deploy/automação
# Uso: .\scripts\test-scripts.ps1
# Sai 1 se algum script crítico não parsear ou violar a regra FALHA-002
# (script chamado pelo Task Scheduler com $ErrorActionPreference = 'Stop'
# aborta antes do exit e o LastTaskResult reporta 0 com falha real).

$ErrorActionPreference = 'Continue'

$raiz = Split-Path -Parent $PSScriptRoot
$alvos = @(
    'scripts\deploy-cloudflare.ps1',
    'scripts\deploy-all.ps1',
    'scripts\publicar-com-rollback.ps1',
    'scripts\validar-producao.ps1',
    'scripts\run-agenda-agent.ps1',
    'scripts\run-macro-cron.ps1',
    'scripts\run-macro-agent.ps1',
    'scripts\check-macro-cron.ps1',
    'scripts\register-agents.ps1',
    'scripts\send-alert-email.ps1'
)

$falhas = 0

foreach ($rel in $alvos) {
    $p = Join-Path $raiz $rel
    if (-not (Test-Path $p)) {
        Write-Host "FALTA: $rel" -ForegroundColor Red
        $falhas++
        continue
    }
    $tokens = $null
    $errors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($p, [ref]$tokens, [ref]$errors) | Out-Null
    if ($errors -and $errors.Count -gt 0) {
        Write-Host "PARSE ERRO: $rel" -ForegroundColor Red
        foreach ($e in $errors) {
            Write-Host "  linha $($e.Extent.StartLineNumber): $($e.Message)" -ForegroundColor Yellow
        }
        $falhas++
    } else {
        Write-Host "OK: $rel"
    }
}

# FALHA-002: scripts chamados DIRETAMENTE pelo Task Scheduler nao podem usar 'Stop' global
# check-macro-cron.ps1 entrou aqui em 2026-08-27: e chamado direto pelo Task
# Scheduler (watchdog do cron macro) e estava fora da guarda FALHA-002.
$taskScripts = @('scripts\run-agenda-agent.ps1', 'scripts\run-macro-cron.ps1', 'scripts\run-macro-agent.ps1', 'scripts\check-macro-cron.ps1')
foreach ($rel in $taskScripts) {
    $p = Join-Path $raiz $rel
    if (-not (Test-Path $p)) { continue }
    $txt = Get-Content $p -Raw
    try {
        $usaStop = $txt -match '(?m)^\$ErrorActionPreference\s*=\s*''Stop'''
    } catch {
        Write-Host "REGEX ERRO ao checar $rel : $($_.Exception.Message)" -ForegroundColor Yellow
        $falhas++
        continue
    }
    if ($usaStop) {
        Write-Host "FALHA-002: $rel usa 'Stop' global" -ForegroundColor Red
        $falhas++
    } else {
        Write-Host "EAP OK: $rel"
    }
}

if ($falhas -gt 0) {
    Write-Host "`n$falhas falha(s)." -ForegroundColor Red
    exit 1
}
Write-Host "`nTudo certo." -ForegroundColor Green
exit 0
