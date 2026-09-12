# validar-producao.ps1 — porta de qualidade de szuchmacher.com.br + multi-assets.com
#
# Uso:
#   .\scripts\validar-producao.ps1
#   .\scripts\validar-producao.ps1 -Json          # saida estruturada, para a rotina
#
# Sai com codigo 1 se qualquer verificacao falhar. E o gate que a rotina de
# domingo usa para decidir entre manter o deploy e reverter.
#
# Verifica CONTEUDO, nao so status. O incidente de 19/07/2026 teve todas as
# paginas em 200 enquanto 8 assets respondiam 404: checagem de status sozinha
# nao teria pegado nada.
#
# Contem e NaoContem sao comparacao LITERAL, nao regex. Regex com barra
# invertida vira uma fonte de falso positivo silencioso quando o padrao
# atravessa camadas de shell, e um check que sempre passa e pior do que nao ter
# check. Pela mesma razao, uma checagem aqui pode ficar sensivel a formatacao:
# quebrar ruidosamente numa reformatacao e preferivel a passar em silencio.

param(
    [switch]$Json,
    [int]$TimeoutSeg = 30
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http

$SZ    = 'https://szuchmacher.com.br'
$MULTI = 'https://multi-assets.com'

# Url, Status esperado, Contem (substring literal), MinBytes, Timeout, Rotulo
$checks = @(
    # --- paginas do site institucional ---
    @{ Url = "$SZ/";                 Status = 200; Contem = 'Szuchmacher' }
    @{ Url = "$SZ/relatorios.html";  Status = 200 }
    @{ Url = "$SZ/honorarios.html";  Status = 200 }
    @{ Url = "$SZ/assinatura.html";  Status = 200; Contem = 'data-stripe-carta' }
    @{ Url = "$SZ/radar-roic.html";  Status = 301; Rotulo = 'radar-roic -> assinatura' }
    @{ Url = "$SZ/privacidade.html"; Status = 200 }

    # --- os 8 assets que sumiram no incidente de 19/07/2026 ---
    @{ Url = "$SZ/sitemap.xml";           Status = 200; Contem = '<loc>https://szuchmacher.com.br/</loc>' }
    @{ Url = "$SZ/og-cover.jpg";          Status = 200; MinBytes = 10000 }
    @{ Url = "$SZ/logo.png";              Status = 200; MinBytes = 10000 }
    @{ Url = "$SZ/macro_data.json";       Status = 200; MinBytes = 500 }
    @{ Url = "$SZ/relatorio_cache.json";  Status = @(200, 404); Rotulo = 'relatorio_cache.json (cache regeneravel)' }
    @{ Url = "$SZ/agenda-data.json";      Status = 200; MinBytes = 100 }

    # --- config: a guarda do checkout de teste nao pode se perder num rollback ---
    @{ Url = "$SZ/assets/sz-config.js"; Status = 200; Contem = 'test_/.test(v)) return false';
       Rotulo = 'sz-config.js: guarda de checkout de teste' }
    @{ Url = "$SZ/assets/sz-design.css"; Status = 200; Contem = '--navy' }

    # --- endpoints ---
    @{ Url = "$SZ/prices.php";        Status = 200; Contem = '"ok"' }
    @{ Url = "$SZ/market-data.php";   Status = 200; Contem = '"ok"' }
    # Radar Geopolitico (2026-09-07): pagina, endpoint e edicao semanal.
    # A home deve carregar o painel (script module referenciado); o endpoint
    # precisa devolver o JSON de edicao com schema v1.
    @{ Url = "$SZ/geopolitica.html";       Status = 200; Contem = 'geoPage' }
    @{ Url = "$SZ/assets/geopolitica.php"; Status = 200; Contem = '"schema_version"'; Timeout = 30 }
    @{ Url = "$SZ/geopolitica-data.json";  Status = 200; MinBytes = 500 }
    @{ Url = "$SZ/";                       Status = 200; Contem = 'radarGeopolitico' }
    # Fontes do market-data morrendo em silencio (incidente NTNB11: brapi 401
    # por meses sem alerta nenhum). A ordem do array stale e deterministica no
    # handler (ibov, sp500, wti, treasury10y, ntnb11), entao o literal casa
    # quando o ativo e o primeiro da lista. ntnb11 entrou na checagem em
    # 15/08/2026, depois que a fonte IB5M11 (IMA-B 5+) ja estava em producao,
    # regra do projeto.
    @{ Url = "$SZ/market-data.php"; Status = 200;
       NaoContem = @('"stale":["ibov', '"stale":["sp500', '"stale":["wti', '"stale":["treasury10y', '"stale":["ntnb11');
       Rotulo = 'market-data.php: fontes vivas (ibov/sp500/wti/treasury10y/ntnb11 fora do stale)' }
    # handler portado na auditoria de 15/08/2026 (antes 404 mudo desde 17/06);
    # checagem so entrou depois que a rota ja estava em producao (regra do projeto)
    @{ Url = "$SZ/relatorio-prices.php"; Status = 200; Contem = '"ok"';
       Rotulo = 'relatorio-prices.php: contrato com a pagina de relatorios' }
    # cascata de LLM a frio ja levou 32 s; 30 s de timeout dava falso negativo
    @{ Url = "$SZ/macro_api.php";     Status = 200; Timeout = 90 }
    @{ Url = "$SZ/assets/macro.php";  Status = 200 }
    @{ Url = "$SZ/assets/agenda.php"; Status = 200 }

    # Arquivos sensiveis no dominio sz. O gate nunca checou esses quatro, quem
    # fazia isso era o Bloco F da skill de auditoria, a mao. Mesma lacuna que o
    # lado multi tinha, e o custo de fechar e o mesmo. Os quatro respondem 404
    # hoje, conferido a mao em 11/09/2026, entao a checagem entra com o
    # comportamento ja em producao (regra do projeto).
    @{ Url = "$SZ/config.php";     Status = 404; Rotulo = 'sz: config.php nao servido' }
    @{ Url = "$SZ/.env";           Status = 404; Rotulo = 'sz: .env nao servido' }
    @{ Url = "$SZ/wrangler.toml";  Status = 404; Rotulo = 'sz: wrangler.toml nao servido' }
    @{ Url = "$SZ/wrangler.jsonc"; Status = 404; Rotulo = 'sz: wrangler.jsonc nao servido' }

    # --- redirects que precisam continuar redirecionando ---
    @{ Url = "$SZ/ebook";           Status = 301; Rotulo = 'ebook -> home' }
    @{ Url = "$SZ/multiasset.html"; Status = 301; Rotulo = 'multiasset.html -> multi-assets.com' }

    # --- plataforma ---
    @{ Url = "$MULTI/";            Status = 200; Contem = 'szuchmacher.com.br';
       Rotulo = 'multi home, com link institucional' }
    @{ Url = "$MULTI/consultoria"; Status = 200; Contem = 'szuchmacher.com.br';
       Rotulo = 'consultoria, com link institucional' }
    # multi-assets.com coleta e-mail no popup do simulador. Ate 26/07/2026 o
    # dominio respondia 404 aqui: coleta sem aviso ao titular. O popup linka
    # /privacidade.html, entao esta pagina nao pode sumir de novo em silencio.
    @{ Url = "$MULTI/privacidade.html"; Status = 200; Contem = 'Privacidade';
       Rotulo = 'multi: politica de privacidade (linkada no popup de lead)' }
    # Premissa de retorno da projecao nao pode voltar a vir do payload macro.
    # Em 27/07/2026 o campo `ativos[x][perfil].taxa` do /macro_api.php, que e
    # faixa de alocacao ("8-12% do patrimonio"), era parseado como taxa anual e
    # o segundo numero da faixa entrava com o hifen: ouro projetava -8% / -12% /
    # -15% a.a., com o cenario otimista pior que o pessimista, e a carteira
    # aparecia abaixo do CDI e da NTN-B em qualquer combinacao de perfil e
    # cenario. Como a projecao e calculada no cliente, o gate nao consegue
    # recalcula-la por HTTP: checa a ausencia do mecanismo que a corrompeu.
    #
    # O parentese e obrigatorio na ancora. Sem ele a checagem reprova a propria
    # producao correta, porque os comentarios que documentam a remocao citam os
    # tres nomes. Com ele, so casa definicao ou chamada. Testado nos dois
    # sentidos contra o HTML servido: as tres ausentes, e `desenharBenchmark(`
    # presente como controle de que a busca com parentese funciona.
    # O mecanismo do app saiu do HTML para assets/multi-app-2.js na Fase B do
    # CSP, e as tres ancoras acompanharam: e o asset servido que precisa nao
    # ter o parser de taxa do payload, e a assinatura e a fonte unica abaixo.
    @{ Url = "$MULTI/assets/multi-app-2.js"; Status = 200;
       NaoContem = @('parseTaxaMacro(', 'syncTaxasCenarioFromAtivos(', 'syncSimConfigsFromAtivos(');
       Rotulo = 'multi: premissa de retorno nao vem do payload macro' }
    # Assinatura direta do mesmo bug, independente do mecanismo: no cenario base
    # o ouro tem que ser positivo. Tolera revisao legitima da premissa (0.093
    # para 0.10 continua passando) e reprova qualquer valor negativo.
    #
    # A ancora era 'base:       { ouro: 0.', do literal window.taxasCenario. Esse
    # literal deixou de existir em 27/07/2026: taxasCenario passou a ser derivado
    # de simConfigs por rebuildTaxasCenario(), para o card do simulador e a
    # projecao da carteira pararem de exibir retornos diferentes para o mesmo
    # ativo. A premissa de ouro agora mora na linha do simConfigs, e a ancora
    # acompanhou. Inclui `pess: 0.04` porque e o que torna a busca literal unica
    # da linha do ouro; revisao da premissa pessimista exige atualizar aqui.
    @{ Url = "$MULTI/assets/multi-app-2.js"; Status = 200; Contem = "'g-prazo', pess: 0.04,  base: 0.";
       Rotulo = 'multi: cenario base com premissa de ouro positiva' }
    # A fonte unica em si. Sem isso, uma regressao que reintroduza um taxasCenario
    # mantido a mao passa pelas duas checagens acima e volta a divergir do card.
    @{ Url = "$MULTI/assets/multi-app-2.js"; Status = 200; Contem = 'function rebuildTaxasCenario(';
       Rotulo = 'multi: taxasCenario derivado de simConfigs (fonte unica)' }

    @{ Url = "$MULTI/sitemap.xml";                      Status = 200; Contem = 'multi-assets.com';
       Rotulo = 'multi: sitemap (criado 2026-08-09, antes 404)' }
    @{ Url = "$MULTI/og-cover.jpg";                     Status = 200; MinBytes = 10000 }
    @{ Url = "$MULTI/prices.php";                       Status = 200; Contem = '"ok"' }
    @{ Url = "$MULTI/assets/video/demo-multiasset.mp4"; Status = 200; MinBytes = 100000 }
    @{ Url = "$MULTI/assets/sz-config.js";              Status = 200 }

    # Arquivos sensiveis no dominio multi. O gate checava esses quatro so no
    # szuchmacher desde sempre, e nenhum script da rotina olhava o multi, entao
    # uma regressao que passasse a servir config.php ou .env ali ficaria
    # invisivel. A auditoria de 11/09/2026 conferiu a mao que os quatro
    # respondem 404, e a checagem entra agora, com o comportamento ja em
    # producao (regra do projeto). Continua sem checar corpo, o discriminador
    # aqui e o status.
    @{ Url = "$MULTI/config.php";     Status = 404; Rotulo = 'multi: config.php nao servido' }
    @{ Url = "$MULTI/.env";           Status = 404; Rotulo = 'multi: .env nao servido' }
    @{ Url = "$MULTI/wrangler.toml";  Status = 404; Rotulo = 'multi: wrangler.toml nao servido' }
    @{ Url = "$MULTI/wrangler.jsonc"; Status = 404; Rotulo = 'multi: wrangler.jsonc nao servido' }
)

# HttpClient em vez de Invoke-WebRequest: o cmdlet lanca
# "Operation is not valid due to the current state of the object" em 3xx mesmo
# com -MaximumRedirection 0, o que tornava impossivel validar redirect COMO
# redirect. Aqui AllowAutoRedirect = false devolve o 301 como resposta normal.
$script:Clients = @{}
function Get-Client([int]$Seg) {
    if (-not $script:Clients.ContainsKey($Seg)) {
        $h = [System.Net.Http.HttpClientHandler]::new()
        $h.AllowAutoRedirect = $false
        $cli = [System.Net.Http.HttpClient]::new($h)
        $cli.Timeout = [TimeSpan]::FromSeconds($Seg)
        $script:Clients[$Seg] = $cli
    }
    return $script:Clients[$Seg]
}

function Test-Url([hashtable]$c) {
    $rotulo = if ($c.ContainsKey('Rotulo')) { $c.Rotulo } else { ($c.Url -replace '^https://', '') }
    $tmo    = if ($c.ContainsKey('Timeout')) { $c.Timeout } else { $TimeoutSeg }
    $falha  = { param($m) @{ Rotulo = $rotulo; Url = $c.Url; Ok = $false; Motivo = $m } }

    try {
        $resp = (Get-Client $tmo).GetAsync($c.Url).GetAwaiter().GetResult()
    } catch {
        if ($_.Exception.InnerException -and $_.Exception.InnerException.Message) { $msg = $_.Exception.InnerException.Message } else { $msg = $_.Exception.Message }
        return & $falha "erro de rede: $msg"
    }

    try {
        $status = [int]$resp.StatusCode
        $esperados = if ($c.Status -is [array]) { $c.Status } else { @($c.Status) }
        if ($status -notin $esperados) { return & $falha "HTTP $status, esperado $($esperados -join ' ou ')" }

        if ($c.ContainsKey('MinBytes') -or $c.ContainsKey('Contem') -or $c.ContainsKey('NaoContem')) {
            $buf = $resp.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()

            if ($c.ContainsKey('MinBytes') -and $buf.Length -lt $c.MinBytes) {
                return & $falha "$($buf.Length) bytes, minimo $($c.MinBytes)"
            }
            if ($c.ContainsKey('Contem') -or $c.ContainsKey('NaoContem')) {
                $texto = [System.Text.Encoding]::UTF8.GetString($buf)
                if ($c.ContainsKey('Contem') -and -not $texto.Contains($c.Contem)) {
                    return & $falha "nao contem: $($c.Contem)"
                }
                if ($c.ContainsKey('NaoContem')) {
                    foreach ($proibido in @($c.NaoContem)) {
                        if ($texto.Contains($proibido)) { return & $falha "contem o que nao devia: $proibido" }
                    }
                }
            }
        }
        return @{ Rotulo = $rotulo; Url = $c.Url; Ok = $true; Motivo = "HTTP $status" }
    } finally {
        $resp.Dispose()
    }
}

$resultados = @()
foreach ($c in $checks) { $resultados += Test-Url $c }
$falhas = @($resultados | Where-Object { -not $_.Ok })

if ($Json) {
    [pscustomobject]@{
        total   = $resultados.Count
        falhas  = $falhas.Count
        ok      = ($falhas.Count -eq 0)
        detalhe = $resultados
    } | ConvertTo-Json -Depth 4
} else {
    Write-Host "`n=== VALIDACAO DE PRODUCAO ===" -ForegroundColor Cyan
    foreach ($r in $resultados) {
        if ($r.Ok) { Write-Host ("  OK     {0}" -f $r.Rotulo) -ForegroundColor DarkGray }
        else       { Write-Host ("  FALHA  {0}: {1}" -f $r.Rotulo, $r.Motivo) -ForegroundColor Red }
    }
    Write-Host ""
    if ($falhas.Count -eq 0) {
        Write-Host "$($resultados.Count) verificacoes, 0 falha." -ForegroundColor Green
    } else {
        Write-Host "$($resultados.Count) verificacoes, $($falhas.Count) falha(s)." -ForegroundColor Red
    }
}

if ($falhas.Count -gt 0) { exit 1 }
exit 0
