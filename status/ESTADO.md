# Estado do projeto — Site szuchmacher.com.br

Última atualização: 2026-09-11 (agentes: Cline, Claude e Codex)

Leia este arquivo antes de começar qualquer trabalho, seja qual for o agente.
Atualize a data e os itens abertos ao fechar uma sessão que mudou o estado.
Não duplique conteúdo do CLAUDE.md nem do README.md: aqui fica só o ponto de
partida com os ponteiros.

## O que é

Site institucional de advisory patrimonial independente de Yan Szuchmacher,
servido em https://szuchmacher.com.br e https://multi-assets.com. Hospedagem
primária em Cloudflare Workers (`sz-sites`), com HostGator/FTP mantido apenas
para rollback. O diretório abriga também dois projetos com vida própria:
`automacao-yan-os` (pipeline Python) e `atualizador-relatorios` (Node.js).

## Estado em 2026-08-17

Fase 2 no ar desde 15/08/2026 (Worker `f08d6f46`, gate 34/34; relatório em
`site-producao/diagnosticos/FASE2-2026-08-15.md`). Migração para Cloudflare
Workers confirmada em 17/06/2026; deploy primário é
`site-producao/scripts/deploy-cloudflare.ps1`. A task local
`Szuchmacher-MacroCron` foi desabilitada em 15/08/2026.

A fonte detalhada de estado é `site-producao/CLAUDE.md` (identidade, mapa de
arquivos, design system, protocolo obrigatório, estado de produção verificado
em 15/08/2026 e pendências). Pendências abertas, resumidas em uma linha cada,
com o detalhe completo lá:

- Cron nativo disparava domingo por causa da numeração Quartz de dia da semana
  na Cloudflare; corrigido para `0 3 * * MON` em 24/08.
- Monitorar o disparo de 31/08 comparando `macro-cron-last.ts` em `/health`
  com a data esperada.
- ~~`agenda-cron.php` do cPanel ainda não desligado.~~ Fechado em 01/09, a
  verificação direta no painel mostrou que esse cron não existe.
- Itens do §Q do PRE-DEPLOY-2026-08-15: F5 cache-busting fechado em 31/08
  (`488b830`); CSP sem unsafe-inline com a Fase A sz e a Fase B multi
  concluídas em 31/08.

## Como verificar

```powershell
cd site-producao; .\scripts\validar-producao.ps1
```

49 verificações em szuchmacher.com.br + multi-assets.com (páginas, assets,
endpoints, redirects). Checagem de conteúdo, não só status HTTP. A contagem
muda quando checagem nova entra, use a da saída real do script.

## Onde está o resto

- `CLAUDE.md` (raiz): deploy e portão de verificação.
- `README.md`: mapa de pastas, origem dos arquivos de produção, deploy,
  setup, segurança.
- `site-producao/CLAUDE.md`: fonte detalhada de estado, mapa de arquivos,
  design system, protocolo obrigatório, pendências.
- Pastas principais: `site-producao/` (fonte única de deploy), `automacao-yan-os/`,
  `atualizador-relatorios/`, `ferramentas-multiasset/`, `docs/` (inclui
  `docs/controle-remoto-claude-code.md`), `site-producao/diagnosticos/`
  (registros de diagnóstico).
- Projeto externo com dependência cruzada: `E:\Diretorio\Claude\relatorio-diario-szuchmacher`
  (gera o `relatorio_cache.json` consumido pelo widget de fechamento).
- Projeto externo que vigia as tasks daqui: `E:\Diretorio\Claude\Monitoramento de Credito`.
  `scripts/monitor-tasks.ps1` classifica a saúde das tasks `Szuchmacher-*` e
  `scripts/run_claude_routine.ps1` é o runner da `Szuchmacher-AgendaMacro-Claude`.

## Itens abertos

- ~~**Cron nativo, causa raiz corrigida em 24/08, prova real pendente.**~~
  **Fechado em 31/08 com prova.** A Cloudflare numera dia da semana como Quartz
  (`1` = domingo), então `0 3 * * 1` agendava domingo. Schedule trocado para
  `0 3 * * MON` e publicado (versão `5df713af`, gate 34/34). O disparo nativo
  aconteceu sozinho nesta segunda: `/health` traz `macro_cron_last` com
  `ts=1788145255`, `cron: "0 3 * * MON"`, `ok: true`, `status: 200`,
  `generated_at: "31/08/2026, 00:01 BRT"` e `ms: 39888`. Corroborado pelo
  `check-macro-cron_20260831.log` do watchdog das 09:00, que confirmou o disparo
  nativo sem precisar acionar a reserva HTTP, e pela API de schedules. Era o item
  aberto mais antigo.
- ~~**Macro, cache esvaziado a cada deploy e reposição automática que não
  funciona.**~~ **Fechado em 31/08 à noite, deploy `2065188f`, gate 34/34.** Os
  três defeitos foram corrigidos no commit `e757bac`. Carimbo de rate em duas
  fases, 60 s na tentativa em curso e 3600 s só depois do `writeCache`.
  `ctx.waitUntil` na regeneração implícita, com o visitante recebendo o fallback
  estático na hora em vez de esperar os ~40 s. E `macro-api` fora do conjunto
  padrão do invalidador, agora exigindo `-IncludeMacro`.

  Provado pelo próprio cenário que motivou o fix. O deploy das 17:32 rodou com a
  janela de rate de 17:00 ainda ativa, o `-RefreshMacro` tomou 429 nas três
  tentativas, e mesmo assim `/health` seguiu em
  `macro_cache: "31/08/2026, 17:00 BRT"` em vez de `empty`. O público responde em
  85 ms do KV real, sem o campo `note`. Com o código antigo essa mesma sequência
  deixava o cache vazio até o cron da segunda seguinte.

  Suíte do Worker foi de 70 para 75 testes com os cinco casos de regressão.
- ~~`agenda-cron.php` do cPanel pendente de desligamento, com P3-15 (calendários
  2026 hardcoded) como sub-item.~~ **Fechados os dois em 01/09**, por verificação
  direta no painel. O cron não existe. Ver a seção de 01/09.
- ~~CSP sem `unsafe-inline` no multi (Fase B).~~ **Fechado em 31/08.** Os 136
  handlers e 257 estilos inline do `multiasset-app.html` foram externalizados
  e o CSP saiu estrito nos dois domínios. Ver "Fase B do CSP concluída (31/08)"
  abaixo.
- **CSP fail-open para host desconhecido.** Fechado em 31/08, e com a Fase B o
  allowlist `MULTI_HOSTS` foi removido de vez: `buildCSP` em
  `src/utils/headers.js` emite agora CSP idêntico, estrito, para qualquer host,
  sem branch por host. Host futuro não mapeado cai no mesmo estrito, não herda
  política fraca por omissão. Teste no `headers.test.mjs` cobre o host
  desconhecido. Publicado com a Fase B, gate 34/34.
- ~~P3 de 30/08, GET ou HEAD com `Content-Length: 0` em rota HTML devolve 500.~~
  **Fechado em 30/08 à noite, deploy `d9a155b2`, gate 34/34.** `fetchAsset`
  reconstroi o request com `{ method, headers }`, sem repassar body. Ver
  "Fechamento da noite de 30/08" abaixo.
- ~~P3 de 30/08, `/api/ntnb-scenarios` responde `defaults` todo fim de semana.~~
  **Fechado em 30/08 à noite, deploy `d9a155b2`, gate 34/34.** Staleness por
  dias úteis no lugar de 48 h corridas. Ver "Fechamento da noite de 30/08" abaixo.
