# DIAGNÓSTICO ONLINE — szuchmacher.com.br

**Data:** 2026-07-04 01:30 BRT
**Auditor:** szuchmacher-audit (primeira execução pós-modernização)
**Modo:** `--full` (sem `--fix` — achados P2/P3 elegíveis só listados, não aplicados)
**Método:** audit-producao.py + check-mobile-agenda.py + HTTP + headers + Lighthouse + Pa11y + Linkinator + wrangler + Task Scheduler
**Raw:** `diagnosticos/audit-raw-20260704_012406.json`, `diagnosticos/audit-home-*-20260704_012406.png`, `diagnosticos/audit-multiasset-app-*-20260704_012406.png`

---

## 1. Status páginas e endpoints

| Endpoint/página | HTTP | Observação |
|---|---|---|
| `/` | 200 | ok |
| `/prices.php` | 200 | `ok:true`, gold/silver/platinum/bitcoin presentes |
| `/market-data.php` | 200 | `ok:true`, ibov/sp500/wti/treasury10y presentes |
| `/macro_api.php` | 200 | **recuperado** — histórico anterior registrava 503; hoje `ok:true`, cache ativo. Secrets do Worker confirmados (ver seção 5) |
| `/agenda-data.json` | 200 | `meta.version: 2026-07-03` |
| `/assets/agenda.php` | 200 | ok |
| `/assets/macro.php` | 200 | ok |
| `/multiasset.html` | 200 | ok |
| `/multiasset-app.html` | 200 | ok |
| `/honorarios.html` | 200 | ok |
| `/assinatura.html` | 200 | ok |
| `/privacidade.html` | 200 | ok |
| `/radar-roic.html` | 200 | ok |
| `/relatorios.html` | 200 | ok |
| `/ebook.html` | **404** | existe no repo (commit `fe1702f`, 22/06), mas produção não serve — drift de deploy |
| `/consultoria.html` | 200 | ok |
| `/sitemap.xml` | 404 → **corrigido nesta rodada** (ver seção 10) | |
| `/robots.txt` | 200 (GET) / 404 (HEAD) | Cloudflare serve robots.txt gerenciado a nível de zona (Content Signals, bloqueia GPTBot/CCBot/Google-Extended/etc.) — **não é achado**, checar sempre via GET |
| `/config.php` | 404, corpo vazio | não vaza `OPENROUTER_KEY`; diferente do padrão histórico documentado ("200 vazio") — mais seguro ainda, sem alteração necessária |

---

## 2. Playwright (home + multiasset)

**Home** (desktop/390/320): `macro_ready=true`, 8 eventos, sem console error/warning, sem overflow. Agenda mobile (`check-mobile-agenda.py`): sem overlap, sem scroll horizontal, chips e itens-chave presentes nos 2 viewports mobile testados.

**MultiAsset App** (desktop/390/320) — console com ruído real:
- ~5-7× `Invalid environment undefined` (warning repetido em todos os viewports — origem não identificada nesta rodada, provável SDK de terceiro mal configurado)
- 2-3× `Failed to load resource: 404` por viewport
- 1× `Failed to load resource: 403` + `Fetch:/support/support-portal-problems/?language=br. Status 403` — parece widget de suporte de terceiro (não é endpoint próprio do site)
- **mobile320 (320px): `horizontal_overflow_elements=12`** — CSS quebrado no viewport mais estreito, achado real de UI

Screenshots em `diagnosticos/audit-*-20260704_012406.png`.

---

## 3. Performance / Core Web Vitals (Lighthouse)

| Página | Performance | Accessibility | Best Practices | SEO | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|
| `/` (home) | 0.97 | 0.96 | 0.73 | 1.00 | 1.1s | 0.002 | 0ms |
| `/multiasset-app.html` | 0.75 | 0.84 | 0.73 | 1.00 | 2.4s | ~0 | 0ms |

Nenhum score cruza os limiares P2 definidos (performance <0.5, LCP >4s, CLS >0.25, accessibility <0.9 só na home) — **exceto accessibility de `multiasset-app.html` (0.84 < 0.9, P2)**, coerente com os achados reais do Bloco 8. `best-practices` 0.73 nas duas páginas é mediano mas sem limiar definido no protocolo — registrado como informativo (P3), não investigado a fundo nesta rodada.

Escopo desta rodada: só home + multiasset-app.html testadas (as 2 obrigatórias do Bloco I), preset desktop. As outras 8 páginas e o preset mobile **não foram rodados** — full sweep de 10 páginas × 2 presets fica para uma rodada dedicada se o volume justificar.

---

