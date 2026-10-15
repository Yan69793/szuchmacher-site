import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { POLICY_VERSION } from '../src/utils/subscriber.js';

// A prova de consentimento grava a versao da politica que o formulario declara.
// Se um formulario ficar com a versao antiga, o consentimento aponta para um
// texto que ja nao esta publicado.
const ler = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

test('formularios de inscricao declaram a POLICY_VERSION do Worker', () => {
  for (const f of ['assets/sz-relatorios-2.js', 'assets/multi-app-2.js']) {
    const versoes = [...ler(f).matchAll(/policy_version:\s*'([^']+)'/g)].map((m) => m[1]);
    assert.ok(versoes.length > 0, `${f} sem policy_version`);
    for (const v of versoes) assert.equal(v, POLICY_VERSION, `${f} declara ${v}`);
  }
});

test('sz-config.js expoe a mesma versao para os formularios do Formspree', () => {
  const m = ler('assets/sz-config.js').match(/window\.SZ_POLICY_VERSION\s*=\s*'([^']+)'/);
  assert.ok(m, 'SZ_POLICY_VERSION ausente');
  assert.equal(m[1], POLICY_VERSION);
});

test('privacidade.html mostra a data da versao vigente', () => {
  const [a, mes, d] = POLICY_VERSION.split('-').map(Number);
  const html = ler('privacidade.html').normalize('NFD').replace(/[̀-ͯ]/g, '');
  assert.ok(html.includes(`Ultima atualizacao:</strong> ${d} de ${MESES[mes - 1]} de ${a}`), 'data da politica diverge de POLICY_VERSION');
});
