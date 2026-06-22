#!/usr/bin/env node
/**
 * atualizar.js — Mirabaud Fechamento de Mercado
 *
 * Coloque o PDF do Fechamento de Mercado nesta pasta e rode:
 *   node atualizar.js
 *
 * Dependências (já instaladas):
 *   pdf-parse  @anthropic-ai/sdk  cheerio  basic-ftp  dotenv
 */

require('dotenv').config();

const fs       = require('fs');
const path     = require('path');
const ftp      = require('basic-ftp');
const cheerio  = require('cheerio');
const Anthropic = require('@anthropic-ai/sdk');

const { PDFParse } = require('pdf-parse');

// ── CONFIG FTP (lê do .env — nunca hardcode credenciais) ────────────────────
const FTP = {
  host:      process.env.FTP_HOST,
  user:      process.env.FTP_USER,
  password:  process.env.FTP_PASS,
  port:      Number(process.env.FTP_PORT) || 21,
  remoteDir: process.env.FTP_REMOTE_DIR || '/public_html',
};

if (!FTP.host || !FTP.user || !FTP.password) {
  throw new Error(
    'Credenciais FTP ausentes.\n' +
    '  Copie .env.example para .env e preencha FTP_HOST, FTP_USER, FTP_PASS.'
  );
}

