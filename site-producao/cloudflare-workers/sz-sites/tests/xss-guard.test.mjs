import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Guard estático contra regressão do fix de XSS armazenado em renderMacro.
// Os campos alimentados por LLM precisam passar por escHtml/escRich antes do
// innerHTML. Se uma edição futura voltar a interpolar o campo cru, este teste
// quebra de propósito.
const src = readFileSync(new URL('../../../multiasset-app.html', import.meta.url), 'utf8');

test('renderMacro escapa os campos simples do LLM', () => {
  assert.ok(src.includes('const escHtml = s =>'), 'escHtml deveria existir');
  assert.ok(src.includes("set('macro-cenario-eyebrow', escHtml(d.eyebrow))"));
  assert.ok(src.includes("set('macro-alert-title', escHtml(d.alert_title))"));
  assert.ok(src.includes("set('macro-alert-text', escHtml(d.alert_text))"));
  assert.ok(src.includes("set('macro-alert-badge', escHtml(d.alert_badge))"));
  assert.ok(!src.includes("set('macro-alert-title', d.alert_title)"), 'interpolação crua reintroduzida');
});

test('renderMacro escapa canais e brasil', () => {
  assert.ok(src.includes('${escHtml(c.variavel)}'));
  assert.ok(src.includes('${escHtml(c.mecanismo)}'));
  assert.ok(src.includes('${escHtml(b.label)}'));
  assert.ok(src.includes('${escHtml(b.text)}'));
});

// Testes dinamicos do escRich: extrai a funcao do fonte e executa. Cobre o
// comportamento real, nao so a presenca do codigo. O statement e uma cadeia
// de .replace em linhas continuadas; capturamos ate a proxima linha que nao
// comece com '.', sem depender de ';' (o literal '&amp;' contem ';' dentro).
function extrair(nome) {
  const m = src.match(new RegExp('const ' + nome + ' = s =>[\\s\\S]*?\\r?\\n(?!\\s*\\.)'));
  assert.ok(m, nome + ' deveria existir');
  return new Function(m[0] + '; return ' + nome + ';')();
}

const escHtml = extrair('escHtml');
const escRich = new Function('escHtml', src.match(/const escRich = s =>[\s\S]*?\r?\n(?!\s*\.)/)[0] + '; return escRich;')(escHtml);

test('escRich libera apenas <strong> do prompt do LLM', () => {
  assert.equal(escRich('Baixo <strong>risco</strong> alto'), 'Baixo <strong>risco</strong> alto');
});

test('escRich nao apaga texto legitimo entre < e > (nao-tag)', () => {
  // Delecao silenciosa de conteudo era o bug: o regex de remocao comia
  // qualquer trecho &lt;...&gt; que nao fosse strong, tag ou nao.
  assert.equal(
    escRich('Varejo < indústria > serviços'),
    'Varejo &lt; indústria &gt; serviços',
    'comparacao com < > precisa sobreviver como texto escapado'
  );
  assert.equal(
    escRich('crescimento < 2% (vs > 5%)'),
    'crescimento &lt; 2% (vs &gt; 5%)'
  );
});

test('escRich mantem tag nao whitelistada inofensiva (escapada, sem execucao)', () => {
  const saida = escRich('<img src=x onerror=alert(1)>');
  assert.ok(!saida.includes('<img'), 'tag real nao pode passar viva');
  assert.ok(saida.includes('&lt;img'), 'tag fora da whitelist deve permanecer como texto escapado');
});

test('relatorios.html rotula por card e considera source_state', () => {
  // stale é array por ativo; array vazio é truthy. O rótulo é por card
  // (indexOf por chave) e cache vencido servido na revalidacao
  // (source_state) tambem conta como defasado.
  const rel = readFileSync(new URL('../../../relatorios.html', import.meta.url), 'utf8');
  assert.ok(rel.includes('function rotuloDe(chave)'), 'rotulo por card deveria existir');
  assert.ok(rel.includes("defasados.indexOf(chave) !== -1 || cacheVelho"), 'rotulo considera chave defasada ou cache velho');
  assert.ok(rel.includes("d.source_state === 'stale'"), 'source_state do cache vencido deveria ser lido');
  assert.ok(rel.includes("rotuloDe('ibovespa')"), 'cards usam o rotulo individual');
});
