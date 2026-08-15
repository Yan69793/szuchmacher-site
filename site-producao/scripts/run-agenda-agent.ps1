# run-agenda-agent.ps1, gera agenda-data.json e publica com validacao e rollback
# Usado pelo Task Scheduler (Szuchmacher-AgendaAgent, dom + seg + qui 08:00)
#
# Domingo e o gatilho que resolve o problema: agenda_agent.py (janela_seg_sex)
# devolve a segunda SEGUINTE quando roda no fim de semana, entao a execucao de
# domingo publica a semana que vai comecar. O frontend cuida do resto sozinho:
# assets/macro-panel.js troca "Proxima semana" por "Esta semana" na virada da
# segunda, sem nova execucao.
#
# Sequencia:
#   1. guarda de working tree, para nao publicar codigo que ninguem revisou
#   2. gera agenda-data.json
#   3. confere que a janela gerada nao esta inteiramente no passado
#   4. publica com validacao bloqueante e rollback automatico
#
# `exit` em vez de `return` de proposito: o Task Scheduler le o codigo de saida
# como LastTaskResult, e `return` num script chamado com -File sai sempre 0.
#
# -Simular roda guarda, geracao e assercao e para antes de publicar. Tambem
# suprime o e-mail de alerta, que so faz sentido em execucao de verdade.

param([switch]$Simular)

Set-StrictMode -Version Latest
# 'Continue' obrigatorio em script chamado pelo Task Scheduler: com 'Stop' o erro
# aborta antes do 'exit' e LastTaskResult pode reportar 0 com falha real. FALHA-002.
$ErrorActionPreference = 'Continue'

$ROOT     = Split-Path -Parent $PSScriptRoot          # ...\Site\site-producao
$REPO     = Split-Path -Parent $ROOT                  # ...\Site
$YAN      = Join-Path $REPO 'automacao-yan-os'
$AGENT    = Join-Path $YAN 'agents\agenda_agent.py'
$PUBLICAR = Join-Path $PSScriptRoot 'publicar-com-rollback.ps1'
$ALERT    = Join-Path $PSScriptRoot 'send-alert-email.ps1'
$LOGDIR   = Join-Path $YAN 'logs'
$LOG      = Join-Path $LOGDIR ("agenda_scheduled_{0:yyyyMMdd}.log" -f (Get-Date))

# --- interpretador -------------------------------------------------------------
# Ordem de preferencia. O venv historico vem primeiro: se alguem reinstalar o
# Python 3.11, ele volta a ser usado sem mexer neste arquivo.
$PY_CANDIDATOS = @(
    (Join-Path $YAN 'venv\Scripts\python.exe'),
    (Join-Path $YAN 'venv-py312\Scripts\python.exe'),
    'C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe'
)

function Resolve-Python {
    # Test-Path nao basta. Em 26/07/2026 o Python 3.11 base sumiu da maquina e
    # automacao-yan-os\venv\Scripts\python.exe continuou existindo como arquivo,
    # so que morto: responde "No Python at ..." e sai diferente de zero. O check
    # antigo (`if (-not (Test-Path $PY))`) passava e a rotina quebrava depois.
    # agenda_agent.py so importa stdlib, entao qualquer 3.10+ vivo serve.
    $ErrorActionPreference = 'Continue'
    $tentados = @()
    foreach ($p in $PY_CANDIDATOS) {
        if (-not (Test-Path $p)) { $tentados += "$p (ausente)"; continue }
        # Sem `| Select-Object -First 1` aqui: com -First 1 o pipeline e parado
        # assim que chega a primeira linha, e nesse caminho o PowerShell nao
        # atualiza $LASTEXITCODE. O candidato seguinte acabava julgado pelo
        # codigo de saida do anterior, e um interpretador bom era descartado em
        # silencio so por vir depois de um quebrado.
        $saida = (& $p -c "import sys; sys.stdout.write(sys.version.split()[0])" 2>&1)
        $rc = $LASTEXITCODE
        if ($rc -ne 0) { $tentados += "$p (nao executa, exit $rc)"; continue }
        $v = (("$saida" -split "`r?`n")[0]).Trim()
        if ("$v" -match '^(\d+)\.(\d+)') {
            $maior = [int]$Matches[1]; $menor = [int]$Matches[2]
            if ($maior -gt 3 -or ($maior -eq 3 -and $menor -ge 10)) {
                return @{ Exe = $p; Versao = "$v" }
            }
            $tentados += "$p ($v, abaixo de 3.10)"
        } else {
            $tentados += "$p (versao ilegivel)"
        }
    }
    throw ("nenhum Python 3.10+ funcional encontrado. Testados: " + ($tentados -join ' | '))
}

