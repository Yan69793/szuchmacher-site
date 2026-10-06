import { jsonResponse, brtNow } from '../utils/http.js';
import { tradingDayGap } from './ntnb-scenarios.js';
import { readCache, writeCache, readCacheOrRevalidate, staleTtl } from '../utils/cache.js';

// Limite inclui leitura do corpo. Uma repeticao apenas para GET transitorio.
async function fetchScenarioJson(url, options = {}) {
  const timeout = options.timeout ?? 10000;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    let timer, status = 0, retryAfter = 0;
    try {
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, timeout);
      });
      const result = await Promise.race([deadline, (async () => {
        const res = await fetch(url, { headers: options.headers, signal: controller.signal });
        status = res.status;
        if (!res.ok) {
          const raw = res.headers.get('Retry-After');
          if (raw) retryAfter = /^\d+$/.test(raw) ? Number(raw) * 1000 : Math.max(0, Date.parse(raw) - Date.now());
          return { ok: false, status, data: null, error: 'HTTP ' + status };
        }
        return { ok: true, status, data: await res.json(), error: null };
      })()]);
      if (result.ok || attempt || !(status === 429 || status >= 500) || retryAfter > 2000) return result;
    } catch (error) {
      if (attempt || error instanceof SyntaxError) return { ok: false, status, data: null, error: error.message };
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
    await new Promise(resolve => setTimeout(resolve, Math.max(retryAfter || 0, 250 + Math.random() * 250)));
  }
}

const CACHE_KEY = 'market-data';
const HEALTH_KEY = 'market-data-sources-health';
const CACHE_TTL = 600;
const SEED = {
  ibov: { value: 137000.0, change_pct: 0.0 },
  sp500: { value: 5420.0, change_pct: 0.0 },
  wti: { value: 74.0, change_pct: 0.0 },
  treasury10y: { value: 4.45, change_pct: 0.0 },
  ntnb11: { value: 95.0, change_pct: 0.0 },
};

