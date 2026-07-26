# deploy-all.ps1 — szuchmacher.com.br
# Deploy via Cloudflare Workers (sz-sites). FTP removido em 20/07/2026.
# Uso:
#   .\scripts\deploy-all.ps1
#   .\scripts\deploy-all.ps1 -DryRun    # build + wrangler --dry-run, nao publica
#   .\scripts\deploy-all.ps1 -Purge     # purge do cache Cloudflare apos publicar

param(
    [switch]$DryRun,       # repassado ao deploy-cloudflare.ps1
    [switch]$Purge         # purge Cloudflare apos deploy bem-sucedido
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$cf = Join-Path $PSScriptRoot 'deploy-cloudflare.ps1'
if (-not (Test-Path $cf)) { Write-Error "deploy-cloudflare.ps1 nao encontrado"; exit 1 }

# A linha de invocacao carregava a entidade HTML "&amp;" no lugar do operador "&",
# entao o PowerShell tentava executar um comando "amp", inexistente. Sem
# ErrorActionPreference='Stop', o script podia ainda sair 0: um deploy que nao
# deployava e nao reclamava.
#
# @PSBoundParameters tambem repassava -Purge ao deploy-cloudflare.ps1, que so
# aceita -DryRun. Repassar apenas o que o script de destino conhece.
if ($DryRun) { & $cf -DryRun } else { & $cf }
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if ($Purge -and -not $DryRun) {
    $purge = Join-Path $PSScriptRoot 'purge-cloudflare.ps1'
    if (-not (Test-Path $purge)) { Write-Error "purge-cloudflare.ps1 nao encontrado"; exit 1 }
    & $purge
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

exit 0
