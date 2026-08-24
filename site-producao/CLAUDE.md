# CLAUDE.md — szuchmacher.com.br

## Estado do projeto

Página canônica de estado, legível por qualquer agente (não só Claude): `status/ESTADO.md`. Ler antes de começar sessão de trabalho, atualizar a data e os itens ao fechar uma sessão que mudou o estado.

## Identidade do projeto

Site institucional de advisory patrimonial independente de Yan Szuchmacher.

**Domínio:** https://szuchmacher.com.br (+ https://multi-assets.com)  
**Hosting:** Cloudflare Workers (`sz-sites`) — rotas nos 4 hostnames (apex + www)  
**Legado:** HostGator/FTP mantido só para rollback; **não é mais o deploy primário**  
**Deploy primário:** `.\scripts\deploy-cloudflare.ps1` (build + `wrangler deploy`)  
**Última migração confirmada:** 17/06/2026 (`Server: cloudflare`, Worker `sz-sites` ativo)

---

## Mapa de arquivos

| Arquivo | Função |
|---------|--------|
| `index.html` | Home institucional (~54 KB) |
| `relatorios.html` | Página de relatórios e PDFs |
| `multiasset.html` | Landing legada — em szuchmacher.com.br responde 301 para multi-assets.com |
| `consultoria.html` | Página de consultoria patrimonial — servida em `multi-assets.com/consultoria` |
| `multiasset-app.html` | App completo da plataforma (~275 KB) |
| `honorarios.html` | Tabela de honorários |
| `assinatura.html` | Página de assinatura |
| `privacidade.html` | Política de privacidade |
| `.htaccess` | Headers de segurança (CSP, HSTS, GZIP, redirects) |
| `prices.php` | Endpoint: ouro, prata, platina, BTC ao vivo |
| `macro_api.php` | Endpoint LLM via OpenRouter — 200, secret `OPENROUTER_KEY` no Worker |
| `macro_data.json` | Fallback estático do macro quando `macro_api.php` falha |
| `agenda-server.php` | Endpoint: agenda de eventos econômicos |
| `agenda-data.json` | Cache local da agenda |
| `market-data.php` | Endpoint: Ibovespa, S&P 500, WTI, Treasury 10y via Yahoo Finance |
| `market_data_cache.json` | Cache local do market-data.php (TTL 10 min, gerado automaticamente) |
| `assets/macro-panel.js` | Script que popula o painel macro no `index.html` (`macro-panel-live.js` é variante morta, sem referência em HTML) |
| `assets/sz-config.js` | Configuração central: GA4_ID, CLARITY_ID, FORMSPREE_ID |
| `assets/macro.php` | BCB SGS + Focus (Selic, IPCA, PTAX) — funcional |
| `assets/agenda.php` | Agenda ao vivo — funcional |
| `_arquivo/` | Backups e snapshots históricos — **não editar**, ignorado pelo git (só existe em disco) |
| `diagnosticos/` | Registros de diagnóstico de produção |
| `scripts/` | Scripts de deploy e manutenção |
| `cloudflare-workers/sz-sites/` | Worker de produção (HTML estático + APIs PHP portadas) |
| `cloudflare-workers/sz-sites/src/handlers/fechamento.js` | Proxy `/fechamento/:slug` → Worker briefing (leitura via site) |

---

## Dependências cruzadas

### `relatorio-diario-szuchmacher` — widget de fechamento na home

