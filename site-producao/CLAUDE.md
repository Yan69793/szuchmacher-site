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
| `radar-roic.html` | Radar ROIC |
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

### Legado FTP (rollback apenas)

```powershell
.\scripts\deploy-all.ps1 -FtpOnly   # se existir flag; senão deploy-all sem -Cloudflare
```

- HostGator `sh00110.hostgator.com.br` — não usar para mudanças rotineiras após migração 17/06/2026

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

1. **Stripe live** — `assets/sz-config.js` ainda tem URLs `buy.stripe.com/test_*`. Desde 2026-07-18 o `ready()` reprova checkout de teste, então os CTAs de `assinatura.html` caem no fallback de e-mail. **Não há como cobrar até as URLs live entrarem.**
2. **Cal.com** — `SZ_CALCOM_URL` em `_PENDING`; `[data-sz-cal]` cai no WhatsApp
3. **Enquadramento CVM** — seis textos descrevem a assinatura como research impessoal, que é atividade de analista (Res. 20/2021), enquanto o registro é de consultor (Res. 19/2021). Locais: `assinatura.html:400`, `:463`, `radar-roic.html:7`, `:14`, `:278`. Revisar com advogado antes de mexer
4. **Contraste `--gold` em fundo claro** — eyebrows/labels reprovam WCAG AA (3.6–4.3:1 vs 4.5:1). Resolvido nas faixas escuras com `--gold-bright`; em `--bg`/`--surface` continua decisão de design
5. **Token CF Cache Purge** — `setup-cloudflare-token.ps1` (purge API sem permissão; mitigado pela invalidação KV do deploy)
6. **CSP opcional** — `static.cloudflareinsights.com` em `script-src` (silenciar beacon CF)
7. **Sitemap do multi-assets.com** — o domínio não serve `/sitemap.xml` (404). O de szuchmacher lista só URL própria e não pode cobrir outro domínio

### Resolvidas em 2026-07-18

- PDF de amostra 404 em `relatorios.html` — não há mais nenhuma referência a PDF na página
- `HEAD → 500` nas rotas HTML do Worker — HEAD e GET respondem 200 nos dois domínios
- `macro_api.php` 503 — endpoint em 200
- Sitemap com 301/404 — `multiasset.html`, `multiasset-app.html` e `consultoria.html` saíram da lista
