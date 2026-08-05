# publicar-com-rollback.ps1 — deploy com validacao bloqueante e reversao automatica
#
# Uso:
#   .\scripts\publicar-com-rollback.ps1
#   .\scripts\publicar-com-rollback.ps1 -Simular   # nao publica, so mostra o plano
#
# Sequencia:
#   1. anota a versao viva do Worker, que e o alvo de rollback
#   2. build (o proprio build reprova saida incompleta e aborta aqui)
#   3. deploy
#   4. espera propagar e valida producao
#   5. se a validacao passar, roda o TestSprite no fluxo de checkout
#   6. se qualquer um dos dois reprovar, volta para a versao anotada e valida de novo
#
# Sai 0 so quando producao termina validada. Qualquer outro caminho sai 1.
#
# Existe porque em 19/07/2026 um deploy publicou public/ pela metade e ficou 10
# horas no ar: 8 arquivos em 404, a pagina de consultoria fora e todo preview de
# link quebrado nos dois dominios. Ninguem percebeu porque o wrangler saiu 0.

param(
    [switch]$Simular,
    [int]$EsperaSeg = 12
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RAIZ     = Split-Path -Parent $PSScriptRoot
$REPO     = Split-Path -Parent $RAIZ
$WORKER   = Join-Path $RAIZ 'cloudflare-workers\sz-sites'
$DEPLOY   = Join-Path $PSScriptRoot 'deploy-cloudflare.ps1'
$VALIDAR  = Join-Path $PSScriptRoot 'validar-producao.ps1'
$LOGDIR   = Join-Path $RAIZ 'diagnosticos'
$PLANOS   = Join-Path $RAIZ 'testsprite-plans'
$SITE_URL = 'https://szuchmacher.com.br'
$carimbo  = Get-Date -Format 'yyyy-MM-dd_HHmm'

if (-not (Test-Path $LOGDIR)) { New-Item -ItemType Directory -Path $LOGDIR -Force | Out-Null }
$LOG = Join-Path $LOGDIR "publicacao_$carimbo.md"

# Commit do ultimo TestSprite verde. Vive em diagnosticos/, que o git ignora: e
# estado da maquina que publica, nao do repositorio.
$MARCADOR = Join-Path $LOGDIR 'testsprite-ultimo-commit.txt'

$linhas = @()
function Registrar([string]$txt, [string]$cor = 'Gray') {
    Write-Host $txt -ForegroundColor $cor
    $script:linhas += $txt
}

Registrar "# Publicacao $carimbo" 'Cyan'
Registrar ""

# CLOUDFLARE_API_TOKEN (cfut_) e variavel de usuario persistida e tem precedencia sobre o
# login OAuth do wrangler. Esse token publica o Worker, mas e estreito: em 30/07/2026 ja
# faltava workers_kv:write (ver invalidate-worker-cache.ps1) e em 04/08/2026 passou a faltar
# tambem leitura de deployments, devolvendo "Authentication error [code: 10000]". Isso
# derrubava Get-VersaoViva e matava a publicacao na etapa 1, antes de qualquer deploy.
#
# Tirar a variavel do processo derruba a precedencia e o wrangler cai no OAuth de
# ~/.wrangler/config/default.toml, que tem a permissao. Mesmo tratamento que
# invalidate-worker-cache.ps1 e attach-worker-domains.ps1 ja aplicam. O finally devolve a
# variavel porque o deploy-cloudflare.ps1 e chamado depois no mesmo processo e usa o token
# para publicar. So o processo atual e afetado, a variavel do usuario continua intacta.
function Invoke-WranglerOAuth([scriptblock]$Bloco) {
    $tokenAmbiente = $env:CLOUDFLARE_API_TOKEN
    if ($tokenAmbiente) { Remove-Item Env:CLOUDFLARE_API_TOKEN -ErrorAction SilentlyContinue }
    try { & $Bloco }
    finally { if ($tokenAmbiente) { $env:CLOUDFLARE_API_TOKEN = $tokenAmbiente } }
}

# Le a versao com 100% do trafego. Vale para antes e depois do deploy: parsear a
# saida do deploy nao funciona, porque o deploy-cloudflare.ps1 manda o wrangler
# para Out-Host, que escreve no console e nao na saida capturavel.
function Get-VersaoViva {
    Push-Location $WORKER
    try { $s = (Invoke-WranglerOAuth { npx wrangler deployments status 2>&1 } | Out-String) } finally { Pop-Location }
    $mm = [regex]::Match($s, '\(100%\)\s+([0-9a-f-]{36})')
    if ($mm.Success) { return @{ Id = $mm.Groups[1].Value; Bruto = $s } }
    return @{ Id = $null; Bruto = $s }
}

# O validador imprime com Write-Host, que tambem nao e capturavel. Por isso a
# rotina conversa com ele por -Json, que sai pelo stream de saida de verdade.
function Invoke-Validacao {
    $bruto = (& $VALIDAR -Json 2>&1 | Out-String)
    $codigo = $LASTEXITCODE
    try   { $obj = $bruto | ConvertFrom-Json }
    catch { return @{ Ok = $false; Resumo = 'validador nao devolveu JSON'; Falhas = @(); Bruto = $bruto } }

    $falhas = @($obj.detalhe | Where-Object { -not $_.Ok })
    return @{
        Ok     = ($codigo -eq 0 -and $obj.falhas -eq 0)
        Resumo = "$($obj.total) verificacoes, $($obj.falhas) falha(s)"
        Falhas = $falhas
        Bruto  = $bruto
    }
}

function Escrever-Validacao($v) {
    Registrar $v.Resumo
    if ($v.Falhas.Count -gt 0) {
        foreach ($f in $v.Falhas) { Registrar ("- **$($f.Rotulo)**: $($f.Motivo)") }
    }
}

# Reverte, revalida e encerra o script. Nao retorna: `exit` dentro de funcao
# encerra o processo inteiro, que e o comportamento desejado nos dois chamadores.
# Le $versaoAnterior e $versaoNova do escopo do script, que so existem no momento
# da chamada, nunca no da definicao.
function Invoke-Rollback([string]$Motivo) {
    Registrar ""
    Registrar "## Rollback" 'Yellow'
    Registrar "$Motivo Revertendo para $versaoAnterior." 'Yellow'

    Push-Location $WORKER
    try {
        $saidaRb = (Invoke-WranglerOAuth { npx wrangler rollback $versaoAnterior -y -m "Rollback automatico: portao pos-deploy reprovou" 2>&1 } | Out-String)
        $rbOk = ($LASTEXITCODE -eq 0)
    } finally { Pop-Location }

    # Guarda so a ultima linha util do wrangler: a saida completa vem cheia de
    # desenho de caixa que vira mojibake no arquivo e nao ajuda em nada.
    $resumoRb = @($saidaRb -split "`n" | Where-Object { $_ -match 'SUCCESS|ERROR|has been deployed' }) -join ' '
    Registrar "wrangler: $($resumoRb.Trim())"

    if (-not $rbOk) {
        Registrar ""
        Registrar "ROLLBACK FALHOU. Producao pode estar quebrada na versao $versaoNova." 'Red'
        Registrar "Intervencao manual necessaria:" 'Red'
        Registrar "    cd $WORKER"
        Registrar "    npx wrangler rollback $versaoAnterior -y"
        $script:linhas | Set-Content -Path $LOG -Encoding utf8
        exit 1
    }

    Start-Sleep -Seconds $EsperaSeg
    Registrar ""
    Registrar "### Validacao apos rollback"
    $val2 = Invoke-Validacao
    Escrever-Validacao $val2

    Registrar ""
    if ($val2.Ok) {
        Registrar "REVERTIDO. Producao de volta em $versaoAnterior e validada." 'Yellow'
        Registrar "A versao $versaoNova foi rejeitada. Veja o motivo acima."
    } else {
        Registrar "REVERTIDO, MAS AINDA REPROVANDO." 'Red'
        Registrar "A falha e anterior a este deploy, entao rollback nao resolve. Investigar a mao."
    }

    $script:linhas | Set-Content -Path $LOG -Encoding utf8
    Write-Host "`nRelatorio: $LOG" -ForegroundColor DarkGray
    exit 1
}

# Arquivos que pipelines agendados reescrevem sozinhos, ou que o build nem copia
# para public/. Mesma logica de Get-MudancasDeployaveis em run-agenda-agent.ps1:
# nenhum deles muda o que o navegador executa, entao nenhum justifica gastar
# credito refazendo o mesmo teste de clique.
$IGNORAR_TESTSPRITE = @(
    'site-producao/scripts/'
    'site-producao/docs/'
    'site-producao/diagnosticos/'
    'site-producao/design/'
    'site-producao/agenda-data.json'
    'site-producao/macro_data.json'
    'site-producao/relatorio_cache.json'
    'site-producao/market_data_cache.json'
)

# A rotina da agenda publica 3x por semana mesmo em semana sem uma linha de codigo
# alterada. Sem esta guarda, o TestSprite refaria o mesmo teste contra o mesmo site
# toda vez, queimando credito para reconfirmar o que ja estava confirmado.
function Test-CodigoMudou {
    if (-not (Test-Path $MARCADOR)) { return $true }
    $ultimo = (Get-Content $MARCADOR -Raw -Encoding utf8).Trim()
    if (-not $ultimo) { return $true }

    # Local, nao herdado: um aviso do git em stderr nao pode virar excecao aqui.
    # O que decide e o codigo de saida.
    $ErrorActionPreference = 'Continue'
    Push-Location $REPO
    try {
        $arquivos = @(git diff --name-only $ultimo HEAD -- site-producao)
        $rc = $LASTEXITCODE
    } finally { Pop-Location }

    # Marcador que nao resolve mais (rebase, commit reescrito, clone novo): tratar
    # como mudanca. Perder um teste e pior do que rodar um a mais.
    if ($rc -ne 0) { return $true }

    foreach ($f in $arquivos) {
        $caminho = $f.Replace('\', '/')
        $ignorado = $false
        foreach ($p in $IGNORAR_TESTSPRITE) {
            if ($caminho.StartsWith($p)) { $ignorado = $true; break }
        }
        if (-not $ignorado) { return $true }
    }
    return $false
}

# Fluxo de checkout de assinatura.html: clique nos dois botoes e pagina de retorno.
# O validar-producao.ps1 nao alcanca isso, porque o destino dos botoes e decidido
# em runtime por wireStripeButtons() e nao existe no HTML servido.
#
# Roda depois do gate barato de proposito. O TestSprite cobra por execucao; a
# validacao de producao e gratuita e pega a maior parte das regressoes primeiro.
function Invoke-TestSprite {
    Registrar ""
    Registrar "## TestSprite, fluxo de checkout"

    if (-not (Get-Command testsprite -ErrorAction SilentlyContinue)) {
        Registrar "CLI 'testsprite' fora do PATH. Pulado, sem bloquear o deploy." 'Yellow'
        return @{ Ok = $true }
    }
    $planos = @(Get-ChildItem $PLANOS -Filter '*.json' -ErrorAction SilentlyContinue)
    if ($planos.Count -eq 0) {
        Registrar "Nenhum plano em $PLANOS. Pulado." 'Yellow'
        return @{ Ok = $true }
    }
    if (-not (Test-CodigoMudou)) {
        Registrar "Nenhum arquivo de site alterado desde o ultimo teste verde. Pulado."
        return @{ Ok = $true }
    }

    $ErrorActionPreference = 'Continue'
    $falhou = $false
    $inconclusivo = $false
    foreach ($p in $planos) {
        $saida  = (testsprite test create --plan-from $p.FullName --run --wait `
                       --target-url $SITE_URL --timeout 600 --output json 2>&1 | Out-String)
        $codigo = $LASTEXITCODE

        # A CLI imprime `idempotency-key:` antes do JSON e `requestId:` depois, entao
        # a saida crua nao e JSON valido. O veredito e so para o relatorio: quem
        # decide aprovado ou reprovado e o codigo de saida.
        $limpo = ($saida -split "`r?`n" | Where-Object { $_ -notmatch '^(idempotency-key|requestId):' }) -join "`n"
        try   { $verdict = ($limpo | ConvertFrom-Json).run.status }
        catch { $verdict = "sem veredito legivel" }

        # Exit 1 e veredito sobre o site: o checkout reprovou, travou ou foi cancelado, e
        # ai vale o mesmo rollback da validacao. Os outros codigos (3 auth, 7 timeout,
        # 10 rede, 11 rate-limit) sao pane do proprio TestSprite e nao dizem nada sobre a
        # versao publicada. Reverter por causa deles derrubaria um deploy que o gate
        # gratuito ja aprovou, entao viram aviso.
        if ($codigo -eq 0) {
            Registrar "  OK     $($p.BaseName): $verdict"
        } elseif ($codigo -eq 1) {
            $falhou = $true
            Registrar "  FALHA  $($p.BaseName): $verdict (exit $codigo)" 'Red'
        } else {
            $inconclusivo = $true
            Registrar "  AVISO  $($p.BaseName): TestSprite nao concluiu (exit $codigo). Checkout nao verificado." 'Yellow'
        }
    }

    if ($falhou) {
        return @{ Ok = $false; Motivo = 'O TestSprite reprovou o fluxo de checkout.' }
    }

    # O marcador so avanca com todos os planos verdes. Inconclusivo mantem o commit
    # anterior, entao o proximo deploy tenta de novo em vez de dar o checkout por
    # verificado sem nunca ter olhado.
    if ($inconclusivo) { return @{ Ok = $true } }

    Push-Location $REPO
    try { $head = (git rev-parse HEAD 2>$null).Trim() } finally { Pop-Location }
    if ($head) { $head | Set-Content -Path $MARCADOR -Encoding utf8 }
    return @{ Ok = $true }
}

# --- 1. versao viva, alvo do rollback ---------------------------------------
$vv = Get-VersaoViva
$status = $vv.Bruto

if (-not $vv.Id) {
    Registrar "ABORTADO: nao consegui ler a versao viva do Worker." 'Red'
    Registrar "Sem alvo de rollback, publicar seria apostar. Saida do wrangler:" 'Red'
    Registrar '```'; Registrar $status.Trim(); Registrar '```'
    $linhas | Set-Content -Path $LOG -Encoding utf8
    exit 1
}
$versaoAnterior = $vv.Id
Registrar "Versao viva antes de publicar: ``$versaoAnterior``"
Registrar ""

if ($Simular) {
    Registrar "Modo simulacao. Nada foi publicado." 'Yellow'
    Registrar "Rollback iria para: $versaoAnterior"
    $linhas | Set-Content -Path $LOG -Encoding utf8
    exit 0
}

# --- 2 e 3. build e deploy ---------------------------------------------------
# O build reprova saida incompleta e o deploy-cloudflare.ps1 aborta antes de
# chamar o wrangler, entao um build quebrado nunca chega a virar deploy.
Registrar "## Build e deploy"
$deployOk = $true
try {
    # Sem captura de proposito: o deploy escreve direto no console e o progresso
    # do wrangler fica visivel. A versao nova vem do wrangler depois, nao daqui.
    & $DEPLOY
    if ($LASTEXITCODE -ne 0) { $deployOk = $false }
} catch {
    $deployOk = $false
    Registrar "Excecao no deploy: $($_.Exception.Message)" 'Red'
}

if (-not $deployOk) {
    # O deploy-cloudflare.ps1 pode ter saido != 0 DEPOIS de um wrangler deploy
    # bem-sucedido (ex.: purge de cache falhou). Nesse caso a versao nova ja
    # esta no ar, e afirmar "intocada" e mentir. Conferir.
    $posFalha = (Get-VersaoViva).Id
    if ($posFalha -and $posFalha -ne $versaoAnterior) {
        Registrar "FALHOU. Versao $posFalha detectada no ar (anterior era $versaoAnterior)." 'Red'
        Registrar "O deploy parcial foi ao ar. Tentando rollback..." 'Red'
        # Tenta rollback. Se falhar, producao fica na versao nao validada.
        Push-Location $WORKER
        try {
            $saidaRb = (Invoke-WranglerOAuth { npx wrangler rollback $versaoAnterior -y -m "Rollback automatico: deploy falhou apos publicacao" 2>&1 } | Out-String)
            $rbOk = ($LASTEXITCODE -eq 0)
        } finally { Pop-Location }
        if ($rbOk) {
            Registrar "Rollback concluido. Producao de volta em $versaoAnterior." 'Yellow'
        } else {
            $resumoRb = @($saidaRb -split "`n" | Where-Object { $_ -match 'SUCCESS|ERROR|has been deployed' }) -join ' '
            Registrar "ROLLBACK FALHOU: $($resumoRb.Trim())" 'Red'
            Registrar "Producao pode estar em $posFalha, sem validacao." 'Red'
        }
    } else {
        Registrar "FALHOU. Versao viva continua $versaoAnterior, producao intocada." 'Red'
    }
    $linhas | Set-Content -Path $LOG -Encoding utf8
    exit 1
}

$versaoNova = (Get-VersaoViva).Id
if (-not $versaoNova) { $versaoNova = '(nao lida)' }
Registrar "Publicado. Versao nova: ``$versaoNova``" 'Green'
Registrar ""

# --- 4. validacao bloqueante -------------------------------------------------
Registrar "## Validacao"
Start-Sleep -Seconds $EsperaSeg
$val = Invoke-Validacao
Escrever-Validacao $val

if (-not $val.Ok) { Invoke-Rollback "A validacao de producao reprovou." }

# --- 5. TestSprite -----------------------------------------------------------
# DESLIGADO ate o plano ter uma corrida verde. testsprite-plans/checkout-assinatura.json
# nunca foi executado, e um plano nao provado reprova por qualidade de plano com a mesma
# facilidade com que reprova por defeito no site. Ligado, a primeira execucao seria num
# deploy sem supervisao e um exit 1 por redacao do plano reverteria uma versao boa.
#
# Para religar: rodar o plano uma vez a mao e confirmar exit 0,
#   testsprite test create --plan-from .\testsprite-plans\checkout-assinatura.json --run --wait --target-url https://szuchmacher.com.br --timeout 600
# depois descomentar as duas linhas abaixo. As funcoes Invoke-TestSprite e Test-CodigoMudou
# ficam definidas de proposito, nao sao codigo morto.
#
# $ts = Invoke-TestSprite
# if (-not $ts.Ok) { Invoke-Rollback $ts.Motivo }

Registrar ""
Registrar "PUBLICACAO CONFIRMADA. Producao validada na versao $versaoNova." 'Green'
$linhas | Set-Content -Path $LOG -Encoding utf8
Write-Host "`nRelatorio: $LOG" -ForegroundColor DarkGray
exit 0
