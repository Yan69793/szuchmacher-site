import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../../../assets/multi-app-2.js', import.meta.url), 'utf8');

// Extrai funcoes puras
const _m1 = SRC.match(/function calcSerie\([\s\S]*?\n\}/);
assert.ok(_m1, 'calcSerie');
const calcSerie = new Function('return ' + _m1[0] + ';')();

// calcFinal depende de calcSerie — passa como parametro
const _m2 = SRC.match(/function calcFinal\([\s\S]*?\n\}/);
assert.ok(_m2, 'calcFinal');
const calcFinal = new Function('calcSerie', 'return ' + _m2[0] + ';')(calcSerie);

// _makePRNG
const _m3 = SRC.match(/function _makePRNG\([\s\S]*?\n\}/);
assert.ok(_m3, '_makePRNG');
const _makePRNG = new Function('return ' + _m3[0] + ';')();

// runMC depende de _makePRNG
const _m4 = SRC.match(/function runMC\([\s\S]*?\n\}/);
assert.ok(_m4, 'runMC');
const runMC = new Function('_makePRNG', 'return ' + _m4[0] + ';')(_makePRNG);

// Normalizacao comparador
function normCorreto(serie) {
  const b = serie[0];
  return serie.map(v => (v / b) * 100);
}
function normBugado(serie) {
  const b = serie;
  return serie.map(v => (v / b) * 100);
}

// simConfigs — extrai objeto literal
const _m5 = SRC.match(/const simConfigs = (\{[\s\S]*?\n\};)/);
assert.ok(_m5, 'simConfigs');
const simConfigs = new Function('window', 'return ' + _m5[1] + '\n')({ btcPessMultiplier: 0.40 });
// ══ P1.1 — Comparador: sem NaN ══
test('P1.1: indice por serie[0] produz valores finitos', () => {
  const s = calcSerie(10000, 500, 0.08, 10);
  const n = normCorreto(s);
  assert.equal(n[0], 100);
  assert.ok(n.every(v => isFinite(v)));
});
test('P1.1: indice por array (bug) produz NaN', () => {
  const s = calcSerie(10000, 500, 0.08, 5);
  const n = normBugado(s);
  assert.ok(n.some(v => !isFinite(v)));
});

// ══ P1.2 — CAGR ══
test('P1.2: CAGR sem aportes = taxa entrada', () => {
  const f = calcFinal(10000, 0, 0.08, 10);
  const c = Math.pow(f / 10000, 1 / 10) - 1;
  assert.ok(Math.abs(c - 0.08) < 0.001);
});
test('P1.2: CAGR com aportes nao usa ini como denominador', () => {
  const f = calcFinal(10000, 500, 0.08, 10);
  const ti = 10000 + 500 * 12 * 10;
  const ce = Math.pow(f / 10000, 1 / 10) - 1;
  const cc = Math.pow(1 + (f - ti) / ti, 1 / 10) - 1;
  assert.ok(ce > cc + 0.02);
});
test('P1.2: CAGR do ativo = taxa entrada (multi casos)', () => {
  for (const c of [{ i: 10000, t: 0.08, p: 10 }, { i: 50000, t: 0.12, p: 20 }, { i: 5000, t: -0.05, p: 5 }]) {
    const f = calcFinal(c.i, 0, c.t, c.p);
    const cagr = Math.pow(f / c.i, 1 / c.p) - 1;
    assert.ok(Math.abs(cagr - c.t) < 0.001);
  }
});

// ══ P1.3 — Monte Carlo ══
test('P1.3: mesma seed = mesmo resultado', () => {
  assert.deepEqual(runMC(10000, 500, 0.08, 0.15, 10, 1000, 42), runMC(10000, 500, 0.08, 0.15, 10, 1000, 42));
});
test('P1.3: vol=0 produz trajetoria = calcSerie (sem aportes)', () => {
  const mc = runMC(10000, 0, 0.08, 0, 5, 100, 42);
  const d = calcSerie(10000, 0, 0.08, 5);
  for (let y = 0; y <= 5; y++) assert.ok(Math.abs(mc.p50[y] - d[y]) < 1e-6, `ano ${y}: ${mc.p50[y]} ~= ${d[y]}`);
});

// ══ P1.4 — CDI/NTN-B ══
test('P1.4: CDI pess > base > otim', () => {
  const c = simConfigs.cdi;
  assert.ok(c.pess > c.base, `pess ${(c.pess*100).toFixed(1)} > base ${(c.base*100).toFixed(1)}`);
  assert.ok(c.base > c.otim, `base ${(c.base*100).toFixed(1)} > otim ${(c.otim*100).toFixed(1)}`);
});
test('P1.4: NTN-B pess > base > otim', () => {
  const c = simConfigs.ntnb;
  assert.ok(c.pess > c.base, `pess ${(c.pess*100).toFixed(1)} > base ${(c.base*100).toFixed(1)}`);
  assert.ok(c.base > c.otim, `base ${(c.base*100).toFixed(1)} > otim ${(c.otim*100).toFixed(1)}`);
});
test('P1.4: spread > 2pp', () => {
  const sc = simConfigs.cdi.pess - simConfigs.cdi.otim;
  const sn = simConfigs.ntnb.pess - simConfigs.ntnb.otim;
  assert.ok(sc > 0.02, `CDI ${(sc*100).toFixed(1)}pp`);
  assert.ok(sn > 0.02, `NTN-B ${(sn*100).toFixed(1)}pp`);
});
test('P1.3: coerencia card x mediana MC (tolerancia 10%)', () => {
  const ini = 10000, ap = 500, taxa = 0.10, vol = 0.15, prazo = 10;
  const card = calcFinal(ini, ap, taxa, prazo);
  const mc = runMC(ini, ap, taxa, vol, prazo, 20000, 42);
  const med = mc.p50[prazo];
  const razao = Math.abs(med - card) / card;
  assert.ok(razao < 0.10, `mediana ${med.toFixed(0)} ~= card ${card.toFixed(0)} (${(razao*100).toFixed(1)}% < 10%)`);
});