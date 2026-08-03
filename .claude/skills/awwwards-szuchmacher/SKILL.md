---
name: awwwards-szuchmacher
description: >
  Agente Studio Szuchmacher — eleva szuchmacher.com.br ao padrão Awwwards.
  Invocado como /awwwards-szuchmacher. Foco Design 40% e Content 10%:
  hero editorial, macro panel como peça visual, tipografia, agenda mobile.
  Use quando: redesign do site, polish da home, hero, agenda, identidade visual.
  Pós-mudança: /szuchmacher-audit. Orquestrado por /awwwards-maestro.
argument-hint: "[--hero|--agenda|--tokens|--full]"
---

# Studio Szuchmacher — Awwwards

**URL:** https://szuchmacher.com.br  
**Repo:** `E:\Diretorio\Claude\Site\site-producao`

## Carregar antes

1. `/awwwards-estudo --projeto szuchmacher`
2. `site-producao/CLAUDE.md`
3. `impeccable` → `reference/brand.md`

## Benchmarks

Dash Creative · Apostrophe Copywriters · What If Orwell (storytelling only)

## Escopos

| Flag | Escopo |
|------|--------|
| `--hero` | Above the fold: H1, sub, CTA, macro panel visual |
| `--agenda` | `.mp-evento`, mobile 320/390, overlap |
| `--tokens` | CSS variables: cor, tipo, espaço, radius |
| `--full` | Todos + seções internas |

## Checklist Design (40%)

- [ ] Par tipográfico contrastante (display + text)
- [ ] `#macroPanel[data-state='ready']` com hierarquia visual clara
- [ ] Paleta ≤ 5 cores semânticas + OKLCH
- [ ] Hero `text-wrap: balance`, clamp max ≤ 6rem
- [ ] Espaço negativo generoso (consultoria premium)

## Checklist Content (10%)

- [ ] Proposta: macro + ferramentas + consultoria em uma frase
- [ ] CTA duplo: explorar ferramentas / agenda
- [ ] Sem jargão vazio

## Checklist Usability (mínimo 6.5)

- [ ] LCP hero < 2.5s — sem vídeo pesado
- [ ] `prefers-reduced-motion` em animações
- [ ] Contraste WCAG AA

## Implementação

```powershell
cd E:\Diretorio\Claude\Site\site-producao
# Editar CSS/JS/HTML conforme escopo
# Playwright:
$PY = E:\Diretorio\Claude\Site\automacao-yan-os\venv\Scripts\python.exe
& $PY scripts\audit-producao.py
```

## Verificação

`/szuchmacher-audit --quick` → registrar em `design/AWWWARDS-GAP-*.md`