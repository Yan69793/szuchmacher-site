# AGENTS.md — MCP TradingView

Contrato operacional para qualquer agente que use este MCP. `CLAUDE.md` descreve o que as ferramentas fazem; este arquivo descreve como se comportar ao usá-las.

## Pré-condição de toda sessão

Chame `tv_health_check` antes de qualquer outra coisa. Se retornar falha, o TradingView Desktop não está rodando com CDP. Não tente contornar com screenshot, automação de desktop ou navegador — peça ao usuário, ou rode `tv_launch` **depois de avisar que o app aberto será fechado**.

Nunca presuma o estado do gráfico. `chart_get_state` é barato; suposição sobre símbolo, timeframe ou indicadores ativos é a origem mais comum de ação errada.

## Diagnóstico antes de correção

Quando o usuário disser que um indicador "não funciona", "bugou" ou "sumiu", a ordem de eliminação é:

1. **Cota do plano.** Conte os studies em `chart_get_state` contra o limite do plano (Basic 2 · Essential 5 · Plus 10 · Premium 25). Ícone `!` vermelho ao lado do nome do indicador com painel vazio é assinatura de cota estourada, não de erro de código. Scripts pessoais contam.
2. **Erro de compilação.** `pine_get_errors` e `pine_get_console`.
3. **Símbolo incompatível.** Indicadores on-chain (MVRV Z Score, NUPL, SOPR) só calculam em símbolos de cripto com dados on-chain. Em ação, ETF ou índice, retornam vazio legitimamente.
4. **Erro de runtime silencioso.** `pine_analyze` no fonte atual.

Só depois de descartar 1 a 4 é que faz sentido editar código. Diagnóstico invertido — mexer no Pine antes de checar a cota — desperdiça a sessão inteira e ainda deixa o usuário achando que o script dele está quebrado.

Ao relatar, separe o que foi verificado do que foi inferido. Se não deu para confirmar algo (por exemplo, o plano exato da conta), diga que não deu, em vez de preencher com suposição.

## Escrita e edição de Pine Script

`pine_set_source` substitui o arquivo inteiro. Sempre:

```
pine_get_source  →  editar em memória  →  pine_analyze  →  pine_check  →  pine_set_source  →  pine_smart_compile
```

`pine_save` é o único passo que toca o script salvo na conta do usuário. Exige confirmação explícita, sempre, sem exceção. Se o usuário disse "conserta pra mim", isso autoriza compilar e testar — não autoriza sobrescrever o salvo sem mostrar o diff antes.

Ao propor mudança, mostre o trecho alterado, não o arquivo todo.

## Orçamento de contexto

Três ferramentas conseguem, sozinhas, consumir a janela inteira:

- `data_get_ohlcv` → use `summary=true` salvo pedido explícito de barras cruas; se precisar das barras, limite `count`.
- `data_get_pine_labels` / `lines` / `boxes` / `tables` → sempre com `study_filter`.
- `batch_run` → o custo é símbolos × timeframes. Acima de ~12 combinações, confirme com o usuário antes.

Não capture screenshot para ler dado que uma ferramenta de dados devolve em texto.

## Preferência de ferramenta

Semântica antes de UI, sempre. `chart_set_symbol` em vez de `ui_click` no seletor de símbolo. As ferramentas `ui_*` dependem de seletores do DOM que quebram a cada atualização do TradingView, e a falha costuma ser silenciosa — clica no lugar errado em vez de erro.

`ui_evaluate` (JavaScript arbitrário na página) é último recurso. Se você recorreu a ele, registre o motivo na resposta: significa que existe lacuna na cobertura das ferramentas.

## Ações que exigem confirmação

Pare e pergunte antes de:

- `tv_launch` com `kill_existing=true` — mata a sessão aberta do usuário
- `pine_save` — sobrescreve script da conta
- `draw_clear` — apaga todos os desenhos, sem undo
- `alert_delete` com `delete_all=true`
- `chart_manage_indicator` com `action="remove"`
- `tab_close`
- `layout_switch` — descarta alterações não salvas do layout atual

## Fronteira financeira

Este MCP não envia ordem real, e não deve ser usado para tentar. `replay_trade` opera apenas dentro do modo replay (simulação histórica) e só roda a pedido explícito.

Leitura de dado de mercado, cálculo de indicador e backtest são análise. Dizer ao usuário o que comprar ou vender não é função do agente — apresente os dados e deixe a decisão com ele.

## Relato final

Feche com o resultado e o estado em que o gráfico ficou (símbolo, timeframe, indicadores ativos, se algo foi salvo). Se algo foi alterado e não revertido, diga explicitamente. Sem recapitular passo a passo — o usuário acompanhou.
