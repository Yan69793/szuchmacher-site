# Estado do projeto — Site szuchmacher.com.br

Última atualização: 2026-08-30 (agente: Claude)

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
- Itens restantes do §Q do PRE-DEPLOY-2026-08-15: CSP sem unsafe-inline e
  F5 cache-busting, todos com escopo próprio.

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

- **Cron nativo: causa raiz corrigida em 24/08, prova real só em 31/08.** A Cloudflare numera dia da semana como Quartz (`1` = domingo), então `0 3 * * 1` agendava domingo. Schedule trocado para `0 3 * * MON` e publicado (versão `5df713af`, gate 34/34). O carimbo `macro_cron_last` em `/health` ainda mostra o registro velho de 23/08 e só é reescrito no próximo disparo. Confirmar na segunda 31/08, depois das 03:00 UTC, que `ts` cai na janela e `cron` vem `0 3 * * MON`. Conferido em 30/08, `/health` ainda traz `cron: "0 3 * * 1"` com `generated_at` de 23/08, que é exatamente o esperado enquanto o disparo novo não acontece.
- `agenda-cron.php` do cPanel pendente de desligamento; P3-15 (calendários 2026 hardcoded) é sub-item e resolve junto.
- Itens de escopo próprio do §Q: CSP sem unsafe-inline e F5 cache-busting.
- ~~P3 de 30/08, GET ou HEAD com `Content-Length: 0` em rota HTML devolve 500.~~
  **Fechado em 30/08 à noite, deploy `d9a155b2`, gate 34/34.** `fetchAsset`
  reconstroi o request com `{ method, headers }`, sem repassar body. Ver
  "Fechamento da noite de 30/08" abaixo.
- ~~P3 de 30/08, `/api/ntnb-scenarios` responde `defaults` todo fim de semana.~~
  **Fechado em 30/08 à noite, deploy `d9a155b2`, gate 34/34.** Staleness por
  dias úteis no lugar de 48 h corridas. Ver "Fechamento da noite de 30/08" abaixo.
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
