/* sumario-artigo.js — sumário automático a partir dos H2 do artigo.
 * Compartilhado por szuchmacher.com.br (/conteudo) e multi-assets.com (/aprenda).
 * Sem dependência de token, cor ou fonte: o que varia por domínio já está no
 * CSS de cada um. Este arquivo só lê a estrutura do documento.
 *
 * Contrato de marcação, igual nos dois domínios:
 *   <article data-sumario-fonte> ... <h2>Pergunta</h2> ... </article>
 *   <nav id="sumario" aria-label="Sumário do artigo" hidden>
 *     <span class="eyebrow">Nesta página</span>
 *     <ol data-sumario-lista></ol>
 *   </nav>
 *
 * Sem JS, o <nav> continua com o atributo hidden e a página segue inteira e
 * legível, mesmo princípio do .reveal do sistema: nada de essencial some
 * quando o script falha em carregar.
 */
(function () {
  'use strict';

  // Marcas de acento isoladas pelo normalize('NFD'). Construido por codigo
  // de caractere (0x0300 a 0x036f), nao por literal, para nao depender de
  // nenhum pipeline preservar um caractere combinante intacto no arquivo-fonte.
  var DIACRITICOS = new RegExp(
    '[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']',
    'g'
  );

  function slugify(texto) {
    return texto
      .normalize('NFD')
      .replace(DIACRITICOS, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function idUnico(base, usados) {
    var candidato = base || 'secao';
    var i = 2;
    while (usados[candidato]) {
      candidato = base + '-' + i;
      i += 1;
    }
    usados[candidato] = true;
    return candidato;
  }

  function montarSumario() {
    var fonte = document.querySelector('[data-sumario-fonte]');
    var nav = document.getElementById('sumario');
    if (!fonte || !nav) return;

    var lista = nav.querySelector('[data-sumario-lista]');
    if (!lista) return;

    var titulos = fonte.querySelectorAll('h2');
    if (!titulos.length) return;

    var usados = {};
    var fragmento = document.createDocumentFragment();

    titulos.forEach(function (h2) {
      if (!h2.id) {
        h2.id = idUnico(slugify(h2.textContent), usados);
      } else {
        usados[h2.id] = true;
      }

      var item = document.createElement('li');
      var link = document.createElement('a');
      link.href = '#' + h2.id;
      link.textContent = h2.textContent;
      item.appendChild(link);
      fragmento.appendChild(item);
    });

    lista.appendChild(fragmento);
    nav.hidden = false;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', montarSumario);
  } else {
    montarSumario();
  }
})();
