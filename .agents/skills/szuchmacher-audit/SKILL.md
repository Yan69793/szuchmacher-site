---
name: szuchmacher-audit
description: >-
  Auditoria completa semanal do site szuchmacher.com.br + multi-assets.com.
  Seis blocos (A-F): portao de qualidade, drift git, endpoints, agenda/macro,
  automacao e seguranca. Produz DIAGNOSTICO-<data>.md em
  site-producao/diagnosticos/ com achados P0-P3 e evidencia colada.
  Use ao iniciar auditoria periodica, pos-deploy relevante ou ao investigar
  comportamento anomalo em producao.
trigger: model_decision
---

# szuchmacher-audit — Auditoria semanal completa

Projeto: szuchmacher.com.br + multi-assets.com
Stack: Cloudflare Worker `sz-sites`, KV CACHE, binding ASSETS, Task Scheduler Windows
Deploy primario: `.\scripts\publicar-com-rollback.ps1`

## Antes de comecar

1. Ler `status/ESTADO.md` (canonico de estado do projeto).
2. `git status --porcelain` — se houver mudanca nao commitada em arquivo publicavel, documentar antes de prosseguir. A guarda de working tree do `run-agenda-agent.ps1` aborta a rotina de domingo nesse estado.
3. Confirmar que `site-producao/` e o CWD para todos os comandos desta skill.

---

## Bloco A — Portao de qualidade

```powershell
cd site-producao; .\scripts\validar-producao.ps1
```

- Cole a saida real. **Use a contagem que a saida mostrar** — nao hardcode um numero. A contagem muda quando nova checagem entra.
- Qualquer falha e bloqueante: define o restante da auditoria.
- Gate verde nao encerra o bloco — continuar nos proximos.

### Playwright / coleta de UI

Se `audit-producao.py` ou `check-mobile-agenda.py` falharem com "executable ausente" (chromium_headless_shell):

1. **Nao abortar a auditoria.** Registrar no DIAGNOSTICO: "Playwright Python sem browser local."
2. Cair no **Playwright MCP** para coleta de UI (mesmos seletores: `.mp-ev`, `#macroPanel[data-state=ready]`).
3. Salvar screenshots em `diagnosticos/` com timestamp.
4. `playwright install chromium` **nao e passo silencioso** — se falhar, registrar o erro completo.

---

## Bloco B — Drift git vs. producao

```powershell
git log --oneline -5
git status --porcelain
# dentro de cloudflare-workers/sz-sites:
npx wrangler deployments status
```

- Se a versao viva no Worker for posterior ao ultimo commit que toca arquivo publicavel: producao esta rodando codigo que nao existe em nenhum commit → **achado P1**.
- Liste `diagnosticos/publicacao_*.md` por data: todo deploy legitimo gera um. Deploy sem relatorio correspondente saiu por fora de `publicar-com-rollback.ps1`.

---

## Bloco C — Endpoints

Testar os endpoints de `API_ROUTES` em `src/index.js` nos dois dominios quando aplicavel. Confirmar schema, nao so HTTP 200. A fonte de verdade e o proprio `API_ROUTES`: a tabela abaixo cobre as rotas com contrato relevante e ja ficou para tras uma vez (geopolitica, regulatorio e cdi/usdbrl entraram depois).

| Endpoint | O que confirmar |
|---|---|
| `/prices.php` | `ok: true`, valores nao nulos |
| `/market-data.php` | `ok: true`, campos de ativos nao nulos |
| `/relatorio-prices.php` | `ok: true` (contrato com a pagina de relatorios) |
| `/macro_api.php` | `canais` e `cenarios_brent` preenchidos (vazio = P1-C recorrente) |
| `/assets/macro.php` | `selic_meta` e `cambio_ptax` nao nulos (null + `fresh:true` = cache envenenado, P1-B) |
| `/assets/agenda.php` | janela correta e `meta.version` da ultima curadoria |
| `/assets/regulatorio.php` | `atualizado_em` da ultima curadoria e fontes oficiais |
| `/assets/geopolitica.php` | `schema_version: 1` e `week` (iso/start/end/label) da semana corrente |
| `/api/ntnb-scenarios` | `source` diferente de `defaults` (fonte viva ativa, hoje `yahoo`; confirmar o provider esperado em `src/handlers/ntnb-scenarios.js` se mudar) |
| `/api/cdi-scenarios` | `ok: true` e direcao pessimista = juros altos |
| `/api/usdbrl-scenarios` | `ok: true`, sem `defaults` |
| `/api/btc-scenarios` | resposta valida |
| `/health` | `kv: ok`, `macro_cron_last` com ts e expressao `0 3 * * MON` |
| `/relatorio-signup` | 422 para email invalido (prova que o endpoint esta vivo) |
| `/stripe-webhook` | **401** sem assinatura/payload (nao 400: o handler devolve 401 quando a verificacao HMAC nao passa; prova que a rota existe e a guarda roda) |

