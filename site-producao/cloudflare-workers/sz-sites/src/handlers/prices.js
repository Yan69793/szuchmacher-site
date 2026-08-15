import { fetchJson, jsonResponse, brtNow } from '../utils/http.js';
import { readCache, writeCache, readCacheOrRevalidate, staleTtl } from '../utils/cache.js';

const CACHE_KEY = 'prices';
const CACHE_TTL = 900;
// Cobre é cotado em USD por libra-peso, não por onça troy. Símbolo HG no gold-api,
// o mesmo código do contrato COMEX. Semente medida em 30/07/2026.
const SEED = { gold: 4220.0, silver: 68.0, platinum: 1726.0, copper: 6.27, bitcoin: 63762.0 };

async function fromGoldApi(sym) {
  const j = await fetchJson(`https://api.gold-api.com/price/${sym}`, { timeout: 8000 });
  return j?.price != null && !Number.isNaN(Number(j.price)) ? Number(j.price) : null;
}

async function fromAwesome(pair) {
  const j = await fetchJson(`https://economia.awesomeapi.com.br/json/last/${pair}`, { timeout: 8000 });
  if (!j) return null;
  const key = pair.replace('-', '');
  const bid = j[key]?.bid;
  return bid != null && !Number.isNaN(Number(bid)) ? Number(bid) : null;
}

async function revalidate(env) {
  const cache = await readCache(env.CACHE, CACHE_KEY);
  const prev = cache?._raw ?? SEED;

  // Os cinco símbolos são independentes, e o fallback da AwesomeAPI dispara sempre
  // — mesmo sem saber ainda se vai ser usado. Encadeado só-se-precisar (fallback
  // depois do primary) somava dois timeouts de 8s em série, até 16s. Em paralelo
  // desde o início, o pior caso é um timeout de 8s, não dois.
  const [goldPrimary, silverPrimary, platinum, copper, bitcoinPrimary, goldAlt, silverAlt, bitcoinAlt] = await Promise.all([
    fromGoldApi('XAU'),
    fromGoldApi('XAG'),
    fromGoldApi('XPT'),
    fromGoldApi('HG'),
    fromGoldApi('BTC'),
    fromAwesome('XAU-USD'),
    fromAwesome('XAG-USD'),
    fromAwesome('BTC-USD'),
  ]);

  const gold = goldPrimary ?? goldAlt;
  const silver = silverPrimary ?? silverAlt;
  const bitcoin = bitcoinPrimary ?? bitcoinAlt;

  const fontes = [];
  if ([gold, silver, platinum, copper, bitcoin].some((v) => v != null)) fontes.push('gold-api.com');

  const vals = { gold, silver, platinum, copper, bitcoin };
  let stale = false;
  for (const k of Object.keys(vals)) {
    if (vals[k] == null) {
      vals[k] = prev[k] ?? SEED[k];
      stale = true;
    }
  }

  const raw = {
    gold: Math.round(vals.gold * 100) / 100,
    silver: Math.round(vals.silver * 100) / 100,
    platinum: Math.round(vals.platinum * 100) / 100,
    // USD/lb, duas casas. Com três, o front formata em en-US e "6.271" passa a ler
    // como milhar ao lado do "$ 1,664" da platina. Cobre é cotado em centavos por
    // libra de qualquer forma, duas casas dão granularidade de 0,16%.
    copper: Math.round(vals.copper * 100) / 100,
    bitcoin: Math.round(vals.bitcoin * 100) / 100,
  };

  const payload = {
    ok: true,
    gold: raw.gold,
    silver: raw.silver,
    platinum: raw.platinum,
    copper: raw.copper,
    bitcoin: raw.bitcoin,
    sources: fontes.length ? fontes : ['cache/seed'],
    stale,
    generated_at: brtNow(),
    ts: Math.floor(Date.now() / 1000),
    _raw: raw,
  };

  // Gravar o payload novo aqui carimbava a semente com `generated_at` de agora, e o
  // handler devolvia preço de 30/07 como se fosse do minuto. `generated_at`/`_raw`
  // do cache anterior ficam intactos — a idade real continua visível. Mas `ts` tem
  // que avançar: é o relógio de frescor que o gate de fora usa. Sem isso, toda
  // request pelo próximo CACHE_TTL cai em 'stale' de novo e dispara uma cascata
  // de upstream nova a cada uma — o oposto do que o cache existe para evitar.
  if (stale && cache && !fontes.length) {
    const carimbado = { ...cache, ts: Math.floor(Date.now() / 1000) };
    await writeCache(env.CACHE, CACHE_KEY, carimbado, staleTtl(CACHE_TTL));
    return { ...cache, ok: true, source_state: 'stale-cache' };
  }

  await writeCache(env.CACHE, CACHE_KEY, payload, staleTtl(CACHE_TTL));
  return payload;
}

export async function handlePrices(env, ctx) {
  const { cached, state } = await readCacheOrRevalidate(
    env.CACHE,
    CACHE_KEY,
    CACHE_TTL,
    ctx,
    () => revalidate(env)
  );

  if (cached) {
    return jsonResponse({ ...cached, source_state: state }, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  }

  const payload = await revalidate(env);
  return jsonResponse(payload, { headers: { 'Cache-Control': 'public, max-age=300' } });
}