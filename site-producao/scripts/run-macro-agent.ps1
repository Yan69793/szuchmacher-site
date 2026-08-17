# run-macro-agent.ps1, gera macro_data.json e publica com validacao e rollback.
# Usado pelo Task Scheduler (Szuchmacher-MacroAgent).
#
# FALHA-002 (corrigido 2026-08-15): antes usava $ErrorActionPreference = 'Stop',
# que aborta o script antes do exit e faz o Task Scheduler reportar LastResult 0
# com falha real. Agora 'Continue', com o sucesso decidido por $LASTEXITCODE.
# A publicacao passou de deploy-cloudflare.ps1 (sem validacao) para
# publicar-com-rollback.ps1, que valida producao e reverte em caso de falha.
#
# INTERPRETADOR (corrigido 2026-08-17): antes exigia automacao-yan-os\venv, que
# nao existe mais nesta maquina, entao o script morria na primeira checagem e
# nenhuma task o chamava. A task registrada publicava com deploy-all.ps1, que
# nao valida nada. Agora resolve o interpretador por sondagem.
#
# ENCODING: arquivo em ASCII puro, sem BOM, igual ao run-agenda-agent.ps1. O
# BOM que este arquivo carregava existia so por causa de acento e travessao em
# comentario, que o PowerShell 5.1 do Task Scheduler le errado sem ele. Sem
# caractere nao-ASCII, o problema deixa de existir.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

$ROOT     = Split-Path -Parent $PSScriptRoot
$REPO     = Split-Path -Parent $ROOT
$YAN      = Join-Path $REPO 'automacao-yan-os'
$AGENT    = Join-Path $YAN 'agents\macro_agent.py'
$PUBLICAR = Join-Path $PSScriptRoot 'publicar-com-rollback.ps1'
$ALERT    = Join-Path $PSScriptRoot 'send-alert-email.ps1'
$LOGDIR   = Join-Path $YAN 'logs'
$LOG      = Join-Path $LOGDIR ("macro_agent_scheduled_{0:yyyyMMdd}.log" -f (Get-Date))

# --- interpretador -------------------------------------------------------------
# venv-task primeiro: e o unico que roda este agente hoje, e era o que a task
# antiga ja usava direto. O venv historico vem depois, para voltar a valer
# sozinho se alguem reinstalar o Python 3.11 com as dependencias.
$PY_CANDIDATOS = @(
    (Join-Path $YAN 'venv-task\Scripts\python.exe'),
    (Join-Path $YAN 'venv\Scripts\python.exe'),
    (Join-Path $YAN 'venv-py312\Scripts\python.exe')
)

function Resolve-Python {
    # Sondar versao nao basta AQUI. macro_agent.py faz `from config import ...`
    # no topo, e config.py importa dotenv; coletor.py importa requests. Medido
    # em 2026-08-17: venv-py312 e venv-playwright tem Python 3.12 vivo e passam
    # numa sonda de versao, mas nao tem dotenv, entao o agente quebraria em
    # ModuleNotFoundError depois de o script ja ter se declarado pronto. A sonda
    # importa as dependencias reais junto com a versao.
    $ErrorActionPreference = 'Continue'
    $tentados = @()
    foreach ($p in $PY_CANDIDATOS) {
        if (-not (Test-Path $p)) { $tentados += "$p (ausente)"; continue }
        # Sem `| Select-Object -First 1`: com -First 1 o pipeline para na
        # primeira linha e o PowerShell nao atualiza $LASTEXITCODE, entao o
        # candidato seguinte seria julgado pelo exit code do anterior.
        $saida = (& $p -c "import sys, dotenv, requests; sys.stdout.write(sys.version.split()[0])" 2>&1)
        $rc = $LASTEXITCODE
        if ($rc -ne 0) { $tentados += "$p (nao executa ou sem dotenv/requests, exit $rc)"; continue }
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
    throw ("nenhum Python 3.10+ com dotenv e requests encontrado. Testados: " + ($tentados -join ' | '))
}

function Write-Log([string]$Msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Msg
    Write-Host $line
    New-Item -ItemType Directory -Force -Path $LOGDIR | Out-Null
    Add-Content -Path $LOG -Value $line -Encoding UTF8
}

# --- guarda de working tree ---------------------------------------------------
# Portada do run-agenda-agent.ps1 em 2026-08-17. Ate entao esta rotina publicava
# o estado do disco sem checar nada, primeiro via deploy-all.ps1 e depois via
# publicar-com-rollback.ps1. Uma edicao esquecida em site-producao/ na sexta as
# 18:00 iria a producao junto com o macro, sem revisao.
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
# Artefatos que pipelines agendados reescrevem, nao codigo que alguem digitou.
# macro_data.json e a saida DESTA rotina, entao precisa estar isento: uma
# execucao anterior que tenha deixado o arquivo modificado faria a proxima
# abortar, e portao que reprova por operacao normal acaba ignorado. Mesma
# logica vale para agenda-data.json e relatorio_cache.json, das outras duas
# rotinas. Contrapartida assumida: arquivo desses corrompido nao e barrado
# aqui, a rede e o validar-producao.ps1 dentro do publicar-com-rollback.ps1,
# que confere tamanho minimo.
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
# em falha semanal.
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
    Write-Log '=== INICIO macro agent automatizado ==='

    if (-not (Test-Path $AGENT))    { throw "Agent nao encontrado: $AGENT" }
    if (-not (Test-Path $PUBLICAR)) { throw "Publicador nao encontrado: $PUBLICAR" }

    $py = Resolve-Python
    Write-Log ("Python: {0} ({1})" -f $py.Exe, $py.Versao)

    # --- guarda ---------------------------------------------------------------
    $sujos = @(Get-MudancasDeployaveis)
    if ($sujos.Count -gt 0) {
        throw ("working tree sujo em arquivo que vai a producao, publicacao abortada: " +
               ($sujos -join ', ') +
               ". Commite ou reverta antes da proxima execucao.")
    }
    Write-Log 'Working tree: nenhum arquivo deployavel pendente.'

    $env:YAN_OS_BATCH = '1'
    Push-Location $YAN
    & $py.Exe $AGENT --dry-run
    $rcAgent = $LASTEXITCODE
    Pop-Location
    if ($rcAgent -ne 0) { throw "macro_agent.py falhou (exit $rcAgent)" }

    $json = Join-Path $ROOT 'macro_data.json'
    if (-not (Test-Path $json)) { throw "macro_data.json nao gerado em $json" }
    Write-Log "JSON OK: $json"

    & $PUBLICAR
    if ($LASTEXITCODE -ne 0) { throw "publicar-com-rollback.ps1 falhou (exit $LASTEXITCODE)" }

    Write-Log '=== FIM OK ==='
    exit 0
} catch {
    Write-Log "ERRO: $($_.Exception.Message)"
    & $ALERT -Subject "[Szuchmacher] Falha na automacao de macro agent" -Body "run-macro-agent.ps1 falhou em $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss').`n`nErro: $($_.Exception.Message)`n`nLog: $LOG"
    exit 1
} finally {
    if ((Get-Location).Path -eq $YAN) { Pop-Location }
}
