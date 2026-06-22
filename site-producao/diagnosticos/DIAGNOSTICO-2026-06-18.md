# DIAGNÓSTICO ONLINE — szuchmacher.com.br
**Data:** 2026-06-18 06:00 BRT (pós-atualização macro COPOM + correção agenda)  
**Auditor:** Grok / szuchmacher-audit v1  
**Método:** `audit-producao.py` + `check-mobile-agenda.py` + HTTP PowerShell + headers + Task Scheduler + `purge-cloudflare.ps1 -Diagnose`  
**Raw:** `diagnosticos/audit-raw-20260618_055913.json`  
**Sessão:** correção COPOM 17/06 na agenda · macro pós-COPOM via OpenRouter · deploy Worker

---

## 1. STATUS DE PÁGINAS E ENDPOINTS

### 1.1 Páginas HTML

| URL | HTTP | Observação |
|-----|------|------------|
| `/` | **200 ✅** | `#macroPanel[data-state=ready]` em 3 viewports |
| `/multiasset-app.html` | **200 ✅** | bench Selic **14,25%**, sim ouro OK |

### 1.2 Endpoints PHP / JSON

| Endpoint | HTTP | Resposta | Status |
|----------|------|----------|--------|
| `/prices.php` | **200 ✅** | `ok:true`, gold 4267.9 | OK |
| `/market-data.php` | **200 ✅** | `ok:true`, ibov 168453.94, wti 73.88 | OK |
| `/macro_api.php` | **200 ✅** | `ok:true`, **Pós-COPOM**, Selic 14,25%, gerado 18/06 05:58 BRT | **OK — atualizado nesta sessão** |
| `/macro_api.php?cron=1` | **503 ❌** | `OpenRouter falhou` | **P1 — refresh dinâmico Worker quebrado** |
| `/agenda-data.json` | **200 ✅** | `meta.version: 2026-06-18`, COPOM em **17/06** | OK |
| `/assets/agenda.php` | **200 ✅** | idem agenda | OK |
| `/assets/macro.php` | **200 ✅** | Selic meta **14,25%** (SGS 05/08/2026) | OK |

| Teste segurança | Resultado |
|-----------------|-----------|
| `/.env` | **404** (Worker) ✅ |
| `/config.php` | **404** (Worker) ✅ |

---

## 2. PLAYWRIGHT — HOME + MULTIASSET

### 2.1 Home (`/`)

| Viewport | macro ready | eventos | pageerror | load_ms |
|----------|-------------|---------|-----------|---------|
| 1280 desktop | ✅ | 6 | 0 | 3298 |
| 390 mobile | ✅ | 6 | 0 | 435 |
| 320 mobile | ✅ | 6 | 0 | 420 |

`check-mobile-agenda.py`: overlap **0**, sem scroll horizontal, Focus + COPOM (17/06) + sexta 19/06 (Juneteenth US) visíveis.

Screenshots: `audit-home-*-20260618_055913.png`

### 2.2 MultiAsset (`/multiasset-app.html`)

| Viewport | bench Selic | sim ouro | pageerror | IBOV strip |
|----------|-------------|----------|-----------|------------|
| 1280 | **14,25% → 12%** | $ 88.150 | 0 | 168.454 |
| 390 | idem | idem | 0 | 168.454 |
| 320 | idem | idem | 0 | 168.454 (+12 overflow elems) |

Screenshots: `audit-multiasset-app-*-20260618_055913.png`

### 2.3 Console (não bloqueante)

| Mensagem | Gravidade |
|----------|-----------|
| 404 recursos externos (TradingView) | P3 |
| `Invalid environment undefined` (×5) | P3 |
| `horizontal_overflow_elements=12` (320px) | P3 |

---

## 3. PERFORMANCE

| Métrica | Valor |
|---------|-------|
| Home load_ms (desktop Playwright) | 3298 ms |
| Home load_ms (mobile390) | 435 ms |
| Endpoints JSON (PowerShell) | 200 em todos (modo leitura) |

---

