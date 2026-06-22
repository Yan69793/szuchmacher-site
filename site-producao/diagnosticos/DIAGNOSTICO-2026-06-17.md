# DIAGNÓSTICO ONLINE — szuchmacher.com.br
**Data:** 2026-06-17 (21:53 BRT — re-auditoria pós-fix Focus)  
**Auditor:** Grok / szuchmacher-audit v1  
**Método:** `audit-producao.py` + `check-mobile-agenda.py` + HTTP PowerShell + headers + Task Scheduler + `purge-cloudflare.ps1 -Diagnose`  
**Raw:** `diagnosticos/audit-raw-20260617_215348.json`  
**Auditoria anterior (manhã):** `audit-raw-20260617_025512.json`

---

## 1. STATUS DE PÁGINAS E ENDPOINTS

### 1.1 Páginas HTML (PowerShell, produção)

| URL | HTTP | Cache-Control | Observação |
|-----|------|---------------|------------|
| `/` | **200 ✅** | `public, must-revalidate, max-age=0` | Worker CF |
| `multi-assets.com/` | **200 ✅** | idem | Plataforma MultiAsset |
| `/multiasset-app.html` | redirect → multi-assets.com | — | OK |

**Performance (download total, rede local):** home **109 ms** (PowerShell).

### 1.2 Endpoints PHP / JSON

| Endpoint | HTTP | Resposta | Status |
|----------|------|----------|--------|
| `/prices.php` | **200 ✅** | `ok:true`, gold 4315.7, `stale:false` | OK |
| `/market-data.php` | **200 ✅** | `ok:true`, ibov 168453.94, wti 75.11 | OK |
| `/macro_api.php` | **200 ✅** | `ok:true`, `cache:true`, gerado 17/06 00:58 BRT | OK (narrativa em cache 7d) |
| `/agenda-data.json` | **200 ✅** | `meta.version: 2026-06-17` | OK |
| `/assets/agenda.php` | **200 ✅** | JSON agenda | OK |
| `/assets/macro.php` | **200 ✅** | Focus **IPCA 5,3% · PIB 1,96%** · Selic meta 14,25% | **OK — fix Worker 17/06** |
| `multi-assets.com/prices.php` | **200 ✅** | — | OK |
| `multi-assets.com/market-data.php` | **200 ✅** | — | OK |
| `multi-assets.com/macro_api.php` | **200 ✅** | — | OK |

| Teste segurança | Resultado |
|-----------------|-----------|
| `/.env` | **404** (Worker — não exposto) ✅ |
| `/config.php` | **404** (Worker — rota não mapeada) ✅ |

> Nota: APIs roteadas pelo Worker `sz-sites`. `urllib` sem UA no script ainda recebe **403** (esperado).

---

## 2. PLAYWRIGHT — HOME + MULTIASSET

### 2.1 Home (`/`)

| Viewport | macro ready | eventos | pageerror | load_ms |
|----------|-------------|---------|-----------|---------|
| 1280 desktop | ✅ | 5 | 0 | 25571 |
| 390 mobile | ✅ | 5 | 0 | 22718 |
| 320 mobile | ✅ | 5 | 0 | 22733 |

`check-mobile-agenda.py`: **sexta 19/06 presente**, overlap **0**, sem scroll horizontal, Focus visível.

Screenshots: `audit-home-*-20260617_215348.png`

### 2.2 MultiAsset (`multi-assets.com`)

| Viewport | bench Selic | sim ouro | pageerror | IBOV strip |
|----------|-------------|----------|-----------|------------|
| 1280 | 14,25% → 12% | $ 88.150 | **0 ✅** | **168.454 ✅** |
| 390 | idem | idem | **0 ✅** | **168.454 ✅** |
| 320 | idem | idem | **0 ✅** | **168.454 ✅** (+13 overflow elems) |

**P1 `ipcaAno`:** permanece **corrigido** — sem `pageerror` nesta rodada.

Screenshots: `audit-multiasset-app-*-20260617_215348.png`

### 2.3 Console (não bloqueante)

| Mensagem | Gravidade |
|----------|-----------|
| CSP bloqueia `static.cloudflareinsights.com/beacon.min.js` | P3 |
| TradingView `Invalid environment undefined` (×5) | P3 |
| CORS Yahoo `NTNB11.SA` em multi-assets.com | P2 — fetch direto bloqueado; benchmark RF pode usar fallback |
| 401/404 recursos externos (TradingView) | P3 |