O bloco de fechamento de mercado em `relatorios.html` consome `relatorio_cache.json`.
Esse arquivo **não é gerado por este projeto**. Ele é produzido pelo pipeline do
projeto `E:\Diretorio\Claude\relatorio-diario-szuchmacher\` (task
`Szuchmacher-FechamentoDiario`, 19h dias úteis) e sincronizado para cá por
`scripts/sync_relatorio_cache.py` de lá, que chama o `deploy-cloudflare.ps1`
daqui.

Se o widget estiver desatualizado mas o restante do site funcionando, a causa
está no pipeline de lá, não neste Worker. Para sincronizar manualmente:

```powershell
cd E:\Diretorio\Claude\relatorio-diario-szuchmacher
python scripts/sync_relatorio_cache.py YYYYMMDD
```

A task `Szuchmacher-FechamentoDiario` e as outras tasks com prefixo
`Szuchmacher-` que não são `AgendaAgent` nem `MacroCronWatchdog`
**pertencem ao projeto `relatorio-diario-szuchmacher`, não a este**.
`MacroCron` local foi desabilitada em 15/08/2026. Procurar a causa de
falha nas tasks dos outros projetos aqui é caminho errado.

### Cloud Routine — pipeline remoto de domingo

Existe uma rotina que roda na nuvem (Claude Code Remote), sem depender desta
máquina: **`szuchmacher-domingo`**, cron `0 11 * * 0` (domingo 08:00 BRT),
environment `env_01DW1CsRC9cNGdotEAxnnJqk`, repo `yan69793/szuchmacher-site`.
Ela coleta dados macro, gera `macro_data.json` e `agenda-data.json`, e publica
via FTP no HostGator.

Isso significa que:
- Domingo de manhã o Worker **não** é a única via de publicação. A rotina remota
  sobe arquivos por FTP que o Worker serve do mesmo `public/`.
- A task local `Szuchmacher-AgendaAgent` também roda domingo 08:00. As duas
  podem colidir. A local publica via `publicar-com-rollback.ps1` (com
  validação e rollback), a remota vai direto por FTP.
- Desligar o Worker pensando que só a máquina local publica vai quebrar a
  rotina remota em silêncio.

Documentação completa em `docs/controle-remoto-claude-code.md`.

---

## Design system

### Craft (sofisticação institucional — 2026-07-18)

Não copiar a paleta de outros produtos. Copiar o **nível de craft**:
espaço generoso, hairline, peso tipográfico contido (serif 400), mono em
labels, hover sem bounce, grids com gap 1px, `border-radius: 0`.

### Paleta institucional (szuchmacher.com.br — `assets/sz-design.css`)

| Variável | Valor | Uso |
|----------|-------|-----|
| `--bg` | `#f3f1ec` | Fundo geral (papel quente) |
| `--surface` | `#ebe7e0` | Superfície alternada |
| `--surface-soft` | `#f8f6f2` | Cards e superfícies suaves |
| `--navy` | `#0c1524` | Primário — textos, CTAs, header dark |
| `--navy-soft` | `#172338` | Navy secundário |
| `--gold` | `#8c6b3a` | Acento, eyebrows |
| `--gold-soft` / `--gold-bright` | `#a88850` / `#c4a46a` | Acento suave / dark sections |
| `--text` | `#161c28` | Texto principal |
| `--muted` | `#5c6574` | Secundário |
| `--line` / `--line-strong` | rgba navy 0.09 / 0.14 | Hairlines |

**multi-assets.com** (`multiasset-app.html`): shell **dark** próprio
(`--bg #0a0c10`, ouro `#c4a46a`, texto `#e8e4d9`). Mesmo craft, paleta distinta.

### Tipografia

| Variável | Família | Pesos | Uso |
|----------|---------|-------|-----|
| `--font-serif` | Prata (site) / Playfair (multi) | **400** display | H1–H4, métricas |
| `--font-sans` | Public Sans (site) / DM Sans (multi) | 400–500 | Corpo |
| `--font-mono` | JetBrains Mono / DM Mono | 400–500 | Nav, labels, CTA |

### Convenções de layout

- `--max`: `1120px` (site) / `1280px` (multi app)
- `--radius`: `0`
- `.section`: `padding: 112px 0` (site)
- `.eyebrow`: mono, `0.64rem`, `letter-spacing: 0.14–0.16em`, weight 500, ouro
- Botões: mono uppercase, min-height 48px, sem shadow/lift
- Cards/offers: preferir grid `gap: 1px` sobre caixas com sombra

**Desvio de craft (peso 800/900, pill, glow, bounce) é regressão — corrigir antes de entregar.**

---

## Protocolo obrigatório

1. **Diagnóstico antes de qualquer edição.** Confirmar arquivo e linha com evidência antes de tocar código.
2. **Nunca subir para produção sem instrução explícita.** Edite local, entregue o arquivo completo + procedimento de deploy. Deploy Cloudflare via `deploy-cloudflare.ps1`; purge manual no painel CF se necessário.
3. **Entrega sempre em arquivo completo** — nunca diff parcial ou trecho isolado.
4. **Teste único em produção** — com URL, status HTTP e comparação com o esperado.
5. **CSP em produção vem do Worker `sz-sites`** (`src/utils/headers.js`). `.htaccess` só vale no legado HostGator.
6. **`assets/sz-config.js` é o único local de IDs externos.** Nunca duplicar GA_ID, CLARITY_ID ou FORMSPREE_ID em HTML.
7. **Para alterações não triviais, delegar a revisão final ao subagente `code-reviewer`** (`.claude/agents/code-reviewer.md`, **na raiz do repositório**, não em `site-producao/`). O agente implementador não pode substituir essa revisão por uma simples releitura própria. Após receber o parecer, corrigir todos os problemas materiais e rodar de novo as validações.

   O arquivo precisa ficar na raiz para ser descoberto. Até 30/07/2026 ele morava em `site-producao/.claude/agents/` e sessão aberta na raiz do repo ou em worktree não o enxergava, `subagent_type: 'code-reviewer'` respondia `Agent type not found` listando só os agentes globais. Se voltar a falhar assim, confira onde o arquivo está antes de concluir que ele não existe. Se o erro citar modelo inexistente em vez de agente, a causa é outra, `CLAUDE_CODE_SUBAGENT_MODEL` apontando para um modelo que o `ANTHROPIC_BASE_URL` em uso não serve, e aí nenhum subagente roda.

