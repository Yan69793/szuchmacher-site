# Campanhas Google Ads + Meta Ads — Szuchmacher

**Objetivo:** leads qualificados (formulário, WhatsApp, lista fundadores)  
**Compliance:** CVM 20/2021 — sem recomendação individualizada, sem promessa de retorno  
**Orçamento inicial sugerido:** R$ 100/dia (R$ 70 Google · R$ 30 Meta)

---

## Google Ads

### Campanha 1 — Ferramenta (topo de funil)

| Item | Valor |
|------|-------|
| Nome | SZ — MultiAsset Simulador |
| Tipo | Pesquisa |
| Landing | `https://szuchmacher.com.br/multiasset.html?utm_source=google&utm_medium=cpc&utm_campaign=simulador` |
| Orçamento | R$ 40/dia |

**Palavras-chave (correspondência de frase):**
- simulador de portfólio investimentos
- análise macro investidor qualificado
- ferramenta alocação multi ativo
- painel macroeconomia investidor

**Negativas:** grátis curso day trade, robô investimento, sinais telegram, cripto milionário

**Anúncio A**
- Headline 1: Simulador MultiAsset Gratuito
- Headline 2: Cenários Macro + Monte Carlo
- Headline 3: Leitura de Private Banking
- Descrição: Juros, câmbio, metais e cripto em um painel. Simule portfólio com cenários pessimista, base e otimista. Ferramenta educacional — não é recomendação.
- CTA: Explorar ferramenta

### Campanha 2 — Research (meio de funil)

| Item | Valor |
|------|-------|
| Nome | SZ — Carta Szuchmacher |
| Landing | `https://szuchmacher.com.br/relatorios.html?utm_source=google&utm_medium=cpc&utm_campaign=carta` |
| Orçamento | R$ 20/dia |

**Palavras-chave:**
- relatório mercado semanal assinatura
- análise macro brasil assinatura
- research mercado financeiro brasil

**Anúncio B**
- Headline 1: Relatório Semanal de Mercado
- Headline 2: Research Autoral CNPI
- Descrição: Fechamento com drivers, contexto e implicações para risco e liquidez. Amostra gratuita na página.
- CTA: Ver amostra

### Campanha 3 — Advisory (fundo de funil)

| Item | Valor |
|------|-------|
| Nome | SZ — Wealth Advisory |
| Landing | `https://szuchmacher.com.br/#contato?utm_source=google&utm_medium=cpc&utm_campaign=advisory` |
| Orçamento | R$ 10/dia |

**Palavras-chave:**
- consultoria patrimonial independente
- wealth advisory rio de janeiro
- assessor patrimonial fee based

---

## Meta Ads (Facebook + Instagram)

### Campanha 1 — Descoberta (vídeo simulador)

| Item | Valor |
|------|-------|
| Objetivo | Tráfego |
| Público | Homens 35–60, RJ+SP, interesses: Bloomberg, Valor Econômico, InfoMoney, investimentos |
| Orçamento | R$ 20/dia |
| Landing | `multiasset-app.html?utm_source=meta&utm_medium=cpc&utm_campaign=simulador_video` |

**Criativo 1 — Vídeo 30s**
- Gancho (0–3s): "E se o Brent voltar a US$ 100?"
- Meio: troca cenário macro no simulador
- Fim: logo + "Ferramenta gratuita"
- Copy: Como um gestor de private banking lê macro e simula portfólio — sem comissão de produto.
- CTA: Saiba mais

**Criativo 2 — Carrossel 4 slides**
1. Painel macro jun/2026
2. Comparador 4 ativos
3. Monte Carlo P10–P90
4. CTA assinatura fundador

### Campanha 2 — Retargeting

| Item | Valor |
|------|-------|
| Público | Visitou `multiasset-app.html` últimos 7 dias (pixel GA4/Meta após configurar) |
| Orçamento | R$ 10/dia |
| Landing | `assinatura.html?utm_source=meta&utm_medium=retarget&utm_campaign=fundador` |

**Copy retargeting:** Você explorou o simulador. As 50 vagas fundadoras incluem research semanal + plataforma completa.

---

## Métricas e metas iniciais (30 dias)

| Métrica | Meta |
|---------|------|
| CPL formulário | < R$ 200 |
| CTR pesquisa Google | > 3% |
| Taxa form → resposta 24h | > 80% (manual) |
| `simulation_shared` (GA4) | > 20 eventos/mês |
| Checkout Stripe iniciado | 1+ (validação oferta) |

## Próximos passos operacionais

1. Substituir `GA_ID_PENDING` em `assets/sz-config.js` → vincular GA4 ao Google Ads
2. Criar públicos de retargeting no Meta após 100+ visitantes/semana
3. Inserir URLs Stripe reais em `sz-config.js` antes de campanha de fundadores