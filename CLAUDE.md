# CLAUDE.md — Site (hardened 2026-07-25)

## Estado do projeto

Página canônica de estado, legível por qualquer agente (não só Claude): `status/ESTADO.md`. Ler antes de começar sessão de trabalho, atualizar a data e os itens ao fechar uma sessão que mudou o estado.

## Deploy

- HostGator via FTP: `cd site-producao && bash scripts/deploy.sh [agenda|index|relatorios|multiasset|logo|all]`
- Três contas FTP distintas: `deploy@`, `caude@`, `[USER-FTP-YAN-OS]`. Senha rotacionada em 2026-06-14.
- Nunca deployar sem especificar o alvo.

## Portão de verificação

Antes de declarar qualquer tarefa concluída, execute:
```powershell
cd site-producao; .\scripts\validar-producao.ps1
```
46 verificações em szuchmacher.com.br + multi-assets.com (páginas, assets, endpoints, redirects). Checagem de conteúdo, não só status HTTP. A contagem muda quando checagem nova entra, use a da saída real do script.

Checagem nova neste script só entra **depois** que a mudança correspondente já está em produção. `publicar-com-rollback.ps1` roda este gate, e a rotina automática da agenda (domingo, segunda e quinta às 08:00) usa esse script: uma checagem vermelha ali dispara rollback e e-mail de alerta.

O FTP é legado desde a migração para Cloudflare Workers (2026-06-17). O deploy primário é `.\scripts\deploy-cloudflare.ps1`.

## Pendências abertas

O canon é `status/ESTADO.md`, seção `## Itens abertos`. Esta seção existe como ponteiro, não como lista, porque a varredura de workspace (`scan-pendencias.ps1`) procura exatamente este cabeçalho e, sem ele, lê só a lista detalhada de `site-producao/CLAUDE.md`, que já divergiu do estado real uma vez.

A lista detalhada, item por item, com prioridade, é `site-producao/CLAUDE.md`, seção `## Pendências abertas (prioridade)`. Ao fechar um item, atualizar as duas.