---

## Deploy

```powershell
# Primário — Cloudflare Workers (szuchmacher + multi-assets)
.\scripts\deploy-cloudflare.ps1

# Validação pós-deploy
curl.exe -sI "https://szuchmacher.com.br/"
curl.exe -sI "https://szuchmacher.com.br/assets/macro.php"
curl.exe -sI "https://multi-assets.com/prices.php"
```

- Worker: `cloudflare-workers/sz-sites` (`wrangler.jsonc`, conta `7ac79fb1030e4e81115ef33c21a9b070`)
- Build de assets: `scripts/build-cloudflare-public.ps1` (copia HTML/JS para `public/sz` e `public/multi`)
- Secrets no Worker: `OPENROUTER_KEY`, `BRIEFING_FETCH_TOKEN` (proxy fechamento)
- DNS: zonas CF ativas; custom domains no Worker via `attach-worker-domains.ps1`

### Automação semanal da agenda

Task do Windows `Szuchmacher-AgendaAgent`, **domingo + segunda + quinta às 08:00**, executa
`scripts/run-agenda-agent.ps1`.

Domingo é o gatilho que importa. `agenda_agent.py` (`janela_seg_sex`) devolve a segunda
**seguinte** quando roda no fim de semana, então a execução de domingo publica a semana que vai
começar. Segunda e quinta regeram a mesma janela com o calendário do IBGE atualizado e cobrem o
domingo em que a máquina estiver desligada. Sem o domingo, de sexta à noite até segunda 08:00 o
site servia a semana encerrada.

O rótulo do bloco na home é calculado no cliente por `assets/macro-panel.js`
(`rotuloJanelaAgenda`), comparando a janela com a data de hoje: `Esta semana`, `Próxima semana`
ou `Semana de referência`. **`Semana de referência` não é um título fixo: é o frontend
sinalizando que a janela publicada já passou.** Ver isso no ar significa pipeline parado.

Sequência do runner, parando no primeiro passo que falhar:

1. **Guarda de working tree** — aborta se houver mudança não commitada em arquivo que chega a
   produção. Ignora o que o build não copia (`scripts/`, `docs/`, `diagnosticos/`, `design/`,
   `multiasset-platform/`, `*.md`) e permite os dois `agenda-data.json` que a própria rotina
   reescreve. Denylist de diretório, não allowlist de arquivo: arquivo deployável novo cai no
   caso conservador, que é abortar.
2. **Interpretador** — resolve o Python por sondagem, não por `Test-Path`. Ordem: `venv`,
   `venv-py312`, `pythoncore-3.14-64`. Em 26/07/2026 o Python 3.11 base sumiu da máquina e
   `venv\Scripts\python.exe` continuou existindo como arquivo, só que morto; `Test-Path` passava
   e a rotina quebrava depois.
3. **Geração** — `agenda_agent.py --dry-run` grava `agenda-data.json`.
4. **Asserção de janela** — reprova se `janela.fim` for anterior a hoje.
5. **Publicação** — `scripts/publicar-com-rollback.ps1`, não `deploy-cloudflare.ps1`. O deploy
   direto não valida nada depois e não tem alvo de reversão.

Falha dispara `scripts/send-alert-email.ps1`. Log em
`automacao-yan-os/logs/agenda_scheduled_<data>.log`, relatório de publicação em
`diagnosticos/publicacao_<data>.md`.

```powershell
.\scripts\register-agenda-task.ps1            # registra ou atualiza a task
.\scripts\run-agenda-agent.ps1 -Simular       # guarda + geração + asserção, sem publicar
```

`-Simular` também suprime o e-mail de alerta.

### Legado FTP (rollback apenas)

- HostGator `sh00110.hostgator.com.br` — não usar para mudanças rotineiras após migração 17/06/2026
- `deploy-all.ps1` é Cloudflare-only desde 20/07/2026 (FTP removido dele) e aceita `-Purge`
- O caminho FTP legado é `scripts/deploy.sh` (bash, HostGator), usado só pela rotina remota `szuchmacher-domingo`

### Tarefas agendadas no Windows (visão completa)

Das tasks com prefixo `Szuchmacher-` no Task Scheduler desta máquina, as vivas
deste projeto estão na tabela abaixo. As demais são do
`relatorio-diario-szuchmacher` ou estão desabilitadas de propósito.

**Deste projeto (Site):**

