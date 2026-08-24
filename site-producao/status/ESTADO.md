# Estado do projeto — Site (produção)

Última atualização: 2026-08-24 (agente: Claude)

Leia este arquivo antes de começar qualquer trabalho, seja qual for o agente.
Atualize a data e os itens abertos ao fechar uma sessão que mudou o estado.
Não duplique conteúdo do CLAUDE.md nem do README.md: aqui fica só o ponto de
partida com os ponteiros.

## O que é

Site institucional de advisory patrimonial independente, servido por Cloudflare Workers (`sz-sites`) nos hostnames szuchmacher.com.br e multi-assets.com. Fase 2 no ar desde 15/08/2026. Deploy primário via `scripts/deploy-cloudflare.ps1`, com HostGator/FTP legado mantido só para rollback.

## Estado em 2026-08-19

Fase 2 no ar desde 15/08/2026 08:17 BRT. Versão viva `5df713af-691a-4acb-89dc-02b5d57812e0`, publicada em 24/08 09:44 BRT (rollback `b18492b9-b6a6-4034-bab0-5b56d23d99b6`). Gate de auditoria 34/34 com zero falha e suíte de testes do Worker 56/56. Pendências abertas: cron nativo corrigido para `0 3 * * MON` mas ainda sem disparo confirmado no dia certo (prova em 31/08 pelo watchdog `Szuchmacher-MacroCronWatchdog`), CSP sem unsafe-inline, F5 cache-busting e a limpeza opcional do job `agenda-cron.php` no cPanel. O detalhe de cada uma está na seção "Pendências abertas" do CLAUDE.md.

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

- Cron nativo: causa raiz fechada em 24/08. A Cloudflare numera dia da semana como Quartz (`1` = domingo), então `0 3 * * 1` agendava domingo, batendo com os disparos de 16/08 e 23/08 e com a janela vazia de 24/08. Schedule agora `0 3 * * MON`, publicado na versão `5df713af` com gate 34/34. Prova real na segunda 31/08, o carimbo em `/health` só é reescrito no próximo disparo.
- Drift de deploy: `cv.html` + PDFs no ar sem commit; `check-macro-cron.ps1` e `register-*.ps1` com mudança não commitada (watchdog roda código não versionado). Ver §7.2/§7.3.
- CSP sem unsafe-inline (Pendências #2, escopo próprio)
- F5 cache-busting manual (Pendências #3, escopo próprio)
- Job `agenda-cron.php` do cPanel para desligar quando houver login (Pendências #4)
