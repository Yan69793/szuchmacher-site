# audit-domain-palette.ps1
# Garante separação de design system:
#   szuchmacher.com.br  → institucional light
#   multi-assets.com    → produto dark (permitido)
#
# Uso: .\scripts\audit-domain-palette.ps1 [-Live]

param([switch]$Live)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ROOT = Split-Path -Parent $PSScriptRoot

$szPages = @(
  'index.html', 'assinatura.html', 'honorarios.html', 'radar-roic.html',
  'ebook.html', 'relatorios.html', 'privacidade.html', 'multiasset.html'
)
# multiasset.html redireciona no Worker; mesmo assim não pode carregar dark multi se for aberto local
$multiPages = @('multiasset-app.html', 'consultoria.html')

function Get-Issues([string]$content, [string]$role) {
  $issues = @()
  if ($role -eq 'sz') {
    if ($content -match '--bg:\s*#080808|--bg:\s*#0a0c10') { $issues += 'dark-bg' }
    if ($content -match 'theme-color" content="#080808"') { $issues += 'theme-dark' }
    if ($content -match "family=DM\+Sans|font-family:\s*'DM Sans'") { $issues += 'dm-sans' }
    if ($content -match '#c9a84c') { $issues += 'gold-multi' }
    if ($content -match 'class="[^"]*ysz-(lockup|stack)--dark') { $issues += 'html-dark-lockup' }
  }
  return $issues
}

$fail = 0
Write-Host "`n=== AUDIT palette separation (local) ===" -ForegroundColor Cyan
foreach ($f in $szPages) {
  $p = Join-Path $ROOT $f
  if (-not (Test-Path $p)) { Write-Host "SKIP $f"; continue }
  $c = Get-Content $p -Raw -Encoding UTF8
  $iss = Get-Issues $c 'sz'
  if ($iss.Count) { Write-Host "FAIL SZ  $f  $($iss -join ', ')" -ForegroundColor Red; $fail++ }
  else { Write-Host "PASS SZ  $f" -ForegroundColor Green }
}
foreach ($f in $multiPages) {
  $p = Join-Path $ROOT $f
  if (-not (Test-Path $p)) { continue }
  Write-Host "INFO MULTI $f  (dark product palette allowed)" -ForegroundColor DarkGray
}

if ($Live) {
  Write-Host "`n=== AUDIT live szuchmacher.com.br ===" -ForegroundColor Cyan
  $paths = @('/', '/assinatura.html', '/honorarios.html', '/radar-roic.html', '/ebook.html', '/relatorios.html', '/privacidade.html')
  foreach ($path in $paths) {
    $url = "https://szuchmacher.com.br$path"
    try {
      $r = Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 20
      $iss = Get-Issues $r.Content 'sz'
      if ($iss.Count) { Write-Host "FAIL LIVE $path  $($iss -join ', ')" -ForegroundColor Red; $fail++ }
      else { Write-Host "PASS LIVE $path" -ForegroundColor Green }
    } catch {
      Write-Host "ERR  LIVE $path  $($_.Exception.Message)" -ForegroundColor Yellow
      $fail++
    }
  }
}

if ($fail -gt 0) {
  Write-Host "`n$fail falha(s)." -ForegroundColor Red
  exit 1
}
Write-Host "`nOK — sem vazamento multi→sz." -ForegroundColor Green
exit 0
