---
name: szuchmacher-audit
description: >
  Auditoria completa szuchmacher.com.br + multi-assets.com. Invocado como /szuchmacher-audit.
  Vistoria multi-camada: Playwright Node (home + multiasset, desktop/mobile), endpoints PHP/Worker,
  headers/CSP (Worker, nao .htaccess), performance, Task Scheduler (7 tarefas), Cloudflare.
  Gera DIAGNOSTICO em site-producao/diagnosticos/. Use quando: auditoria completa do site,
  vistoria pos-deploy, validar producao, checar plataforma MultiAsset, antes de encerrar sessao
  com mudanca de codigo. NAO usar para VIX Radar (/vix-radar-audit), carteiras (/verificar),
  nem fechamento diario (/fechamento-szuchmacher-audit).
argument-hint: "[--quick] [--readonly]"
---

# Szuchmacher — Auditoria Completa (site + plataforma)

Protocolo canonico para **https://szuchmacher.com.br** + **https://multi-assets.com** (Cloudflare Workers + PHP legado).

Projeto: `E:\Diretorio\Claude\Site\site-producao`

## Stack real (pos-migracao 17/06/2026)

- **Primario:** Cloudflare Worker `sz-sites` — serve os dois dominios (szuchmacher.com.br + multi-assets.com). Codigo em `cloudflare-workers/sz-sites/src/`.
- **Legado:** HostGator/FTP — mantido so para rollback. Nao usar para deploy rotineiro.
- **Secrets:** `OPENROUTER_KEY` e `BRIEFING_FETCH_TOKEN` no Worker Cloudflare, nao em arquivos locais.
- **CSP:** definida em `cloudflare-workers/sz-sites/src/utils/headers.js`. `.htaccess` so vale no legado HostGator.
- **Deploy primario:** `.\scripts\deploy-cloudflare.ps1` (build + wrangler deploy).
- **Deploy seguro (com validacao e rollback):** `.\scripts\publicar-com-rollback.ps1` — usado pela rotina automatica da agenda.
- **Gate de verificacao:** `.\scripts\validar-producao.ps1` — 28 verificacoes em szuchmacher.com.br + multi-assets.com. Obrigatorio antes de declarar concluido.

## Regras

1. **Fato ≠ interpretacao** — evidencia HTTP, screenshot, linha de codigo ou output de script.
2. **Achado so com prova** — sem suposicao de deploy ou estado de cron.
3. **`--readonly`** — nao edita codigo, nao faz deploy, nao rotaciona secrets.
4. **Relatorio obrigatorio** — `diagnosticos/DIAGNOSTICO-YYYY-MM-DD.md` + `audit-raw-*.json`.
5. **Nao confundir** com `/vix-radar-audit` (outro produto), `/verificar` (carteiras), `/fechamento-szuchmacher-audit` (pipeline de fechamento diario).

## Modos

| Modo | Escopo |
|------|--------|
| Padrao | 6 blocos completos + relatorio |
| `--quick` | Blocos B+C+D+F (HTTP, seguranca, automacao) — sem Playwright |
| `--readonly` | Coleta apenas; sem deploy nem correcoes |

## Antes de comecar — ler

1. Skill base `/auditoria` (protocolo geral + ranking P0–P3)
2. `site-producao/CLAUDE.md`
3. Ultimo `site-producao/diagnosticos/DIAGNOSTICO-*.md`
4. Skills auxiliares: `webapp-testing`, `insecure-defaults` (CSP/secrets)

---

## Bloco A — Playwright (producao)

```powershell
cd E:\Diretorio\Claude\Site\site-producao
# Node.js Playwright — o unico que funciona. O Python (audit-producao.py, check-mobile-agenda.py)
# depende do venv morto (Python 3.11 removido da maquina) + VC++ redist ausente.
node scripts\audit-playwright-node.mjs
```

**Paginas:** `https://szuchmacher.com.br/` e `https://multi-assets.com/` (nao `/multiasset-app.html` — essa rota em szuchmacher.com.br redireciona 301 para multi-assets.com desde 26/07/2026).

**Viewports:** 1280, 390, 320

**Verificar:**
- `#macroPanel[data-state='ready']` na home
- `.mp-evento` sem overlap (indice vs data/titulo)
- MultiAsset: `#macro-ibov`, `#bench-assume-selic`, simuladores sem `pageerror`
- Console: CSP violations, APIs 4xx/5xx

Screenshots: `diagnosticos/audit-*-*.png`

**Atencao:** `check-mobile-agenda.py` esta inexecutavel (venv morto + VC++ 2015-2022 redist ausente). A verificacao de overlap entre indice, data e titulo nos eventos mobile e o toggle do menu mobile ficam sem cobertura ate que o ambiente Python seja restaurado. O Playwright Node cobre home mobile nos 3 viewports com `macro_ready` e contagem de eventos, mas nao o teste de layout dos cards de evento.