// fetchYahoo devolve { data, status } em vez de null: o handler precisa da
// diferenca entre "fonte morta" (401/404/410/429/timeout) e "simbolo sem dados"
// (200 com chart.result vazio, como o NTNB11.SA no Yahoo). Ambas caem no
// fallback, mas so a primeira merece o rotulo de fonte indisponivel.
async function fetchYahoo(encodedSymbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodedSymbol}?interval=1d&range=1d`;
  const r = await fetchScenarioJson(url, {
    timeout: 10000,
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (compatible; MultiAssetBot/1.0)',
    },
  });
  if (!r.ok) return { data: null, status: r.status };
  const meta = r.data?.chart?.result?.[0]?.meta;
  if (!meta) return { data: null, status: r.status };
  const price = meta.regularMarketPrice != null ? Number(meta.regularMarketPrice) : null;
  const prev = meta.chartPreviousClose != null ? Number(meta.chartPreviousClose) : null;
  if (!Number.isFinite(price) || price <= 0) return { data: null, status: r.status };
  const quoteTs = Number(meta.regularMarketTime);
  if (quoteTs > Math.floor(Date.now() / 1000) + 300) return { data: null, status: r.status };
  if (quoteTs > 0 && tradingDayGap(quoteTs, Math.floor(Date.now() / 1000)) > 2) return { data: null, status: r.status };
  const change_pct = Number.isFinite(prev) && prev > 0 ? Math.round(((price - prev) / prev) * 10000) / 100 : null;
  const quote_at = Number.isFinite(quoteTs) && quoteTs > 0 ? new Date(quoteTs * 1000).toISOString() : null;
  return { data: { value: Math.round(price * 100) / 100, change_pct, quote_at }, status: r.status };
}

function fallbackVal(live, key, prevData) {
  if (live) return live;
  if (prevData?.[key]) return prevData[key];
  return SEED[key];
}

// Saude por fonte persiste no KV para qualquer script/rotina conseguir ler
// ha quanto tempo cada upstream esta falhando, sem depender de log do Worker.
async function persistSourceHealth(env, health) {
  const now = Math.floor(Date.now() / 1000);
  try {
    await writeCache(env.CACHE, HEALTH_KEY, { updated_at: now, sources: health }, 30 * 24 * 3600);
  } catch {
    /* writeCache ja loga; saude e telemetria, nao bloqueia a resposta */
  }
}

async function revalidate(env) {
  const cache = await readCache(env.CACHE, CACHE_KEY);
  const prevData = cache?.ibov ? cache : null;
  // A chave do payload continua 'ntnb11' por contrato com o front; a fonte
  // trocou de NTNB11.SA (ticker de titulo do Tesouro Direto, inexistente no
  // Yahoo) para IB5M11.SA (ETF It Now IMA-B 5+, negocia na B3) na auditoria
  // de 15/08/2026.
  const [ibovR, sp500R, wtiR, treasuryR, ntnbR] = await Promise.all([
    fetchYahoo('%5EBVSP'),
    fetchYahoo('%5EGSPC'),
    fetchYahoo('CL%3DF'),
    fetchYahoo('%5ETNX'),
    fetchYahoo('IB5M11.SA'),
  ]);

  const ibov = fallbackVal(ibovR.data, 'ibov', prevData);
  const sp500 = fallbackVal(sp500R.data, 'sp500', prevData);
  const wti = fallbackVal(wtiR.data, 'wti', prevData);
  const treasury10y = fallbackVal(treasuryR.data, 'treasury10y', prevData);
  const ntnb11 = fallbackVal(ntnbR.data, 'ntnb11', prevData);

  // stale lista quais ativos vieram do fallback (cache anterior ou SEED) em vez
  // de fetch ao vivo bem-sucedido — sem isso, 'source' mentia 'ao vivo' mesmo
  // quando um ou mais ativos vinham do SEED hardcoded de 15/06/2026.
  const stale = [];
  if (!ibovR.data) stale.push('ibov');
  if (!sp500R.data) stale.push('sp500');
  if (!wtiR.data) stale.push('wti');
  if (!treasuryR.data) stale.push('treasury10y');
  if (!ntnbR.data) stale.push('ntnb11');

  const sourceHealth = {
    ibov: { ok: !!ibovR.data, status: ibovR.status },
    sp500: { ok: !!sp500R.data, status: sp500R.status },
    wti: { ok: !!wtiR.data, status: wtiR.status },
    treasury10y: { ok: !!treasuryR.data, status: treasuryR.status },
    ntnb11: { ok: !!ntnbR.data, status: ntnbR.status },
  };
  await persistSourceHealth(env, sourceHealth);

  // Rotulo honesto: "parcial" com 5/5 em fallback era publicidade enganosa.
  const source = stale.length === 0
    ? 'Yahoo Finance · ao vivo'
    : stale.length === Object.keys(SEED).length
      ? 'fontes indisponíveis (cache/seed)'
      : 'Yahoo Finance · parcial';

  const payload = {
    ok: true,
    ibov,
    sp500,
    wti,
    treasury10y,
    ntnb11,
    updated_at: brtNow(),
    source,
    stale,
    source_health: sourceHealth,
    ts: Math.floor(Date.now() / 1000),
  };

  await writeCache(env.CACHE, CACHE_KEY, payload, staleTtl(CACHE_TTL));
  return payload;
}

export async function handleMarketData(env, ctx) {
  const { cached, state } = await readCacheOrRevalidate(
    env.CACHE,
    CACHE_KEY,
    CACHE_TTL,
    ctx,
    () => revalidate(env)
  );

  if (cached) {
    const rotulo = state === 'stale' ? 'cache (revalidando)' : 'cache';
    const source = cached.stale?.length === Object.keys(SEED).length
      ? 'fontes indisponíveis (cache/seed)'
      : cached.stale?.length ? `Yahoo Finance · ${rotulo} (parcial)` : `Yahoo Finance · ${rotulo}`;
    return jsonResponse({ ...cached, source }, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  }

  return jsonResponse(await revalidate(env), {
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}
