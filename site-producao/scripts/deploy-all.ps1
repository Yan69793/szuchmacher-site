# deploy-all.ps1 — szuchmacher.com.br
# Deploy via Cloudflare Workers (sz-sites). FTP removido em 20/07/2026.
# Uso: .\scripts\deploy-all.ps1 [-Purge]

param(
    [switch]$Purge         # purge Cloudflare apos deploy bem-sucedido
)

$cf = Join-Path $PSScriptRoot 'deploy-cloudflare.ps1'
if (-not (Test-Path $cf)) { Write-Error "deploy-cloudflare.ps1 nao encontrado"; exit 1 }
& $cf @PSBoundParameters
exit $LASTEXITCODE
