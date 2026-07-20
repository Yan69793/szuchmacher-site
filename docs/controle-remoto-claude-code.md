# Controle remoto do Claude Code (Claude Code Remote)

> Instalado/documentado: 2026-07-19
> MCP: `Claude_Code_Remote` (ferramentas `mcp__Claude_Code_Remote__*`)
> Catálogo de tools: [`mcps/claude-code-remote/`](../mcps/claude-code-remote/)

O **controle remoto** é a camada que deixa o Claude Code rodar tarefas deste
repositório na nuvem, sozinho, em horário agendado — sem depender do PC do Yan
ligado. É o que já publica o site toda semana. Este documento explica como ele
funciona, o que já está no ar, e como criar/pausar/remover rotinas.

---

## O que é (em uma frase)

Um servidor MCP da Anthropic (`Claude_Code_Remote`) que expõe **Routines**
(gatilhos agendados via cron), **check-ins** (`send_later`), **notificações
push** no celular e **monitoramento de PR** — tudo operando dentro de um
*environment* de nuvem que já tem este repositório clonado.

Não é um servidor que se instala com `npx`. Ele é injetado pela plataforma
(Claude Code na web / app). "Instalar" aqui significa deixá-lo de primeira
classe no repositório: catalogar as tools e documentar a operação.

---

## Estado atual (já está ativo)

| Item | Valor |
|------|-------|
| Environment | **Default** — `env_01DW1CsRC9cNGdotEAxnnJqk` (`anthropic_cloud`) |
| Repo em escopo | `yan69793/szuchmacher-site` |
| Rotina de produção | **`szuchmacher-domingo`** — cron `0 11 * * 0` (domingo 11:00 UTC ≈ 08:00 BRT) |

A rotina `szuchmacher-domingo` roda **toda semana**: coleta dados macro
(BCB/Selic/IPCA, câmbio, commodities, cripto), gera `macro_data.json` e
`agenda-data.json`, publica via FTP no HostGator e verifica em produção
(`macro_api.php` e `assets/agenda.php`). É o pipeline editorial semanal do site,
já automatizado na nuvem.

> ⚠️ **Segurança:** o prompt dessa rotina hoje carrega credenciais de FTP em
> texto puro. Rotinas não têm cofre de segredos exposto por aqui, então trate
> esse prompt como sensível: **não copie o conteúdo dele para dentro do repo**
> (o `.gitignore` já barra `*[Ss]enha*`/`*[Ss]ecret*`) e considere rotacionar a
> senha `deploy@` se ela circular. Nada de credencial neste documento.

---

## Ferramentas disponíveis

Snapshot completo dos schemas em [`mcps/claude-code-remote/tools/`](../mcps/claude-code-remote/tools/).

| Tool | Para quê |
|------|----------|
| `create_trigger` | Cria uma Routine (cron ou disparo único). Três modos de destino (abaixo). |
| `list_triggers` | Lista as Routines da conta (pega os `trig_...` para editar/apagar). |
| `update_trigger` | Renomeia, troca o cron, **liga/desliga** (`enabled`) ou muda o modelo. |
| `delete_trigger` | Remove uma Routine de vez. |
| `fire_trigger` | Dispara uma Routine **agora**, fora do horário (com texto extra opcional). |
| `send_later` | Agenda **uma** mensagem de volta para esta sessão (auto check-in). |
| `subscribe_pr_activity` | Passa a receber comentários/CI/reviews de um PR nesta sessão. |
| `unsubscribe_pr_activity` | Para de acompanhar o PR. |
| `list_environments` | Lista os environments de nuvem (pega o `env_...`). |
| `list_repos` | Lista os repositórios acessíveis. |
| `add_repo` | Adiciona um repo ao escopo da sessão. |
| `register_repo_root` | Sinaliza que um repo recém-clonado está pronto (carrega CLAUDE.md/skills). |

---

## Como criar uma Routine

`create_trigger` tem três **modos de destino**:

1. **Sessão nova a cada disparo** (`create_new_session_on_fire: true`) — cada
   execução começa do zero. É o modo das automações de produção (o
   `szuchmacher-domingo` usa isto). Escreva o prompt como uma instrução
   **completa e autossuficiente**.
