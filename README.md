# Site Yan Szuchmacher — Repositório Local

**Sites em produção:** https://szuchmacher.com.br · https://multi-assets.com
**Stack:** HTML5 vanilla · Cloudflare Workers (JS) · Python 3.11 · Node.js
**Hosting:** Cloudflare Workers (`sz-sites`) desde 17/06/2026. HostGator é legado de rollback.
**Reorganização:** 2026-06-14 · **Última auditoria:** 2026-07-26

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

## ⚠️ Rota não é arquivo

As rotas terminadas em `.php` são atendidas por **handlers JavaScript** no Worker
(`site-producao/cloudflare-workers/sz-sites/src/handlers/`). Nenhum PHP é executado
em produção. Ao mexer num endpoint, edite o handler — não procure um `.php`.

O `radar-roic.html` e o `ebook.html` foram descontinuados e respondem 301.

---

## ⚠️ Trabalho não publicado (decisão pendente)

Em `site-producao/_arquivo/multiasset-app-COM-share-GA4-2026-05-30.html` existe uma versão
da plataforma (30/05) que **nunca foi ao ar**, com compartilhamento de portfólio por link
(`sharePortfolio`, `shareSim`). **Avaliar portar essa feature** — é um recurso de marketing
forte. Trabalho de engenharia separado.

> O mesmo arquivo traz GA4, que **não** deve ser portado: o GA4 foi removido por decisão
> de arquitetura e o tracking vai para o Clarity. Ver `site-producao/CLAUDE.md`.

---

## Deploy (produção)

**Destino único: Cloudflare Workers.** O FTP foi desativado em 20/07/2026.

```powershell
cd site-producao
.\scripts\deploy-cloudflare.ps1            # build + wrangler deploy
.\scripts\publicar-com-rollback.ps1        # o mesmo, com validação bloqueante e reversão
```

O build monta `cloudflare-workers/sz-sites/public/` (`sz/` e `multi/`) e reprova
saída incompleta, então um build quebrado nunca vira deploy.

**Legado HostGator (só rollback):**
`bash scripts/deploy.sh [index|relatorios|multiasset|multiasset-app|agenda-data|logo|all]`
Credenciais em `site-producao/.env` (chaves `FTP_*`). **Nunca commitar.**
Publicar por FTP não muda o que o site serve enquanto o Worker estiver ativo.

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
- Nenhum segredo deve ter **valor literal de fallback** no código. Um default versionado
  não é segredo: valide a presença no ponto de uso e falhe fechado. Ver
  `automacao-yan-os/data/config.py`.
- **Dados pessoais não entram no git.** `logs/` e `leads*.json*` do YAN OS são caminhos de
  escrita em runtime com nome, e-mail, telefone e faixa de patrimônio — estão no
  `.gitignore` e devem continuar.
- Credenciais foram removidas do código. Se encontrar credencial hardcoded em qualquer
  `.js`/`.py`/`.ps1`, mova para `.env`.
- **Pendente:** a senha `deploy@` circula em texto puro no prompt da rotina
  `szuchmacher-domingo` (ver `docs/controle-remoto-claude-code.md`). Considerar rotação.

---

## Arquivos críticos

| Arquivo | Função |
|---------|--------|
| `site-producao/multiasset-app.html` | A plataforma multiasset (mais vendável, ~343 KB) |
| `site-producao/index.html` | Homepage institucional |
| `site-producao/cloudflare-workers/sz-sites/src/index.js` | Roteamento do Worker: domínios, redirects, APIs, assets |
| `site-producao/cloudflare-workers/sz-sites/src/handlers/` | Os endpoints que alimentam o frontend |
| `site-producao/cloudflare-workers/sz-sites/src/utils/headers.js` | CSP e cabeçalhos de segurança de produção |
| `site-producao/assets/sz-config.js` | Fonte única de IDs externos (Clarity, Formspree, Stripe) |
| `site-producao/scripts/deploy-cloudflare.ps1` | Publicação (build + wrangler) |
| `automacao-yan-os/main.py` | Orquestrador do pipeline diário |
| `atualizador-relatorios/atualizar.js` | Atualiza relatório de fechamento |

> `site-producao/.htaccess` só vale no legado HostGator. A CSP de produção vem do Worker.

---

## Controle remoto (automação na nuvem)

O site é atualizado **sozinho, na nuvem**, via Claude Code Remote — sem depender
do PC ligado. A rotina `szuchmacher-domingo` publica `macro_data.json` e
`agenda-data.json` toda semana. Como criar, listar, pausar ou remover rotinas
(e o catálogo das ferramentas do MCP): **[`docs/controle-remoto-claude-code.md`](docs/controle-remoto-claude-code.md)**.

> Segredos (FTP/API) **nunca** entram no repo nem no prompt versionado de uma rotina.