function Write-Log([string]$Msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Msg
    Write-Host $line
    New-Item -ItemType Directory -Force -Path $LOGDIR | Out-Null
    Add-Content -Path $LOG -Value $line -Encoding UTF8
}

# --- guarda de working tree ---------------------------------------------------
# O deploy publica o estado do disco, nao o do ultimo commit. Uma edicao esquecida
# em site-producao/ viraria producao sem revisao, que e o Passo 1 que a skill
# rotina-domingo exige do humano e que a rotina automatica nao tinha.
#
# Denylist de diretorio em vez de allowlist de arquivo: arquivo deployavel novo
# cai no caso conservador, que e abortar. Os prefixos abaixo sao o que
# build-cloudflare-public.ps1 comprovadamente NAO copia para public/.
$NAO_DEPLOYAVEL = @(
    'site-producao/scripts/',
    'site-producao/docs/',
    'site-producao/diagnosticos/',
    'site-producao/design/',
    'site-producao/multiasset-platform/'
)
# Artefatos de dados que pipelines agendados reescrevem, nao codigo que alguem
# digitou. agenda-data.json vem desta rotina, macro_data.json vem do
# Szuchmacher-MacroAgent e relatorio_cache.json vem do fechamento diario. Se
# entrassem na guarda, uma execucao normal de qualquer um desses agentes faria a
# rotina de domingo abortar, e portao que reprova por operacao normal acaba
# ignorado. Contrapartida assumida: um desses arquivos corrompido nao e barrado
# aqui. Para a agenda existe a assercao de janela logo abaixo; para os outros
# dois a rede e o validar-producao.ps1, que confere tamanho minimo.
$ARTEFATOS_DE_PIPELINE = @(
    'site-producao/agenda-data.json',
    'site-producao/macro_data.json',
    'site-producao/relatorio_cache.json',
    'site-producao/cloudflare-workers/sz-sites/public/sz/agenda-data.json',
    'site-producao/cloudflare-workers/sz-sites/public/sz/macro_data.json',
    'site-producao/cloudflare-workers/sz-sites/public/sz/relatorio_cache.json',
    'site-producao/cloudflare-workers/sz-sites/public/multi/macro_data.json'
)
# Diretorios que build-cloudflare-public.ps1 copia por glob (Copy-Tree), nao por
# nome. So neles um arquivo NOVO chega a producao sozinho. Fora daqui a copia e
# por nome explicito, entao um arquivo nunca visto pelo git nao e publicado, e
# tratar todo untracked como bloqueio transforma um screenshot esquecido na raiz
# em falha semanal. Portao que reprova por ruido acaba ignorado.
$COPIADO_POR_GLOB = @(
    'site-producao/assets/img/',
    'site-producao/assets/video/',
    'site-producao/assets/media/'
)

