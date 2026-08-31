# Estado do projeto — Site szuchmacher.com.br

Última atualização: 2026-08-31 (agente: Claude)

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
- `agenda-cron.php` do cPanel ainda não desligado: FTPS `deploy@` devolveu 530
  e as credenciais do `.env` não autenticam no cPanel.
- Itens do §Q do PRE-DEPLOY-2026-08-15: F5 cache-busting fechado em 31/08
  (`488b830`); CSP sem unsafe-inline com a Fase A sz e a Fase B multi
  concluídas em 31/08.

## Como verificar

```powershell
cd site-producao; .\scripts\validar-producao.ps1
```

34 verificações em szuchmacher.com.br + multi-assets.com (páginas, assets,
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
- **Macro, cache esvaziado a cada deploy e reposição automática que não funciona.**
  Aberto em 31/08, conteúdo já remediado, causa no código pendente. São três
  defeitos que se somam. `deploy-cloudflare.ps1` chama
  `invalidate-worker-cache.ps1` incondicionalmente e apaga `macro-api` depois de
  todo deploy. `checkRefreshRate` grava o carimbo `macro-refresh-rate` **antes**
  da cascata rodar, então uma tentativa que falha ainda queima a janela de 1 h.
  E `gerarMacro` roda em foreground sem `ctx.waitUntil`, então cliente que
  desiste antes dos ~40 s tem a execução cancelada e nada é gravado. Efeito
  combinado, o cache fica vazio do deploy até o cron da segunda seguinte, com o
  público servindo o fallback estático. Fix a fazer, carimbo só no sucesso,
  `ctx.waitUntil` na regeneração e delete condicional no deploy. Merece escopo
  próprio com teste antes de deploy.
- `agenda-cron.php` do cPanel pendente de desligamento; P3-15 (calendários 2026 hardcoded) é sub-item e resolve junto.
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
  (`Claude_Code_Remote` indisponível nesta sessão), desligar o `agenda-cron.php`
  do cPanel (P3-15), e aí cancelar o hosting. Cobertura de dados local já
  existe, `Szuchmacher-AgendaAgent` ativa publica `agenda-data.json` e
  `macro_data.json` no `public/` do Worker.
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

Commitado e enviado ao origin em dois commits: `8d29aec` (fix(csp), os três
arquivos de código) e `5b5defe` (docs(estado)). Branch sincronizada, restam só
quatro screenshots não rastreados na raiz.
