# verify.ps1 — Gate canônico de verificação do site szuchmacher.com.br
#
# Uso:
#   .\scripts\verify.ps1          # gate local (sem rede, ~30s)
#   .\scripts\verify.ps1 -Full    # gate completo (+ produção, ~90s)
#   .\scripts\verify.ps1 -Json    # saída estruturada
#
# Exit 0 = tudo verde. Exit 1 = alguma falha detectada.
# Cada check executa independentemente (não aborta no primeiro fail).
# "Local" significa determinístico, sem dependência de rede externa.
#
# IMPORTANTE: os steps gravam $script:code em vez de exit, porque exit
# dentro de scriptblock terminaria este script (não é escopo de processo).

param(
    [switch]$Full,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ROOT   = Split-Path -Parent $PSScriptRoot
$WORKER = Join-Path $ROOT 'cloudflare-workers\sz-sites'
$AUTO   = Join-Path $ROOT '..\automacao-yan-os'
if (-not (Test-Path $AUTO)) { $AUTO = Join-Path $ROOT 'automacao-yan-os' }

$Global:checks = @()
$Global:falhas = 0
$script:code   = 0

function Add-CheckResult([string]$Name, [int]$ExitCode, [string]$Detail) {
    $ok = ($ExitCode -eq 0)
    $Global:checks += @{ Name = $Name; Ok = $ok; ExitCode = $ExitCode; Detail = $Detail }
    if (-not $ok) { $Global:falhas++ }
}

function Run-Check([string]$Name, [scriptblock]$Block) {
    Write-Host "`n=== $Name ===" -ForegroundColor Cyan
    $script:code = 0
    try {
        & $Block
        Add-CheckResult $Name $script:code "exit $script:code"
    } catch {
        Add-CheckResult $Name 1 ($_.Exception.Message -replace "`n", ' ')
    }
}

# ============================================================================
# 1. Git hygiene — whitespace e marcadores de conflito
# ============================================================================
Run-Check 'git diff --check' {
    Push-Location $ROOT
    try {
        $out = git --no-pager diff --check HEAD 2>&1
        $script:code = $LASTEXITCODE
        if ($script:code -ne 0) { Write-Host $out -ForegroundColor Yellow }
    } finally { Pop-Location }
}

# ============================================================================
# 2. PowerShell lint — test-scripts.ps1 (parse + FALHA-002)
# ============================================================================
Run-Check 'test-scripts.ps1 (lint PowerShell)' {
    & (Join-Path $PSScriptRoot 'test-scripts.ps1')
    $script:code = $LASTEXITCODE
}

# ============================================================================
# 3. Design lint — validar-design.ps1
# ============================================================================
Run-Check 'validar-design.ps1 (lint design)' {
    & (Join-Path $PSScriptRoot 'validar-design.ps1')
    $script:code = $LASTEXITCODE
}

# ============================================================================
# 4. Worker unit tests — node --test (glob obrigatorio no Windows)
# ============================================================================
Run-Check 'node --test (Worker unit tests)' {
    Push-Location $WORKER
    try {
        $out = node --test 'tests\*.test.mjs' 2>&1
        $script:code = $LASTEXITCODE
        Write-Host $out
    } finally { Pop-Location }
}

# ============================================================================
# 5. Python agent tests — pytest (14 testes)
# ============================================================================
Run-Check 'python -m pytest (agent tests)' {
    if (-not (Test-Path $AUTO)) {
        Write-Host "  AVISO: automacao-yan-os nao encontrado em $AUTO, pulando" -ForegroundColor Yellow
        $script:code = 0
        return
    }
    Push-Location $AUTO
    try {
        $out = python -m pytest tests/ -q 2>&1
        $script:code = $LASTEXITCODE
        Write-Host $out
    } finally { Pop-Location }
}

# ============================================================================
# 6. Build — build-cloudflare-public.ps1 (valida saida)
# ============================================================================
Run-Check 'build-cloudflare-public.ps1 (build)' {
    & (Join-Path $PSScriptRoot 'build-cloudflare-public.ps1') *>&1 | Select-Object -Last 5
    $script:code = $LASTEXITCODE
}

# ============================================================================
# 7. [Full apenas] Producao — validar-producao.ps1 (requer rede)
# ============================================================================
if ($Full) {
    Run-Check 'validar-producao.ps1 (gate producao)' {
        & (Join-Path $PSScriptRoot 'validar-producao.ps1')
        $script:code = $LASTEXITCODE
    }
} else {
    Write-Host "`n=== validar-producao.ps1 (PULADO - use -Full para gate completo) ===" -ForegroundColor DarkGray
    Add-CheckResult 'validar-producao.ps1' 0 'pulado (modo local)'
}

# ============================================================================
# Relatório
# ============================================================================
if ($Json) {
    [pscustomobject]@{
        total   = $Global:checks.Count
        falhas  = $Global:falhas
        ok      = ($Global:falhas -eq 0)
        mode    = if ($Full) { 'full' } else { 'local' }
        detalhe = $Global:checks
    } | ConvertTo-Json -Depth 4
} else {
    Write-Host "`n`n========================================" -ForegroundColor Cyan
    Write-Host "   VERIFY — relatório final" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan

    foreach ($c in $Global:checks) {
        if ($c.Ok) {
            Write-Host ("  OK     {0}" -f $c.Name) -ForegroundColor DarkGray
        } else {
            Write-Host ("  FALHA  {0}: {1}" -f $c.Name, $c.Detail) -ForegroundColor Red
        }
    }

    Write-Host ""
    if ($Global:falhas -eq 0) {
        Write-Host "$($Global:checks.Count) checks, 0 falhas. Gate verde." -ForegroundColor Green
    } else {
        Write-Host "$($Global:checks.Count) checks, $Global:falhas falha(s). Gate vermelho." -ForegroundColor Red
    }
}

if ($Global:falhas -gt 0) { exit 1 }
exit 0