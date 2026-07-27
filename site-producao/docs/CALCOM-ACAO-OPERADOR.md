# Cal.com — acao pendente do operador (2026-07-27)

## Estado

`assets/sz-config.js` ainda tem:

```js
window.SZ_CALCOM_URL = 'https://cal.com/_PENDING/szuchmacher-diagnostico';
```

Enquanto `_PENDING` existir, `[data-sz-cal]` cai no WhatsApp (comportamento documentado).

## O que fazer

1. Criar conta em https://cal.com (username sugerido: `szuchmacher`).
2. Criar event type `szuchmacher-diagnostico` (ou o slug real).
3. Substituir em `assets/sz-config.js`:

```js
window.SZ_CALCOM_URL = 'https://cal.com/SEU_USER/SEU_EVENTO';
```

4. Publicar o site (pipeline FTP/deploy habitual da rotina de domingo).
5. Validar no DevTools: sem bloqueio CSP em `cal.com` (headers ja permitem cal.com).

## Por que nao foi preenchido automaticamente

URL real so existe apos criar a conta Cal.com. Inventar `cal.com/szuchmacher/...` sem conta quebra o CTA.
