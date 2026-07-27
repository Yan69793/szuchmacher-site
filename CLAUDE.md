# CLAUDE.md — Site (hardened 2026-07-25, deploy corrigido 2026-07-26)

## Deploy

- **Destino primário: Cloudflare Workers.** `cd site-producao && .\scripts\deploy-cloudflare.ps1` (ou
  `publicar-com-rollback.ps1`, com validação bloqueante e reversão automática). Detalhe completo em
  `site-producao/CLAUDE.md`.
- **HostGator via FTP é legado, só rollback:** `bash scripts/deploy.sh [index|relatorios|multiasset|multiasset-app|agenda-data|logo|all]`.
  O alvo `agenda` foi removido — subia `agenda-server.php`, arquivo que não existe mais desde que a rota
  virou handler no Worker. Publicar por FTP não muda o que o site serve enquanto o Worker estiver ativo.
- Três contas FTP distintas: `deploy@`, `caude@`, `[USER-FTP-YAN-OS]`. Senha rotacionada em 2026-06-14.
- Nunca deployar sem especificar o alvo.

## Portão de verificação

SEM LOOP DE VERIFICAÇÃO. O projeto é multi-subprojeto (PHP/HostGator, Python, Node) sem comando único de aceite.
O que falta: health check HTTP público para `szuchmacher.com.br` que valide as páginas principais, e smoke test que cubra as 3 contas FTP.
Enquanto não houver: validar manualmente cada subprojeto afetado e declarar o que foi e o que não foi verificado.
