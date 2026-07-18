# Design sophistication — baseline e snapshot (2026-07-18)

## Como reverter

### Opcao A — script (recomendado)
```powershell
cd E:\Diretorio\Claude\Site\site-producao
.\scripts\revert-design-sophistication.ps1
# se ja tiver deployado, rode tambem:
# .\scripts\deploy-cloudflare.ps1
```

### Opcao B — git (se o commit de sofisticação for o ultimo so desses arquivos)
```powershell
cd E:\Diretorio\Claude\Site
git log --oneline -5 -- site-producao/assets/sz-design.css
git restore --source=<commit-pai> -- site-producao/assets/sz-design.css site-producao/index.html site-producao/ebook.html site-producao/multiasset-app.html site-producao/multiasset.html site-producao/CLAUDE.md
```

### Opcao C — copiar baseline manual
Copiar de `_arquivo/design-baseline-20260718/` para os paths de producao listados no MANIFEST.json

## Como reaplicar sofisticação
```powershell
.\scripts\apply-design-sophistication.ps1
```

## Arquivos cobertos
- assets/sz-design.css
- index.html
- ebook.html
- multiasset-app.html  (multi-assets.com)
- multiasset.html
- CLAUDE.md
