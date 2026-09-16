# set-deepseek-secret.ps1 — grava DEEPSEEK_KEY no Worker sem newline extra
#
# P1-001 (16/09/2026): a conta OpenRouter do projeto ficou com credito zerado e
# o refresh do macro morria em HTTP 402 antes de chegar ao modelo. O handler
# macro-api.js passou a tentar a cadeia DeepSeek -> OpenRouter, e a perna
# DeepSeek precisa desta secret no Worker. A chave vive na variavel de usuario
# DEEPSEEK_API_KEY (nunca em arquivo versionado) e este script so a copia para o
# Worker sem imprimi-la.
#
# Uso: .\scripts\set-deepseek-secret.ps1

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ROOT   = Split-Path -Parent $PSScriptRoot
$WORKER = Join-Path $ROOT 'cloudflare-workers\sz-sites'

$key = $env:DEEPSEEK_API_KEY
if (-not $key) { $key = $env:DEEPSEEK_KEY }
if (-not $key) {
    $key = [Environment]::GetEnvironmentVariable('DEEPSEEK_API_KEY', 'User')
}
if (-not $key) { Write-Error 'DEEPSEEK_API_KEY/DEEPSEEK_KEY ausente no ambiente (processo ou usuario)' }
$key = $key.Trim()
if ($key.Length -lt 20) { Write-Error 'chave DeepSeek suspeita (curta demais); nada foi gravado' }

$secretFile = Join-Path $env:TEMP 'deepseek-secret.txt'

# Mesma guarda de deploy-cloudflare.ps1 / set-openrouter-secret.ps1: o
# CLOUDFLARE_API_TOKEN persistido tem precedencia sobre o login OAuth do
# wrangler e nao carrega o escopo de Workers, o que derruba o `secret put`.
$tokenAmbiente = $env:CLOUDFLARE_API_TOKEN
if ($tokenAmbiente) { [Environment]::SetEnvironmentVariable('CLOUDFLARE_API_TOKEN', $null, 'Process') }

try {
    [System.IO.File]::WriteAllText($secretFile, $key, [System.Text.UTF8Encoding]::new($false))
    Push-Location $WORKER
    Get-Content $secretFile -Raw | npx wrangler secret put DEEPSEEK_KEY 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $prefix = $key.Substring(0, [Math]::Min(8, $key.Length))
    Write-Host "DEEPSEEK_KEY configurada ($prefix...)" -ForegroundColor Green
}
finally {
    if ($tokenAmbiente) { $env:CLOUDFLARE_API_TOKEN = $tokenAmbiente }
    Pop-Location
    Remove-Item $secretFile -Force -ErrorAction SilentlyContinue
}