2. **Fixa nesta sessão** (padrão) — o disparo continua *esta* conversa. Bom para
   retomar um trabalho em andamento.
3. **Fixa em outra sessão** (`persistent_session_id`) — acorda uma sessão irmã
   específica.

Cron é de 5 campos, intervalo mínimo **de hora em hora**. Exemplos:

| Cron | Quando |
|------|--------|
| `0 11 * * 0` | Domingo 11:00 UTC (rotina atual do site) |
| `0 11 * * 1-5` | Dias úteis 11:00 UTC (≈ 08:00 BRT) |
| `0 21 * * 5` | Sexta 21:00 UTC — fechamento da semana |

Esqueleto (pseudo-chamada da tool):

```
create_trigger(
  name: "site-health-diario",
  cron_expression: "0 11 * * 1-5",
  create_new_session_on_fire: true,
  environment_id: "env_01DW1CsRC9cNGdotEAxnnJqk",
  notifications: { push: true, email: false },
  prompt: "Instrução completa e autossuficiente do que rodar…"
)
```

Para um disparo **único** em vez de recorrente, use `run_once_at` (RFC3339, ex.
`2026-07-20T11:00:00Z`) no lugar de `cron_expression`.

---

## Notificações push

`notifications` só vale para rotinas que criam **sessão nova por disparo**
(`create_new_session_on_fire: true`):

- `{ push: true }` — avisa o celular quando um run termina com algo relevante.
- `{ push: true, email: true }` — manda também por e-mail.
- `{}` — silencia todos os canais.

Para rotinas fixas numa sessão, o campo é rejeitado (a notificação vem pelo
fluxo normal da sessão).

---

## Check-in único (`send_later`)

Agenda **uma** mensagem de volta para *esta* sessão. Útil para "me lembra de
reverificar o deploy daqui a 1h":

```
send_later(message: "Rechecar se o macro_api.php já reflete o novo macro_data.json", delay_minutes: 60)
```

Escreva a mensagem assumindo o contexto atual — a sessão continua, não recomeça.
Retorna um `trig_...` que dá para cancelar com `delete_trigger`.

---

## Acompanhar um Pull Request

Depois de abrir/achar um PR neste repo, `subscribe_pr_activity` passa a entregar
comentários, status de CI e reviews **dentro desta sessão** (como mensagens
`<github-webhook-activity>`), para o Claude reagir e corrigir:

```
subscribe_pr_activity(owner: "yan69793", repo: "szuchmacher-site", pullNumber: 42)
```

Para parar: `unsubscribe_pr_activity(...)`. A assinatura só termina de fato
quando o PR é **merged** ou **closed**.

---

## Gerenciar o que já existe

```
list_triggers()                                   # descobre os trig_... ativos
update_trigger(trigger_id: "trig_…", enabled: false)   # pausa sem apagar
update_trigger(trigger_id: "trig_…", cron_expression: "0 12 * * 0")  # remarca
fire_trigger(trigger_id: "trig_…")                # roda agora, fora do horário
delete_trigger(trigger_id: "trig_…")              # remove de vez
```

`update_trigger ... enabled:false` é o jeito reversível de "desligar" uma rotina;
`delete_trigger` é definitivo.

---

## Boas práticas para este repo

- **Sem segredos no prompt da rotina.** Credenciais de FTP/API não entram nem no
  repo nem em documentação. Se uma rotina precisar delas, mantenha o prompt fora
  do versionamento e trate-o como `.env`.
- **Rotinas de produção = sessão nova por disparo**, prompt autossuficiente, e
  verificação em produção no final (curl no endpoint), como faz a
  `szuchmacher-domingo`.
- **Reporte em PT-BR simples** no fim de cada run (é a convenção das automações
  do Yan): verde/amarelo/vermelho + a evidência.
- **Cron em UTC.** Brasília = UTC−3. Escolha o horário lembrando dessa diferença.
- Uma rotina que só monitora e não achou nada deve **reagendar em silêncio**,
  sem mandar mensagem nem comentar — evita ruído.
