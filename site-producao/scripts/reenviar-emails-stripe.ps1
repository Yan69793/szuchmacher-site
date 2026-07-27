# reenviar-emails-stripe.ps1 — lista compradores desde 19/07 que nao receberam
# o email de boas-vindas (bug hex vs base64 no webhook) e reenvia.
#
# Pre-requisitos:
#   1. Stripe CLI: https://github.com/stripe/stripe-cli
#   2. Chave secreta do Stripe (sk_live_...) no env STRIPE_SECRET_KEY
#   3. Chave de API do Resend no env RESEND_API_KEY
#   4. O worker com a correcao de assinatura ja deve estar no ar
#
# Uso:
#   $env:STRIPE_SECRET_KEY = "sk_live_..."
#   $env:RESEND_API_KEY = "re_..."
#   .\scripts\reenviar-emails-stripe.ps1
#   .\scripts\reenviar-emails-stripe.ps1 -DryRun   # lista sem enviar

param([switch]$DryRun)

$ErrorActionPreference = 'Stop'

$STRIPE_KEY = $env:STRIPE_SECRET_KEY
$RESEND_KEY = $env:RESEND_API_KEY
$FROM_EMAIL = $env:FROM_EMAIL
if (-not $FROM_EMAIL) { $FROM_EMAIL = 'yan@szuchmacher.com.br' }

if (-not $STRIPE_KEY) { throw 'STRIPE_SECRET_KEY nao definido. Exporte a chave secreta do Stripe.' }
if (-not $RESEND_KEY) { throw 'RESEND_API_KEY nao definido. Exporte a chave de API do Resend.' }

$CORTE = [DateTimeOffset]::new(2026, 7, 19, 0, 0, 0, [TimeSpan]::Zero)
$AGORA  = [DateTimeOffset]::UtcNow

Write-Host "Buscando checkout.session.completed desde $($CORTE.ToString('yyyy-MM-dd'))..." -ForegroundColor Cyan

# Stripe CLI: lista sessions. A API REST e mais confiavel que a CLI para producao.
$sessions = @()
$hasMore = $true
$startingAfter = $null

while ($hasMore) {
    $url = "https://api.stripe.com/v1/checkout/sessions?limit=100&created[gte]=$([Math]::Floor($CORTE.ToUnixTimeSeconds()))"
    if ($startingAfter) { $url += "&starting_after=$startingAfter" }

    $resp = Invoke-RestMethod -Uri $url -Headers @{
        Authorization = "Bearer $STRIPE_KEY"
    } -ContentType 'application/x-www-form-urlencoded'

    foreach ($s in $resp.data) {
        if ($s.payment_status -eq 'paid' -and $s.customer_details.email) {
            $sessions += $s
        }
    }
    $hasMore = $resp.has_more
    if ($resp.data.Count -gt 0) { $startingAfter = $resp.data[-1].id }
}

Write-Host "$($sessions.Count) sessoes pagas com email encontradas." -ForegroundColor Green

if ($sessions.Count -eq 0) {
    Write-Host "Nenhum email para reenviar."
    exit 0
}

# Mostra a lista
Write-Host "`nCompradores:" -ForegroundColor Yellow
foreach ($s in $sessions) {
    $email = $s.customer_details.email
    $nome  = if ($s.customer_details.name) { $s.customer_details.name } else { '(sem nome)' }
    $data  = [DateTimeOffset]::FromUnixTimeSeconds($s.created).DateTime.ToString('yyyy-MM-dd HH:mm')
    Write-Host "  $nome <$email> — $data"
}

if ($DryRun) {
    Write-Host "`nDryRun: $($sessions.Count) emails SERIAM enviados. Remova -DryRun para enviar." -ForegroundColor Yellow
    exit 0
}

# Confirma
Write-Host "`nPressione ENTER para enviar $($sessions.Count) emails ou Ctrl+C para cancelar." -ForegroundColor Red
Read-Host

# Busca o link do ultimo relatorio no cache
$reportUrl = $null
try {
    $cache = Invoke-RestMethod -Uri 'https://szuchmacher.com.br/sz/relatorio_cache.json' -TimeoutSec 10
    if ($cache.latest_url) { $reportUrl = $cache.latest_url }
    elseif ($cache.latest_slug) { $reportUrl = "https://szuchmacher.com.br/fechamento/$($cache.latest_slug)" }
} catch {
    Write-Host "Cache do relatorio indisponivel. Emails usarao link padrao." -ForegroundColor DarkYellow
}
if (-not $reportUrl) { $reportUrl = 'https://szuchmacher.com.br/relatorios.html' }
Write-Host "Link do relatorio: $reportUrl`n"

# Envia um email por vez (Resend free tier: 100/dia)
$enviados = 0
$falhas = @()
foreach ($s in $sessions) {
    $email = $s.customer_details.email
    try {
        $body = @{
            from    = "Szuchmacher Consultoria <$FROM_EMAIL>"
            to      = @($email)
            subject = 'Bem-vindo — Szuchmacher Consultoria'
            html    = @"
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#eef0f4;font-family:Georgia,serif;">
<table width="100%" bgcolor="#eef0f4"><tr><td align="center" style="padding:32px 16px">
<table width="600" bgcolor="#ffffff" style="max-width:600px">
<tr><td bgcolor="#0a1428" style="padding:28px 32px;color:#fff;font-family:Georgia,serif;font-size:22px">Szuchmacher Consultoria</td></tr>
<tr><td style="padding:24px 32px;font-size:14px;color:#1a2030;line-height:24px">
<p>Prezado(a),</p>
<p>Devido a um problema tecnico, o email de boas-vindas nao foi entregue quando sua assinatura foi confirmada. Pedimos desculpas pelo atraso.</p>
<p>Seu acesso ao Fechamento de Mercado esta ativo. Acesse a ultima edicao:</p>
<p style="text-align:center;padding:12px 0"><a href="$reportUrl" style="background:#92703a;color:#fff;padding:12px 24px;text-decoration:none;font-family:monospace;font-size:11px">ABRIR RELATORIO</a></p>
<p>Atenciosamente,<br><strong>Yan Szuchmacher</strong><br>Szuchmacher Consultoria</p>
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #d8dce3;font-size:10px;color:#5a6272">
Material informativo, nao constitui recomendacao de investimento.
</td></tr>
</table>
</td></tr></table>
</body>
</html>
"@
        } | ConvertTo-Json -Compress

        $resp = Invoke-RestMethod -Uri 'https://api.resend.com/emails' -Method Post `
            -Headers @{ Authorization = "Bearer $RESEND_KEY"; 'Content-Type' = 'application/json' } `
            -Body $body -TimeoutSec 30

        Write-Host "  OK  $email" -ForegroundColor Green
        $enviados++
    } catch {
        Write-Host "  FALHA $email — $($_.Exception.Message)" -ForegroundColor Red
        $falhas += $email
    }
    Start-Sleep -Milliseconds 500  # respeita rate limit da Resend
}

Write-Host "`n=== RESUMO ===" -ForegroundColor Cyan
Write-Host "Enviados: $enviados" -ForegroundColor Green
if ($falhas.Count -gt 0) {
    Write-Host "Falhas: $($falhas.Count)" -ForegroundColor Red
    foreach ($f in $falhas) { Write-Host "  $f" -ForegroundColor Red }
}
