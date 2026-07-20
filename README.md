# Site Yan Szuchmacher — Repositório Local

**Site em produção:** https://szuchmacher.com.br
**Stack:** HTML5 vanilla · PHP (HostGator) · Cloudflare Workers · Python 3.11 · Node.js
**Reorganização:** 2026-06-14

---

## Mapa de Pastas

| Pasta | O que é | Quando você mexe |
|-------|---------|------------------|
| **`site-producao/`** | Espelho fiel do que está no ar em szuchmacher.com.br (HTML, PHP, JS, assets). É a fonte única de deploy. | Editar conteúdo do site, corrigir bug, publicar |
| **`ferramentas-multiasset/`** | Ferramentas de apoio da plataforma multiasset (validador Python, cron, auditorias, snapshots históricos). **Não é servido no site.** | Validar dados, consultar histórico/auditoria |
| **`automacao-yan-os/`** | Sistema Python (YAN OS): coleta dados de mercado, gera briefing PPTX/PDF, publica via FTP. | Rodar pipeline diário, alterar coleta/narrativa |
| **`atualizador-relatorios/`** | Script Node.js que lê PDF de fechamento de mercado (Mirabaud) e atualiza index/relatorios via FTP. | Atualizar relatório de fechamento manualmente |

> A pasta `MultiAssets/` antiga foi desmembrada: a plataforma de produção foi para `site-producao/`, as ferramentas para `ferramentas-multiasset/`. Se ainda aparecer vazia, é um lock do Explorer — feche a janela e ela some.

---

## ⚠️ De onde vem cada arquivo da produção

A produção **estava espalhada em duas pastas** — agora consolidada. Para referência, o que está no ar veio de:

| Arquivo no ar | Origem antes da reorganização |
|---|---|
| Institucional (index, honorários, assinatura, privacidade, radar-roic, relatorios, multiasset.html) | `SITE YAN SZUCHMACHER/` |
| `macro_api.php`, `agenda-server.php`, `macro-panel-live.js` | `SITE YAN SZUCHMACHER/` |
| `multiasset-app.html` (a plataforma), `prices.php` | `MultiAssets/` |

Validado por hash e por endpoint contra a produção em 2026-06-14. **A partir de agora há uma fonte única: `site-producao/`.**

---

## ⚠️ Trabalho não publicado (decisão pendente)

Em `site-producao/_arquivo/multiasset-app-COM-share-GA4-2026-05-30.html` existe uma versão **mais evoluída** da plataforma (30/05) que **nunca foi ao ar**:

- Compartilhar portfólio/simulação por link (`sharePortfolio`, `shareSim`)
- Analytics GA4 + formulário Formspree (`/assets/sz-config.js`)
- Título melhor: *"MultiAsset | Plataforma de análise macro e portfólio"*

Em junho seguiu-se editando a outra linhagem e essas features ficaram para trás. **Avaliar portá-las para produção** — é um recurso de marketing forte. Trabalho de engenharia separado.

---

## Deploy (produção)

Dois destinos:

1. **HostGator (FTP)** — produção principal (PHP + HTML estático)
   `cd site-producao && bash scripts/deploy.sh [agenda|index|relatorios|multiasset|logo|all]`
   Credenciais: `site-producao/.env` (chaves `FTP_*`). **Nunca commitar.**

2. **Cloudflare Workers/Pages** — proxy e funções serverless
   Artefatos em `site-producao/deploy/` · `wrangler deploy`

---

## Setup para novo colaborador

### Site (editar HTML/PHP)
Sem dependências. Abra os arquivos em `site-producao/`. Para deploy, copie `.env.example` → `.env` e preencha.

### Automação Python (YAN OS)
```powershell
cd automacao-yan-os
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env   # preencher chaves de API
python testar_sistema.py
```

### Atualizador de Relatórios (Node.js)
```powershell
cd atualizador-relatorios
npm install
Copy-Item .env.example .env   # preencher credenciais FTP + Anthropic
# coloque o PDF do fechamento na pasta e rode:
node atualizar.js
```

---

## Segurança (LGPD + credenciais)

- Cada subprojeto tem `.env` (real, **gitignored**) e `.env.example` (template, versionável).
- **Senha FTP antiga exposta foi rotacionada em 2026-06-14**: `deploy@` e `caude@` com novas senhas nos `.env` respectivos. Conta `[USER-FTP-YAN-OS]` (YAN OS) — rotacionar separadamente via cPanel → Password & Security se necessário.
- Há **três contas FTP** distintas: `deploy@` (site-producao), `caude@` (atualizador-relatorios), `[USER-FTP-YAN-OS]` (YAN OS).
- Credenciais foram removidas do código (`atualizar.js` agora lê do `.env`). Se encontrar credencial hardcoded em qualquer `.js`/`.php`, mova para `.env`.

---

## Arquivos críticos

| Arquivo | Função |
|---------|--------|
| `site-producao/multiasset-app.html` | A plataforma multiasset (mais vendável, 253 KB) |
| `site-producao/index.html` | Homepage institucional |
| `site-producao/agenda-server.php` · `macro_api.php` · `prices.php` | APIs que alimentam o frontend |
| `site-producao/.htaccess` | Headers de segurança, CSP, redirects |
| `site-producao/scripts/deploy.sh` | Publicação via FTP |
| `automacao-yan-os/main.py` | Orquestrador do pipeline diário |
| `atualizador-relatorios/atualizar.js` | Atualiza relatório de fechamento |

---

## Controle remoto (automação na nuvem)

O site é atualizado **sozinho, na nuvem**, via Claude Code Remote — sem depender
do PC ligado. A rotina `szuchmacher-domingo` publica `macro_data.json` e
`agenda-data.json` toda semana. Como criar, listar, pausar ou remover rotinas
(e o catálogo das ferramentas do MCP): **[`docs/controle-remoto-claude-code.md`](docs/controle-remoto-claude-code.md)**.

> Segredos (FTP/API) **nunca** entram no repo nem no prompt versionado de uma rotina.
