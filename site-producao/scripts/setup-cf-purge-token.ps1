# setup-cf-purge-token.ps1 — cria token CF com Cache Purge e atualiza .env
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ROOT = Split-Path -Parent $PSScriptRoot
$ENV_FILE = Join-Path $ROOT '.env'
$WRANGLER_CFG = Join-Path $env:USERPROFILE '.wrangler\config\default.toml'

function Read-EnvValue([string]$Key) {
    $line = Get-Content $ENV_FILE | Where-Object { $_ -match "^$Key=" } | Select-Object -First 1
    if ($line) { return (($line -split '=', 2)[1]).Trim().Trim('"') }
    return $null
}

function Get-OAuthToken {
    if (-not (Test-Path $WRANGLER_CFG)) { return $null }
    $raw = Get-Content $WRANGLER_CFG -Raw
    if ($raw -match 'oauth_token\s*=\s*"([^"]+)"') { return $Matches[1] }
    return $null
}

$zoneSz = Read-EnvValue 'CLOUDFLARE_ZONE_ID'
if (-not $zoneSz) { $zoneSz = 'cfe602627bd2ef210d225ee9deeb45d9' }
$zoneMulti = '8ca066c2dda0d90e475b5c9eb255cbfd'

$bodyObj = @{
    name     = "szuchmacher-purge-$(Get-Date -Format 'yyyyMMdd-HHmm')"
    policies = @(
        @{
            effect            = 'allow'
            permission_groups = @(
                @{ id = 'ed4200720c4690ba6aa7d64e410e58' }
                @{ id = 'c8fed203ed3043cba015a93ad1616f1f' }
            )
            resources         = @{
                "com.cloudflare.api.account.zone.$zoneSz"    = '*'
                "com.cloudflare.api.account.zone.$zoneMulti" = '*'
            }
        }
    )
}

$candidates = @()
$api = Read-EnvValue 'CLOUDFLARE_API_TOKEN'
if ($api) { $candidates += @{ label = 'CLOUDFLARE_API_TOKEN'; token = $api } }
$oauth = Get-OAuthToken
if ($oauth) { $candidates += @{ label = 'wrangler OAuth'; token = $oauth } }

if ($candidates.Count -eq 0) {
    Write-Error 'Nenhum token disponível (CLOUDFLARE_API_TOKEN ou wrangler OAuth)'
}

$newToken = $null
foreach ($c in $candidates) {
    Write-Host "Tentando criar token via $($c.label)..." -ForegroundColor Cyan
    $headers = @{ Authorization = "Bearer $($c.token)"; 'Content-Type' = 'application/json' }
    try {
        $r = Invoke-RestMethod -Method POST -Uri 'https://api.cloudflare.com/client/v4/user/tokens' -Headers $headers -Body ($bodyObj | ConvertTo-Json -Depth 6)
        if ($r.success -and $r.result.value) {
            $newToken = $r.result.value
            Write-Host "Token criado via $($c.label)" -ForegroundColor Green
            break
        }
    } catch {
        Write-Host "  $($c.label): sem permissão para criar tokens" -ForegroundColor Yellow
    }
}

if (-not $newToken) {
    Write-Host ''
    Write-Host 'Nenhuma credencial local pode criar sub-tokens com Cache Purge.' -ForegroundColor Yellow
    Write-Host 'Crie manualmente:' -ForegroundColor Yellow
    Write-Host '  https://dash.cloudflare.com/profile/api-tokens' -ForegroundColor Cyan
    Write-Host '  Custom token > Zone > Cache Purge > Purge' -ForegroundColor Yellow
    Write-Host '  Recursos: szuchmacher.com.br + multi-assets.com' -ForegroundColor Yellow
    Write-Host '  Cole o valor em site-producao/.env como CLOUDFLARE_API_TOKEN=' -ForegroundColor Yellow
    Write-Host ''
    Write-Host 'Workaround imediato: deploy Cloudflare Worker ja invalida assets; use:' -ForegroundColor DarkGray
    Write-Host '  .\scripts\invalidate-worker-cache.ps1' -ForegroundColor DarkGray
    exit 1
}

Write-Host 'Testando purge szuchmacher.com.br...' -ForegroundColor DarkCyan
$h2 = @{ Authorization = "Bearer $newToken" }
$p = Invoke-RestMethod -Method POST -Uri "https://api.cloudflare.com/client/v4/zones/$zoneSz/purge_cache" -Headers $h2 -ContentType 'application/json' -Body '{"purge_everything":true}'
if (-not $p.success) { Write-Error 'Token criado mas purge falhou — não gravando .env' }

$p2 = Invoke-RestMethod -Method POST -Uri "https://api.cloudflare.com/client/v4/zones/$zoneMulti/purge_cache" -Headers $h2 -ContentType 'application/json' -Body '{"purge_everything":true}'
Write-Host "Purge sz: $($p.success) | multi-assets: $($p2.success)" -ForegroundColor Green

$lines = Get-Content $ENV_FILE
$out = foreach ($line in $lines) {
    if ($line -match '^CLOUDFLARE_API_TOKEN=') { "CLOUDFLARE_API_TOKEN=$newToken" }
    else { $line }
}
Set-Content -Path $ENV_FILE -Value $out -Encoding UTF8
Write-Host 'CLOUDFLARE_API_TOKEN atualizado com token Cache Purge.' -ForegroundColor Green