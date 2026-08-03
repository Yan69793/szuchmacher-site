# Tokens

## Por que duas camadas

O achado que forçou a arquitetura: `#c4a46a` é `--gold-bright` no
szuchmacher.com.br e é `--gold` no multi-assets.com. A mesma tinta exerce papel
diferente porque um fundo é claro e o outro é escuro.

Uma lista plana de nomes de cor não consegue expressar isso. Por isso:

```
camada 1, primitivo      --sz-gold-400: #c4a46a       o que a cor é
camada 2, papel          --accent: var(--sz-gold-400) o que a cor faz
camada 3, tema           .tema-carvao { --accent: ... } quem manda
```

Componente consome só a camada 2. Trocar de produto é trocar a classe do tema.

## Camada 1, primitivos

Nenhum componente deve referenciar estes diretamente.

### Papel, fundo claro

| Token | Valor | Origem |
|---|---|---|
| `--sz-paper-100` | `#f8f6f2` | institucional, `--surface-soft` |
| `--sz-paper-200` | `#f3f1ec` | institucional, `--bg` |
| `--sz-paper-300` | `#ebe7e0` | institucional, `--surface` |

### Tinta, fundo escuro

| Token | Valor | Origem |
|---|---|---|
| `--sz-ink-800` | `#172338` | institucional, `--navy-soft` |
| `--sz-ink-900` | `#0c1524` | institucional, `--navy` |
| `--sz-ink-930` | `#10141a` | MultiAsset, `--surface` |
| `--sz-ink-950` | `#0a0c10` | MultiAsset, `--bg` |
| `--sz-ink-970` | `#001830` | Radar, `--navy-2` |
| `--sz-ink-990` | `#001020` | Radar, `--navy` |

Os três escuros são famílias distintas de propósito. O institucional é navy
quente, o MultiAsset é quase preto neutro, o Radar é navy saturado. Não
uniformizar: cada um foi calibrado para a densidade de informação do produto.

### Dourado

| Token | Valor | Uso |
|---|---|---|
| `--sz-gold-400` | `#c4a46a` | acento sobre fundo escuro |
| `--sz-gold-450` | `#b7985d` | acento Radar |
| `--sz-gold-500` | `#8c6b3a` | acento sobre fundo claro |
| `--sz-gold-550` | `#886839` | texto pequeno sobre papel |
| `--sz-gold-600` | `#a88850` | hover |
| `--sz-gold-700` | `#8a6f3a` | pressionado |

`--sz-gold-500` sobre papel e `--sz-gold-400` sobre escuro são o mesmo papel
visual. Usar o claro sobre claro reprova em contraste.

### Por que existe o gold-550

Medido na folha de prova: `#8c6b3a` sobre `#f3f1ec` rende **4.35:1** e reprova
em WCAG AA para texto pequeno, que é exatamente o caso do `.eyebrow` (0.64rem) e
do `.section-date` (0.68rem). É uma falha que já está em produção no
szuchmacher.com.br, não algo introduzido aqui.

`#886839` rende **4.55:1** e passa. A diferença é de 4 pontos de RGB, visualmente
indistinguível. Por isso `--accent` segue idêntico a produção, servindo filete,
marcador, borda e preenchimento, onde o mínimo exigido é 3:1 e sobra margem, e
`--accent-text` existe para todo dourado que carrega texto.

Nos temas escuros `--accent-text` aponta para o próprio `--accent`, que já passa
com folga (8.26:1 no carvão, 7.00:1 no navy).

### Texto

| Token | Valor | Sobre |
|---|---|---|
| `--sz-text-900` | `#161c28` | papel |
| `--sz-text-500` | `#5c6574` | papel, secundário |
| `--sz-cream-100` | `#ede9e1` | escuro |
| `--sz-cream-200` | `#e8e4d9` | escuro, MultiAsset |
| `--sz-cream-300` | `#d8d0c0` | escuro, Radar |
| `--sz-slate-400` | `#8b93a0` | escuro, secundário MultiAsset |
| `--sz-slate-500` | `#8896a0` | escuro, secundário Radar |

Nenhum branco puro em nenhum tema. O texto sobre escuro é sempre um creme
levemente quente, o que é parte da assinatura.

### Semáforo

Uso restrito a dado numérico e indicador de estado. Nunca como cor de marca.

