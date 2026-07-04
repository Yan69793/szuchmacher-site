# Consolidação da automação de agenda macro — szuchmacher.com.br

## Contexto

O calendário macro do site (`agenda-data.json`) é servido pelo Cloudflare Worker
`sz-sites`, que responde por toda a rota `szuchmacher.com.br/*`
(`cloudflare-workers/sz-sites/wrangler.jsonc`). O handler `src/handlers/agenda.js`
lê o JSON dos assets estáticos do próprio Worker — o HostGator (cPanel/FTP) não
serve mais tráfego real para esse domínio.

Existem hoje duas automações com o mesmo `routineId`
(`atualizar-agenda-macro-szuchmacher`, cron `7 7 * * 5`, sexta 07:07 BRT):

1. **Cloud Routine remota** (`claude.ai/code/routines`, `triggerType: schedule-remote`,
   registrada em 20/06/2026). Roda na infraestrutura Anthropic, PC desligado não afeta.
   Evidência de que está ativa e correta: o `agenda-data.json` em produção tem
   `gerado: 2026-07-03T07:07:00-03:00` (sexta, mesma janela do cron) com schema
   bilíngue rico — compatível com o pipeline atual do Worker.
2. **Tarefa local** (Windows Task Scheduler / `C:\Users\User\.claude\scheduled-tasks\
   atualizar-agenda-macro-szuchmacher\SKILL.md`). Aponta para um pipeline legado —
   upload FTP para `assets/agenda.php` no HostGator — que não é mais lido por
   nenhum tráfego real. Rodou em 04/07/2026 e falhou por senha FTP inválida; a
   falha não teve impacto em produção porque o alvo já era infraestrutura morta.

As duas cópias divergiram: a remota foi corrigida para o pipeline atual em algum
momento; a local ficou presa na versão antiga.

## Decisão

**Abordagem A** — aposentar a tarefa local, manter a Cloud Routine remota como
única fonte de verdade. Sem redesign de código: é uma mudança de configuração
(desabilitar a tarefa agendada local), não uma mudança de sistema.

Complementar (**C**) — verificação pontual do prompt atual da Cloud Routine no
painel `claude.ai/code/routines`, já que não há visibilidade local sobre se o
conteúdo executado lá hoje bate com o `SKILL.md` salvo neste PC (podem ter
divergido desde o registro em 20/06).

## O que muda

- Tarefa local `atualizar-agenda-macro-szuchmacher` (`mcp__scheduled-tasks`):
  `enabled: true` → `enabled: false`. O arquivo `SKILL.md` permanece no disco
  (não é apagado) para referência histórica.

## O que NÃO muda

- Cloud Routine remota continua rodando sem alteração.
- Worker `sz-sites`, `wrangler.jsonc`, handler `agenda.js`: nenhuma alteração.
- Credencial FTP `deploy@szuchmacher.com.br` (já corrigida nesta sessão):
  permanece válida, sem uso prático até que algum outro processo volte a
  precisar dela.

## Verificação

- `mcp__scheduled-tasks__list_scheduled_tasks` após a mudança: task aparece com
  `enabled: false`.
- Checagem manual (pelo usuário) do painel `claude.ai/code/routines`: confirmar
  que a Cloud Routine `atualizar-agenda-macro-szuchmacher` está `enabled` e que
  o prompt ali carregado gera o schema correto (campos `evento_en`,
  `descricao_en`, alvo = deploy do Worker, não FTP HostGator).

## Rollback

Reabilitar a tarefa local: `mcp__scheduled-tasks__update_scheduled_task` com
`enabled: true`. Sem efeitos colaterais em produção, já que o pipeline FTP que
ela usa não é lido por tráfego real.
