import { jsonResponse } from '../utils/http.js';
import { readCacheOrRevalidate, staleTtl, writeCache } from '../utils/cache.js';
import { clampScore, freshnessState } from '../utils/data-quality.js';

const CACHE_KEY = 'btc-intelligence-v1';
const CACHE_TTL = 60;
const BTC_ORIGIN = 'https://btc-radar.prospects-intel.workers.dev';

const ENDPOINTS = {
  health: ['/api/health', 2 * 3600],
  price: ['/api/price/latest', 180],
  market: ['/api/market', 180],
  sentiment: ['/api/sentiment/fear-greed', 30 * 3600],
  derivatives: ['/api/derivatives', 15 * 60],
  onchain: ['/api/onchain', 2 * 3600],
  signals: ['/api/signals', 2 * 3600],
  scenarios: ['/api/scenarios', 6 * 3600],
};

function responseTimestamp(name, body) {
  if (name === 'health') return body?.freshness?.last_cron_at ?? body?.timestamp ?? null;
  if (name === 'scenarios') return body?.generated_at ?? body?.timestamp ?? null;
  if (name === 'signals') {
    const list = body?.data?.signals;
    if (!Array.isArray(list) || list.length === 0) return body?.timestamp ?? null;
    return list.reduce((latest, item) => {
      const value = item?.generated_at ?? null;
      return !latest || (value && value > latest) ? value : latest;
    }, null);
  }
  return body?.data?.timestamp ?? body?.timestamp ?? null;
}

export function summarizeSignals(body) {
  const payload = body?.data ?? {};
  const list = Array.isArray(payload?.signals) ? payload.signals : [];
  const verdicts = { COMPRAR: 0, AGUARDAR: 0, VENDER: 0, REDUZIR: 0 };
  const byTimeframe = { short: 0, medium: 0, long: 0 };
  let convictionTotal = 0;
  let convictionCount = 0;
  let generatedAt = null;

  for (const signal of list) {
    if (Object.hasOwn(verdicts, signal?.verdict)) verdicts[signal.verdict] += 1;
    if (Object.hasOwn(byTimeframe, signal?.timeframe)) byTimeframe[signal.timeframe] += 1;
    if (Number.isFinite(Number(signal?.conviction))) {
      convictionTotal += Number(signal.conviction);
      convictionCount += 1;
    }
    const ts = signal?.generated_at ?? null;
    if (ts && (!generatedAt || ts > generatedAt)) generatedAt = ts;
  }

  return {
    count: list.length,
    verdicts,
    by_timeframe: byTimeframe,
    avg_conviction: convictionCount ? Math.round((convictionTotal / convictionCount) * 10) / 10 : null,
    consensus: payload?.consensus ?? null,
    generated_at: generatedAt,
  };
}

