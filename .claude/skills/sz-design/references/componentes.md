# Componentes

Inventário extraído de `sz-design.css` em produção. Se o que você precisa está
aqui, use este nome e esta anatomia. Não crie um equivalente novo.

Os que estão em `assets/sz-base.css` são portáteis para qualquer produto. Os
demais vivem no repositório do site institucional e estão documentados aqui para
que sejam reconhecidos e reaproveitados, não reinventados.

---

## Na base portátil

### `.eyebrow`

Rótulo de seção. Mono, caixa-alta, dourado, `0.64rem`, tracking `0.16em`,
`margin-bottom: 20px`. Sempre acima do `h1` ou `h2`, nunca sozinho.

### `.rule`

Filete de 40px por 1px em dourado, sob o título do hero. Marca o fim da abertura
e o começo do texto corrido. Use `<hr class="rule">` com `aria-hidden`.

### `.section` e `.section-surface`

`112px 0` de respiro, caindo para `74px 0` em telas pequenas.
`.section-surface` acrescenta fundo `--surface` e fio forte em cima e embaixo,
usado para alternar ritmo entre seções.

### `.section-invert`

Faixa do tema oposto dentro da página. É o recurso que dá à página um único
ponto de contraste forte. No institucional é a faixa navy do painel macro. Use
no máximo uma ou duas por página.

### `.section-head`

Cabeçalho de seção em `flex` com `justify-content: space-between` e
`align-items: end`, separado por fio embaixo. À esquerda eyebrow, `h2` e um
parágrafo de até 560px. À direita, opcional, `.section-date` em mono dourado.
Empilha em ≤980px.

### `.hairline-grid`

**A assinatura da casa.** `display: grid`, `gap: 1px`, fundo `--line-strong`,
borda de 1px, células opacas em `--surface-soft`. O gap deixa o fundo aparecer e
vira fio de cabelo perfeito, sem precisar de borda por célula nem lidar com
colapso de borda.

```html
<div class="hairline-grid" data-cols="4">
  <div>…</div><div>…</div><div>…</div><div>…</div>
</div>
```

`data-cols` aceita 2, 3 e 4. Colapsa para 2 em ≤980px e para 1 em ≤640px.

### `.btn`, `.btn-outline`, `.btn-accent`

Mono `0.62rem` caixa-alta, tracking `0.14em`, `min-height: 48px`, canto reto.
O sólido usa a cor invertida do tema. O `.btn-accent` é dourado e fica reservado
ao CTA final. Agrupar com `.btn-group`.

### `.metric`, `.metric-value`, `.metric-label`

Número em display serifado com `tabular-nums`, rótulo em mono caixa-alta.
Nunca o inverso: número em mono e rótulo em serifa é erro de sistema.

### `.compliance-note`

Bloco de aviso legal ou de conformidade. Fundo dourado a 6%, borda dourada a
22%, texto `0.88rem` em `--muted`.

### `.reveal`

Visível por padrão. Só some se o JS adicionar `.js-ready` em `<html>`, e volta
com `.is-visible`. Se o JS falhar, a página continua legível. Atraso por
elemento via `style="--d: .08s"`.

### `.skip-link` e `.sr-only`

Padrão de acessibilidade. O skip link entra em foco no topo com fundo invertido.

---

## No repositório do institucional

Documentados para reconhecimento e reaproveitamento.
Arquivo: `E:\Diretorio\Claude\Site\site-producao\assets\sz-design.css`

### `.hero-grid`

`1.15fr 0.85fr` com `gap: 64px`, texto à esquerda e visual emoldurado à direita.
Colapsa para coluna única em ≤980px.

Atenção: em produção o `.hero-visual` recebe `order: -1` no colapso, o que joga
a imagem para cima da headline no celular. Faz sentido quando o visual é uma
fotografia evocativa. Em landing de conversão, não use: a headline tem que vir
primeiro.

### `.hero-visual` e `.hero-visual-frame`

Moldura de 1px com 10px de padding e um quadro interno em `aspect-ratio: 4/5`.
Legenda embaixo em mono `0.6rem` caixa-alta, centralizada.

### `.hero-metrics` e `.hero-metric`

