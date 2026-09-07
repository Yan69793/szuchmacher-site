/**
 * geopolitica-core.js — funções puras do Radar Geopolítico (sem DOM).
 *
 * Módulo ES para que o MESMO código rode no browser (geopolitica-panel.js)
 * e na suíte de testes do Worker (tests/geopolitica.test.mjs importa este
 * arquivo direto do source). Nada aqui pode tocar document/window.
 *
 * Princípios herdados do regulatorio-panel.js / xss-guard.test.mjs:
 * - Toda string que vem do JSON passa por esc() antes de entrar em innerHTML.
 * - URL só entra em href se for http(s); javascript:/data:/vbscript: viram null.
 * - Sem probabilidades numéricas: o schema nem tem campo para isso.
 */

export const SCHEMA_VERSION = 1;

export const NIVEIS_RISCO = ['baixo', 'moderado', 'elevado', 'critico'];
export const CONFIANCAS = ['alta', 'media', 'baixa'];
export const DIRECOES = ['alta', 'baixa', 'neutro', 'volatil'];
export const TIPOS_FONTE = ['primaria', 'analise', 'mercado', 'secundaria', 'interna'];

// Regiões obrigatórias do schema v1. russia_ucrania entra só quando material;
// o campo `material` da região decide se o painel a exibe.
export const REGIOES = [
  'panorama_global', 'eua', 'europa', 'china_asia', 'oriente_medio',
  'russia_ucrania', 'energia_commodities', 'comercio_sancoes', 'riscos_sistemicos',
];

// Chaves de impacto obrigatórias (o brief exige relacionar os eventos a estas
// variáveis de mercado — petróleo a BRL).
export const CHAVES_MERCADO = [
  'petroleo', 'inflacao', 'juros_globais', 'treasury', 'dolar', 'ouro',
  'acoes', 'credito', 'commodities', 'brasil', 'curva_di', 'brl',
];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function safeHref(url) {
  return /^https?:\/\//i.test(String(url || '')) ? String(url) : null;
}

export function fmtDataBR(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  if (!y || !m || !d) return String(iso);
  return `${d}/${m}/${y}`;
}

// Dados de X dias atrás. Stale nunca some o conteúdo: na home o painel inteiro
// é ocultado (mesmo contrato do regulatório), na página completa um aviso
// amarelo entra no topo e o conteúdo permanece.
export function idadeDias(generatedAt) {
  const t = Date.parse(generatedAt);
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return (Date.now() - t) / 86400000;
}

export function isStale(generatedAt, maxDias = 10) {
  return idadeDias(generatedAt) > maxDias;
}

const STR = (v) => typeof v === 'string' && v.trim().length > 0;
const ARR = (v) => Array.isArray(v);
const OBJ = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

function fonteOk(f) {
  return OBJ(f)
    && safeHref(f.url) !== null
    && STR(f.titulo)
    && STR(f.veiculo)
    && TIPOS_FONTE.includes(f.tipo);
}

/**
 * Valida o schema v1 do geopolitica-data.json. Retorna { ok, erros[] }.
 * Usada por: (1) o agente antes de publicar, (2) o teste do Worker,
 * (3) o painel no browser antes de renderizar (falha fechada: schema ruim
 * não renderiza, em vez de renderizar lixo).
 */
export function validateSchema(data) {
  const erros = [];
  if (!OBJ(data)) return { ok: false, erros: ['raiz não é objeto'] };

  if (data.schema_version !== SCHEMA_VERSION) erros.push(`schema_version deve ser ${SCHEMA_VERSION}`);
  if (Number.isNaN(Date.parse(data.generated_at))) erros.push('generated_at não é data ISO válida');

  const week = data.week;
  if (!OBJ(week) || !/^(\d{4})-W(\d{2})$/.test(String(week.iso || ''))) erros.push('week.iso fora do formato 2026-W38');
  else if (!STR(week.start) || !STR(week.end) || !STR(week.label)) erros.push('week precisa de start, end e label');

  if (!STR(data.executive_summary)) erros.push('executive_summary vazio');
  if (!STR(data.disclaimer)) erros.push('disclaimer vazio');

  if (!OBJ(data.confidence) || !CONFIANCAS.includes(data.confidence.overall)) {
    erros.push('confidence.overall fora do enum');
  }

  // themes: 4 a 6, com o contrato da home
  const themes = data.themes;
  if (!ARR(themes) || themes.length < 4 || themes.length > 6) {
    erros.push('themes deve ter entre 4 e 6 itens');
  } else {
    themes.forEach((t, i) => {
      const p = `themes[${i}]`;
      if (!STR(t.id)) erros.push(`${p}.id vazio`);
      if (!STR(t.titulo)) erros.push(`${p}.titulo vazio`);
      if (!STR(t.fato)) erros.push(`${p}.fato vazio`);
      if (!STR(t.impacto_mercados)) erros.push(`${p}.impacto_mercados vazio`);
      if (!STR(t.proximo_gatilho)) erros.push(`${p}.proximo_gatilho vazio`);
      if (!NIVEIS_RISCO.includes(t.nivel_risco)) erros.push(`${p}.nivel_risco fora do enum`);
      if (!CONFIANCAS.includes(t.confianca)) erros.push(`${p}.confianca fora do enum`);
      if (!ARR(t.sources) || !t.sources.every(fonteOk)) erros.push(`${p}.sources com fonte inválida`);
    });
  }
  return { ok: erros.length === 0, erros: erros.slice(0, 20) };
}

