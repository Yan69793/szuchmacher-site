# Diagnóstico de produção — szuchmacher.com.br

Data 30/05/2026. Método, navegação real em browser headless (Playwright) com captura de console, rede com status HTTP e timing, mais confirmação por curl. Sem suposição. Cada item traz evidência.

## Veredito por página

| Página | Veredito |
|---|---|
| szuchmacher.com.br (home) | Atual e funcional |
| multiasset-app.html (plataforma) | Funcional, com dados macro defasados e falhas ativas não fatais |

A plataforma não "cai", os fallbacks seguram. Mas mostra análise macro de março como se fosse atual, fica com ícones invisíveis e rola para o lado no celular.

## URL 1, home, szuchmacher.com.br

Console limpo, 0 erros e 0 warnings. Imagens, 1 no total, nenhuma quebrada. Sem PDF linkado no corpo no momento da captura.

Conteúdo dinâmico, todos atuais.

| Bloco | Endpoint | Status | Tempo | Dado |
|---|---|---|---|---|
| Macro Focus | /assets/macro.php | 200 | 0,11 a 0,20s | câmbio PTAX 29/05/2026, Focus 22/05/2026, Selic meta 17/06/2026 |
| Agenda | /assets/agenda.php | 200 | 0,12s | versão 2026-05-11, fontes BCB, IBGE, BLS |

Veredito home, atual e funcional.

## URL 2, plataforma, multiasset-app.html

Carrega e é utilizável. Título e simuladores funcionam, preços via prices.php vêm corretos (ouro 4540,42, atualizado 29/05/2026 19:30). Mas há quatro problemas.

### P1, análise macro congelada em março (mais grave)

Evidência de console.

```
[ERROR] Failed to load resource: 503 @ https://szuchmacher.com.br/macro_api.php?t=14834291
[WARNING] macro_api.php indisponível, usando conteúdo estático: HTTP 503 @ multiasset-app.html:4299
```

Corpo do endpoint, confirmado por curl, um teste.

```
GET https://szuchmacher.com.br/macro_api.php
HTTP 503, 0,79s
{"ok":false,"error":"OPENROUTER_KEY não configurada no servidor."}
```

Interpretação pelo protocolo, falha em menos de 5s indica erro imediato de configuração, não de rede nem de quota. A chave OPENROUTER_KEY não está no ambiente do servidor.

Efeito na tela, o código cai no texto estático e mostra.

```
multiasset-app.html:2356  Cenário Global · Março 2026
multiasset-app.html:2372  Conflito EUA-Israel x Irã — 9º Dia · Escalada em Curso (08 mar/2026)
```

Estamos em 30/05. A análise macro está parada há cerca de 3 meses, parecendo atual. Esse é o item mais sensível para o público UHNW.

### P1, CSP bloqueia o Font Awesome, ícones invisíveis

Evidência de console.

```
[ERROR] Loading the stylesheet 'https://cdnjs.cloudflare.com/.../font-awesome/6.4.0/css/all.min.css'
violates the following Content Security Policy directive:
"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com". The action has been blocked.
@ multiasset-app.html:59
```

Medição no DOM, 34 ícones `<i class="fas|far|fab">` com largura zero, ou seja, nenhum renderizou.

Causa raiz, o header CSP vem do servidor Apache, confirmado por curl, não há meta CSP no HTML (`grep` retorna 0). O `style-src` libera só `fonts.googleapis.com`, e o Font Awesome está em `cdnjs.cloudflare.com`. Note que `cdnjs` já está liberado em `script-src`, mas falta em `style-src`.

CSP atual servida (Apache).

```
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
```

A linha do HTML que tenta carregar, multiasset-app.html:60.

```
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
```

### P2, overflow horizontal no mobile

Medição a 390px de viewport, `scrollWidth` 598px contra `innerWidth` 390px, logo rola para o lado. O `body` tem `overflow-x: hidden` (linha 83), o que mascara mas não corrige, algum filho está estourando a largura. Há 12 breakpoints na folha, vários elementos com `width: 480px !important` (linhas 226 e 242) que são candidatos prováveis.

### P3, duas APIs externas falhando, não fatais

| API | Linha | Status | Efeito |
|---|---|---|---|
| brasilapi.com.br/api/taxa/v1 | 4229, 4462 | 404 | cai no fallback BCB série 432 e 12 |
| brapi.dev/api/quote/NTNB11 | 4450 | 401 | exige token, cai no fallback Yahoo Finance |

Não quebram a tela, mas são round-trips desperdiçados que adicionam latência antes do número aparecer.

## Lentidão, medição

A base é rápida. DOMContentLoaded 226ms, load completo cerca de 1,5s. Quem pesa é o TradingView.

| Origem | Requisições | Tempo somado |
|---|---|---|
| tradingview-widget.com | 16+ | ~14s acumulados, ~1,2s por gráfico |
| s3.tradingview.com | 4 | 0,56s |
| szuchmacher.com.br (próprio) | 3 | 0,43s |
| api.bcb.gov.br | 3 | 0,004s |
| economia.awesomeapi | 2 | 0,08s |

Ao longo de poucos minutos com a página aberta, o TradingView gerou mais de 1250 chamadas de telemetria e sheriff. A lentidão percebida é dos widgets de terceiros carregando vários gráficos ao vivo em paralelo, não do servidor próprio.

Risco latente, o fetch do macro tem timeout de 45s (linha 4282). Hoje o 503 volta rápido. Se o servidor passar a demorar em vez de recusar na hora, a seção fica em espera até 45s.

## A migração macro que parece óbvia e não é

Decisão aprovada pelo Yan, apontar a plataforma para o `/assets/macro.php` da home. Investigando o formato, os dois não são compatíveis.

`renderMacro(d)`, multiasset-app.html:4314, consome narrativa.

```
d.eyebrow, d.alert_title, d.alert_text, d.alert_badge,
d.beneficiados[], d.penalizados[], d.cenarios_brent[],
d.canais[], d.brasil[], d.ativos{}, d.premissas_perfis{}, d.premissas_cenarios{}
```

`/assets/macro.php` entrega só números.

```
ts, source, disclaimer, selic_meta{data,valor}, cambio_ptax{data,valor},
focus{ipca_2026, ipca_2027, selic_2026, ..., pib_2027}
```

Não há sobreposição. Apontar um para o outro deixa a seção de análise vazia, porque nenhum campo narrativo existe no JSON da home. Por isso a migração não é troca de URL, é decisão de produto. Veja as 3 opções no PROMPT-CLAUDE-CODE.md.

## Itens em ordem de prioridade

1. P1 análise macro defasada, decidir o caminho (3 opções no prompt) e executar.
2. P1 CSP, liberar cdnjs em style-src no servidor para os ícones voltarem.
3. P2 overflow mobile, achar o filho que estoura 390px e conter.
4. P3 limpar brasilapi 404 e brapi 401, manter só os fallbacks que funcionam.
