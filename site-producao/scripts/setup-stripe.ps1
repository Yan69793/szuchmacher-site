# setup-stripe.ps1 — Cria produtos + Payment Links anuais (BRL) via Stripe API
# Uso:
#   1) Cole STRIPE_SECRET_KEY=sk_test_... em site-producao/.env
#   2) .\scripts\setup-stripe.ps1
#   3) .\scripts\sync-sz-config.ps1 && .\scripts\deploy-all.ps1
#
# Dashboard teste: https://dashboard.stripe.com/acct_1TdjpdPaKVD5n3Ui/test/apikeys

param(
    [switch]$DryRun,
    [switch]$Live   # permite sk_live (padrão: só sk_test)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ROOT = Split-Path -Parent $PSScriptRoot
$ENV_FILE = Join-Path $ROOT '.env'

$key = [Environment]::GetEnvironmentVariable('STRIPE_SECRET_KEY')
if (-not $key -and (Test-Path $ENV_FILE)) {
    Get-Content $ENV_FILE | Where-Object { $_ -match '^STRIPE_SECRET_KEY=' } | ForEach-Object {
        $key = ($_ -split '=', 2)[1]
    }
}

if (-not $key) {
    Write-Error @"
STRIPE_SECRET_KEY ausente.

No dashboard (modo teste):
  https://dashboard.stripe.com/acct_1TdjpdPaKVD5n3Ui/test/apikeys

Copie a "Secret key" (sk_test_...) e adicione em site-producao/.env:
  STRIPE_SECRET_KEY=sk_test_...

Depois rode este script novamente.
"@
}

if ($key -match '^sk_live|^rk_live' -and -not $Live) {
    Write-Error 'Chave live detectada. Use -Live se for intencional, ou sk_test_/rk_test_ para teste.'
}

function Get-StripeMeta {
    param([object]$Metadata, [string]$Name)
    if (-not $Metadata) { return $null }
    foreach ($p in $Metadata.PSObject.Properties) {
        if ($p.Name -eq $Name) { return [string]$p.Value }
    }
    return $null
}

function Invoke-StripeApi {
    param(
        [string]$Method,
        [string]$Path,
        [hashtable]$Form = @{}
    )
    $uri = "https://api.stripe.com/v1$Path"
    $headers = @{ Authorization = "Bearer $key" }
    $body = ($Form.GetEnumerator() | ForEach-Object { "$($_.Key)=$([uri]::EscapeDataString([string]$_.Value))" }) -join '&'
    if ($DryRun) {
        Write-Host "  DRY $Method $Path" -ForegroundColor DarkGray
        if ($body) { Write-Host "       $body" -ForegroundColor DarkGray }
        return $null
    }
    return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers -Body $body -ContentType 'application/x-www-form-urlencoded'
}

function Get-OrCreateProduct {
    param([string]$Name, [string]$Description, [string]$LookupKey)
    $list = Invoke-StripeApi GET '/products' @{ limit = '100'; active = 'true' }
    if ($list -and $list.data) {
        $hit = $list.data | Where-Object { (Get-StripeMeta $_.metadata 'lookup_key') -eq $LookupKey } | Select-Object -First 1
        if ($hit) {
            Write-Host "  REUSE product $($hit.id) ($Name)" -ForegroundColor Yellow
            return $hit
        }
    }
    $p = Invoke-StripeApi POST '/products' @{
        name        = $Name
        description = $Description
        'metadata[lookup_key]' = $LookupKey
    }
    Write-Host "  NEW  product $($p.id) ($Name)" -ForegroundColor Green
    return $p
}

function Get-OrCreateAnnualPrice {
    param([string]$ProductId, [int]$AmountCents, [string]$LookupKey)
    $list = Invoke-StripeApi GET '/prices' @{ limit = '100'; product = $ProductId; active = 'true' }
    if ($list -and $list.data) {
        $hit = $list.data | Where-Object { (Get-StripeMeta $_.metadata 'lookup_key') -eq $LookupKey } | Select-Object -First 1
        if ($hit) {
            Write-Host "  REUSE price $($hit.id) ($LookupKey)" -ForegroundColor Yellow
            return $hit
        }
    }
    $pr = Invoke-StripeApi POST '/prices' @{
        product                    = $ProductId
        currency                   = 'brl'
        unit_amount                = [string]$AmountCents
        'recurring[interval]'      = 'year'
        'recurring[interval_count]' = '1'
        'metadata[lookup_key]'     = $LookupKey
    }
    Write-Host "  NEW  price $($pr.id) ($LookupKey)" -ForegroundColor Green
    return $pr
}

function Get-OrCreatePaymentLink {
    param([string]$PriceId, [string]$LookupKey)
    $list = Invoke-StripeApi GET '/payment_links' @{ limit = '100'; active = 'true' }
    if ($list -and $list.data) {
        foreach ($pl in $list.data) {
            if ((Get-StripeMeta $pl.metadata 'lookup_key') -eq $LookupKey) {
                Write-Host "  REUSE link $($pl.url)" -ForegroundColor Yellow
                return $pl
            }
        }
    }
    $link = Invoke-StripeApi POST '/payment_links' @{
        'line_items[0][price]'    = $PriceId
        'line_items[0][quantity]' = '1'
        'metadata[lookup_key]'   = $LookupKey
        'after_completion[type]'   = 'redirect'
        'after_completion[redirect][url]' = 'https://szuchmacher.com.br/assinatura.html?checkout=ok'
    }
    Write-Host "  NEW  link $($link.url)" -ForegroundColor Green
    return $link
}

Write-Host "`n=== STRIPE SETUP (Szuchmacher) ===" -ForegroundColor Cyan
$mode = if ($key -match '^sk_test|^rk_test') { 'TEST' } else { 'LIVE' }
Write-Host "Modo: $mode" -ForegroundColor $(if ($mode -eq 'TEST') { 'Yellow' } else { 'Red' })

$plans = @(
    @{
        Name        = 'Carta Szuchmacher'
        Description = 'Research autoral anual: Radar ROIC, carta macro mensal e fechamentos.'
        Lookup      = 'sz_carta_anual'
        Amount      = 197000
    },
    @{
        Name        = 'MultiAsset Pro'
        Description = 'Carta Szuchmacher + plataforma MultiAsset integral (simulador, alertas, histórico).'
        Lookup      = 'sz_pro_anual'
        Amount      = 397000
    }
)

$urls = @{}
foreach ($plan in $plans) {
    Write-Host "`n--- $($plan.Name) ---" -ForegroundColor Cyan
    $product = Get-OrCreateProduct -Name $plan.Name -Description $plan.Description -LookupKey $plan.Lookup
    if ($DryRun) { continue }
    $price = Get-OrCreateAnnualPrice -ProductId $product.id -AmountCents $plan.Amount -LookupKey ($plan.Lookup + '_price')
    $plink = Get-OrCreatePaymentLink -PriceId $price.id -LookupKey ($plan.Lookup + '_link')
    $urls[$plan.Lookup] = $plink.url
}

if ($DryRun) {
    Write-Host "`nDry-run concluído. Nenhuma chamada à API." -ForegroundColor Yellow
    exit 0
}

$cartaUrl = $urls['sz_carta_anual']
$proUrl   = $urls['sz_pro_anual']

Write-Host "`n=== URLs ===" -ForegroundColor Cyan
Write-Host "Carta: $cartaUrl"
Write-Host "Pro:   $proUrl"

# Atualiza .env
$envLines = if (Test-Path $ENV_FILE) { Get-Content $ENV_FILE } else { @() }
$updates = @{
    'SZ_STRIPE_CARTA_URL' = $cartaUrl
    'SZ_STRIPE_PRO_URL'   = $proUrl
}
$keysDone = @{}
$newLines = foreach ($line in $envLines) {
    $matched = $false
    foreach ($k in $updates.Keys) {
        if ($line -match "^$k=") {
            $keysDone[$k] = $true
            "$k=$($updates[$k])"
            $matched = $true
            break
        }
    }
    if (-not $matched) { $line }
}
foreach ($k in $updates.Keys) {
    if (-not $keysDone[$k]) { $newLines += "$k=$($updates[$k])" }
}
Set-Content -Path $ENV_FILE -Value $newLines -Encoding UTF8

Write-Host "`n.env atualizado. Próximo:" -ForegroundColor Green
Write-Host "  .\scripts\sync-sz-config.ps1"
Write-Host "  .\scripts\deploy-all.ps1"