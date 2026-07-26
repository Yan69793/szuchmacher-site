# Agent Memory — MultiAsset (szuchmacher.com.br)

> Criado: 2026-06-14 · Revisado: 2026-07-26 (auditoria completa)
> Stack: HTML5 + Cloudflare Workers (JS) + Python 3.11 + Node.js + OpenRouter/Claude API

---

## Contexto do Projeto

Site institucional + plataforma multiasset em szuchmacher.com.br.
Pipeline editorial semanal: coleta Yahoo Finance → Claude gera narrativa → PPTX/PDF → FTP → email.

**Estágio real (revisado em 2026-07-26):** Launch
- Pipeline funcional, plataforma publicada, monitor intraday ativo
- Cobrança Stripe live desde 19/07. **O e-mail de boas-vindas nunca chegou a
  sair** até 26/07 — o webhook rejeitava toda entrega do Stripe por um bug de
  codificação da assinatura (corrigido; ver `site-producao/CLAUDE.md`)
- `macro_data.json` é fallback: quem gera a narrativa em produção é o cron do
  Worker (`0 3 * * 1`, `wrangler.jsonc`) gravando em KV
- `agenda-data.json` sai do bundle de assets, então **só muda com
  `wrangler deploy`** — subir por FTP não altera o que o site serve

---

## Arquitetura de Agents

### Agent 1 — Macro Editorial Agent ✅ IMPLEMENTADO E VALIDADO (2026-06-14)
- **Arquivo:** `automacao-yan-os/agents/macro_agent.py`
- **Responsabilidade única:** Gerar análise macro editorial via Claude e publicar `macro_data.json`
- **Input:** `ultimo_dados.json` (Yahoo Finance) → re-coleta se > 6h
- **Output:** `site-producao/macro_data.json` → FTP para HostGator
- **API:** Anthropic Claude (MODELO_CLAUDE do .env)
- **Trigger:** Manual ou Task Scheduler (sugerido: semanal, sextas 18:00)
- **Flags:** `--dry-run` (salva local sem FTP)
- **Log:** `automacao-yan-os/logs/macro_agent_YYYYMMDD.log`

### Agent 2 — Agenda Agent ✅ IMPLEMENTADO (2026-06-17)
- **Arquivo:** `automacao-yan-os/agents/agenda_agent.py`
- **Responsabilidade única:** Buscar eventos de calendário econômico e atualizar `agenda-data.json`
- **Input:** Scraping de fontes macro (Banco Central, IBGE, Fed)
- **Output:** `site-producao/agenda-data.json` → FTP
- **API:** Claude + requests
- **Trigger:** 2x/semana (seg + qui)

### Agent 3 — Lead Nurture Agent ✅ IMPLEMENTADO (2026-06-17)
- **Arquivo:** `automacao-yan-os/agents/lead_nurture_agent.py`
- **Responsabilidade única:** Follow-up de leads qualificados sem resposta em 48h
- **Input:** `logs/leads.jsonl` (qualificador_leads.py) + `data/leads_nurture_state.json`
- **Output:** E-mail ao lead (SMTP Gmail) + aviso Yan via CallMeBot/Telegram
- **API:** Qwen (personalização, fallback template) + SMTP
- **Trigger:** Diário 10:00 — `python agents/lead_nurture_agent.py`
- **Flags:** `--dry-run`, `--testar`

---

## Decisões de Implementação

| Decisão | Motivo |
|---------|--------|
| Agent 1 primeiro | Reativa funcionalidade desativada (macro_cron.php); maior ROI imediato |
| Seções semi-estáticas preservadas | `ativos` e `premissas_*` têm teses de longa duração; Claude não regera sem necessidade |
| Cache de 6h para dados de mercado | Evita chamadas Yahoo Finance desnecessárias em re-runs do mesmo dia |
| Fallback para último cache | Garante que o agent roda mesmo se Yahoo Finance estiver instável |
| FTP via FTPClient existente | Reutiliza padrão testado de atualizador_site.py; sem nova dependência |

---

## Como Usar