| Task / gatilho | Schedule | O que faz |
|----------------|----------|-----------|
| `Szuchmacher-AgendaAgent` | dom+seg+qui 08:00 | Gera e publica `agenda-data.json` (escritor de produção) |
| Cron do Worker `sz-sites` | segunda 00:00 BRT (`0 3 * * MON` UTC) | Regenera o macro (`forceRefresh` interno). Primário. Disparo sem confirmação desde 17/08 |
| `Szuchmacher-MacroCronWatchdog` | segunda 09:00 BRT | Lê `macro_cron_last.ts` em `/health`. Se o nativo não deixou carimbo nesta segunda, chama `run-macro-cron.ps1` e avisa por e-mail. Fora do scheduler da Cloudflare |
| `Szuchmacher-MacroCron` | **desabilitada 15/08/2026** | Competia com o deploy das 08h, 429, alarme falso |

Registro da agenda: `scripts/register-agenda-task.ps1`.
`register-macro-task.ps1` só desabilita a MacroCron antiga, não a recria.
`register-macro-watchdog.ps1` registra o watchdog semanal e apaga o one-shot `Szuchmacher-CheckMacroCron-2026-08-24`.
`register-all-automation.ps1` registra agenda + watchdog e garante a MacroCron desligada.

**De outros projetos (não mexer aqui):**

| Task | Projeto |
|------|---------|
| `Szuchmacher-FechamentoDiario` | `relatorio-diario-szuchmacher` |
| `Szuchmacher-FechamentoWatchdog` | `relatorio-diario-szuchmacher` |
| `Szuchmacher-PreflightAnthropic` | `relatorio-diario-szuchmacher` |
| `Szuchmacher-ColetaManchetes` | `relatorio-diario-szuchmacher` |
| `Szuchmacher-MacroAgent` | `relatorio-diario-szuchmacher` |
| `Szuchmacher-AgendaMacro-Claude` | `relatorio-diario-szuchmacher` |
| `Szuchmacher-LeadNurture` | `relatorio-diario-szuchmacher` (desabilitada desde 08/ago/2026) |

### Projetos internos dentro do diretório Site