## 4. SEGURANÇA / CSP

| Header (`/`) | Presente |
|--------------|----------|
| `Strict-Transport-Security` | ✅ max-age=31536000 |
| `Content-Security-Policy` | ✅ (clarity, tradingview, formspree) |
| `X-Frame-Options` | ✅ SAMEORIGIN |
| `Cache-Control` HTML | ✅ max-age=0 |

**Nota:** `config.php` contém `OPENROUTER_KEY` no repositório local — rota não exposta via Worker (404). Migrar para secret/env apenas (P2).

---

## 5. CLOUDFLARE / DNS

| Item | Valor |
|------|-------|
| Zona | szuchmacher.com.br — **active** |
| NS público | denver.ns.cloudflare.com, lola.ns.cloudflare.com ✅ |
| Cache Purge API | **sem permissão** no token atual |
| Worker deploy | `250be11f-8c5c-411a-85b3-ec82158b12de` (18/06) |
| KV invalidado | macro-api, macro-panel, market-data |

---

## 6. AUTOMAÇÃO (Task Scheduler)

| Tarefa | Próxima execução | Status |
|--------|------------------|--------|
| Szuchmacher-AgendaAgent | 18/06 08:00 | Pronto |
| Szuchmacher-LeadNurture | 18/06 10:00 | Pronto |
| Szuchmacher-FechamentoDiario | 18/06 19:00 | Pronto |
| Szuchmacher-MacroAgent | 19/06 18:00 | Pronto |
| Szuchmacher-MacroCron | 22/06 09:00 | Pronto |

**Macro nesta sessão:** `macro_agent.py` falhou (Anthropic sem crédito). Fallback `scripts/macro_openrouter_run.py` + FTP + `deploy-cloudflare.ps1` — **publicado com sucesso**.

---

## 7. PROBLEMAS (P0–P3)

| ID | Sev | Achado | Evidência |
|----|-----|--------|-----------|
| A1 | ~~P1~~ **RESOLVIDO** | `macro_api.php?cron=1` — regex em `set-openrouter-secret.ps1` gravava literal `OPENROUTER_KEY` em vez de `sk-or-v1-...` | cron HTTP 200, `cache:false`, gerado 18/06 06:06 BRT |
| A2 | **P2** | `macro_agent.py` bloqueado — saldo Anthropic zerado | exit 400 `credit balance is too low` |
| A3 | **P2** | Token Cloudflare sem permissão Cache Purge | `purge-cloudflare.ps1 -Diagnose` |
| A4 | **P2** | `OPENROUTER_KEY` hardcoded em `config.php` (repo local) | grep config.php — mitigado por Worker 404 |
| A5 | **P3** | Console 404 TradingView no MultiAsset | audit-raw pages console |
| A6 | **P3** | Overflow horizontal 12 elems @ 320px MultiAsset | audit-raw warning |

---

## 8. OK SEM AÇÃO

- Todos os endpoints de leitura **200** com schema válido
- Painel macro home **ready** (desktop + mobile)
- Agenda: COPOM corrigido para **17/06** (comunicado pós-pregão)
- Narrativa macro reflete **Selic 14,25% pós-COPOM** (`alert_badge: SELIC 14,25%`)
- `assets/macro.php` com Selic meta 14,25% (BCB SGS)
- Agenda mobile sem overlap
- Headers de segurança presentes
- Task Scheduler com 6 tarefas Szuchmacher ativas
- Cloudflare zona active, NS alinhados

---

## 9. PRÓXIMAS AÇÕES RECOMENDADAS

1. **P1:** Depurar `handleMacroApi` no Worker — `?cron=1` com `OPENROUTER_KEY` secret (401/503); validar créditos OpenRouter e header Authorization em produção
2. **P2:** Recarregar créditos Anthropic **ou** migrar `macro_agent.py` para OpenRouter como padrão
3. **P2:** Criar token CF com permissão **Cache Purge**
4. **P3:** Investigar 404 TradingView / `Invalid environment` no MultiAsset