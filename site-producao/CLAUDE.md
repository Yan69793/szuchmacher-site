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
| `multiasset.html` | Landing da plataforma MultiAsset |
| `multiasset-app.html` | App completo da plataforma (~275 KB) |
| `honorarios.html` | Tabela de honorários |
| `assinatura.html` | Página de assinatura |
| `privacidade.html` | Política de privacidade |
| `radar-roic.html` | Radar ROIC |
| `.htaccess` | Headers de segurança (CSP, HSTS, GZIP, redirects) |
| `prices.php` | Endpoint: ouro, prata, platina, BTC ao vivo |
| `macro_api.php` | Endpoint LLM via OpenRouter — **503, OPENROUTER_KEY ausente** |
| `macro_data.json` | Fallback estático do macro quando `macro_api.php` falha |
| `agenda-server.php` | Endpoint: agenda de eventos econômicos |
| `agenda-data.json` | Cache local da agenda |
| `market-data.php` | Endpoint: Ibovespa, S&P 500, WTI, Treasury 10y via Yahoo Finance |
| `market_data_cache.json` | Cache local do market-data.php (TTL 10 min, gerado automaticamente) |
| `macro-panel-live.js` | Script que popula o painel macro no `index.html` |
| `assets/sz-config.js` | Configuração central: GA4_ID, CLARITY_ID, FORMSPREE_ID |
| `assets/macro.php` | BCB SGS + Focus (Selic, IPCA, PTAX) — funcional |
| `assets/agenda.php` | Agenda ao vivo — funcional |
| `_arquivo/` | Backups e snapshots históricos — **não editar** |
| `diagnosticos/` | Registros de diagnóstico de produção |
| `scripts/` | Scripts de deploy e manutenção |
| `cloudflare-workers/sz-sites/` | Worker de produção (HTML estático + APIs PHP portadas) |
| `cloudflare-workers/sz-sites/src/handlers/fechamento.js` | Proxy `/fechamento/:slug` → Worker briefing (leitura via site) |

---

## Design system

### Paleta (CSS custom properties — definidas em cada página)

| Variável | Valor | Uso |
|----------|-------|-----|
| `--bg` | `#f1ede6` | Fundo geral (areia clara) |
| `--surface` | `#ebe4d8` | Superfície alternada |
| `--surface-soft` | `#f3efe8` | Cards e superfícies suaves |
| `--navy` | `#0b1630` | Azul primário — textos, CTAs, fundo do header |
| `--navy-soft` | `#16233f` | Navy secundário |
| `--gold` | `#8f6b34` | Ouro — acento, eyebrows, marcadores |
| `--gold-soft` | `#a8834a` | Ouro suave |
| `--text` | `#1e2430` | Texto principal |
| `--muted` | `#5f6673` | Texto secundário / captions |
| `--line` | `rgba(11,22,48,0.10)` | Divisórias suaves |
| `--line-strong` | `rgba(11,22,48,0.16)` | Divisórias em destaque |

**Seção macro (fundo escuro `#091327` / `#0b1630`):**
- Ouro nesta seção: `#d4a85c` (mais claro para contraste no escuro)

### Tipografia

| Variável | Família | Pesos | Uso |
|----------|---------|-------|-----|
| `--font-serif` | Playfair Display | 500, 600, 700 | H1–H4, números grandes, logo, títulos de eventos |
| `--font-sans` | Manrope | 300–800 | Corpo, UI, labels, navigation |

### Convenções de layout

- `--max`: `1160px` (max-width do container)
- `--radius`: `2px` (border-radius mínimo — identidade austero-editorial)
- `.section`: `padding: 96px 0`
- `.section-tight`: `padding: 72px 0`
- `.eyebrow`: `0.72rem`, `uppercase`, `letter-spacing: 0.18em`, `font-weight: 800`, cor `--gold`
- Botões: sem border-radius arredondado, `min-height: 48px`

**Qualquer desvio de cor, fonte ou espaçamento é erro crítico — requer correção antes de entregar.**

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
| GA4 | ❌ `GA_ID_PENDING` | Configurar em `assets/sz-config.js` |
| Microsoft Clarity | ❌ `CLARITY_ID_PENDING` | Configurar em `assets/sz-config.js` |
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
| `/macro_api.php` | 503 ❌ | Narrativa macro via LLM (OpenRouter_KEY não configurada) |

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

1. **Token CF Cache Purge** — `setup-cloudflare-token.ps1` (purge API ainda sem permissão)
2. **GA4 + Clarity** — substituir `_PENDING` em `assets/sz-config.js`
3. **CSP opcional** — `static.cloudflareinsights.com` em `script-src` (silenciar beacon CF)