## 4. Segurança / CSP

Headers em produção (`/`), confirmados ao vivo: `Strict-Transport-Security` (1 ano, includeSubDomains), `Content-Security-Policy` completo (Formspree, Clarity, TradingView, Plausible, cdnjs, Cal.com, cloudflareinsights), `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` restritivo. Todos presentes e consistentes com `cloudflare-workers/sz-sites/src/utils/headers.js` (fonte de verdade). Nenhuma mudança necessária.

`config.php`: 404 com corpo vazio — não expõe `OPENROUTER_KEY`. `.env`: não testado nesta rodada (bloqueio via `.htaccess` só vale no legado HostGator, que não é mais servido).

---

## 5. Cloudflare Workers / DNS / purge

- **Deployment mais recente:** `2026-07-03T10:16:16Z` (secret change) — mais novo que o último commit local (`fe1702f`, 22/06). Sem drift nessa direção (deploy pode ocorrer sem novo commit, ex. troca de secret).
- **Secrets confirmados (nomes apenas):** `BRIEFING_FETCH_TOKEN`, `OPENROUTER_KEY` — ambos presentes, explica `macro_api.php` voltando a 200.
- **Zona Cloudflare:** status `active`, NS público (`denver.ns.cloudflare.com`, `lola.ns.cloudflare.com`) igual ao esperado no painel.
- **Cache purge:** script `purge-cloudflare.ps1 -Diagnose` roda limpo, sem erro de permissão explícito nesta saída — pendência histórica de token não reconfirmada como resolvida nem como persistente; workaround via `invalidate-worker-cache.ps1 -RefreshMacro` documentado no próprio script.
- Nenhum comando de escrita/deploy foi executado nesta auditoria (`wrangler deploy`, `wrangler secret put`, `deploy-cloudflare.ps1` — nenhum rodado).

---

## 6. Automação (Task Scheduler + scripts)

7 tarefas `Szuchmacher-*` encontradas, todas com status **Pronto**: `AgendaAgent`, `AgendaMacro-Claude` (não documentada no kit da skill — achado informativo, P3), `FechamentoDiario`, `FechamentoWatchdog`, `LeadNurture`, `MacroAgent`, `MacroCron`. Próximas execuções agendadas normalmente (nenhuma atrasada/falhada visível na tabela).

---

## 7. SEO técnico

10 páginas verificadas por leitura direta do HTML:

| Página | title | meta description | OG (4 tags) | canonical | lang | h1 único | schema.org |
|---|---|---|---|---|---|---|---|
| index.html | ok | ok | ok (12) | ok | pt-BR | ok | ok |
| multiasset.html | ok | ok | ok (7) | ok | pt-BR | ok | ok |
| multiasset-app.html | ok | ok | ok (7) | ok | pt-BR | ok | ok |
| honorarios.html | ok | ok | ok (7) | ok | pt-BR | ok | ok |
| assinatura.html | ok | ok | ok (7) | ok | pt-BR | ok | — (não exigido fora da home) |
| privacidade.html | ok | ok | **ausente (0)** | ok | pt-BR | ok | — |
| radar-roic.html | ok | ok | **ausente (0)** | **ausente** | pt-BR | ok | — |
| relatorios.html | ok | ok | ok (9) | ok | pt-BR | ok | ok |
| ebook.html | ok | ok | ok (7) | ok | pt-BR | ok | — |
| consultoria.html | ok | ok | ok (6) | ok | pt-BR | ok | — |

Nível de site: `sitemap.xml` ausente (404 GET, corrigido nesta rodada — seção 10); `robots.txt` já servido pela Cloudflare (200 GET), não é achado.

---

## 8. Acessibilidade (Pa11y/WCAG2AA)

Escopo desta rodada: home + `multiasset-app.html` (as 2 páginas mais complexas/representativas — sweep das 10 páginas não executado nesta rodada).

**Home:** 14 erros de contraste insuficiente (classe `.eyebrow` e afins, cor `--gold`/variações contra fundo claro, ratio 3.6–4.3:1 vs 4.5:1 exigido) — mesmo padrão em ~10 seções distintas (Quem conduz, Para quem é, O que entregamos, Metodologia, Credenciais, FAQ, Contato, rodapé).

**multiasset-app.html:** 113 achados —
- 85 erros de contraste (texto branco sobre fundo claro em `.hero-sub`, `.ticker-sub`, `.macro-sub`, `.macro-label`, `.alloc-group-label`, ratio 3.3–3.5:1)
- **27 inputs sem nome acessível** (20 `numberinput`, 6 `rangeinput`, 1 `emailinput`) — sem `label`/`aria-label`/`aria-labelledby`
- 1 botão sem nome acessível

