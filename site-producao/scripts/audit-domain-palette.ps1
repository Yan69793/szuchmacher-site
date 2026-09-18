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

# Paginas do dominio szuchmacher.com.br. Lista conferida contra
# scripts/build-cloudflare-public.ps1 ($szFiles) e contra producao em 18/09/2026.
# radar-roic.html, ebook.html e multiasset.html sairam: os arquivos nao existem
# no repo e o script so imprimia SKIP para eles. geopolitica.html e cv.html
# entraram: sao paginas sz publicadas que ficavam sem cobertura nenhuma.
$szPages = @(
  'index.html', 'assinatura.html', 'honorarios.html', 'relatorios.html',
  'privacidade.html', 'geopolitica.html', 'cv.html'
)
# dominios multi-assets.com, onde a paleta dark do produto e permitida.
# metodologia.html e so do multi: responde 200 em multi-assets.com/metodologia
# e 404 em szuchmacher.com.br/metodologia.html.
$multiPages = @('multiasset-app.html', 'consultoria.html', 'metodologia.html')

function Get-Issues([string]$content, [string]$role) {
  $issues = @()
  if ($role -eq 'sz') {
    if ($content -match '--bg:\s*#080808|--bg:\s*#0a0c10') { $issues += 'dark-bg' }
    if ($content -match 'theme-color" content="#080808"') { $issues += 'theme-dark' }
    if ($content -match "family=DM\+Sans|font-family:\s*'DM Sans'") { $issues += 'dm-sans' }
    if ($content -match '#c9a84c') { $issues += 'gold-multi' }
    # Lockup claro sobre fundo claro. O rodape navy e o unico lugar sancionado
    # para o modificador --dark no dominio sz: sz-assinatura.css:112,
    # sz-honorarios.css:124, sz-cv.css:365 e sz-privacidade.css:34 definem
    # footer { background: var(--navy) }. A checagem ignora o rodape porque
    # olhar a pagina inteira reprovava esse uso correto.
    $semRodape = ($content -split '<footer')[0]
    if ($semRodape -match 'class="[^"]*ysz-(lockup|stack)--dark') { $issues += 'html-dark-lockup' }
  }
  return $issues
}

$fail = 0
Write-Host "`n=== AUDIT palette separation (local) ===" -ForegroundColor Cyan
foreach ($f in $szPages) {
  $p = Join-Path $ROOT $f
  if (-not (Test-Path $p)) { Write-Host "SKIP $f"; continue }
  $c = Get-Content $p -Raw -Encoding UTF8
  $iss = @(Get-Issues $c 'sz')
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
      $iss = @(Get-Issues $r.Content 'sz')
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