- **Plano de cancelamento da HostGator, retomar em 01/09.** Mapeado em 31/08:
  o Worker `sz-sites` serve 100% de `env.ASSETS` sem nenhum fetch ao HostGator,
  então o upload FTP da rotina remota `szuchmacher-domingo` (`deploy.sh`, 8
  arquivos) é inerte para o site. Para encerrar a conta: preparar o prompt novo
  da rotina sem FTP (publicar via Worker), pausar a rotina no painel
  (`Claude_Code_Remote` indisponível nesta sessão), e aí cancelar o hosting.
  Cobertura de dados local já existe, `Szuchmacher-AgendaAgent` ativa publica
  `agenda-data.json` e `macro_data.json` no `public/` do Worker.
  **Atualizado em 01/09.** O passo "desligar o `agenda-cron.php`" saiu do caminho
  crítico, esse cron não existe no painel. No lugar dele entrou um passo maior e
  ainda não feito, concluir a inspeção manual das 2 tarefas `focus_cron.php`
  antes de cancelar a conta.
- **Item 3 — crons HostGator, FECHADO.** As 3 `macro_cron.php` legadas foram
  classificadas como **SUBSTITUÍDAS**. As 2 `focus_cron.php` também foram
  classificadas como **SUBSTITUÍDAS**. `focus_cron.php` apenas consultava
  Focus/BCB e gravava `focus_data.json`; nenhum consumidor atual de
  `focus_data.json` foi encontrado. A funcionalidade equivalente existe na
  infraestrutura atual. Não há dependência funcional da HostGator identificada
  no projeto. Nenhum item foi alterado na HostGator.
- **Item 4 — Tracker regulatório ANEEL/Enel, FECHADO.** Curadoria factual
  atualizada em `2026-09-08`, com fonte oficial ANEEL para a decisão de
  `24/08/2026` e decisões oficiais de `24/08/2026` e `11/08/2026` nas fontes
  primárias. `status` permanece `decisao_pendente`, prazo permanece `03/09/2026`
  e impacto regulatório não foi alterado. Commit `f2153dd`. Deploy explícito
  confirmado na versão `723b5605-ad1d-44c7-85b8-3078b8de8ddc`. Suíte local do
  Worker passou `121/121`; gate passou `38 verificações, 0 falha`. Endpoint
  `/assets/regulatorio.php` respondeu `200` e devolveu o caso
  `aneel-caducidade-enel-sp-2026` com `atualizado_em=2026-09-08` e fonte oficial.
  `dados-privados/regulatorio-interno.json` não foi alterado.
- Detalhe de todos os itens: `site-producao/CLAUDE.md`, seção "Pendências abertas".

## Estado em 2026-08-19

Deploy `7b9c4a21` (commit `92d3722`) atualizou o app multi-assets.com: as
premissas macro e os fallbacks do panorama saíram de jun/2026 para ago/2026
(COPOM 05/08 com Selic 14,00%, Focus 17/08 com IPCA 5,02% em 2026 e 4,24% em
2027, FOMC 29/07 em hold com 3 dissidências, NTN-B IPCA+7,5% mantido, links
de fonte no bloco Premissas). Gate `validar-producao.ps1` 34/34 e teste em
produção confirmando o texto novo em https://multi-assets.com/. O item
`hero-*` legado foi resolvido em 2026-08-19 (decisão do operador), e a
one-shot de 24/08 foi substituída em 22/08 pelo watchdog semanal
`Szuchmacher-MacroCronWatchdog` (segunda 09:00, `check-macro-cron.ps1`).

## Estado em 2026-08-30

Auditoria do padrão "silent-green", automação que falha e mesmo assim aparece
como verde. Diagnóstico e correção em dois repositórios, sem deploy e sem
alteração de conteúdo de produção. Gate `validar-producao.ps1` 34/34 antes e
depois.

O que estava quebrado de fato, em `Monitoramento de Credito`, commit `a6ff4ac`
em `scripts/monitor-tasks.ps1`. A checagem de staleness tinha sido escrita em
02/08 para pegar um caso específico, task que não rodou e ficou com
`LastTaskResult=0` congelado da execução anterior. Ela ficou posicionada depois
do pulo de códigos benignos, que faz `continue` para `0` e `267009` e existe
desde 16/07, então a condição nasceu inalcançável e o bloco era código morto
justamente para o caso que justificava escrevê-lo. A correção é reordenação
(`ORDEM1`), provada nas duas pontas com as instruções literais de cada versão
sobre a mesma entrada, o caso ruim virou warning e o caso bom seguiu verde.
Junto entrou `WEEKLY1`, mapa de cadência semanal para `Szuchmacher-AgendaAgent`,
`Szuchmacher-MacroAgent` e `Szuchmacher-AgendaMacro-Claude`, que não tinham
cobertura nenhuma de staleness porque o mapa antigo só listava tasks diárias do
VIXRadar. Isso é preventivo, a auditoria não achou nenhuma ocorrência real.

No Site, commit `c121ac6`, quatro arquivos de rotina e dois de guarda.
`send-alert-email.ps1` passou a devolver `$true` quando o e-mail sai e `$false`
em config ausente, credencial faltando ou erro de SMTP, mantendo o contrato
fail-soft de nunca lançar. Antes ele só reportava por `Write-Host`, que se perde
porque as tasks rodam com `-WindowStyle Hidden`, então credencial SMTP morta não
deixava rastro em log nenhum. Os quatro pontos de chamada agora registram o
resultado, em `run-agenda-agent.ps1`, `run-macro-agent.ps1`, `run-macro-cron.ps1`
e no helper `Send-Alerta` do `check-macro-cron.ps1`. O `test-scripts.ps1` ganhou
`check-macro-cron.ps1` nas listas de parse e de guarda FALHA-002, que é chamado
direto pelo Task Scheduler e estava de fora.

Uma coisa ficou intocada de propósito, a reclassificação `COTA1` do `monitor-tasks.ps1`,
que rebaixa para warning a falha do `Szuchmacher-PreflightAnthropic` quando o
log mostra que ele detectou e alertou. O raciocínio dela está correto para saúde
de task. O que falta é uma checagem separada de resultado de negócio, do tipo o
Fechamento de hoje saiu, que é pergunta diferente de a task terminou bem.

Achado operacional que não estava registrado em lugar nenhum. A
`Szuchmacher-AgendaMacro-Claude` falhou em 14/08 e 21/08 com `exit 1`, e nas duas
vezes a causa foi limite semanal da assinatura Claude, não OAuth nem credencial.
Ela roda sexta 07:07, horário em que a cota costumava estar estourada. Em 28/08
rodou com resultado 0. Vale observar 04/09. A rotina não publica sozinha, o Passo
6 da SKILL exige aprovação humana, então o impacto em produção é nulo, o que se
perde é o relatório.

Fechado nesta sessão o item de drift de deploy não commitado. `cv.html`, os dois
PDFs do CV, a entrada no `build-cloudflare-public.ps1` e o
`register-macro-watchdog.ps1` estão todos versionados, e `site-producao/scripts/`
está limpo no working tree.

Verificação colada na sessão, `test-scripts.ps1` sob `powershell.exe` 5.1 com 10
arquivos no parse e 4 na guarda de EAP, `lint-encoding.ps1` do outro repo com 76
`.ps1` e 0 risco, e 16 casos do mapa semanal incluindo fronteira de um minuto
antes e depois da ocorrência prevista. Os dois caminhos de falha do
`send-alert-email.ps1` foram exercitados em cópia isolada. O caminho de sucesso
não foi executado porque enviaria e-mail de verdade.

Cuidado para a próxima sessão, o relógio desta máquina saltou de 27/08 para 30/08
no meio do trabalho, e uma consulta `Get-ScheduledTask` devolveu um retrato
obsoleto de oito dias antes. Conferir data e reconsultar antes de concluir
qualquer coisa a partir de `LastRunTime`.

### Auditoria completa da tarde de 30/08

