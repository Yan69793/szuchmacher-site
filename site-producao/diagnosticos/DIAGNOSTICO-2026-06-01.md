# DIAGNÓSTICO ONLINE — szuchmacher.com.br
**Data:** 2026-06-01 (23:37 – 23:55 BRT)  
**Auditor:** Antigravity / Claude  
**Método:** HEAD + GET em produção, análise de headers HTTP, varredura de código local  
**Baseline comparada:** `_baseline-producao-2026-05-30/`

---

## 1. STATUS DE PÁGINAS E ENDPOINTS

### 1.1 Páginas HTML

| URL | HTTP | Tamanho | Last-Modified |
|-----|------|---------|---------------|
| szuchmacher.com.br/ | **200 ✅** | 52,6 KB | 12 Mai 2026 |
| /relatorios.html | **200 ✅** | 32,6 KB | 02 Mai 2026 |
| /multiasset.html | **200 ✅** | 45,3 KB | 10 Mai 2026 |
| /multiasset-app.html | **200 ✅** | 271,6 KB | 30 Mai 2026 |
| /privacidade.html | **200 ✅** | 8,7 KB | — |
| /honorarios.html | **200 ✅** | 37,4 KB | 30 Mai 2026 |

### 1.2 Endpoints PHP

| Endpoint | HTTP | Resposta | Status |
|----------|------|----------|--------|
| /assets/macro.php | **200 ✅** | JSON completo (BCB SGS + Focus) | OK |
| /assets/agenda.php | **200 ✅** | JSON com eventos da semana 01–06/Jun/2026 | OK |
| /prices.php | **200 ✅** | `{"ok":true,"gold":4482.48,"silver":74.8,"platinum":1922.89,"bitcoin":71179.55,"updated":"01/06/2026 19:30"}` | OK |
| /macro_api.php | **503 ❌** | Erro do servidor (OPENROUTER_KEY não configurada) | QUEBRADO (P1 conhecido) |

### 1.3 Assets Estáticos

| Asset | HTTP | Tamanho | Status |
|-------|------|---------|--------|
| /og-cover.jpg | **200 ✅** | 180 KB | OK |
| /logo.png | **404 ❌** | — | AUSENTE |
| /assets/sz-config.js | **200 ✅** | 12,7 KB | OK |

---

## 2. HEADERS DE SEGURANÇA (produção)

Auditado via `Invoke-WebRequest -Method Head` em 01/06/2026.

| Header | Valor em produção | Avaliação |
|--------|-------------------|-----------|
| HSTS | `max-age=31536000; includeSubDomains` | ✅ Correto |
| X-Frame-Options | `SAMEORIGIN` | ✅ Correto |
| X-Content-Type-Options | `nosniff` | ✅ Correto |
| Referrer-Policy | `strict-origin-when-cross-origin` | ✅ Correto |
| Permissions-Policy | geolocation, camera, etc. restritos | ✅ Correto |
| Server | `Apache` | ⚠️ `.htaccess-server` faz `Header unset Server` mas isso não está chegando ao servidor (veja item 3) |
| Cache-Control (HTML) | `max-age=3600` | ✅ 1h, razoável |
| Content-Security-Policy | **ver análise detalhada abaixo** | ⚠️ DIVERGÊNCIA |

### 2.1 Análise do CSP em produção vs .htaccess-server local

**CSP em produção (medido hoje):**
```
connect-src 'self' ... https://www.google-analytics.com https://analytics.google.com 
https://stats.g.doubleclick.net
```
→ **Formspree NÃO está no connect-src**

**CSP no .htaccess-server local (versão corrigida em 01/06/2026):**
```
connect-src 'self' ... https://formspree.io
form-action 'self' https://szuchmacher.com.br https://formspree.io
```
→ **Formspree ESTÁ no connect-src e no form-action**

**Conclusão:** O arquivo `.htaccess-server` foi atualizado localmente em 01/06/2026 para adicionar `formspree.io` ao CSP, mas **essa versão ainda não foi deployada para o servidor**. O formulário de contato da home e da plataforma está enviando POST via `fetch()` ao `formspree.io`, e o CSP do servidor está bloqueando essa conexão silenciosamente no browser do usuário.

**Evidência do bug:** comentário no `.htaccess-server` linha 32–34:  
> "quebrando o botão 'Assinar grátis'. Evidência: console 'violates connect-src'"

---

## 3. PROBLEMAS IDENTIFICADOS (ranking por gravidade)

