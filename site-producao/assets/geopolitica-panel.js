/** Renderiza o Radar Geopolítico na home e na página completa. */
import {
  esc, safeHref, fmtDataBR, isStale, validateFull, teaserResumo,
  CHAVES_MERCADO, REGIOES,
} from './geopolitica-core.js';

const ENDPOINT = '/assets/geopolitica.php';
const PAGINA = '/geopolitica.html';
const STALE_DIAS = 10;
const RISCO_LABEL = { baixo: 'Risco baixo', moderado: 'Risco moderado', elevado: 'Risco elevado', critico: 'Risco crítico' };
const CONFIANCA_LABEL = { alta: 'Confiança alta', media: 'Confiança média', baixa: 'Confiança baixa' };
const DIRECAO_LABEL = { alta: 'Alta', baixa: 'Baixa', neutro: 'Neutro', volatil: 'Volátil' };
const DIRECAO_SETA = { alta: '↑', baixa: '↓', neutro: '→', volatil: '↕' };
const TIPO_LABEL = { primaria: 'Fonte primária / oficial', analise: 'Análise e research', mercado: 'Dados e mercado', secundaria: 'Sinal secundário', interna: 'Dado interno' };
const REGIAO_LABEL = { panorama_global: 'Panorama global', eua: 'EUA', europa: 'Europa', china_asia: 'China / Ásia', oriente_medio: 'Oriente Médio', russia_ucrania: 'Rússia / Ucrânia', energia_commodities: 'Energia e commodities', comercio_sancoes: 'Comércio e sanções', riscos_sistemicos: 'Riscos sistêmicos' };
const CHAVE_LABEL = { petroleo: 'Petróleo', inflacao: 'Inflação', juros_globais: 'Juros globais', treasury: 'Treasury', dolar: 'Dólar', ouro: 'Ouro', acoes: 'Ações', credito: 'Crédito', commodities: 'Commodities', brasil: 'Brasil', curva_di: 'Curva DI', brl: 'BRL' };

function linkFonte(f) {
  const nome = `${esc(f.veiculo)} — ${esc(f.titulo)}`;
  const href = safeHref(f.url);
  if (!href) return `<span class="geo-src-item">${nome}</span>`;
  return `<a class="geo-src-item" href="${esc(href)}" target="_blank" rel="noopener">${nome} (${esc(fmtDataBR(f.data))})</a>`;
}

function fontesLista(sources) {
  if (!Array.isArray(sources) || sources.length === 0) return '';
  return `<div class="geo-fontes">${sources.map(linkFonte).join('')}</div>`;
}

function cardTema(t) {
  return `<article class="geo-card"><div class="mp-ev-head"><span class="situacao-status geo-risco--${esc(t.nivel_risco)}">${esc(RISCO_LABEL[t.nivel_risco] || t.nivel_risco)}</span><span class="mp-ev-title">${esc(t.titulo)}</span></div><div class="geo-blocos"><p class="geo-bloco"><span class="geo-bloco-tag">Fato principal</span>${esc(t.fato)}</p><p class="geo-bloco"><span class="geo-bloco-tag">Impacto provável nos mercados</span>${esc(t.impacto_mercados)}</p><p class="geo-bloco"><span class="geo-bloco-tag">Próximo gatilho</span>${esc(t.proximo_gatilho)}</p></div><div class="geo-card-foot"><span class="geo-conf geo-conf--${esc(t.confianca)}">${esc(CONFIANCA_LABEL[t.confianca] || t.confianca)}</span>${fontesLista(t.sources)}</div></article>`;
}

function renderHome(data, section, panel) {
  panel.innerHTML = `<p class="geo-resumo geo-resumo--teaser">${esc(teaserResumo(data.executive_summary))}</p><div class="geo-cta-row"><a href="${PAGINA}" class="btn" data-ga="cta_geopolitica" data-ga-location="radar_home">Ver Radar Geopolítico</a><span class="geo-stamp">Edição ${esc(data.week.label)} · atualizada em ${esc(fmtDataBR(data.generated_at))}</span></div><p class="mp-disclaimer">Radar Geopolítico: síntese informativa de fontes públicas com leitura de impactos prováveis em mercados. Não constitui recomendação nem análise individualizada de valores mobiliários (Resolução CVM nº 19/2021). Sem probabilidades numéricas.</p>`;
  panel.dataset.loading = '0';
  panel.dataset.state = 'ready';
  section.style.display = 'block';
}

function blocoTese(t) {
  return `<article class="geo-tese"><div class="geo-tese-grid"><div class="geo-campo geo-campo--fato"><span class="geo-campo-tag">Fato</span><p>${esc(t.fato)}</p></div><div class="geo-campo"><span class="geo-campo-tag">Interpretação</span><p>${esc(t.interpretacao)}</p></div><div class="geo-campo"><span class="geo-campo-tag">Cenário-base</span><p>${esc(t.cenario_base)}</p></div><div class="geo-campo"><span class="geo-campo-tag">Risco alternativo</span><p>${esc(t.risco_alternativo)}</p></div><div class="geo-campo geo-campo--gatilhos"><span class="geo-campo-tag">Gatilhos</span><ul>${t.gatilhos.map((g) => `<li>${esc(g)}</li>`).join('')}</ul></div></div><div class="geo-card-foot"><span class="geo-conf geo-conf--${esc(t.confianca)}">${esc(CONFIANCA_LABEL[t.confianca] || t.confianca)}</span>${fontesLista(t.sources)}</div></article>`;
}