---

## Bloco B — Endpoints HTTP 200 + JSON

```powershell
$base = 'https://szuchmacher.com.br'
@('prices.php','market-data.php','macro_api.php','agenda-data.json','assets/agenda.php','assets/macro.php') | ForEach-Object {
  $r = Invoke-WebRequest -Uri "$base/$_" -UseBasicParsing -TimeoutSec 45
  Write-Host "$_ -> $($r.StatusCode)"
}
```

**Schema minimo:**
- `prices.php` → `ok`, `gold`, `bitcoin`
- `market-data.php` → `ok`, `ibov`, `wti`
- `macro_api.php` → `ok`, `data.eyebrow` (503 = P1). Verificar `canais` e `cenarios_brent` nao vazios (truncamento intermitente do parse LLM — P1 recorrente desde 20/07)
- `agenda-data.json` → `janela.inicio`, `janela.fim`, `eventos[]`
- `assets/macro.php` → `selic_meta` nao nulo (ha guarda anti-poison fraca — `||` em vez de `&&` — que grava payload com KPI nulo no cache KV por ate 30 min. P1 conhecido, ver `handlers/macro-panel.js:16`)

**Rotas do Worker (nao sao arquivos PHP):**
- `/api/btc-scenarios` → 200 (rota nova, handler em `handlers/btc-scenarios.js`)
- `/fechamento/:slug` → 200 (proxy para Worker briefing; GET direto em workers.dev bloqueado)
- `/relatorio-signup` → POST (handler em `handlers/relatorio-signup.js`)

**Rotas bloqueadas (404 esperado):**
- `config.php`, `.env`, `wrangler.toml`, `wrangler.jsonc` → 404 (secrets nao expostos)

Usar **PowerShell/curl com User-Agent** — urllib sem UA pode receber 403 do Cloudflare.

---

## Bloco C — Performance (basica)

Sem Lighthouse obrigatorio; medir:

```powershell
$sw = [Diagnostics.Stopwatch]::StartNew()
Invoke-WebRequest -Uri 'https://szuchmacher.com.br/' -UseBasicParsing | Out-Null
$sw.ElapsedMilliseconds  # home download
```

Playwright reporta `load_ms` por viewport no `audit-raw-*.json`.

Opcional: skill `web-perf` (Chrome DevTools MCP) se disponivel.

---

## Bloco D — Seguranca (insecure-defaults + CSP)

1. Headers em producao (`/` em szuchmacher.com.br e multi-assets.com):
   - HSTS, X-Frame-Options, CSP, Cache-Control HTML `no-cache`
   - `X-Served-By: sz-sites-worker` confirma que a resposta veio do Worker
2. Comparar CSP producao vs `cloudflare-workers/sz-sites/src/utils/headers.js` (nao `.htaccess` — so vale no legado HostGator)
3. CSP minima esperada: `script-src` com clarity.ms + tradingview + cloudflareinsights; `connect-src` com bcb.gov.br + yahoo + coingecko + formspree; `img-src` com `c.bing.com` (pixel Clarity)
4. Grep secrets em `site-producao/`:
   - `config.php` — nao commitar; PHP deve retornar vazio
   - `.env` bloqueado por `.htaccess` (403 esperado)
   - Secrets reais (`OPENROUTER_KEY`, `BRIEFING_FETCH_TOKEN`) estao no Worker Cloudflare, nao em arquivos locais
5. `config.php` via HTTP → 200 com body vazio (OK); nunca expor chave no output

---

## Bloco E — Cloudflare + DNS

```powershell
cd E:\Diretorio\Claude\Site\site-producao
.\scripts\purge-cloudflare.ps1 -Diagnose
```

Registrar: `zone.status` (active/pending), NS publico vs NS Cloudflare, purge token.

**Atencao:** Purge API sem permissao (pendencia conhecida). Workaround: `.\scripts\invalidate-worker-cache.ps1 -RefreshMacro` para invalidar cache KV do Worker.

Deploys do Worker: `npx wrangler deployments list` (ou ver no painel CF).

---

## Bloco F — Automacao local

```powershell
schtasks /Query /FO TABLE | Select-String 'Szuchmacher'
```

### Tarefas ativas (7, pos-reconstrucao 26/07/2026)

| Tarefa | Gatilho | Funcao |
|--------|---------|--------|
| Szuchmacher-AgendaAgent | dom+seg+qui 08:00 | Gera e publica agenda da semana |
| Szuchmacher-MacroCron | seg 09:00 | Atualiza painel macro |
| Szuchmacher-FechamentoDiario | seg-sex 19:00 | Pipeline de fechamento |
| Szuchmacher-FechamentoWatchdog | seg-sex 19:20 | Watchdog do fechamento |
| Szuchmacher-LeadNurture | diario 10:00 | Nutricao de leads |
| Szuchmacher-MacroAgent | sex 18:00 | Agente macro semanal |
| Szuchmacher-AgendaMacro-Claude | **Disabled** (sex 07:07) | Desabilitada — conflitava com rotina de domingo |

