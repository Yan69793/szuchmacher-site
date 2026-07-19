# cleanup-dns-cloudflare.ps1 — remove legado HostGator; prepara custom domains Worker
# Requer CLOUDFLARE_DNS_TOKEN no .env (Zone > DNS > Edit)
# Uso: .\scripts\cleanup-dns-cloudflare.ps1 [-DryRun] [-KeepApex]

param([switch]$DryRun, [switch]$KeepApex)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ROOT = Split-Path -Parent $PSScriptRoot
$ENV_FILE = Join-Path $ROOT '.env'

function Get-DnsToken {
    if (-not (Test-Path $ENV_FILE)) { return $null }
    $line = Get-Content $ENV_FILE | Where-Object { $_ -match '^CLOUDFLARE_DNS_TOKEN=' } | Select-Object -First 1
    if ($line) { return ($line -split '=', 2)[1].Trim() }
    $line2 = Get-Content $ENV_FILE | Where-Object { $_ -match '^CLOUDFLARE_API_TOKEN=' } | Select-Object -First 1
    if ($line2) { return ($line2 -split '=', 2)[1].Trim() }
    return $null
}

$token = Get-DnsToken
if (-not $token) {
    Write-Host "CLOUDFLARE_DNS_TOKEN ausente." -ForegroundColor Red
    Write-Host "Rode: .\scripts\setup-cloudflare-dns-token.ps1" -ForegroundColor Yellow
    exit 1
}

$headers = @{ Authorization = "Bearer $token"; 'Content-Type' = 'application/json' }

function Invoke-Cf {
    param([string]$Method, [string]$Uri, [object]$Body = $null)
    $p = @{ Method = $Method; Uri = $Uri; Headers = $headers }
    if ($Body) { $p.Body = ($Body | ConvertTo-Json -Depth 6) }
    try { return Invoke-RestMethod @p }
    catch {
        $msg = $_.ErrorDetails.Message
        if (-not $msg) { $msg = $_.Exception.Message }
        return @{ success = $false; error = $msg }
    }
}

$szZone    = 'cfe602627bd2ef210d225ee9deeb45d9'
$multiZone = '8ca066c2dda0d90e475b5c9eb255cbfd'

# IDs legados HostGator/cPanel (szuchmacher)
$szDeleteIds = @(
    '0959869306d49f7bf99389bcab501ede','a633a04bb1e9edc276aa97b76acfb769',
    '73238a68988098132c200a1c4a538127','be596787796f3df3b21aab100c604a52',
    'da1cdc619641dd03b692727ccaf4d226','ec60af0adbbedff68674f2f284f46391',
    '4a106628476f3046f7db008a35e9fc05','39e6dde1095506496dfb42cea9c9ebf3',
    '0a4e32f496544865143191f59b8450dd','45afe3043630efe67a497b1402ed55b9',
    '6f5d3049fe66a5d73f71570346ee8d4e','62d0dba068cd1a4dc95298f450e4f0e2',
    '930e911aa00c52474a5cfa83844da2e8','2e25c8c7da339a2d7ad7e2bd97f385bf',
    '930d6fe59e6ee7001a7df46d0c6d1739','c4338ea247ea45c463c8b4a8ec219309',
    '527ad19e1ea1c8c4fc2daaa03578dc35','f2339932fedd5c40dd61ff0d1100da6d',
    '109d95f4cf21d62bcbff646a146b577c','a1ff773ab204b118b8ff96346eee74cf'
)

# Para custom domains Worker: remover A/CNAME de apex e www (Worker recria DNS)
$apexWwwDelete = @(
    @{ zone = $szZone;    id = 'd97ec4625ff9198af2cd0561ac73321c'; name = 'szuchmacher.com.br A' }
    @{ zone = $szZone;    id = '2e7dc99f23efca4cd55096bcc24ffc04'; name = 'www.szuchmacher CNAME' }
    @{ zone = $multiZone; id = 'c52822b3627108eb46ded1021afb89ec'; name = 'multi-assets.com A' }
    @{ zone = $multiZone; id = 'f17704e1bf35a9e4293874140fe57a1d'; name = 'www.multi-assets A' }
)

