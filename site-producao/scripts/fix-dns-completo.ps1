# fix-dns-completo.ps1 — pipeline DNS: limpeza + custom domains Worker
# Uso: .\scripts\fix-dns-completo.ps1 [-KeepApex]

param([switch]$KeepApex)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$here = $PSScriptRoot

Write-Host "`n=== FIX DNS COMPLETO (Cloudflare) ===" -ForegroundColor Cyan

$envFile = Join-Path (Split-Path $here -Parent) '.env'
$hasDns = $false
if (Test-Path $envFile) {
    $hasDns = [bool](Get-Content $envFile | Where-Object { $_ -match '^CLOUDFLARE_DNS_TOKEN=' })
}

if (-not $hasDns) {
    Write-Host "CLOUDFLARE_DNS_TOKEN ausente — abrindo painel para criar." -ForegroundColor Yellow
    & (Join-Path $here 'setup-cloudflare-dns-token.ps1')
    Write-Host "`nApos gravar o token, rode novamente: .\scripts\fix-dns-completo.ps1" -ForegroundColor Yellow
    exit 0
}

$cleanArgs = @{}
if ($KeepApex) { $cleanArgs['KeepApex'] = $true }
& (Join-Path $here 'cleanup-dns-cloudflare.ps1') @cleanArgs
if (-not $?) { exit 1 }

if (-not $KeepApex) {
    & (Join-Path $here 'attach-worker-domains.ps1')
    if (-not $?) { exit 1 }
}

Write-Host "`nValidando..." -ForegroundColor Cyan
@('https://szuchmacher.com.br/','https://multi-assets.com/') | ForEach-Object {
    $h = curl.exe -sI $_ 2>&1
    $st = ($h | Select-String '^HTTP' | Select-Object -First 1).Line
    $sv = ($h | Select-String 'X-Served-By' | Select-Object -First 1).Line
    Write-Host "  $_ -> $st $sv"
}
Write-Host "`nMX yan@:" -ForegroundColor Cyan
nslookup -type=mx szuchmacher.com.br 2>&1 | Select-String 'titan|mail exchanger'
Write-Host "`nConcluido." -ForegroundColor Green