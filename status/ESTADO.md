# Estado do projeto — Site szuchmacher.com.br

Última atualização: 2026-08-19 (agente: Claude Code)

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

- Cron nativo do macro não dispara desde que foi estreitado para segunda; a
  dúvida restante é o despacho do `scheduled()` pelo Cloudflare.
- Monitorar o disparo de 24/08 comparando `macro-cron-last.ts` em `/health`
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

- Cron nativo do macro sem disparo; evidência em `site-producao/diagnosticos/DIAGNOSTICO-2026-08-17.md` §11.2 e §11.3.
- Disparo de 24/08 a monitorar via `macro-cron-last.ts` em `/health`.
- `agenda-cron.php` do cPanel pendente de desligamento; P3-15 (calendários 2026 hardcoded) é sub-item e resolve junto.
- Itens de escopo próprio do §Q: CSP sem unsafe-inline e F5 cache-busting.
- Detalhe de todos os itens: `site-producao/CLAUDE.md`, seção "Pendências abertas".

## Estado em 2026-08-19

Deploy `7b9c4a21` (commit `92d3722`) atualizou o app multi-assets.com: as
premissas macro e os fallbacks do panorama saíram de jun/2026 para ago/2026
(COPOM 05/08 com Selic 14,00%, Focus 17/08 com IPCA 5,02% em 2026 e 4,24% em
2027, FOMC 29/07 em hold com 3 dissidências, NTN-B IPCA+7,5% mantido, links
de fonte no bloco Premissas). Gate `validar-producao.ps1` 34/34 e teste em
produção confirmando o texto novo em https://multi-assets.com/. O item
`hero-*` legado foi resolvido em 2026-08-19 (decisão do operador), e a
verificação do cron de 24/08 segue armada via task one-shot
`Szuchmacher-CheckMacroCron-2026-08-24`.