O diretório `E:\Diretorio\Claude\Site\` contém dois projetos com vida própria
que não são o site em si:

**`automacao-yan-os/`** — pipeline Python com 3 venvs (`venv-py312`,
`venv-task`, `venv-playwright`). Contém:

- `agents/agenda_agent.py` — geração da agenda econômica (chamado pelo
  AgendaAgent)
- `agents/macro_agent.py` — narrativa macro via LLM
- `agents/lead_nurture_agent.py` — nutrição de leads (task desabilitada)
- `monitor_mercado.py` — monitor intraday 09:00-18:45 com alertas
  WhatsApp/Telegram
- `qualificador_leads.py` — webhook Flask na porta 8765, scoring de leads
- `main.py` — orquestrador com flags `--manual`, `--sem-ia`, `--monitor`,
  `--leads`, `--instalar`, `--testar`
- `testar_sistema.py` — teste do pipeline YAN OS

Logs em `automacao-yan-os/logs/`. Cada rotina escreve seu próprio arquivo
(`agenda_scheduled_YYYYMMDD.log`, `macro_cron_YYYYMMDD.log`,
`lead_nurture_YYYYMMDD.log`).

**`atualizador-relatorios/`** — projeto Node.js independente. Lê PDFs de
fechamento da Mirabaud, extrai conteúdo e atualiza `index.html` e
`relatorios.html` via FTP. Comando: `node atualizar.js`. Dependências:
`pdf-parse`, `@anthropic-ai/sdk`, `cheerio`, `basic-ftp`, `dotenv`.

---

## Estado de produção (verificado 15/08/2026, Worker `f08d6f46`)

| Item | Status | Ação |
|------|--------|------|
| HTTPS / HSTS | ✅ | — |
| CSP — Formspree em `connect-src` e `form-action` | ✅ | — |
| logo.png (HTTP 200) | ✅ | — |
| Formspree `mojrayrl` | ✅ | — |
| GA4 | ➖ removido por decisão de arquitetura | Tracking roteado para Clarity (`window.ga`→Clarity, `sz-config.js`) |
| Microsoft Clarity | ✅ ativo (`SZ_CLARITY_ID = x89me5cgm8`) | — |
| Favicons (`favicon.ico`/`.svg`/`apple-touch-icon.png`) | ✅ gerados do logo, servidos em sz + multi | — |
| Hosting Cloudflare Workers | ✅ | `sz-sites` serve szuchmacher + multi-assets |
| `macro_api.php` | ✅ | Cache 7d + BCB + OpenRouter no Worker |
| `/fechamento/:slug` | ✅ | Proxy para Worker briefing; GET direto em workers.dev bloqueado |
| `market-data.php` | ✅ | IBOV, S&P 500, WTI, Treasury 10y, IB5M11 (chave `ntnb11`) ao vivo |
| `assets/macro.php` | ✅ | BCB ao vivo |
| `assets/agenda.php` | ✅ | Agenda ao vivo |
| `prices.php` | ✅ | Metais + BTC ao vivo |

---

## Endpoints

| Endpoint | HTTP | Descrição |
|----------|------|-----------|
| `/assets/macro.php` | 200 ✅ | BCB SGS + Focus: Selic, IPCA, PTAX |
| `/assets/agenda.php` | 200 ✅ | Agenda de eventos econômicos da semana |
| `/prices.php` | 200 ✅ | Ouro, prata, platina, Bitcoin |
| `/macro_api.php` | 200 ✅ | Narrativa macro via LLM. Cascata a frio chega a ~30 s; `macro_data.json` é o fallback |

---

## Configuração central — `assets/sz-config.js`

Único arquivo que contém IDs externos. Propagado automaticamente para todas as páginas.

Para ativar GA4 e Clarity, substituir as linhas:

```js
window.SZ_GA_ID      = 'G-XXXXXXXXXX';   // Google Analytics 4 Measurement ID
window.SZ_CLARITY_ID = 'XXXXXXXXXX';     // Microsoft Clarity Project ID
// Formspree já configurado:
window.SZ_FORMSPREE_ID = 'mojrayrl';
```

Após editar: upload apenas de `assets/sz-config.js` — nenhum HTML precisa ser tocado.

---

## Pendências abertas (prioridade)

Fase 2 no ar desde 15/08/2026 08:17 BRT (Worker `f08d6f46`, rollback
`b4c3ba12`). Relatório: `diagnosticos/FASE2-2026-08-15.md`. Gate 34/34, com
`ntnb11` no `NaoContem` depois que o IB5M11 já estava em produção (`f4308a7`).

1. **Cron nativo do macro ainda sem prova de disparo automático.** Watchdog
   semanal no ar desde 22/08: `Szuchmacher-MacroCronWatchdog` (segunda 09:00
   BRT) roda `scripts/check-macro-cron.ps1`, compara `macro_cron_last.ts` em
   `/health` com a segunda mais recente 03:00 UTC ±2 h e, se o carimbo não
   cair na janela, dispara `run-macro-cron.ps1` (reserva HTTP) e e-mail.
   Só o dispatcher escreve o carimbo (`runScheduledMacro`). Refresh via
   `cron=1` não toca. One-shot `CheckMacroCron-2026-08-24` foi substituída
   por essa task. Primeira prova real: 24/08 09:00. Se a máquina estiver
   desligada, `StartWhenAvailable` dispara no boot. Se o nativo falhar de
   novo, a reserva segura o painel e o e-mail pede caso no suporte CF
   (eventos `origin=cron` no Observability). Não meter essa checagem no
   `validar-producao.ps1` (portão de deploy).
2. **CSP sem unsafe-inline** (refatoração grande, precisa de escopo próprio).
3. **F5 cache-busting** manual e inconsistente (P2 no doc original, escopo
   próprio).
4. **Limpeza opcional no cPanel.** O job físico `agenda-cron.php` segue
   registrado no painel, mas está inerte na borda desde 17/08 (refresh
   rejeitado com 403 após a rotação do `CRON_SECRET`). Desligar no painel
   quando houver login do cPanel resolve também o P3-15 (calendários 2026
   hardcoded). Sem risco operacional enquanto isso.

### Resolvidas em 2026-08-24

- **Cron nativo do macro disparava domingo, não segunda. Causa raiz fechada.**
  A Cloudflare numera dia da semana como Quartz, `1` = domingo e `7` = sábado,
  não como Unix cron. Doc oficial em `workers/configuration/cron-triggers`, com
  nota explícita e o exemplo `0 17 * * sun` equivalente a `0 17 * * 1`. Logo o
  schedule `0 3 * * 1` do `wrangler.jsonc` agendava **domingo 03:00 UTC**. Os
  três carimbos batem sem sobra: disparo em 16/08 e 23/08 (domingos), janela de
  segunda 24/08 vazia. O Worker nunca ficou mudo, só nunca foi agendado para
  segunda. Corrigido para `0 3 * * MON` no `wrangler.jsonc`, com o fallback do
  `index.js`, o comparador do `check-macro-cron.ps1` e os textos de registro
  alinhados. Primeira prova real na segunda 31/08 09:00 BRT.
  A mudança tem que morar no `wrangler.jsonc`: a rotina de publicação das 08:00
  redeploya e reescreve o schedule, então ajuste feito só no painel volta atrás.
- **`check-macro-cron.ps1` afirmava regeneração que não houve.**
  `run-macro-cron.ps1` sai 0 tanto em regeneração real quanto no SOFT-OK de
  rate limit. Em 24/08 o watchdog logou `reserva HTTP regenerou` depois de
  quatro tentativas 429/503. O painel estava fresco por causa do deploy das
  08:00, não da reserva. O bloco agora relê `/health` e registra o
  `macro_cache` real em vez da alegação.

### Resolvidas em 2026-08-19

- **Cron nativo do macro: cascata e credenciais provadas.**
  Consolidou os itens 1 e 2 antigos. Verificado via API Cloudflare em 17/08 que
  o schedule estava registrado no `sz-sites` e o `scheduled(event, env, ctx)`
  no código deployado, além de cascata LLM, chave OpenRouter e `CRON_SECRET`
  funcionando. **A conclusão de que a config estava correta era falsa**: a
  expressão registrada era `0 3 * * 1`, que na numeração da Cloudflare é
  domingo. Ver a entrada de 24/08 acima. Evidência do que de fato foi provado
  em `diagnosticos/DIAGNOSTICO-2026-08-17.md` §11.2 e §11.3.
- **`CRON_SECRET` e rotina remota `szuchmacher-domingo`.** O caminho FTP da
  rotina (`deploy.sh`) não usa o segredo, e o `scheduled()` do Worker não
  passa pelo token. O único refresh com segredo é o dos scripts locais
  (`run-macro-cron.ps1`, `invalidate-worker-cache.ps1`), que leem o `.env`
  do `automacao-yan-os` com o valor novo. O prompt hospedado do trigger não
  pôde ser inspecionado desta sessão (o MCP `Claude_Code_Remote` não está
  disponível aqui), então fica registrado: numa sessão com esse MCP,
  conferir se o prompt tem chamada `macro_api.php?cron=1` com
  `X-Cron-Secret` antigo (o plano histórico de 2026-06-14 tinha um curl sem
  token). Mesmo se tiver, o efeito é um 403 no refresh, a publicação via
  FTP continua. Confirmação pendente é de verificação, não de operação.
- **`hero-*` legado removido (decisão do operador de 2026-08-19).**
  `hero-editorial.css`, `hero-editorial.js` e `hero-switch.js` apagados e
  tirados do `$szAssets` do `build-cloudflare-public.ps1`. Nenhum HTML
  referenciava, o A/B estava inativo. `revert-hero.ps1` apagado (procurava
  `SZ_HERO_VARIANT`, que já não existe). `HERO-REVERT.md` arquivado em
  `_arquivo/` (fora do git).

### Resolvidas em 2026-08-17

- **Spread IPCA+ (7,5%) recalibrado contra mercado e mantido.** Taxas NTN-B
  longas em 14/08/2026 (Valor Investe): IPCA+ 2040 = 7,66%, 2050 = 7,40%;
  curva Bianco mai/26: NTN-B 10y = 7,50%. O 7,5% fica no centro da faixa.
  O yield oficial do IMA-B 5+ (lâmina ANBIMA) não está publicado em fonte
  acessível; quando estiver, recalibrar de novo. Comentário de calibração
  atualizado em `cloudflare-workers/sz-sites/src/handlers/ntnb-scenarios.js`.
- **`multiasset/` duplicada não existe mais.** Verificado 17/08: não há pasta
  `multiasset/` em `site-producao`, só a origem em `Site\multiasset`.

- **Publicação semanal do macro passou a validar e ter rollback.**
  `run-macro-agent.ps1` estava órfão e quebrado (exigia
  `automacao-yan-os\venv`, que não existe mais), e a task publicava com
  `deploy-all.ps1`, que não valida nada nem reverte.

  Conserto: a resolução do interpretador virou sondagem, e a sonda **importa
  as dependências reais**, não só checa versão. Isso importa aqui mais que no
  agenda: `macro_agent.py` faz `from config import ...` no topo, `config.py`
  importa `dotenv`, `coletor.py` importa `requests`. Medido em 17/08,
  `venv-py312` e `venv-playwright` têm Python 3.12 vivo e passariam numa sonda
  só de versão, mas não têm `dotenv`. Uma cópia literal do padrão do agenda
  teria escolhido `venv-py312` e quebrado em `ModuleNotFoundError` depois de
  o script já ter se declarado pronto. Único candidato válido hoje é
  `venv-task` (3.12.13, com `dotenv` e `requests`).

  O arquivo também passou a ser **ASCII puro sem BOM**, igual ao
  `run-agenda-agent.ps1`. O BOM que ele carregava existia só por causa de
  acento e travessão em comentário, que o PowerShell 5.1 do Task Scheduler lê
  errado sem BOM (commit `c2f69ff`). Sem caractere não-ASCII, a dependência
  do BOM some.

  Task `Szuchmacher-MacroAgent` repontada para
  `powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ...\run-macro-agent.ps1`,
  mesmo padrão do AgendaAgent. Gatilho preservado (sexta 18:00, próxima
  21/08). Backup do XML anterior em
  `diagnosticos/backup-task-MacroAgent-20260817.xml`.

  Verificado: sintaxe 0 erro, `test-scripts.ps1` OK incluindo checagem de
  `ErrorActionPreference`, sondagem resolvendo para `venv-task`, sem BOM e
  sem não-ASCII. **Não rodado ponta a ponta**, porque o passo final publica.
  Detalhe em `diagnosticos/DIAGNOSTICO-2026-08-17.md` §12.

- **Guarda de working tree portada para o `run-macro-agent.ps1`.**
  `Get-MudancasDeployaveis` copiada do `run-agenda-agent.ps1`, com as três
  listas (`$NAO_DEPLOYAVEL`, `$ARTEFATOS_DE_PIPELINE`, `$COPIADO_POR_GLOB`) e
  o passo de aborto antes da geração. `macro_data.json` já estava na lista de
  artefatos de pipeline, então a rotina não bloqueia a própria saída. Testada
  contra a árvore real: ignora `.md` e arquivo em `site-producao/scripts/`,
  veredito "passaria". Fecha o último buraco da cadeia de publicação semanal.

- **Macro regenerado sob demanda às 05:23 BRT** via `run-macro-cron.ps1`
  (`gerado=17/08/2026, 05:23 BRT cache=False`, exit 0, 36 s). Segunda prova de
  que a cascata e o `CRON_SECRET` funcionam quando o handler é invocado, o que
  reforça que o problema de §11.3 está no despacho do cron, não no código.
  Empurra o vencimento do cache de 7 dias para 24/08 05:23.

- **Rate limit nativo Cloudflare no `/relatorio-signup`** aplicado nas duas
  zonas (ruleset `ca6211cde...` em szuchmacher, `5da457611...` em
  multi-assets), phase `http_ratelimit`, block, `ip.src + cf.colo.id`.
  As zonas são **Free Website** (o plano pago é o de Workers, produto
  diferente), e o Free só aceita `period: 10` e `mitigation_timeout: 10`,
  ambos recusados pela API em qualquer outro valor. Ficou 5 req por 10 s,
  bloqueio de 10 s. Proteção fraca de propósito por limite de plano, corta
  rajada e não substitui o controle da aplicação (3 por 15 min em KV) nem
  cobre flood distribuído. Verificado que POST legítimo ainda chega ao
  Worker (422 de validação, `CF-Ray` presente). Rollback é apagar a regra
  no painel. Detalhe em `diagnosticos/DIAGNOSTICO-2026-08-17.md` §11.5.
- **Overflow 320 do MultiAsset fechado** (`5d4d115` + deploy `d87f95be`).
  `.geo-main-grid > * { min-width: 0 }`. Playwright pós-deploy: `warnings: []`
  nos 6 viewports.

- **CRON_SECRET no `?cron=1` confirmado em produção.** Testado sem header:
  `403` com o corpo exato do código (`"Refresh não autorizado: CRON_SECRET
  ausente ou token inválido"`). O item 3 antigo desta lista ("código no
  repo, ainda não publicado") estava desatualizado, o deploy já tinha ido
  ao ar em algum momento entre o commit `3a5cbcf` (15/08) e a auditoria de
  17/08. `sz-sites` mostra último deploy `2026-08-16T11:00:45Z`.
