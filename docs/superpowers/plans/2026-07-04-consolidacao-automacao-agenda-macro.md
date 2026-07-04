# Consolidação da Automação de Agenda Macro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Desabilitar a tarefa agendada local `atualizar-agenda-macro-szuchmacher` (Windows Task Scheduler / Claude Code scheduled-tasks), que aponta para um pipeline FTP→HostGator morto, mantendo a Cloud Routine remota como única fonte de verdade.

**Architecture:** Mudança de configuração via ferramenta MCP `scheduled-tasks` — não há código a escrever, não há testes automatizados a rodar. O "teste" é a verificação do estado da tarefa após a mudança.

**Tech Stack:** MCP `scheduled-tasks` tool (local), painel `claude.ai/code/routines` (verificação manual do usuário, fora do escopo de automação).

## Global Constraints

- Não apagar `C:\Users\User\.claude\scheduled-tasks\atualizar-agenda-macro-szuchmacher\SKILL.md` — só desabilitar a tarefa.
- Não alterar a Cloud Routine remota, o Worker `sz-sites`, `wrangler.jsonc` ou `agenda.js`.
- Não gerar nem tocar credenciais FTP além do que já foi corrigido nesta sessão.
- Rollback deve ser uma única chamada (reabilitar a tarefa) sem efeitos colaterais em produção.

---

### Task 1: Desabilitar a tarefa local `atualizar-agenda-macro-szuchmacher`

**Tool:** `mcp__scheduled-tasks__update_scheduled_task` (atualizar), `mcp__scheduled-tasks__list_scheduled_tasks` (verificar)

**Interfaces:**
- Consumes: `taskId: "atualizar-agenda-macro-szuchmacher"` (confirmado existente via `list_scheduled_tasks`, `enabled: true`, `cronExpression: "7 7 * * 5"`)
- Produces: mesmo `taskId` com `enabled: false`, verificável em qualquer chamada futura de `list_scheduled_tasks`

- [x] **Step 1: Confirmar estado atual antes da mudança**

Chamar `mcp__scheduled-tasks__list_scheduled_tasks` e localizar a entrada:
```json
{
  "taskId": "atualizar-agenda-macro-szuchmacher",
  "enabled": true,
  "cronExpression": "7 7 * * 5"
}
```
Expected: `enabled: true` (estado pré-mudança, já confirmado na sessão anterior).

- [x] **Step 2: Desabilitar a tarefa**

Chamar `mcp__scheduled-tasks__update_scheduled_task` com:
```json
{
  "taskId": "atualizar-agenda-macro-szuchmacher",
  "enabled": false
}
```
Expected: chamada retorna sucesso, sem erro.

- [x] **Step 3: Verificar que a mudança persistiu**

Chamar `mcp__scheduled-tasks__list_scheduled_tasks` novamente.
Expected: a entrada `atualizar-agenda-macro-szuchmacher` aparece com `enabled: false`. As demais 4 tarefas (`vixradar-noturno`, `vixradar-matinal`, `vixradar-agenda-semanal`, `fechamento-diario-szuchmacher`) permanecem `enabled: true`, inalteradas.

- [x] **Step 4: Reportar ao usuário e apontar a verificação manual pendente (item C da spec)**

Nenhum comando a rodar — este step é uma mensagem de texto para o usuário, não uma ação de sistema:

> "Tarefa local desabilitada. A Cloud Routine remota (`claude.ai/code/routines`) continua ativa e é agora a única fonte da agenda macro. Verificação pendente, só você consegue fazer: abrir `claude.ai/code/routines`, localizar `atualizar-agenda-macro-szuchmacher`, e confirmar que está `enabled` e que o prompt carregado lá gera o schema bilíngue atual (campos `evento_en`/`descricao_en`) publicando no Worker — não mais o array estático via FTP HostGator."

Não há commit de código neste task — a mudança vive inteiramente no store de scheduled-tasks (`C:\Users\User\.claude\scheduled-tasks\`), que não é um repositório git.

---

## Self-Review

**Spec coverage:** spec pede (1) desabilitar a tarefa local, (2) não apagar o SKILL.md, (3) não tocar Worker/Cloud Routine, (4) apontar verificação manual do painel. Todos os quatro cobertos no Task 1 (steps 2, implícito em não incluir remoção de arquivo, ausência de qualquer step tocando `cloudflare-workers/`, e step 4).

**Placeholder scan:** nenhum "TBD"/"implementar depois" — todos os payloads JSON e expectativas estão completos.

**Type consistency:** `taskId` usado de forma idêntica nos três steps (`"atualizar-agenda-macro-szuchmacher"`), consistente com o valor retornado por `list_scheduled_tasks` já observado na sessão.