async function fetchWithTimeout(fetcher, request, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const req = new Request(request, { signal: controller.signal });
    return await fetcher(req);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchBtcEndpoint(env, path, timeoutMs = 8000) {
  const viaBinding = env?.BTC_RADAR && typeof env.BTC_RADAR.fetch === 'function';
  const url = viaBinding ? `https://btc-radar.internal${path}` : `${BTC_ORIGIN}${path}`;
  const fetcher = viaBinding
    ? (req) => env.BTC_RADAR.fetch(req)
    : (req) => fetch(req);

  try {
    const res = await fetchWithTimeout(fetcher, new Request(url, {
      headers: { Accept: 'application/json' },
    }), timeoutMs);
    if (!res.ok) {
      return { ok: false, status: res.status, via: viaBinding ? 'service-binding' : 'public-fetch', body: null, error: `HTTP ${res.status}` };
    }
    const body = await res.json();
    const apiOk = body?.ok !== false && body?.success !== false;
    return {
      ok: apiOk,
      status: res.status,
      via: viaBinding ? 'service-binding' : 'public-fetch',
      body,
      error: apiOk ? null : body?.error ?? 'upstream_reported_failure',
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      via: viaBinding ? 'service-binding' : 'public-fetch',
      body: null,
      error: err?.message ?? String(err),
    };
  }
}

function sourceRecord(name, result, maxAgeSeconds, nowMs) {
  const ts = responseTimestamp(name, result.body);
  const freshness = result.ok
    ? freshnessState(ts, maxAgeSeconds, nowMs)
    : { state: 'missing', age_s: null };
  return {
    name,
    ok: result.ok,
    status: result.status,
    via: result.via,
    observed_at: ts,
    max_age_s: maxAgeSeconds,
    ...freshness,
    error: result.error,
  };
}

export function scoreBtcQuality(sources, healthBody, marketBody) {
  let score = 100;
  const issues = [];

  const core = new Set(['price', 'signals']);
  for (const source of sources) {
    if (!source.ok) {
      const penalty = core.has(source.name) ? 25 : 10;
      score -= penalty;
      issues.push(`${source.name}:unavailable`);
      continue;
    }
    if (source.state === 'stale') {
      score -= core.has(source.name) ? 12 : 5;
      issues.push(`${source.name}:stale`);
    } else if (source.state === 'expired' || source.state === 'missing') {
      score -= core.has(source.name) ? 20 : 8;
      issues.push(`${source.name}:${source.state}`);
    }
  }

  const cronErrors = Number(healthBody?.freshness?.last_cron_errors ?? 0);
  if (cronErrors > 0) {
    score -= Math.min(10, cronErrors * 3);
    issues.push(`cron_errors:${cronErrors}`);
  }

  const upstreamQuality = Number(marketBody?.data?.quality?.score);
  if (Number.isFinite(upstreamQuality) && upstreamQuality < 70) {
    score -= 8;
    issues.push('market_quality_below_70');
  }

  const finalScore = clampScore(score);
  return {
    score: finalScore,
    state: finalScore >= 85 ? 'good' : finalScore >= 65 ? 'degraded' : 'poor',
    issues,
  };
}

export async function collectBtcIntelligence(env, nowMs = Date.now()) {
  const entries = Object.entries(ENDPOINTS);
  const results = await Promise.all(entries.map(async ([name, [path, maxAge]]) => {
    const result = await fetchBtcEndpoint(env, path);
    return [name, result, maxAge];
  }));

  const map = Object.fromEntries(results.map(([name, result]) => [name, result]));
  const sources = results.map(([name, result, maxAge]) => sourceRecord(name, result, maxAge, nowMs));
  const quality = scoreBtcQuality(sources, map.health?.body, map.market?.body);
  const signalSummary = summarizeSignals(map.signals?.body);

  return {
    ok: sources.some((s) => s.ok),
    schema: 'sz.market-intelligence.v1',
    generated_at: new Date(nowMs).toISOString(),
    asset: 'BTC',
    quality,
    sources,
    data: {
      price: map.price?.body?.data ?? null,
      market: map.market?.body?.data ?? null,
      sentiment: map.sentiment?.body?.data ?? null,
      derivatives: map.derivatives?.body?.data ?? null,
      onchain: map.onchain?.body?.data ?? null,
      signals: signalSummary,
      scenarios: map.scenarios?.body?.data ?? null,
      service: {
        version: map.health?.body?.version ?? null,
        last_cron_at: map.health?.body?.freshness?.last_cron_at ?? null,
        last_cron_errors: map.health?.body?.freshness?.last_cron_errors ?? null,
        last_cron_error_detail: map.health?.body?.freshness?.last_cron_error_detail ?? null,
      },
    },
  };
}

async function revalidate(env) {
  const payload = await collectBtcIntelligence(env);
  const ts = Math.floor(Date.now() / 1000);
  await writeCache(env.CACHE, CACHE_KEY, { ...payload, ts }, staleTtl(CACHE_TTL));
  return { ...payload, ts };
}

export async function handleBtcIntelligence(env, ctx) {
  const { cached, state } = await readCacheOrRevalidate(
    env.CACHE,
    CACHE_KEY,
    CACHE_TTL,
    ctx,
    () => revalidate(env),
  );

  if (cached) {
    return jsonResponse({ ...cached, cache_state: state }, {
      headers: { 'Cache-Control': 'public, max-age=30' },
    });
  }

  const payload = await revalidate(env);
  return jsonResponse({ ...payload, cache_state: 'miss' }, {
    headers: { 'Cache-Control': 'public, max-age=30' },
  });
}