- Suíte de testes do Worker subiu de 47 para **56/56**, com a cobertura nova
  de `CRON_SECRET`/`coerceLlmContent` do mesmo commit.
- Auditoria completa (`/szuchmacher-audit`) rodada, gate 34/34, zero P0/P1.
  Achado novo (não resolvido): cron nativo sem rastro de disparo, ver item 1
  da lista de pendências acima.
- `assets/macro-panel-live.js` já não existe no disco — zero referências em
  qualquer arquivo, item já estava moot antes desta sessão.
- `git worktree prune` rodado — removida referência órfã a
  `E:/Diretorio/Claude/Site/.claude/worktrees/compassionate-herschel-6ea761`
  (caminho pré-reorg de 12/08, diretório já não existia). Worktree do Traycer
  (`C:/Users/User/.traycer/worktrees/...`) está ativo, não tocado.

### Resolvidas em 2026-08-15

- Pacote da fase 2 publicado via `publicar-com-rollback.ps1` (v `f08d6f46`).
- Commit e merge em master (`cedcdad`, `4a48002`, `c2f69ff`, `f4308a7`, `11d9a92`).
- Checagem de `ntnb11` no gate, só depois que o IB5M11 já estava no ar.
- `Szuchmacher-MacroCron` desabilitada. Um escritor de agenda (Agent local) e
  um gatilho de macro (cron do Worker).
