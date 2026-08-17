// Handler: /api/ntnb-scenarios
// Busca cotacao do ETF IB5M11 (B3: It Now IMA-B 5+) no Yahoo Finance.
//
// Historico: o handler nasceu buscando "NTNB11" (ticker de titulo do Tesouro
// Direto, nunca existiu como ETF na B3) e o fallback brapi.dev respondia 401
// sem token desde maio/2026. Auditoria de 15/08/2026 trocou a fonte para o
// IB5M11, que e o indice IMA-B 5+ negociado em bolsa, que era justamente a
// intencao declarada do codigo original ("NTNB11 busca replicar o IMA-B 5+").
//
// O spread IPCA+ segue sendo PREMISSA DE MODELO fixa (7,5%), nao derivada do
// preco: derivar yield real do preco de ETF exige VNA e duration do indice, e
// mesmo assim seria aproximacao. Enquanto isso nao existir, os cenarios sao
// calibrados, nao cotados, e o payload diz isso (campo warning).
//
// TTL de frescor 2h; a entrada em si sobrevive 12h no KV (staleTtl) pra dar
// margem de revalidacao em background antes de expirar de vez.

import { fetchJsonStrict, jsonResponse } from '../utils/http.js';
import { writeCache, readCacheOrRevalidate, staleTtl } from '../utils/cache.js';

const CACHE_KEY = 'ntnb-scenarios';
const CACHE_TTL = 7200; // 2 horas

// Valores padrao. Sao premissas de modelo, nao cotacao: qualquer numero aqui
// que passe a ser exibido como dado de mercado e regressao (ver rotulo de
// origem no front).
//
// Recalibracao 17/08/2026 contra mercado (pendencia #4 do CLAUDE.md):
// spread IPCA+ 7,5% mantido. Taxas NTN-B longas em 14/08/2026 (Valor Investe):
// IPCA+ 2040 = 7,66%, 2050 = 7,40%; curva Bianco mai/26: NTN-B 10y = 7,50%.
// O 7,5% fica no centro da faixa. O yield oficial do IMA-B 5+ (lamina ANBIMA)
// nao esta publicado em fonte acessivel; quando estiver, recalibrar de novo.
// IPCA proj 5,5% = Focus mediana 2026 (mantido).
const DEFAULTS = {
  ntnb_price: 95.0,
  ipca_spread: 0.075,  // 7,5% a.a. acima do IPCA
  ipca_proj: 0.055,    // 5,5% a.a. Focus mediana 2026
};

const WARNING_DEFAULTS =
  'Fontes de mercado indisponíveis. Cenários exibidos com premissas fixas ' +
  'calibradas em ago/2026, não com cotações ao vivo.';

async function fetchYahooImaB() {
  // Yahoo Finance v8 chart API — mesmo padrao de market-data.js
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/IB5M11.SA?interval=1d&range=5d';
  const r = await fetchJsonStrict(url, {
    timeout: 12000,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MultiAssetBot/1.0)' },
  });
  if (!r.ok) return null;

  const data = r.data;
  const result = data?.chart?.result?.[0];
  if (!result) return null;

  const meta = result.meta;
  const price = meta?.regularMarketPrice;
  if (!price || price <= 0) return null;

  // Verifica se os dados estao frescos (timestamp do ultimo candle < 2 dias uteis)
  const timestamps = result.timestamp || [];
  const lastTs = timestamps.length > 0 ? timestamps[timestamps.length - 1] : 0;
  const nowSec = Math.floor(Date.now() / 1000);
  const ageSec = nowSec - lastTs;
  const STALE_THRESHOLD = 172800; // 2 dias em segundos

  return {
    price,
    stale: ageSec > STALE_THRESHOLD,
    currency: meta.currency || 'BRL',
    exchangeName: meta.exchangeName || 'B3',
  };
}

function computeRates(ipcaSpread, ipcaProj) {
  // Taxa nominal = (1 + IPCA) * (1 + spread) - 1
  const nominalBase = (1 + ipcaProj) * (1 + ipcaSpread) - 1;

  // Cenarios: variacao no spread (IPCA projetado e o mesmo nos 3)
  // Pessimista: comprimindo premio → spread cai 2 pp
  // Base: spread de mercado
  // Otimista: premio expande → spread sobe 2 pp
  const spreadPess = Math.max(0.03, ipcaSpread - 0.02);
  const spreadOtim = Math.min(0.16, ipcaSpread + 0.02);

  const pess = Math.round(((1 + ipcaProj) * (1 + spreadPess) - 1) * 10000) / 10000;
  const base = Math.round(nominalBase * 10000) / 10000;
  const otim = Math.round(((1 + ipcaProj) * (1 + spreadOtim) - 1) * 10000) / 10000;

  return { pess, base, otim };
}

async function revalidate(env) {
  let ntnbPrice = DEFAULTS.ntnb_price;
  let ipcaSpread = DEFAULTS.ipca_spread;
  const ipcaProj = DEFAULTS.ipca_proj;
  let source = 'defaults';
  let warning = WARNING_DEFAULTS;

  const yahoo = await fetchYahooImaB();
  if (yahoo && !yahoo.stale && yahoo.price > 0) {
    ntnbPrice = yahoo.price;
    source = 'yahoo';
    warning = null;
    // spread segue a premissa de modelo; o preco vivo alimenta so o preco.
    ipcaSpread = DEFAULTS.ipca_spread;
  }

  const rates = computeRates(ipcaSpread, ipcaProj);
  const ts = Math.floor(Date.now() / 1000);

  // source e warning entram no cache junto do payload: um hit de cache NAO pode
  // devolver source 'fresh' e apagar o fato de que os numeros vieram de
  // premissas fixas. Antes deste fix o cache hit devolvia source=estado do
  // cache ('fresh'/'stale') e a origem real se perdia.
  await writeCache(env.CACHE, CACHE_KEY, {
    rates,
    ntnb_price: ntnbPrice,
    ipca_spread: ipcaSpread,
    ts,
    source,
    warning,
  }, staleTtl(CACHE_TTL));

  return {
    ok: true,
    rates,
    ntnb_price: ntnbPrice,
    ipca_spread: ipcaSpread,
    generated_at: ts,
    source,
    warning,
    stale: source === 'defaults',
  };
}

export async function handleNtnbScenarios(env, ctx) {
  const { cached, state } = await readCacheOrRevalidate(
    env.CACHE,
    CACHE_KEY,
    CACHE_TTL,
    ctx,
    () => revalidate(env)
  );

  if (cached) {
    // Payloads antigos no KV (gravados antes deste contrato) nao tem source
    // nem warning. Na pratica eram todos da era 'defaults' (NTNB11.SA nunca
    // existiu no Yahoo), entao mapear legacy para 'defaults' e mais honesto do
    // que devolver 'desconhecido' com stale:false por 12h de transicao.
    const source = cached.source ?? 'defaults';
    return jsonResponse(
      {
        ok: true,
        rates: cached.rates,
        ntnb_price: cached.ntnb_price,
        ipca_spread: cached.ipca_spread,
        generated_at: cached.ts,
        source,
        warning: cached.warning ?? null,
        stale: source === 'defaults',
        cache_state: state,
      },
      { headers: { 'Cache-Control': 'public, max-age=3600' } }
    );
  }

  return jsonResponse(await revalidate(env), {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}
