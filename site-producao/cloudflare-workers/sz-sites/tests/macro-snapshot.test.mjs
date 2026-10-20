import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshot, validarNumerosContraSnapshot, FRESH_SECONDS } from '../src/handlers/macro-api.js';

const snap = buildSnapshot({
  coletado_em: '2026-10-20T10:00:00Z',
  selic_valor: '13.25', selic_data: '16/10/2026',
  ptax_valor: '5.0564', ptax_data: '20/10/2026',
  focus_selic: 13.25, focus_ipca: 5.219, focus_cambio: 5.3, focus_pib: 1.8, ano_focus: 2026,
});

test('rejeita PTAX, Focus IPCA e Focus Selic divergentes do snapshot', () => {
  const d = { alert_text: 'PTAX 4,9892, Focus IPCA 5,0129% e Focus Selic 13,5%.' };
  const r = validarNumerosContraSnapshot(d, snap);
  assert.deepEqual(r.map((x) => x.campo), ['PTAX', 'Focus IPCA', 'Focus Selic']);
});

test('aceita texto que bate com o snapshot', () => {
  const d = { alert_title: 'PTAX R$ 5,0564', alert_text: 'Focus IPCA 5,219% e Focus Selic 13,25%.', brasil: [{ text: 'sem numeros citados' }] };
  assert.deepEqual(validarNumerosContraSnapshot(d, snap), []);
});

test('campo do snapshot ausente nao reprova nem inventa referencia', () => {
  const s = buildSnapshot({ ptax_valor: '5.05', selic_valor: '13', selic_data: 'x', ptax_data: 'y' });
  assert.deepEqual(validarNumerosContraSnapshot({ alert_text: 'Focus IPCA 9,9%' }, s), []);
});

test('janela de frescor e 24h', () => assert.equal(FRESH_SECONDS, 86400));

test('variacao percentual perto de PTAX nao e tratada como cotacao', () => {
  const s = buildSnapshot({ ptax_valor: '5.0564', selic_valor: '13', selic_data: 'x', ptax_data: 'y' });
  assert.deepEqual(validarNumerosContraSnapshot({ alert_text: 'A PTAX recuou 0,8% na semana e acumula alta de 12,5%.' }, s), []);
  assert.equal(validarNumerosContraSnapshot({ alert_text: 'PTAX de R$ 4,9892' }, s).length, 1);
});
