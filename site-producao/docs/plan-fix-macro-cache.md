# Plano — fix da causa raiz do cache macro vazio

**Origem:** DIAGNOSTICO-2026-08-31.md §7.1 e §9.2. Diagnóstico já fechado com
evidência, este plano é só execução.

## Goal

O cache `macro-api` deixa de ficar vazio após deploy, e uma tentativa de refresh
que falha ou é cancelada pelo cliente para de bloquear a janela de 1 h inteira.

## Preconditions

- Suíte baseline verde. Confirmado, `node --test "tests/*.test.mjs"` em
  `cloudflare-workers/sz-sites`, 70 pass, exit 0.
- Working tree do Site limpa fora dos quatro screenshots untracked.
- Node disponível, wrangler autenticado por OAuth.

## Os três defeitos

1. `deploy-cloudflare.ps1` chama `invalidate-worker-cache.ps1 -RefreshMacro`
   incondicionalmente, e o invalidador apaga `macro-api` sempre.
2. `checkRefreshRate` grava o carimbo `macro-refresh-rate` **antes** da cascata
   rodar, com TTL de 1 h. Tentativa que falha queima a janela inteira.
3. `gerarMacro` roda em foreground sem `ctx.waitUntil`. Cliente que desiste
   antes dos ~40 s tem a execução cancelada e nada é gravado. O `ctx` existe na
   rota (`index.js:27`) mas não é repassado ao handler.

## Decisões de design

**Defeito 2, carimbo em duas fases.** Remover o carimbo prévio inteiro
reintroduz o estouro de manada que ele existe para conter, e o `singleFlight` só
protege dentro do mesmo isolate. Então o carimbo continua sendo gravado antes,
só que com TTL curto (60 s, janela de tentativa em curso), e é regravado com o
TTL cheio (3600 s) **depois** do sucesso. Falha ou cancelamento bloqueia 1
minuto em vez de 1 hora.

O valor guardado passa de inteiro solto para JSON `{ts, ttl}`, e o
`expirationTtl` do KV acompanha o `ttl`. A checagem vira
`elapsed = agora - ts`, bloqueia enquanto `elapsed < ttl`, e `retryAfter` é
`ttl - elapsed`. Valor legado (inteiro solto) é lido como `{ts: <valor>, ttl:
3600}`, que é exatamente a semântica antiga, então os testes de rate que já
existem continuam válidos sem reescrita e a chave gravada por uma versão
anterior do Worker continua sendo respeitada durante o rollout.

**Defeito 3, `ctx.waitUntil` só na leitura implícita.** No refresh forçado
(cron nativo e `cron=1`) o chamador quer o resultado, então continua foreground.
Na leitura implícita com cache vazio, a resposta passa a ser o fallback estático
imediato e a cascata vai para `ctx.waitUntil`. Visitante nunca espera 40 s e o
cache é gravado mesmo que ele feche a aba. Sem `ctx` ou sem fallback estático,
mantém o comportamento atual de aguardar.

**Defeito 1, delete opt-in.** `macro-api` sai do conjunto padrão de chaves do
invalidador e passa a exigir `-IncludeMacro`. O deploy não passa a flag. Como o
`-RefreshMacro` continua e agora sobrescreve um cache que nunca foi apagado, o
deploy deixa de ter janela vazia. Se o refresh falhar, o cache anterior
sobrevive em vez de sumir. Mudança de formato do payload exige `-IncludeMacro`
explícito, documentado no cabeçalho do script.

## Tasks

### Task 1: Teste RED do carimbo de rate em duas fases
**File:** `cloudflare-workers/sz-sites/tests/macro-api.test.mjs`
**Action:** Edit
**What to do:** Adicionar teste que força a cascata a falhar (stub do OpenRouter
devolvendo 503) numa leitura implícita com cache vazio, e em seguida verifica que
uma segunda chamada, passada a janela curta, **não** é bloqueada. Verificar que a
chave `macro-refresh-rate` foi gravada com `expirationTtl` de 60 e não 3600.
**Verification:** `node --test "tests/*.test.mjs"` falha nesse teste, e só nele.
**Depends on:** none

### Task 2: Teste RED do `ctx.waitUntil`
**File:** `cloudflare-workers/sz-sites/tests/macro-api.test.mjs`
**Action:** Edit
**What to do:** Adicionar teste que chama `handleMacroApi(req, env, {}, ctx)` com
cache vazio e fallback estático presente, e afirma que a resposta volta rápida
com o payload do fallback, que `ctx.waitUntil` recebeu uma promise, e que depois
de aguardar essa promise o KV `macro-api` está gravado.
**Verification:** `node --test "tests/*.test.mjs"` falha nesse teste.
**Depends on:** none

### Task 3: Implementar carimbo em duas fases
**File:** `cloudflare-workers/sz-sites/src/handlers/macro-api.js`
**Action:** Edit
**What to do:** Separar `checkRefreshRate` em leitura mais carimbo curto, e criar
`stampRefreshSuccess(env)` com TTL 3600 chamada só depois de `writeCache` do
`macro-api`. Guardar instante de expiração como valor.
**Verification:** teste da Task 1 passa.
**Depends on:** 1

### Task 4: Repassar `ctx` e mover a regeneração implícita para background
**File:** `cloudflare-workers/sz-sites/src/handlers/macro-api.js`
**Action:** Edit
**What to do:** Assinatura vira `handleMacroApi(request, env, opts, ctx)`. Na
leitura implícita com cache vazio, janela livre, fallback estático disponível e
`ctx?.waitUntil` presente, responder o fallback e mandar a cascata para o
`waitUntil`. Sem fallback ou sem ctx, manter o await atual.
**Verification:** teste da Task 2 passa.
**Depends on:** 2

### Task 5: Passar `ctx` na rota
**File:** `cloudflare-workers/sz-sites/src/index.js`
**Action:** Edit
**What to do:** Linha 27, trocar `handleMacroApi(req, env)` por
`handleMacroApi(req, env, {}, ctx)`.
**Verification:** `node --test "tests/*.test.mjs"` verde inteiro.
**Depends on:** 4

### Task 6: Delete de `macro-api` vira opt-in
**File:** `site-producao/scripts/invalidate-worker-cache.ps1`
**Action:** Edit
**What to do:** Adicionar `[switch]$IncludeMacro`. `$KEYS` padrão perde
`macro-api`, que só entra na lista quando a flag vem. Documentar no cabeçalho que
mudança de formato do payload exige a flag.
**Verification:** `.\scripts\invalidate-worker-cache.ps1 -WhatIf` não roda, então
verificar por leitura mais execução real controlada no Task 8.
**Depends on:** none

### Task 7: Suíte completa verde
**File:** n/a
**Action:** Run
**What to do:** `node --test "tests/*.test.mjs"` em `cloudflare-workers/sz-sites`.
**Verification:** 0 fail, exit 0, contagem maior que os 70 do baseline.
**Depends on:** 3, 4, 5

### Task 8: Deploy e verificação em produção
**File:** n/a
**Action:** Run
**What to do:** Só com ordem explícita do operador.
`.\scripts\deploy-cloudflare.ps1`, depois `.\scripts\validar-producao.ps1`.
**Verification:** gate com 0 falha, `/health` com `macro_cache` preenchido,
`macro_api.php` público com `note` ausente.
**Depends on:** 7

## Rollback

Código é commit único, `git revert` resolve. Em produção,
`publicar-com-rollback.ps1` já cobre a reversão automática se o gate reprovar.
Nenhuma migração de dado, a mudança de formato do valor da chave
`macro-refresh-rate` é retrocompatível por construção e a chave tem TTL curto.
