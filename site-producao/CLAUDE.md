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

> **Rota ≠ arquivo.** As rotas terminadas em `.php` são atendidas por handlers
> JavaScript no Worker; os `.php` de mesmo nome não são executados nem publicados.
> Ao mexer num endpoint, edite o handler em `cloudflare-workers/sz-sites/src/handlers/`.

| Arquivo | Função |
|---------|--------|
| `index.html` | Home institucional (~35 KB) |
| `relatorios.html` | Página de relatórios, cotações ao vivo e inscrição no fechamento |
| `multiasset.html` | Landing legada — 301 para multi-assets.com; **não entra no build** |
| `consultoria.html` | Página de consultoria patrimonial — servida em `multi-assets.com/consultoria` |
| `multiasset-app.html` | App completo da plataforma (~343 KB) |
| `honorarios.html` | Tabela de honorários |
| `assinatura.html` | Página de assinatura |
| `privacidade.html` | Política de privacidade |
| `.htaccess` | Headers do legado HostGator. **Não vale em produção** — ver protocolo 5 |
| `macro_data.json` | Fallback estático do macro quando o LLM falha |
| `agenda-data.json` | Fonte da agenda — servida a partir do bundle, muda só com deploy |
| `relatorio_cache.json` | Conteúdo do último fechamento. Gerado por pipeline externo, **gitignored** e opcional no build |
| `assets/sz-config.js` | Configuração central: CLARITY_ID, FORMSPREE_ID, Stripe, WhatsApp, Cal.com |
| `_arquivo/` | Backups e snapshots históricos — **não editar**, ignorado pelo git (só existe em disco) |
| `diagnosticos/` | Registros de diagnóstico de produção (gitignored) |
| `scripts/` | Scripts de deploy e manutenção |
| `cloudflare-workers/sz-sites/` | Worker de produção (HTML estático + endpoints em JS) |

### Handlers do Worker (`cloudflare-workers/sz-sites/src/`)

| Handler | Rota | Função |
|---------|------|--------|
| `handlers/prices.js` | `/prices.php` | Ouro, prata, platina, BTC |
| `handlers/market-data.js` | `/market-data.php` | IBOV, S&P 500, WTI, Treasury 10y, NTN-B |
| `handlers/relatorio-prices.js` | `/relatorio-prices.php` | Cotações dos cards de `relatorios.html` (formato plano, inclui `usd_brl` via PTAX) |
| `handlers/macro-api.js` | `/macro_api.php` | Narrativa macro via OpenRouter, cache 7d em KV |
| `handlers/macro-panel.js` | `/assets/macro.php` | BCB SGS + Focus (Selic, IPCA, PTAX, PIB) |
| `handlers/agenda.js` | `/assets/agenda.php` | Serve `agenda-data.json` do bundle |
| `handlers/fechamento.js` | `/fechamento/:slug` | Proxy para o Worker briefing, com token |
| `handlers/stripe-webhook.js` | `/stripe-webhook` | `checkout.session.completed` → e-mail de boas-vindas |
| `handlers/relatorio-signup.js` | `/relatorio-signup` | Inscrição no fechamento (KV + Resend) |
| `utils/market.js` | — | `fetchYahoo` e `bcbSgs` compartilhados |
| `utils/headers.js` | — | CSP e cabeçalhos de segurança de **toda** resposta |

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
- Cron do Worker: `0 3 * * 1` (`wrangler.jsonc`) → `scheduled()` recarrega o macro via OpenRouter.
  **Não cobre a agenda:** `agenda-data.json` sai do bundle, então só muda com `wrangler deploy`.
- DNS: zonas CF ativas; custom domains no Worker via `attach-worker-domains.ps1`

### Secrets no Worker (`wrangler secret put <nome>`)

| Secret | Sem ele |
|--------|---------|
| `OPENROUTER_KEY` | `/macro_api.php` cai no fallback `macro_data.json` |
| `BRIEFING_FETCH_TOKEN` | `/fechamento/:slug` responde 503 |
| `RESEND_API_KEY` | `/relatorio-signup` responde 500 em **toda** inscrição |
| `STRIPE_WEBHOOK_SECRET` | `/stripe-webhook` responde 503 e nenhum comprador recebe o e-mail |

### Legado FTP (rollback apenas)

```bash
bash scripts/deploy.sh [index|relatorios|multiasset|multiasset-app|agenda-data|logo|all]
```

- HostGator — não usar para mudanças rotineiras após a migração de 17/06/2026.
- Publicar por FTP **não muda o que o site serve** enquanto o Worker estiver ativo.
  A verificação do script é opt-in via `LEGACY_VERIFY_BASE` justamente porque checar
  `szuchmacher.com.br` daria um verde falso, vindo do Cloudflare.

---

