# Hero editorial — como reverter

## Modos

| Modo | Como ativar |
|------|-------------|
| **editorial** (padrão) | `SZ_HERO_VARIANT = 'editorial'` em `assets/sz-config.js` |
| **classic** | `SZ_HERO_VARIANT = 'classic'` ou `.\scripts\revert-hero.ps1` |
| Preview sem deploy | `?hero=classic` ou `?hero=editorial` na URL |

## Arquivos do experimento

- `assets/hero-editorial.css` — estilos word-wall
- `assets/hero-editorial.js` — interação arrastar
- `assets/hero-switch.js` — toggle classic/editorial
- `_arquivo/hero-classic-snapshot-2026-06-18.html` — backup HTML

## Deploy após mudança

```powershell
cd E:\Diretorio\Claude\Site\site-producao
.\scripts\build-cloudflare-public.ps1
.\scripts\deploy-cloudflare.ps1
```

## Remover completamente (opcional)

1. `revert-hero.ps1` → classic
2. Remover seção `#hero-editorial` do `index.html`
3. Remover `hidden` de `#hero-classic`
4. Apagar links para hero-*.css/js no head
5. Remover `SZ_HERO_VARIANT` de sz-config.js