# Prompt de primeiro comando — Claude Code

Como usar. Abra o Claude Code dentro da pasta `SITE YAN SZUCHMACHER`. O Claude Code lê o `CLAUDE.md` automaticamente. Depois cole o bloco abaixo como primeira mensagem.

O texto abaixo é o que você cola. Está pronto, é só copiar.

---

## COLE A PARTIR DAQUI

Você é o dev front-end responsável pelo site szuchmacher.com.br. Leia o `CLAUDE.md` desta pasta inteiro antes de qualquer ação, ele tem o mapa do sistema, o design system e o protocolo obrigatório. Leia também `diagnosticos/DIAGNOSTICO-2026-05-30.md`, o estado de produção já foi levantado com evidência e número de linha, não preciso que você redescubra, preciso que você confirme e corrija.

Regra inegociável deste projeto. Proibido tentativa e erro. Diagnóstico completo antes de executar, um único teste em produção só para confirmar. Sem tempo medido, status HTTP e comparação com o esperado, a tarefa está incompleta.

Antes de tocar em qualquer arquivo, me devolva um plano nesta ordem.

1. Releia os 4 problemas do diagnóstico (2 P1, 1 P2, 1 P3) e confirme em uma linha cada que o ponto ainda procede, citando arquivo e linha. Não rode 10 testes, use os arquivos locais que são cópia fiel de produção (confirmado por sha256 contra a baseline).

2. Para o P1 da análise macro, NÃO escolha sozinho. Os dois endpoints falam línguas diferentes, está explicado no CLAUDE.md. Me apresente as 3 opções abaixo com prós e contras e PARE para eu decidir.

   Opção A, criar no servidor um novo endpoint que devolva a narrativa no formato que `renderMacro(d)` espera (eyebrow, alert_title, beneficiados, cenarios_brent, etc), alimentado pelos números do BCB/Focus mais um texto curado. Não depende de LLM nem de saldo OpenRouter. É a mais robusta. Exige escrever um PHP novo no HostGator, fora deste repo de HTML.

   Opção B, consertar o `macro_api.php` atual configurando a `OPENROUTER_KEY` no ambiente do servidor. Mantém a geração por LLM. Eu, Claude Code, não tenho acesso ao servidor, então você me entrega o passo a passo exato (onde colocar a env no cPanel/HostGator, como validar) e eu executo. Risco recorrente, se acabar saldo ou a chave expirar, congela de novo.

   Opção C, paliativo, só atualizar o texto estático de março para um cenário atual de maio/2026 direto no HTML (linhas 2356 e 2372 e o bloco de cenários). Rápido, mas volta a congelar no próximo mês. Serve como tampão enquanto A ou B não saem.

3. Para o P1 do CSP, o header vem do Apache, não do HTML. Você não vai conseguir corrigir editando .html. Me entregue o trecho exato de `.htaccess` que adiciona `https://cdnjs.cloudflare.com` ao `style-src`, preservando todo o resto da política atual que está no diagnóstico, e o passo de como subir e validar. Eu aplico no servidor.

4. Para o P2 overflow mobile e o P3 APIs mortas, esses sim são edição de HTML/CSS/JS no `multiasset-app.html`. Para cada um, antes de editar, me diga a causa raiz exata (qual seletor/elemento estoura os 390px, quais linhas das chamadas brasilapi/brapi vão sair ou virar fallback direto) e só então edite.

Formato de entrega para cada correção que envolver arquivo. Arquivo completo, nunca diff parcial. Comentário HTML marcando o que mudou. Resumo no fim, valor antigo, valor novo, impacto colateral possível, e como validar em produção com um teste só. Preserve o design system, qualquer desvio de cor ou fonte é erro crítico.

Não suba nada para produção sozinho. Você edita local e me entrega o arquivo e o procedimento de deploy. Quem sobe por FTP e dá Purge no Cloudflare sou eu.

Comece pelo passo 1, o plano. Não edite nada ainda.

## FIM DO QUE VOCÊ COLA

---

## Notas para você, Yan (não cole isto)

Por que o prompt manda parar antes de editar. Os dois P1 dependem de decisão sua ou de acesso ao servidor que o Claude Code não tem. Deixar ele "resolver tudo" ia gerar uma migração que quebra a seção macro em silêncio, porque os formatos JSON não batem. O prompt força o plano primeiro, exatamente como teu protocolo exige.

O que cada arquivo desta pasta faz.

- `CLAUDE.md`, lido automaticamente pelo Claude Code, é a memória do projeto.
- `diagnosticos/DIAGNOSTICO-2026-05-30.md`, o estado de produção com evidência, para ele confirmar em vez de redescobrir.
- `_baseline-producao-2026-05-30/`, o que estava no ar em 30/05, para diff. Não editar.
- `index.html`, `relatorios.html`, `privacidade.html`, `multiasset.html`, `multiasset-app.html`, cópias fiéis de produção (sha256 confere), base de edição.

Sequência sugerida. Comece pela Opção C do macro (tampão de 5 minutos) mais o CSP (.htaccess), que juntos resolvem o que o visitante vê de imediato. A Opção A é o conserto definitivo do macro, faça quando tiver tempo. Overflow mobile e APIs mortas são higiene, podem vir depois.
