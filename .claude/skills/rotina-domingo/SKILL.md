---
name: rotina-domingo
description: Use quando for a manutencao semanal de szuchmacher.com.br e multi-assets.com, ou quando o usuario pedir a rotina de domingo, manutencao semanal do site, ou atualizar e publicar a plataforma.
---

# Rotina de domingo, Site e MultiAsset

## Overview

Manutencao semanal dos dois dominios servidos pelo Worker `sz-sites`. Publica o
estado atual do repositorio em producao com validacao bloqueante, e reverte
sozinha se a validacao reprovar.

**Principio central: producao so muda se a validacao aprovar. Todo caminho que
nao termina validado termina revertido.**

Escopo: `E:\Diretorio\Claude\Site\site-producao`, dominios szuchmacher.com.br e
multi-assets.com. Nao cobre VIX Radar, Jarvis nem as automacoes YAN OS.

## Por que ela existe

Em 19/07/2026 um deploy publicou `public/` pela metade e ficou 10 horas no ar.
Oito arquivos em 404: a pagina de consultoria inteira fora, `og-cover.jpg` nos
dois dominios, `sitemap.xml`, `logo.png`, `macro_data.json` e
`relatorio_cache.json`. Ninguem percebeu porque o `wrangler` saiu com codigo 0 e
todas as **paginas** continuaram em 200. So os assets caíram.

As duas licoes viraram codigo: o build reprova saida incompleta, e a validacao
olha conteudo, nao status.

## Passos

Rodar em ordem. Parar e reportar no primeiro passo que falhar.

### 1. Estado do repositorio

```powershell
cd E:\Diretorio\Claude\Site
git status --short
git log --oneline -5
```

Se houver mudanca nao commitada em `site-producao/`, **decidir antes de
publicar**: ou commita, ou reverte. Publicar working tree sujo e publicar
codigo que ninguem revisou.

Mudanca fora de `site-producao/` nao entra no deploy e pode ficar como esta,
mas mencionar no relatorio.

### 2. Dependencias do Worker

```powershell
cd E:\Diretorio\Claude\Site\site-producao\cloudflare-workers\sz-sites
npm audit
```

Vulnerabilidade alta ou critica: reportar, nao corrigir sozinha. `npm audit fix`
mexe em lockfile e pode mudar o comportamento do bundle sem teste.

### 3. Frescor dos dados servidos

Os dois arquivos usam nomes de campo e formatos de data **diferentes**, e nenhum
dos dois e `gerado_em`/`updated_at`, que era o que esta secao mandava ler ate
2026-07-19. Campo inexistente volta vazio sem erro, entao o check passava
sempre, inclusive com pipeline parado ha meses. Os campos reais sao:

| Arquivo | Campo | Formato |
|---|---|---|
| `agenda-data.json` | `gerado` | ISO 8601 com offset, `2026-07-18T01:17:14-03:00` |
| `macro_data.json` | `generated_at` | texto pt-BR, `18/07/2026 as 00:59 BRT` |

`ConvertFrom-Json` ja devolve o ISO como `[datetime]`; o do macro fica string e
precisa de `ParseExact`. Este bloco trata os dois e calcula a idade de verdade:

```powershell
cd E:\Diretorio\Claude\Site\site-producao
function Get-Idade($valor) {
  if ($valor -is [datetime]) { return $valor }
  $s = ([string]$valor) -replace '\s*BRT\s*$','' -replace '\s+[àá]s\s+',' '
  foreach ($f in @('dd/MM/yyyy HH:mm','dd/MM/yyyy HH:mm:ss','yyyy-MM-ddTHH:mm:sszzz','yyyy-MM-dd HH:mm:ss')) {
    try { return [datetime]::ParseExact($s, $f, [Globalization.CultureInfo]::InvariantCulture) } catch {}
  }
  throw "formato de data nao reconhecido: '$valor'"
}
$alvos = @(
  @{ n='agenda-data.json'; v=(Get-Content agenda-data.json -Raw | ConvertFrom-Json).gerado }
  @{ n='macro_data.json';  v=(Get-Content macro_data.json  -Raw | ConvertFrom-Json).generated_at }
)
foreach ($a in $alvos) {
  $dt = Get-Idade $a.v
  $dias = [math]::Round(((Get-Date) - $dt).TotalDays, 1)
  $st = if ($dias -gt 15) { 'PIPELINE POSSIVELMENTE PARADO' } else { 'ok' }
  "{0,-20} {1:yyyy-MM-dd HH:mm}  {2,5} dias  {3}" -f $a.n, $dt, $dias, $st
}
```

Se `Get-Idade` lancar, e sinal de que o formato do arquivo mudou. Investigar,
nao silenciar: um catch generico aqui reintroduz exatamente o ponto cego que
esta tabela existe para fechar.

Esses arquivos sao gerados fora deste escopo, em `automacao-yan-os` e
`atualizador-relatorios`. Esta rotina **le e reporta**, nao regenera. Se estiverem
com mais de 15 dias, sinalizar: e sintoma de pipeline parado, e o proprio deploy
nao resolve.

