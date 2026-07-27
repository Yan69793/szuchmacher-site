/* =============================================================
 * macro-panel.js — Bloco visível de antecipação macro
 *
 * Princípios:
 *   - Honestidade probabilística: mostramos mediana + intervalo
 *     (min–máx) do Focus quando disponível, nunca projeção própria.
 *   - Zero buzzword de "IA". Zero preço alvo. Zero recomendação.
 *   - Dados agregados do Banco Central (SGS + Olinda) e calendário
 *     curado a partir de fontes oficiais (BCB, IBGE, US gov, B3).
 *   - Fail-soft: se endpoint cair, o bloco não quebra o layout.
 *
 * Endpoints lidos:
 *   /assets/macro.php    → focus + selic + câmbio
 *   /assets/agenda.php   → próximos 7 dias
 * ============================================================= */

(function () {
  'use strict';

  var BRT = 'America/Sao_Paulo';

  function fmtPct(v, dec) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    return Number(v).toFixed(dec != null ? dec : 2).replace('.', ',') + '%';
  }
  function fmtNum(v, dec) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    return Number(v).toFixed(dec != null ? dec : 2).replace('.', ',');
  }
  function fmtBRL(v) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    return 'R$ ' + Number(v).toFixed(4).replace('.', ',');
  }
  function fmtDataISO(iso) {
    if (!iso) return '—';
    var s = String(iso).slice(0, 10);
    var parts = s.split('-');
    if (parts.length !== 3) return s;
    return parts[2] + '/' + parts[1] + '/' + parts[0];
  }
  function fmtDataBR(ddmmyyyy) {
    if (!ddmmyyyy) return '—';
    return String(ddmmyyyy);
  }
  function diaDaSemana(iso) {
    try {
      // Formatar o weekday em America/Sao_Paulo evita erro de fuso do getDay() local
      var parts = new Intl.DateTimeFormat('en-US', {
        timeZone: BRT, weekday: 'short'
      }).formatToParts(new Date(String(iso).slice(0, 10) + 'T12:00:00-03:00'));
      var w = '';
      parts.forEach(function (p) { if (p.type === 'weekday') w = p.value; });
      var map = { Sun: 'dom', Mon: 'seg', Tue: 'ter', Wed: 'qua', Thu: 'qui', Fri: 'sex', Sat: 'sáb' };
      return map[w] || '';
    } catch (e) { return ''; }
  }
  function fmtAgendaCelula(iso) {
    var s = String(iso || '').slice(0, 10);
    var p = s.split('-');
    // Coluna visual tem 76px: strong = só o dia (ex.: 20). Meta = weekday + DD/MM.
    if (p.length !== 3) return { dia: '—', meta: '' };
    var dataBr = p[2] + '/' + p[1];
    var meta = diaDaSemana(iso) + ', ' + dataBr;
    return { dia: p[2], meta: meta };
  }

  function rotuloJanelaAgenda(agenda) {
    var j = agenda && agenda.janela;
    if (!j || !j.inicio || !j.fim) return 'Calendário da semana';
    var hoje = hojeBrIso();
    var ini = String(j.inicio).slice(0, 10);
    var fim = String(j.fim).slice(0, 10);
    var prefixo = 'Calendário da semana';
    if (hoje >= ini && hoje <= fim) prefixo = 'Esta semana';
    else if (ini > hoje) prefixo = 'Próxima semana';
    else prefixo = 'Semana de referência';
    var a = ini.slice(8, 10) + '/' + ini.slice(5, 7);
    var b = fim.slice(8, 10) + '/' + fim.slice(5, 7);
    return prefixo + ' (' + a + ' a ' + b + ')';
  }
  function intervaloFocus(f) {
    if (!f) return '';
    var mi = f.minimo, ma = f.maximo;
    if (mi == null || ma == null) return '';
    return 'Intervalo ' + fmtPct(mi, 2) + ' – ' + fmtPct(ma, 2);
  }

  function relevanciaBadge(rel) {
    var map = {
      alta:  { label: 'Alta',  cor: '#8f6b34' },
      media: { label: 'Média', cor: '#5f6673' },
      baixa: { label: 'Baixa', cor: '#a8a29a' }
    };
    var it = map[rel] || map.media;
    return '<span class="mp-badge" style="background:' + it.cor + '">' + it.label + '</span>';
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderTicker(macro) {
    var f = macro && macro.focus ? macro.focus : {};
    var selicAtual  = macro && macro.selic_meta  ? macro.selic_meta  : null;
    var cambioPtax  = macro && macro.cambio_ptax ? macro.cambio_ptax : null;

    var cards = [
      {
        label: 'Selic (meta hoje)',
        valor: selicAtual ? fmtPct(selicAtual.valor, 2) : '—',
        ref:   selicAtual ? ('Meta vigente · ' + fmtDataBR(selicAtual.data)) : 'Aguardando BCB',
        nota:  f.selic_2026 ? ('Focus 2026: mediana ' + fmtPct(f.selic_2026.mediana, 2) + ' · ' + intervaloFocus(f.selic_2026)) : ''
      },
      {
        label: 'IPCA (expectativa 2026)',
        valor: f.ipca_2026 ? fmtPct(f.ipca_2026.mediana, 2) : '—',
        ref:   f.ipca_2026 ? ('Mediana Focus · coletado ' + fmtDataISO(f.ipca_2026.data)) : 'Aguardando Focus',
        nota:  f.ipca_2026 ? intervaloFocus(f.ipca_2026) + ' · ' + (f.ipca_2026.respondentes || '—') + ' respondentes' : ''
      },
      {
        label: 'Câmbio USD/BRL',
        valor: cambioPtax ? fmtBRL(cambioPtax.valor) : '—',
        ref:   cambioPtax ? ('PTAX · ' + fmtDataBR(cambioPtax.data)) : 'Aguardando PTAX',
        nota:  f.cambio_2026 ? ('Focus fim de 2026: mediana R$ ' + fmtNum(f.cambio_2026.mediana, 2) + ' · ' + 'Intervalo R$ ' + fmtNum(f.cambio_2026.minimo, 2) + ' – R$ ' + fmtNum(f.cambio_2026.maximo, 2)) : ''
      },
      {
        label: 'PIB (expectativa 2026)',
        valor: f.pib_2026 ? fmtPct(f.pib_2026.mediana, 2) : '—',
        ref:   f.pib_2026 ? ('Mediana Focus · coletado ' + fmtDataISO(f.pib_2026.data)) : 'Aguardando Focus',
        nota:  f.pib_2026 ? intervaloFocus(f.pib_2026) + ' · ' + (f.pib_2026.respondentes || '—') + ' respondentes' : ''
      }
    ];

    return cards.map(function (c) {
      return (
        '<article class="mp-card">' +
          '<small>' + esc(c.label) + '</small>' +
          '<strong>' + esc(c.valor) + '</strong>' +
          '<span class="mp-ref">' + esc(c.ref) + '</span>' +
          (c.nota ? '<span class="mp-nota">' + esc(c.nota) + '</span>' : '') +
        '</article>'
      );
    }).join('');
  }

  // Cadência recorrente de releases macro (fallback quando /agenda.php está vazio).
  // Não é previsão e não tem data específica, é a régua institucional do calendário oficial.
  var CADENCIA_INSTITUCIONAL = [
    { regiao: 'BR', titulo: 'Boletim Focus (BCB)',         desc: 'Mediana e dispersão das expectativas de mercado para Selic, IPCA, câmbio e PIB. Coleta semanal.', cad: 'Toda segunda-feira pela manhã', fonte: 'BCB' },
    { regiao: 'BR', titulo: 'IPCA-15 (prévia, IBGE)',      desc: 'Inflação parcial do mês corrente, base para revisão de cenário antes do IPCA cheio.',         cad: 'Entre 22 e 25 de cada mês',     fonte: 'IBGE' },
    { regiao: 'BR', titulo: 'IPCA cheio (IBGE)',           desc: 'Inflação oficial do mês de referência, indicador de meta CMN e gatilho de decisão Copom.',     cad: 'Entre 8 e 12 do mês seguinte',  fonte: 'IBGE' },
    { regiao: 'BR', titulo: 'COPOM, decisão de Selic',      desc: 'Reunião do Comitê de Política Monetária. Comunicado sai 18h após o encerramento da reunião.',  cad: '8 reuniões anuais',             fonte: 'BCB' },
    { regiao: 'BR', titulo: 'Ata do Copom',                desc: 'Detalhamento do voto e da função de reação. Em geral, terça-feira da semana seguinte ao Copom.',cad: '6 dias após cada Copom',        fonte: 'BCB' },
    { regiao: 'BR', titulo: 'Relatório Trimestral de Inflação', desc: 'Cenário do BCB, projeções e balanço de riscos. Material denso, leitura obrigatória.',        cad: 'Mar, jun, set e dez',           fonte: 'BCB' },
    { regiao: 'US', titulo: 'FOMC, decisão de juros',       desc: 'Decisão do Fed sobre a Federal Funds Rate, com SEP em quatro das oito reuniões.',              cad: '8 reuniões anuais',             fonte: 'Federal Reserve' },
    { regiao: 'US', titulo: 'NFP (Nonfarm Payrolls)',       desc: 'Criação de vagas, taxa de desemprego e ganho horário médio. Driver clássico de Treasuries e DXY.', cad: 'Primeira sexta-feira do mês',   fonte: 'BLS' },
    { regiao: 'US', titulo: 'CPI americano',                desc: 'Inflação ao consumidor e núcleo. Define o tom do FOMC seguinte e o pricing de cortes.',           cad: 'Em torno do dia 12 do mês',     fonte: 'BLS' },
    { regiao: 'US', titulo: 'Beige Book',                   desc: 'Diagnóstico qualitativo de cada distrito do Fed, leitura de atividade real antes do FOMC.',      cad: '8 vezes ao ano',                fonte: 'Federal Reserve' }
  ];

  function renderCadenciaInstitucional() {
    return [
      '<li class="mp-evento mp-vazio mp-cadencia-intro">Sem eventos críticos na janela dos próximos 7 dias. Abaixo, a régua de releases recorrentes que organizam o cenário macro.</li>'
    ].concat(CADENCIA_INSTITUCIONAL.map(function (c) {
      return (
        '<li class="mp-evento mp-evento--cadencia">' +
          '<div class="mp-evento-data">' +
            '<strong>' + esc(c.regiao) + '</strong>' +
            '<span>recorrente</span>' +
          '</div>' +
          '<div class="mp-evento-body">' +
            '<div class="mp-evento-head">' +
              '<span class="mp-regiao">' + esc(c.regiao) + '</span>' +
              '<span class="mp-hora">' + esc(c.cad) + '</span>' +
              relevanciaBadge('alta') +
            '</div>' +
            '<div class="mp-evento-title">' + esc(c.titulo) + '</div>' +
            '<div class="mp-evento-desc">' + esc(c.desc) + '</div>' +
            '<div class="mp-evento-src">Fonte: ' + esc(c.fonte) + '</div>' +
          '</div>' +
        '</li>'
      );
    })).join('');
  }

  function pad2(n) {
    n = String(n);
    return n.length < 2 ? '0' + n : n;
  }

  function parseISODate(iso) {
    var s = String(iso || '').slice(0, 10);
    var p = s.split('-');
    if (p.length !== 3) return null;
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12, 0, 0);
  }

  function toISO(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function hojeBrIso() {
    var parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: BRT, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    var y = '', m = '', d = '';
    parts.forEach(function (p) {
      if (p.type === 'year') y = p.value;
      if (p.type === 'month') m = p.value;
      if (p.type === 'day') d = p.value;
    });
    return y + '-' + m + '-' + d;
  }

  function relativoDia(iso) {
    var s = String(iso || '').slice(0, 10);
    var hoje = hojeBrIso();
    if (s === hoje) return 'hoje';
    var t = parseISODate(hoje);
    if (!t) return '';
    t.setDate(t.getDate() + 1);
    if (s === toISO(t)) return 'amanhã';
    t = parseISODate(hoje);
    t.setDate(t.getDate() - 1);
    if (s === toISO(t)) return 'ontem';
    return '';
  }

  function iterDiasUteis(inicio, fim) {
    var start = parseISODate(inicio);
    var end = parseISODate(fim);
    if (!start || !end) return [];
    var dias = [];
    var cur = new Date(start.getTime());
    while (cur.getTime() <= end.getTime()) {
      var dow = cur.getDay();
      if (dow >= 1 && dow <= 5) dias.push(toISO(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return dias;
  }

  // Feriados NYSE/Nasdaq — calendário oficial 2026 (nyse.com/markets/hours-calendars)
  var FERIADOS_US = {
    '2026-01-01': 'Ano-Novo',
    '2026-01-19': 'Martin Luther King Jr. Day',
    '2026-02-16': 'Presidents Day',
    '2026-04-03': 'Good Friday',
    '2026-05-25': 'Memorial Day',
    '2026-06-19': 'Juneteenth National Independence Day',
    '2026-07-03': 'Independence Day (observado)',
    '2026-09-07': 'Labor Day',
    '2026-11-26': 'Thanksgiving Day',
    '2026-12-25': 'Christmas Day'
  };

  function placeholderDiaSemEvento(iso) {
    var feriado = FERIADOS_US[iso];
    if (feriado) {
      return {
        data: iso,
        regiao: 'US',
        hora_brt: 'pregão fechado',
        evento: 'Feriado nos EUA — ' + feriado,
        descricao: 'Mercados americanos fechados (NYSE/Nasdaq). Divulgações do BLS, BEA e dados macro dos EUA ficam suspensas ou são antecipadas. O pregão brasileiro segue em horário regular.',
        fonte: 'NYSE',
        relevancia: 'media',
        _quiet: false
      };
    }
    return {
      data: iso,
      evento: 'Sem divulgação macro programada',
      descricao: 'Nenhum release de alta relevância (BCB, IBGE, BLS, Fed) nesta data. O dia útil segue no mercado sem dado novo na agenda curada.',
      _quiet: true
    };
  }

  function renderEventoRow(e, idx, quiet) {
    var cell = fmtAgendaCelula(e.data);
    var cls = 'mp-evento' + (quiet ? ' mp-evento--quiet' : '');
    var head = quiet
      ? '<div class="mp-evento-head"><span class="mp-hora">dia útil</span></div>'
      : (
        '<div class="mp-evento-head">' +
          '<span class="mp-regiao">' + esc(e.regiao || '') + '</span>' +
          '<span class="mp-hora">' + esc(e.hora_brt || '') + ' BRT</span>' +
          relevanciaBadge(e.relevancia) +
        '</div>'
      );
    return (
      '<li class="' + cls + '">' +
        '<div class="mp-evento-data">' +
          '<strong>' + esc(cell.dia) + '</strong>' +
          '<span class="mp-evento-meta">' + esc(cell.meta) + '</span>' +
        '</div>' +
        '<div class="mp-evento-body">' +
          head +
          '<div class="mp-evento-title">' + esc(e.evento || '') + '</div>' +
          (e.descricao ? '<div class="mp-evento-desc">' + esc(e.descricao) + '</div>' : '') +
          (!quiet && e.fonte ? '<div class="mp-evento-src">Fonte: ' + esc(e.fonte) + '</div>' : '') +
        '</div>' +
        '<span class="mp-evento-idx">' + pad2(idx) + '</span>' +
      '</li>'
    );
  }

  function renderAgenda(agenda) {
    var eventos = ((agenda && agenda.eventos) || []).slice().sort(function (a, b) {
      var byDate = String(a.data || '').localeCompare(String(b.data || ''));
      return byDate !== 0 ? byDate : String(a.hora_brt || '').localeCompare(String(b.hora_brt || ''));
    });

    var janela = agenda && agenda.janela;
    var dias = janela ? iterDiasUteis(janela.inicio, janela.fim) : [];

    if (!dias.length && !eventos.length) {
      return renderCadenciaInstitucional();
    }

    if (!dias.length) {
      return eventos.map(function (e, i) {
        return renderEventoRow(e, i + 1, false);
      }).join('');
    }

    var byData = {};
    eventos.forEach(function (e) {
      var k = String(e.data || '').slice(0, 10);
      if (!byData[k]) byData[k] = [];
      byData[k].push(e);
    });

    var html = [];
    var idx = 0;
    dias.forEach(function (dia) {
      var evts = byData[dia];
      if (evts && evts.length) {
        evts.forEach(function (e) {
          idx++;
          html.push(renderEventoRow(e, idx, false));
        });
      } else {
        idx++;
        var ph = placeholderDiaSemEvento(dia);
        html.push(renderEventoRow(ph, idx, ph._quiet !== false));
      }
    });
    return html.join('');
  }

  function renderDisclaimer(macro, agenda) {
    var parts = [];
    if (macro && macro.disclaimer)   parts.push(macro.disclaimer);
    if (agenda && agenda.meta && agenda.meta.disciplina) parts.push(agenda.meta.disciplina);
    return parts.join(' ');
  }

  function updatedStamp(macro) {
    if (!macro || !macro.ts) return '';
    var d = new Date(macro.ts * 1000);
    return d.toLocaleString('pt-BR', { timeZone: BRT, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function fetchJSON(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('status ' + r.status);
      return r.json();
    });
  }

  function mount(macro, agenda) {
    var root = document.getElementById('macroPanel');
    if (!root) return;

    var tickerEl  = root.querySelector('[data-role=ticker]');
    var agendaEl  = root.querySelector('[data-role=agenda]');
    var stampEl   = document.querySelector('[data-role=stamp]');
    var discEl    = root.querySelector('[data-role=disclaimer]');
    var titleEl   = document.getElementById('agendaTitle') || document.querySelector('[data-role=agenda-title]');

    if (tickerEl) tickerEl.innerHTML = renderTicker(macro);
    if (agendaEl) agendaEl.innerHTML = renderAgenda(agenda);
    if (titleEl)  titleEl.textContent = rotuloJanelaAgenda(agenda);
    if (stampEl)  stampEl.textContent = 'Atualizado ' + updatedStamp(macro) + (macro && macro.fresh === false ? ', cache' : '');
    if (discEl)   discEl.textContent  = renderDisclaimer(macro, agenda);

    root.removeAttribute('data-loading');
    root.setAttribute('data-state', 'ready');

    if (window.ga) {
      try { window.ga('macro_panel_view', { page: document.body.getAttribute('data-page') || 'home' }); } catch (e) {}
    }
  }

  function fallback() {
    var root = document.getElementById('macroPanel');
    if (!root) return;
    root.setAttribute('data-state', 'offline');
    root.removeAttribute('data-loading');
    var body = root.querySelector('.mp-body');
    if (body) body.innerHTML = '<div class="mp-offline">Indicadores indisponíveis neste momento. Retome a leitura em alguns minutos.</div>';
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!document.getElementById('macroPanel')) return;
    Promise.all([
      fetchJSON('/assets/macro.php').catch(function () { return null; }),
      fetchJSON('/assets/agenda.php').catch(function () { return null; })
    ]).then(function (arr) {
      var macro  = arr[0];
      var agenda = arr[1];
      if (!macro && !agenda) { fallback(); return; }
      mount(macro || {}, agenda || { eventos: [] });
    }).catch(fallback);
  });
})();