### 🔴 P1-A — .htaccess com CSP desatualizado no servidor [DEPLOY PENDENTE]
- **Impacto:** Formulário de contato (leadForm em index.html) e formulário de assinatura (multiasset-app.html) bloqueados silenciosamente pelo CSP. O usuário clica "Enviar" ou "Assinar grátis" e nada acontece — sem mensagem de erro visível.
- **Causa:** `.htaccess-server` foi corrigido localmente em 01/06/2026 mas não foi uploadado para o servidor.
- **Correção:** Fazer upload do `.htaccess-server` como `.htaccess` no `/public_html/` do servidor via FTP/cPanel.
- **Verificação:** Após deploy, recarregar a home, abrir DevTools → Console → sem "Content Security Policy violation" ao submeter o form.

### 🔴 P1-B — macro_api.php retornando 503 [PROBLEMA CONHECIDO, SEM SOLUÇÃO APROVADA]
- **Status hoje:** 503 confirmado. Texto de fallback na plataforma em vigor: "Cenário Global · Maio 2026" (tampão de 30/05/2026).
- **Texto estático:** Atualizado em 30/05/2026 (tampão Opção C). Conteúdo atual: cessar-fogo EUA-Irã, Selic 14,50%, IPCA 5,04%, BRL ~5,02–5,06. **Factualmente correto para hoje (01/06/2026).**
- **Pendência:** Depende de decisão de produto de Yan (Opções A/B/C documentadas no DIAGNOSTICO-2026-05-30).
- **Ação necessária:** Nenhuma agora — o tampão está correto e adequado. Revisar semanalmente.

### 🟠 P2 — /logo.png retornando 404
- **Impacto:** Referenciado no JSON-LD schema.org da home: `"logo": "https://szuchmacher.com.br/logo.png"`. Motores de busca e redes sociais (Open Graph fallback via schema) não encontram o logo institucional.
- **Detalhe:** o og-cover.jpg (180 KB) está correto e funcional. O logo.png é específico do schema.org `Organization.logo`.
- **Correção:** Ou fazer upload de um logo.png (formato recomendado: 512x512px, fundo branco/transparente), ou alterar o schema para usar a og-cover.jpg.
- **Prioridade:** Média — não quebra nada funcional, mas prejudica SEO estruturado e rich results no Google.

### 🟡 P3 — GA4 e Microsoft Clarity não configurados
- **Status:** `sz-config.js` em produção contém `GA_ID_PENDING` e `CLARITY_ID_PENDING`.
- **Impacto:** Zero coleta de analytics. Não há dados de visitas, conversões, funil ou comportamento.
- **Ação:** Configurar no cPanel/Google Analytics os IDs reais e atualizar o `sz-config.js`.
- **Formspree:** `mojrayrl` — configurado corretamente. ✅

### 🟡 P4 — relatorios.html antiga (Last-Modified: 02 Mai 2026)
- **Detalhe:** Enquanto o index.html foi atualizado em 12/Mai e a plataforma em 30/Mai, a página de relatórios não recebe update há 30 dias.
- **Impacto:** Depende do conteúdo — se os PDFs são listados dinamicamente não há problema; se há referências a datas fixas, pode estar desatualizado.
- **Ação:** Verificar se o conteúdo da página precisa de atualização.

### 🟡 P5 — Server header exposto ("Apache")
- **Detalhe:** O `.htaccess-server` tem `Header unset Server`, mas o deploy pendente significa que o servidor ainda anuncia `Server: Apache`.
- **Impacto:** Baixo. Após o deploy do .htaccess (P1-A), esse header sumirá automaticamente.
- **Ação:** Resolvido automaticamente com P1-A.

---

## 4. ITENS VERIFICADOS E OK (sem ação necessária)

