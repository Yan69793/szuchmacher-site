import { fetchJson, jsonResponse } from '../utils/http.js';
import { readCache, writeCache } from '../utils/cache.js';
import { bcbSgs } from '../utils/market.js';

const CACHE_KEY = 'macro-panel';
const CACHE_TTL = 900; // 15 min — alinhado ao macro.php
const FOCUS_BASE =
  'https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais';

function focusAllNull(focus) {
  if (!focus || typeof focus !== 'object') return true;
  return !Object.values(focus).some((v) => v && v.mediana != null);
}

function focusCachePoisoned(payload) {
  if (!payload) return false;
  const sgsOk = payload.selic_meta != null || payload.cambio_ptax != null;
  return sgsOk && focusAllNull(payload.focus);
}

function focusUrl(indicador, anoRef) {
  const filter = `Indicador eq '${indicador}' and baseCalculo eq 0 and DataReferencia eq '${anoRef}'`;
  return (
    `${FOCUS_BASE}?$top=1` +
    `&$filter=${encodeURIComponent(filter)}` +
    `&$orderby=${encodeURIComponent('Data desc')}` +
    '&$format=json'
  );
}

function parseFocusRow(row, indicador, anoRef) {
  if (!row) return null;
  return {
    indicador,
    referencia: anoRef,
    data: row.Data?.slice(0, 10) ?? null,
    mediana: row.Mediana != null ? Number(row.Mediana) : null,
    media: row.Media != null ? Number(row.Media) : null,
    desvio_padrao: row.DesvioPadrao != null ? Number(row.DesvioPadrao) : null,
    minimo: row.Minimo != null ? Number(row.Minimo) : null,
    maximo: row.Maximo != null ? Number(row.Maximo) : null,
    respondentes: row.numeroRespondentes ?? row.NumeroRespondentes ?? null,
  };
}

async function bcbFocusAnnual(indicador, anoRef) {
  const j = await fetchJson(focusUrl(indicador, anoRef), { timeout: 12000 });
  return parseFocusRow(j?.value?.[0], indicador, anoRef);
}

export async function handleMacroPanel(env, request) {
  const url = request ? new URL(request.url) : null;
  const forceLive = url?.searchParams.has('nocache') || url?.searchParams.has('debug');

  const cache = forceLive ? null : await readCache(env.CACHE, CACHE_KEY);
  if (cache?.ts && Date.now() / 1000 - cache.ts < CACHE_TTL && !focusCachePoisoned(cache)) {
    return jsonResponse({ ...cache, served: 'cache', fresh: true }, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  }

  const anoAtual = new Date().getFullYear();
  const anoProx = anoAtual + 1;

  const [selicSgs, ptaxSgs, ipca26, ipca27, selic26, selic27, cambio26, cambio27, pib26, pib27] =
    await Promise.all([
      bcbSgs(432),
      bcbSgs(1),
      bcbFocusAnnual('IPCA', anoAtual),
      bcbFocusAnnual('IPCA', anoProx),
      bcbFocusAnnual('Selic', anoAtual),
      bcbFocusAnnual('Selic', anoProx),
      bcbFocusAnnual('Câmbio', anoAtual),
      bcbFocusAnnual('Câmbio', anoProx),
      bcbFocusAnnual('PIB Total', anoAtual),
      bcbFocusAnnual('PIB Total', anoProx),
    ]);

  const payload = {
    ts: Math.floor(Date.now() / 1000),
    source: 'BCB (SGS + Olinda Focus)',
    disclaimer:
      'Dados agregados do mercado. Medianas, mínimos e máximos do Relatório Focus refletem expectativas de analistas, não previsão própria nem recomendação.',
    selic_meta: selicSgs
      ? { data: selicSgs.data, valor: Number(String(selicSgs.valor).replace(',', '.')) }
      : null,
    cambio_ptax: ptaxSgs
      ? { data: ptaxSgs.data, valor: Number(String(ptaxSgs.valor).replace(',', '.')) }
      : null,
    focus: {
      [`ipca_${anoAtual}`]: ipca26,
      [`ipca_${anoProx}`]: ipca27,
      [`selic_${anoAtual}`]: selic26,
      [`selic_${anoProx}`]: selic27,
      [`cambio_${anoAtual}`]: cambio26,
      [`cambio_${anoProx}`]: cambio27,
      [`pib_${anoAtual}`]: pib26,
      [`pib_${anoProx}`]: pib27,
    },
    fresh: true,
    served: 'live',
  };

  if (focusAllNull(payload.focus) && cache && !focusAllNull(cache.focus)) {
    payload.focus = cache.focus;
    payload.focus_recovered = 'stale_cache';
  }

  if (!focusCachePoisoned(payload)) {
    await writeCache(env.CACHE, CACHE_KEY, payload, CACHE_TTL * 2);
  }

  return jsonResponse(payload, { headers: { 'Cache-Control': 'public, max-age=300' } });
}