Rodada `/szuchmacher-audit` nos seis blocos, sem deploy, sem KV invalidado e sem
edição de produção. Gate 34/34. Nenhum P0, P1 ou P2. Relatório em
`site-producao/diagnosticos/DIAGNOSTICO-2026-08-30.md`, com o raw em
`audit-http-20260830.json` e as screenshots na mesma pasta. Esses arquivos ficam
só em disco, `site-producao/diagnosticos/` está no `.gitignore` desde sempre e
nenhum diagnóstico anterior foi versionado, por isso o registro no git é esta
seção.

A rotina de domingo publicou às 08:01 a janela 31/08 a 04/09 com 8 eventos,
versão `8e32dbee`, e o macro foi regenerado às 08:02 na esteira dessa publicação.
Isso prova cascata LLM e créditos OpenRouter vivos sem gastar refresh forçado. O
Playwright voltou ao kit, o Chromium que faltava desde 22/08 está instalado, e os
seis viewports saíram limpos, zero pageerror, zero http_errors, zero overlap e
sem scroll horizontal em 320. O overflow 320 do MultiAsset não reproduziu.

O carimbo `macro_cron_last` em `/health` segue o de 23/08 com a expressão antiga,
exatamente o previsto enquanto o disparo novo não acontece. O `wrangler.jsonc` no
disco e commitado tem `0 3 * * MON`, e o deploy das 08:01 republicou a partir
desse repo, então o schedule vivo é o corrigido. A prova real continua sendo
segunda 31/08 depois das 03:00 UTC, com o watchdog das 09:00 de reserva.

Os dois achados novos entraram em Itens abertos, os dois P3. O do `Content-Length`
é regressão parcial do bug de HEAD fechado em 18/07 e apareceu porque a própria
coleta de headers da auditoria tropeçou nele, o `Invoke-WebRequest -Method Head`
manda o header e o curl não. Nenhum script do projeto usa HEAD, então nada
operacional quebra hoje.

### Fechamento da noite de 30/08

Os dois P3 de Itens abertos e um terceiro achado foram corrigidos e publicados
num deploy só, versão `d9a155b2`, gate 34/34, suíte do Worker 56 -> 64 testes.
Commit `61e9ca4`.

- **CORS por substring no macro-api** (achado desta sessão, não estava nos
  docs). `origin.includes('multi-assets.com')` deixava passar
  `https://multi-assets.com.evil.io` e ecoava o origin de volta no
  `Access-Control-Allow-Origin`, liberando leitura cross-origin da API.
  Trocado por allowlist exata dos 4 hosts do SITE_MAP. Verificado em produção:
  origin malicioso cai no fallback fixo, o legítimo ecoa.
- **GET/HEAD com `Content-Length: 0`** (P3). `fetchAsset` reconstroi o request
  com `{ method, headers }`, sem repassar body. HEAD em rota HTML responde 200.
- **ntnb-scenarios no fim de semana** (P3). Staleness por dias úteis no lugar
  de 48 h corridas. Verificado num domingo 23:43 BRT, `source: yahoo`,
  `stale: false`.
- **ESTADO.md duplicado de `site-producao/status/` removido.** O arquivo
  (43 linhas, 24/08) estava stale e duplicava o canônico da raiz. Apagado e
  o `site-producao/CLAUDE.md` repontado para `../status/ESTADO.md`. Fonte
  única de estado continua sendo este arquivo, na raiz.

### Fechamentos da madrugada de 31/08

Dois itens do §Q fechados, cada um num deploy próprio, gate 34/34 em ambos.

- **CSP sem `unsafe-eval`**, commit `0435580`, deploy `64bbc562`. Removido
  `unsafe-eval` de `script-src` em `cloudflare-workers/sz-sites/src/utils/headers.js`.
  Antes de mudar, confirmei por `rg` que não há `eval` nem `new Function` no
  JS público (só `JSON.parse`, que não é eval). Novo teste em
  `tests/headers.test.mjs` cobre o CSP dos dois domínios; suíte do Worker
  passou de 64 para 67. Verificado em produção via curl nos dois hosts:
  `script-src` sem `unsafe-eval`, gate 34/34.
- **F5 cache-busting automático**, commit `488b830`, deploy `2851bcaa`.
  `build-cloudflare-public.ps1` ganhou `Add-VersionStamps`, que reescreve no
  HTML copiado as referências `/assets/*.css|js` para `/assets/*.css?v=<hash8>`
  (primeiros 8 hex do SHA256 do próprio asset em `public/`). URL muda quando
  o asset muda, fica estável quando não muda, então o cache é quebrado só
  quando precisa. A `fetchAsset` do Worker preserva query string e resolve por
  pathname, então o `?v=` não quebra rota. Se o HTML referencia asset que não
  existe em `public/`, o build falha em vez de publicar 404. Verificado em
  produção: `sz-design.css?v=0D2D1EB5` no sz e `sz-config.js?v=F28640FD` no
  multi, asset com query responde 200, gate 34/34. As checagens do
  `validar-producao.ps1` usam URL limpa (sem `?v=`), por isso continuam válidas.

### Fase A do CSP concluída (31/08)

- **CSP sem `unsafe-inline` nas páginas sz.** Todo script/style inline das 8
  páginas sz externalizado para `assets/sz-*.css` e `assets/sz-*-N.js`,
  atributos `style="..."` convertidos em classes utilitárias em
  `assets/sz-utilities.css`, e o toast do `sz-config.js` migrado de
  `style.cssText` para atribuição CSSOM (que o CSP não bloqueia). O Worker
  (`src/utils/headers.js`) emite agora CSP por host: sz sem `unsafe-inline`
  em `script-src`/`style-src`, multi mantendo (Fase B). Quatro desvios de
  fidelidade de renderização (utilitária perdendo para seletor de container)
  corrigidos com `!important` nas 5 utilitárias, replicando a precedência do
  inline original (1,0,0,0) que a classe herdou. Suíte do Worker 68 -> 69,
  build verde, greps de CSP/XSS refeitos.
- **Publicado em 31/08 01:18 BRT** via `publicar-com-rollback.ps1`, Worker
  `0ea1fbcf-8905-4922-a65f-954f4b55cde2`, gate 34/34. Verificado em produção:
  CSP do sz e www sz sem `unsafe-inline` (www redireciona 301 para o apex),
  multi e www multi mantendo `unsafe-inline`; assets novos respondem 200. O
  JSON-LD (`application/ld+json`) nas 3 páginas não é bloqueado: é data block
  não-executável, a spec HTML retorna cedo antes do check de CSP.

### Fase B do CSP concluída (31/08)

Os 136 handlers (93 `onclick`, 41 `oninput`, 1 `onkeydown`, 1 dinâmico) e os
257 estilos inline (228 no HTML + 29 dinâmicos no app) do
`multiasset-app.html` foram externalizados e o CSP saiu estrito nos dois
domínios. Publicado via `publicar-com-rollback.ps1`, Worker `b767ba10`,
gate 34/34, suíte do Worker 69 -> 70.

O que mudou no app:

- O bloco `<style>` (91 KB) virou `assets/multi-app.css`; os atributos `style`
  viraram 103 classes utilitárias em `assets/multi-utilities.css`, com
  `!important` em tudo exceto `display` e `width` (que o JS compete via CSSOM).
- Os 3 scripts executáveis viraram `assets/multi-app-1.js` (hero video),
  `assets/multi-app-2.js` (o app, 167 KB) e `assets/multi-app-3.js`
  (BTC hero). Os 28 blocos `text/tv-lazy` e o JSON-LD continuam inline, são
  data block e o CSP não bloqueia.
- Handlers viraram `data-ev="eN"` + delegação no document (click/input/keydown)
  com `closest('[data-ev]')`, mapa `EVENTS` com os 109 únicos, e o caso
  dinâmico `data-ev="geo:<id>"` tratado à parte. Preserva `this` via
  `.call(el, event)`, nenhum handler usava `return false`.
