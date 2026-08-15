# invalidate-worker-cache.ps1 - limpa caches KV do Worker sz-sites (sem API Purge)
# Uso: .\scripts\invalidate-worker-cache.ps1 [-RefreshMacro]

param([switch]$RefreshMacro)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$WORKER = Join-Path (Split-Path -Parent $PSScriptRoot) 'cloudflare-workers\sz-sites'
$KV_ID  = 'fd40efe1057c4c54b3d33277d4665434'
# ntnb-scenarios entrou depois do deploy da fase 2 (15/08/2026): o payload
# legado no KV (source defaults, preco 95) sobrevive ate 2h sem esta chave.
$KEYS   = @('macro-api', 'macro-panel', 'market-data', 'ntnb-scenarios')

Push-Location $WORKER

# CLOUDFLARE_API_TOKEN existe como variavel de usuario persistida (token cfut_) e
# tem precedencia sobre o login OAuth do wrangler. Esse token serve para publicar o
# Worker, mas nao carrega permissao de Workers KV: todo delete daqui voltava
# 401 Unauthorized em /storage/kv/.../values/<key>, medido em 30/07/2026. O login
# OAuth gravado em ~/.wrangler/config/default.toml tem workers_kv:write e faz a
# mesma chamada passar. Tirar a variavel do processo derruba a precedencia e o
# wrangler cai no OAuth. Mesmo tratamento que attach-worker-domains.ps1 ja aplica
# pelo mesmo motivo. So o processo atual e afetado, a variavel persistida do
# usuario continua intacta.
$tokenAmbiente = $env:CLOUDFLARE_API_TOKEN
if ($tokenAmbiente) { Remove-Item Env:CLOUDFLARE_API_TOKEN -ErrorAction SilentlyContinue }

try {
    # O par OK/SKIP abaixo ja foi escrito para tratar falha de delete como nao-fatal,
    # mas com $ErrorActionPreference = 'Stop' a linha que o wrangler escreve em stderr
    # vira NativeCommandError terminante e derruba o script antes de chegar no if.
    # Medido em 30/07/2026: o delete de macro-api falhou na API e o deploy inteiro
    # parou ali, mesmo com o Worker ja publicado. 'Continue' devolve ao script o
    # comportamento que o proprio codigo declara.
    $eapAnterior = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    foreach ($key in $KEYS) {
        Write-Host "  DEL KV  $key" -NoNewline
        npx wrangler kv key delete $key --namespace-id $KV_ID --remote 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) { Write-Host " OK" -ForegroundColor Green }
        else { Write-Host " SKIP" -ForegroundColor Yellow }
    }
    $ErrorActionPreference = $eapAnterior
}
finally {
    # Devolve o token ao processo: este script e chamado com & por
    # deploy-cloudflare.ps1, e Env: e escopo de processo, nao de script.
    if ($tokenAmbiente) { $env:CLOUDFLARE_API_TOKEN = $tokenAmbiente }
    Pop-Location
}

function Get-CronSecret {
    $yanEnv = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'automacao-yan-os\.env'
    if (-not (Test-Path -LiteralPath $yanEnv)) { return $null }
    $line = Get-Content -LiteralPath $yanEnv | Where-Object { $_ -match '^\s*CRON_SECRET=' } | Select-Object -First 1
    if (-not $line) { return $null }
    $val = $line.Substring($line.IndexOf('=') + 1).Trim()
    if (-not $val) { return $null }
    return $val
}

if ($RefreshMacro) {
    # Best-effort: aquecer o cache que acabamos de apagar, para o primeiro visitante
    # nao pagar a regeneracao a frio (~37 s, cascata OpenRouter).
    #
    # Reconstroi cache do zero e as vezes o upstream devolve 503 na primeira
    # tentativa (visto em 19/07/2026). Nao e timeout: o TimeoutSec ja era 180 e a
    # falha voltou em segundos. Reconsultado logo depois, o mesmo endpoint deu 200.
    # Por isso tenta de novo em vez de desistir no primeiro erro.
    #
    # Continua nao-fatal de proposito: cache frio degrada latencia, nao quebra o
    # site, e a validacao pos-deploy e quem decide se a publicacao vale.
    $cronSecret = Get-CronSecret
    if (-not $cronSecret) {
        Write-Host "  REFRESH pulado: CRON_SECRET ausente no .env do yan-os. Cache fica frio." -ForegroundColor Yellow
    }
    $tentativas = 3
    for ($i = 1; $i -le $tentativas -and $cronSecret; $i++) {
        Write-Host "  REFRESH macro_api.php?cron=1 (tentativa $i/$tentativas) ..." -ForegroundColor DarkCyan
        try {
            $hdr = @{ 'X-Cron-Secret' = $cronSecret }
            $r = Invoke-RestMethod -Uri 'https://szuchmacher.com.br/macro_api.php?cron=1' -Headers $hdr -TimeoutSec 180
            $ok = $r -and ($r.PSObject.Properties.Name -contains 'ok') -and $r.ok
            if ($ok) {
                Write-Host "  macro_api OK - $($r.generated_at) cache=$($r.cache)" -ForegroundColor Green
                break
            }
            $motivo = if ($r -and ($r.PSObject.Properties.Name -contains 'error')) { $r.error } else { 'resposta sem ok=true' }
            Write-Host "  macro_api falhou: $motivo" -ForegroundColor Yellow
        } catch {
            Write-Host "  macro_api erro: $($_.Exception.Message)" -ForegroundColor Yellow
        }
        if ($i -lt $tentativas) {
            Start-Sleep -Seconds (5 * $i)
        } else {
            Write-Host "  macro_api nao aqueceu em $tentativas tentativas. Cache fica frio; primeiro acesso paga a regeneracao." -ForegroundColor Yellow
        }
    }
}

Write-Host "Cache KV invalidado." -ForegroundColor Green