import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Fechamento das lacunas restantes dos 4 P1 sobre 6e67675: CAGR efetivo/implícito
// por bisseção (P1.2), guarda do modo índice do comparador (P1.1) e impacto real
// dos cenários na carteira via premissa plana por cenário (P1.4). Self-contained:
// extrai as funções/literais puros do motor por regex, roda offline.
const SRC = readFileSync(new URL('../../../assets/multi-app-2.js', import.meta.url), 'utf8');

// ── extração (mesmo estilo de multi-app-2-engine.test.mjs) ──────────────────
const _calcSerie = SRC.match(/function calcSerie\([\s\S]*?\n\}/);
assert.ok(_calcSerie, 'calcSerie');
const calcSerie = new Function('return ' + _calcSerie[0] + ';')();

const _calcFinal = SRC.match(/function calcFinal\([\s\S]*?\n\}/);
assert.ok(_calcFinal, 'calcFinal');
const calcFinal = new Function('calcSerie', 'return ' + _calcFinal[0] + ';')(calcSerie);

const _cagr = SRC.match(/function cagrComAportes\([\s\S]*?\n\}/);
assert.ok(_cagr, 'cagrComAportes');
const cagrComAportes = new Function('calcFinal', 'return ' + _cagr[0] + ';')(calcFinal);

const _norm = SRC.match(/function normalizarIndice\([\s\S]*?\n\}/);
assert.ok(_norm, 'normalizarIndice');
const normalizarIndice = new Function('return ' + _norm[0] + ';')();

const _makePRNG = SRC.match(/function _makePRNG\([\s\S]*?\n\}/);
assert.ok(_makePRNG, '_makePRNG');
const _makePRNGfn = new Function('return ' + _makePRNG[0] + ';')();

const _runMC = SRC.match(/function runMC\([\s\S]*?\n\}/);
assert.ok(_runMC, 'runMC');
const runMC = new Function('_makePRNG', 'return ' + _runMC[0] + ';')(_makePRNGfn);

const _sim = SRC.match(/const simConfigs = (\{[\s\S]*?\n\};)/);
assert.ok(_sim, 'simConfigs');
const simConfigs = new Function('return ' + _sim[1] + ';')();

const _perfis = SRC.match(/const PERFIS = (\{[\s\S]*?\n\};)/);
assert.ok(_perfis, 'PERFIS');
const PERFIS = new Function('return ' + _perfis[1] + ';')();

const _btcFb = SRC.match(/const BTC_PESS_FALLBACK_ANUAL = ([^;\n]+);/);
assert.ok(_btcFb, 'BTC_PESS_FALLBACK_ANUAL');
const BTC_PESS_FALLBACK_ANUAL = parseFloat(_btcFb[1]);

// Replica a regra do motor (desenharBenchmark/_runPortfolioMC): cada item usa a
// taxa plana de simConfigs no cenário; reserva segue o CDI; BTC sem premissa no
// pessimista cai no fallback curado.
const CEN_KEYS = { pessimista: 'pess', base: 'base', otimista: 'otim' };
function taxaItem(key, cen) {
    const k = CEN_KEYS[cen];
    if (key === 'reserva') return simConfigs.cdi[k];
    if (key === 'btc') return simConfigs.btc[k] == null ? BTC_PESS_FALLBACK_ANUAL : simConfigs.btc[k];
    return simConfigs[key][k];
}
function itens(perfil, cen) {
    return PERFIS[perfil].items[cen] || PERFIS[perfil].items.base;
}
function ponderado(perfil, cen) {
    return itens(perfil, cen).reduce((s, i) => s + (i.pct / 100) * taxaItem(i.key, cen), 0);
}
function blocoRF(perfil, cen) {
    return itens(perfil, cen).reduce((s, i) => {
        if (i.key === 'ntnb' || i.key === 'cdi' || i.key === 'reserva') return s + (i.pct / 100) * taxaItem(i.key, cen);
        return s;
    }, 0);
}

// ══ P1.1 — guarda do modo índice do comparador ══
test('P1.1: normalizarIndice escala por serie[0], ano 0 = 100 e finito', () => {
    const s = calcSerie(10000, 500, 0.08, 10);
    const n = normalizarIndice(s);
    assert.equal(n[0], 100);
    assert.ok(n.every(v => isFinite(v)));
    assert.ok(n.length === s.length);
});
test('P1.1: base degenerada (0, NaN, negativa, vazia) nao produz NaN/Infinity', () => {
    assert.deepEqual(normalizarIndice([0, 5, 10]), [100, 100, 100]);
    assert.deepEqual(normalizarIndice([NaN, 5, 10]), [100, 100, 100]);
    assert.deepEqual(normalizarIndice([-3, 0, 5]), [100, 100, 100]);
    assert.deepEqual(normalizarIndice([]), []);
});

