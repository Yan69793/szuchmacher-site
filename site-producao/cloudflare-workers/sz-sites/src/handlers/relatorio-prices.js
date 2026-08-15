import { fetchJson, jsonResponse, brtNow } from '../utils/http.js';
import { readCache, writeCache, readCacheOrRevalidate, staleTtl } from '../utils/cache.js';

// Port do endpoint legado /relatorio-prices.php para o Worker sz-sites.
// O PHP existia na origem HostGator mas nunca ganhou rota no Worker, entao o
// fetch de relatorios.html batia em 404 desde a migracao de 17/06/2026 e os
// cards de cotacao ficavam congelados no valor do relatorio_cache.json.
// Contrato preservado: { ok, usd_brl, ibovespa, sp500, wti, stale, generated_at }.
const CACHE_KEY = 'relatorio-prices';
const CACHE_TTL = 900;

// Sementes: ultimo valor conhecido (atualizado 14/06/2026, herdadas do PHP)
export const SEED = {
  usd_brl: 5.0626,
  ibovespa: 171132.0,
  sp500: 7431.46,
  wti: 80.72,
};

// Exportados para teste: o parse de cada fonte e o preenchimento de buracos
// sao puros e nao tocam rede.
export function yahooClose(j) {
  const meta = j?.chart?.result?.[0]?.meta;
  if (!meta) return null;
  const price = meta.regularMarketPrice != null ? Number(meta.regularMarketPrice) : null;
  return price != null && Number.isFinite(price) ? price : null;
}

export function awesomeUsdbrl(j) {
  const bid = j?.USDBRL?.bid;
  const v = bid != null ? Number(bid) : NaN;
  return Number.isFinite(v) && v > 0 ? v : null;
}

export function completar(live, prev) {
  // Preenche buracos com o ultimo valor conhecido (cache anterior ou SEED) e
  // devolve a lista de ativos defasados. Sem isso, o payload mentiria "ao vivo".
  const out = {};
  const stale = [];
  for (const k of Object.keys(SEED)) {
    if (live[k] != null) {
      out[k] = live[k];
    } else if (prev?.[k] != null) {
      out[k] = prev[k];
      stale.push(k);
    } else {
      out[k] = SEED[k];
      stale.push(k);
    }
  }
  return { out, stale };
}

async function fetchYahoo(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
  const j = await fetchJson(url, {
    timeout: 10000,
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (compatible; MultiAssetBot/1.0)',
    },
  });
  return yahooClose(j);
}

async function fetchAwesomeUsdbrl() {
  const j = await fetchJson('https://economia.awesomeapi.com.br/json/last/USD-BRL', { timeout: 8000 });
  return awesomeUsdbrl(j);
}

function arredondar(v, dec) {
  return Math.round(v * 10 ** dec) / 10 ** dec;
}

async function revalidate(env) {
  const cache = await readCache(env.CACHE, CACHE_KEY);
  const prev = cache?._raw ?? null;

  // Fontes independentes em paralelo, mesmo padrao de prices.js: o pior caso
  // e um timeout, nao quatro somados.
  const [usd_brl, ibovespa, sp500, wti] = await Promise.all([
    fetchAwesomeUsdbrl(),
    fetchYahoo('%5EBVSP'),
    fetchYahoo('%5EGSPC'),
    fetchYahoo('CL%3DF'),
  ]);

  const { out, stale } = completar(
    { usd_brl, ibovespa, sp500, wti },
    prev
  );

  const raw = {
    usd_brl: arredondar(out.usd_brl, 4),
    ibovespa: arredondar(out.ibovespa, 2),
    sp500: arredondar(out.sp500, 2),
    wti: arredondar(out.wti, 2),
  };

  const payload = {
    ok: true,
    usd_brl: raw.usd_brl,
    ibovespa: raw.ibovespa,
    sp500: raw.sp500,
    wti: raw.wti,
    stale,
    generated_at: brtNow(),
    ts: Math.floor(Date.now() / 1000),
    _raw: raw,
  };

  // Tudo falhou e havia cache antigo: reestampa o ts e devolve o antigo, sem
  // carimbar a semente como cotacao do minuto (mesmo padrao de prices.js).
  // Neste ramo TODOS os ativos sao defasados: o stale persistido precisa
  // refletir isso. Antes o spread preservava o stale do cache anterior
  // (ex.: [] de uma coleta boa) e por 900s o front rotulava os valores
  // antigos como "Cotacao atual" a cada reestampagem, indefinidamente
  // enquanto as fontes ficassem fora.
  if (stale.length === 4 && cache) {
    const carimbado = { ...cache, ts: Math.floor(Date.now() / 1000), stale: Object.keys(SEED) };
    await writeCache(env.CACHE, CACHE_KEY, carimbado, staleTtl(CACHE_TTL));
    return { ...cache, ok: true, source_state: 'stale-cache', stale: Object.keys(SEED) };
  }

  await writeCache(env.CACHE, CACHE_KEY, payload, staleTtl(CACHE_TTL));
  return payload;
}

// _raw (duplicata dos 4 campos) e ts sao internos do cache, nao fazem parte
// do contrato com o front. Exportada para teste.
export function publico(payload) {
  const { _raw, ts, ...resto } = payload;
  return resto;
}

export async function handleRelatorioPrices(env, ctx) {
  const { cached, state } = await readCacheOrRevalidate(
    env.CACHE,
    CACHE_KEY,
    CACHE_TTL,
    ctx,
    () => revalidate(env)
  );

  if (cached) {
    return jsonResponse({ ...publico(cached), source_state: state }, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  }

  const payload = publico(await revalidate(env));
  return jsonResponse(payload, { headers: { 'Cache-Control': 'public, max-age=300' } });
}