**Quem regenera o `agenda-data.json` e a task `Szuchmacher-AgendaAgent`**, domingo,
segunda e quinta as 08:00, via `site-producao\scripts\run-agenda-agent.ps1`. Ela ja
gera e publica sozinha, com a mesma validacao bloqueante do passo 4 daqui. Duas
consequencias praticas:

- Num domingo normal o `agenda-data.json` ja vai estar fresco quando esta rotina
  rodar. `gerado` de hoje e o esperado, nao coincidencia.
- A task aborta sem publicar se houver mudanca nao commitada em arquivo que chega a
  producao. Se o passo 3 mostrar a agenda velha **e** o passo 1 mostrar working tree
  sujo, a causa provavel e essa, nao pipeline quebrado. Conferir
  `automacao-yan-os\logs\agenda_scheduled_<data>.log`.

Para checar sem publicar: `.\scripts\run-agenda-agent.ps1 -Simular`.

O rotulo "Semana de referencia" no site nao e titulo fixo: `assets/macro-panel.js`
(`rotuloJanelaAgenda`) usa esse prefixo justamente quando a janela publicada ja passou.
Ver isso no ar e sintoma, nao decoracao.

### 3.1 Contagem baixa de eventos na agenda nao e bug por padrao

Semana com um evento so costuma parecer regressao e quase nunca e. Antes de
abrir investigacao, conferir na fonte se a janela esta mesmo vazia:

```powershell
python -c "import json,gzip,urllib.request; from datetime import datetime; u='https://servicodados.ibge.gov.br/api/v3/calendario/?de=2026-07-01&ate=2026-07-31&qtd=100'; r=urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'}); f=urllib.request.urlopen(r,timeout=20); raw=f.read(); raw=gzip.decompress(raw) if raw[:2]==b'\x1f\x8b' else raw; [print(str(i.get('data_divulgacao',''))[:16],'|',str(i.get('titulo',''))[:60]) for i in json.loads(raw.decode('utf-8')).get('items',[])]"
```

Verificado em 19/07/2026: o IBGE nao tem nenhuma divulgacao entre 16/07 e 28/07,
entao a janela 20 a 24/07 com so o Boletim Focus estava correta. O log de
`automacao-yan-os/logs/agenda_agent_<data>.log` confirma o mesmo numero antes e
depois do fix de dedupe de `3a236c4`, o que descarta regressao daquele commit.

### 4. Publicar com validacao e rollback

```powershell
cd E:\Diretorio\Claude\Site\site-producao
.\scripts\publicar-com-rollback.ps1
```

Faz tudo: anota a versao viva, build, deploy, espera propagar, valida, e reverte
se reprovar. Grava relatorio em `diagnosticos\publicacao_<data>.md`.

Codigo de saida e a unica coisa que importa:

| Saida | Significado | Acao |
|---|---|---|
| 0 | Producao validada na versao nova | Reportar sucesso |
| 1 | Ou o build reprovou, ou houve rollback | Ler o relatorio e reportar o motivo |

Para ver o plano sem publicar: `.\scripts\publicar-com-rollback.ps1 -Simular`

### 5. Relatorio

Entregar em portugues, curto:

- Versao publicada, ou versao para a qual reverteu
- Resultado da validacao, quantas verificacoes e quantas falhas
- Achados dos passos 1 a 3 que precisam de decisao humana
- Pendencias de `site-producao/CLAUDE.md` que continuam abertas

## Quando NAO publicar

Parar antes do passo 4 e so reportar quando:

- Working tree sujo em `site-producao/` e o conteudo nao foi revisado nesta sessao
- `npm audit` acusa critico que afete o runtime do Worker
- A validacao ja reprova **antes** de publicar, o que significa que producao esta
  quebrada por causa anterior. Deploy novo nao conserta e ainda embaralha o
  diagnostico. Rodar `.\scripts\validar-producao.ps1` sozinho e investigar.

## Erros comuns

| Erro | Consequencia | Certo |
|---|---|---|
| `npx wrangler deploy` direto | Pula o build, publica `public/` velho ou pela metade | `.\scripts\publicar-com-rollback.ps1` |
| Confiar no exit code do wrangler | Ele sai 0 com assets faltando | Confiar na validacao de conteudo |
| Checar so status HTTP | Pagina em 200 com asset em 404 passa batido | `validar-producao.ps1`, que le conteudo |
| Rodar `wrangler rollback` sem revalidar | Reverteu para outra versao quebrada e ninguem viu | A rotina revalida sozinha depois do rollback |
| Corrigir o `_PENDING` do Stripe sozinha | URL de checkout e decisao comercial do Yan | Reportar, nao tocar |

## Sinais de alerta, parar e reportar

- Validacao reprovando **antes** de qualquer deploy
- Rollback falhou, a mensagem no relatorio traz o comando manual
- `Get-VersaoViva` nao conseguiu ler a versao, a rotina aborta sem publicar de
  proposito: sem alvo de rollback, publicar e apostar
- Qualquer mudanca em `assinatura.html`, `radar-roic.html` ou nos textos de
  enquadramento CVM, que sao materia regulatoria e nao se mexe sem o advogado
