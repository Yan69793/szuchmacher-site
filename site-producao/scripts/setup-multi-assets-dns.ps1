# setup-multi-assets-dns.ps1 — DNS Cloudflare para multi-assets.com
# Uso:
#   .\scripts\setup-multi-assets-dns.ps1              # abre painel + mostra valores
#   .\scripts\setup-multi-assets-dns.ps1 -Apply       # aplica via API (precisa token DNS)
#   .\scripts\setup-multi-assets-dns.ps1 -Token "..." -Apply
#
# Token necessario para -Apply:
#   Zone > DNS > Edit + Zone > Zone Settings > Edit
#   Include > multi-assets.com
# Grave em .env como CLOUDFLARE_DNS_TOKEN= (separado do token de purge)

param(
    [string]$Token,
    [switch]$Apply,
    [switch]$SkipBrowser
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ROOT     = Split-Path -Parent $PSScriptRoot
$ENV_FILE = Join-Path $ROOT '.env'
$DOMAIN   = 'multi-assets.com'
$ZONE_ID  = '8ca066c2dda0d90e475b5c9eb255cbfd'
$ACCOUNT  = '7ac79fb1030e4e81115ef33c21a9b070'
$ORIGIN   = '192.0.2.1'     # placeholder proxied (Worker sz-sites; nao usar 100.64.0.0)

if (-not $Token -and (Test-Path $ENV_FILE)) {
    $lines = Get-Content $ENV_FILE
    $dnsLine = $lines | Where-Object { $_ -match '^CLOUDFLARE_DNS_TOKEN=' } | Select-Object -First 1
    if ($dnsLine) { $Token = ($dnsLine -split '=', 2)[1].Trim() }
}

Write-Host "`n=== DNS MULTI-ASSETS.COM ===" -ForegroundColor Cyan
Write-Host "Zona CF: $ZONE_ID (status: active)"
Write-Host "Placeholder Worker: $ORIGIN (trafego via sz-sites)"
Write-Host ""

$records = @(
    @{ type = 'A'; name = $DOMAIN;     content = $ORIGIN; proxied = $true }
    @{ type = 'A'; name = "www.$DOMAIN"; content = $ORIGIN; proxied = $true }
)

Write-Host "Registros a criar/atualizar:" -ForegroundColor Yellow
foreach ($r in $records) {
    $proxy = if ($r.proxied) { 'Proxied (nuvem laranja)' } else { 'DNS only' }
    Write-Host "  $($r.type)  $($r.name)  ->  $($r.content)  [$proxy]"
}
Write-Host ""
Write-Host "SSL/TLS: Full" -ForegroundColor Yellow
Write-Host "Always Use HTTPS: On" -ForegroundColor Yellow
Write-Host ""

if (-not $Apply) {
    if (-not $SkipBrowser) {
        Start-Process "https://dash.cloudflare.com/$ACCOUNT/$DOMAIN/dns/records"
        Start-Sleep -Milliseconds 500
        Start-Process 'https://dash.cloudflare.com/profile/api-tokens'
    }
    Write-Host @"
MANUAL (~2 min no painel ja aberto):
  1. DNS > Add record > A | Name: @ | IPv4: $ORIGIN | Proxied: ON
  2. DNS > Add record > A | Name: www | IPv4: $ORIGIN | Proxied: ON
  3. SSL/TLS > Overview > Full
  4. SSL/TLS > Edge Certificates > Always Use HTTPS: ON

HostGator (se ainda nao fez):
  cPanel > Dominios > Addon Domain > multi-assets.com
  Document root: /multi-assets.com (arquivos ja no FTP)

Automatizar depois:
  Crie token DNS Edit em multi-assets.com e rode:
  .\scripts\setup-multi-assets-dns.ps1 -Token "SEU_TOKEN" -Apply

"@ -ForegroundColor Green
    return
}

if (-not $Token -or $Token.Length -lt 20) {
    Write-Error 'Token DNS ausente. Use -Token ou CLOUDFLARE_DNS_TOKEN no .env'
}

$headers = @{
    Authorization  = "Bearer $Token"
    'Content-Type' = 'application/json'
}

function Invoke-Cf {
    param([string]$Method, [string]$Path, $Body = $null)
    $uri = "https://api.cloudflare.com/client/v4$Path"
    if ($Body) {
        return Invoke-RestMethod -Uri $uri -Headers $headers -Method $Method -Body ($Body | ConvertTo-Json)
    }
    return Invoke-RestMethod -Uri $uri -Headers $headers -Method $Method
}

$list = Invoke-Cf GET "/zones/$ZONE_ID/dns_records?per_page=100"
$existing = @($list.result)

foreach ($r in $records) {
    $hit = $existing | Where-Object { $_.type -eq $r.type -and $_.name -eq $r.name } | Select-Object -First 1
    $body = @{ type = $r.type; name = $r.name; content = $r.content; proxied = $r.proxied; ttl = 1 }
    if ($hit) {
        $res = Invoke-Cf PUT "/zones/$ZONE_ID/dns_records/$($hit.id)" $body
        Write-Host "UPDATE $($r.name) OK=$($res.success)" -ForegroundColor Green
    } else {
        $res = Invoke-Cf POST "/zones/$ZONE_ID/dns_records" $body
        Write-Host "CREATE $($r.name) OK=$($res.success)" -ForegroundColor Green
    }
    if (-not $res.success) { Write-Error ($res.errors | ConvertTo-Json) }
}

$ssl  = Invoke-Cf PATCH "/zones/$ZONE_ID/settings/ssl" @{ value = 'full' }
$http = Invoke-Cf PATCH "/zones/$ZONE_ID/settings/always_use_https" @{ value = 'on' }
Write-Host "SSL=$($ssl.result.value) HTTPS=$($http.result.value)" -ForegroundColor Green

$final = Invoke-Cf GET "/zones/$ZONE_ID/dns_records?per_page=100"
$final.result | Select-Object type, name, content, proxied | Format-Table -AutoSize
Write-Host "DNS aplicado. Teste: https://$DOMAIN" -ForegroundColor Cyan