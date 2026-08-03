# Prompt para rodar no Claude Code CLI

Abra o terminal **nesta pasta** (`E:\Diretorio\Claude\Site\mcps\tradingview`) e rode `claude`.
Rodar daqui faz o `CLAUDE.md` e o `AGENTS.md` serem carregados automaticamente.

Cole o bloco abaixo.

---

Preciso integrar um módulo MVRV Z-Score dentro do meu indicador Pine no TradingView.
Leia CLAUDE.md e AGENTS.md desta pasta antes de começar — eles definem o pipeline e as regras.

CONTEXTO DO PROBLEMA

Meu plano é Basic (2 indicadores simultâneos). Tenho 4 aplicados:
RMF Confluence (script pessoal), MACD, MVRV Z Score e RSI.
Os dois últimos aparecem com ícone `!` vermelho e painel vazio — é cota de plano
estourada, não erro de código. Já confirmado.

A tabela de decisão do RMF Confluence já exibe RSI e MACD como texto.
Então o study RSI separado é redundante.

OBJETIVO

Embutir o MVRV Z-Score dentro do RMF Confluence, para que ele custe 0 slots.
Resultado esperado: 1 slot usado pelo RMF Confluence, 1 slot livre.

PASSOS

1. `tv_launch` — a porta 9222 está fechada, o TradingView foi aberto sem CDP.
   ATENÇÃO: isso fecha o app aberto. Me avise antes de executar.
2. `tv_health_check` — confirmar CDP no ar.
3. `chart_get_state` — listar os studies ativos e seus entity_id.
4. `pine_open` no script do RMF Confluence, depois `pine_get_source`.
   NÃO edite nada antes de ler o fonte completo.
5. Leia `modulo_mvrv_embutido.pine` desta pasta. É o bloco a enxertar.
   Ele tem 4 seções: inputs, cálculo, linha da tabela, alertas.
   A seção 3 usa `tbl` e índice de linha 7 como placeholder — troque pelos
   nomes reais do meu script e confira o parâmetro `rows` do `table.new()`.
   Se a tabela não tiver linha sobrando, aumente `rows` antes. Linha escrita
   fora dos limites não aparece e não gera erro — falha silenciosa.
6. `pine_analyze` no fonte integrado (estático, offline).
7. `pine_check` (compila no servidor, sem tocar no gráfico).
8. **Me mostre o diff** — só o trecho alterado, não o arquivo todo. Pare aqui.
9. Depois da minha aprovação: `pine_set_source` → `pine_smart_compile`.
10. `pine_save` SOMENTE com confirmação explícita minha. Sobrescreve o script da conta.
11. Remover os studies redundantes com `chart_manage_indicator action="remove"`,
    usando os entity_id do passo 3. Confirme comigo quais antes de remover.

RESSALVAS QUE JÁ CONHEÇO — não precisa me explicar de novo, só respeite

- `INTOTHEBLOCK:BTC_MVRV` entrega o *ratio* MVRV, não market cap e realized cap.
  O Z-score que sai daí NÃO é o MVRV Z-Score canônico, e as faixas clássicas
  (>7 topo, <0.1 fundo) não se aplicam. Os limites são inputs para eu calibrar.
- O feed só existe para BTC. Em outros símbolos deve mostrar "s/ dados".
- Não confirmei se esse feed exige plano pago via `request.security()`.
  Se aparecer "s/ dados" em BTCUSD, investigue isso primeiro.

Se em qualquer passo o resultado divergir do esperado, pare e me diga —
não tente contornar com `ui_evaluate` ou automação de UI.
