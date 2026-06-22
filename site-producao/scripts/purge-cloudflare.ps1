# purge-cloudflare.ps1 — Purge Everything no Cloudflare
# Uso:
#   .\scripts\purge-cloudflare.ps1           # purge
#   .\scripts\purge-cloudflare.ps1 -Diagnose # só diagnóstico (sem purge)
#
# .env (site-producao/.env):
#   CLOUDFLARE_API_TOKEN=...   # obrigatório
#   CLOUDFLARE_ZONE_ID=...     # opcional (auto-descobre por CLOUDFLARE_ZONE_NAME)
#   CLOUDFLARE_ZONE_NAME=szuchmacher.com.br

param(
    [string]$ZoneId,
    [string]$ZoneName,
    [switch]$Diagnose
)

$ErrorActionPreference = 'Stop'
$ROOT = Split-Path -Parent $PSScriptRoot
$ENV_FILE = Join-Path $ROOT '.env'

function Read-EnvValue([string]$Key) {
    if (-not (Test-Path $ENV_FILE)) { return $null }
    $line = Get-Content $ENV_FILE | Where-Object { $_ -match "^$Key=" } | Select-Object -First 1
    if ($line) { return (($line -split '=', 2)[1]).Trim().Trim('"') }
    return $null
}

# CLOUDFLARE_PURGE_TOKEN (só purge) tem prioridade sobre CLOUDFLARE_API_TOKEN
$token = Read-EnvValue 'CLOUDFLARE_PURGE_TOKEN'
if (-not $token) { $token = Read-EnvValue 'CLOUDFLARE_API_TOKEN' }
if (-not $token) { $token = [Environment]::GetEnvironmentVariable('CLOUDFLARE_PURGE_TOKEN') }
if (-not $token) { $token = [Environment]::GetEnvironmentVariable('CLOUDFLARE_API_TOKEN') }
if (-not $ZoneId) { $ZoneId = Read-EnvValue 'CLOUDFLARE_ZONE_ID' }
if (-not $ZoneName) { $ZoneName = Read-EnvValue 'CLOUDFLARE_ZONE_NAME' }
if (-not $ZoneName) { $ZoneName = 'szuchmacher.com.br' }

if (-not $token) {
    Write-Error 'CLOUDFLARE_API_TOKEN ausente. Defina no ambiente ou em site-producao/.env'
}

$headers = @{ Authorization = "Bearer $token" }

function Invoke-CF([string]$Method, [string]$Path, [object]$Body = $null) {
    $params = @{
        Method  = $Method
        Uri     = "https://api.cloudflare.com/client/v4$Path"
        Headers = $headers
    }
    if ($Body) {
        $params['ContentType'] = 'application/json'
        $params['Body'] = ($Body | ConvertTo-Json -Compress)
    }
    return Invoke-RestMethod @params
}

function Show-Diagnosis([object]$Zone, [object]$PurgeError) {
    Write-Host "`n=== DIAGNÓSTICO CLOUDFLARE ===" -ForegroundColor Cyan
    Write-Host "Zona: $($Zone.name) ($($Zone.id))"
    Write-Host "Status API: $($Zone.status)" -ForegroundColor $(if ($Zone.status -eq 'active') { 'Green' } else { 'Yellow' })
    Write-Host "NS esperados (painel CF): $($Zone.name_servers -join ', ')"
    if ($Zone.original_name_servers) {
        Write-Host "NS anteriores: $($Zone.original_name_servers -join ', ')"
    }

    try {
        $liveNs = (Resolve-DnsName $Zone.name -Type NS -ErrorAction Stop).NameHost
        Write-Host "NS no DNS público: $($liveNs -join ', ')"
        $expected = @($Zone.name_servers)
        $mismatch = @($liveNs | Where-Object { $expected -notcontains $_ })
        if ($mismatch.Count -gt 0 -and $Zone.status -ne 'active') {
            Write-Host "`nCAUSA PROVÁVEL: zona em 'pending' — NS do registrador não batem com os atribuídos no Cloudflare." -ForegroundColor Yellow
            Write-Host "Ação: no registrador do domínio, aponte para os NS listados em 'NS esperados' e aguarde propagação." -ForegroundColor Yellow
        }
    } catch {
        Write-Host "NS no DNS público: não foi possível resolver ($($_.Exception.Message))"
    }

    if ($PurgeError) {
        $msg = $PurgeError
        if ($PurgeError -match '10000|Authentication error') {
            Write-Host "`nCAUSA PROVÁVEL: token sem permissão Cache Purge." -ForegroundColor Yellow
            Write-Host "Ação: Cloudflare → My Profile → API Tokens → Create Token" -ForegroundColor Yellow
            Write-Host "  Permissão: Zone → Cache Purge → Purge" -ForegroundColor Yellow
            Write-Host "  Recurso:   Zone → Include → $($Zone.name)" -ForegroundColor Yellow
            Write-Host "  Atualize CLOUDFLARE_PURGE_TOKEN (ou CLOUDFLARE_API_TOKEN) em site-producao/.env" -ForegroundColor Yellow
            Write-Host "  Ou rode: .\scripts\setup-cf-purge-token.ps1 (se a credencial tiver permissao)" -ForegroundColor Yellow
            Write-Host "  Painel: https://dash.cloudflare.com/profile/api-tokens" -ForegroundColor Cyan
        } elseif ($msg -match 'access to purge|invalid') {
            Write-Host "`nCAUSA PROVÁVEL: zona pending ou token sem escopo nesta zona." -ForegroundColor Yellow
        } else {
            Write-Host "`nErro purge: $msg" -ForegroundColor Red
        }
    }

    Write-Host "`nWorkaround: .\scripts\invalidate-worker-cache.ps1 -RefreshMacro" -ForegroundColor DarkGray
    Write-Host "  (limpa KV macro-api/macro-panel/market-data sem permissao Cache Purge)" -ForegroundColor DarkGray
}

# ─── Verificar token ───────────────────────────────────────────────────────
$verify = Invoke-CF GET '/user/tokens/verify'
if (-not $verify.success) {
    Write-Error 'Token Cloudflare inválido ou revogado.'
}
Write-Host "Token OK (status: $($verify.result.status))" -ForegroundColor Green

# ─── Resolver zone id ────────────────────────────────────────────────────────
if (-not $ZoneId) {
    $q = [uri]::EscapeDataString($ZoneName)
    $zones = Invoke-CF GET "/zones?name=$q"
    if (-not $zones.result -or $zones.result.Count -eq 0) {
        Write-Error "Zona '$ZoneName' não encontrada na conta deste token."
    }
    $ZoneId = $zones.result[0].id
    Write-Host "Zone ID auto: $ZoneId ($ZoneName)" -ForegroundColor DarkCyan
}

$zoneDetail = Invoke-CF GET "/zones/$ZoneId"
$zone = $zoneDetail.result

if ($Diagnose) {
    Show-Diagnosis $zone $null
    exit 0
}

# ─── Purge ───────────────────────────────────────────────────────────────────
try {
    $r = Invoke-CF POST "/zones/$ZoneId/purge_cache" @{ purge_everything = $true }
    if ($r.success) {
        Write-Host "Cloudflare purge OK (zone $ZoneId / $($zone.name))" -ForegroundColor Green
        exit 0
    }
    $err = ($r.errors | ForEach-Object { $_.message }) -join '; '
    Show-Diagnosis $zone $err
    exit 1
} catch {
    $err = $_.ErrorDetails.Message
    if (-not $err) { $err = $_.Exception.Message }
    Show-Diagnosis $zone $err
    exit 1
}