// Parte 2 do validador: regions, market_impacts, scenarios, triggers, sources.
// Mantida em função separada porque a validação completa é longa; validateFull
// chama validateSchema (contrato da home) e acrescenta o contrato da página.
export function validateFull(data) {
  const base = validateSchema(data);
  const erros = [...base.erros];
  if (!base.ok && erros.length >= 20) {
    // Contrato da home já estourou o teto: a página não conserta isso.
    return { ok: false, erros };
  }

  if (OBJ(data) && OBJ(data.regions)) {
    REGIOES.forEach((id) => {
      const r = data.regions[id];
      if (!OBJ(r)) { erros.push(`regions.${id} ausente`); return; }
      if (!STR(r.resumo)) erros.push(`regions.${id}.resumo vazio`);
      if (!ARR(r.teses) || r.teses.length === 0) { erros.push(`regions.${id}.teses vazias`); return; }
      r.teses.forEach((t, i) => {
        const p = `regions.${id}.teses[${i}]`;
        if (!STR(t.fato)) erros.push(`${p}.fato vazio`);
        if (!STR(t.interpretacao)) erros.push(`${p}.interpretacao vazio`);
        if (!STR(t.cenario_base)) erros.push(`${p}.cenario_base vazio`);
        if (!STR(t.risco_alternativo)) erros.push(`${p}.risco_alternativo vazio`);
        if (!ARR(t.gatilhos) || t.gatilhos.length === 0) erros.push(`${p}.gatilhos vazio`);
        if (!CONFIANCAS.includes(t.confianca)) erros.push(`${p}.confianca fora do enum`);
        if (!ARR(t.sources) || !t.sources.every(fonteOk)) erros.push(`${p}.sources com fonte inválida`);
      });
    });
  }

  if (OBJ(data) && OBJ(data.market_impacts)) {
    CHAVES_MERCADO.forEach((k) => {
      const m = data.market_impacts[k];
      if (!OBJ(m)) { erros.push(`market_impacts.${k} ausente`); return; }
      if (!DIRECOES.includes(m.direcao)) erros.push(`market_impacts.${k}.direcao fora do enum`);
      if (!STR(m.comentario)) erros.push(`market_impacts.${k}.comentario vazio`);
    });
  }

  if (OBJ(data)) {
    if (!ARR(data.scenarios) || data.scenarios.length === 0) erros.push('scenarios vazio');
    else (data.scenarios || []).forEach((s, i) => {
      if (!STR(s.titulo)) erros.push(`scenarios[${i}].titulo vazio`);
      if (!['base', 'alternativo', 'cauda'].includes(s.tipo)) erros.push(`scenarios[${i}].tipo fora do enum`);
      if (!STR(s.descricao)) erros.push(`scenarios[${i}].descricao vazio`);
      if (s.probabilidade != null) erros.push(`scenarios[${i}].probabilidade deve ser null (sem probabilidades falsas)`);
    });

    if (!ARR(data.triggers) || data.triggers.length === 0) erros.push('triggers vazio');
    else (data.triggers || []).forEach((t, i) => {
      if (!STR(t.evento)) erros.push(`triggers[${i}].evento vazio`);
      if (!STR(t.janela)) erros.push(`triggers[${i}].janela vazio`);
    });

    // fontes: mínimo global, todas https com metadados
    const sources = data.sources;
    if (!ARR(sources) || sources.length < 8) {
      erros.push('sources deve ter pelo menos 8 registros');
    } else if (!sources.every(fonteOk)) {
      erros.push('sources com registro inválido (url https?, titulo, veiculo, tipo)');
    }
  }

  return { ok: erros.length === 0, erros: erros.slice(0, 40) };
}

