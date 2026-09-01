# Estado do projeto — Site szuchmacher.com.br

Última atualização: 2026-09-01 (agente: Claude)

Leia este arquivo antes de começar qualquer trabalho, seja qual for o agente.
Atualize a data e os itens abertos ao fechar uma sessão que mudou o estado.
Não duplique conteúdo do CLAUDE.md nem do README.md: aqui fica só o ponto de
partida com os ponteiros.

## O que é

Site institucional de advisory patrimonial independente de Yan Szuchmacher,
servido em https://szuchmacher.com.br e https://multi-assets.com. Hospedagem
primária em Cloudflare Workers (`sz-sites`), com HostGator/FTP mantido apenas
para rollback. O diretório abriga também dois projetos com vida própria:
`automacao-yan-os` (pipeline Python) e `atualizador-relatorios` (Node.js).

## Estado em 2026-08-17

Fase 2 no ar desde 15/08/2026 (Worker `f08d6f46`, gate 34/34; relatório em
`site-producao/diagnosticos/FASE2-2026-08-15.md`). Migração para Cloudflare
Workers confirmada em 17/06/2026; deploy primário é
`site-producao/scripts/deploy-cloudflare.ps1`. A task local
`Szuchmacher-MacroCron` foi desabilitada em 15/08/2026.

A fonte detalhada de estado é `site-producao/CLAUDE.md` (identidade, mapa de
arquivos, design system, protocolo obrigatório, estado de produção verificado
em 15/08/2026 e pendências). Pendências abertas, resumidas em uma linha cada,
com o detalhe completo lá:

- Cron nativo disparava domingo por causa da numeração Quartz de dia da semana
  na Cloudflare; corrigido para `0 3 * * MON` em 24/08.
- Monitorar o disparo de 31/08 comparando `macro-cron-last.ts` em `/health`
  com a data esperada.
- `agenda-cron.php` do cPanel ainda não desligado: FTPS `deploy@` devolveu 530
  e as credenciais do `.env` não autenticam no cPanel.
- Itens restantes do §Q do PRE-DEPLOY-2026-08-15: CSP sem unsafe-inline e
  F5 cache-busting, todos com escopo próprio.

## Como verificar

```powershell
cd site-producao; .\scripts\validar-producao.ps1
```

34 verificações em szuchmacher.com.br + multi-assets.com (páginas, assets,
endpoints, redirects). Checagem de conteúdo, não só status HTTP. A contagem
muda quando checagem nova entra, use a da saída real do script.

## Onde está o resto

- `CLAUDE.md` (raiz): deploy e portão de verificação.
- `README.md`: mapa de pastas, origem dos arquivos de produção, deploy,
  setup, segurança.
- `site-producao/CLAUDE.md`: fonte detalhada de estado, mapa de arquivos,
  design system, protocolo obrigatório, pendências.
- Pastas principais: `site-producao/` (fonte única de deploy), `automacao-yan-os/`,
  `atualizador-relatorios/`, `ferramentas-multiasset/`, `docs/` (inclui
  `docs/controle-remoto-claude-code.md`), `site-producao/diagnosticos/`
  (registros de diagnóstico).
- Projeto externo com dependência cruzada: `E:\Diretorio\Claude\relatorio-diario-szuchmacher`
  (gera o `relatorio_cache.json` consumido pelo widget de fechamento).

## Itens abertos

- **Cron nativo: causa raiz corrigida em 24/08, prova real só em 31/08.** A Cloudflare numera dia da semana como Quartz (`1` = domingo), então `0 3 * * 1` agendava domingo. Schedule trocado para `0 3 * * MON` e publicado (versão `5df713af`, gate 34/34). O carimbo `macro_cron_last` em `/health` ainda mostra o registro velho de 23/08 e só é reescrito no próximo disparo. Confirmar na segunda 31/08, depois das 03:00 UTC, que `ts` cai na janela e `cron` vem `0 3 * * MON`.
- **Drift de deploy não commitado.** `cv.html` + PDFs do CV já no ar, mas a feature e a entrada no `build-cloudflare-public.ps1` não existem em nenhum commit. `check-macro-cron.ps1`, `register-*.ps1` e `send-alert-email.ps1` também têm mudança não commitada (watchdog de 24/08 roda código não versionado). Commit pendente. Detalhe: §7.2/§7.3 do mesmo DIAGNOSTICO.
- `agenda-cron.php` do cPanel pendente de desligamento; P3-15 (calendários 2026 hardcoded) é sub-item e resolve junto.
- Itens de escopo próprio do §Q: CSP sem unsafe-inline e F5 cache-busting.
- Tracker de processos regulatórios/jurídicos (caso ANEEL/Enel SP):
  infraestrutura implementada em 01/09, nada deployado nem populado.
  Detalhe: `site-producao/CLAUDE.md`, seção "Tracker de processos
  regulatórios em acompanhamento" e item 5 de "Pendências abertas".
- Detalhe de todos os itens: `site-producao/CLAUDE.md`, seção "Pendências abertas".

## Estado em 2026-08-19

Deploy `7b9c4a21` (commit `92d3722`) atualizou o app multi-assets.com: as
premissas macro e os fallbacks do panorama saíram de jun/2026 para ago/2026
(COPOM 05/08 com Selic 14,00%, Focus 17/08 com IPCA 5,02% em 2026 e 4,24% em
2027, FOMC 29/07 em hold com 3 dissidências, NTN-B IPCA+7,5% mantido, links
de fonte no bloco Premissas). Gate `validar-producao.ps1` 34/34 e teste em
produção confirmando o texto novo em https://multi-assets.com/. O item
`hero-*` legado foi resolvido em 2026-08-19 (decisão do operador), e a
one-shot de 24/08 foi substituída em 22/08 pelo watchdog semanal
`Szuchmacher-MacroCronWatchdog` (segunda 09:00, `check-macro-cron.ps1`).
