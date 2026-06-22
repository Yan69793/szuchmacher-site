# Cal.com — Diagnóstico Patrimonial (Fase 1)

Configuração do agendamento para **Szuchmacher Consultoria** no funil `multi-assets.com/consultoria`.

## Pré-requisitos

- Conta Cal.com (cloud gratuito ou self-hosted na Fase 3)
- Domínio de produção: `https://multi-assets.com/`
- WhatsApp de fallback já configurado em `assets/sz-config.js`: `5521981088892`

## Passo a passo

### 1. Criar conta e perfil

1. Acesse [https://cal.com/signup](https://cal.com/signup)
2. Username sugerido: `szuchmacher` (URL final: `https://cal.com/szuchmacher/...`)
3. Nome do perfil: **Szuchmacher Consultoria**
4. Fuso: `America/Sao_Paulo`

### 2. Criar evento

| Campo | Valor |
|-------|-------|
| Título | Diagnóstico Patrimonial |
| Slug | `szuchmacher-diagnostico` |
| Duração | 45 min |
| Local | Google Meet ou Zoom (link automático) |
| Buffer antes/depois | 10 min (recomendado) |
| Antecedência mínima | 24 h |
| Janela de agendamento | 30 dias à frente |

**Descrição sugerida (copiar no evento):**

> Conversa inicial para entender patrimônio, objetivos e encaixe com consultoria independente (CVM 20/2021). Não constitui recomendação de investimento.

### 3. Disponibilidade

- Dias úteis: seg–sex
- Horários sugeridos: 10h–12h e 14h–17h BRT
- Bloquear feriados B3 manualmente ou via integração Google Calendar

### 4. Perguntas no formulário de booking

1. Nome completo (obrigatório)
2. E-mail (obrigatório)
3. Telefone/WhatsApp (obrigatório)
4. Faixa patrimonial aproximada (select: &lt;5M / 5–10M / 10–30M / &gt;30M)
5. Como nos conheceu? (select: MultiAsset / Indicação / LinkedIn / Outro)

### 5. Notificações

- E-mail de confirmação para o convidado: ativo
- E-mail para `yan@szuchmacher.com.br`: ativo
- (Fase 2) Webhook → n8n → WhatsApp admin

### 6. Ativar no site

Editar **único arquivo** `assets/sz-config.js`:

```js
window.SZ_CALCOM_URL = 'https://cal.com/szuchmacher/szuchmacher-diagnostico';
```

Substituir `_PENDING` pela URL real do evento publicado.

Depois:

```powershell
cd E:\Diretorio\Claude\Site\site-producao
.\scripts\deploy-all.ps1 -Cloudflare
```

### 7. Validar

1. Abrir `https://multi-assets.com/consultoria`
2. Clicar **Agendar diagnóstico** → deve abrir Cal.com em nova aba (não WhatsApp)
3. No DevTools → Network: sem bloqueio CSP em `cal.com`
4. Clarity: evento `click_agendar` com `pending: false`

## Comportamento antes do Cal.com

Enquanto `SZ_CALCOM_URL` contiver `_PENDING`:

- CTAs `[data-sz-cal]` redirecionam para WhatsApp com mensagem de fallback
- Atributo `data-cal-pending="1"` no link
- Clarity registra `click_agendar` com `pending: true`

## UTM automáticos

Links Cal recebem via `SZ.calComUrl()`:

| Parâmetro | Valor |
|-----------|-------|
| utm_source | multi-assets |
| utm_medium | cta |
| utm_campaign | consultoria |
| utm_content | valor de `data-sz-cal` (ex.: hero_agendar) |

## CSP (já configurado no Worker)

`cloudflare-workers/sz-sites/src/utils/headers.js` permite:

- `script-src`: `plausible.io`
- `frame-src`: `cal.com`, `*.cal.com`
- `form-action`: `cal.com`
- `connect-src`: `plausible.io`

Se usar embed inline no futuro, testar iframe em `/consultoria` após deploy.

## Pendências Fase 2

- Webhook Cal.com → Supabase lead + n8n
- Lembrete WhatsApp 24h antes (Twilio ou API oficial)
- Sincronizar com Google Calendar corporativo