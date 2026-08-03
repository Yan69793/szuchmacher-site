# Subconjunto para e-mail

Cliente de e-mail não carrega CSS externo, não carrega webfont e ignora boa parte
de flex e grid. O Outlook para Windows renderiza com o motor do Word. Nada do
`sz-base.css` funciona ali.

Este é o subconjunto que preserva a identidade dentro dessas restrições. Usado no
Fechamento de Mercado via Resend e em qualquer disparo da casa.

## Regras

Estilo sempre inline no atributo `style`. Nada de `<style>` no `<head>`, que o
Gmail descarta em parte e o Outlook trata de forma imprevisível.

Layout em `<table>` com `role="presentation"`, `cellpadding="0"`, `cellspacing="0"`
e `border="0"`. Largura fixa de 600px, centralizada por tabela externa.

Sem webfont. As substituições preservam a intenção:

| Papel | Web | E-mail |
|---|---|---|
| Display | Prata | `Georgia, 'Times New Roman', serif` |
| Corpo | Public Sans | `Helvetica, Arial, sans-serif` |
| Dado | JetBrains Mono | `Consolas, 'Courier New', monospace` |

Georgia é a única serifa com boa cobertura em Windows, macOS e Android, e tem
número de altura variável, o que aproxima o caráter editorial de Prata.

O fio de cabelo vira `border-bottom: 1px solid #dcd8d0` numa `<td>`. Não use
`<hr>`, que cada cliente estiliza de um jeito.

Sem `border-radius` (já é a regra da casa, e o Outlook ignoraria).
Sem `box-shadow`, sem gradiente, sem SVG inline, sem `background-image`.

Ícone, quando indispensável, é PNG hospedado com `alt` preenchido, nunca SVG.

## Paleta travada

Apenas o tema papel, em hexadecimal literal. Variável CSS não funciona em
e-mail.

```
fundo externo     #ebe7e0
fundo do corpo    #f3f1ec
superfície        #f8f6f2
texto             #161c28
secundário        #5c6574
acento            #8c6b3a
fio               #dcd8d0
fundo invertido   #0c1524
texto invertido   #ede9e1
```

## Blocos prontos

### Rótulo

```html
<td style="font-family:Consolas,'Courier New',monospace;font-size:11px;
           letter-spacing:2px;text-transform:uppercase;color:#8c6b3a;
           padding-bottom:12px;">
  FECHAMENTO DE MERCADO
</td>
```

### Título

```html
<td style="font-family:Georgia,'Times New Roman',serif;font-size:26px;
           line-height:32px;color:#161c28;font-weight:normal;
           padding-bottom:16px;">
  O que moveu o mercado hoje
</td>
```

Peso `normal` é obrigatório. Georgia em bold quebra a proporção que Prata em 400
estabelece na web.

### Corpo

```html
<td style="font-family:Helvetica,Arial,sans-serif;font-size:15px;
           line-height:24px;color:#5c6574;padding-bottom:18px;">
  Texto corrido.
</td>
```

### Fio de separação

```html
<td style="border-bottom:1px solid #dcd8d0;font-size:0;line-height:0;
           height:1px;">&nbsp;</td>
```

O `font-size:0` com `line-height:0` evita que o Outlook engorde a linha.

### Métrica

```html
<td style="font-family:Georgia,'Times New Roman',serif;font-size:28px;
           line-height:30px;color:#161c28;padding-bottom:6px;">99,9%</td>
<td style="font-family:Consolas,'Courier New',monospace;font-size:10px;
           letter-spacing:1.6px;text-transform:uppercase;color:#5c6574;">
  DISPONIBILIDADE
</td>
```

### Botão

Sem `border-radius`, com padding na âncora e cor de fundo na `<td>`, que é o
padrão que sobrevive ao Outlook.

```html
<td bgcolor="#0c1524" style="padding:0;">
  <a href="#" style="display:inline-block;padding:14px 26px;
     font-family:Consolas,'Courier New',monospace;font-size:11px;
     letter-spacing:1.8px;text-transform:uppercase;color:#ede9e1;
     text-decoration:none;">LER O RELATÓRIO</a>
</td>
```

## Conferência antes de disparar

- Renderizado em Gmail web, Gmail Android, Outlook Windows e Apple Mail.
- Legível com imagem bloqueada, que é o padrão de muitos clientes.
- Versão texto puro preenchida, não gerada automaticamente do HTML.
- Contraste do secundário `#5c6574` sobre `#f3f1ec` conferido.
- Nenhuma referência a CSS externo, webfont ou SVG.
- Largura fixa de 600px, sem rolagem horizontal no celular.

## PDF é outra história

PDF gerado a partir de HTML, como os relatórios de verificação de carteiras e as
propostas, roda o sistema completo. Use `sz-tokens.css` e `sz-base.css` sem
adaptação, com `tema-papel`, e apenas troque a webfont por arquivo local se o
gerador não tiver acesso à rede.
