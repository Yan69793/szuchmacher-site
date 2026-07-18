# CLAUDE.md ÔÇö szuchmacher.com.br

## Identidade do projeto

Site institucional de advisory patrimonial independente de Yan Szuchmacher.

**Dom├¡nio:** https://szuchmacher.com.br (+ https://multi-assets.com)  
**Hosting:** Cloudflare Workers (`sz-sites`) ÔÇö rotas nos 4 hostnames (apex + www)  
**Legado:** HostGator/FTP mantido s├│ para rollback; **n├úo ├® mais o deploy prim├írio**  
**Deploy prim├írio:** `.\scripts\deploy-cloudflare.ps1` (build + `wrangler deploy`)  
**├Ültima migra├º├úo confirmada:** 17/06/2026 (`Server: cloudflare`, Worker `sz-sites` ativo)

---

## Mapa de arquivos

| Arquivo | Fun├º├úo |
|---------|--------|
| `index.html` | Home institucional (~54 KB) |
| `relatorios.html` | P├ígina de relat├│rios e PDFs |
| `multiasset.html` | Landing da plataforma MultiAsset |
| `multiasset-app.html` | App completo da plataforma (~275 KB) |
| `honorarios.html` | Tabela de honor├írios |
| `assinatura.html` | P├ígina de assinatura |
| `privacidade.html` | Pol├¡tica de privacidade |
| `radar-roic.html` | Radar ROIC |
| `.htaccess` | Headers de seguran├ºa (CSP, HSTS, GZIP, redirects) |
| `prices.php` | Endpoint: ouro, prata, platina, BTC ao vivo |
| `macro_api.php` | Endpoint LLM via OpenRouter ÔÇö **503, OPENROUTER_KEY ausente** |
| `macro_data.json` | Fallback est├ítico do macro quando `macro_api.php` falha |
| `agenda-server.php` | Endpoint: agenda de eventos econ├┤micos |
| `agenda-data.json` | Cache local da agenda |
| `market-data.php` | Endpoint: Ibovespa, S&P 500, WTI, Treasury 10y via Yahoo Finance |
| `market_data_cache.json` | Cache local do market-data.php (TTL 10 min, gerado automaticamente) |
| `macro-panel-live.js` | Script que popula o painel macro no `index.html` |
| `assets/sz-config.js` | Configura├º├úo central: GA4_ID, CLARITY_ID, FORMSPREE_ID |
| `assets/macro.php` | BCB SGS + Focus (Selic, IPCA, PTAX) ÔÇö funcional |
| `assets/agenda.php` | Agenda ao vivo ÔÇö funcional |
| `_arquivo/` | Backups e snapshots hist├│ricos ÔÇö **n├úo editar** |
| `diagnosticos/` | Registros de diagn├│stico de produ├º├úo |
| `scripts/` | Scripts de deploy e manuten├º├úo |
| `cloudflare-workers/sz-sites/` | Worker de produ├º├úo (HTML est├ítico + APIs PHP portadas) |
| `cloudflare-workers/sz-sites/src/handlers/fechamento.js` | Proxy `/fechamento/:slug` ÔåÆ Worker briefing (leitura via site) |

---

## Design system

### Paleta (CSS custom properties ÔÇö definidas em cada p├ígina)

| Vari├ível | Valor | Uso |
|----------|-------|-----|
| `--bg` | `#f1ede6` | Fundo geral (areia clara) |
| `--surface` | `#ebe4d8` | Superf├¡cie alternada |
| `--surface-soft` | `#f3efe8` | Cards e superf├¡cies suaves |
| `--navy` | `#0b1630` | Azul prim├írio ÔÇö textos, CTAs, fundo do header |
| `--navy-soft` | `#16233f` | Navy secund├írio |
| `--gold` | `#8f6b34` | Ouro ÔÇö acento, eyebrows, marcadores |
| `--gold-soft` | `#a8834a` | Ouro suave |
| `--text` | `#1e2430` | Texto principal |
| `--muted` | `#5f6673` | Texto secund├írio / captions |
| `--line` | `rgba(11,22,48,0.10)` | Divis├│rias suaves |
| `--line-strong` | `rgba(11,22,48,0.16)` | Divis├│rias em destaque |

**Se├º├úo macro (fundo escuro `#091327` / `#0b1630`):**
- Ouro nesta se├º├úo: `#d4a85c` (mais claro para contraste no escuro)

### Tipografia

| Vari├ível | Fam├¡lia | Pesos | Uso |
|----------|---------|-------|-----|
| `--font-serif` | Playfair Display | 500, 600, 700 | H1ÔÇôH4, n├║meros grandes, logo, t├¡tulos de eventos |
| `--font-sans` | Manrope | 300ÔÇô800 | Corpo, UI, labels, navigation |

### Conven├º├Áes de layout

- `--max`: `1160px` (max-width do container)
- `--radius`: `2px` (border-radius m├¡nimo ÔÇö identidade austero-editorial)
- `.section`: `padding: 96px 0`
- `.section-tight`: `padding: 72px 0`
- `.eyebrow`: `0.72rem`, `uppercase`, `letter-spacing: 0.18em`, `font-weight: 800`, cor `--gold`
- Bot├Áes: sem border-radius arredondado, `min-height: 48px`

**Qualquer desvio de cor, fonte ou espa├ºamento ├® erro cr├¡tico ÔÇö requer corre├º├úo antes de entregar.**

---

