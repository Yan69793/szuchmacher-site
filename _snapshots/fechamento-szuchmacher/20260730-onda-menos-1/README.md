# Snapshot Onda -1, Fechamento de Mercado Szuchmacher

Capturado em 2026-07-30, antes de qualquer mudança do plano em
`C:\Users\User\.claude\plans\os-subagentes-est-o-indispon-veis-splendid-gem.md`.
Somente leitura no momento da captura, nada foi alterado no projeto nem em produção.

## Como reverter usando este snapshot

1. Tarefas do Windows: `Unregister-ScheduledTask -TaskName <nome> -Confirm:$false`, depois
   `Register-ScheduledTask -Xml (Get-Content .\tasks-xml\<nome>.xml -Raw) -TaskName <nome>`.
2. Código: `git reset --hard 4337d27a9ada47b6e3e7a75d4e5cf9350aaac72e`, ou
   `git reset --hard snapshot/onda-menos-1-20260730` (mesma tag, mesmo commit).
3. Artefatos de referência para comparar drift: `artefatos-5-pregoes/`.

## Conteúdo

| Item do plano | Arquivo | Observação |
|---|---|---|
| 1. Tasks XML | `tasks-xml/Szuchmacher-FechamentoDiario.xml`, `tasks-xml/Szuchmacher-FechamentoWatchdog.xml` | Ambas com `Command=C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`, conferido, é o conserto de 28/07 |
| 2. Marca de git | `git-marca.txt` | HEAD do branch `fix/validacao-precos-e-janela-de-coleta` = `4337d27`, HEAD do `master` = `48b1865`. Tag `snapshot/onda-menos-1-20260730` criada apontando para o mesmo commit |
| 3. Artefatos de 5 pregões | `artefatos-5-pregoes/outputs/`, `artefatos-5-pregoes/logs/` | 22, 24, 27, 28 e 29 de julho de 2026 |
| 4. Inventário do .env | `env-chaves-sem-valor.txt` | 13 chaves, nenhum valor. Conferido: zero linhas com `=` |
| 5. Estado do Worker e do site | `worker-deployments-list.txt`, `relatorio_cache.json.snapshot` | Última versão publicada do Worker é de 2026-07-20T23:23, coerente com a falha de permissão já registrada em `diagnosticos/AUDITORIA-FECHAMENTO-2026-07-29.md`. Cache do site reflete 29/07 |
| 6. Linha de base do portão | `linha-de-base-portao-verificacao.txt` | 5 de 5 relatórios `APROVADO`, código 0, antes de qualquer mudança |

## Critério de aceite da Onda -1 (do plano)

- [x] Os seis itens do snapshot existem em disco, fora do repositório
- [x] A exportação XML das duas tarefas foi aberta e confere o caminho absoluto do interpretador

Onda -1 fechada. Congelamento em vigor: sem deploy de Worker, sem deploy do site, sem registrar ou
alterar tarefa agendada fora deste plano, sem merge para `master`. O envio diário das 19h continua
rodando normalmente, não está congelado.