## Estado de produção (verificado 17/06/2026)

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

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/assets/macro.php` | GET | BCB SGS + Focus: Selic, IPCA, PTAX, PIB |
| `/assets/agenda.php` | GET | Agenda de eventos econômicos da semana |
| `/prices.php` | GET | Ouro, prata, platina, Bitcoin |
| `/market-data.php` | GET | IBOV, S&P 500, WTI, Treasury 10y, NTN-B |
| `/relatorio-prices.php` | GET | Cotações dos cards de `relatorios.html` |
| `/macro_api.php` | GET | Narrativa macro via LLM. Cascata a frio chega a ~30 s; `macro_data.json` é o fallback |
| `/fechamento/:slug` | GET | Proxy para o Worker briefing. Slug fora do padrão → 404 |
| `/relatorio-signup` | POST | Inscrição no fechamento. Rate limit 3/15 min por IP |
| `/stripe-webhook` | POST | Eventos do Stripe. Sem `STRIPE_WEBHOOK_SECRET`, responde 503 |
| `/health` | GET | Estado do KV e frescor do cache macro |

---

## Configuração central — `assets/sz-config.js`

Único arquivo que contém IDs externos. Propagado automaticamente para todas as páginas.
Após editar, basta publicar `assets/sz-config.js` — nenhum HTML precisa ser tocado.

| Variável | Estado |
|----------|--------|
| `SZ_CLARITY_ID` | `x89me5cgm8` — ativo |
| `SZ_FORMSPREE_ID` | `mojrayrl` — ativo |
| `SZ_STRIPE_CARTA_URL` / `SZ_STRIPE_PRO_URL` | Payment Links **live** desde 19/07 |
| `SZ_WHATSAPP` | ativo |
| `SZ_CALCOM_URL` | **`_PENDING`** — `[data-sz-cal]` cai no WhatsApp |
| `SZ_PLAUSIBLE_DOMAIN` | vazio, desligado por decisão |

**Não existe `SZ_GA_ID`.** O GA4 foi removido por decisão de arquitetura e o
tracking vai para o Clarity. Se encontrar instrução para recriá-lo, é resíduo:
ignore. A guarda `ready()` (linhas 30-35) reprova `_PENDING` e
`buy.stripe.com/test_`, e o `validar-producao.ps1` confirma em produção que ela
sobreviveu ao deploy — não remover.

---

## Pendências abertas (prioridade)

1. **Cal.com** — `SZ_CALCOM_URL` em `_PENDING` (`assets/sz-config.js:21`); `[data-sz-cal]` cai no WhatsApp
2. **Contraste `--gold` em fundo claro** — eyebrows/labels reprovam WCAG AA (3.6–4.3:1 vs 4.5:1). Resolvido nas faixas escuras com `--gold-bright`; em `--bg`/`--surface` continua decisão de design
3. **Token CF Cache Purge** — `setup-cloudflare-token.ps1` (purge API sem permissão; mitigado pela invalidação KV do deploy)
4. **CSP opcional** — `static.cloudflareinsights.com` em `script-src` (silenciar beacon CF)
5. **Sitemap do multi-assets.com** — o domínio não serve `/sitemap.xml` (404). O de szuchmacher lista só URL própria e não pode cobrir outro domínio
6. **Rotina `szuchmacher-domingo` publica por FTP** — o doc de controle remoto descreve a rotina gerando `macro_data.json` e `agenda-data.json` e subindo por FTP no HostGator. O Worker lê os dois do bundle de assets, então FTP não muda o que o site serve, e a verificação da rotina responde 200 pelo Worker de qualquer forma (falso verde). Ler o prompt da rotina e migrá-la para `deploy-cloudflare.ps1` se for o caso
7. **Enquadramento CVM, texto remanescente** — com o Radar ROIC fora (ver "Resolvidas em 2026-07-22"), o disclaimer genérico "research impessoal" que descreve a Carta (FAQ "Assinatura é a mesma coisa que consultoria?" e o rodapé de `assinatura.html`) passou a valer só para conteúdo macro e fechamentos, o que reduz bastante o risco original. Essas linhas em si não foram reescritas nem revisadas por advogado hoje, só deixaram de descrever um produto que rankeava ativos. Validar se ainda precisa de ajuste de texto à parte

### Resolvidas em 2026-07-26 (auditoria completa do sistema)

- **Webhook do Stripe nunca funcionou** — `verifyStripeSignature` decodificava a assinatura como base64, mas o Stripe envia o `v1=` em hexadecimal. Como todo char hex também é válido em base64, o `atob` não lançava: devolvia 48 bytes de lixo em vez dos 32 corretos, e `crypto.subtle.verify` retornava `false` em toda entrega. Desde o Stripe live (19/07) nenhum comprador recebeu o e-mail de boas-vindas. No mesmo handler, o secret caía para o literal `'[STRIPE_WEBHOOK_SECRET]'`, publicado no repositório — a assimetria deixava o atacante escolher a codificação e passar onde o Stripe falhava. Corrigidos juntos: hex, e 503 sem o secret
- **Deploy impossível a partir de clone limpo** — `build-cloudflare-public.ps1` exigia `relatorio_cache.json` em `$obrigatorios`, mas o commit `3befcb0` removeu o arquivo do tracking e o pôs no `.gitignore`. Ele vem de um pipeline em outro repositório, então só existe na máquina do Yan. Passou a ser cópia opcional; `validar-producao.ps1` aceita 404 nesse check
- **`publicar-com-rollback.ps1` afirmava "produção intocada" quando ela já mudara** — o `catch` tratava qualquer exceção como falha anterior ao wrangler, mas `deploy-cloudflare.ps1` roda `set-openrouter-secret.ps1` e a invalidação de KV **depois** do deploy, e aquele script lia `config.php`, que é gitignored e não existe fora da máquina do Yan. Agora o `catch` relê a versão viva antes de afirmar qualquer coisa
- **`deploy-all.ps1` não deployava** — a linha de invocação tinha a entidade HTML `&amp;` no lugar do operador `&`, então chamava um comando `amp` inexistente e podia sair 0 sem publicar nada
- **`/relatorio-prices.php` dava 404** — a rota era chamada por `relatorios.html` mas nunca foi portada do PHP. O `.catch()` silencioso escondia a falha e os cards nunca mostravam "Cotação atual". Handler novo em `handlers/relatorio-prices.js`
- **Formulário de contato de `relatorios.html` vazava o lead** — tinha `data-formspree` sem `bindFormspree`, o único dos quatro do site nessa situação: o submit virava navegação nativa para o Formspree e a atribuição UTM se perdia
- **Dados pessoais de lead versionados** — `logs/leads.jsonl` e `data/leads_nurture_state.json` eram tracked e são caminhos de escrita em runtime. Removidos do index (só continham o fixture de teste) e cobertos pelo `.gitignore`
- **Política de privacidade desalinhada da infraestrutura** — omitia Cloudflare, Resend e Stripe como operadores e declarava HostGator como a hospedagem. Minuta reescrita, **pendente de revisão jurídica**
- **Automações** — a qualificação por IA estava morta (chaves não escapadas no prompt derrubavam o lead com HTTP 500), o alerta de mercado quebrava quando faltava um ativo, os dois segredos HMAC tinham fallback literal versionado, o servidor de leads subia em `0.0.0.0`, e o FTP ia sem TLS nos dois pipelines
- **`wrangler` 4.101.0** — pendência já resolvida antes desta auditoria; `package.json` está em `^4.112.0`. Baixada da lista

### Resolvidas em 2026-07-22

- **Radar ROIC descontinuado** — o produto rankeava ações por ROIC com carteira-modelo e tese por ativo, igual pra todo assinante, estrutura de relatório de análise (Res. CVM 20/2021, exige registro de analista) e não de consultoria individualizada (Res. CVM 19/2021, o registro que existe). Removido de `assinatura.html` (hero, filosofia, metodologia, tiers, FAQ, CTA, footer, CSS órfão, grid da filosofia ajustado de 3 para 2 colunas), arquivo `radar-roic.html` apagado, redirect 301 para `assinatura.html` adicionado no Worker (`src/index.js`, mesmo padrão do `/ebook`), saiu do `sitemap.xml` e dos scripts `validar-producao.ps1` (checagem agora espera 301) e `build-cloudflare-public.ps1` (saiu da lista de arquivos copiados e da de obrigatórios). `setup-stripe.ps1` teve a descrição do plano Carta reescrita sem citar Radar ROIC, mas isso só vale para uma recriação futura do produto: `Get-OrCreateProduct` reaproveita o produto existente pelo `lookup_key` e não atualiza descrição já publicada, então se o texto do produto "Carta Szuchmacher" no dashboard do Stripe ainda citar Radar ROIC, só edição manual lá resolve. Não alterado: os textos de marketing e planejamento já publicados (`docs/marketing/*.md`, `docs/FASE1-STACK.md`) que citam Radar ROIC, deixados como registro histórico

### Resolvidas em 2026-07-19

- **Stripe live** — `assets/sz-config.js:15-16` agora tem os Payment Links live (commit `5a2e504`); a guarda `ready()` reprova `test_*` e a validação de produção confirma. Cobrança operante

### Resolvidas em 2026-07-18

- PDF de amostra 404 em `relatorios.html` — não há mais nenhuma referência a PDF na página
- `HEAD → 500` nas rotas HTML do Worker — HEAD e GET respondem 200 nos dois domínios
- `macro_api.php` 503 — endpoint em 200
- Sitemap com 301/404 — `multiasset.html`, `multiasset-app.html` e `consultoria.html` saíram da lista