Fora do `API_ROUTES`: `/fechamento/*` e rota de prefixo, tratada em `routeRequest` antes do mapa de endpoints.

Para latencia usar `-w "\nHTTP:%{http_code} TEMPO:%{time_total}s"`. Referencia: endpoints normais < 400 ms; `macro_api.php` a frio ja levou 32 s — timeout da linha de validacao = 90 s.

---

## Bloco D — Agenda e macro

1. Ler `cloudflare-workers/sz-sites/public/sz/agenda-data.json` (o `public/sz/assets/` tem so JS/CSS/img) e conferir o campo `janela` e `meta.version`.
2. Abrir a home e ler o rotulo calculado por `public/sz/assets/macro-panel.js` (`rotuloJanelaAgenda`).
   - "Semana de referencia" = pipeline parado (a janela publicada ja passou).
   - "Esta semana" = normal.
3. Em `/health`, conferir `macro_cache` — nao deve estar `"empty"`.
4. Conferir `macro_cron_last.ts` — deve corresponder a ultima segunda-feira depois das 03:00 UTC.
5. Conferir `public/sz/geopolitica-data.json` (`week.label`) contra a semana corrente. Edicao velha = `Szuchmacher-GeopoliticaAgent` falhou no domingo e o fallback de segunda tambem.
6. Os horarios da agenda sao calculados em `automacao-yan-os/agents/agenda_agent.py`: BCE 09:15 BRT no verao CET/CEST (10:15 no inverno) e BoE 08:00 BRT no BST (09:00 no GMT). Fuso errado nao aparece no gate, so na leitura humana do painel — confira um horario europeu/UK conhecido contra o calendario oficial.

---

## Bloco E — Automacao

```powershell
schtasks /Query /FO TABLE | Select-String 'Szuchmacher'
```

Para cada tarefa: ultimo resultado e ultima execucao.

**Tasks DESTE projeto** (site-producao):
- `Szuchmacher-AgendaAgent` (dom+seg+qui 08:00)
- `Szuchmacher-GeopoliticaAgent` (dom 18:00, fallback seg 08:30 — registrada por `scripts/register-geopolitica-task.ps1`)
- `Szuchmacher-MacroCronWatchdog` (seg 09:00 — watchdog local do cron CF)
- `Szuchmacher-MacroCron` (desabilitada desde 15/08/2026 — estado esperado, nao e achado)

**Tasks de outros projetos** (nao investigar aqui):
- `Szuchmacher-FechamentoDiario`, `Szuchmacher-FechamentoWatchdog`, `Szuchmacher-RevisaoPosEnvio`, `Szuchmacher-LeadNurture`, `Szuchmacher-MacroAgent`, `Szuchmacher-AgendaMacro-Claude`, `Szuchmacher-BriefingMatinal`, `Szuchmacher-BriefingWatchdog`, `Szuchmacher-ColetaManchetes`, `Szuchmacher-PreflightAnthropic`, `Szuchmacher-MelhoriaSemanal`, `Szuchmacher-RetryVixMatinal`, `Szuchmacher-RetryVixNoturno` → pertencem a `relatorio-diario-szuchmacher` / briefing.

Codigo 103 = interpretador Python morto (Python base sumiu, venv continua existindo). Resolver por sondagem de execucao, nao `Test-Path`.

### Watchdog externo ao Cron Trigger da Cloudflare

O Cron Trigger da CF pode sumir em silencio (forum CF 2026-04/06/07: crons registrados, Next visivel, `scheduled()` nunca invocado). Segundo cron no mesmo Worker cai no mesmo dispatcher.