| Item | Status |
|------|--------|
| HTTPS forçado (HSTS) | ✅ Funcional |
| Font Awesome 6.4.0 (cdnjs) | ✅ No CSP (`style-src` + `font-src` incluem `cdnjs.cloudflare.com`) — P2 do diagnóstico anterior RESOLVIDO |
| Chart.js 4.4.0 (cdnjs) | ✅ No CSP |
| TradingView widgets | ✅ `frame-src` e `script-src` corretos |
| AwesomeAPI (USD/BRL) | ✅ No `connect-src` |
| BCB SGS API | ✅ No `connect-src`, retornando dados |
| BrasilAPI 404 | ✅ Removida — comentário no código confirma (P3 anterior RESOLVIDO) |
| BrapiDev 401 NTN-B | Mantida mas com fallback funcional |
| og-cover.jpg | ✅ 200, 180 KB |
| sz-config.js | ✅ 200, carregando em todas as páginas |
| prices.php (ouro/prata/platina/BTC) | ✅ Dados ao vivo de 19:30 01/06/2026 |
| assets/macro.php (Selic/IPCA/Focus/PTAX) | ✅ Dados ao vivo (BCB, atualizado em 01/06/2026) |
| assets/agenda.php | ✅ JSON com eventos da semana corrente |
| Conteúdo macro estático (tampão Mai/2026) | ✅ Factualmente correto para 01/06/2026 |
| Overflow horizontal mobile (P3 anterior) | ✅ `body { overflow-x: hidden }` em vigor |
| GZIP ativo | ✅ `mod_deflate` configurado no .htaccess |
| Canonical tag | ✅ `<link rel="canonical" href="https://szuchmacher.com.br/">` |
| robots meta | ✅ `index,follow,max-image-preview:large` |
| Schema JSON-LD | ✅ Organization, Person, WebSite, FinancialService, FAQPage |
| Open Graph / Twitter Card | ✅ Completos, og:image funcionando |

---

## 5. PLANO DE AÇÃO (por prioridade)

| # | Ação | Urgência | Responsável | Verificação |
|---|------|----------|-------------|-------------|
| 1 | **Deploy do .htaccess corrigido** (Formspree no CSP) | 🔴 Imediata | Deploy via FTP → `.htaccess` em `/public_html/` | Testar envio do form, sem erro de CSP no console |
| 2 | Criar/upload do logo.png (512x512) | 🟠 Esta semana | Upload para `/public_html/logo.png` | Verificar `https://szuchmacher.com.br/logo.png` retorna 200 |
| 3 | Configurar GA4 + Clarity em sz-config.js | 🟡 Próximos dias | Substituir `GA_ID_PENDING` e `CLARITY_ID_PENDING` pelos IDs reais | `SZ.gaReady` e `SZ.clarityReady` = `true` |
| 4 | Revisar relatorios.html | 🟡 Esta semana | Verificar se há datas ou referências desatualizadas | — |
| 5 | Decisão sobre macro_api.php | 🟡 Sem urgência | Decisão de produto de Yan (Opções A/B/C) | — |

---

## 6. DADOS AO VIVO CONFIRMADOS EM PRODUÇÃO (01/06/2026 ~23:50 BRT)

| Variável | Valor | Fonte |
|----------|-------|-------|
| Selic meta | 14,50% a.a. | /assets/macro.php (BCB) |
| IPCA 2026 mediana Focus | 5,09% | /assets/macro.php (BCB Focus 29/05) |
| USD/BRL PTAX | R$ 5,0303 | /assets/macro.php (BCB) |
| PIB 2026 (Focus) | — (no JSON) | — |
| Ouro (XAU/USD) | US$ 4.482,48 | /prices.php |
| Prata (XAG/USD) | US$ 74,80 | /prices.php |
| Platina (XPT/USD) | US$ 1.922,89 | /prices.php |
| Bitcoin | US$ 71.179,55 | /prices.php |
| Agenda semana | 6 eventos 01–06/Jun | /assets/agenda.php |

---

## 7. COMPARAÇÃO COM DIAGNÓSTICO ANTERIOR (2026-05-30)

| Problema | Status em 30/05 | Status hoje 01/06 |
|----------|-----------------|-------------------|
| P1: macro_api.php 503 | Aberto | **Ainda aberto** — tampão maio/2026 em vigor |
| P2: CSP bloqueia Font Awesome | Aberto | **RESOLVIDO** ✅ — cdnjs.cloudflare.com no CSP |
| P3: BrasilAPI 404 round-trip | Aberto | **RESOLVIDO** ✅ — chamada removida do código |
| P4: Overflow horizontal mobile | Aberto | **RESOLVIDO** ✅ — overflow-x:hidden ativo |
| NOVO: CSP bloqueia Formspree | Não estava | **Novo problema identificado** — .htaccess corrigido localmente mas não deployado |
| NOVO: logo.png 404 | Não estava | **Novo problema identificado** |

---

*Auditoria realizada em 01/06/2026 entre 23:37 e 23:55 BRT. Próxima auditoria recomendada: após deploy do .htaccess e configuração do GA4.*
