# Plano de implementação — Logo YSZ (Szuchmacher Consultoria)

Fonte: `Logo YSZ design-handoff.zip` (Claude Design), aprovado como "Logo final — Szuchmacher Consultoria".
Escopo desta fase: **Site institucional** (`E:\Diretorio\Claude\Site\site-producao\`), como projeto de referência.
Fases seguintes (após aprovação visual desta): VIX Radar, Jarvis, graphify, Radar Quant Brasil, MultiAsset-Supabase.
Fora de escopo (decidido): Jornada Interior (marca "Maia Veras", incompatível).

## Goal

Substituir as 3 variantes atuais de marca em texto (`.brand-lockup`, `.nav-logo`+`.logo-icon`, `.nav-brand`) por um
componente único `.ysz-lockup` fiel ao mockup aprovado (monograma "YS" em moldura fina, Playfair Display + Manrope,
navy `#0b1630` / dourado `#c9a565` / creme `#f1ede6`), em todas as páginas HTML de `site-producao/` exceto
`multiasset-app.html` (mantém a marca própria "MultiAsset / Plataforma" do produto). Substituir favicon/apple-touch-icon
pelo novo monograma de 2 letras. Entregar avatar quadrado + redondo para redes sociais/WhatsApp.

## Preconditions

- `E:\Diretorio\Claude\Site\` é repositório git — permite rollback limpo por arquivo.
- Python 3.11.9 + Pillow 12.1.1 disponíveis (confirmado).
- Fonte `Georgia Bold` disponível em `C:\Windows\Fonts\georgiab.ttf` (confirmado) — usada para rasterizar os
  assets estáticos, replicando o fallback já declarado no favicon.svg atual (`'Playfair Display', Georgia, ...`).
- CSP do Worker (`cloudflare-workers/sz-sites/src/utils/headers.js`) já libera `fonts.googleapis.com`/`fonts.gstatic.com`
  — nenhuma mudança de CSP necessária para carregar Playfair Display/Manrope.
- Nenhum deploy será executado (`deploy-cloudflare.ps1` / FTP) — edição fica local até aprovação explícita separada.

## Riscos e decisões assumidas (confirmar antes de executar)

1. **Favicon já estava marcado "✅ correto em produção"** no `CLAUDE.md` do projeto (monograma "YSZ", 3 letras,
   círculo navy/dourado). Este plano troca para "YS" (2 letras) **e** troca o contorno de círculo para quadrado —
   porque o próprio mockup rotula explicitamente "quadrado para app/documentos; redondo para redes sociais/WhatsApp",
   e favicon/apple-touch-icon são contexto de "app". Isso é uma mudança visível em toda aba do navegador.
2. **Drift de design tokens pré-existente, não corrigido aqui:** `assets/sz-design.css` (usado por `index.html` +
   `ebook.html`) e o `<style>` inline de `relatorios.html` usam `--navy:#0a1428`, `--gold:#92703a`, `--bg:#eef0f4`,
   fontes Prata/Public Sans — divergente do canônico documentado no `CLAUDE.md` do projeto (`--navy:#0b1630`,
   `--gold:#8f6b34`, `--bg:#f1ede6`, Playfair Display/Manrope). O componente `.ysz-lockup` usa cores **fixas** (não
   herda `--navy`/`--gold` da página) para garantir fidelidade ao mockup independente desse drift. A correção do
   drift em si (retema completo de index/relatorios/ebook) fica **fora deste escopo** — registro como pendência
   separada ao final.
3. **`multiasset-app.html` não é tocado na marca** — usa identidade própria do produto ("MultiAsset / Plataforma"),
   distinta da consultoria. Só recebe atualização de favicon (já referenciado lá).

## Tasks

### Grupo A — Componente CSS `.ysz-lockup` (bloco idêntico, cores fixas, sem depender de var(--navy) da página)

Bloco CSS canônico (usado em todas as tasks A1–A8, sem alteração):

```css
.ysz-lockup{display:inline-flex;align-items:center;gap:14px;text-decoration:none;color:inherit}
.ysz-lockup__icon{width:40px;height:40px;flex-shrink:0;border:1px solid #0b1630;display:flex;align-items:center;
  justify-content:center;font-family:'Playfair Display',Georgia,'Times New Roman',serif;font-weight:600;
  font-size:0.95rem;color:#0b1630;letter-spacing:0.01em}
.ysz-lockup__type{display:flex;flex-direction:column;gap:2px;line-height:1.15}
.ysz-lockup__firm{font-family:'Playfair Display',Georgia,'Times New Roman',serif;font-weight:600;font-size:1.05rem;
  color:#0b1630}
.ysz-lockup__descriptor{font-family:'Manrope',sans-serif;font-size:0.6rem;font-weight:700;letter-spacing:0.22em;
  text-transform:uppercase;color:#8f6b34;margin-top:1px}
.ysz-lockup:hover .ysz-lockup__firm{color:#16233f}
.ysz-lockup--dark .ysz-lockup__icon{border-color:#c9a565;color:#f1ede6}
.ysz-lockup--dark .ysz-lockup__firm{color:#f1ede6}
.ysz-lockup--dark .ysz-lockup__descriptor{color:#c9a565}
.ysz-lockup--dark:hover .ysz-lockup__firm{color:#e4ded2}
@media (max-width:640px){
  .ysz-lockup__icon{width:34px;height:34px;font-size:0.8rem}
  .ysz-lockup__firm{font-size:0.92rem}
  .ysz-lockup__descriptor{font-size:0.54rem}
}
```

- **Task A1** — File: `E:\Diretorio\Claude\Site\site-producao\assets\sz-design.css` — Action: Edit — Append o bloco
  acima ao final do arquivo. — Verification: `Select-String '.ysz-lockup' assets\sz-design.css` retorna linhas. —
  Depends on: none.
- **Task A2** — File: `relatorios.html` — Action: Edit — Append o mesmo bloco dentro do `<style>` existente
  (antes de `</style>`, ~linha 213). — Verification: idem. — Depends on: none.
- **Task A3** — File: `multiasset.html` — Action: Edit — Append dentro do `<style>` (~linha 308). — Depends on: none.
- **Task A4** — File: `privacidade.html` — Action: Edit — Append dentro do `<style>` (~linha 84). — Depends on: none.
- **Task A5** — File: `consultoria.html` — Action: Edit — Append dentro do `<style>` (~linha 149). — Depends on: none.
- **Task A6** — File: `honorarios.html` — Action: Edit — Append dentro do `<style>` (~linha 332). — Depends on: none.
- **Task A7** — File: `assinatura.html` — Action: Edit — Append dentro do `<style>` (~linha 199). — Depends on: none.
- **Task A8** — File: `radar-roic.html` — Action: Edit — Append dentro do `<style>` (~linha 127). — Depends on: none.

`ebook.html` **não precisa** de task própria — herda de `assets/sz-design.css` (mesmo link da Task A1).

### Grupo B — Fontes Google (Playfair Display 500/600/700 + Manrope 300–800)

- **Task B1** — File: `index.html` `<head>` — Action: Edit — Adicionar `<link rel="preconnect">` (googleapis +
  gstatic) e `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&family=Playfair+Display:wght@500;600;700&display=swap">`
  (hoje só carrega Prata/Public Sans). — Verification: `Select-String 'fonts.googleapis' index.html`.
- **Task B2** — File: `relatorios.html` — mesma adição.
- **Task B3** — File: `ebook.html` — mesma adição (confirmar se já não existe antes de duplicar).
- **Task B4** — File: `consultoria.html` — adicionar só Manrope (Playfair Display já carregada).
- **Task B5** — File: `honorarios.html` — adicionar só Manrope.
- **Task B6** — File: `assinatura.html` — adicionar só Manrope.
- **Task B7** — File: `radar-roic.html` — adicionar só Manrope.

`multiasset.html` e `privacidade.html` já carregam ambas — sem task.

### Grupo C — Substituição de markup (preserva o texto existente de cada página; troca só estrutura/estilo visual)

- **Task C1** — File: `index.html` — Action: Edit — Substituir os 2 blocos `.brand-lockup` (header linha ~120,
  footer linha ~489) por `<a class="ysz-lockup" href="/" aria-label="Szuchmacher Consultoria — Yan Szuchmacher">
  <span class="ysz-lockup__icon" aria-hidden="true">YS</span><span class="ysz-lockup__type">
  <span class="ysz-lockup__firm">Szuchmacher</span><span class="ysz-lockup__descriptor">Consultoria</span>
  </span></a>` (remove o founder/rule antigos — conteúdo "Yan Szuchmacher" passa a viver só no `aria-label`,
  a menos que você prefira manter visível). — Verification: `Select-String 'ysz-lockup' index.html` retorna 2+ linhas
  E `Select-String 'brand-lockup' index.html` retorna 0.
- **Task C2** — File: `relatorios.html` — mesma substituição (header + footer).
- **Task C3** — File: `ebook.html` — mesma substituição (header + footer).
- **Task C4** — File: `multiasset.html` — Action: Edit — header (`.brand-lockup` → `.ysz-lockup`) **e** footer
  (`.footer-brand` texto puro "Szuchmacher Consultoria" → mesmo componente, versão compacta).
- **Task C5** — File: `privacidade.html` — header (confirmar footer antes de editar).
- **Task C6** — File: `consultoria.html` — `.nav-brand` → `.ysz-lockup ysz-lockup--dark`, preservando o texto
  "Szuchmacher Consultoria" / "Valores mobiliários · CVM 20/2021" como firm/descriptor.
- **Task C7** — File: `honorarios.html` — `.nav-logo`+ícone FontAwesome → `.ysz-lockup ysz-lockup--dark`,
  preservando "Szuchmacher"/"Consultoria".
- **Task C8** — File: `assinatura.html` — idem C7.
- **Task C9** — File: `radar-roic.html` — idem C7 (sem `aria-label` hoje — adicionar).

`multiasset-app.html`: **sem task** — mantém `.nav-logo` "MultiAsset / Plataforma" intocado.

### Grupo D — Favicon e assets estáticos (gerados localmente, sem download externo)

- **Task D1** — File: `scratchpad/gen_ysz_icons.py` (novo) — Action: Create — Script Pillow que desenha, a 1024×1024:
  (a) quadrado navy `#0b1630` + moldura interna 1px-proporcional dourado `#c9a565` + "YS" centralizado em
  Georgia Bold creme `#f1ede6`; (b) mesma composição em máscara circular. Salva `square_master.png` e
  `round_master.png` em scratchpad. — Verification: `python scratchpad/gen_ysz_icons.py` sem exceção + arquivos
  existem.
- **Task D2** — Action: Run — A partir de `square_master.png`, gerar `favicon.ico` (16/32/48, via
  `Image.save(..., format='ICO', sizes=[(16,16),(32,32),(48,48)])`) → sobrescrever
  `site-producao\favicon.ico`. — Verification: `python -c "from PIL import Image; im=Image.open('favicon.ico'); print(im.info.get('sizes') or im.size)"`.
- **Task D3** — Action: Run — Redimensionar `square_master.png` para 180×180 (LANCZOS) → sobrescrever
  `site-producao\apple-touch-icon.png`. — Verification: `python -c "from PIL import Image; print(Image.open('apple-touch-icon.png').size)"` → `(180, 180)`.
- **Task D4** — File: `site-producao\favicon.svg` — Action: Edit — Reescrever à mão (vetor, não rasterizado):
  `viewBox 0 0 512 512`, `<rect>` navy de fundo, `<rect>` stroke dourado inset, `<text>` "YS" Playfair
  Display/Georgia/Times fallback, creme. — Verification: abrir no navegador (`file://`) e conferir visualmente.
- **Task D5** — Action: Run — Exportar `avatar-square-512.png` e `avatar-round-512.png` (deliverable, não
  referenciado em HTML) para `site-producao\assets\brand\` (pasta nova). — Verification: arquivos existem, 512×512.
- **Task D6** — File: `relatorios.html`, `honorarios.html`, `assinatura.html`, `radar-roic.html`, `consultoria.html`,
  `multiasset.html` `<head>` — Action: Edit — Adicionar as 3 tags que faltam hoje:
  `<link rel="icon" href="/favicon.ico" sizes="any">`, `<link rel="icon" href="/favicon.svg" type="image/svg+xml">`,
  `<link rel="apple-touch-icon" href="/apple-touch-icon.png">` — Verification: `Select-String 'rel="icon"'` retorna
  3 linhas por arquivo.

### Grupo E — Verificação final

- **Task E1** — Action: Verify — Abrir `index.html` no Browser pane (`file://` local, sem servidor) e capturar
  screenshot do header e footer.
- **Task E2** — Action: Verify — `Select-String 'brand-lockup|nav-logo|logo-icon|nav-brand' *.html` na raiz de
  `site-producao` deve retornar zero, exceto em `multiasset-app.html` (intencional).
- **Task E3** — Action: Verify — Conferir visualmente 1 página de cada esquema (A: index, B: multiasset, C: consultoria)
  para checar contraste do `.ysz-lockup--dark` contra o fundo real de cada uma.
- **Task E4** — Action: Verify — Rodar `scripts\build-cloudflare-public.ps1` **apenas para validar que o build não
  quebra** (não faz deploy). Reverter/ignorar a saída em `cloudflare-workers/sz-sites/public/` se for só teste.

## Rollback

Todas as mudanças são edições locais em arquivos versionados por git em `E:\Diretorio\Claude\Site\`.
Para desfazer: `git status` (revisar) → `git checkout -- <arquivo>` por arquivo, ou `git checkout -- site-producao/`
para reverter tudo de uma vez. Nenhum deploy foi feito — produção (Cloudflare Workers `sz-sites`) não é afetada até
`deploy-cloudflare.ps1` ser executado, o que **não** faz parte deste plano.

## Pendência registrada (fora de escopo, não executar agora)

Unificar os 3 esquemas de cor/fonte divergentes do site (`sz-design.css`/`relatorios.html` em Prata+Public Sans+navy
`#0a1428`; páginas dark em Playfair+DM Sans; `multiasset.html`/`privacidade.html` já no canônico) para o padrão
único documentado no `CLAUDE.md` do projeto — é um retema completo, não uma tarefa de logo. Sugestão: tratar como
item novo em `06_RISCOS_E_DIVIDAS_TECNICAS.md` ou `TASKS.md`.
