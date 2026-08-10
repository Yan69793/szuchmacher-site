# CLAUDE.md — szuchmacher.com.br

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
| `macro-panel-live.js` | Script que popula o painel macro no `index.html` |
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

A task `Szuchmacher-FechamentoDiario` e as outras 6 tasks com prefixo
`Szuchmacher-` que não são `AgendaAgent` nem `MacroCron` **pertencem ao projeto
`relatorio-diario-szuchmacher`, não a este**. Procurar a causa de falha nelas
aqui é caminho errado.

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
7. **Para alterações não triviais, delegar a revisão final ao subagente `code-reviewer`** (`.claude/agents/code-reviewer.md`). O agente implementador não pode substituir essa revisão por uma simples releitura própria. Após receber o parecer, corrigir todos os problemas materiais e rodar de novo as validações.

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

```powershell
.\scripts\deploy-all.ps1 -FtpOnly   # se existir flag; senão deploy-all sem -Cloudflare
```

- HostGator `sh00110.hostgator.com.br` — não usar para mudanças rotineiras após migração 17/06/2026

### Tarefas agendadas no Windows (visão completa)

Das 9 tasks com prefixo `Szuchmacher-` no Task Scheduler desta máquina, **só 2
são deste projeto**. As outras 7 são do `relatorio-diario-szuchmacher`.

**Deste projeto (Site):**

| Task | Schedule | O que faz |
|------|----------|-----------|
| `Szuchmacher-AgendaAgent` | dom+seg+qui 08:00 | Gera e publica `agenda-data.json` |
| `Szuchmacher-MacroCron` | segunda 09:00 | Dispara `macro_api.php?cron=1` para regenerar `macro_data.json` |

Registro: `scripts/register-agenda-task.ps1`, `scripts/register-macro-task.ps1`,
ou `scripts/register-all-automation.ps1` para as duas de uma vez.

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

## Estado de produção (verificado 09/08/2026)

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
| `market-data.php` | ✅ | IBOV, S&P 500, WTI, Treasury 10y via Yahoo Finance ao vivo |
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

Nenhuma pendência aberta no momento.

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
