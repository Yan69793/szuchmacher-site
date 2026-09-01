(function () {
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function fmtDataISO(iso) {
    if (!iso) return '';
    const [y, m, d] = String(iso).split('-');
    if (!y || !m || !d) return iso;
    return `${d}/${m}/${y}`;
  }

  function statusLabel(status) {
    const map = {
      aberto: 'Aberto',
      em_instrucao: 'Em instrução',
      decisao_pendente: 'Decisão pendente',
      resolvido: 'Resolvido',
    };
    return map[status] || esc(status);
  }

  function renderCaso(caso) {
    const cronologia = Array.isArray(caso.cronologia) ? caso.cronologia : [];
    const desfechos = Array.isArray(caso.desfechos_possiveis) ? caso.desfechos_possiveis : [];
    const prazo = caso.proximo_prazo || {};

    const cronologiaHtml = cronologia.map((ev) => `
      <li>
        <div class="mp-ev-head">
          <span class="mp-ev-title">${esc(fmtDataISO(ev.data))} — ${esc(ev.evento)}</span>
        </div>
        ${ev.fonte ? `<div class="mp-ev-src">${ev.link ? `<a href="${esc(ev.link)}" target="_blank" rel="noopener">${esc(ev.fonte)}</a>` : esc(ev.fonte)}</div>` : ''}
      </li>
    `).join('');

    const desfechosHtml = desfechos.map((d) => `<li>${esc(d)}</li>`).join('');

    return `
      <article class="situacao-card">
        <div class="mp-ev-head">
          <span class="situacao-status">${statusLabel(caso.status)}</span>
          <span class="mp-ev-title">${esc(caso.titulo)}</span>
        </div>
        <div class="mp-ev-desc">
          ${caso.orgao ? `<p><strong>Órgão:</strong> ${esc(caso.orgao)}</p>` : ''}
          ${caso.quem_decide ? `<p><strong>Quem decide:</strong> ${esc(caso.quem_decide)}</p>` : ''}
          ${prazo.data ? `<p><strong>Próximo prazo:</strong> ${esc(fmtDataISO(prazo.data))}${prazo.descricao ? ` — ${esc(prazo.descricao)}` : ''}</p>` : ''}
        </div>
        ${cronologiaHtml ? `<ul class="situacao-cronologia">${cronologiaHtml}</ul>` : ''}
        ${desfechosHtml ? `<div class="mp-ev-desc"><strong>Desfechos possíveis:</strong><ul>${desfechosHtml}</ul></div>` : ''}
      </article>
    `;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const el = document.getElementById('situacoes');
    const panel = document.getElementById('situacoesPanel');
    if (!el || !panel) return;

    try {
      const res = await fetch('/assets/regulatorio.php');
      if (!res.ok) throw new Error('Fetch error');
      const data = await res.json();

      if (!data.casos || data.casos.length === 0) {
        el.style.display = 'none';
        return;
      }

      panel.innerHTML = data.casos.map(renderCaso).join('')
        + '<p class="mp-disclaimer">Cronologia factual de fontes públicas; não constitui recomendação nem análise individualizada de valores mobiliários.</p>';
      panel.dataset.loading = '0';
      panel.dataset.state = 'ready';
      el.style.display = 'block';
    } catch (e) {
      el.style.display = 'none';
    }
  });
})();
