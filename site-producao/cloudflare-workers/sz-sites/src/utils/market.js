import { fetchJson } from './http.js';

// Fetchers de mercado compartilhados. Antes viviam duplicados dentro de
// market-data.js, macro-api.js e macro-panel.js; o handler relatorio-prices.js
// precisava dos dois, entao viraria uma quarta copia.

// Yahoo Finance. `encodedSymbol` ja vem percent-encoded (ex: '%5EBVSP' para ^BVSP).
// Devolve { value, change_pct } ou null quando a fonte falha.
export async function fetchYahoo(encodedSymbol, timeout = 10000) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodedSymbol}?interval=1d&range=1d`;
  const j = await fetchJson(url, {
    timeout,
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (compatible; MultiAssetBot/1.0)',
    },
  });
  const meta = j?.chart?.result?.[0]?.meta;
  if (!meta) return null;
  const price = meta.regularMarketPrice != null ? Number(meta.regularMarketPrice) : null;
  const prev = meta.chartPreviousClose != null ? Number(meta.chartPreviousClose) : null;
  if (price == null || Number.isNaN(price)) return null;
  const change_pct = prev && prev > 0 ? Math.round(((price - prev) / prev) * 10000) / 100 : 0;
  return { value: Math.round(price * 100) / 100, change_pct };
}

// Banco Central, series temporais (SGS). 432 = Selic meta, 1 = PTAX venda.
// Devolve o registro bruto ({ data, valor }) ou null.
export async function bcbSgs(serie, timeout = 10000) {
  const j = await fetchJson(
    `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados/ultimos/1?formato=json`,
    { timeout },
  );
  return Array.isArray(j) && j[0] ? j[0] : null;
}

// O SGS devolve numero em formato pt-BR ("5,4321"). Number() direto vira NaN.
export function parseSgsValor(registro) {
  if (!registro || registro.valor == null) return null;
  const n = Number(String(registro.valor).replace(',', '.'));
  return Number.isNaN(n) ? null : n;
}
