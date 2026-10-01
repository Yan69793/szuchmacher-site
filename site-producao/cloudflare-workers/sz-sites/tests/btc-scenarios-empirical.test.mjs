import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchEmpirical365, handleBtcScenarios } from '../src/handlers/btc-scenarios.js';

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeEnv(scenarioAvailable = true) {
  const store = new Map();
  return {
    CACHE: {
      async get(key) { return store.get(key) ?? null; },
      async put(key, value) { store.set(key, value); },
    },
    BTC_RADAR: {
      async fetch(req) {
        const path = new URL(req.url).pathname;
        if (path === '/api/scenarios') {
          return json({
            success: true,
            generated_at: '2026-09-28T20:00:00Z',
            data: {
              current_regime: { trend: 'neutral', volatility: 'normal', key: 'neutral:normal' },
              horizons: {
                '365': scenarioAvailable
                  ? { available: true, sample_size: 120, effective_sample_size: 8, confidence: 'medium', conditioning: 'unconditional', p10: -42, p50: 28, p90: 116 }
                  : { available: false, sample_size: 0, conditioning: 'insufficient', p10: null, p50: null, p90: null },
              },
            },
          });
        }
        if (path === '/api/signals') {
          return json({
            success: true,
            data: { signals: [{ timeframe: 'long', verdict: 'COMPRAR', conviction: 7, entry_price: 80000, payload: { atr_value: 3000 } }] },
          });
        }
        if (path === '/api/sentiment/fear-greed') {
          return json({ success: true, data: { value: 50 } });
        }
        return json({ success: false }, 404);
      },
    },
  };
}

test('fetchEmpirical365 converte percentis em taxas decimais', async () => {
  const out = await fetchEmpirical365(makeEnv(true));
  assert.equal(out.method, 'empirical-forward-returns');
  assert.equal(out.sample_size, 120);
  assert.equal(out.effective_sample_size, 8);
  assert.equal(out.confidence, 'medium');
  assert.deepEqual(out.rates, { pess: -0.42, base: 0.28, otim: 1.16 });
});

test('handler mantem drift recorrente separado da banda empirica de 1 ano', async () => {
  const res = await handleBtcScenarios(makeEnv(true));
  const body = await res.json();
  assert.equal(body.method, 'heuristic-drift-with-empirical-band');
  assert.deepEqual(body.empirical_band.rates, { pess: -0.42, base: 0.28, otim: 1.16 });
  assert.notDeepEqual(body.rates, body.empirical_band.rates);
});

test('handler preserva heuristica enquanto 365d estiver indisponivel', async () => {
  const res = await handleBtcScenarios(makeEnv(false));
  const body = await res.json();
  assert.equal(body.method, 'heuristic-fallback');
  assert.equal(body.empirical_band, null);
  assert.equal(Number.isFinite(body.rates.base), true);
});