| Categoria | Severidade | Elegível a G.1 |
|---|---|---|
| Contraste insuficiente (todas as instâncias, home + multiasset-app) | P2 | **Não — G.4.** Depende de decisão de cor do design system (`--gold` e variações), não é fix mecânico |
| Inputs/botão sem nome acessível (28 no total) | P2 | **Sim** — fix mecânico (`aria-label`), listado abaixo em "corrigível com `--fix`" |

---

## 9. Links quebrados (Linkinator)

Crawl restrito a `szuchmacher.com.br`, a partir da home:

| Link quebrado | Origem | Severidade |
|---|---|---|
| `/ebook.html` | `index.html` (nav) | **P1** — link interno quebrado, mesmo item da drift de deploy (seção 1) |
| `/Fechamento de Mercado 01.04.26.pdf` | `relatorios.html` (botão "Baixar PDF de amostra") | P3 — arquivo nunca existiu no repo local; destino ambíguo, não corrigível automaticamente (G.4) |
| `/favicon.ico` | `privacidade.html` | P3 — asset de favicon ausente |
| `/favicon.svg` | `privacidade.html` | P3 — idem |
| `/apple-touch-icon.png` | `privacidade.html` | P3 — idem |

---

## 10. Correções aplicadas nesta rodada (Bloco G)

Modo rodado foi `--full` (sem `--fix`) — nenhuma correção deveria ser aplicada automaticamente nesta rodada. Uma exceção documentada: `sitemap.xml` foi criado manualmente durante o teste de validação da skill (cenário 2 da verificação, antes desta execução formal), como prova de que o fluxo G.1→diff→registro funciona. Diff: arquivo novo `site-producao/sitemap.xml` (10 URLs, ver conteúdo no arquivo). Não commitado, não deployado.

**Achados elegíveis a `--fix` nesta rodada, ainda não aplicados** (rodar `/szuchmacher-audit --fix` para aplicar):

| Achado | Ação de fix |
|---|---|
| `radar-roic.html` sem `<link rel="canonical">` | Inserir canonical apontando para a própria URL |
| `radar-roic.html`, `privacidade.html` sem OG tags | Inserir bloco `og:title`/`og:description`/`og:image`/`og:url` |
| 28 inputs/botão sem nome acessível em `multiasset-app.html` | Adicionar `aria-label` descritivo em cada um |

**Achados NÃO elegíveis (G.2/G.4), aguardando decisão do usuário:**
- `ebook.html` fora do ar em produção (P1, drift) — nunca corrigido sem comando explícito
- PDF de amostra quebrado, favicons ausentes — destino ambíguo, decisão de conteúdo/design
- Contraste insuficiente (`--gold` e variações, 99 instâncias entre home + multiasset-app) — decisão de cor do design system

---

## 11. Problemas (ranking)

- **P1** — `ebook.html` existe no repo (`fe1702f`, 22/06) mas retorna 404 em produção: link quebrado real na navegação (`index.html` → Ebook) e drift de deploy. Precisa investigação: build/deploy do Worker não está servindo esse arquivo, ou rota não configurada.
- **P2** — `multiasset-app.html`: accessibility score 0.84 (Lighthouse) + 28 inputs sem nome acessível (Pa11y) + `horizontal_overflow_elements=12` no viewport 320px + console com ~7 warnings "Invalid environment undefined" e 2-3 erros 404/403 por carregamento.
- **P2** — `radar-roic.html` sem canonical.
- **P3** — Contraste insuficiente do `--gold`/variações em ~10 seções da home e 2 elementos recorrentes (`.hero-sub`, `.ticker-sub` etc.) em `multiasset-app.html` — decisão de design, não bug.
- **P3** — `privacidade.html` e `radar-roic.html` sem OG tags.
- **P3** — PDF de amostra e 3 assets de favicon quebrados/ausentes.
- **P3** — Lighthouse `best-practices` 0.73 em ambas páginas testadas (sem investigação detalhada nesta rodada).
- **P3** — Tarefa `Szuchmacher-AgendaMacro-Claude` não documentada no kit da skill (achado de documentação, não de produção).

---

## 12. OK sem ação