```powershell
# Navegar para o projeto
cd "E:\Diretorio\Claude\Site\automacao-yan-os"

# Dry-run (sem FTP — validar JSON gerado)
python agents/macro_agent.py --dry-run

# Verificar saída
Get-Content ..\site-producao\macro_data.json | python -m json.tool | Select-Object -First 20

# Verificar log
Get-Content logs\macro_agent_*.log

# Produção (após validar dry-run)
python agents/macro_agent.py
```

---

## Checklist pós-run

- [ ] JSON válido em `site-producao/macro_data.json`
- [ ] Campo `generated_at` com data/hora atual
- [ ] `eyebrow` reflete mês/ano correto
- [ ] `canais` com 8 itens preenchidos
- [ ] `brasil` com 4 seções preenchidas
- [ ] Seções `ativos` e `premissas_*` preservadas do arquivo anterior
- [ ] (Produção) `curl https://szuchmacher.com.br/macro_api.php` retorna JSON atualizado

---

## Validação Agent 1 (2026-06-14 19:51–19:54)

Run: `.\venv\Scripts\python agents/macro_agent.py --dry-run`

| Etapa | Resultado |
|-------|-----------|
| Coleta Yahoo Finance | ✅ 18 ativos (ibov 171.133 · USD 5,06 · S&P 7.431 · WTI 81,64 · Ouro 4.308) |
| Claude claude-sonnet-4-6 | ✅ JSON válido em ~68s |
| eyebrow | "Cenário Global · Junho 2026" |
| alert_title | "S&P 500 em 7.431 (+0,50%) · Dólar recua a R$ 5,06 (-1,00%) · WTI despenca -3,82%..." |
| alert_badge | "COPOM 16–17/JUN" |
| macro_data.json salvo | ✅ site-producao/macro_data.json |
| FTP | ⏭ Pulado (dry-run) |

**Nota:** DI Jan/28, Bund e JGB são pedidos manualmente em sessão interativa. Em Task Scheduler (`is_interativo()=False`), esses campos ficam como N/D — comportamento esperado do coletor existente.

**Para publicar em produção:** `.\venv\Scripts\python agents/macro_agent.py` (sem `--dry-run`)

---

## Validação Agent 2 (2026-06-17)

Run: `YAN_OS_BATCH=1 python agents/agenda_agent.py`

| Etapa | Resultado |
|-------|-----------|
| Janela seg–sex | ✅ 2026-06-15 → 2026-06-19 |
| Eventos gerados | ✅ 3 (Focus, FOMC+Dot Plot, COPOM) |
| agenda-data.json salvo | ✅ site-producao/agenda-data.json |
| FTP via YAN OS | ⚠️ opcional — automação usa dry-run + deploy-all.ps1 |
| Task Scheduler | ✅ `Szuchmacher-AgendaAgent` seg+qui 08:00 via `run-agenda-agent.ps1` |

**Rodar manual:** `.\scripts\run-agenda-agent.ps1`  
**Registrar tarefa:** `.\scripts\register-agenda-task.ps1`

## Próximo Passo (revisado 2026-07-26)

1. **Confirmar os secrets do Worker** — `STRIPE_WEBHOOK_SECRET` e `RESEND_API_KEY`.
   Sem o primeiro o webhook responde 503; sem o segundo toda inscrição em
   `/relatorio-signup` devolve 500. Não consegui verificar isso do repositório
2. **Testar o webhook do Stripe** — dashboard → Developers → Webhooks → Send test
   event. Antes da correção de 26/07 isso devolvia 401 em toda entrega
3. **Revisão jurídica da política de privacidade** — a minuta de 26/07 alinhou o
   texto ao que o código faz (Cloudflare, Resend e Stripe como operadores,
   transferência internacional, retenção de 12 meses), mas não foi validada por advogado
4. **Rotina `szuchmacher-domingo`** — ler o prompt e confirmar se ela publica pelo
   Cloudflare ou só por FTP. Se for só FTP, a agenda em produção não está sendo
   atualizada por ela
5. **Cal.com** — `SZ_CALCOM_URL` segue em `_PENDING`; todo `[data-sz-cal]` cai no WhatsApp
6. **Cloudflare purge** — token com permissão Cache Purge em `.env`

> **GA4 não entra na lista.** Foi removido por decisão de arquitetura e o tracking
> vai para o Clarity. `setup-analytics.ps1` não aceita mais `-GaId`.