// ══ P1.2 — CAGR efetivo/implícito por bisseção ══
test('P1.2: determinístico com aportes recupera a taxa que gerou o final (ouro 9,3%)', () => {
    const ini = 10000, ap = 500, taxa = 0.093, prazo = 10;
    const final = calcFinal(ini, ap, taxa, prazo);
    const cagr = cagrComAportes(ini, ap, prazo, final);
    assert.ok(cagr !== null && Math.abs(cagr - taxa) < 1e-6, `cagr ${cagr} ~= taxa ${taxa}`);
});
test('P1.2: sem aportes coincide com a formula de fluxo unico (positivo e negativo)', () => {
    for (const t of [0.093, 0.40, -0.05]) {
        const final = calcFinal(10000, 0, t, 10);
        const esperado = Math.pow(final / 10000, 1 / 10) - 1;
        const cagr = cagrComAportes(10000, 0, 10, final);
        assert.ok(cagr !== null && Math.abs(cagr - t) < 1e-6, `t=${t} cagr=${cagr}`);
        assert.ok(Math.abs(cagr - esperado) < 1e-6, `t=${t} fluxo unico ${esperado}`);
    }
});
test('P1.2: com aportes o CAGR efetivo NAO e (final/ini)^(1/n)-1', () => {
    const ini = 10000, ap = 500, taxa = 0.093, prazo = 10;
    const final = calcFinal(ini, ap, taxa, prazo);
    const geometricoIngenuo = Math.pow(final / ini, 1 / prazo) - 1;
    const cagr = cagrComAportes(ini, ap, prazo, final);
    assert.ok(cagr !== null && Math.abs(cagr - geometricoIngenuo) > 0.02, `cagr ${cagr} difere de ${geometricoIngenuo}`);
    assert.ok(Math.abs(cagr - taxa) < 1e-6, 'cagr efetivo ~= taxa entrada no caso deterministico');
});
test('P1.2: mediana do Monte Carlo produz CAGR implicito abaixo da taxa de entrada', () => {
    const ini = 10000, ap = 500, taxa = 0.093, vol = 0.15, prazo = 10;
    const mc = runMC(ini, ap, taxa, vol, prazo, 20000, 42);
    const finalMedian = mc.p50[prazo];
    const cagr = cagrComAportes(ini, ap, prazo, finalMedian);
    assert.ok(cagr !== null, 'mediana finita gera CAGR');
    assert.ok(cagr < taxa - 0.003, `cagr ${cagr} abaixo da taxa ${taxa} (drag de vol)`);
    assert.ok(cagr > 0.05, `cagr ${cagr} segue positivo`);
});
test('P1.2: final degenerado devolve null, sem NaN', () => {
    assert.equal(cagrComAportes(10000, 500, 10, 0), null);
    assert.equal(cagrComAportes(10000, 500, 10, -5), null);
    assert.equal(cagrComAportes(10000, 500, 10, NaN), null);
    assert.equal(cagrComAportes(10000, 500, 10, Infinity), null);
});

// ══ P1.4 — impacto real dos cenários na carteira (premissa plana por cenário) ══
test('P1.4: bloco renda fixa (NTN-B+CDI+reserva) estrito pessimista>base>otimista nos 3 perfis', () => {
    for (const perfil of ['conservador', 'moderado', 'arrojado']) {
        const p = blocoRF(perfil, 'pessimista');
        const b = blocoRF(perfil, 'base');
        const o = blocoRF(perfil, 'otimista');
        assert.ok(p > b, `${perfil} RF pess ${p.toFixed(4)} > base ${b.toFixed(4)}`);
        assert.ok(b > o, `${perfil} RF base ${b.toFixed(4)} > otim ${o.toFixed(4)}`);
    }
});
test('P1.4: magnitude do bloco RF no conservador bate com as premissas curadas', () => {
    // ntnb pess 0.16/cdi pess 0.165/otim... cons: (44.5*0.16+28.5*0.165+12*0.165)/100
    const rfp = blocoRF('conservador', 'pessimista');
    const rfb = blocoRF('conservador', 'base');
    assert.ok(Math.abs(rfp - 0.138025) < 1e-9, `pess RF ${rfp}`);
    assert.ok(Math.abs(rfb - 0.1115375) < 1e-9, `base RF ${rfb}`);
});
test('P1.4: reserva acompanha o CDI do cenario (contribuicao cons = 12% x taxa cdi)', () => {
    const contr = (cen) => itens('conservador', cen).find(i => i.key === 'reserva').pct / 100 * simConfigs.cdi[CEN_KEYS[cen]];
    const p = contr('pessimista'), b = contr('base'), o = contr('otimista');
    assert.ok(Math.abs(p - 0.0198) < 1e-9 && Math.abs(b - 0.0171) < 1e-9 && Math.abs(o - 0.0144) < 1e-9,
        `reserva pess ${p} / base ${b} / otim ${o}`);
    assert.ok(p > b && b > o, 'reserva segue a ordem do CDI');
});
test('P1.4: total do conservador pessimista > base (invertia antes da premissa plana por cenário)', () => {
    const p = ponderado('conservador', 'pessimista');
    const b = ponderado('conservador', 'base');
    assert.ok(Math.abs(p - 0.140125) < 1e-9, `cons pess ${p}`);
    assert.ok(Math.abs(b - 0.1365375) < 1e-9, `cons base ${b}`);
    assert.ok(p > b, `cons pess ${p.toFixed(4)} > base ${b.toFixed(4)}`);
});
test('P1.4: pesos somam 100 em perfil x cenario', () => {
    for (const perfil of ['conservador', 'moderado', 'arrojado']) {
        for (const cen of ['pessimista', 'base', 'otimista']) {
            const soma = itens(perfil, cen).reduce((s, i) => s + i.pct, 0);
            assert.ok(Math.abs(soma - 100) < 1e-9, `${perfil}/${cen} soma ${soma}`);
        }
    }
});