## Protocolo obrigat├│rio

1. **Diagn├│stico antes de qualquer edi├º├úo.** Confirmar arquivo e linha com evid├¬ncia antes de tocar c├│digo.
2. **Nunca subir para produ├º├úo sem instru├º├úo expl├¡cita.** Edite local, entregue o arquivo completo + procedimento de deploy. Deploy Cloudflare via `deploy-cloudflare.ps1`; purge manual no painel CF se necess├írio.
3. **Entrega sempre em arquivo completo** ÔÇö nunca diff parcial ou trecho isolado.
4. **Teste ├║nico em produ├º├úo** ÔÇö com URL, status HTTP e compara├º├úo com o esperado.
5. **CSP em produ├º├úo vem do Worker `sz-sites`** (`src/utils/headers.js`). `.htaccess` s├│ vale no legado HostGator.
6. **`assets/sz-config.js` ├® o ├║nico local de IDs externos.** Nunca duplicar GA_ID, CLARITY_ID ou FORMSPREE_ID em HTML.

---

## Deploy

```powershell
# Prim├írio ÔÇö Cloudflare Workers (szuchmacher + multi-assets)
.\scripts\deploy-cloudflare.ps1

# Valida├º├úo p├│s-deploy
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
.\scripts\deploy-all.ps1 -FtpOnly   # se existir flag; sen├úo deploy-all sem -Cloudflare
```

- HostGator `sh00110.hostgator.com.br` ÔÇö n├úo usar para mudan├ºas rotineiras ap├│s migra├º├úo 17/06/2026

---

## Estado de produ├º├úo (verificado 17/06/2026)

| Item | Status | A├º├úo |
|------|--------|------|
| HTTPS / HSTS | Ô£à | ÔÇö |
| CSP ÔÇö Formspree em `connect-src` e `form-action` | Ô£à | ÔÇö |
| logo.png (HTTP 200) | Ô£à | ÔÇö |
| Formspree `mojrayrl` | Ô£à | ÔÇö |
| GA4 | Ô×û removido por decis├úo de arquitetura | Tracking roteado para Clarity (`window.ga`ÔåÆClarity, `sz-config.js`) |
| Microsoft Clarity | Ô£à ativo (`SZ_CLARITY_ID = x89me5cgm8`) | ÔÇö |
| Favicons (`favicon.ico`/`.svg`/`apple-touch-icon.png`) | Ô£à gerados do logo, servidos em sz + multi | ÔÇö |
| Hosting Cloudflare Workers | Ô£à | `sz-sites` serve szuchmacher + multi-assets |
| `macro_api.php` | Ô£à | Cache 7d + BCB + OpenRouter no Worker |
| `/fechamento/:slug` | Ô£à | Proxy para Worker briefing; GET direto em workers.dev bloqueado |
| `market-data.php` | Ô£à | IBOV, S&P 500, WTI, Treasury 10y via Yahoo Finance ao vivo |
| `assets/macro.php` | Ô£à | BCB ao vivo |
| `assets/agenda.php` | Ô£à | Agenda ao vivo |
| `prices.php` | Ô£à | Metais + BTC ao vivo |

---

## Endpoints

| Endpoint | HTTP | Descri├º├úo |
|----------|------|-----------|
| `/assets/macro.php` | 200 Ô£à | BCB SGS + Focus: Selic, IPCA, PTAX |
| `/assets/agenda.php` | 200 Ô£à | Agenda de eventos econ├┤micos da semana |
| `/prices.php` | 200 Ô£à | Ouro, prata, platina, Bitcoin |
| `/macro_api.php` | 503 ÔØî | Narrativa macro via LLM (OpenRouter_KEY n├úo configurada) |

---

## Configura├º├úo central ÔÇö `assets/sz-config.js`

├Ünico arquivo que cont├®m IDs externos. Propagado automaticamente para todas as p├íginas.

Para ativar GA4 e Clarity, substituir as linhas:

```js
window.SZ_GA_ID      = 'G-XXXXXXXXXX';   // Google Analytics 4 Measurement ID
window.SZ_CLARITY_ID = 'XXXXXXXXXX';     // Microsoft Clarity Project ID
// Formspree j├í configurado:
window.SZ_FORMSPREE_ID = 'mojrayrl';
```

Ap├│s editar: upload apenas de `assets/sz-config.js` ÔÇö nenhum HTML precisa ser tocado.

---

## Pend├¬ncias abertas (prioridade)

1. **Kiwify ebook / Cal.com / Stripe live** ÔÇö `_PENDING`/`test_` em `assets/sz-config.js` (decis├úo de produto/billing)
2. **PDF de amostra** ÔÇö bot├úo em `relatorios.html` aponta para `/Fechamento de Mercado 01.04.26.pdf` (404, nunca existiu) ÔÇö subir PDF real ou remover bot├úo
3. **Contraste `--gold`** ÔÇö eyebrows/labels reprovam WCAG AA (3.6ÔÇô4.3:1 vs 4.5:1) ÔÇö decis├úo de design (design system)
4. **Token CF Cache Purge** ÔÇö `setup-cloudflare-token.ps1` (purge API sem permiss├úo; mitigado pela invalida├º├úo KV do deploy)
5. **CSP opcional** ÔÇö `static.cloudflareinsights.com` em `script-src` (silenciar beacon CF)
6. **HEAD ÔåÆ 500** em rotas HTML do Worker (navegador usa GET/200; sem impacto de usu├írio)
