import { fetchJson, jsonResponse } from '../utils/http.js';
import { readCache, writeCache } from '../utils/cache.js';

const CACHE_KEY = 'macro-panel';
const CACHE_TTL = 900; // 15 min — alinhado ao macro.php
const FOCUS_BASE =
  'https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais';

// KPIs que vem do SGS do BCB, um fetch independente cada. Sao os numeros
// grandes do painel: sem eles a home mostra travessao.
const SGS_FIELDS = ['selic_meta', 'cambio_ptax'];

function focusAllNull(focus) {
  if (!focus || typeof focus !== 'object') return true;
  return !Object.values(focus).some((v) => v && v.mediana != null);
}

function sgsFaltando(payload) {
  if (!payload) return SGS_FIELDS.slice();
  return SGS_FIELDS.filter((k) => payload[k] == null);
}

// Um payload so pode ser gravado, ou servido do cache, com todos os KPIs
// preenchidos. A checagem anterior era:
//
//   const sgsOk = payload.selic_meta != null || payload.cambio_ptax != null;
//   return sgsOk && focusAllNull(payload.focus);
//
// e tinha dois furos. O `||` deixava um payload meio quebrado passar por sao:
// com o cambio presente e a Selic nula nada era considerado envenenado, o
// payload ia para o KV por CACHE_TTL*2 e voltava com `fresh: true`. Em
// 26/07/2026 a home exibiu "SELIC (META HOJE), Aguardando BCB" enquanto
// api.bcb.gov.br/dados/serie/bcdata.sgs.432 respondia 200 com 14.25, ou seja,
// uma unica falha transitoria de bcbSgs(432) apagava o KPI da home por ate 30
// minutos e se repunha a cada ciclo. O `&&` era o segundo furo: payload com
// tudo nulo nao contava como envenenado e podia ser gravado.
function cachePoisoned(payload) {
  if (!payload) return false;
  return sgsFaltando(payload).length > 0 || focusAllNull(payload.focus);
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

async function bcbSgs(serie) {
  const j = await fetchJson(
    `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados/ultimos/1?formato=json`,
    { timeout: 10000 },
  );
  return Array.isArray(j) && j[0] ? j[0] : null;
}

async function bcbFocusAnnual(indicador, anoRef) {
  const j = await fetchJson(focusUrl(indicador, anoRef), { timeout: 12000 });
  return parseFocusRow(j?.value?.[0], indicador, anoRef);
}

export async function handleMacroPanel(env, request) {
  const url = request ? new URL(request.url) : null;
  const forceLive = url?.searchParams.has('nocache') || url?.searchParams.has('debug');

  const cache = forceLive ? null : await readCache(env.CACHE, CACHE_KEY);
  if (cache?.ts && Date.now() / 1000 - cache.ts < CACHE_TTL && !cachePoisoned(cache)) {
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

  // Recuperacao campo a campo a partir do ultimo cache bom. As chamadas ao BCB
  // sao independentes, entao uma falhar nao pode zerar o KPI correspondente na
  // home. O valor recuperado carrega a propria data (`selic_meta.data`,
  // `cambio_ptax.data`), que o painel ja exibe, entao o usuario ve de quando e.
  const recuperado = [];

  if (focusAllNull(payload.focus) && cache && !focusAllNull(cache.focus)) {
    payload.focus = cache.focus;
    payload.focus_recovered = 'stale_cache';
    recuperado.push('focus');
  }

  for (const campo of SGS_FIELDS) {
    if (payload[campo] == null && cache && cache[campo] != null) {
      payload[campo] = cache[campo];
      recuperado.push(campo);
    }
  }

  if (recuperado.length > 0) {
    payload.recuperado = recuperado;
    // assets/macro-panel.js:388 le `fresh === false` e escreve ", cache" ao
    // lado do carimbo de atualizacao.
    payload.fresh = false;
  }

  // So vai para o cache o que veio integro da fonte. Payload remendado com
  // valor antigo nao e gravado de proposito: se fosse, cada ciclo de falha
  // regravaria o mesmo dado velho renovando o TTL, e o valor sobreviveria
  // indefinidamente sem ninguem perceber. Assim a ponte sobre uma falha
  // transitoria dura no maximo o TTL do ultimo write bom, e uma queda longa do
  // BCB volta a aparecer na home em vez de ficar escondida atras de cache.
  if (!cachePoisoned(payload) && recuperado.length === 0) {
    await writeCache(env.CACHE, CACHE_KEY, payload, CACHE_TTL * 2);
  }

  return jsonResponse(payload, { headers: { 'Cache-Control': 'public, max-age=300' } });
}