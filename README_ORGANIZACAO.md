# Organização deste diretório

Registro da limpeza feita em 2026-07-04. Lógica aplicada — mínima e pontual,
sem reestruturar o código dos projetos (`site-producao/`, `automacao-yan-os/`,
etc. seguem intocados).

## O que mudou

- **`_capturas/redesign-lovable/`** — par de screenshots (`site-atual.png` +
  `site-novo-lovable.png`) de uma comparação de redesign feita em 22/06.
  Estavam soltos na raiz; agora vivem juntos, com nome que explica o contexto
  sem precisar abrir o arquivo.
- **`site-producao/diagnosticos/agenda-corrigida.png`** — screenshot ligado ao
  fix da agenda macro; movido pra onde já vivem os outros registros de
  diagnóstico de produção (`DIAGNOSTICO-*.md`, `audit-*.png`).
- **`.gitignore` (raiz, novo)** — cobre `.playwright-mcp/` (artefatos de teste
  de browser) e `backups/` (backups de rotina, regeneráveis). Antes não havia
  `.gitignore` na raiz, e alguns desses artefatos de teste tinham entrado no
  git por acidente.
- **`.playwright-mcp/` e `backups/`** (raiz e `site-producao/`) — conteúdo
  esvaziado. Nenhum dos dois é fonte de verdade; regeneram sozinhos quando
  necessário (rodar Playwright de novo, rodar a rotina de agenda de novo).

## Regra para não voltar a acumular

- Screenshot de verificação/prova gerado numa sessão de chat: se não tem valor
  de referência futura, não precisa persistir no repo — reportar no chat já
  cumpre o propósito.
- Screenshot com valor de referência (comparação de design, estado antes/depois
  de um fix documentado): vai em `_capturas/<contexto>/` (raiz) ou
  `site-producao/diagnosticos/` (se for especificamente sobre produção do site).
- `.playwright-mcp/` e `backups/` já são ignorados pelo git — não precisam de
  limpeza manual recorrente, só se acumularem demais em disco.
