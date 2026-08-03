---
name: sz-design
description: >
  Sistema de design da casa Szuchmacher, fonte única para szuchmacher.com.br,
  multi-assets.com e vixradar.com. Contém os tokens reais extraídos de produção
  (paleta, tipografia, espaçamento, raio, fio de 1px), os três temas (papel,
  carvão, navy), o inventário de componentes e as regras duras que separam a
  identidade da casa de um layout genérico. Use SEMPRE que for criar ou alterar
  qualquer interface, página, landing, dashboard, e-mail ou PDF que leve a marca
  Szuchmacher, MultiAsset ou VIX Radar. Também acionar quando o usuário pedir
  identidade visual, paleta, tipografia, tokens, design system, "na minha
  identidade", "igual ao meu site", redesign, nova página, ou reclamar que algo
  ficou com cara de IA ou genérico. Carregar ANTES de escrever a primeira linha
  de HTML ou CSS, nunca depois.
---

# Sistema de design Szuchmacher

Uma casa, três produtos, um vocabulário. Este documento é a fonte de verdade.
Não deduza a identidade a partir de screenshot nem de memória: os valores estão
aqui e em `assets/sz-tokens.css`.

## Os três produtos

| Produto | URL | Tema | Display | Repositório |
|---|---|---|---|---|
| Szuchmacher Consultoria | szuchmacher.com.br | `tema-papel` | Prata | `E:\Diretorio\Claude\Site\site-producao` |
| MultiAsset | multi-assets.com | `tema-carvao` | Playfair Display | `E:\Diretorio\Claude\Site\site-producao` |
| VIX Radar | vixradar.com | `tema-navy` | Libre Baskerville | `E:\Diretorio\Claude\Monitoramento de Credito` |

Corpo e mono são comuns aos três: **Public Sans** e **JetBrains Mono**. Só o
display distingue cada produto.

## Regras duras

Estas são invariantes. Quebrar qualquer uma delas produz algo que não é da casa.

1. **Raio zero.** `--radius: 0px` em tudo. Sem exceção, sem `rounded-lg`, sem
   pílula. Círculo só em avatar e em marcador de gráfico.
2. **Separação por fio, não por sombra.** Blocos se separam com `1px solid
   var(--line)`. Não existe `box-shadow` decorativa no sistema.
3. **Grid de fio de cabelo.** A assinatura da casa é `display: grid; gap: 1px;
   background: var(--line-strong)` com as células opacas por cima. É assim que
   se faz qualquer faixa de métrica, card ou pilar.
4. **Display sempre em peso 400.** Prata, Playfair e Libre Baskerville nunca
   entram em bold. O peso vem do tamanho e do espaço, não da gordura da letra.
5. **Mono é rótulo, não texto.** JetBrains Mono só em eyebrow, label, dado,
   metadado, botão e carimbo, sempre caixa-alta com `letter-spacing: 0.14em` a
   `0.16em`. Nunca em parágrafo.
6. **Número em serifa com `tabular-nums`.** Métrica grande é display serifado,
   não mono. `font-variant-numeric: tabular-nums` é obrigatório.
7. **Dourado é acento.** Filete, rótulo, marcador, borda superior, botão de CTA
   final. Nunca fundo de área grande, nunca gradiente decorativo. Quando o
   dourado carrega texto, use `--accent-text`, não `--accent`: sobre papel o
   acento puro rende 4.35:1 e reprova em AA.
8. **Sem glow, sem gradiente ornamental.** Gradiente só nos dois usos que já
   existem: a faixa navy do CTA e o pergaminho dos cartões sobre fundo escuro.
9. **Ícone é SVG inline.** Nada de Font Awesome nem biblioteca externa. Traço de
   1.5, `stroke: currentColor`, `fill: none`.
10. **Sem emoji em qualquer superfície.**

## Mapa rápido de token

Duas camadas. Componente consome apenas a camada semântica.

```
primitivo            →  papel semântico  →  componente
--sz-paper-200          --bg                background: var(--bg)
--sz-gold-500           --accent            color: var(--accent)
```

Papéis disponíveis: `--bg`, `--surface`, `--surface-soft`, `--text`, `--muted`,
`--accent`, `--accent-text`, `--accent-strong`, `--line`, `--line-strong`.

Trocar de produto é trocar o tema, que remapeia esses nove papéis. Nenhum
componente muda.

Tabela completa dos primitivos e dos três temas: `references/tokens.md`.

## Escalas fixas

```
--max: 1120px            institucional e landing
--max: 1280px            MultiAsset e dashboard
container padding        0 32px, cai para 0 20px em ≤640px
seção                    112px 0, cai para 74px 0 em ≤640px
--tracking-display       -0.028em   (título)
--tracking-label          0.16em    (rótulo mono caixa-alta)
--ease-out               cubic-bezier(0.22, 1, 0.36, 1)
line-height corpo        1.65
line-height título       1.08
```

## Como usar

1. Copie `assets/sz-tokens.css` e `assets/sz-base.css` para o projeto, ou cole
   inline se for arquivo único. Escolha o tema na tag `<html>` ou `<body>`:
   `class="tema-papel"`, `tema-carvao` ou `tema-navy`.
2. Monte a página com os componentes de `references/componentes.md`. Eles já
   existem e têm nome. Não invente equivalente novo para algo que já está lá.
3. Se precisar de um componente inexistente, construa com as regras duras acima
   e registre em `references/componentes.md`.
4. Antes de entregar, rode a lista de conferência abaixo.

## Conferência antes de entregar

- Nenhum `border-radius` diferente de zero, fora avatar e marcador.
- Nenhuma `box-shadow` decorativa.
- Todo título em peso 400.
- Toda mono em caixa-alta com tracking, nunca em parágrafo.
- Todo número grande em serifa com `tabular-nums`.
- Todo dourado que carrega texto usando `--accent-text`.
- Contraste do texto secundário conferido sobre o fundo do tema em uso. Para
  medir, abra `assets/prova.html` servido por HTTP, não por `file://`.
- `prefers-reduced-motion` desliga toda animação.
- Foco de teclado visível com `outline: 2px solid var(--accent)` e
  `outline-offset: 3px`.
- `.reveal` degrada visível se o JS falhar, nunca esconde conteúdo por padrão.

## Referências

- `references/tokens.md` — primitivos, papéis e os três temas, tabela completa
- `references/componentes.md` — inventário de classe com anatomia e uso
- `references/inventario-atual.md` — estado real dos três em produção e o diff
- `assets/sz-tokens.css` — camadas 1 e 2, pronto para colar ou servir
- `assets/sz-base.css` — tipografia, container, botão, eyebrow, reveal, foco
- `assets/prova.html` — folha de prova, três temas lado a lado com medição de
  contraste ao vivo. Servir por HTTP, o `file://` não roda o script.
- `assets/email-subset.md` — subconjunto para Resend, inline e sem webfont

## Skills irmãs

`awwwards-szuchmacher`, `awwwards-multiasset` e `awwwards-vix-radar` cuidam do
polimento por produto. Elas assumem este documento como base de tokens.
Auditoria pós-mudança: `szuchmacher-audit` ou `vix-radar-audit`.
