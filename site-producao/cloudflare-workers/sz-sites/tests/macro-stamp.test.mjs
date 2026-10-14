import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync(new URL('../../../assets/multi-app-2.js', import.meta.url), 'utf8');
const start = SRC.indexOf('var MACRO_STALE_DAYS');
const end = SRC.indexOf('function _macroStampUnavailable');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(SRC.slice(start, end), ctx);
const NOW = Date.parse('2026-10-14T08:00:00Z');

test('carimbo usa a data de geracao do servidor, nao a hora do navegador', () => {
  const s = ctx._macroStampText('12/10/2026, 00:02 BRT', NOW);
  assert.equal(s, 'Gerado em 12/10/2026 \u00e0s 00:02 BRT');
});

test('formato com "as" do macro_data.json', () => {
  assert.match(ctx._macroStampText('25/09/2026 \u00e0s 18:11 BRT', NOW), /^Gerado em 25\/09\/2026 \u00e0s 18:11 BRT/);
});

test('mais de 8 dias: marcado como desatualizado', () => {
  assert.match(ctx._macroStampText('25/09/2026 \u00e0s 18:11 BRT', NOW), /desatualizada \(18 dias\)/);
});

test('sem data: aviso explicito', () => {
  assert.equal(ctx._macroStampText('', NOW), 'Data de gera\u00e7\u00e3o indispon\u00edvel');
});

test('renderMacro nao usa mais new Date() como carimbo', () => {
  assert.ok(!/_st2\.textContent = 'Atualizado em ' \+ _now/.test(SRC));
});