Write-Host "`n=== LIMPEZA DNS CLOUDFLARE ===" -ForegroundColor Cyan
if ($DryRun) { Write-Host "MODO DRY-RUN`n" -ForegroundColor Yellow }
if ($KeepApex) { Write-Host "KeepApex: mantem A records (nao prepara custom domains)`n" -ForegroundColor Yellow }

# verificar token + permissao DNS (purge-only falha aqui)
$verify = Invoke-Cf GET 'https://api.cloudflare.com/client/v4/user/tokens/verify'
if (-not $verify.success) {
    Write-Host "Token invalido. Rode setup-cloudflare-dns-token.ps1" -ForegroundColor Red
    exit 1
}
$dnsProbe = Invoke-Cf GET "https://api.cloudflare.com/client/v4/zones/$szZone/dns_records?per_page=1"
if (-not $dnsProbe.success) {
    Write-Host "Token sem Zone > DNS > Edit (so purge nao basta)." -ForegroundColor Red
    Write-Host "Rode: .\scripts\setup-cloudflare-dns-token.ps1" -ForegroundColor Yellow
    exit 1
}

$ok = 0; $fail = 0

foreach ($id in $szDeleteIds) {
    $uri = "https://api.cloudflare.com/client/v4/zones/$szZone/dns_records/$id"
    if ($DryRun) { Write-Host "  DRY DELETE sz $id" -ForegroundColor DarkGray; continue }
    $r = Invoke-Cf DELETE $uri
    if ($r.success) { $ok++ } else { Write-Host "  FAIL DELETE $id" -ForegroundColor Red; $fail++ }
}

if (-not $KeepApex) {
    foreach ($item in $apexWwwDelete) {
        $uri = "https://api.cloudflare.com/client/v4/zones/$($item.zone)/dns_records/$($item.id)"
        if ($DryRun) { Write-Host "  DRY DELETE $($item.name)" -ForegroundColor DarkGray; continue }
        $r = Invoke-Cf DELETE $uri
        if ($r.success) { Write-Host "  DELETE $($item.name) OK" -ForegroundColor Green; $ok++ }
        else { Write-Host "  FAIL $($item.name): $($r.error)" -ForegroundColor Red; $fail++ }
    }
} else {
    # modo legado: apenas troca apex para placeholder se ainda HostGator
    $patchSz = Invoke-Cf PATCH "https://api.cloudflare.com/client/v4/zones/$szZone/dns_records/d97ec4625ff9198af2cd0561ac73321c" @{
        type = 'A'; name = 'szuchmacher.com.br'; content = '192.0.2.1'; proxied = $true; ttl = 1
    }
    if ($patchSz.success) { Write-Host '  PATCH sz apex -> 192.0.2.1 OK' -ForegroundColor Green; $ok++ }
    else { $fail++ }

    $patchMulti = Invoke-Cf PATCH "https://api.cloudflare.com/client/v4/zones/$multiZone/dns_records/c52822b3627108eb46ded1021afb89ec" @{
        type = 'A'; name = 'multi-assets.com'; content = '192.0.2.1'; proxied = $true; ttl = 1
    }
    if ($patchMulti.success) { Write-Host '  PATCH multi apex -> 192.0.2.1 OK' -ForegroundColor Green; $ok++ }
    else { $fail++ }

    $delWww = Invoke-Cf DELETE "https://api.cloudflare.com/client/v4/zones/$multiZone/dns_records/f17704e1bf35a9e4293874140fe57a1d"
    if ($delWww.success) { $ok++ }
    $createWww = Invoke-Cf POST "https://api.cloudflare.com/client/v4/zones/$multiZone/dns_records" @{
        type = 'CNAME'; name = 'www'; content = 'multi-assets.com'; proxied = $true; ttl = 1
    }
    if ($createWww.success) { Write-Host '  CREATE multi www CNAME OK' -ForegroundColor Green; $ok++ }
    else { $fail++ }
}

Write-Host "`nOK=$ok FAIL=$fail" -ForegroundColor Cyan
if ($fail -gt 0) { exit 1 }

if (-not $KeepApex) {
    Write-Host "Proximo passo: .\scripts\attach-worker-domains.ps1" -ForegroundColor Green
} else {
    Write-Host "DNS atualizado (modo KeepApex). Sites via Worker routes." -ForegroundColor Green
}