// ── 1. ENCONTRAR O PDF MAIS RECENTE NA PRÓPRIA PASTA DO SCRIPT ───────────────
//    (busca em __dirname — a pasta onde atualizar.js está)
function encontrarPdfMaisRecente() {
  const dir = __dirname;
  const arquivos = fs.readdirSync(dir)
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .map(f => ({
      nome:    f,
      caminho: path.join(dir, f),
      mtime:   fs.statSync(path.join(dir, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime); // mais recente primeiro

  if (!arquivos.length) {
    throw new Error(
      'Nenhum PDF encontrado.\n' +
      `  Pasta: ${dir}\n` +
      '  Coloque o PDF do Fechamento de Mercado aqui e rode novamente.'
    );
  }

  console.log(`📄 PDF: ${arquivos[0].nome}`);
  return arquivos[0];
}

// ── 2. ENCONTRAR O HTML MAIS RECENTE (suporta nomes com versão) ──────────────
//    Procura 'index.html' primeiro; se não existir, usa o mais recente 'index*.html'
function encontrarHtml(prefixo) {
  const dir   = __dirname;
  const exato = path.join(dir, `${prefixo}.html`);
  if (fs.existsSync(exato)) return exato;

  const pattern = new RegExp(`^${prefixo}.*\\.html$`, 'i');
  const versoes = fs.readdirSync(dir)
    .filter(f => pattern.test(f))
    .map(f => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  if (!versoes.length) throw new Error(`${prefixo}.html não encontrado em ${dir}`);

  console.log(`   Usando: ${versoes[0].f}`);
  return path.join(dir, versoes[0].f);
}

// ── 3. EXTRAIR TEXTO DO PDF ──────────────────────────────────────────────────
async function extrairTextoPdf(caminho) {
  const buffer = fs.readFileSync(caminho);
  const parser = new PDFParse({ data: buffer });
  try {
    const data = await parser.getText();
    return data.text;
  } finally {
    await parser.destroy();
  }
}

// ── 4. EXTRAIR DADOS ESTRUTURADOS VIA CLAUDE ────────────────────────────────
async function extrairDadosComClaude(textoPdf) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'SUA_CHAVE_AQUI') {
    throw new Error(
      'ANTHROPIC_API_KEY não definida.\n' +
      '  Edite o arquivo .env e coloque sua chave da API Anthropic.'
    );
  }

  const client = new Anthropic({ apiKey });

  const prompt = `Você é um assistente financeiro. Leia o texto abaixo de um relatório "Fechamento de Mercado" e extraia os dados em JSON.

Retorne APENAS o JSON puro, sem explicações, sem markdown, sem blocos de código.

Estrutura obrigatória:
{
  "data_display": "DD/MM/AAAA",
  "data_extenso": "DD de mês por extenso de AAAA",
  "titulo": "título conciso do dia (máx 12 palavras, português, descreve o principal evento)",
  "paragrafo1": "primeiro parágrafo de análise (2-4 frases, português formal, sem colchetes, sem anglicismos)",
  "paragrafo2": "segundo parágrafo complementar (2-4 frases, português formal, sem colchetes, sem anglicismos)",
  "resumo_pdf": "texto do teaser que começa APÓS 'No PDF completo:' (3-5 frases sobre o que está no PDF)",
  "risco_geopolitico": {
    "titulo": "título curto do risco do dia (máx 5 palavras, ex: 'WTI US$ 96')",
    "descricao": "descrição do risco em 1 frase"
  },
  "ibovespa": { "valor": "ex: 179.284", "variacao": "ex: -2,55%", "direcao": "up ou down" },
  "dolar":    { "valor": "ex: R$ 5,24",  "variacao": "ex: +1,73%", "direcao": "up ou down" },
  "sp500":    { "valor": "ex: 6.672",    "variacao": "ex: -1,52%", "direcao": "up ou down" }
}

Texto do relatório:
${textoPdf}`;

  const response = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 1024,
    messages:   [{ role: 'user', content: prompt }],
  });

  const texto    = response.content[0].text.trim();
  const jsonLimpo = texto
    .replace(/^```json?\n?/, '')
    .replace(/\n?```$/, '')
    .trim();

  return JSON.parse(jsonLimpo);
}

// ── 5a. ATUALIZAR index.html ─────────────────────────────────────────────────
function atualizarIndex(dados, nomePdf) {
  const src  = encontrarHtml('index');
  const dest = path.join(__dirname, 'index.html');

  const $ = cheerio.load(fs.readFileSync(src, 'utf8'), { decodeEntities: false });

  // Data na seção Market Intelligence
  $('.section-date').text(dados.data_extenso);

  // Título e dois parágrafos do artigo principal
  $('article.market-main h3').first().text(dados.titulo);
  $('article.market-main p').eq(0).text(dados.paragrafo1);
  $('article.market-main p').eq(1).text(dados.paragrafo2);

  // Link do PDF — botão "Baixar PDF" (não afeta o botão da MultiAsset)
  $('a.btn.btn-outline[href$=".pdf"], a.btn.btn-outline[href*="Fechamento"]')
    .attr('href', `./${nomePdf}`);

  // Quatro market-cards — identificados pelo texto do <small>
  $('.market-card').each((_, el) => {
    const card  = $(el);
    const label = card.find('small').text().toLowerCase().trim();

    if (label.includes('ibovespa')) {
      card.find('strong').text(dados.ibovespa.valor);
      card.find('span').text(`Variação diária • ${dados.ibovespa.variacao}`);

    } else if (label.includes('dólar') || label.includes('dolar')) {
      card.find('strong').text(dados.dolar.valor);
      card.find('span').text(`Fechamento • ${dados.dolar.variacao}`);

    } else if (label.includes('s&p')) {
      card.find('strong').text(dados.sp500.valor);
      card.find('span').text(`Fechamento • ${dados.sp500.variacao}`);

    } else {
      // Card de risco geopolítico
      card.find('strong').text(dados.risco_geopolitico.titulo);
      card.find('span').text(dados.risco_geopolitico.descricao);
    }
  });

  fs.writeFileSync(dest, $.html(), 'utf8');
  console.log(`✅ index.html atualizado (salvo em ${dest})`);
}

// ── 5b. ATUALIZAR relatorios.html ────────────────────────────────────────────
function atualizarRelatorios(dados, nomePdf) {
  const src  = encontrarHtml('relatorios');
  const dest = path.join(__dirname, 'relatorios.html');

  const $ = cheerio.load(fs.readFileSync(src, 'utf8'), { decodeEntities: false });

  // Data no bloco .meta (primeiro <strong> dentro de .meta)
  $('.meta strong').first().text(dados.data_display);

  // Parágrafo principal de análise (primeiro <p> dentro do primeiro .panel)
  $('.panel').first().find('p').first().text(`${dados.paragrafo1} ${dados.paragrafo2}`);

  // Bloco teaser-lock — preserva o <strong>No PDF completo:</strong>
  $('.teaser-lock').html(`<strong>No PDF completo:</strong> ${dados.resumo_pdf}`);

  // Link do PDF no botão "Baixar PDF completo"
  $('a[data-track="rel_pdf"]').attr('href', `./${nomePdf}`);

  // Três index-cards: Ibovespa, Dólar, S&P 500
  $('.index-card').each((_, el) => {
    const card  = $(el);
    const label = card.find('.index-name').text().toLowerCase().trim();

    let ativo = null;
    if (label.includes('ibovespa'))             ativo = dados.ibovespa;
    else if (label.includes('dólar') || label.includes('dolar')) ativo = dados.dolar;
    else if (label.includes('s&p'))             ativo = dados.sp500;

    if (ativo) {
      card.find('.index-value').text(ativo.valor);
      card.find('.chg')
        .text(ativo.variacao)
        .removeClass('up down')
        .addClass(ativo.direcao);
    }
  });

  fs.writeFileSync(dest, $.html(), 'utf8');
  console.log(`✅ relatorios.html atualizado (salvo em ${dest})`);
}

// ── 6. UPLOAD VIA FTP ────────────────────────────────────────────────────────
async function uploadFtp(nomePdf) {
  const client = new ftp.Client();
  client.ftp.verbose = false;

  try {
    await client.access({
      host:     FTP.host,
      user:     FTP.user,
      password: FTP.password,
      port:     FTP.port,
      secure:   false,
    });
    console.log('🔌 FTP conectado.');

    const arquivos = [
      { local: path.join(__dirname, 'index.html'),      remoto: `${FTP.remoteDir}/index.html` },
      { local: path.join(__dirname, 'relatorios.html'), remoto: `${FTP.remoteDir}/relatorios.html` },
      { local: path.join(__dirname, nomePdf),           remoto: `${FTP.remoteDir}/${nomePdf}` },
    ];

    for (const arq of arquivos) {
      process.stdout.write(`📤 ${path.basename(arq.local)}... `);
      await client.uploadFrom(arq.local, arq.remoto);
      console.log('✓');
    }

    console.log('🚀 Upload concluído!');
  } finally {
    client.close();
  }
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  Mirabaud — Atualização Fechamento de Mercado');
  console.log('══════════════════════════════════════════════\n');

  const pdf = encontrarPdfMaisRecente();

  console.log('📖 Lendo PDF...');
  const texto = await extrairTextoPdf(pdf.caminho);

  console.log('🤖 Processando com Claude (claude-sonnet-4-6)...');
  const dados = await extrairDadosComClaude(texto);

  console.log('\n   Dados extraídos:');
  console.log(`   Data:       ${dados.data_display}`);
  console.log(`   Título:     ${dados.titulo}`);
  console.log(`   Ibovespa:   ${dados.ibovespa.valor} (${dados.ibovespa.variacao})`);
  console.log(`   Dólar:      ${dados.dolar.valor} (${dados.dolar.variacao})`);
  console.log(`   S&P 500:    ${dados.sp500.valor} (${dados.sp500.variacao})`);
  console.log(`   Risco:      ${dados.risco_geopolitico.titulo}\n`);

  console.log('📝 Atualizando HTMLs...');
  atualizarIndex(dados, pdf.nome);
  atualizarRelatorios(dados, pdf.nome);

  console.log('\n🌐 Enviando para o servidor...');
  await uploadFtp(pdf.nome);

  console.log('\n✨ Concluído!\n');
}

main().catch(err => {
  console.error('\n❌ Erro:', err.message);
  process.exit(1);
});
