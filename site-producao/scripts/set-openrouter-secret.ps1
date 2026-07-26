# set-openrouter-secret.ps1 — grava OPENROUTER_KEY no Worker sem newline extra
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ROOT = Split-Path -Parent $PSScriptRoot
$CONFIG = Join-Path $ROOT 'config.php'
$WORKER = Join-Path $ROOT 'cloudflare-workers\sz-sites'

# config.php e gitignored e nunca foi versionado, entao so existe na maquina do
# Yan. Como o deploy-cloudflare.ps1 chama este script DEPOIS do wrangler deploy,
# lancar aqui fazia o publicar-com-rollback.ps1 cair no catch e afirmar que
# producao estava "intocada" quando ela ja tinha sido publicada. Sair 0 com aviso
# mantem o secret ja configurado no Worker e nao mente sobre o estado do deploy.
if (-not (Test-Path $CONFIG)) {
    Write-Host "AVISO: config.php ausente — OPENROUTER_KEY nao reenviada." -ForegroundColor Yellow
    Write-Host "       O secret ja configurado no Worker permanece valido." -ForegroundColor DarkGray
    exit 0
}

$keyLine = Get-Content $CONFIG | Where-Object { $_ -match "define\('OPENROUTER_KEY'" } | Select-Object -First 1
if ($keyLine -notmatch "define\('OPENROUTER_KEY',\s*'([^']+)'\)") { Write-Error 'OPENROUTER_KEY não encontrada em config.php' }
$key = $Matches[1].Trim()
if (-not $key -or $key -match 'NOVA_CHAVE') { Write-Error 'OPENROUTER_KEY inválida em config.php' }

$secretFile = Join-Path $env:TEMP 'openrouter-secret.txt'
try {
    [System.IO.File]::WriteAllText($secretFile, $key, [System.Text.UTF8Encoding]::new($false))
    Push-Location $WORKER
    Get-Content $secretFile -Raw | npx wrangler secret put OPENROUTER_KEY 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $prefix = $key.Substring(0, [Math]::Min(12, $key.Length))
    Write-Host "OPENROUTER_KEY configurada ($prefix...)" -ForegroundColor Green
}
finally {
    Pop-Location
    Remove-Item $secretFile -Force -ErrorAction SilentlyContinue
}