- Causa raiz do KV `macro-api` vazio: `scheduled()` tratava Response 503 como
  sucesso, `coerceLlmContent` não existia (content em array virava
  `llm_json_fallback`) e o refresh de 11/08 22:04 BRT caiu em
  `clientDisconnected` no meio da cascata (7 subrequests). Código no repo,
  aguarda deploy.

### Resolvidas em 2026-08-09

- **Cal.com** — conta criada, link de agendamento configurado. `SZ_CALCOM_URL` em `assets/sz-config.js` atualizado para `https://cal.com/yan-szuchmacher-bblyrf/30min`.

- **Contraste `--gold` em fundo claro** — `--gold: #8c6b3a` trocado por `#7a5e33` em `assets/sz-design.css`. Atinge 4.5:1 em `--bg` (#f3f1ec), aprovando WCAG AA.
- **Enquadramento CVM, texto remanescente** — o texto da Carta (hero, FAQ, footer) descreve pesquisa macro e fechamentos de mercado como "research impessoal", sem recomendação individual. Com o Radar ROIC descontinuado (2026-07-22), o conteúdo não tem mais ranking de ativos nem tese por ação. O texto atual é preciso para o escopo do produto. Revisão jurídica formal segue recomendada, mas não há exposição nova a mitigar.
- **`wrangler` 4.101.0 com 4 vulnerabilidades altas** — `undici`, `ws` e `esbuild` entravam transitivamente. Subiu para 4.112.0 (`package.json` do Worker, `devDependencies.wrangler: ^4.112.0`). Confirmado no disco: `wrangler@4.112.0`.
- **Token CF Cache Purge** — `setup-cloudflare-purge-token.ps1` existe e funciona. A pendência é de credencial (criar o token no painel Cloudflare com permissão Zone > Cache Purge > Purge nas duas zonas), não de código. Script valida token contra a API, testa purge em ambas as zonas, e grava no `.env`. Mitigação existente (invalidação KV no deploy) cobre o caso mais comum.
- **Sitemap do multi-assets.com** — criado `sitemap-multi.xml` com 4 URLs (/, /consultoria, /metodologia, /privacidade.html). Adicionado ao `build-cloudflare-public.ps1` (cópia para `public/multi/`) e ao `validar-producao.ps1` (check de produção).
- **CSP — beacon Cloudflare** — `static.cloudflareinsights.com` ja esta no CSP do Worker (`src/utils/headers.js:3`) desde a migracao. Nao havia falha, o dominio sempre esteve allowlisted. Item era nota de "opcional", nao bug.

### Resolvidas em 2026-07-22

- **Radar ROIC descontinuado** — o produto rankeava ações por ROIC com carteira-modelo e tese por ativo, igual pra todo assinante, estrutura de relatório de análise (Res. CVM 20/2021, exige registro de analista) e não de consultoria individualizada (Res. CVM 19/2021, o registro que existe). Removido de `assinatura.html` (hero, filosofia, metodologia, tiers, FAQ, CTA, footer, CSS órfão, grid da filosofia ajustado de 3 para 2 colunas), arquivo `radar-roic.html` apagado, redirect 301 para `assinatura.html` adicionado no Worker (`src/index.js`, mesmo padrão do `/ebook`), saiu do `sitemap.xml` e dos scripts `validar-producao.ps1` (checagem agora espera 301) e `build-cloudflare-public.ps1` (saiu da lista de arquivos copiados e da de obrigatórios). `setup-stripe.ps1` teve a descrição do plano Carta reescrita sem citar Radar ROIC, mas isso só vale para uma recriação futura do produto: `Get-OrCreateProduct` reaproveita o produto existente pelo `lookup_key` e não atualiza descrição já publicada, então se o texto do produto "Carta Szuchmacher" no dashboard do Stripe ainda citar Radar ROIC, só edição manual lá resolve. Não alterado: os textos de marketing e planejamento já publicados (`docs/marketing/*.md`, `docs/FASE1-STACK.md`) que citam Radar ROIC, deixados como registro histórico

### Resolvidas em 2026-07-19

- **Stripe live** — `assets/sz-config.js:15-16` agora tem os Payment Links live (commit `5a2e504`); a guarda `ready()` reprova `test_*` e a validação de produção confirma. Cobrança operante

### Resolvidas em 2026-07-18

- PDF de amostra 404 em `relatorios.html` — não há mais nenhuma referência a PDF na página
- `HEAD → 500` nas rotas HTML do Worker — HEAD e GET respondem 200 nos dois domínios
- `macro_api.php` 503 — endpoint em 200
- Sitemap com 301/404 — `multiasset.html`, `multiasset-app.html` e `consultoria.html` saíram da lista