- Cores calculadas em runtime (`${retColor}`, `colorProb(...)`, `sec.color`,
  `gr.color`) viraram `data-color`/`data-bg` + `applyInline()` por CSSOM
  (propriedade a propriedade, permitido pelo CSP) + `MutationObserver`.
  `fb.style.cssText` virou 10 atribuições CSSOM individuais.

Dois bugs de transformação achados e corrigidos durante a validação: a classe
usada no app para `font-weight:700` estava com nome desalinhado da registrada
no CSS (`u-fw700` vs `u-fontweight700`), e o `transformTag` descartava as
classes que adicionava porque mutava closure dentro da callback do replace em
vez de retornar, fazendo os 228 estilos do HTML perderem efeito. O segundo
foi o grave: só os `data-ev` sobreviviam. O produto final foi validado por
drift de nomes, toda classe `u-*` usada em HTML e app existe no CSS, 103/103.

O gate `validar-producao.ps1` foi repontado: as 3 checagens que buscavam no
HTML servido (ausência do parser de taxa do payload, premissa de ouro, fonte
única `rebuildTaxasCenario`) agora buscam em
`$MULTI/assets/multi-app-2.js`, o asset onde essa lógica mora. O
`xss-guard.test.mjs` também passou a ler o asset, e o `build-cloudflare-public.ps1`
copia os 5 assets novos do multi (`multi-app.css`, `multi-utilities.css`,
`multi-app-1.js`, `multi-app-2.js`, `multi-app-3.js`) para `public/multi/assets/`,
incluídos nos obrigatórios do build.

Verificado em produção após o deploy: CSP de `multi-assets.com` e
`szuchmacher.com.br` sem `unsafe-inline` em `script-src` e `style-src`; o HTML
servido tem 0 `style=` e 0 `on*=` inline e 135 `data-ev`; os assets respondem
200.

### Mapeamento de 31/08: FTP da rotina remota é inerte

Mapeamento pedido pelo operador antes de decidir o cancelamento da HostGator.
Leitura do handler do Worker `sz-sites` (`index.js`, `serveStatic`): todo
conteúdo vem de `env.ASSETS`, o `public/` montado por
`build-cloudflare-public.ps1` e enviado por wrangler. Não existe fetch para o
host HostGator em caminho nenhum, e os endpoints que a rotina verifica
(`macro_api.php`, `assets/agenda.php`) são handlers internos do Worker.

A rotina remota `szuchmacher-domingo` (Cloud, domingo 08:00 BRT) coleta dados
macro, gera `macro_data.json` e `agenda-data.json`, e publica via
`scripts/deploy.sh` (FTP legado), que sobe 8 arquivos no HostGator e depois
valida HTTP 200 no domínio. Como o site é servido do `env.ASSETS`, o upload vai
para um host que ninguém lê. O prompt da rotina ainda carrega a senha `deploy@`
em texto puro, risco documentado em `docs/controle-remoto-claude-code.md`.

Dependência real para o cancelamento: a rotina remota é o único consumidor do
FTP. Pausar ou reescrever o prompt dela (sem FTP), desligar o `agenda-cron.php`
do cPanel, e a conta pode ser encerrada sem derrubar nada. Cobertura de dados
local confirmada no Task Scheduler, `Szuchmacher-AgendaAgent` ativa (Ready),
publica `agenda-data.json` e `macro_data.json` no `public/` do Worker via
`publicar-com-rollback.ps1`.

**Correção de 01/09.** A frase acima sobre "desligar o `agenda-cron.php` do
cPanel" está errada e fica aqui só como registro. Esse cron não existe no
painel, ver a seção de 01/09. O inventário real de cron no cPanel são 5
entradas, `macro_cron.php` e `focus_cron.php`. As três `macro_cron.php` e as
duas `focus_cron.php` foram identificadas como legadas e substituídas pela
infraestrutura atual.

### Fechamento de 31/08: dois bugs silenciosos da Fase B corrigidos

A Fase B (Worker `b767ba10`) deixou dois defeitos que nenhum gate HTTP pega.
Nenhum dá 404 nem erro de console, então `validar-producao.ps1` passava verde
com os dois vivos. O operador reportou clicando nas abas e apontando o layout
quebrado, não a auditoria.

- **Handlers mortos por prefixo do `data-ev`.** O HTML grava `data-ev="eN"` e o
  mapa `EVENTS` em `assets/multi-app-2.js` usa chave `'N'` sem o `e`. O lookup
  `EVENTS["e0"]` devolvia `undefined` e os 109 handlers não disparavam. Uma
  linha no laço de delegação remove o `e` antes do lookup. Deploy `1866735e`.
- **`class=` colado na tag ou atributo em 35 pontos.** O transform de estilo
  inline para classe utilitária fundiu `<pclass=`, `<divclass=`, `<spanclass=`,
  `<emclass=`, `<strongclass=`, `href="..."class=`, `data-ev="e83"class=`,
  `rel="noopener"class=`, `colspan="5"class=`, `aria-label="..."class=`. O
  parser lê tag ou atributo desconhecido e descarta a classe, quebrando layout
  (parágrafo perde max-width, "Macroeconômico"/"Geopoliticos" perdem o itálico
  dourado, canvas perde margem) sem erro visível. Corrigido inserindo o espaço
  nos 35 pontos. Deploy `eb7c49e0`.

Duas guardas novas em `scripts/build-cloudflare-public.ps1` reprovam o build
para que não volte: `Test-MultiDataEv` cruza `data-ev` do HTML com as chaves do
`EVENTS`, e `Test-FusedAttrs` acha tag ou atributo fundido com `class=`. Ambas
testadas, com teste negativo injetando caso ruim e o build reprovando.

Gate 34/34 após o deploy `eb7c49e0`. Confirmado no HTML servido em produção,
0 tag fundida, 0 atributo fundido, `<em class="u-colorvargold-fontstyleitalic">`
restaurado. O refresh do macro deu 429 nas 3 tentativas e o cache ficou frio,
sem impacto na correção do CSP.

**Correção de atribuição, feita em 31/08 à tarde.** Aquele 429 não era do
OpenRouter, era do rate limiter do próprio Worker. `checkRefreshRate` em
`src/handlers/macro-api.js` devolve `{ ok: false, error: 'Rate limit' }` com
status 429 e `Retry-After` quando a janela de 1 h está aberta, e o caminho HTTP
`cron=1` passa por ele (linha 308, `if (forceRefresh && !forceRefreshOpt)`).
Como o carimbo é gravado antes da cascata rodar, a tentativa 1 falha e já
bloqueia as tentativas 2 e 3. Detalhe completo na auditoria de 31/08, §7.1.

### Auditoria completa da tarde de 31/08 e reposição do macro

Relatório em `site-producao/diagnosticos/DIAGNOSTICO-2026-08-31.md`, com
`audit-http-20260831.json` e os screenshots dos seis viewports. Gate 34/34,
nenhum P0 e nenhum P1.

Fechados com prova nesta corrida. O cron nativo de segunda, item acima. CSP
estrito Fase A e B no ar, verificado no conteúdo servido e não no commit, CSP
idêntico de 1.292 chars nas três URLs, sem `unsafe-inline` nem `unsafe-eval`, e
o HTML do multiasset com 0 tag `<style>`, 0 atributo `style=` e 0 handler `on*=`.
Drift zero, SHA-256 do build local bate com produção em quatro arquivos. O P3 do
`Content-Length: 0` reretestado, os sete casos que davam 500 em 30/08 respondem
200.

Achados. Dois P2, o cache macro vazio (item aberto acima) e o `AgendaAgent` com
LastResult 1 às 08:00, abortado pela guarda de working tree sujo em
`multi-app-2.js` e `multiasset-app.html`, que só foram commitados às 11:38. Sem
impacto de conteúdo, a agenda em produção estava na janela certa, 31/08 a 04/09
com 8 eventos e rótulo correto nos seis viewports. Segunda vez que sessão de
código na madrugada colide com a janela das 08:00. Três P3, seis violações de
CSP no multiasset atribuídas com probe dedicado ao
`embed-widget-single-quote.js` do TradingView injetando `<style>` no documento
pai, sem impacto visual, `usd_brl` em stale no `relatorio-prices.php`, e quatro
screenshots PNG soltos na raiz do repo.