| Token | Valor | Sentido |
|---|---|---|
| `--sz-pos` | `#5aad86` | alta, positivo |
| `--sz-neg` | `#e08f8f` | baixa, negativo |
| `--sz-info` | `#6a96d4` | neutro, informativo |
| `--sz-warn` | `#d4885a` | atenção |

## Camada 2, papéis

Nove papéis. É tudo que um componente pode consumir.

| Papel | Função |
|---|---|
| `--bg` | fundo da página |
| `--surface` | bloco elevado, faixa de seção |
| `--surface-soft` | célula dentro de grid de fio, painel |
| `--text` | texto principal e título |
| `--muted` | texto secundário, legenda |
| `--accent` | dourado para filete, marcador, borda e preenchimento |
| `--accent-text` | dourado para texto pequeno, garante AA sobre o fundo do tema |
| `--accent-strong` | dourado mais claro, realce sobre escuro |
| `--line` | fio de separação padrão |
| `--line-strong` | fio de borda e de fundo de grid |

Mais o conjunto de inversão, para faixas do tema oposto dentro da mesma página:
`--invert-bg`, `--invert-bg-soft`, `--invert-text`, `--invert-muted`,
`--invert-line`, `--invert-accent`.

## Camada 3, temas

| | `tema-papel` | `tema-carvao` | `tema-navy` |
|---|---|---|---|
| Produto | Szuchmacher | MultiAsset | VIX Radar |
| `--bg` | `#f3f1ec` | `#0a0c10` | `#001020` |
| `--surface` | `#ebe7e0` | `#10141a` | `#001830` |
| `--surface-soft` | `#f8f6f2` | `#161b22` | `#0d2030` |
| `--text` | `#161c28` | `#e8e4d9` | `#d8d0c0` |
| `--muted` | `#5c6574` | `#8b93a0` | `#8896a0` |
| `--accent` | `#8c6b3a` | `#c4a46a` | `#b7985d` |
| `--accent-text` | `#886839` | `#c4a46a` | `#b7985d` |
| `--accent-strong` | `#c4a46a` | `#d8bc84` | `#c9a96e` |
| Display | Prata | Playfair Display | Libre Baskerville |
| `--max` | 1120px | 1280px | 1280px |

Corpo Public Sans e mono JetBrains Mono nos três.

## Tipografia

```
--sz-font-body: 'Public Sans', system-ui, -apple-system, 'Segoe UI', sans-serif
--sz-font-mono: 'JetBrains Mono', 'Consolas', ui-monospace, monospace
--font-display: definido pelo tema
```

Escala:

| Papel | Tamanho | Peso | Tracking |
|---|---|---|---|
| h1 | `clamp(2.5rem, 4.6vw, 3.65rem)` | 400 | `-0.028em` |
| h2 | `clamp(1.75rem, 2.8vw, 2.2rem)` | 400 | `-0.028em` |
| h3 | `1.35rem` | 400 | `-0.028em` |
| corpo | `1rem`, lead `1.02rem` | 400 | 0 |
| eyebrow | `0.64rem` | 500 | `0.16em` |
| botão | `0.62rem` | 500 | `0.14em` |
| métrica | `1.85rem` a `2.1rem`, serifa | 400 | `-0.028em` |

Métrica sempre com `font-variant-numeric: tabular-nums`.

## Escalas comuns

```
--radius: 0px
--tracking-display: -0.028em
--tracking-label: 0.16em
--ease-out: cubic-bezier(0.22, 1, 0.36, 1)
line-height corpo: 1.65
line-height título: 1.08
container: 0 32px, cai para 0 20px em ≤640px
seção: 112px 0, cai para 74px 0 em ≤640px
scroll-margin-top de âncora: 88px
```

## Contraste medido

Folha de prova `assets/prova.html`, razões WCAG calculadas sobre valor computado.

| | texto | secundário | acento em texto |
|---|---|---|---|
| `tema-papel` | 15.11:1 | 5.21:1 | 4.55:1 |
| `tema-carvao` | 15.41:1 | 6.32:1 | 8.26:1 |
| `tema-navy` | 12.51:1 | 6.32:1 | 7.00:1 |

Os nove pares passam em AA. Refazer esta medição sempre que um primitivo mudar.

## Rastreabilidade

Levantado de produção em 21/07/2026, a partir de:

- `szuchmacher.com.br/assets/sz-design.css?v=20260718c`, bloco `:root`, 39KB
- `multi-assets.com`, bloco `:root` inline, 17 variáveis
- `vixradar.com`, quatro blocos `:root` inline conflitantes, ver
  `inventario-atual.md`