### Atencao — venv morto

`Szuchmacher-LeadNurture` e `Szuchmacher-MacroAgent` usam `automacao-yan-os\venv\Scripts\python.exe` diretamente. Esse venv esta morto desde que o Python 3.11 base foi removido da maquina. As tarefas saem com codigo 103. O `run-agenda-agent.ps1` ja foi corrigido com sondagem de interpretador (`venv-py312`, `venv-playwright`, `pythoncore-3.14-64`).

### AgendaAgent — pipeline completo

1. Guarda de working tree (aborta se ha mudanca nao commitada em arquivo deployavel)
2. Sondagem de interpretador Python (venv-py312 > venv-playwright > pythoncore-3.14-64)
3. Geracao: `agenda_agent.py --dry-run` grava `agenda-data.json`
4. Assercao de janela: reprova se `janela.fim` for anterior a hoje
5. Publicacao: `scripts/publicar-com-rollback.ps1` (com validacao e alvo de rollback)
6. Falha dispara `scripts/send-alert-email.ps1`

Log em `automacao-yan-os/logs/agenda_scheduled_<data>.log`, relatorio em `diagnosticos/publicacao_<data>.md`.

### Dominio do rotulo na home

`assets/macro-panel.js` (`rotuloJanelaAgenda`) compara a janela com a data de hoje: `Esta semana`, `Proxima semana` ou `Semana de referencia`. `Semana de referencia` nao e um titulo fixo — e o frontend sinalizando que a janela publicada ja passou (pipeline parado).

---

## Relatorio — template

Arquivo: `site-producao/diagnosticos/DIAGNOSTICO-YYYY-MM-DD.md`

```markdown
# DIAGNOSTICO ONLINE — szuchmacher.com.br
**Data:** YYYY-MM-DD HH:MM BRT
**Auditor:** [agente]
**Metodo:** audit-playwright-node.mjs + HTTP + headers + Task Scheduler
**Raw:** diagnosticos/audit-raw-*.json

## 1. Status paginas e endpoints
(tabela HTTP)

## 2. Playwright (home + multiasset)
(viewports, erros console, screenshots)

## 3. Performance
(load_ms, TTFB)

## 4. Seguranca / CSP
(headers vs Worker src/utils/headers.js)

## 5. Cloudflare / DNS / purge

## 6. Automacao (Task Scheduler + scripts)

## 7. Problemas (P0/P1/P2/P3)

## 8. OK sem acao
```

**Ranking:**
- **P0** — site down, leak de secret, formulario quebrado, tarefas ausentes
- **P1** — pageerror JS, macro 503, KPI nulo na home (selic_meta poison), drift critico, deploy sem commit
- **P2** — CSP ruido, macro cache velho, purge, overflow mobile
- **P3** — analytics, polish, scripts inexecutaveis por ambiente quebrado

---

## Pos-auditoria

- Correcoes P0/P1: corrigir → `publicar-com-rollback.ps1` (deploy seguro com validacao) ou `deploy-cloudflare.ps1` (deploy direto)
- Apos deploy, rodar `validar-producao.ps1` (28 verificacoes)
- Re-rodar bloco afetado para confirmar
- Registrar em `agent-memory.md` so se usuario pedir ("guarde isso")

## Delegacao para outras skills

| Alvo | Skill |
|------|-------|
| Fechamento diario (pipeline 19h, envio, idempotencia) | `/fechamento-szuchmacher-audit` |
| VIX Radar | `/vix-radar-audit` |
| Carteiras | `/verificar` |

## Arquivos do kit

| Arquivo | Funcao |
|---------|--------|
| `scripts/audit-playwright-node.mjs` | Playwright Node (funcional) |
| `scripts/audit-producao.py` | Playwright Python (venv morto — nao usar) |
| `scripts/check-mobile-agenda.py` | Agenda mobile (venv morto + VC++ ausente — nao usar) |
| `scripts/purge-cloudflare.ps1 -Diagnose` | Cloudflare (API purge sem permissao) |
| `scripts/invalidate-worker-cache.ps1` | Workaround para purge (invalida cache KV) |
| `scripts/deploy-cloudflare.ps1` | Deploy primario (Cloudflare Workers) |
| `scripts/publicar-com-rollback.ps1` | Deploy seguro com validacao e rollback |
| `scripts/validar-producao.ps1` | Gate de 28 verificacoes pos-deploy |
| `scripts/run-agenda-agent.ps1` | Runner da agenda (guarda + sondagem + geracao + assercao + publicacao) |
| `scripts/send-alert-email.ps1` | Alerta de falha na automacao |
| `cloudflare-workers/sz-sites/src/utils/headers.js` | Fonte canonica da CSP em producao |
