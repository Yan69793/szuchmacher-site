# send-alert-email.ps1 — notifica falha de automação por e-mail
# Uso: .\scripts\send-alert-email.ps1 -Subject "..." -Body "..."
# Lê credenciais de automacao-yan-os\.env (EMAIL_REMETENTE, EMAIL_SENHA, EMAIL_SMTP_HOST, EMAIL_SMTP_PORT).
# Falha-soft: nunca lança exceção para o chamador — um problema no envio do alerta
# não pode derrubar o script de automação que o disparou.
# Retorna $true quando o e-mail saiu e $false em todo o resto (config ausente,
# credencial faltando, erro de SMTP). Quem chama decide o que fazer, em geral
# registrar no próprio log. O contrato fail-soft segue valendo, nunca lança.

param(
    [Parameter(Mandatory = $true)][string]$Subject,
    [Parameter(Mandatory = $true)][string]$Body
)

$ROOT = Split-Path -Parent $PSScriptRoot
$ENV_FILE = Join-Path (Split-Path -Parent $ROOT) 'automacao-yan-os\.env'

try {
    if (-not (Test-Path $ENV_FILE)) {
        Write-Host "[alerta] .env não encontrado em $ENV_FILE — alerta não enviado." -ForegroundColor Yellow
        return $false
    }

    $cfg = @{}
    # Parser tolerante: pula comentarios e linhas vazias, aceita aspas simples e
    # duplas, e trata BOM/CRLF de arquivo salvo no Windows. O regex anterior
    # colava o \r no valor e quebrava credencial de forma intermitente.
    Get-Content $ENV_FILE -Encoding UTF8 | ForEach-Object {
        $linha = $_.Trim()
        if (-not $linha -or $linha.StartsWith('#')) { return }
        if ($linha -notmatch '^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') { return }
        $k = $Matches[1]
        $v = $Matches[2].Trim()
        if (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'"))) {
            $v = $v.Substring(1, $v.Length - 2)
        }
        $cfg[$k] = $v
    }

    $remetente = $cfg['EMAIL_REMETENTE']
    $senha     = $cfg['EMAIL_SENHA']
    $smtpHost  = if ($cfg['EMAIL_SMTP_HOST']) { $cfg['EMAIL_SMTP_HOST'] } else { 'smtp.gmail.com' }
    $smtpPort  = if ($cfg['EMAIL_SMTP_PORT']) { [int]$cfg['EMAIL_SMTP_PORT'] } else { 587 }

    if (-not $remetente -or -not $senha) {
        Write-Host "[alerta] EMAIL_REMETENTE/EMAIL_SENHA ausentes — alerta não enviado." -ForegroundColor Yellow
        return $false
    }

    # Gmail App Password vem com espacos. SmtpClient + senha da conta = 5.7.0.
    $senha = $senha -replace '\s', ''

    # PS 5.1 default SSL e TLS1.0. Gmail recusa e devolve 5.7.0 Authentication Required.
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    $msg = New-Object System.Net.Mail.MailMessage
    $msg.From = $remetente
    $msg.To.Add($remetente)
    $msg.Subject = $Subject
    $msg.Body = $Body

    $smtp = New-Object System.Net.Mail.SmtpClient($smtpHost, $smtpPort)
    $smtp.DeliveryMethod = [Net.Mail.SmtpDeliveryMethod]::Network
    $smtp.UseDefaultCredentials = $false
    $smtp.EnableSsl = $true
    $smtp.Credentials = New-Object System.Net.NetworkCredential($remetente, $senha)
    $smtp.Send($msg)
    $smtp.Dispose()

    Write-Host "[alerta] E-mail enviado para $remetente." -ForegroundColor Green
    return $true
} catch {
    Write-Host "[alerta] ERRO ao enviar e-mail de alerta: $($_.Exception.Message)" -ForegroundColor Yellow
    return $false
}
