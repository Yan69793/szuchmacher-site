# deploy-cloudflare.ps1 — publica szuchmacher + multi-assets no Cloudflare Workers
# Uso: .\scripts\deploy-cloudflare.ps1 [-DryRun] [-Purge]
#   -Purge  roda purge-cloudflare.ps1 apos o deploy (limpa o edge cache do CDN)

param(
    [switch]$DryRun,
    [switch]$Purge
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ROOT = Split-Path -Parent $PSScriptRoot
$WORKER = Join-Path $ROOT 'cloudflare-workers\sz-sites'
$BUILD = Join-Path $PSScriptRoot 'build-cloudflare-public.ps1'
$CONFIG = Join-Path $ROOT 'config.php'

Write-Host "`n=== DEPLOY CLOUDFLARE (sz-sites) ===" -ForegroundColor Cyan

& $BUILD

Push-Location $WORKER

# CLOUDFLARE_API_TOKEN persistido (cfut_) tem precedencia sobre o login OAuth do
# wrangler e nao carrega o escopo de Workers. Medido em 31/08/2026: o token
# responde active em /user/tokens/verify, mas nem User Details ele le, e o deploy
# morria em 10000 (Authentication error) no /workers/services/sz-sites seguido de
# 9109 (Invalid access token) no /accounts. O OAuth gravado em
# ~/.wrangler/config/default.toml traz workers, workers_kv, workers_routes e
# workers_scripts em write, que e o que o deploy precisa. Tirar a variavel do
# processo derruba a precedencia e o wrangler cai no OAuth.
#
# Fazem a mesma guarda, e so estes quatro: invalidate-worker-cache.ps1,
# attach-worker-domains.ps1, publicar-com-rollback.ps1 e este. Uma versao
# anterior deste comentario listava purge-cloudflare.ps1, cleanup-dns-cloudflare.ps1
# e os setup-*.ps1 como se tambem removessem a variavel, e isso era falso: eles
# apenas LEEM um token do .env e nunca mexeram no ambiente. Corrigido em
# 01/09/2026 depois de conferir arquivo por arquivo.
#
# Estado medido em 01/09/2026: a variavel persistida nao existe mais em escopo
# nenhum (User, Machine e Processo ausentes), entao esta guarda e no-op hoje, e
# o token que sobrou no .env responde 200 em /user, /accounts, /zones,
# workers/scripts, workers/services/sz-sites e storage/kv/namespaces, ou seja,
# nao e o token sub-escopado que quebrou o deploy em 31/08.
#
# A guarda fica de proposito. Custa cinco linhas, tem escopo de processo com
# restore no finally, e cobre um modo de falha que bloqueou publicacao duas
# vezes. Maquina nova, CI ou setup antigo que volte a definir a variavel cai
# no mesmo buraco sem ela. Escopo de processo, a variavel persistida do usuario
# (quando existir) continua intacta.
$tokenAmbiente = $env:CLOUDFLARE_API_TOKEN
if ($tokenAmbiente) {
    [Environment]::SetEnvironmentVariable('CLOUDFLARE_API_TOKEN', $null, 'Process')
}

try {
    if (-not (Test-Path 'node_modules')) {
        Write-Host "Instalando dependencias..." -ForegroundColor DarkGray
        npm install 2>&1 | Out-Host
    }

    # 'Continue' so em volta das chamadas ao wrangler. Com 'Stop', qualquer linha que
    # o wrangler escreve em stderr vira NativeCommandError terminante e derruba o
    # script depois do upload, pulando a invalidacao de cache KV. E o wrangler usa
    # stderr para aviso, nao so para erro: em 30/07/2026 os avisos de 'workers_dev' e
    # de 'preview_urls' fizeram exatamente isso, com o deploy ja concluido. Quem decide
    # sucesso ou falha aqui e $LASTEXITCODE, que ja era conferido logo abaixo.
    $eapAnterior = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'

    if ($DryRun) {
        npx wrangler deploy --dry-run 2>&1 | Out-Host
        $ErrorActionPreference = $eapAnterior
        exit $LASTEXITCODE
    }

    npx wrangler deploy 2>&1 | Out-Host
    $codigoDeploy = $LASTEXITCODE
    $ErrorActionPreference = $eapAnterior
    if ($codigoDeploy -ne 0) { exit $codigoDeploy }

    $secretScript = Join-Path $PSScriptRoot 'set-openrouter-secret.ps1'
    if (Test-Path $secretScript) {
        # O filho usa ErrorActionPreference='Stop' e faz Write-Error fora de
        # try: falha de chave chega aqui como excecao, nao como exit code.
        # Os dois caminhos viram aviso, e o LASTEXITCODE e zerado para o
        # residuo nao virar rollback de um deploy que concluiu.
        $secretFalhou = $false
        $secretMsg = ''
        try {
            & $secretScript
            if ($LASTEXITCODE -ne 0) { $secretFalhou = $true; $secretMsg = "exit $LASTEXITCODE" }
        } catch {
            $secretFalhou = $true
            $secretMsg = $_.Exception.Message
        }
        $global:LASTEXITCODE = 0
        if ($secretFalhou) {
            Write-Warning "set-openrouter-secret.ps1 falhou ($secretMsg). O deploy seguiu, mas o OPENROUTER_KEY do Worker pode estar desatualizado: macro pode cair no fallback estatico."
        }
    }

    Write-Host "`n=== INVALIDAR CACHE KV ===" -ForegroundColor Cyan
    try {
        & (Join-Path $PSScriptRoot 'invalidate-worker-cache.ps1') -RefreshMacro
    } catch {
        # O deploy ja concluiu. Falha aqui nao pode reportar exit 1 e induzir
        # rollback (ou falso alarme) de uma publicacao que foi bem.
        Write-Warning "Invalidação de cache KV falhou após o deploy (site ja publicado): $($_.Exception.Message). Rode invalidate-worker-cache.ps1 manualmente."
    }
    # O invalidador roda npx por dentro e nao chama exit: um delete KV que
    # falhou deixa $LASTEXITCODE sujo aqui, e publicar-com-rollback.ps1 le esse
    # valor depois do deploy e reverte uma publicacao bem-sucedida (caminho
    # silencioso, sem excecao, medido em 30/07/2026). Zerar e obrigatorio.
    $global:LASTEXITCODE = 0

    if ($Purge) {
        Write-Host "`n=== PURGE CDN ===" -ForegroundColor Cyan
        try {
            & (Join-Path $PSScriptRoot 'purge-cloudflare.ps1')
            if ($LASTEXITCODE -ne 0) { Write-Warning "purge-cloudflare.ps1 falhou (exit $LASTEXITCODE)." }
        } catch {
            Write-Warning "Purge de CDN falhou: $($_.Exception.Message)"
        }
        $global:LASTEXITCODE = 0
    }

    Write-Host "`nDeploy Cloudflare concluido." -ForegroundColor Green
    Write-Host "Validar:" -ForegroundColor DarkGray
    Write-Host "  https://szuchmacher.com.br/"
    Write-Host "  https://multi-assets.com/"
    Write-Host "  https://multi-assets.com/consultoria"
    Write-Host "  https://szuchmacher.com.br/assets/macro.php"
    Write-Host "  https://multi-assets.com/prices.php"

    # Contrato com o chamador: publicar-com-rollback.ps1 decide rollback pelo
    # $LASTEXITCODE depois de & $DEPLOY. Sem exit explicito, o residuo de
    # qualquer npx interno vazaria para essa decisao. Sucesso = exit 0.
    exit 0
}
finally {
    # Env: e escopo de processo, nao de script: sem devolver, quem chamou este
    # script com & (publicar-com-rollback.ps1) seguiria sem o token.
    if ($tokenAmbiente) { $env:CLOUDFLARE_API_TOKEN = $tokenAmbiente }
    Pop-Location
}