function renderRegioes(data) {
  return REGIOES.map((id) => {
    const r = data.regions[id];
    if (!r || r.material === false) return '';
    return `<section class="geo-regiao" id="geo-${esc(id)}"><h3>${esc(r.titulo || REGIAO_LABEL[id] || id)}</h3><p class="geo-regiao-resumo">${esc(r.resumo)}</p>${r.teses.map(blocoTese).join('')}</section>`;
  }).join('');
}

function renderMercados(data) {
  return CHAVES_MERCADO.map((k) => {
    const m = data.market_impacts[k];
    return `<div class="geo-merc"><div class="geo-merc-head"><span class="geo-merc-direcao geo-merc--${esc(m.direcao)}">${esc(DIRECAO_SETA[m.direcao] || '→')} ${esc(DIRECAO_LABEL[m.direcao] || m.direcao)}</span><span class="geo-merc-chave">${esc(CHAVE_LABEL[k] || k)}</span></div><p>${esc(m.comentario)}</p></div>`;
  }).join('');
}

function renderPagina(data, root) {
  const stale = isStale(data.generated_at, STALE_DIAS);
  const cenarios = data.scenarios.map((s) => `<div class="geo-cenario geo-cenario--${esc(s.tipo)}"><span class="geo-cenario-tag">${esc(s.tipo === 'base' ? 'Cenário-base' : s.tipo === 'alternativo' ? 'Risco alternativo' : 'Cauda')}</span><h3>${esc(s.titulo)}</h3><p>${esc(s.descricao)}</p>${s.implicacoes ? `<p class="geo-cenario-implic">${esc(s.implicacoes)}</p>` : ''}</div>`).join('');
  const gatilhos = data.triggers.map((t) => `<li><span class="geo-trigger-janela">${esc(t.janela)}</span><div><strong>${esc(t.evento)}</strong>${t.relevancia ? `<p>${esc(t.relevancia)}</p>` : ''}</div></li>`).join('');
  const fontes = Object.keys(TIPO_LABEL).map((tipo) => { const grupo = data.sources.filter((f) => f.tipo === tipo); return grupo.length ? `<h3 class="geo-fontes-tipo">${esc(TIPO_LABEL[tipo])}</h3><div class="geo-fontes geo-fontes--pagina">${grupo.map(linkFonte).join('')}</div>` : ''; }).join('');
  root.innerHTML = `${stale ? `<div class="geo-stale-aviso">Atenção: esta edição está desatualizada. A próxima edição semanal substitui este conteúdo.</div>` : ''}<p class="geo-edicao">Edição ${esc(data.week.label)} · atualizada em ${esc(fmtDataBR(data.generated_at))}</p><p class="geo-resumo geo-resumo--pagina">${esc(data.executive_summary)}</p><section class="geo-secao" id="geo-temas"><h2>Temas materiais da semana</h2><div class="situacoes-grid">${data.themes.map(cardTema).join('')}</div></section><section class="geo-secao" id="geo-regioes"><h2>Análise por região</h2>${renderRegioes(data)}</section><section class="geo-secao" id="geo-mercados"><h2>Impacto nos mercados</h2><p class="geo-regiao-resumo">Direção provável da leitura geopolítica da semana sobre cada variável. Direção não é recomendação.</p><div class="geo-merc-grid">${renderMercados(data)}</div></section><section class="geo-secao" id="geo-cenarios"><h2>Cenários</h2><div class="geo-cenarios-grid">${cenarios}</div><p class="geo-sem-prob">Cenários sem probabilidades numéricas: indicam direção e condicionantes, não chance de ocorrência.</p></section><section class="geo-secao" id="geo-gatilhos"><h2>Calendário de gatilhos</h2><ul class="geo-triggers">${gatilhos}</ul></section><section class="geo-secao geo-secao--fontes" id="geo-fontes"><h2>Fontes</h2><p class="geo-regiao-resumo">Registro de URL, veículo, data e tipo. Fatos materiais exigem fontes independentes, e sinais secundários não sustentam afirmações factuais sozinhos.</p>${fontes}<div class="geo-conf-box"><span class="geo-conf geo-conf--${esc(data.confidence.overall)}">Confiança geral: ${esc(CONFIANCA_LABEL[data.confidence.overall] || data.confidence.overall)}</span>${data.confidence.nota ? `<p>${esc(data.confidence.nota)}</p>` : ''}</div></section><p class="mp-disclaimer">${esc(data.disclaimer)}</p>`;
}

async function carregar() {
  const res = await fetch(ENDPOINT);
  if (!res.ok) throw new Error(`endpoint ${res.status}`);
  return res.json();
}

async function boot() {
  const secaoHome = document.getElementById('radarGeopolitico');
  const panelHome = document.getElementById('geoPanel');
  const pagina = document.getElementById('geoPage');
  if (!secaoHome && !pagina) return;
  let data;
  try { data = await carregar(); } catch {
    if (secaoHome) secaoHome.style.display = 'none';
    if (pagina) pagina.innerHTML = '<div class="geo-vazio">Edição semanal indisponível no momento. Tente novamente mais tarde.</div>';
    return;
  }
  const val = validateFull(data);
  if (!val.ok) {
    if (secaoHome) secaoHome.style.display = 'none';
    if (pagina) pagina.innerHTML = '<div class="geo-vazio">Edição indisponível: dados inconsistentes no momento.</div>';
    return;
  }
  if (secaoHome && panelHome) {
    if (isStale(data.generated_at, STALE_DIAS)) secaoHome.style.display = 'none';
    else renderHome(data, secaoHome, panelHome);
  }
  if (pagina) renderPagina(data, pagina);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