function Get-MudancasDeployaveis {
    # ErrorActionPreference local: em PS 5.1 qualquer linha que o git mande para
    # stderr viraria excecao com 'Stop' herdado, e um aviso do git nao pode
    # derrubar a rotina. O que vale e o codigo de saida.
    $ErrorActionPreference = 'Continue'
    Push-Location $REPO
    try {
        $linhas = @(git status --porcelain -- 'site-producao/')
        $rc = $LASTEXITCODE
    } finally { Pop-Location }
    if ($rc -ne 0) { throw "git status falhou (exit $rc)" }

    $suspeitos = @()
    foreach ($l in $linhas) {
        if ([string]::IsNullOrWhiteSpace($l) -or $l.Length -lt 4) { continue }
        # formato: XY<espaco>caminho ; rename vem como "antigo -> novo"
        $estado  = $l.Substring(0, 2)
        $caminho = $l.Substring(3).Trim()
        if ($caminho -match ' -> ') { $caminho = ($caminho -split ' -> ')[-1] }
        $caminho = $caminho.Trim('"').Replace('\', '/')

        if ($ARTEFATOS_DE_PIPELINE -contains $caminho) { continue }

        if ($estado -eq '??') {
            # untracked: so bloqueia dentro dos diretorios copiados por glob
            foreach ($p in $COPIADO_POR_GLOB) {
                if ($caminho.StartsWith($p)) { $suspeitos += "$caminho (novo)"; break }
            }
            continue
        }

        # tracked modificado ou apagado: tratamento conservador
        if ($caminho -like '*.md') { continue }
        $ignorado = $false
        foreach ($p in $NAO_DEPLOYAVEL) {
            if ($caminho.StartsWith($p)) { $ignorado = $true; break }
        }
        if ($ignorado) { continue }
        $suspeitos += $caminho
    }
    return $suspeitos
}

try {
    Write-Log '=== INICIO agenda automatizada ==='
    Write-Log ("Dia: {0:yyyy-MM-dd} ({1})" -f (Get-Date), (Get-Date).DayOfWeek)

    if (-not (Test-Path $AGENT))    { throw "Agent nao encontrado: $AGENT" }
    if (-not (Test-Path $PUBLICAR)) { throw "Publicador nao encontrado: $PUBLICAR" }

    $py = Resolve-Python
    Write-Log ("Python: {0} ({1})" -f $py.Exe, $py.Versao)

    # --- 1. guarda ------------------------------------------------------------
    $sujos = @(Get-MudancasDeployaveis)
    if ($sujos.Count -gt 0) {
        throw ("working tree sujo em arquivo que vai a producao, publicacao abortada: " +
               ($sujos -join ', ') +
               ". Commite ou reverta antes da proxima execucao.")
    }
    Write-Log 'Working tree: nenhum arquivo deployavel pendente.'

    # --- 2. geracao -----------------------------------------------------------
    $env:YAN_OS_BATCH = '1'
    Push-Location $YAN
    try {
        & $py.Exe $AGENT --dry-run
        if ($LASTEXITCODE -ne 0) { throw "agenda_agent.py falhou (exit $LASTEXITCODE)" }
    } finally {
        Pop-Location
    }

    $json = Join-Path $ROOT 'agenda-data.json'
    if (-not (Test-Path $json)) { throw "agenda-data.json nao gerado em $json" }

    # --- 3. assercao de janela ------------------------------------------------
    # O agenda_agent nao tem como saber que o resultado dele vai ao ar. Publicar
    # uma janela inteiramente no passado e exatamente o defeito que esta rotina
    # existe para evitar, entao a checagem fica aqui.
    $ag = Get-Content $json -Raw -Encoding UTF8 | ConvertFrom-Json
    $cult = [Globalization.CultureInfo]::InvariantCulture
    $ini = [datetime]::ParseExact($ag.janela.inicio, 'yyyy-MM-dd', $cult)
    $fim = [datetime]::ParseExact($ag.janela.fim,    'yyyy-MM-dd', $cult)
    $qtd = @($ag.eventos).Count
    Write-Log ("Janela {0:yyyy-MM-dd} -> {1:yyyy-MM-dd} - {2} evento(s)" -f $ini, $fim, $qtd)

    if ($fim -lt (Get-Date).Date) {
        $m = "janela {0:yyyy-MM-dd} a {1:yyyy-MM-dd} termina antes de hoje ({2:yyyy-MM-dd}); " +
             "publicar isso deixaria o site com a semana ja encerrada. Abortado."
        throw ($m -f $ini, $fim, (Get-Date))
    }
    if ($qtd -lt 1) { throw 'agenda sem eventos, abortado.' }

    if ($Simular) {
        Write-Log 'SIMULACAO: guarda, geracao e assercao passaram. Publicacao pulada.'
        exit 0
    }

    # --- 4. publicacao --------------------------------------------------------
    # publicar-com-rollback.ps1 e nao deploy-cloudflare.ps1: o deploy direto nao
    # valida nada depois e nao tem alvo de reversao. Foi assim que producao ficou
    # 10 horas com 8 arquivos em 404 em 19/07/2026, com o wrangler saindo 0.
    & $PUBLICAR
    $codigo = $LASTEXITCODE

    $rel = Get-ChildItem (Join-Path $ROOT 'diagnosticos') -Filter 'publicacao_*.md' -ErrorAction SilentlyContinue |
           Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $relTxt = if ($rel) { $rel.FullName } else { '(relatorio nao encontrado)' }

    if ($codigo -ne 0) {
        throw ("publicar-com-rollback.ps1 saiu $codigo. Pode ter sido build reprovado, " +
               "deploy falho ou rollback executado. Motivo real no relatorio: $relTxt")
    }

    Write-Log "Publicado e validado. Relatorio: $relTxt"
    Write-Log '=== FIM OK ==='
    exit 0
} catch {
    $msg = $_.Exception.Message
    Write-Log "ERRO: $msg"
    if ($Simular) {
        Write-Log 'SIMULACAO: e-mail de alerta nao enviado.'
    } else {
        & $ALERT -Subject "[Szuchmacher] Falha na automacao de agenda" `
                 -Body ("run-agenda-agent.ps1 falhou em $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss').`n`n" +
                        "Erro: $msg`n`nLog: $LOG")
    }
    exit 1
}
