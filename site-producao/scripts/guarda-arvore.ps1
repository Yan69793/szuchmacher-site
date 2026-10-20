# guarda-arvore.ps1 - funcao compartilhada de guarda de working tree.
# Dot-source: . (Join-Path $PSScriptRoot 'guarda-arvore.ps1')
#
# O deploy publica o estado do disco, nao o do ultimo commit. Sem esta guarda,
# qualquer rotina que chame deploy-cloudflare.ps1 (o sync das 19h do
# relatorio-diario-szuchmacher, a agenda, o macro, a geopolitica) publica junto
# edicao nao commitada de outra sessao, sem revisao. Em 15/10/2026 havia nove
# arquivos deployaveis modificados aguardando aprovacao e o sync das 19h teria
# publicado todos.
#
# run-agenda-agent.ps1 e run-macro-agent.ps1 tem copia propria, mais antiga, que
# roda antes da geracao. Esta e a barreira final: todo caminho de publicacao passa
# por deploy-cloudflare.ps1, entao divergencia nas copias so faz a rotina abortar
# mais cedo ou mais tarde, nunca publicar o que esta guarda barra.

$GUARDA_NAO_DEPLOYAVEL = @(
    'site-producao/scripts/',
    'site-producao/docs/',
    'site-producao/diagnosticos/',
    'site-producao/design/',
    'site-producao/multiasset-platform/',
    'site-producao/cloudflare-workers/sz-sites/tests/'
)
$GUARDA_ARTEFATOS_DE_PIPELINE = @(
    'site-producao/agenda-data.json',
    'site-producao/macro_data.json',
    'site-producao/relatorio_cache.json',
    'site-producao/geopolitica-data.json',
    'site-producao/cloudflare-workers/sz-sites/public/sz/agenda-data.json',
    'site-producao/cloudflare-workers/sz-sites/public/sz/macro_data.json',
    'site-producao/cloudflare-workers/sz-sites/public/sz/relatorio_cache.json',
    'site-producao/cloudflare-workers/sz-sites/public/multi/macro_data.json'
)
# Onde um arquivo NOVO (untracked) chega a producao sozinho: os diretorios que o
# build copia por glob e o codigo do Worker, que o wrangler empacota por import.
# Em 15/10/2026 o HEAD importava handlers/internal-deepseek-market.js sem que o
# arquivo estivesse no git, e a guarda sem src/ dava a arvore como limpa.
$GUARDA_COPIADO_POR_GLOB = @(
    'site-producao/assets/img/',
    'site-producao/assets/video/',
    'site-producao/assets/media/',
    'site-producao/cloudflare-workers/sz-sites/src/'
)

function Get-MudancasDeployaveis([string]$Repo) {
    $ErrorActionPreference = 'Continue'
    Push-Location $Repo
    try {
        $linhas = @(git status --porcelain -- 'site-producao/')
        $rc = $LASTEXITCODE
    } finally { Pop-Location }
    if ($rc -ne 0) { throw "git status falhou (exit $rc)" }

    $suspeitos = @()
    foreach ($l in $linhas) {
        if ([string]::IsNullOrWhiteSpace($l) -or $l.Length -lt 4) { continue }
        $estado  = $l.Substring(0, 2)
        $caminho = $l.Substring(3).Trim()
        if ($caminho -match ' -> ') { $caminho = ($caminho -split ' -> ')[-1] }
        $caminho = $caminho.Trim('"').Replace('\', '/')

        if ($GUARDA_ARTEFATOS_DE_PIPELINE -contains $caminho) { continue }

        if ($estado -eq '??') {
            foreach ($p in $GUARDA_COPIADO_POR_GLOB) {
                if ($caminho.StartsWith($p)) { $suspeitos += "$caminho (novo)"; break }
            }
            continue
        }

        if ($caminho -like '*.md') { continue }
        $ignorado = $false
        foreach ($p in $GUARDA_NAO_DEPLOYAVEL) {
            if ($caminho.StartsWith($p)) { $ignorado = $true; break }
        }
        if ($ignorado) { continue }
        $suspeitos += $caminho
    }
    return $suspeitos
}
