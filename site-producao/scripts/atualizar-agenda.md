# Rotina semanal — Agenda macro szuchmacher.com.br

A agenda macroeconômica é gerada e publicada automaticamente pelo Windows Task
Scheduler (Szuchmacher-AgendaAgent, dom + seg + qui 08:00).

## Como funciona (Cloudflare Workers, sem FTP)

1. `run-agenda-agent.ps1` executa `agenda_agent.py` que gera `agenda-data.json`
2. `publicar-com-rollback.ps1` faz build (`build-cloudflare-public.ps1`), deploy
   (`deploy-cloudflare.ps1`) e validação (`validar-producao.ps1`) com rollback
   automático
3. O Worker (`sz-sites`) serve `/assets/agenda.php` lendo `agenda-data.json` do
   bundle — é servido como JSON estático, não como PHP

## Fluxo manual (se a automação falhar)

1. `cd E:\Diretorio\Claude\Site\automacao-yan-os`
2. Ativar venv e rodar: `python agents\agenda_agent.py`
3. Conferir `E:\Diretorio\Claude\Site\site-producao\agenda-data.json`
4. Publicar: `cd ..\site-producao\scripts && .\publicar-com-rollback.ps1`

## Histórico

- Até 2026-06-17: agenda era um arquivo PHP (`agenda-server.php`) publicado
  via FTP no HostGator (caminho `assets/agenda.php`). O Worker migrou o
  endpoint para leitura de `agenda-data.json` do bundle, eliminando a
  dependência de FTP. O arquivo `agenda-server.php` permanece no repo como
  referência, mas não é mais o que o site serve.
