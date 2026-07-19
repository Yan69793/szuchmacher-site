# Ponte de sincronização — Fechamento de Mercado → relatorio_cache.json

## Contexto

O "Fechamento de Mercado" da Szuchmacher Consultoria é gerado por uma tarefa agendada
do Claude Code (`fechamento-diario-szuchmacher`, cron `0 19 * * 1-5`, confirmada real
e ativa via `mcp__scheduled-tasks__list_scheduled_tasks` — `lastRunAt` bate com o log
de execução mais recente). O projeto vive em
`E:\Diretorio\Claude\relatorio-diario-szuchmacher`. A rotina publica em
`https://szuchmacher.com.br/fechamento/:slug` (via Worker de briefing separado) e
envia e-mail aos assinantes. Isso funciona.

Nada nesse pipeline atualiza `E:\Diretorio\Claude\Site\site-producao\relatorio_cache.json`
— arquivo consumido por `relatorios.html` do site institucional (widget "Fechamento
da Semana"). Esse arquivo ficou 2 semanas desatualizado (última geração real: 21/06)
porque não existe nenhuma ponte entre os dois projetos. Corrigido manualmente uma vez
nesta sessão (04/07); esta ponte automatiza esse passo daqui pra frente.

Se a rotina principal das 19h falha, um watchdog (`briefing_watchdog.ps1`, às 19h20)
aciona um fallback via OpenRouter (`briefing_fallback_openrouter.py --send`). Ambos os
caminhos — rotina principal e fallback — podem terminar em sucesso (HTML gerado,
e-mail enviado) de forma independente. **Escopo desta sessão:** só a ponte de
sincronização. A causa raiz de a rotina principal ter falhado silenciosamente em
03/07 (watchdog + fallback também falharam com exit 5 na API OpenRouter) fica como
pendência separada, não investigada aqui.

## Decisão de arquitetura

**Script de sincronização único e compartilhado**, chamado nos dois pontos de sucesso
(rotina principal e fallback), em vez de: (a) só plugar na rotina principal — falha
de novo se só o fallback rodar; ou (b) uma rotina agendada nova e separada —
mais uma peça pra manter, duplica a lógica de "achar o output mais recente".

## Componentes

**Novo:** `E:\Diretorio\Claude\relatorio-diario-szuchmacher\scripts\sync_relatorio_cache.py`

- Lê os artefatos já gerados no dia corrente: `outputs/fechamento_szuchmacher_YYYYMMDD.html`
  e `logs/precos_YYYYMMDD.json`.
- Extrai apenas o que está genuinamente validado — replica a disciplina usada na
  correção manual de hoje: variação **semanal** só quando o texto gerado
  explicitamente a informa (hoje, isso só existe pro Ibovespa); os demais tickers
  (dólar, S&P 500, WTI) usam variação do próprio dia de fechamento, rotulada
  `"Sexta · X%"` em vez de `"Semana · X%"` — nunca inventa um delta semanal que a
  rotina não calculou.
- Monta o JSON no schema exato de `relatorio_cache.json`
  (`generated_at`, `date_label`, `eyebrow`, `h2`, `prices.{ibovespa,usd_brl,sp500,wti}`
  com `value`/`change_pct`/`label` cada, `report.{headline,paragraph1-3,next_week,source_note}`)
  e sobrescreve `E:\Diretorio\Claude\Site\site-producao\relatorio_cache.json` por
  completo (sem merge parcial).
- Se os artefatos do dia estiverem ausentes ou incompletos: sai com código de erro
  e mensagem clara no log — nunca escreve um `relatorio_cache.json` parcial ou com
  dado inventado.
- Ao terminar com sucesso, roda `E:\Diretorio\Claude\Site\site-producao\scripts\deploy-cloudflare.ps1`
  (mesmo script usado manualmente hoje — build + `wrangler deploy` + invalidação de
  cache KV). Só deploya se a escrita do JSON teve sucesso.

**Dois pontos de chamada** (ambos passam a invocar o mesmo script no fim, se tiverem
sucesso):

1. `C:\Users\User\.claude\scheduled-tasks\fechamento-diario-szuchmacher\SKILL.md` —
   novo PASSO 6, depois do PASSO 5 (linha final `ENVIADO OK`).
2. `E:\Diretorio\Claude\relatorio-diario-szuchmacher\scripts\briefing_fallback_openrouter.py` —
   chamada ao script de sync logo após o próprio envio de e-mail do fallback ter sucesso.

## Tratamento de erro

- Falha do script de sync (dado ausente, erro de escrita) → logada, mas **não**
  derruba o sucesso do fluxo pai (envio do e-mail de fechamento continua sendo a
  prioridade; o widget do site ficar mais um dia desatualizado é severidade menor,
  já tolerado por semanas).
- Falha do script de sync → **nunca** roda `deploy-cloudflare.ps1` nesse ciclo.
- Nenhuma mudança em `cloudflare-workers/sz-sites/src/` (headers, CSP, roteamento) —
  mesmo limite (G.2) já estabelecido na skill `szuchmacher-audit` desta sessão.

## Verificação

Antes de plugar nos dois pontos de chamada: rodar o script de sync isoladamente
contra os artefatos já existentes de hoje (`fechamento_szuchmacher_20260703.html` +
`precos_20260703.json`) e comparar a saída com o `relatorio_cache.json` que foi
corrigido manualmente nesta sessão — deve bater em estrutura e nos valores
(Ibovespa 174.070/+0,45%, dólar 5,1689/-0,80%, S&P 7.483,24/+0,00%, WTI 68,78/+0,13%).
Só depois desse dry-run bater, editar os dois arquivos-fonte (SKILL.md da rotina e
o fallback Python) pra chamar o script de verdade.