**Reposição do macro executada às 17:00 BRT.** Não pelo
`invalidate-worker-cache.ps1 -RefreshMacro`, que teria apagado `macro-panel`,
`market-data` e `ntnb-scenarios` junto, todos saudáveis, e que de todo modo
tomaria 429 com a janela de rate ainda ativa. Foi cirúrgico, delete só da chave
`macro-refresh-rate` no KV via `npx wrangler kv key delete --remote` (com
`CLOUDFLARE_API_TOKEN` retirado do processo, o workaround de OAuth já
documentado no invalidador), seguido de `GET macro_api.php?cron=1` com
`X-Cron-Secret` em header e `TimeoutSec 180`. Saída, `ms=39234`, `ok=True`,
`cache=False`, `generated_at=31/08/2026, 17:00 BRT`. O `cache=False` é a prova
de geração real e não fallback. Revalidado por fora, `/health` saiu de
`macro_cache: "empty"` para `31/08/2026, 17:00 BRT`, e a leitura pública passou
a responder em 435 ms com `cache: true` e **sem** o campo `note`, que é o
discriminador entre KV real e fallback estático (os dois respondem
`cache: true`). Defasagem do painel da home caiu de ~70 h para zero. Gate
rerodado depois, 34/34.

Nada foi deployado nesta sessão. As únicas mutações em produção foram o delete
da chave de rate e a gravação do cache pela própria regeneração.

### Fix da causa raiz do macro e desbloqueio da publicação (31/08 à noite)

Três commits, `e757bac` (macro), `78409c7` e `2867052` (deploy). Deploy
`2065188f`, gate 34/34, evidência no item fechado acima.

**O bloqueio de publicação.** Duas tentativas de deploy falharam idênticas, às
17:20 e às 17:28, com `10000` (Authentication error) nos endpoints de Workers e
`9109` (Invalid access token) em `/accounts`. Não era instabilidade da API, foi
o que supus na primeira leitura e estava errado. O `CLOUDFLARE_API_TOKEN`
persistido (`cfut_`) responde `active` em `/user/tokens/verify`, mas é
sub-escopado a ponto de o `wrangler whoami` não ler nem os detalhes do usuário.
O OAuth em `~/.wrangler/config/default.toml` tem `workers`, `workers_kv`,
`workers_routes` e `workers_scripts` em write. Como o env var tem precedência
sobre o OAuth, o deploy morria.

Seis scripts já tiravam a variável do processo por esse motivo
(`invalidate-worker-cache.ps1`, `attach-worker-domains.ps1`,
`purge-cloudflare.ps1`, `cleanup-dns-cloudflare.ps1` e os dois `setup-*.ps1`).
Faltavam `publicar-com-rollback.ps1`, que só lia a versão viva, e
`deploy-cloudflare.ps1`, que era o que de fato quebrava. Os dois ganharam o
mesmo padrão, com restore num `finally` porque `Env:` é escopo de processo e o
rollback chama o deploy com `&`. Quando o fallback é usado, o log registra um
aviso, porque isso indica que o token do ambiente não serve.

**Dívida que sobra.** ~~Sete scripts hoje carregam workaround para contornar um
token que não serve para nada. Decidir entre rotacionar o `cfut_` com os escopos
certos ou apagar a variável persistida de vez, já que o OAuth resolve tudo.
Remover a causa elimina os sete workarounds.~~

**Corrigido em 01/09 por auditoria arquivo por arquivo.** O parágrafo acima
estava errado em três pontos e fica riscado como registro. São **4 scripts** com
a guarda, não sete, `invalidate-worker-cache.ps1`, `attach-worker-domains.ps1`,
`publicar-com-rollback.ps1` e `deploy-cloudflare.ps1`. A **variável persistida já
não existe** em escopo nenhum, então a guarda é no-op hoje. E o **token que
sobrou no `.env` funciona**, não é o sub-escopado que quebrou o deploy. Detalhe e
sondagem na seção de 01/09.

Commitado e enviado ao origin em dois commits: `8d29aec` (fix(csp), os três
arquivos de código) e `5b5defe` (docs(estado)). Branch sincronizada, restam só
quatro screenshots não rastreados na raiz.

## Estado em 2026-09-01

Rodada de copy e SEO na home, sem tocar em código de aplicação. Dois commits,
`9ac9854` (posicionamento da home) e `27009b5` (contradição de frequência,
léxico UHNW e JSON-LD), ambos no origin. Deploy único do segundo, Worker
`02583888-dced-40dd-8453-99979d92a6e6`, 4 arquivos publicados, `index.html`,
`relatorios.html`, `honorarios.html` e `sitemap.xml`.

**O achado que motivou a rodada era maior do que o reportado.** O FAQ da home
não errava só a frequência da Carta, errava o produto. Respondia "Sim" para
"o relatório de mercado custa algo?" e mandava o visitante para `assinatura.html`.
O Fechamento de Mercado é gratuito, tem formulário próprio em `relatorios.html`
e endpoint vivo no Worker, confirmado com `POST /relatorio-signup` devolvendo
422 e `{"ok":false,"error":"Email invalido"}`. A home empurrava para o checkout
pago quem já podia receber conteúdo de graça. Reescrito separando os dois
produtos, com a Carta lastreada no que `assinatura.html` de fato vende, carta
macro mensal e não semanal.

Junto entraram quatro correções menores. O `FAQPage` passou de 4 para 7
`Question`, batendo com os 7 `<details class="faq-item">` visíveis, marcação que
cobria metade da página desperdiça o rich result. `NewsletterService` não existe
no vocabulário schema.org e virou `Service` com `serviceType`. As duas
referências de `@id` em `relatorios.html` apontavam para `szuchmacher.com.br#org`
e `#website` sem a barra, que não identificam nó nenhum, agora apontam para
`/#organization` e `/#website`, que existem em `index.html`. E `relatorios.html`
saiu de `changefreq weekly` para `daily` no sitemap, coerente com a página que se
declara diária.

O léxico UHNW saiu do schema da home e das duas metas do `honorarios.html`.
Sobrevive só em `cv.html`, que é currículo com `noindex,nofollow` e onde o termo
descreve fato de carreira, não posicionamento comercial.

**Duas coisas não foram mexidas, de propósito, para não serem "corrigidas" por
engano numa sessão futura.**

A campanha `hero_fundador` perdeu a origem quando o CTA secundário do hero mudou
para `honorarios.html`, e isso não é regressão. Era parâmetro de URL alimentando
um GA4 que este site removeu por decisão de arquitetura. A atribuição de clique
roda por `data-ga` para o Clarity, via delegação em `assets/sz-config.js`, e o
CTA novo carrega `data-ga="cta_honorarios" data-ga-location="hero"`. Recolocar um
UTM interno criaria `honorarios.html?utm_...` como URL indexável duplicada sem
ganhar medição nenhuma.

O bloco `market-main` de `relatorios.html` tem só descrição de produto no HTML
estático, com o conteúdo real chegando por fetch. A resolução seria injeção no
edge, `HTMLRewriter` no Worker lendo `relatorio_cache.json` e reescrevendo antes
de entregar. Não implementada. Põe transform de streaming no caminho quente do
HTML num Worker que hoje não usa `HTMLRewriter` em lugar nenhum, por causa de uma
página só, e amarra a renderização à disponibilidade de um JSON. A perda também é
medida contra algo que nunca existiu, antes desta rodada o estático servia uma
edição de julho parada há dois meses. Se for retomado, é trabalho isolado com
teste próprio.

