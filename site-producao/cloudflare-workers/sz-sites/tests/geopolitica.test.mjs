import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  esc, safeHref, isStale, idadeDias, validateSchema, validateFull, teaserResumo,
  SCHEMA_VERSION, CHAVES_MERCADO, REGIOES, NIVEIS_RISCO,
} from '../../../assets/geopolitica-core.js';
import { handleGeopolitica } from '../src/handlers/geopolitica.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DATA = JSON.parse(readFileSync(join(RAIZ, 'geopolitica-data.json'), 'utf8'));

test('geopolitica-data.json valida no schema v1 completo', () => {
  const v = validateFull(DATA);
  assert.equal(v.ok, true, `erros de schema: ${v.erros.join(' | ')}`);
  assert.equal(DATA.schema_version, SCHEMA_VERSION);
});

test('home: entre 4 e 6 temas materiais, com fato/impacto/gatilho/nivel', () => {
  assert.ok(DATA.themes.length >= 4 && DATA.themes.length <= 6);
  for (const t of DATA.themes) {
    assert.ok(t.fato.length > 20, `tema ${t.id}: fato curto demais`);
    assert.ok(t.impacto_mercados.length > 20, `tema ${t.id}: impacto curto`);
    assert.ok(t.proximo_gatilho.length > 5, `tema ${t.id}: gatilho curto`);
    assert.ok(NIVEIS_RISCO.includes(t.nivel_risco));
  }
});

test('pagina: as 9 regioes obrigatorias existem, cada tese com os 5 blocos', () => {
  for (const id of REGIOES) {
    const r = DATA.regions[id];
    assert.ok(r, `regiao ${id} ausente`);
    assert.ok(Array.isArray(r.teses) && r.teses.length > 0, `regiao ${id} sem teses`);
    for (const t of r.teses) {
      for (const campo of ['fato', 'interpretacao', 'cenario_base', 'risco_alternativo', 'gatilhos']) {
        assert.ok(t[campo] != null, `regiao ${id}: campo ${campo} ausente`);
      }
      assert.ok(t.gatilhos.length > 0, `regiao ${id}: gatilhos vazio`);
    }
  }
});

test('as 12 variaveis de mercado obrigatorias estao presentes (petroleo a BRL)', () => {
  assert.deepEqual(Object.keys(DATA.market_impacts).sort(), [...CHAVES_MERCADO].sort());
});

test('nenhum cenario tem probabilidade numerica (sem probabilidades falsas)', () => {
  for (const s of DATA.scenarios) {
    assert.equal(s.probabilidade, null, `cenario ${s.titulo} tem probabilidade`);
  }
});

test('fontes: todas https, com veiculo, data e tipo classificado', () => {
  assert.ok(DATA.sources.length >= 8);
  for (const f of DATA.sources) {
    assert.match(f.url, /^https:\/\//i, `fonte nao-https: ${f.url}`);
    assert.ok(f.veiculo && f.titulo && f.data);
    assert.ok(['primaria', 'analise', 'mercado', 'secundaria', 'interna'].includes(f.tipo));
  }
});

test('XSS: esc() neutraliza injecao de script, aspas e atributos', () => {
  const injecoes = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '" onmouseover="alert(1)',
    "'; DROP TABLE --",
    '</p><svg onload=alert(1)>',
  ];
  for (const i of injecoes) {
    const saida = esc(i);
    assert.ok(!saida.includes('<') && !saida.includes('>'), `saida contem tag: ${saida}`);
    assert.ok(!saida.includes('"') && !saida.includes("'"), `saida contem aspa bruta: ${saida}`);
  }
  // texto legitimo nao pode ser destruido
  assert.equal(esc('Guerra EUA-Israel & Irã: "<prêmio>" de risco'), 'Guerra EUA-Israel &amp; Irã: &quot;&lt;prêmio&gt;&quot; de risco');
});

test('safeHref: so http(s) vira href; javascript:/data:/vbscript: sao rejeitados', () => {
  assert.equal(safeHref('https://www.reuters.com/'), 'https://www.reuters.com/');
  assert.equal(safeHref('http://exemplo.com/a'), 'http://exemplo.com/a');
  assert.equal(safeHref('javascript:alert(1)'), null);
  assert.equal(safeHref('data:text/html,<script>alert(1)</script>'), null);
  assert.equal(safeHref('vbscript:msgbox'), null);
  assert.equal(safeHref(''), null);
  assert.equal(safeHref(null), null);
  assert.equal(safeHref('JAVASCRIPT:alert(1)'), null);
});

test('stale: edicao velha e detectada; data invalida e stale por construcao', () => {
  const agora = new Date();
  const dias = (n) => new Date(agora.getTime() - n * 86400000).toISOString();
  assert.equal(isStale(dias(1)), false);
  assert.equal(isStale(dias(9)), false);
  assert.equal(isStale(dias(11)), true);
  assert.equal(isStale(dias(30)), true);
  assert.equal(isStale('data-invalida'), true);
  assert.equal(idadeDias('data-invalida'), Number.POSITIVE_INFINITY);
});

test('validacao falha fechada com payload malformado (pagina sem dados)', () => {
  for (const ruim of [null, {}, [], { schema_version: 99 }]) {
    const v = validateFull(ruim);
    assert.equal(v.ok, false, JSON.stringify(ruim));
  }
  const v1 = validateSchema({});
  assert.equal(v1.ok, false);
  assert.ok(v1.erros.length > 0);
});

