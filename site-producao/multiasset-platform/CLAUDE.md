# CLAUDE.md — multiasset-platform (carteira customizável)

Subprojeto dentro de `Site/site-producao/multiasset-platform/`. Isolado do app principal durante o desenvolvimento. A integração com `multiasset-app.html` é o passo final, não o primeiro.

## Arquivos

| Arquivo | Função |
|---------|--------|
| `PortfolioStore.js` | Store central — fonte única de verdade para os pesos da carteira |
| `portfolio-persistence.js` | localStorage + URL share (Base64url) |
| `portfolio-sliders.html` | Sandbox de desenvolvimento autossuficiente |
| `portfolio-sliders.css` | Estilos do sandbox (herda tokens dark do multiasset-app) |
| `.htaccess` | Stub legado, manter |

## Arquitetura do store

```
                ┌─────────────┐
                │  PERFIS     │  seed data (hardcoded, 3×3 tabelas)
                └──────┬──────┘
                       │
┌──────────┐    ┌──────┴──────┐    ┌──────────────────┐
│  localStorage │ PortfolioStore │    │  URL share (?c=)  │
│  (persist)    │                │    │  (import/export)  │
└──────┬───────┘ └──────┬───────┘    └────────┬─────────┘
       │                │                     │
       └────────────────┼─────────────────────┘
                        │
               ┌────────┴────────┐
               │ getActiveWeights() │  → Array<{key, pct, color, label}>
               └────────┬────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
   atualizarAlocacao  desenharDonut  desenharBenchmark
   (DOM bars/values)  (Chart.js)    (projeção + Monte Carlo)
```

A interface estável é `getActiveWeights()` — devolve `Array<{key, pct, color, label}>`. O pipeline visual não sabe se os pesos vieram de preset ou custom.

## Estado atual (2026-08-02)

- Passo 1 concluído: PortfolioStore + getActiveWeights()
- Passo 2 concluído: sandbox com toggle preset/custom + sliders + donut
- Passo 3 concluído: localStorage + URL share
- Passo 4 (expansão de ativos): especificação apenas, não implementar
- Integração com multiasset-app.html: pendente

## Como testar

Abrir `portfolio-sliders.html` no navegador. Não precisa de servidor, é HTML estático com CDN do Chart.js.

Fluxo de teste:
1. Alternar entre perfis (Conservador/Moderado/Arrojado) — donut e sliders atualizam
2. Alternar entre cenários (Pessimista/Base/Otimista) — idem
3. Clicar em "Custom" — sliders habilitam
4. Arrastar slider de NTN-B para 40% — outros recalculam proporcionalmente, soma permanece 100%
5. Recarregar página — estado persiste
6. Clicar "Copiar link" — abrir em janela anônima — mesma carteira aparece
7. Clicar "Restaurar preset" — volta ao preset original

## Protocolo de integração (quando for o momento)

1. Copiar `PortfolioStore.js` e `portfolio-persistence.js` para dentro do `<script>` de `multiasset-app.html`
2. Trocar `function getAllocItems()` pela delegação ao store
3. Adicionar o toggle preset/custom na seção `#alocacao`
4. Rodar `scripts/validar-producao.ps1`
5. Deploy via `scripts/deploy-cloudflare.ps1`

## O que NÃO fazer

- Não criar dependências externas (npm, bundler, framework)
- Não alterar `multiasset-app.html` durante o desenvolvimento no sandbox
- Não remover o modo preset
- Não mexer no Worker, PHP ou deploy
