# Estado do projeto — Site (produção)

Última atualização: 2026-08-17 (agente: Claude Code)

Leia este arquivo antes de começar qualquer trabalho, seja qual for o agente.
Atualize a data e os itens abertos ao fechar uma sessão que mudou o estado.
Não duplique conteúdo do CLAUDE.md nem do README.md: aqui fica só o ponto de
partida com os ponteiros.

## O que é

Site institucional de advisory patrimonial independente, servido por Cloudflare Workers (`sz-sites`) nos hostnames szuchmacher.com.br e multi-assets.com. Fase 2 no ar desde 15/08/2026. Deploy primário via `scripts/deploy-cloudflare.ps1`, com HostGator/FTP legado mantido só para rollback.

## Estado em 2026-08-17

Fase 2 no ar desde 15/08/2026 08:17 BRT, Worker `f08d6f46` (rollback `b4c3ba12`). Gate de auditoria 34/34 com zero P0/P1 e suíte de testes do Worker 56/56. Pendências abertas: cron nativo do macro sem disparo confirmado desde a restrição para segunda-feira (despacho pelo Cloudflare é a dúvida, o `macro-cron-last` mais recente é efeito colateral de deploy), monitorar o disparo previsto de 24/08, `agenda-cron.php` do cPanel ainda ativo (falta o login real do cPanel), e os itens remanescentes do §Q do PRE-DEPLOY (CSP sem unsafe-inline, hero legado, F5 cache-busting). O detalhe de cada pendência está na seção "Pendências abertas" do CLAUDE.md.

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

- Cron nativo do macro sem disparo (Pendências #1 do CLAUDE.md)
- Monitorar o disparo de 24/08 comparando `macro-cron-last.ts` (Pendências #2)
- `agenda-cron.php` do cPanel não desligado (Pendências #3)
- §Q do PRE-DEPLOY-2026-08-15: CSP sem unsafe-inline, hero legado, F5 cache-busting (Pendências #5)
