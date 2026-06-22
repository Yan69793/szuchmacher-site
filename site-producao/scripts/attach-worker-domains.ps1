# attach-worker-domains.ps1 — custom domains gerenciados pelo Worker (apos limpeza DNS)
# Uso: .\scripts\attach-worker-domains.ps1 [-DryRun]

param([switch]$DryRun)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ACCOUNT = '7ac79fb1030e4e81115ef33c21a9b070'
$SERVICE = 'sz-sites'

$hosts = @(
    @{ hostname = 'szuchmacher.com.br';     zone_id = 'cfe602627bd2ef210d225ee9deeb45d9' }
    @{ hostname = 'www.szuchmacher.com.br'; zone_id = 'cfe602627bd2ef210d225ee9deeb45d9' }
    @{ hostname = 'multi-assets.com';       zone_id = '8ca066c2dda0d90e475b5c9eb255cbfd' }
    @{ hostname = 'www.multi-assets.com';   zone_id = '8ca066c2dda0d90e475b5c9eb255cbfd' }
)

Remove-Item Env:CLOUDFLARE_API_TOKEN -ErrorAction SilentlyContinue
$token = (npx wrangler auth token 2>&1 | Select-Object -Last 1).Trim()
if (-not $token -or $token.Length -lt 20) { Write-Error 'wrangler auth token indisponivel. Rode: npx wrangler login' }

$headers = @{ Authorization = "Bearer $token"; 'Content-Type' = 'application/json' }

Write-Host "`n=== WORKER CUSTOM DOMAINS ($SERVICE) ===" -ForegroundColor Cyan

$ok = 0; $fail = 0
foreach ($h in $hosts) {
    $body = @{
        hostname    = $h.hostname
        zone_id     = $h.zone_id
        service     = $SERVICE
        environment = 'production'
    } | ConvertTo-Json

    if ($DryRun) {
        Write-Host "  DRY  $($h.hostname)" -ForegroundColor DarkGray
        continue
    }

    try {
        $r = Invoke-RestMethod -Method PUT `
            -Uri "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/workers/domains" `
            -Headers $headers -Body $body
        if ($r.success) {
            Write-Host "  OK   $($h.hostname)" -ForegroundColor Green
            $ok++
        } else {
            Write-Host "  FAIL $($h.hostname): $($r.errors[0].message)" -ForegroundColor Red
            $fail++
        }
    } catch {
        $msg = $_.ErrorDetails.Message
        if (-not $msg) { $msg = $_.Exception.Message }
        Write-Host "  FAIL $($h.hostname): $msg" -ForegroundColor Red
        $fail++
    }
}

Write-Host "`nOK=$ok FAIL=$fail" -ForegroundColor Cyan
if ($fail -gt 0) {
    Write-Host "Se erro 100117: rode cleanup-dns-cloudflare.ps1 antes (remover A/CNAME externos)." -ForegroundColor Yellow
    exit 1
}
Write-Host "Custom domains ativos. DNS gerenciado pelo Worker." -ForegroundColor Green