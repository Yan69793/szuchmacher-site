# CLAUDE.md — Site (hardened 2026-07-25)

## Deploy

- HostGator via FTP: `cd site-producao && bash scripts/deploy.sh [agenda|index|relatorios|multiasset|logo|all]`
- Três contas FTP distintas: `deploy@`, `caude@`, `[USER-FTP-YAN-OS]`. Senha rotacionada em 2026-06-14.
- Nunca deployar sem especificar o alvo.

## Portão de verificação

SEM LOOP DE VERIFICAÇÃO. O projeto é multi-subprojeto (PHP/HostGator, Python, Node) sem comando único de aceite.
O que falta: health check HTTP público para `szuchmacher.com.br` que valide as páginas principais, e smoke test que cubra as 3 contas FTP.
Enquanto não houver: validar manualmente cada subprojeto afetado e declarar o que foi e o que não foi verificado.