### Conferência documental do "18+ anos" (01/09)

O número publicado em 12 pontos do site foi conferido contra a fonte oficial e
**tem suporte documental**, sem inferência aritmética.

- `site-producao/Yan_Szuchmacher_CV_PT.pdf`, página 1, seção PERFIL PROFISSIONAL,
  "Executivo com mais de 18 anos em private banking, corporate banking e wealth
  management em bancos internacionais."
- Mesmo PDF, página 2, seção DIFERENCIAIS, "Mais de 18 anos de relacionamento
  direto com clientes ultra high net worth."
- `site-producao/Yan_Szuchmacher_CV_EN.pdf`, "Executive with more than 18 years
  in private banking, corporate banking and wealth management at international
  banks." e "More than 18 years of direct relationships with ultra high net worth
  clients."

Os dois PDFs estão versionados, último commit que os tocou é `a1cebb9` de 24/08,
e o CV está corrente, traz a Mirabaud até agosto de 2026. Copy não alterada,
porque o site apenas reproduz o que o currículo afirma.

Fica registrada uma observação factual para o operador, que não é fundamento para
mudar nada sozinho. A cronologia dentro do próprio CV começa em "Estagiário 2009
a 2010" no Crédit Agricole, e a formação no IBMEC vai de 2005 a 2009. Se a
contagem parte do estágio, o intervalo até 2026 é menor que 18. Se parte da
graduação, é maior. O CV é a fonte, o CV afirma 18+ nas duas línguas, e o site
está consistente com ele. Quem decide o marco inicial é o titular, não o agente.

### Verificação colada

```
build-cloudflare-public.ps1   31 arquivos obrigatorios conferidos em public/
node --test tests/*.test.mjs  pass 75, fail 0
validar-producao.ps1          34 verificacoes, 0 falha  (EXIT=0)
smoke pos-deploy              TOTAL: 21 OK, 0 falha, de 21
```

O smoke é ad hoc, refeito em 01/09 contra produção, read-only. Cobre home (11),
`relatorios.html` (6), `honorarios.html` (2) e sitemap (2), com JSON-LD parseando
nas duas páginas, 7 FAQ visíveis contra 7 no schema, e ausência de `gtag`, de
`UHNW` e de "publicação semanal". Confirmado também em navegador na home servida,
sem erro de console.

### Dois tropeços registrados

**429 no aquecimento do macro durante o deploy.** O `deploy-cloudflare.ps1`
tentou três vezes o `macro_api.php?cron=1` e tomou `429 Too Many Requests` nas
três, deixando o KV frio. Causa é o segundo deploy dentro de poucos minutos, com
a janela de rate de `checkRefreshRate` ainda aberta, exatamente o comportamento
descrito no fechamento de 31/08. O script trata como não fatal e o gate seguinte
marcou `macro_api.php` e `assets/macro.php` OK, então não houve impacto em
produção. Registrado porque o deploy não saiu limpo.

**Bug no script de smoke, resultado falso antes da correção.** A primeira versão
usava `$home` como variável, que é automática e read-only no PowerShell. A
atribuição falhou em silêncio, `$home` seguiu valendo o caminho do perfil do
usuário, e as 11 checagens da home compararam contra uma string de sistema de
arquivos, produzindo 3 falhas falsas e aprovações igualmente sem valor. Refeito
com `$pgHome`. É a segunda vez que um helper de verificação escrito na hora mente
nesta linha de trabalho, a primeira foi `curl.exe` devolvendo array de strings e
quebrando regex multilinha. A guarda que ficou no script é imprimir os bytes
baixados e abortar se vierem vazios, antes de qualquer asserção.

**Contagem do smoke corrigida.** O relatório verbal daquela sessão disse 20
checagens verdes. A soma dos blocos dá 21, e a reexecução de 01/09 confirmou 21.
O número correto é 21, o 20 foi erro de contagem no relato, não no teste.

### reasonix.toml resolvido

O arquivo não rastreado na raiz é allowlist de permissões do Reasonix Desktop,
instalado em `C:\Users\User\.reasonix` com `reasonix-desktop.exe` em
`AppData\Local`. A ferramenta escreve um por diretório de projeto, são 7 na
árvore `E:\Diretorio\Claude`. Nenhum arquivo do repositório referencia reasonix.
O conteúdo é `[permissions] allow = [...]` guardando a linha de comando literal
que a sessão autorizou, ou seja, estado local de máquina. Entrou no `.gitignore`
como `/reasonix.toml`, com âncora de raiz para não capturar arquivo homônimo em
subdiretório. Não apagado.

### agenda-cron.php encerrado, e o que apareceu no lugar (01/09)

**O cron não existe.** O operador abriu o cPanel e conferiu a lista de Cron
Jobs. Não há nenhuma tarefa contendo `agenda-cron.php`. O painel tem 5 entradas,
3 de `macro_cron.php` e 2 de `focus_cron.php`, e nenhuma foi alterada na
verificação.

Isso encerra a pendência de "desligar o `agenda-cron.php` no painel", que
aparecia em quatro pontos deste arquivo e no item 4 de
`site-producao/CLAUDE.md`. Não havia o que desligar. A afirmação anterior, de
que o job "segue registrado no painel", nunca tinha sido conferida no cPanel,
porque o acesso falhava, FTPS `deploy@` devolvia 530 e as credenciais do `.env`
não autenticavam. Era suposição herdada do plano de junho, não observação.

Três evidências no repositório sustentam que o arquivo está morto de qualquer
ângulo, além da ausência no painel:

- Nenhum script de deploy o publica. `deploy.sh`, `build-cloudflare-public.ps1`,
  `deploy-all.ps1`, `deploy-cloudflare.ps1` e `publicar-com-rollback.ps1` não
  citam `agenda-cron.php`. A cópia que exista no HostGator veio de upload manual
  de junho e nada no pipeline atual a mantém.
- O escritor real de `agenda-data.json` hoje é
  `automacao-yan-os/agents/agenda_agent.py`, chamado por `run-agenda-agent.ps1`
  na task `Szuchmacher-AgendaAgent` e publicado por `publicar-com-rollback.ps1`.
- O site é servido 100% de `env.ASSETS` no Worker, então mesmo um arquivo vivo
  no HostGator não chegaria ao visitante.

**P3-15 fecha junto, e por evidência, não por conveniência.** Os calendários
2026 hardcoded são os arrays `$copom_2026`, `$feriados_us_2026` e `$fomc_2026`,
e eles moram dentro do próprio `agenda-cron.php`, entre as linhas 30 e 70. Não
existe outro leitor. Sem execução, os dados fixos não produzem nada. P3-15 nunca
foi item independente, era propriedade deste arquivo.

**`site-producao/scripts/agenda-cron.php` fica no repositório, intacto**, e
passa a ser classificado como legado inativo. Não foi editado, nem para receber
comentário de cabeçalho. Se algum dia for removido, o gatilho é decisão de
limpeza, não risco operacional.

**A dívida que apareceu no lugar é maior que a que fechou.** As 5 tarefas Cron
que existem de fato no cPanel não estão mapeadas em lugar nenhum deste
repositório. `macro_cron.php` está versionado em `ferramentas-multiasset/`, é da
era pré-Cloudflare, chama OpenRouter e grava `macro_data.json` às 23:00 BRT,
função que hoje pertence ao `scheduled()` do Worker e ao `macro_api.php`. As
únicas referências vivas a ele são comentários em snapshots antigos de HTML.
`focus_cron.php` não existe neste repositório, em nenhuma forma. Antes de
cancelar a HostGator é preciso saber o que essas 5 entradas fazem, se alguma
ainda alimenta algo e se alguma duplica trabalho que o Worker já faz. Nada foi
tocado nelas.

### Auditoria da dívida do `cfut_` (01/09)

