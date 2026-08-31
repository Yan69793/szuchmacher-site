
  /* ── Carregamento dinâmico do relatório ──────────────────────────────────────
   * Busca /relatorio_cache.json (gerado pelo cron_relatorio.php às 19:00 BRT)
   * e popula os elementos marcados com id="rel*" e id="card*".
   * Em caso de falha, o conteúdo estático do HTML permanece visível.
   * ────────────────────────────────────────────────────────────────────────── */
  (function () {
    'use strict';

    /* O gerador grava o texto ja escapado em HTML no relatorio_cache.json
       ("S&amp;P 500"). Como aqui o destino e textContent, que espera texto cru,
       o "&amp;" aparecia literal na tela. Decodifica por mapa explicito, nao por
       innerHTML, para nao abrir caminho de injecao. A correcao definitiva e no
       gerador, que nao deveria escapar. */
    var ENTIDADES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

    function decodificar(txt) {
      if (typeof txt !== 'string') return txt;
      return txt.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, function (m) { return ENTIDADES[m] || m; });
    }

    function setText(id, value) {
      if (!value) return;
      var el = document.getElementById(id);
      if (el) el.textContent = decodificar(value);
    }

    function setHTML(id, html) {
      if (!html) return;
      var el = document.getElementById(id);
      if (el) el.innerHTML = html;
    }

    function setCard(id, value, label) {
      var card = document.getElementById(id);
      if (!card) return;
      var strong = card.querySelector('strong');
      var span   = card.querySelector('span');
      if (strong && value) strong.textContent = decodificar(value);
      if (span   && label) span.textContent   = decodificar(label);
    }

    function applyReport(data) {
      setText('relDateMain', data.date_label);
      setText('relEyebrow',  data.eyebrow);
      setText('relH2',       data.h2);

      var r = data.report || {};
      setText('relHeadline', r.headline);
      setText('relPara1',    r.paragraph1);
      setText('relPara2',    r.paragraph2);
      setText('relPara3',    r.paragraph3);

      if (r.what_could_go_wrong) {
        setHTML('relSubnoteErrar',
          '<strong>O que poderia nos fazer errar.</strong> ' + r.what_could_go_wrong);
      }
      if (r.next_week) {
        setHTML('relSubnoteProxSemana',
          '<strong>Na próxima semana.</strong> ' + r.next_week);
      }
      setText('relSubnoteFonte', r.source_note);

      var p = data.prices || {};
      if (p.ibovespa && p.ibovespa.value)
        setCard('cardIbovespa', p.ibovespa.value, p.ibovespa.label);
      if (p.usd_brl && p.usd_brl.value)
        setCard('cardDolar', 'R$ ' + p.usd_brl.value, p.usd_brl.label);
      if (p.sp500 && p.sp500.value)
        setCard('cardSP500', p.sp500.value, p.sp500.label);
      if (p.wti && p.wti.value)
        setCard('cardWTI', 'US$ ' + p.wti.value, p.wti.label);
    }

    function fmtBR(num, dec) {
      return num.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    }

    function fetchLiveMarketPrices() {
      fetch('/relatorio-prices.php', { cache: 'no-store' })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function (d) {
          if (!d.ok) return;
          // stale é array de ativos defasados, array vazio é truthy: comparar
          // por comprimento. O rótulo é por card, não da página: um WTI
          // defasado não pode marcar Ibovespa fresco como defasado.
          // source_state 'stale'/'stale-cache' indica cache vencido servido
          // durante a revalidacao: dado velho sem flag ainda nao é cotação
          // do minuto.
          var defasados = Array.isArray(d.stale) ? d.stale : [];
          var cacheVelho = d.source_state === 'stale' || d.source_state === 'stale-cache';
          function rotuloDe(chave) {
            return (defasados.indexOf(chave) !== -1 || cacheVelho) ? 'Cotação defasada' : 'Cotação atual';
          }
          if (d.ibovespa) setCard('cardIbovespa', fmtBR(d.ibovespa, 0),          rotuloDe('ibovespa'));
          if (d.usd_brl)  setCard('cardDolar',    'R$ '  + fmtBR(d.usd_brl, 4), rotuloDe('usd_brl'));
          if (d.sp500)    setCard('cardSP500',     fmtBR(d.sp500, 2),             rotuloDe('sp500'));
          if (d.wti)      setCard('cardWTI',       'US$ ' + fmtBR(d.wti, 2),     rotuloDe('wti'));
        })
        .catch(function () { /* silencioso — fallback JSON permanece */ });
    }

    document.addEventListener('DOMContentLoaded', function () {
      fetch('/relatorio_cache.json?v=' + Date.now(), { cache: 'no-store' })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(applyReport)
        .then(function () { fetchLiveMarketPrices(); })
        .catch(function (err) {
          console.warn('[Relatorio] Usando conteudo estatico:', err.message);
        });
    });
  }());
  