**O carimbo `macro_cron_last` em `/health` ja e o ping.** Confirmar que o `Szuchmacher-MacroCronWatchdog` esta **Ready** no Task Scheduler — ele e o monitor de ausencia que vive fora do scheduler que pode falhar. Nao confiar no Cron Trigger da CF como unico sinal de saude. Nao meter SLO de trigger no `validar-producao.ps1`.

---

## Bloco F — Seguranca

```powershell
curl.exe -sI https://szuchmacher.com.br | Select-String 'strict|x-frame|content-type|referrer|permissions|content-security|x-served'
curl.exe -sI https://multi-assets.com | Select-String 'strict|x-frame|content-type|referrer|permissions|content-security|x-served'
```

Confirmar presenca de: `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Content-Security-Policy` (sem `unsafe-inline` nem `unsafe-eval`), `X-Served-By: sz-sites-worker`.

Confirmar que arquivos sensiveis respondem 404:

```powershell
foreach ($f in @('config.php','.env','wrangler.toml','wrangler.jsonc')) {
    $r = curl.exe -so /dev/null -w "%{http_code}" "https://szuchmacher.com.br/$f"
    "$f -> $r"
}
```

---

## Registro

Escrever `diagnosticos/DIAGNOSTICO-<YYYYMMDD>.md` com:
- Achados classificados P0 a P3
- Secao "OK sem acao"
- Proximos passos numerados
- **Nunca com suposicao**: cada linha precisa de evidencia colada.

Referencia de formato: `diagnosticos/DIAGNOSTICO-2026-08-30.md`.

---

## Issues conhecidas — tabela de "nao reabrir"

> **Regra:** Apos deploy que fecha um item desta tabela, atualizar a data na coluna "Fechado em" no mesmo dia da vistoria. Baseline so funciona se acompanhar o que a producao ja fechou.

> **Ruido P3 conhecido (nao e regressao, nao abrir achado):** console CSP do widget TradingView no multi (hash `sha256-JyHF32z4...`, catalogado em 31/08) e hash `sha256-biLFin...` na home (presente desde 05/09, sem impacto visual). Ambos aparecem nos raws do Playwright.

| Issue | Fechado em | Evidencia |
|-------|-----------|-----------|
| brapi 401 (P2) | 2026-08-14 | `/market-data.php` com `ok: true` e cotacoes vivas |
| NTNB11 stale (P2) | 2026-08-14 | `/api/ntnb-scenarios` com fonte viva |
| Cron CF disparando domingo (Quartz bug) | 2026-08-31 | `macro_cron_last` com `cron: "0 3 * * MON"` e ts de segunda |
| Cache macro vazio pos-deploy | 2026-08-31 | `macro_cache` nao-empty apos deploy `2065188f` |
| CSP `unsafe-inline` (sz + multi) | 2026-08-31 | CSP sem `unsafe-inline` nos dois dominios |
| CORS por substring (`origin.includes`) | 2026-08-30 | Origin malicioso cai no fallback fixo |
| GET/HEAD com `Content-Length: 0` to 500 | 2026-08-30 | HEAD em rota HTML responde 200 |
| `/api/ntnb-scenarios` retorna `defaults` no fim de semana | 2026-08-30 | `source` diferente de `defaults` num domingo |
| Handlers mortos por prefixo `data-ev` (Fase B) | 2026-08-31 | 109 handlers disparando, abas funcionando |
| `class=` colado em tag (35 pontos, Fase B) | 2026-08-31 | 0 tag fundida no HTML servido |
| Tracker regulatorio ANEEL/Enel | 2026-09-08 | `/assets/regulatorio.php` com `atualizado_em=2026-09-08` |
| Stack do Radar Geopolitico (pagina + endpoint + agente) | 2026-09-08 | `/assets/geopolitica.php` com `schema_version: 1` e `week.label` da semana seguinte |
| Horarios BCE/BoE da agenda em BRT errado | 2026-09-09 | commits `ac19987`/`666dbe3`/`2884b6e`, `agenda-data.json` republicado (BCE 09:15 BRT no verao, BoE 08:00 no BST) |