Pedida para decidir se dava para remover os workarounds. A conclusão é que
**não se remove**, e que o que estava errado era a documentação, não o código.

**São 4 guardas, não sete.** Conferido arquivo por arquivo, quem de fato retira a
variável do processo é `attach-worker-domains.ps1:19`, `deploy-cloudflare.ps1:39`,
`invalidate-worker-cache.ps1:42` e `publicar-com-rollback.ps1:84`. Um quinto,
`setup-cloudflare-token.ps1:51`, apaga a variável persistida do usuário, mas isso
é a migração deliberada para o token viver no `.env`, não guarda. Os três que a
documentação e o comentário do `deploy-cloudflare.ps1` nomeavam como tendo o
mesmo comportamento, `purge-cloudflare.ps1`, `cleanup-dns-cloudflare.ps1` e
`setup-cf-purge-token.ps1`, **nunca removeram variável nenhuma**, são
consumidores que leem token do `.env`. O comentário falso foi corrigido no
próprio script em 01/09.

**A premissa da guarda não existe mais nesta máquina.** `CLOUDFLARE_API_TOKEN`
está ausente em User, em Machine e no processo. Sem variável persistida não há
precedência sobre o OAuth, então as 4 guardas são no-op hoje. O wrangler também
não lê o `site-producao/.env` para autenticar, e não existe `.env` nem
`.dev.vars` em `cloudflare-workers/sz-sites/`.

**O token que sobrou no `.env` não é o quebrado.** Sondagem read-only, token só
em header, nada mutado:

```
/user/tokens/verify                        200  success
/user                                      200
/accounts                                  200  1 conta
/zones                                     200  4 zonas
/accounts/{id}/workers/scripts             200  22 scripts
/accounts/{id}/workers/services/sz-sites   200
/accounts/{id}/storage/kv/namespaces       200  10 namespaces
```

O diagnóstico de 31/08 registrou `9109` em `/accounts` e incapacidade de ler User
Details. Este lê tudo, inclusive Workers e KV. Ou foi rotacionado, ou o valor do
`.env` nunca foi o valor que estava no ambiente. Não dá para saber qual, a
variável antiga já não existe para comparar.

**Decisão, manter as 4 guardas.** Custam cinco linhas cada, escopo de processo,
restore em `finally`, e cobrem uma falha que bloqueou publicação duas vezes em
31/08. Máquina nova, CI ou setup antigo que volte a definir a variável cai no
mesmo buraco sem elas. O `cfut_` também não é inútil, é o fallback de credencial
do `purge-cloudflare.ps1`, já que `CLOUDFLARE_PURGE_TOKEN` não existe no `.env`.
Nenhum token foi criado, rotacionado ou revogado nesta auditoria.

### P3 do `usd_brl` fechado (01/09)

O achado de 31/08, `usd_brl` em stale no `relatorio-prices.php`, não reproduz.
Leitura de produção em 01/09 02:14 BRT:

```json
{"ok":true,"usd_brl":5.1823,"ibovespa":177418.78,"sp500":7686.14,"wti":87.03,
 "stale":[],"generated_at":"01/09/2026, 02:06 BRT","source_state":"cache"}
```

`stale` vazio, os quatro ativos com valor e carimbo de seis minutos antes.

### Outras conferências desta rodada, sem ação

O cache macro sobreviveu aos 429 do deploy de 01/09. `/health` traz
`macro_cache: "01/09/2026, 01:29 BRT"` e a leitura pública responde `cache: true`
**sem** o campo `note`, que é o discriminador entre KV real e fallback estático.
O fix `e757bac` segurou no cenário que o motivou.

O `mailto:` em `assinatura.html:122` e `:141` não é drift de checkout. É o
fallback estático, reescrito em runtime por `assets/sz-config.js:307` e `:314`
para a URL Stripe live quando a guarda `ready()` passa.

Os quatro PNG soltos na raiz deixaram de ser P3 porque foram commitados em
`0b8bb99`. Versionar 581 KB de screenshot datado na raiz, sem nada referenciando,
é discutível, mas está feito e desfazer não é ganho.

### Radar Geopolítico entregue (07/09/2026)

O Radar Geopolítico foi concluído no commit `e4e105d`, com agente semanal,
fallback de segunda-feira, página completa, painel da home, endpoint do Worker,
validação de schema, testes específicos e registro dos gatilhos do Task
Scheduler. O agente usa somente fontes coletadas no dossiê para preencher a
edição, rejeita URLs fora do dossiê e não aceita probabilidades numéricas.

Gate local verde, Python 8/8, Worker 89/89, scripts verdes, build com 32
arquivos obrigatórios e validação factual estrutural verde. O deploy foi feito
com `publicar-com-rollback.ps1`. O portão de produção passou com **38
verificações, 0 falhas**. A auditoria Playwright de 07/09, relatório
`diagnosticos/audit-raw-20260907_203257.json`, encontrou 0 endpoints falhos, 0
páginas falhas e 0 erros HTTP na página do Radar.

O commit ainda precisa ser enviado ao `origin`. As alterações locais de
`agenda-data.json`, `macro_data.json`, `.codex/`, `.idea/` e `AGENTS.md` não
fazem parte deste commit e permanecem preservadas.

### Ajuste visual do lead do Radar Geopolítico (08/09/2026)

O resumo introdutório da página recebeu tratamento editorial sem alteração de
conteúdo ou lógica. O estilo agora limita o lead a 800px, remove o padding
lateral, usa 17,6px com line-height 1.65, adiciona o eyebrow `CENÁRIO DA
SEMANA`, mantém uma única divisória após o texto e separa o primeiro card por
40 a 44px. O hero específico da página também deixou de recortar o título.

Validação local, 89 testes do Worker passaram. A publicação desta correção
ocorreu em 08/09/2026, versão `5c815744-f604-4a3d-908b-4402553abcce`, com
38 verificações de produção e 0 falhas. O hash servido de `sz-design.css` é
`2F3F8223`.

### Automação semanal do Radar Geopolítico (08/09/2026)

O agente agora calcula a janela a partir da data de execução, gera de segunda a
domingo, formata viradas de mês e ano, exige `generated_at` ISO 8601 com BRT e
rejeita payloads com `week` incoerente. A execução dominical usa `--force` e o
runner só usa `--dry-run` em simulação, portanto a edição nova é gravada antes
da publicação. O prompt também registra a regra de manter materialidade antiga
explicitamente quando não houver novidade suficiente.

A tarefa `Szuchmacher-GeopoliticaAgent` foi registrada e está `Ready`, com
domingo às 18:00 e fallback de segunda às 08:00. Testes Python passaram 14/14,
Worker 89/89, build oficial concluído e o gate de produção passou 38/38. A
versão publicada é `67232de6-4f0f-49ef-a49f-07c72604b472`. Em produção, home e
`geopolitica.html` exibem `14 a 20 de setembro de 2026`, com os mesmos dados,
fundo externo branco e cards alternados.
### Correção dos 4 P1 do motor financeiro multi-assets (08/09/2026)

Quatro bugs de cálculo foram corrigidos no `assets/multi-app-2.js`:

1. **Comparador modo índice produzia NaN** — `const base = a.serie` atribuía o array inteiro como base, e `v / array` produz NaN. Corrigido para `a.serie[0]`.

2. **CAGR contava aportes como retorno** — `Math.pow(final / Math.max(ini, 1), 1/prazo)` tratava o valor total (inicial + aportes) como se fosse retorno sobre o capital inicial. No commit `6e67675` passou a ecoar a taxa de entrada (`a.taxa` / `taxa * 100`); no fechamento das lacunas (`ae77060`) virou CAGR efetivo/implícito da projeção, resolvido por bisseção em `cagrComAportes`, no comparador e na métrica do Monte Carlo (a mediana P50 entrega valor abaixo da taxa de entrada por drag de vol, sem ecoar premissa).