Aplicação do grid de fio em 4 colunas. Cada célula tem chave em mono dourada,
valor em serifa `1.45rem` e frase de apoio em `0.88rem`. Altura mínima 108px.
Vai a 2 colunas em ≤900px e a 1 em ≤520px.

### `.pillars-grid` e `.pillar`

Três colunas separadas por fio vertical, com fio forte em cima e embaixo. Cada
pilar tem um `<strong>` em mono caixa-alta e um `<span>` descritivo. A numeração
usada é `01,` com vírgula, não ponto.

### `.offers-grid` e `.offer`

Grid de fio com cartões de oferta. Dentro: `.offer-tag` em mono dourado, `h3`,
parágrafo, lista com `::marker` dourado e um `.btn` de largura total no rodapé,
empurrado por `flex-grow` na lista.

### `.for-whom-grid` e `.whom-card`

Mesma mecânica, altura mínima de 230px, hover clareia o fundo para `--bg`.

### `.method-grid` e `.method-step`

Quatro passos com `counter-reset: method` e `counter-increment`. O número sai em
`::before` com `counter(method, decimal-leading-zero)`, em mono dourado. A borda
superior é transparente e vira dourada no hover.

### `.credential-panel` e `.credential-list`

Painel com 34px de padding sobre `--surface-soft`. Cada item da lista tem um
`<strong>` em mono caixa-alta seguido de texto corrido, separados por fio.

### `.market-wrap`, `.market-main`, `.market-card`

Faixa escura com cartão principal translúcido à esquerda e cartões claros à
direita. O cartão claro usa gradiente pergaminho `#f2ece1 → #ece3d5` com número
em serifa `2.1rem` e `tabular-nums`.

Bug conhecido: `.market-card` declara `box-shadow` duas vezes e a segunda anula
o filete dourado superior `inset 0 2px 0 var(--gold)`. Ao reaproveitar, use
`border-top: 2px solid var(--accent)` em vez da sombra.

### `.mp-*`, painel macro

Faixa navy com ticker de 4 cartões e agenda. Os cartões usam o mesmo pergaminho
com `border-top: 2px solid var(--gold)`. A agenda usa `.mp-evento` em grid
`88px 1fr 32px` que reflui para áreas nomeadas em ≤640px. Específico do
institucional, não portar sem necessidade.

### `.faq-item`

`<details>` com fio forte em cima e embaixo. O `summary` é serifado `1.15rem`, o
marcador nativo é escondido e substituído por `+` que vira `–` quando aberto,
em dourado.

### `.cta-strip`

Faixa de chamada com gradiente `135deg` do navy para o navy suave. O botão
principal vira dourado, o secundário fica com borda branca a 40%.

### `.contact-grid`, `.contact-form`

Formulário com campos de `min-height: 48px`, fundo branco, borda `--line-strong`
que vira dourada no foco, e `border-radius: 0`.

### `.ysz-lockup` e `.ysz-stack`

Assinatura Szuchmacher Consultoria, monograma YS em quadro de 40px (ou 64px na
versão empilhada). Usa Playfair Display e Manrope com cores fixas, deliberadamente
independentes do `:root`, para não mudar de cor ao trocar de tema. Variante
`--dark` para fundo escuro. Não alterar sem pedido explícito.

---

## Componentes ausentes do sistema

Estes foram construídos sob demanda e ainda não estão consolidados. Se voltarem
a ser usados, promova para a base.

- **Guilhoché em canvas.** Rosácea de hipotrocoides sobrepostas com defasagem
  mínima, no vocabulário de gravura de cédula e certificado. Boa para produto de
  segurança, governança e auditoria. Implementada na landing Service AI.
- **Carimbo de conformidade.** Célula de grid de fio com ícone SVG de escudo e
  rótulo em mono, para LGPD, GDPR, SOC 2 e AES-256.
- **Contador numérico.** `IntersectionObserver` com `threshold: 0.6` disparando
  uma vez, `requestAnimationFrame` com `easeOutCubic` em 1,6s, formatação por
  `toLocaleString('pt-BR')`. Em `prefers-reduced-motion`, valor final direto.
