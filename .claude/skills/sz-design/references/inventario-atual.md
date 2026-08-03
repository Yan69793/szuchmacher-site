# Inventário do estado atual

Levantado de produção em 21/07/2026. Descreve o que os três sistemas são hoje e
qual a distância até o alvo comum. Nenhuma linha de produção foi alterada.

---

## szuchmacher.com.br

É a referência e o único com o sistema organizado fora do HTML.

Arquivo: `E:\Diretorio\Claude\Site\site-producao\assets\sz-design.css`, 39KB,
servido como `/assets/sz-design.css?v=20260718c`.
Companheiros: `sz-imagery.css`, `sz-site.js`, `sz-config.js`, `macro-panel.js`,
`hero-editorial.css`, `hero-editorial.js`, `hero-switch.js`.

Páginas: `index`, `consultoria`, `honorarios`, `assinatura`, `relatorios`,
`multiasset`, `multiasset-app`, `radar-roic`, `privacidade`, `og-cover`.

Estado: alinhado. `--radius: 0px`, Prata em 400, Public Sans, JetBrains Mono,
grid de fio, sem sombra decorativa.

### Débitos

O arquivo mistura três coisas que deveriam ser camadas separadas: token de
marca, primitivo de interface e componente de página específica (painel macro,
formulário de contato, FAQ, lockup). Por isso não é possível levar um pedaço
para outro projeto.

`.market-card` declara `box-shadow` duas vezes. A segunda declaração anula a
primeira, matando o filete dourado superior `inset 0 2px 0 var(--gold)`. Ao
reaproveitar, trocar por `border-top: 2px solid var(--accent)`.

O versionamento é por query string (`?v=20260718c`) sobre arquivo mutável.
Funciona enquanto há um consumidor só. Com dois ou mais, uma edição quebra os
outros sem aviso. Migrar para caminho imutável quando surgir o segundo.

`.hero-visual` recebe `order: -1` no colapso mobile, jogando o visual acima da
headline. Correto para foto editorial, errado para landing de conversão.

**Contraste do dourado em texto pequeno.** `--gold: #8c6b3a` sobre
`--bg: #f3f1ec` rende 4.35:1 e reprova em WCAG AA para texto pequeno. Atinge
todo `.eyebrow` (0.64rem) e `.section-date` (0.68rem) do site, que são muitos.
Correção medida: `#886839`, que rende 4.55:1 com diferença de 4 pontos de RGB,
imperceptível. Aplicar apenas onde o dourado carrega texto; em filete, marcador
e borda o mínimo é 3:1 e o valor atual passa com folga. Está resolvido na base
portátil pelo papel `--accent-text`, e continua aberto em produção.

---

## multi-assets.com

Já está a dois passos de casa.

Estrutura: monolito de 351KB com um único bloco `<style>`. Bloco `:root` com 17
variáveis.

### O que já bate

Das 95 declarações de `border-radius`, 94 são `0`. Mesmo
`--tracking-display: -0.028em` do institucional. Mesmo `--radius: 0px`. Mesma
família de dourado, e `--gold: #c4a46a` é exatamente o `--gold-bright` do
institucional exercendo o papel de acento base porque o fundo é escuro.

### O que diverge

Tipografia: Playfair Display, DM Sans e DM Mono, contra Prata, Public Sans e
JetBrains Mono. Pelo alvo travado, corpo e mono migram para Public Sans e
JetBrains Mono; Playfair Display permanece como display do produto.

Fundo: quase preto neutro `#0a0c10`, não o navy do institucional. É deliberado e
fica como está, mapeado em `tema-carvao`.

Carrega Font Awesome de `cdnjs.cloudflare.com`, dependência externa que os outros
dois não têm. Substituir por SVG inline.

Contagem de fontes declaradas: `DM Mono` em 75 lugares, `DM Sans` em 10,
`Playfair Display` em 7. Duas ocorrências com aspas escapadas (`\'DM Mono\'`),
sinal de string gerada em JS.

### Diff até o alvo

1. Trocar DM Sans por Public Sans e DM Mono por JetBrains Mono no `<link>` de
   fontes e nas declarações.
2. Substituir Font Awesome por SVG inline.
3. Renomear as variáveis para os papéis semânticos, apontando para `tema-carvao`.
4. Corrigir a única declaração `border-radius` que não é zero.

---

## vixradar.com

Concentra a dívida.

Estrutura: monolito de 700KB com nove blocos `<style>`. Frontend em Pages, API
em Worker (`radar-credito-api.prospects-intel.workers.dev`).
Repositório: `E:\Diretorio\Claude\Monitoramento de Credito`, que já tem um
`TECH_DEBT_AUDIT.md`.

### Colisão de cascata

Há quatro blocos `:root` distintos. Dois deles redefinem as mesmas variáveis
tipográficas com valores conflitantes:

```
bloco 2:  --font-serif: 'Libre Baskerville', 'Cormorant Garamond', Georgia, serif
bloco 4:  --font-serif: 'Cormorant Garamond', Georgia, serif
```

Quem vence depende da ordem no documento, não de intenção. O mesmo acontece com
`--font-sans`, declarado em dois blocos. Isso é bug, não estética, e deve ser
resolvido antes de qualquer trabalho visual no Radar.

### Excesso tipográfico

Famílias carregadas: Inter, Manrope, DM Sans, Cormorant Garamond, Libre
Baskerville, Bodoni Moda, JetBrains Mono. Mais IBM Plex Mono, SF Mono, Consolas e
Monaco referenciadas em declarações. São sete famílias baixadas para um produto.

Contagem: `font-family: inherit` em 50 lugares, `Manrope` em 21, `Inter` em 20,
`SF Mono` em 9, `IBM Plex Mono` em 9, `JetBrains Mono` em 7.

### Raio

311 declarações de `border-radius`, distribuídas entre `4px` (65), `6px` (58),
`3px` (49) e `50%` (33), além de outras. Contradiz frontalmente a regra de canto
reto dos outros dois produtos.

### Paleta

Esta parte está coerente. Navy `#001020`, dourado `#b7985d`, texto creme
`#d8d0c0`, borda `#0d2438`. Já mapeada em `tema-navy` sem alteração de valor.
Existe também um conjunto `--cq-*` para uma superfície específica, que pode virar
variante de `--surface` no futuro.

### Diff até o alvo

Ordem sugerida, do menor risco para o maior:

1. Resolver a colisão dos blocos `:root`. É correção de bug, isolada e testável.
2. Cortar as famílias não usadas do `<link>` de fontes. Ganho de performance
   imediato, risco baixo.
3. Consolidar corpo em Public Sans e mono em JetBrains Mono, mantendo Libre
   Baskerville como display do produto.
4. Zerar o raio. É o passo mais visível e o de maior risco de regressão. Fazer em
   tarefa própria, com auditoria antes e depois via `vix-radar-audit`.

---

## Resumo da distância

| | raio zero | Public Sans | JetBrains Mono | sem CDN de ícone | `:root` limpo |
|---|---|---|---|---|---|
| szuchmacher.com.br | sim | sim | sim | sim | sim |
| multi-assets.com | quase, 1 exceção | não | não | não | sim |
| vixradar.com | não, 311 casos | não | parcial | sim | não |
