import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// O macro-panel.js é script de browser sem exports. Para testar a função que
// descobre as chaves dinâmicas do Focus, extraímos o trecho do fonte e o
// avaliamos isolado. É um guard de regressão: se alguém voltar a cravar
// f.selic_2026, o teste quebra junto.
const src = readFileSync(new URL('../../../assets/macro-panel.js', import.meta.url), 'utf8');
const m = src.match(/function focusCampo\(f, prefixo\) \{[\s\S]*?\n  \}/);
assert.ok(m, 'focusCampo deveria existir no macro-panel.js');
const focusCampo = new Function('return ' + m[0] + ';')();

test('prefere a chave do ano corrente', () => {
  const ano = new Date().getFullYear();
  const f = {};
  f['selic_' + ano] = { mediana: 14.5 };
  f['selic_' + (ano + 1)] = { mediana: 12.0 };
  const campo = focusCampo(f, 'selic');
  assert.equal(campo.chave, 'selic_' + ano);
  assert.equal(campo.valor.mediana, 14.5);
});

test('sem a chave do ano corrente, usa a mais recente (virada de ano)', () => {
  const ano = new Date().getFullYear();
  const f = {};
  f['selic_' + (ano + 1)] = { mediana: 12.0 };
  const campo = focusCampo(f, 'selic');
  assert.equal(campo.chave, 'selic_' + (ano + 1));
  assert.equal(campo.valor.mediana, 12.0);
});

test('ignora chaves de anos anteriores quando há mais recente', () => {
  const ano = new Date().getFullYear();
  const f = {};
  f['ipca_' + (ano - 1)] = { mediana: 4.0 };
  f['ipca_' + ano] = { mediana: 5.5 };
  const campo = focusCampo(f, 'ipca');
  assert.equal(campo.chave, 'ipca_' + ano);
});

test('sem chave nenhuma devolve null', () => {
  assert.equal(focusCampo({}, 'pib'), null);
  assert.equal(focusCampo(null, 'pib'), null);
});

test('chave do ano corrente com valor null cai para a mais recente com valor', () => {
  const ano = new Date().getFullYear();
  const f = {};
  f['selic_' + ano] = null;               // Focus sem linha para o ano corrente
  f['selic_' + (ano - 1)] = { mediana: 13.25 };
  const campo = focusCampo(f, 'selic');
  assert.equal(campo.chave, 'selic_' + (ano - 1));
  assert.equal(campo.valor.mediana, 13.25);
});

test('todas as chaves com valor null devolvem null (nao derruba o ticker)', () => {
  const ano = new Date().getFullYear();
  const f = {};
  f['pib_' + ano] = null;
  f['pib_' + (ano - 1)] = null;
  f['pib_' + (ano + 1)] = null;
  assert.equal(focusCampo(f, 'pib'), null);
});

test('valor undefined tambem e tratado como ausente', () => {
  const ano = new Date().getFullYear();
  const f = {};
  f['ipca_' + ano] = undefined;
  f['ipca_' + (ano - 1)] = { mediana: 4.1 };
  const campo = focusCampo(f, 'ipca');
  assert.equal(campo.chave, 'ipca_' + (ano - 1));
});
