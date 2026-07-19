# send-alert-email.ps1 — notifica falha de automação por e-mail
# Uso: .\scripts\send-alert-email.ps1 -Subject "..." -Body "..."
# Lê credenciais de automacao-yan-os\.env (EMAIL_REMETENTE, EMAIL_SENHA, EMAIL_SMTP_HOST, EMAIL_SMTP_PORT).
# Falha-soft: nunca lança exceção para o chamador — um problema no envio do alerta
# não pode derrubar o script de automação que o disparou.

param(
    [Parameter(Mandatory = $true)][string]$Subject,
    [Parameter(Mandatory = $true)][string]$Body
)

$ROOT = Split-Path -Parent $PSScriptRoot
$ENV_FILE = Join-Path (Split-Path -Parent $ROOT) 'automacao-yan-os\.env'

try {
    if (-not (Test-Path $ENV_FILE)) {
        Write-Host "[alerta] .env não encontrado em $ENV_FILE — alerta não enviado." -ForegroundColor Yellow
        return
    }

    $cfg = @{}
    Get-Content $ENV_FILE | Where-Object { $_ -match '^[A-Z_]+=.+' } | ForEach-Object {
        $k, $v = $_ -split '=', 2
        $cfg[$k] = $v
    }

    $remetente = $cfg['EMAIL_REMETENTE']
    $senha     = $cfg['EMAIL_SENHA']
    $smtpHost  = if ($cfg['EMAIL_SMTP_HOST']) { $cfg['EMAIL_SMTP_HOST'] } else { 'smtp.gmail.com' }
    $smtpPort  = if ($cfg['EMAIL_SMTP_PORT']) { [int]$cfg['EMAIL_SMTP_PORT'] } else { 587 }

    if (-not $remetente -or -not $senha) {
        Write-Host "[alerta] EMAIL_REMETENTE/EMAIL_SENHA ausentes — alerta não enviado." -ForegroundColor Yellow
        return
    }

    $msg = New-Object System.Net.Mail.MailMessage
    $msg.From = $remetente
    $msg.To.Add($remetente)
    $msg.Subject = $Subject
    $msg.Body = $Body

    $smtp = New-Object System.Net.Mail.SmtpClient($smtpHost, $smtpPort)
    $smtp.EnableSsl = $true
    $smtp.Credentials = New-Object System.Net.NetworkCredential($remetente, $senha)
    $smtp.Send($msg)

    Write-Host "[alerta] E-mail enviado para $remetente." -ForegroundColor Green
} catch {
    Write-Host "[alerta] ERRO ao enviar e-mail de alerta: $($_.Exception.Message)" -ForegroundColor Yellow
}