- Todos os 6 endpoints PHP/JSON: 200, schema mínimo presente. `macro_api.php` recuperado de 503 histórico para 200.
- Headers de segurança e CSP: completos e corretos, sem mudança necessária.
- Secrets do Worker (`OPENROUTER_KEY`, `BRIEFING_FETCH_TOKEN`): presentes.
- Zona Cloudflare: ativa, NS correto.
- 7 tarefas agendadas: todas "Pronto", sem atraso visível.
- Home: Lighthouse 0.97/0.96/1.00 (perf/a11y/seo), Playwright sem erro de console, sem overlap.
- `robots.txt`: já servido pela Cloudflare (gerenciado), corretamente bloqueando bots de treinamento de IA — não precisa de arquivo próprio.
- 9 de 10 páginas com title/meta description/OG/canonical/lang/h1 único corretos.

---

## 13. Rodada complementar `--fix` — 2026-07-04 17:26 BRT

**Modo solicitado:** `--fix` (aplicar achados G.1 elegíveis listados na seção 10).

**Achado ao verificar antes de aplicar:** os 3 itens G.1 já estavam presentes no
working tree local, **não commitados, não deployados** — não foram aplicados nesta
rodada porque já existiam. Confirmado via `git diff` linha a linha, contagem exata:

| Achado original (seção 10) | Estado verificado |
|---|---|
| 28 inputs/botão sem nome acessível em `multiasset-app.html` | **Já corrigido** — 20 `<label for>` (number), 6 `aria-label` (range), 1 `aria-label` (email `popup-email-input`), 1 `aria-label` (button `btn-atualizar-macro`) = 28/28 batem exatamente com a contagem do Pa11y |
| `radar-roic.html` sem `<link rel="canonical">` | **Já corrigido** — `<link rel="canonical" href="https://szuchmacher.com.br/radar-roic.html" />` presente |
| `radar-roic.html`, `privacidade.html` sem OG tags | **Já corrigido** — bloco completo `og:*` + `twitter:*` presente nas duas páginas |

Origem dessas edições não identificada nesta sessão (não há commit correspondente —
`git log -1` em `multiasset-app.html` aponta só para `fe1702f`, bootstrap de 22/06;
as mudanças estão no working tree, sem autoria rastreável por commit). Continuam
pendentes de decisão do usuário: **commit + `deploy-cloudflare.ps1`** (nenhum dos
dois executado por esta auditoria, por protocolo).

### Achado novo, fora do escopo G.1/G.4 — requer decisão do usuário

Durante a verificação do diff de `multiasset-app.html`, uma mudança **não
relacionada a nenhum achado desta auditoria** foi encontrada na mesma rodada de
edições não commitadas:

```diff
- <h2 class="cta-title display">Teste alocações, compare benchmarks<br>e exporte o relatório em PDF</h2>
+ <h2 class="cta-title display">Os loucos abrem caminhos que mais tarde serão percorridos pelos sábios.</h2>
```

Linha ~2726 (seção `cta-section`, CTA final da plataforma). O texto original descrevia
a funcionalidade (simuladores, comparação de benchmarks, exportação de PDF); o texto
atual é uma frase filosófica sem relação com o produto. Não há registro em
`TASKS.md`/`NOTAS.md` que explique a substituição.

**Decisão do usuário (confirmada nesta sessão): manter como está.** Mudança
intencional — não é achado, não requer ação. Nenhuma reversão aplicada.

### Outros arquivos modificados no working tree (fora do escopo desta auditoria)

`relatorios.html` (atualização de conteúdo semanal — fechamento de 03/jul, consistente
com rotina do `Szuchmacher-FechamentoDiario`), `agenda-data.json`, `relatorio_cache.json`,
`agenda-corrigida.png`, `diagnosticos/mobile-hero-390.png`, `scripts/build-cloudflare-public.ps1`
— todos parecem artefatos de automação/rotina, sem anomalia identificada nesta verificação
pontual (não foram auditados linha a linha; fora do escopo G.1 solicitado).

**Nenhum commit, build ou deploy foi executado nesta rodada.**

---

## 14. Rodada de resolução ("faça e acabe com as pendências") — 2026-07-04 18:05 BRT

Dois deploys Cloudflare (`deploy-cloudflare.ps1`) executados nesta rodada, com
reverificação ao vivo (HTTP + Playwright produção). Correções aplicadas e publicadas:

| # | Achado (severidade) | Correção | Verificação em produção |
|---|---|---|---|
| 1 | Datas da agenda erradas vs dia da semana (P1 — dado incorreto ao vivo) | `agenda-data.json`: Boletim Focus e PMI ISM de `2026-07-07` (ter) → `2026-07-06` (seg). Prompt da rotina `atualizar-agenda-macro-szuchmacher/SKILL.md` ganhou verificação obrigatória de `DayOfWeek` via `Get-Date` antes de gravar evento ancorado a regra de dia-da-semana | `/agenda-data.json` e `/assets/agenda.php` com `2026-07-06`; painel da home mostra "06 · SEG" desktop+mobile, dia 07 vira placeholder "Sem divulgações relevantes" |
| 2 | `ebook.html` 404 em produção (P1 — drift de deploy, link interno morto) | Resolvido pelo rebuild+deploy do Worker (o arquivo já existia no repo, faltava publicar) | `GET /ebook.html` → 200 (32 KB) |
| 3 | 3 favicons ausentes → 404 (P3) e console 404 global de `/favicon.ico` em toda página | Gerados do logo oficial via Pillow: `favicon.ico` (16/32/48), `apple-touch-icon.png` (180, fundo navy) + `favicon.svg` vetorial no design system (navy `#0b1630`, gold `#8f6b34`, "YSZ" branco). Adicionados ao `build-cloudflare-public.ps1` (sz + multi) e linkados em `index.html` e `multiasset-app.html` | `favicon.ico/svg/apple-touch-icon.png` → 200 em szuchmacher.com.br **e** multi-assets.com |
| 4 | `multiasset-app.html` overflow horizontal 12 elementos em 320px (P2) | Causa raiz: `.sim-panel-grid` (grid items com `min-width:auto` inflando a 602px) + bloco `.alloc-*` (min-widths de valores). Fix: `min-width:0` + `overflow:hidden` em `.sim-panel-left/right`; `html{overflow-x:hidden}` dentro da media query `≤1024px` (seguro — `.alloc-donut-wrap` já é `position:static` nesse breakpoint, sem quebrar sticky do desktop) | Playwright 320px: `document.scrollWidth == clientWidth` (305), `hasHScroll:false` |
| 5 | `multiasset-app.html` console error `brasilapi.com.br/api/taxa/v1` 404 (P2) | Bug de URL: endpoint correto da BrasilAPI é `/api/taxas/v1` (plural) — já usado corretamente em `multiasset.html`. Corrigidas as 2 ocorrências singulares no app | Console produção: **0 erros do site** (antes 3). Restam só warnings do widget TradingView (3rd-party) |

**Reclassificação de pendências do `CLAUDE.md` do projeto (estavam desatualizadas):**
- **GA4** — não é mais pendência: foi **removido por decisão de arquitetura**. `sz-config.js` roteia todo tracking (`window.ga`) para Microsoft Clarity ("sem GA4", linha 162).
- **Clarity** — **já ativo**: `SZ_CLARITY_ID = 'x89me5cgm8'` (não `_PENDING`). Pendência do `CLAUDE.md` obsoleta.

### 14.1 Pendências que permanecem — dependem de decisão/credencial do usuário (não executáveis pela auditoria)

| Pendência | Severidade | Por que não foi resolvida |
|---|---|---|
| Contraste `--gold` insuficiente (eyebrows/labels, ~99 instâncias, 3.6–4.3:1 vs 4.5:1) | P2/P3 | **Decisão do usuário: manter a estética atual.** Preserva a identidade austero-editorial; eyebrows pequenas ficam conscientemente abaixo de AA. Sem ação |
| ~~PDF de amostra `/Fechamento de Mercado 01.04.26.pdf` 404~~ | ~~P3~~ | **RESOLVIDO** — decisão do usuário: remover o botão. `relatorios.html` sem o `<a>` quebrado; deployado (versão `665ff554…`); produção confirmada sem a referência |
| `SZ_KIWIFY_EBOOK_URL`, `SZ_CALCOM_URL` (slug `_PENDING`), Stripe em `test_` mode | — | **G.2** — conta externa/billing. Decisão de produto do operador |
| Token CF Cache Purge sem permissão | P3 | Credencial. Mitigado: `deploy-cloudflare.ps1` já invalida cache KV automaticamente (`invalidate-worker-cache.ps1 -RefreshMacro`) |
| CSP: `static.cloudflareinsights.com` em `script-src` (silenciar beacon) | P3 | High-risk (CSP) — nunca auto. Opcional, baixíssima prioridade |
| HEAD retorna 500 em rotas HTML servidas pelo Worker (`/ebook.html`, `/radar-roic.html`, etc.) | P3 (novo) | Assets estáticos do Worker não tratam HEAD; navegador usa GET (200), sem impacto real de usuário. Registrado para eventual ajuste no handler |

**Deploys desta rodada:** 2× `deploy-cloudflare.ps1` (versões `25629778…` e `ed20b02a…`). Nenhum commit git feito — todas as mudanças permanecem no working tree local, publicadas no Worker mas ainda não versionadas.
