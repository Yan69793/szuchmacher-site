# Fase 1 — Stack conversão (Szuchmacher / MultiAsset)

**Data:** 2026-06-18  
**Domínio:** [multi-assets.com](https://multi-assets.com/)  
**Marca:** Szuchmacher Consultoria (CVM 20/2021)  
**Modelo:** receita mista (consultoria + assinatura research + plataforma)

## Contexto do site (estudo)

`multi-assets.com` **não** é site de GP tradicional. É a **plataforma MultiAsset**:

| Área | Conteúdo |
|------|----------|
| Home (`/`) | `multiasset-app.html` — simuladores ouro/prata/BTC, alocação, macro, TradingView |
| Szuchmacher (`szuchmacher.com.br`) | Site institucional — honorários, assinatura carta, relatórios, radar ROIC |
| Infra atual | Cloudflare Worker `sz-sites` + assets estáticos em `public/multi/` |
| Analytics | Microsoft Clarity (`x89me5cgm8`), Formspree leads (`mojrayrl`) |
| APIs | `prices.php`, `market-data.php`, `macro_api.php` no Worker |

**Funil Fase 1:** visitante explora MultiAsset → landing `/consultoria` → Cal.com ou WhatsApp → consultoria patrimonial (honorários em `szuchmacher.com.br/honorarios.html`).

## Arquitetura híbrida (plano 4 fases)

| Fase | Escopo | Status |
|------|--------|--------|
| **1** | Landing consultoria + CTAs + sz-config + CSP + docs | **Em deploy** |
| 2 | Supabase leads + n8n automações + Plausible cloud | Pendente |
| 3 | Ghost newsletter + Cal self-hosted (opcional) | Pendente |
| 4 | Coolify VPS — migração gradual cloud → self-hosted | Pendente |

## Entregáveis Fase 1

### Código

| Arquivo | Função |
|---------|--------|
| `consultoria.html` | Landing `/consultoria` — dark/gold, 3 CTAs, funil, LGPD |
| `assets/sz-config.js` | `SZ_WHATSAPP`, `SZ_CALCOM_URL`, `SZ_PLAUSIBLE_DOMAIN`, `wireConversionLinks()`, goals |
| `multiasset-app.html` | Nav + hero + footer com links consultoria |
| `scripts/build-cloudflare-public.ps1` | Copia `consultoria.html` → `multi/consultoria` e `.html` |
| `cloudflare-workers/sz-sites/src/utils/headers.js` | CSP: plausible + cal.com |
| `multiasset-platform/.htaccess` | CSP legado FTP alinhado |
| `scripts/deploy-multiasset.ps1` | Inclui `consultoria.html` no FTP legado |

### Roteamento Worker

`serveStatic()` em `index.js`:

1. `/consultoria` → tenta `/multi/consultoria.html`
2. 404 → fallback `/multi/consultoria` (arquivo sem extensão)

Não requer alteração no router.

### Telemetria (goals Clarity)

| Evento | Trigger |
|--------|---------|
| `click_agendar` | `[data-sz-cal]` |
| `click_whatsapp` | `[data-sz-wa]` |
| `click_vip` | `[data-sz-vip]` (explorar plataforma) |
| `scroll_50` / `scroll_90` | scroll depth por página |

## Configuração manual (operador)

| Item | Onde | Valor atual |
|------|------|-------------|
| WhatsApp | `sz-config.js` | `5521981088992` ✅ |
| Cal.com | `sz-config.js` | `_PENDING` → ver `CALCOM-SETUP.md` |
| Plausible | `sz-config.js` | vazio — ativar com `multi-assets.com` |
| Clarity | `sz-config.js` | `x89me5cgm8` ✅ |
| Formspree | `sz-config.js` | `mojrayrl` ✅ |

## Deploy produção

```powershell
cd E:\Diretorio\Claude\Site\site-producao
.\scripts\deploy-all.ps1 -Cloudflare
```

Ou:

```powershell
.\scripts\build-cloudflare-public.ps1
cd cloudflare-workers\sz-sites
npx wrangler deploy
```

### Validação pós-deploy

```powershell
curl -sI https://multi-assets.com/consultoria
# Esperado: HTTP 200, X-Served-By: sz-sites-worker

curl -s https://multi-assets.com/consultoria | Select-String "Diagnóstico Patrimonial"
curl -s https://multi-assets.com/ | Select-String "nav_consultoria"
curl -s https://multi-assets.com/assets/sz-config.js | Select-String "SZ_WHATSAPP"
```

Checklist manual:

- [ ] `/consultoria` carrega landing
- [ ] CTA WhatsApp abre `wa.me/5521981088992`
- [ ] CTA Agendar → WhatsApp (até Cal configurado) ou Cal.com (depois)
- [ ] Nav/footer da home apontam `/consultoria`
- [ ] Clarity recebe eventos no painel

## Mapa de páginas relacionadas

```
multi-assets.com/
├── /              → Plataforma MultiAsset (index)
├── /consultoria   → Landing conversão (NOVO)
└── /prices.php    → API preços

szuchmacher.com.br/
├── /honorarios.html  → Planos e valores consultoria
├── /assinatura.html  → Research / carta (Stripe test)
└── /index.html       → Site institucional
```

## Próximo passo (Fase 2)

1. Criar projeto Supabase — tabela `leads` (email, origem, UTM, status)
2. n8n cloud: webhook Formspree + Cal.com → insert lead + e-mail admin
3. Plausible cloud: `SZ_PLAUSIBLE_DOMAIN = 'multi-assets.com'`
4. Link honorários → `/consultoria` em vez de só `#contato`

## Referências no repo

- Deploy Cloudflare: `scripts/deploy-cloudflare.ps1`
- Config central: `assets/sz-config.js` (regra: nunca duplicar IDs em HTML)
- Diagnóstico recente: `diagnosticos/DIAGNOSTICO-2026-06-17.md`