---

## 3. SEGURANÇA / CSP

Headers medidos em produção:

| Header | szuchmacher.com.br | multi-assets.com |
|--------|-------------------|------------------|
| HSTS `max-age=31536000` | ✅ | ✅ |
| X-Frame-Options `SAMEORIGIN` | ✅ | ✅ |
| CSP clarity + tradingview + formspree | ✅ | ✅ |

| Item | Status |
|------|--------|
| Chave OpenRouter em `config.php` no repo local | ⚠️ P2 — não expor; rotacionar se repo público |
| `.env` não acessível via HTTP | ✅ |

---

## 4. CLOUDFLARE / DNS

| Item | Valor |
|------|-------|
| Zona CF | **active ✅** |
| NS Cloudflare (painel) | `denver` + `lola` |
| NS DNS público | **denver + lola ✅** (propagação concluída) |
| Purge API | ❌ token sem permissão Cache Purge |

---

## 5. AUTOMAÇÃO (Task Scheduler)

| Tarefa | Próxima execução | Status |
|--------|------------------|--------|
| Szuchmacher-AgendaAgent | 18/06 08:00 | Pronto |
| Szuchmacher-MacroCron | 22/06 09:00 | Pronto |
| Szuchmacher-MacroAgent | 19/06 18:00 | Pronto |
| Szuchmacher-LeadNurture | 18/06 10:00 | Pronto |
| Szuchmacher-FechamentoDiario | 18/06 19:00 | Pronto |
| Szuchmacher-FechamentoWatchdog | 18/06 19:20 | Pronto |

Deploy sessão: Worker `sz-sites` v `03b22b58` + FTP `macro.php` (17/06).

---

## 6. PROBLEMAS (ranking)

### 🟠 P2 — `macro_api.php` narrativa em cache (17/06 00:58)
- **Impacto:** texto macro na home pode estar defasado até cron seg 09:00 ou TTL 7d.
- **Ação:** aguardar `Szuchmacher-MacroCron` ou forçar refresh via cron Worker.

### 🟠 P2 — Token Cloudflare sem Cache Purge
- **Impacto:** purge automático indisponível.
- **Mitigação:** assets com `?v=YYYYMMDD`; HTML `max-age=0` no Worker.

### 🟠 P2 — CORS Yahoo NTNB11 no MultiAsset
- **Impacto:** console error; possível fallback silencioso no benchmark RF.
- **Ação:** proxy via `market-data.php` se benchmark depender do ticker.

### 🟡 P3 — CSP vs Cloudflare Insights beacon
- **Impacto:** ruído console apenas.

### 🟡 P3 — Playwright home load_ms alto (22–25s)
- **Impacto:** medição Playwright (rede/CDN); download HTTP real ~109 ms.
- **Ação:** não é regressão funcional.

### 🟡 P3 — overflow horizontal mobile320 MultiAsset (13 elems)
- **Impacto:** cosmético.

---

## 7. OK SEM AÇÃO

| Item | Status |
|------|--------|
| Focus IPCA/PIB no painel macro (`/assets/macro.php`) | ✅ **5,3% / 1,96%** |
| Home `#macroPanel[data-state=ready]` | ✅ todos viewports |
| Agenda mobile overlap | ✅ 0 |
| MultiAsset IBOV + benchmark Selic | ✅ |
| P1 `ipcaAno` | ✅ resolvido |
| Endpoints prices/market/macro/agenda | ✅ 200 |
| Zona Cloudflare + NS público | ✅ active + denver/lola |
| Task Scheduler | ✅ 6 tarefas |

---

## 8. PRÓXIMA AUDITORIA

```powershell
cd E:\Diretorio\Claude\Site\site-producao
$PY = E:\Diretorio\Claude\Site\automacao-yan-os\venv\Scripts\python.exe
& $PY scripts\audit-producao.py
& $PY scripts\check-mobile-agenda.py
.\scripts\purge-cloudflare.ps1 -Diagnose
```

Invocar: **`/szuchmacher-audit`**

---

*Re-auditoria 17/06/2026 21:53 BRT. Fix Focus IPCA/PIB validado em produção.*