3. **Drift do Monte Carlo inconsistente** — Usava `taxaAnual - 0.5 * vol²` em vez de `ln(1 + taxaAnual) - 0.5 * vol²`. A diferença é material para ativos de alta volatilidade (BTC: 3,8pp de drift anual). Corrigido em 4 locais de GBM.

4. **Cenários CDI e NTN-B semanticamente invertidos** — `pess: 12% < base: 14,25% < otim: 16,5%` quando em crise (pessimista) juros sobem. Corrigido para `pess: 16,5% > base: 14,25% > otim: 12%` (CDI) e `pess: 16% > base: 13% > otim: 10%` (NTN-B). O portfólio agora usa `taxasAtivo.cdi` e `taxasAtivo.ntnb` em vez das curvas fixas `getSelicAno()` / `getNtnbAno()`.

Testes: 11 novos testes do motor (105 Worker + 14 Python = 130 no total). Gate local 6/7 (falha pré-existente do `validar-design`), produção 38/38. Commit `6e67675`, deploy `a3ce2490-2827-43ca-840b-c2b255379ddf`.

### Fechamento das lacunas restantes dos 4 P1 (08/09/2026)

Auditoria sobre o commit funcional `6e67675` apontou três divergências do plano aprovado, fechadas no commit `ae77060`:

1. **CAGR efetivo/implícito por bisseção (P1.2)** — helper `cagrComAportes` resolve a taxa anual que reproduz o valor final de `calcSerie` dadas entrada, aporte mensal e prazo. Aplicado no comparador (linha CAGR do ativo) e na métrica do Monte Carlo (`_renderMCMetrics`, CAGR da mediana P50). Resultado é derivado da projeção, não eco da premissa: no determinístico recupera a taxa de entrada; na mediana do MC fica abaixo dela (drag de vol), coerente com o teste `P1.2: mediana do Monte Carlo produz CAGR implicito abaixo da taxa de entrada`.
2. **Guarda no modo índice do comparador (P1.1)** — `normalizarIndice` reescala a série por `serie[0]` e devolve série plana em 100 quando a base é degenerada (0, NaN, negativa, vazia), sem NaN/Infinity. Cobre o caso em que a série inteira é zero (inicial e aporte zerados).
3. **Textos estáticos dos cards CDI/NTN-B invertidos (P1.4)** — os cards lêem as premissas de `simConfigs` com o pessimista em juros altos e o otimista em juros baixos, mas os rótulos fixos do `multiasset-app.html` descreviam o contrário (Conservador mostrava `+12%` e texto de corte de Selic; Agressivo `+16,5%` e choque inflacionário). Conteúdo interno trocado mantendo ids, classes e cores: CDI pess `+16,5% a.a.`/choque, otim `+12% a.a.`/cortes; NTN-B pess `+16% a.a.`/dominância fiscal, otim `+10% a.a.`/compressão de prêmio. Base/Moderado intactos.

Teste novo `tests/p1-gaps.test.mjs` (12 casos, mesmo estilo self-contained de extração por regex do `multi-app-2-engine.test.mjs`): recuperação determinística da taxa, equivalência sem aportes, drag de vol na mediana do MC, guarda do índice em base degenerada e impacto real dos cenários na carteira (bloco NTN-B+CDI+reserva estrito pessimista>base>otimista nos três perfis; reserva de 12% do conservador = `peso × simConfigs.cdi[cenário]`; total do conservador pessimista `0.140125 >` base `0.1365375`, invertido antes da premissa plana por cenário). Suíte do Worker subiu para 117/117. Gate produção 38/38. Commit `ae77060`, deploy `707f48cc-2414-4712-8766-b73094af7e57`.

### Redesign do Radar Geopolítico commitado e revalidado (08/09/2026, fim de tarde)

A working tree carregava a iteração visual de 08/09 que **já estava publicada** (deploys `5c815744` e `67232de6`) mas nunca commitada. O drift confirmado era zero: `geopolitica.html`, `index.html`, `sz-design.css` e `geopolitica-panel.js` do build local byte-idênticos ao que produção servia. O commit de hoje apenas faz o histórico refletir o estado publicado, e o redeploy saiu idempotente.

Validação feita antes de publicar: drift zero nos 4 arquivos; testes Python do agente 14/14 (rodados nos três venvs); build com 32 obrigatórios; Playwright contra produção em 1280 e 390 com 0 erro de console na página geopolitica, 6 âncoras da `.geo-nav` navegando sem esconder título sob o header sticky, eyebrow `CENÁRIO DA SEMANA`, cards de temas alternando `rgb(230,227,222)`/`rgb(247,243,234)`, fundo branco full-bleed na `.geo-pagina` e sem overflow horizontal. Relatório `diagnosticos/publicacao_2026-09-08_1724.md`.

Limpeza e commits: 42 PNG soltos na raiz apagados (não versionados). `agenda-data.json` e `macro_data.json` ficaram fora do commit, são artefato de pipeline da rotina. Dois commits no origin: `1ba0c3b` (redesign: nav por âncoras, eyebrow, cards alternados, CTA da home) e `f9fa57e` (automação: janela por data de execução, domingo com `--force`, validação de `week`/`generated_at`/`regions`/`market_impacts`).

Deploy com `publicar-com-rollback.ps1`: versão `41d27485-a6b9-493b-aac5-7116ecca591e`, build 32/32, KV invalidado e macro regenerado às 17:26 BRT (`cache=False`, geração real), gate 38/38. O wrangler registrou "No updated asset files to upload", coerente com a idempotência. Este mesmo deploy levou ao ar o commit `53306ad` (semântica dos handlers `/api/cdi-scenarios` e `/api/ntnb-scenarios` alinhada à direção aprovada, pessimista = juros altos em RF), que estava commitado e pushed mas sem publicação registrada. Item 2 do operador fecha aqui.

Pendências que seguem abertas: nenhuma nesta rodada.

### Sincronização da skill de auditoria (11/09/2026)

Revisão da skill `szuchmacher-audit` contra produção, sem deploy. Os cinco drifts
encontrados foram corrigidos na própria skill, e os três docs de contagem foram
atualizados:

- `validar-producao.ps1` tem **38** verificações, não 34. Este arquivo, `AGENTS.md`
  e `CLAUDE.md` diziam 34; as três linhas foram corrigidas.
- `/stripe-webhook` sem assinatura responde **401**, não 400 (`src/handlers/stripe-webhook.js`:
  "Sem assinatura valida, devolve 401"). Leitura viva confirmou 401.
- `agenda-data.json` vive em `cloudflare-workers/sz-sites/public/sz/`, não em
  `public/sz/assets/`. Campo `janela` presente, `meta.version` = `2026-09-10`.
- A tabela de endpoints da skill omitia `API_ROUTES` que entraram depois:
  `/relatorio-prices.php`, `/assets/regulatorio.php`, `/assets/geopolitica.php`,
  `/api/cdi-scenarios` e `/api/usdbrl-scenarios`. Todas respondem 200 em produção.
- `Szuchmacher-GeopoliticaAgent` (dom 18:00, fallback seg 08:30) é task deste
  projeto, não estava na lista da skill.

Conferências vivas desta rodada, sem ação: `/health` com `kv: ok` e
`macro_cron_last` em `cron: "0 3 * * MON"` (ts 1788750064, segunda 07/09 00:01 BRT);
`/assets/macro.php` com `selic_meta` e `cambio_ptax`; `/api/ntnb-scenarios` com
`source: "yahoo"`; `/assets/regulatorio.php` com `atualizado_em=2026-09-08`;
`/assets/geopolitica.php` com `schema_version: 1` e `week.label` "14 a 20 de
setembro de 2026"; headers estritos e `X-Served-By: sz-sites-worker` nos dois
domínios; `config.php`, `.env`, `wrangler.toml` e `wrangler.jsonc` em 404.
