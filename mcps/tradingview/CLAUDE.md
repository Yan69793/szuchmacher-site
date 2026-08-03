# CLAUDE.md — MCP TradingView

Servidor MCP que controla o **TradingView Desktop** via Chrome DevTools Protocol (CDP). Não é uma API oficial: ele dirige a UI real do app. Toda a superfície pública está descrita em `tools/*.json` (80 ferramentas).

## Modelo mental

O MCP conversa com uma instância do TradingView Desktop rodando com remote debugging ligado. Se essa instância não existir, **nada funciona** — não há fallback web. A porta padrão é 9222.

Sequência de partida obrigatória em qualquer sessão:

1. `tv_health_check` — confirma conexão CDP e devolve o estado do gráfico.
2. Se falhar, `tv_launch` (`kill_existing=true` por padrão — isso **fecha** o TradingView aberto do usuário; avisar antes).
3. `tv_discover` só quando algo se comportar de forma inesperada: reporta quais caminhos internos da API do TradingView ainda existem naquela build.

Depois de qualquer `tv_launch`, refaça `tv_health_check` antes de encadear ações.

## Limites que não são bugs

Estes pontos causam a maior parte dos falsos diagnósticos. Verifique-os **antes** de investigar código.

**Limite de indicadores por plano.** Basic permite 2 indicadores simultâneos, Essential 5, Plus 10, Premium 25. Scripts pessoais do Pine Editor contam no limite. Indicadores acima da cota são carregados na lista mas não calculam: aparecem com ícone `!` vermelho ao lado do nome e painel vazio. Nenhuma correção de Pine Script resolve isso. Diagnóstico rápido: `chart_get_state` lista os studies; se o número passa da cota do plano, o problema é comercial, não técnico.

**A UI muda entre builds.** `ui_click` e `ui_find_element` dependem de `aria-label`, `data-name` e texto. Uma atualização do app quebra seletores. Prefira sempre a ferramenta semântica (`chart_set_symbol`) à ferramenta de UI (`ui_click`). Recorra a `ui_*` apenas quando não houver equivalente semântico.

**Nomes de indicador built-in são literais.** `chart_manage_indicator` exige o nome completo: `"Relative Strength Index"`, não `"RSI"`; `"Moving Average Exponential"`, não `"EMA"`. Nome curto falha silenciosamente ou adiciona o indicador errado.

**Remoção exige `entity_id`.** Pegue via `chart_get_state`, nunca chute.

## Grupos de ferramentas

**Sessão / infra** — `tv_launch`, `tv_health_check`, `tv_discover`, `tv_ui_state`.

**Gráfico** — `chart_get_state`, `chart_set_symbol`, `chart_set_timeframe`, `chart_set_type`, `chart_set_visible_range`, `chart_get_visible_range`, `chart_scroll_to_date`, `chart_manage_indicator`, `indicator_set_inputs`, `indicator_toggle_visibility`.

**Abas e painéis** — `tab_list`, `tab_new`, `tab_switch`, `tab_close`, `pane_list`, `pane_focus`, `pane_set_layout`, `pane_set_symbol`, `layout_list`, `layout_switch`.

**Leitura de dados** — `data_get_ohlcv` (use `summary=true` por padrão; a versão completa estoura contexto), `data_get_study_values`, `data_get_indicator`, `quote_get`, `symbol_info`, `symbol_search`, `depth_get`, `watchlist_get`, `watchlist_add`.

**Leitura de objetos Pine** — `data_get_pine_labels`, `data_get_pine_lines`, `data_get_pine_boxes`, `data_get_pine_tables`. Todas aceitam `study_filter`; sem filtro, retornam tudo de todos os studies e o resultado fica ilegível.

**Pine Editor** — `pine_list_scripts`, `pine_open`, `pine_new`, `pine_get_source`, `pine_set_source`, `pine_analyze`, `pine_check`, `pine_compile`, `pine_smart_compile`, `pine_get_errors`, `pine_get_console`, `pine_save`.

**Strategy Tester** — `data_get_strategy_results`, `data_get_trades`, `data_get_equity`.

**Replay** — `replay_start`, `replay_step`, `replay_autoplay`, `replay_status`, `replay_stop`, `replay_trade`.

**Desenhos e alertas** — `draw_shape`, `draw_list`, `draw_get_properties`, `draw_remove_one`, `draw_clear`, `alert_create`, `alert_list`, `alert_delete`.

**UI de baixo nível** — `ui_click`, `ui_hover`, `ui_type_text`, `ui_keyboard`, `ui_scroll`, `ui_mouse_click`, `ui_find_element`, `ui_open_panel`, `ui_fullscreen`, `ui_evaluate`.

**Lote e captura** — `batch_run`, `capture_screenshot`.

## Fluxo de trabalho em Pine Script

A ordem importa porque cada etapa é mais cara que a anterior:

1. `pine_analyze` — estático, offline, sem TradingView. Pega array out-of-bounds, `array.first()`/`last()` sem guarda, limites de loop ruins, cast implícito de bool. Rode sempre primeiro.
2. `pine_check` — compila no servidor do TradingView sem tocar no gráfico. Valida sintaxe e devolve erros/warnings.
3. `pine_set_source` → `pine_smart_compile` — injeta no editor e aplica ao gráfico. `pine_smart_compile` já detecta o botão, compila, checa erros e reporta mudanças de study; prefira-o a `pine_compile` cru.
4. `pine_get_errors` (markers do Monaco) e `pine_get_console` (`log.info()`, mensagens de runtime) para diagnóstico.
5. `pine_save` por último, e **só** com confirmação do usuário — sobrescreve o script salvo na conta dele.

Nunca chame `pine_set_source` sem antes ter lido `pine_get_source`. O conteúdo é substituído inteiro, não é um patch.

## Controle de contexto

`data_get_ohlcv` sem `summary=true` devolve todas as barras visíveis. `data_get_pine_labels` sem `study_filter` devolve todo label de todo indicador. `batch_run` multiplica isso pelo produto símbolos × timeframes. Em todos os três, restrinja antes de chamar.

## Ações destrutivas

Confirmar com o usuário antes de: `tv_launch` com `kill_existing`, `pine_save`, `draw_clear`, `alert_delete` com `delete_all`, `tab_close`, e qualquer `chart_manage_indicator` com `action="remove"`.

`replay_trade` executa ordens dentro do modo replay (simulado). Ainda assim, não dispare sem pedido explícito. Nenhuma ferramenta deste MCP deve ser usada para enviar ordem real.

`ui_evaluate` executa JavaScript arbitrário na página do TradingView. É a saída de emergência quando nada mais serve — não é atalho para evitar ler a ferramenta certa.
