# Estado do projeto — Site (produção)

Última atualização: 2026-08-19 (agente: Claude Code)

Leia este arquivo antes de começar qualquer trabalho, seja qual for o agente.
Atualize a data e os itens abertos ao fechar uma sessão que mudou o estado.
Não duplique conteúdo do CLAUDE.md nem do README.md: aqui fica só o ponto de
partida com os ponteiros.

## O que é

Site institucional de advisory patrimonial independente, servido por Cloudflare Workers (`sz-sites`) nos hostnames szuchmacher.com.br e multi-assets.com. Fase 2 no ar desde 15/08/2026. Deploy primário via `scripts/deploy-cloudflare.ps1`, com HostGator/FTP legado mantido só para rollback.

## Estado em 2026-08-19

Fase 2 no ar desde 15/08/2026 08:17 BRT, Worker `f08d6f46` (rollback `b4c3ba12`). Gate de auditoria 34/34 com zero P0/P1 e suíte de testes do Worker 56/56. Pendências abertas: verificação do disparo do cron nativo armada para 24/08 (task one-shot `Szuchmacher-CheckMacroCron-2026-08-24` + `scripts/check-macro-cron.ps1`), CSP sem unsafe-inline, F5 cache-busting e a limpeza opcional do job `agenda-cron.php` no cPanel. O detalhe de cada uma está na seção "Pendências abertas" do CLAUDE.md.

## Como verificar

```powershell
.\scripts\deploy-cloudflare.ps1
curl.exe -sI "https://szuchmacher.com.br/"
curl.exe -sI "https://szuchmacher.com.br/assets/macro.php"
curl.exe -sI "https://multi-assets.com/prices.php"
```

Auditoria completa pela rota `/szuchmacher-audit` (gate 34/34). Checagens auxiliares declaradas no CLAUDE.md: `validar-producao.ps1` (check de produção) e `test-scripts.ps1`.

## Onde está o resto

- `CLAUDE.md` — identidade, mapa de arquivos, protocolo, deploy, estado de produção e pendências
- `cloudflare-workers/sz-sites/` — Worker de produção, com `wrangler.jsonc` e handlers
- `scripts/` — deploy e manutenção (`deploy-cloudflare.ps1`, `publicar-com-rollback.ps1`, automação da agenda)
- `diagnosticos/` — relatórios de produção (`FASE2-2026-08-15.md`, `DIAGNOSTICO-2026-08-17.md`)
- `docs/` — documentação (controle remoto, FASE1-STACK, marketing)

## Itens abertos

- Verificar o disparo do cron de 24/08 (Pendências #1 do CLAUDE.md, task one-shot + `check-macro-cron.ps1`)
- CSP sem unsafe-inline (Pendências #2, escopo próprio)
- F5 cache-busting manual (Pendências #3, escopo próprio)
- Job `agenda-cron.php` do cPanel para desligar quando houver login (Pendências #4)
