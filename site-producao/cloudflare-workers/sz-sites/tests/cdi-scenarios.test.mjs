import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { computeRates, handleCdiScenarios } from '../src/handlers/cdi-scenarios.js';

// Semantica dos cenarios (fechamento P1.4): pessimista macro = juros altos em
// renda fixa. Os handlers ja invertiam (pess = corte de juros) e o front
// reaplicava os numeros sobre os cards depois do load, contradizendo a
// narrativa. Estes testes tracam a direcao: pess > base > otim no CDI.

const realFetch = globalThis.fetch;

function jsonRes(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeEnv() {
  const store = new Map();
  return {
    CACHE: {
      async get(key) { return store.get(key) ?? null; },
      async put(key, value) { store.set(key, value); },
    },
    _store: store,
  };
}

afterEach(() => { globalThis.fetch = realFetch; });

test('computeRates: CDI pessimista (juros altos) > base > otimista (cortes)', () => {
  const r = computeRates(0.139); // Selic/CDI de mercado ~13,9%
  assert.equal(r.pess, 0.164, 'pess ~2 pp acima da base');
  assert.equal(r.base, 0.139);
  assert.equal(r.otim, 0.114, 'otim ~2 pp abaixo da base');
  assert.ok(r.pess > r.base && r.base > r.otim, `pess ${r.pess} > base ${r.base} > otim ${r.otim}`);
});

test('computeRates: cap 0.18 mantido no pessimista sem inverter a ordem', () => {
  const r = computeRates(0.17);
  assert.equal(r.pess, 0.18, 'cap aplicado no pessimista');
  assert.ok(r.pess > r.base && r.base > r.otim, `pess ${r.pess} > base ${r.base} > otim ${r.otim}`);
});

test('handler /api/cdi-scenarios: rates servidos seguem pess > base > otim', async () => {
  // BrasilAPI com CDI 13,9%; sem ctx, caminho 'miss' revalida em foreground.
  globalThis.fetch = async (url) => {
    assert.ok(String(url).includes('brasilapi.com.br'), 'fonte deve ser a BrasilAPI primeiro');
    return jsonRes([{ nome: 'CDI', valor: '13.9' }]);
  };
  const env = makeEnv();
  const r = await handleCdiScenarios(env, undefined);
  const body = await r.json();
  assert.equal(r.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.cdi_rate, 0.139);
  assert.equal(body.rates.pess, 0.164);
  assert.equal(body.rates.otim, 0.114);
  assert.ok(body.rates.pess > body.rates.base && body.rates.base > body.rates.otim);
});