test('week.iso aponta para uma segunda-feira real (calendario ISO)', () => {
  const m = /^(\d{4})-W(\d{2})$/.exec(DATA.week.iso);
  assert.ok(m, 'week.iso fora do formato');
  // ISO 8601: segunda da semana W. Calculo: 4/jan e sempre na semana 1.
  const ano = Number(m[1]);
  const sem = Number(m[2]);
  const quatroJan = new Date(Date.UTC(ano, 0, 4));
  const dow = (quatroJan.getUTCDay() + 6) % 7; // segunda = 0
  const segundaW1 = new Date(quatroJan);
  segundaW1.setUTCDate(quatroJan.getUTCDate() - dow);
  const segundaAlvo = new Date(segundaW1);
  segundaAlvo.setUTCDate(segundaW1.getUTCDate() + (sem - 1) * 7);
  const iso = segundaAlvo.toISOString().slice(0, 10);
  assert.equal(DATA.week.start, iso, `week.start ${DATA.week.start} != segunda da semana ISO ${iso}`);
  const fim = new Date(segundaAlvo);
  fim.setUTCDate(fim.getUTCDate() + 6);
  assert.equal(DATA.week.end, fim.toISOString().slice(0, 10));

test('redundancia: temas e teses com no minimo 2 fontes independentes', () => {
  for (const t of DATA.themes) {
    assert.ok(t.sources.length >= 2, `tema ${t.id} com ${t.sources.length} fontes`);
  }
  for (const id of REGIOES) {
    for (const t of DATA.regions[id].teses) {
      assert.ok(t.sources.length >= 2, `tese de ${id} com ${t.sources.length} fontes`);
    }
  }
  // Teses de risco critico/elevado (alto impacto) pedem 3: checa no tema da home.
  for (const t of DATA.themes) {
    if (t.nivel_risco === 'critico' || t.nivel_risco === 'elevado') {
      assert.ok(t.sources.length >= 3, `tema de alto impacto ${t.id} com ${t.sources.length} fontes (minimo 3)`);
    }
  }
});

test('handler: 503 explicito quando o arquivo nao existe (pagina sem dados)', async () => {
  const env = { ASSETS: { fetch: async () => new Response('not found', { status: 404 }) } };
  const req = new Request('https://szuchmacher.com.br/assets/geopolitica.php');
  const res = await handleGeopolitica(env, req);
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.ok, false);
});

test('handler: repassa o JSON com content-type e CORS quando o asset existe', async () => {
  const corpo = JSON.stringify(DATA);
  const env = {
    ASSETS: {
      fetch: async (r) => {
        // o handler deve reescrever o path para o arquivo estatico
        assert.equal(new URL(r.url).pathname, '/sz/geopolitica-data.json');
        assert.equal(r.method, 'GET');
        return new Response(corpo, { status: 200, headers: { 'Content-Type': 'application/json' } });
      },
    },
  };
  const req = new Request('https://szuchmacher.com.br/assets/geopolitica.php');
  const res = await handleGeopolitica(env, req);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Type'), /application\/json/);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
  const body = await res.json();
  assert.equal(body.schema_version, 1);
});

});

test('teaserResumo: para na primeira frase de verdade, ignora ponto de abreviacao', () => {
  assert.equal(
    teaserResumo('PIB projetado em 1.92% a.a. evidencia desaceleracao significativa e traz revisao para baixo.'),
    'PIB projetado em 1.92% a.a. evidencia desaceleracao significativa e traz revisao para baixo.',
  );
  assert.equal(
    teaserResumo('Spread de 7,5 p.p. no trimestre supera o consenso. Mercado revisa curva DI para cima.'),
    'Spread de 7,5 p.p. no trimestre supera o consenso.',
  );
  assert.equal(
    teaserResumo('O Sr. Fulano afirmou que o cenario e grave. O mercado reagiu mal.'),
    'O Sr. Fulano afirmou que o cenario e grave.',
  );
});

test('teaserResumo: decimal com ponto nunca e confundido com fim de frase', () => {
  assert.equal(
    teaserResumo('Peso do indicador em 1.92 no trimestre. Segue acima da media historica.'),
    'Peso do indicador em 1.92 no trimestre.',
  );
});

test('teaserResumo: frase unica sem outro ponto final devolve o texto inteiro', () => {
  assert.equal(
    teaserResumo('Frase unica sem outro ponto final alem do encerramento'),
    'Frase unica sem outro ponto final alem do encerramento',
  );
});

test('teaserResumo: multiplas frases normais corta so na primeira', () => {
  assert.equal(
    teaserResumo('Consulado alemao fechado em Sao Petersburgo. Enviados de Trump alternaram Moscou e Kiev sem cessar-fogo a vista.'),
    'Consulado alemao fechado em Sao Petersburgo.',
  );
});

test('teaserResumo: pontuacao final colada em aspas/parenteses tambem corta', () => {
  assert.equal(
    teaserResumo('Ele afirmou: "a situacao esta grave." O mercado reagiu mal.'),
    'Ele afirmou: "a situacao esta grave."',
  );
  assert.equal(
    teaserResumo('O ministro perguntou: "vai piorar?" O mercado reagiu com cautela.'),
    'O ministro perguntou: "vai piorar?"',
  );
  assert.equal(
    teaserResumo('(Fitch rebaixou o rating.) O mercado reagiu com queda forte.'),
    '(Fitch rebaixou o rating.)',
  );
});
