import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectBtcIntelligence, scoreBtcQuality, summarizeSignals } from '../src/handlers/btc-intelligence.js';

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('summarizeSignals agrega vereditos sem expor documentos brutos', () => {
  const out = summarizeSignals({
    data: {
      signals: [
        { verdict: 'COMPRAR', timeframe: 'long', conviction: 9, generated_at: '2026-09-28T20:00:00Z' },
        { verdict: 'AGUARDAR', timeframe: 'short', conviction: 3, generated_at: '2026-09-28T20:10:00Z' },
      ],
      consensus: { verdict: 'AGUARDAR' },
    },
  });
  assert.equal(out.count, 2);
  assert.equal(out.verdicts.COMPRAR, 1);
  assert.equal(out.verdicts.AGUARDAR, 1);
  assert.equal(out.avg_conviction, 6);
  assert.equal(out.generated_at, '2026-09-28T20:10:00Z');
  assert.deepEqual(out.consensus, { verdict: 'AGUARDAR' });
});

test('scoreBtcQuality penaliza core indisponivel e cron com erro', () => {
  const quality = scoreBtcQuality([
    { name: 'price', ok: false, state: 'missing' },
    { name: 'signals', ok: true, state: 'fresh' },
    { name: 'health', ok: true, state: 'fresh' },
  ], { freshness: { last_cron_errors: 2 } }, null);
  assert.equal(quality.score, 69);
  assert.equal(quality.state, 'degraded');
  assert.ok(quality.issues.includes('price:unavailable'));
  assert.ok(quality.issues.includes('cron_errors:2'));
});

test('collectBtcIntelligence prefere Service Binding e produz contrato v1', async () => {
  const now = Date.parse('2026-09-28T20:30:00Z');
  const seen = [];
  const env = {
    BTC_RADAR: {
      async fetch(req) {
        const u = new URL(req.url);
        seen.push(u.pathname);
        if (u.pathname === '/api/health') return json({ ok: true, version: '0.9.0', timestamp: '2026-09-28T20:30:00Z', freshness: { last_cron_at: '2026-09-28T20:01:00Z', last_cron_errors: 0 } });
        if (u.pathname === '/api/price/latest') return json({ success: true, data: { price: 83500, timestamp: '2026-09-28T20:29:30Z' } });
        if (u.pathname === '/api/market') return json({ success: true, data: { timestamp: '2026-09-28T20:29:40Z', quality: { score: 96 } } });
        if (u.pathname === '/api/sentiment/fear-greed') return json({ success: true, data: { value: 42, timestamp: '2026-09-28T20:00:00Z' } });
        if (u.pathname === '/api/derivatives') return json({ success: true, data: { open_interest_usd: 1, timestamp: '2026-09-28T20:28:00Z' } });
        if (u.pathname === '/api/onchain') return json({ success: true, data: { block_height: 1, timestamp: '2026-09-28T20:00:00Z' } });
        if (u.pathname === '/api/signals') return json({ success: true, data: { signals: [{ verdict: 'AGUARDAR', timeframe: 'long', conviction: 5, generated_at: '2026-09-28T20:20:00Z' }] } });
        if (u.pathname === '/api/scenarios') return json({ success: true, data: { annual_ready: false, horizons: { '365': { available: false } } }, timestamp: '2026-09-28T20:25:00Z' });
        return json({ error: 'not found' }, 404);
      },
    },
  };

  const out = await collectBtcIntelligence(env, now);
  assert.equal(out.schema, 'sz.market-intelligence.v1');
  assert.equal(out.data.price.price, 83500);
  assert.equal(out.data.signals.count, 1);
  assert.equal(out.quality.state, 'good');
  assert.equal(out.sources.every((s) => s.via === 'service-binding'), true);
  assert.equal(out.data.scenarios.annual_ready, false);
  assert.equal(seen.length, 8);
});
