
// ── CLOCK ──
function updateClock() {
    const now = new Date();
    const t = now.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    document.getElementById('nav-clock').textContent = t + ' BRT';

    const d = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'short', year: 'numeric' });
    const heroDate = document.getElementById('hero-date');
    if (heroDate) heroDate.textContent = d.replace(' de ', ' ');
}
setInterval(updateClock, 1000);
updateClock();

// ── TABS ──
function switchTab(btn, panelId) {
    document.querySelectorAll('.tv-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tv-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(panelId).classList.add('active');
}

// ── SIMULATOR NAV ──
function activateSim(panelId, btn) {
    document.querySelectorAll('.sim-nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.sim-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(panelId).classList.add('active');
    if (panelId === 'sim-comparador') setTimeout(recalcComparador, 100);
}

// ── CALCULATION ENGINE — fórmula correta de juros compostos ──
// Aportes mensais convertidos para taxa mensal equivalente
// FV = PV*(1+r)^n + PMT * [((1+r)^n - 1) / r]
// onde r = taxa mensal = (1 + taxa_anual)^(1/12) - 1
function calcSerie(inicial, aporte, taxaAnual, prazo) {
    const anos = parseInt(prazo) || 10;
    const r    = Math.pow(1 + taxaAnual, 1 / 12) - 1; // taxa mensal equivalente
    const serie = [];
    for (let y = 0; y <= anos; y++) {
        const n   = y * 12; // número de meses
        // A condição era `r > 0`, então qualquer taxa negativa caía em `aporte * n`
        // e os aportes eram somados a valor de face, como se rendessem 0% em vez de
        // renderem negativo. A fórmula de anuidade vale para r negativo; só r === 0
        // precisa do caso especial. Com BTC pessimista a −10% a.a., 10k inicial e
        // 500/mês por 4 anos, o bug devolvia 30.561 no lugar de 26.231 (+16,5%).
        const fv  = inicial * Math.pow(1 + r, n)
                  + (r !== 0
                      ? aporte * (Math.pow(1 + r, n) - 1) / r
                      : aporte * n);
        serie.push(Math.max(fv, 0));
    }
    return serie;
}

function calcFinal(inicial, aporte, taxa, prazo) {
    const s = calcSerie(inicial, aporte, taxa, prazo);
    return s[s.length - 1];
}

function fmt(n, decimals = 2) {
    return n.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtUSD(v) {
    if (v >= 1e6) return '$ ' + (v/1e6).toFixed(2).replace('.', ',') + ' M';
    return '$ '  + fmt(v, 0);
}

function fmtRet(final, inicial, aporte, prazo) {
    const total = inicial + aporte * 12 * prazo;
    const ret = ((final - total) / total) * 100;
    return (ret >= 0 ? '+' : '') + fmt(ret, 1) + '%';
}

// ── AUTOMAÇÃO CENTRAL (preços, macro, simuladores, benchmark) ───────────────
window.macroLive = {
    selic: 0.145,
    ipca: 0.055,
    cdi: 0.144,
    usd: 5.09,
    ntnbSpread: 0.075,
    selicTerminal: 0.12
};
// ── CENARIOS GEOPOLITICOS (EUA-China 2026-2030) ──────────────────────────
// Calibrados com: Polymarket (20/07/2026), Good Judgment, Metaculus,
// Allison Thucydides Trap (Harvard), Correlates of War, GPR Index (Caldara-Iacoviello)
// Parametros de crise: calibrados em 21 crises historicas (1990-2026)
// Metodologia: Base Rate Bayesiana + Escada de Escalada (Kahn) + Regime-Switching de Vol

window.geoScenarios = [
    {
        id: 'cold-war', nome: 'Guerra fria administrada', probMin: 0.35, probMax: 0.55,
        desc: 'Desacoplamento tecnologico e comercial sem ruptura militar. Tarifas estruturais de 25-45%, restricoes a semicondutores e IA, blocos comerciais paralelos. Brasil mantem posicao nao-alinhada pragmatica. Cenario modal (35-55%).',
        retornos: { gold: 0.095, silver: 0.06, platinum: 0.03, copper: 0.12, btc: 0.30, ntnb: 0.13, cdi: 0.12, ouro: 0.095, prata: 0.06, platina: 0.03, cobre: 0.12 },
        macro: { selic: [0.145,0.138,0.130,0.125,0.120], ipca: [0.055,0.050,0.047,0.045,0.045], usdbrl: [5.09,5.25,5.35,5.40,5.50], brent: [78,82,80,78,75] },
        correlShift: { goldBtc: 0.10, goldSilver: 0.05, goldPlatinum: 0.03 },
        setoresBR: {
            beneficiados: ['<strong>Ouro e metais preciosos</strong> — demanda estrutural por refugio em desacoplamento','<strong>Cobre</strong> — blocos paralelos duplicam investimento em rede eletrica e fabricacao de semicondutores','<strong>NTN-B e renda fixa real</strong> — juros elevados sustentam premios por periodo prolongado','<strong>Agronegocio exportador</strong> — Brasil supre ambos os blocos, poder de precificacao ampliado','<strong>Petroleo e energia</strong> — pre-sal e renovaveis com demanda dual EUA-China'],
            penalizados: ['<strong>Semicondutores e tecnologia BR</strong> — corte de cadeias asiaticas e custos logisticos','<strong>Varejo importador</strong> — tarifas elevadas e fragmentacao comprimem margens','<strong>Industria automotiva</strong> — cadeias bipartidas, custos de compliance regulatorio'],
            neutros: ['<strong>Bancos e financeiro</strong> — juros altos sustentam spread, inadimplencia sobe com desaceleracao','<strong>Infraestrutura</strong> — depende mais de fiscal domestico que de geopolitica externa']
        }
    },
    {
        id: 'limited-conflict', nome: 'Escalada com conflito limitado', probMin: 0.15, probMax: 0.30,
        desc: 'Confronto naval ou aereo localizado no Mar do Sul da China ou Estreito de Taiwan. Sem escalada nuclear. Sancoes financeiras severas (SWIFT parcial, reservas congeladas). Petroleo dispara temporariamente (USD 105-130/bbl).',
        retornos: { gold: 0.20, silver: 0.12, platinum: 0.05, copper: 0.08, btc: 0.50, ntnb: 0.10, cdi: 0.11, ouro: 0.20, prata: 0.12, platina: 0.05, cobre: 0.08 },
        macro: { selic: [0.145,0.140,0.135,0.130,0.125], ipca: [0.055,0.058,0.055,0.050,0.048], usdbrl: [5.09,5.50,5.70,5.60,5.80], brent: [78,95,105,90,85] },
        correlShift: { goldBtc: 0.20, goldSilver: 0.10, goldPlatinum: 0.05 },
        setoresBR: {
            beneficiados: ['<strong>Ouro e reserva de valor</strong> — demanda extraordinaria em crise militar localizada','<strong>Petroleo e gas</strong> — pre-sal se beneficia de Brent acima de USD 100','<strong>Defesa e seguranca</strong> — reaparelhamento militar global','<strong>Agricultura de commodities</strong> — disrupcao de cadeias eleva premio de exportadores confiaveis'],
            penalizados: ['<strong>BRL e ativos em reais</strong> — flight-to-quality para USD, real deprecia aceleradamente','<strong>Empresas com divida em USD</strong> — depreciacao cambial comprime balancos','<strong>Turismo e aviacao</strong> — reducao de viagens e custo de combustivel'],
            neutros: ['<strong>Bitcoin e cripto</strong> — volatilidade bidirecional, beneficio de narrativa vs risco de aversao','<strong>Cobre</strong> — rotas navais interrompidas apertam a oferta, desaceleracao industrial corta o consumo civil','<strong>Renda fixa curta</strong> — Selic elevada oferece protecao nominal, perde para inflacao e cambio']
        }
    },
    {
        id: 'de-escalation', nome: 'Desescalada negociada', probMin: 0.10, probMax: 0.25,
        desc: 'Acordo comercial parcial EUA-China. Relaxamento de tarifas e sancoes tecnologicas. Retomada de fluxos de investimento bilateral. Ambiente global mais previsivel. Dolar enfraquece, emergentes se beneficiam.',
        retornos: { gold: 0.05, silver: 0.14, platinum: 0.15, copper: 0.18, btc: 0.60, ntnb: 0.10, cdi: 0.09, ouro: 0.05, prata: 0.14, platina: 0.15, cobre: 0.18 },
        macro: { selic: [0.145,0.130,0.120,0.110,0.100], ipca: [0.055,0.048,0.045,0.043,0.040], usdbrl: [5.09,5.00,4.85,4.75,4.70], brent: [78,75,72,70,68] },
        correlShift: { goldBtc: -0.10, goldSilver: -0.05, goldPlatinum: -0.05 },
        setoresBR: {
            beneficiados: ['<strong>Acoes ciclicas e small caps</strong> — juros menores e crescimento global favorecem multiples','<strong>Cobre</strong> — retomada industrial com dolar fraco atinge em cheio o metal mais sensivel ao ciclo','<strong>Platina e paladio</strong> — retomada industrial global eleva demanda','<strong>Real e ativos em BRL</strong> — apreciacao cambial e fluxos de portfolio','<strong>Tecnologia e inovacao</strong> — reducao de restricoes reduz custos de cadeia'],
            penalizados: ['<strong>Ouro</strong> — perda de premio de risco geopolitico reduz demanda por refugio','<strong>Renda fixa prefixada longa</strong> — queda de juros reduz fluxo de caixa corrente'],
            neutros: ['<strong>Bitcoin</strong> — ganha com risk-on, perde narrativa de hedge contra colapso sistemico','<strong>Energia</strong> — preco do petroleo cai, volume de exportacao se mantem']
        }
    },
    {
        id: 'exogenous-shock', nome: 'Cooperacao por choque exogeno', probMin: 0.05, probMax: 0.15,
        desc: 'Crise global compartilhada (pandemia, catastrofe climatica ou crise financeira sistemica) forca cooperacao pragmatica EUA-China. Acordos de estabilizacao financeira e climatica. Juros globais caem para combater recessao.',
        retornos: { gold: 0.15, silver: 0.08, platinum: 0.02, copper: -0.10, btc: 0.80, ntnb: 0.08, cdi: 0.07, ouro: 0.15, prata: 0.08, platina: 0.02, cobre: -0.10 },
        macro: { selic: [0.145,0.120,0.100,0.090,0.085], ipca: [0.055,0.045,0.040,0.038,0.035], usdbrl: [5.09,5.10,5.00,4.90,4.85], brent: [78,60,55,58,62] },
        correlShift: { goldBtc: 0.25, goldSilver: 0.08, goldPlatinum: 0.02 },
        setoresBR: {
            beneficiados: ['<strong>Bitcoin e ativos digitais</strong> — crise de confianca no sistema financeiro tradicional','<strong>Ouro</strong> — refugio em crise global, mesmo com cooperacao parcial','<strong>Renda fixa soberana BR</strong> — juros em queda acelerada geram ganho de capital'],
            penalizados: ['<strong>Cobre e commodities ciclicas</strong> — colapso de demanda industrial global','<strong>Petroleo</strong> — Brent abaixo de USD 60 comprime receitas','<strong>Bancos</strong> — inadimplencia explode com recessao global sincronizada'],
            neutros: ['<strong>Platina</strong> — colapso industrial vs cooperacao reconstroi cadeias','<strong>Agronegocio</strong> — demanda alimentar resistente, precos caem com deflacao global']
        }
    },
    {
        id: 'direct-conflict', nome: 'Conflito armado direto', probMin: 0.03, probMax: 0.08,
        desc: 'Confronto militar aberto no Pacifico com baixas significativas. Bloqueios navais, ciberataques a infraestrutura, interrupcao de cadeias de suprimento globais. Potencial escalada nuclear limitada. Cenario de cauda (3-8%).',
        retornos: { gold: 0.35, silver: 0.25, platinum: 0.10, copper: 0.20, btc: 1.50, ntnb: 0.15, cdi: 0.14, ouro: 0.35, prata: 0.25, platina: 0.10, cobre: 0.20 },
        macro: { selic: [0.145,0.155,0.170,0.180,0.180], ipca: [0.055,0.070,0.085,0.090,0.085], usdbrl: [5.09,6.00,6.50,7.00,7.50], brent: [78,110,130,120,110] },
        correlShift: { goldBtc: 0.30, goldSilver: 0.20, goldPlatinum: 0.12 },
        setoresBR: {
            beneficiados: ['<strong>Ouro fisico</strong> — unico ativo com valor preservado em conflito sistemico global','<strong>Petroleo e commodities energeticas</strong> — disrupcao de oferta eleva precos a niveis extremos','<strong>Producao agricola basica</strong> — alimentos se tornam ativo estrategico','<strong>Ativos em moeda forte (offshore)</strong> — BRL colapsa, USD/CHF/JPY disparam'],
            penalizados: ['<strong>Acoes e credito corporativo</strong> — mercados financeiros podem fechar temporariamente','<strong>Sistema bancario</strong> — risco sistemico, corridas bancarias, controles de capital','<strong>Infraestrutura conectada</strong> — ciberataques a grids eletricos e sistemas de pagamento'],
            neutros: ['<strong>Bitcoin</strong> — extremo beneficio como reserva descentralizada vs risco de proibicao estatal','<strong>Platina</strong> — demanda militar vs colapso da demanda civil de automoveis','<strong>Cobre</strong> — disrupcao de oferta e demanda de reaparelhamento contra paralisia industrial civil']
        }
    }
];

// Ativo selecionado (null = sem overlay geopolitico, usa cenario base)
window.geoActiveScenario = null;

// Correlacoes base entre pares de ativos (tempos normais) — calibradas em serie historica 2018-2026
window.geoBaseCorrelations = {
    'gold-silver': 0.65, 'gold-platinum': 0.55, 'gold-btc': 0.15,
    'silver-platinum': 0.70, 'silver-btc': 0.12, 'platinum-btc': 0.08,
    // Cobre medido em 30/07/2026 na mesma janela, log-retornos mensais de HG=F contra
    // GC=F, SI=F, PL=F e BTC-USD, jan/2018 a jul/2026. Correlacao baixa com ouro
    // porque cobre e risk-on e ouro e refugio; mais alta com prata e platina, que
    // tambem tem demanda industrial.
    'gold-copper': 0.33, 'silver-copper': 0.46, 'platinum-copper': 0.40, 'copper-btc': 0.18
};

// Parametros de calibracao (fontes academicas + prediction markets)
// Base rate great-power war (1945-presente): ~1.2%/ano (Correlates of War)
// Disputa para guerra (grandes potencias, pos-1945): ~7.7% condicional (COW)
// Thucydides Trap: 12/16 casos historicos = 75% forcas estruturais (Allison, Harvard)
// Clauset (Science 2018): "Long Peace" pos-1945 nao e estatisticamente significativa
// Gold-BTC correlacao atual: -0.88 (minima historica, State Street 2026)
// Gold spike inicial em crises: +3 a +8% (48h), reverte em 2-6 meses
// BTC drawdown em crise geopolitica: -5 a -15% inicial, -35 a -50% maximo
// S&P 500 drawdown medio geopolitico: -4.4% (recuperacao 39 dias, LPL Research)
// BRL gap risk diario em crise: 3-5% (BoJ carry unwind 2024)
// Amplificacao de vol em crise: ouro ~1.5x, BTC ~2x, petroleo ~2-2.5x
// Defesa/Aerospace outperformance medio: +10.8% (6m), +9.1% (12m)
// Gold retorno medio ate equity trough: +14% (~7m), +31% (17m)
// GPR 1sd shock: cross-border portfolio flows -15% (IMF GFSR 2023)

// Modelo de drawdown total do BTC pessimista: o cliente termina com 40% do que
// aportou. Só vale enquanto simConfigs.btc.pess === null, ou seja, enquanto o
// BTC Radar não responde. Ver BTC_PESS_FALLBACK_ANUAL abaixo.
window.btcPessMultiplier = 0.40;

// Retorno anual do BTC pessimista usado pela carteira enquanto simConfigs.btc.pess
// é null. A carteira precisa de uma taxa anual: o multiplicador de drawdown total
// não tem equivalente anual estável (depende do prazo e do fluxo de aportes, que
// diferem entre o simulador do ativo e a projeção do portfólio).
const BTC_PESS_FALLBACK_ANUAL = -0.15;

window.cenarioDescricoes = {
    pessimista: 'Geopolítica deteriorada, juros altos por mais tempo, dólar forte.',
    base: 'Ciclo de cortes do BCB em andamento, com incerteza geopolítica moderada e desinflação gradual.',
    otimista: 'Resolução do conflito geopolítico, queda acelerada de juros globais, dólar em enfraquecimento estrutural.'
};

// FONTE ÚNICA DE PREMISSA DE RETORNO: window.taxasCenario deriva de simConfigs.
// Antes eram dois objetos independentes descrevendo a mesma coisa, o retorno anual
// esperado de um ativo num cenário. simConfigs alimenta os cards dos simuladores (o
// número que o cliente lê como texto) e taxasCenario alimenta o gráfico "Projeção do
// Portfólio vs Benchmarks", o Monte Carlo da carteira e o overlay geopolítico.
// Divergências medidas em produção em 27/07/2026, todas visíveis na mesma tela:
//   BTC base      card +50% a.a. (BTC Radar)  x  carteira +40% a.a. (literal parado)
//   BTC pessimista card −10% a.a.             x  carteira −15% a.a.
//   BTC otimista   card +110% a.a.            x  carteira +120% a.a.
//   ouro pessimista   card +4% a.a.           x  carteira +5% a.a.
//   platina pessimista card −5% a.a.          x  carteira +1% a.a.
// simConfigs é o lado canônico: é o que os rótulos publicados no HTML já exibem
// (g-rate-cons "+4% a.a.", p-rate-cons "−5% a.a.") e o que os feeds server-side
// atualizam. Mesma classe de defeito que VOL_PORT/VOL_ANUAL resolveu para volatilidade.
window.taxasCenario = { pessimista: {}, base: {}, otimista: {} };

// Consumidores leem ora a chave PT-BR, ora a EN (`taxasAtivo.ouro || taxasAtivo.gold`).
const TAXAS_ALIAS_PTBR  = { gold: 'ouro', silver: 'prata', platinum: 'platina', copper: 'cobre' };
const TAXAS_CENARIO_SEL = { pess: 'pessimista', base: 'base', otim: 'otimista' };

// Reprojeta taxasCenario a partir de simConfigs. Chamar depois de qualquer escrita
// em simConfigs, senão a carteira continua projetando a premissa antiga.
// Nota: cdi, ntnb e reserva são reprojetados aqui por consistência, mas as projeções
// do portfólio não os leem daqui, usam getSelicAno()/getNtnbAno(), que modelam a
// estrutura a termo (Selic caindo para a terminal) em vez de uma taxa plana.
function rebuildTaxasCenario() {
    Object.keys(TAXAS_CENARIO_SEL).forEach(function (sel) {
        const alvo = window.taxasCenario[TAXAS_CENARIO_SEL[sel]];
        Object.keys(simConfigs).forEach(function (asset) {
            let taxa = simConfigs[asset][sel];
            if (taxa == null) {
                if (asset === 'btc' && sel === 'pess') taxa = BTC_PESS_FALLBACK_ANUAL;
                else return; // sem premissa definida: não sobrescreve o que já existe
            }
            alvo[asset] = taxa;
            if (TAXAS_ALIAS_PTBR[asset]) alvo[TAXAS_ALIAS_PTBR[asset]] = taxa;
        });
    });
}

// REMOVIDO em 27/07/2026: parseTaxaMacro convertia texto livre do payload macro em
// premissa de retorno. O campo `ativos[x][perfil].taxa` do /macro_api.php nunca foi
// retorno, e sim faixa de alocação ("8-12% do patrimônio"). O regex capturava o segundo
// número da faixa junto com o hífen, então ouro no cenário base virava -12% a.a.
// Premissa de retorno de projeção exibida a cliente não vem mais de string de LLM:
// as taxas válidas são apenas as curadas em simConfigs e as que os feeds
// server-side gravam lá via applyScenarioRates(). window.taxasCenario deriva delas.

function getSelicAno(y) {
    const base = window.macroLive.selic || 0.145;
    const terminal = window.macroLive.selicTerminal || 0.12;
    if (y <= 0) return base;
    if (y === 1) return base - (base - terminal) * 0.45;
    if (y === 2) return base - (base - terminal) * 0.75;
    return terminal;
}

function getIpcaAno(y) {
    const base = window.macroLive.ipca || 0.055;
    const terminal = Math.max(0.045, base - 0.01);
    if (y <= 0) return base;
    if (y === 1) return base - 0.005;
    if (y === 2) return base - 0.009;
    return terminal;
}

function getNtnbAno(y) {
    return getIpcaAno(y) + (window.macroLive.ntnbSpread || 0.075);
}

function updateBenchAssumptionsUI() {
    const selicEl = document.getElementById('bench-assume-selic');
    const ntnbEl = document.getElementById('bench-assume-ntnb');
    const ipcaEl = document.getElementById('bench-assume-ipca');
    const s0 = (window.macroLive.selic * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const sT = (window.macroLive.selicTerminal * 100).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
    const i0 = (window.macroLive.ipca * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const iT = (getIpcaAno(5) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const spread = ((window.macroLive.ntnbSpread || 0.075) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    if (selicEl) selicEl.textContent = s0 + '% → ' + sT + '% a.a.';
    if (ntnbEl) ntnbEl.textContent = 'IPCA + ' + spread + '% a.a.';
    if (ipcaEl) ipcaEl.textContent = i0 + '% → ' + iT + '% a.a.';
}

// REMOVIDO em 27/07/2026: syncSimConfigsFromAtivos e syncTaxasCenarioFromAtivos
// sobrescreviam as premissas de retorno de ouro, prata, platina e BTC com o parse do
// campo `taxa` do payload macro, que é faixa de alocação. Efeito medido em produção:
// os quatro ativos de risco projetavam retorno negativo em todos os cenários, com o
// otimista pior que o pessimista (ouro -8% / -12% / -15% a.a.), e a carteira aparecia
// abaixo do CDI e da NTN-B em qualquer combinação de perfil e cenário. Moderado x Base
// em 5 anos mostrava +28,4% contra +74,5% da NTN-B, quando a premissa curada dá +92,5%.

function syncAutomationFromMacro(d) {
    if (!d) return;
    if (d.premissas_cenarios) window.cenarioDescricoes = Object.assign({}, window.cenarioDescricoes, d.premissas_cenarios);
    Object.keys(simConfigs).forEach(function (asset) { recalcSim(asset); });
    updateBenchAssumptionsUI();
    if (typeof desenharBenchmark === 'function') desenharBenchmark();
    if (portfolioMCOpen && typeof _runPortfolioMC === 'function') _runPortfolioMC();
}

function getCenarioDescricao(cenario) {
    return window.cenarioDescricoes[cenario] || '';
}

const simConfigs = {
    gold:     { ini: 'g-inicial', ap: 'g-aporte', prazo: 'g-prazo', pess: 0.04,  base: 0.093, otim: 0.15,  prefix: 'g', sel: 'pess' },
    silver:   { ini: 's-inicial', ap: 's-aporte', prazo: 's-prazo', pess: 0.03,  base: 0.085, otim: 0.18,  prefix: 's', sel: 'pess' },
    platinum: { ini: 'p-inicial', ap: 'p-aporte', prazo: 'p-prazo', pess: -0.05, base: 0.06,  otim: 0.20,  prefix: 'p', sel: 'pess' },
    copper:   { ini: 'cu-inicial',ap: 'cu-aporte',prazo: 'cu-prazo',pess: -0.08, base: 0.08,  otim: 0.20,  prefix: 'cu', sel: 'pess' },
    btc:      { ini: 'b-inicial', ap: 'b-aporte', prazo: 'b-prazo', pess: null,  base: 0.40,  otim: 1.20,  prefix: 'b', sel: 'pess' },
    cdi:      { ini: 'c-inicial', ap: 'c-aporte', prazo: 'c-prazo', pess: 0.12,  base: 0.1425, otim: 0.165, prefix: 'c', sel: 'pess' },
    ntnb:     { ini: 'n-inicial', ap: 'n-aporte', prazo: 'n-prazo', pess: 0.10,  base: 0.13,   otim: 0.16,  prefix: 'n', sel: 'pess' },
    usdbrl:   { ini: 'u-inicial', ap: 'u-aporte', prazo: 'u-prazo', pess: -0.10, base: 0.0,    otim: 0.10,  prefix: 'u', sel: 'pess' },
};

// Primeira projeção, com as premissas curadas. Os feeds server-side abaixo
// reprojetam conforme respondem.
rebuildTaxasCenario();

// Ponto único de escrita de premissa de retorno vinda de feed server-side.
// Grava em simConfigs, reprojeta taxasCenario e atualiza todos os consumidores dos
// dois. Cada feed escrevia só em simConfigs, então o card do ativo e a projeção da
// carteira exibiam retornos diferentes para o mesmo ativo no mesmo cenário.
function applyScenarioRates(asset, r) {
    const c = simConfigs[asset];
    if (!c || !r) return;
    if (r.pess != null) c.pess = r.pess;
    if (r.base != null) c.base = r.base;
    if (r.otim != null) c.otim = r.otim;

    rebuildTaxasCenario();

    // Consumidores de taxasCenario. Cada um tem guarda própria: desenharBenchmark
    // sai se o canvas não existir, os dois _refresh só recalculam com o painel aberto.
    if (typeof desenharBenchmark === 'function') desenharBenchmark();
    if (typeof _refreshPortfolioMC === 'function') _refreshPortfolioMC();
    if (typeof _refreshGeoPortfolioMC === 'function') _refreshGeoPortfolioMC();
    if (typeof _renderGeoReturnChart === 'function' && window.geoScenarios) _renderGeoReturnChart();

    // Consumidor de simConfigs: o card do próprio ativo, se estiver visível.
    const painel = document.getElementById('sim-' + asset);
    if (painel && painel.classList.contains('active')) recalcSim(asset);
}

// ── BTC Radar: ajuste de cenarios (server-side, sem exposicao de dados) ──
(function fetchBtcScenarios() {
    fetch('/api/btc-scenarios')
        .then(function(r) { return r.json(); })
        .then(function(d) {
            if (!d.ok || !d.rates) return;
            var r = d.rates;
            // Grava a premissa nos dois consumidores (card do BTC e carteira)
            applyScenarioRates('btc', r);
            // Atualiza labels visiveis nos cards
            var labelPess = document.getElementById('b-rate-cons');
            var labelBase = document.getElementById('b-rate-mod');
            var labelOtim = document.getElementById('b-rate-agr');
            if (labelPess) labelPess.textContent = (r.pess >= 0 ? '+' : '') + Math.round(r.pess * 100) + '% a.a.';
            if (labelBase) labelBase.textContent = (r.base >= 0 ? '+' : '') + Math.round(r.base * 100) + '% a.a.';
            if (labelOtim) labelOtim.textContent = (r.otim >= 0 ? '+' : '') + Math.round(r.otim * 100) + '% a.a.';
            // Atualiza descricao do cenario conservador (deixa de ser perda total)
            var descPess = document.getElementById('b-desc-cons');
            if (descPess && r.pess != null) {
                descPess.textContent = 'Cenario de stress com dados de mercado atualizados. Fear & Greed Index e sinais de trading de longo prazo indicam ' + (r.pess >= 0 ? 'desaceleracao' : 'correcao') + ' com retorno anual de ' + (r.pess >= 0 ? '+' : '') + Math.round(r.pess * 100) + '%. Drawdowns historicos de 77-84% sao possiveis em eventos extremos (colapso de exchange, vulnerabilidade criptografica, aperto regulatorio severo).';
                // Trava o texto: o payload macro também escreve em b-desc-cons e, se
                // chegasse depois, o card mostraria "−10% a.a." ao lado de uma descrição
                // falando em perda de 60% do capital. Quem define a taxa define o texto.
                window._btcRadarDescAplicada = true;
            }
        })
        .catch(function() {
            // fallback silencioso: taxas hardcoded permanecem
        });
})();

// ── CDI: ajuste de cenarios via server-side ──
(function fetchCdiScenarios() {
    fetch('/api/cdi-scenarios')
        .then(function(r) { return r.json(); })
        .then(function(d) {
            if (!d.ok || !d.rates) return;
            var r = d.rates;
            applyScenarioRates('cdi', r);
            var labelPess = document.getElementById('c-rate-cons');
            var labelBase = document.getElementById('c-rate-mod');
            var labelOtim = document.getElementById('c-rate-agr');
            if (labelPess) labelPess.textContent = '+' + Math.round(r.pess * 100) + '% a.a.';
            if (labelBase) labelBase.textContent = '+' + (r.base * 100).toFixed(1).replace('.',',') + '% a.a.';
            if (labelOtim) labelOtim.textContent = '+' + Math.round(r.otim * 100) + '% a.a.';
        })
        .catch(function() { /* fallback silencioso */ });
})();

// ── NTN-B: ajuste de cenarios via server-side ──
(function fetchNtnbScenarios() {
    fetch('/api/ntnb-scenarios')
        .then(function(r) { return r.json(); })
        .then(function(d) {
            if (!d.ok || !d.rates) return;
            var r = d.rates;
            applyScenarioRates('ntnb', r);
            var labelPess = document.getElementById('n-rate-cons');
            var labelBase = document.getElementById('n-rate-mod');
            var labelOtim = document.getElementById('n-rate-agr');
            if (labelPess) labelPess.textContent = '+' + Math.round(r.pess * 100) + '% a.a.';
            if (labelBase) labelBase.textContent = '+' + (r.base * 100).toFixed(1).replace('.',',') + '% a.a.';
            if (labelOtim) labelOtim.textContent = '+' + Math.round(r.otim * 100) + '% a.a.';
        })
        .catch(function() { /* fallback silencioso */ });
})();

// ── USD/BRL: cotacao ao vivo e cenarios direcionais ──
(function fetchUsdbrlScenarios() {
    fetch('/api/usdbrl-scenarios')
        .then(function(r) { return r.json(); })
        .then(function(d) {
            if (!d.ok || !d.rates) return;
            var r = d.rates;
            applyScenarioRates('usdbrl', r);
            // Atualiza cotacao global para conversao BRL no Monte Carlo.
            // usdbrl_bid e campo de topo do payload, nao fica dentro de rates.
            if (d.usdbrl_bid != null) usdBrlLive = d.usdbrl_bid;
            // Atualiza macro strip
            if (d.usdbrl_bid != null) {
                var macroUsd = document.getElementById('macro-usd');
                if (macroUsd) macroUsd.textContent = d.usdbrl_bid.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }
            var labelPess = document.getElementById('u-rate-cons');
            var labelBase = document.getElementById('u-rate-mod');
            var labelOtim = document.getElementById('u-rate-agr');
            if (labelPess) labelPess.textContent = (r.pess >= 0 ? '+' : '') + Math.round(r.pess * 100) + '% a.a.';
            if (labelBase) labelBase.textContent = (r.base >= 0 ? '+' : '') + Math.round(r.base * 100) + '% a.a.';
            if (labelOtim) labelOtim.textContent = (r.otim >= 0 ? '+' : '') + Math.round(r.otim * 100) + '% a.a.';
        })
        .catch(function() { /* fallback silencioso */ });
})();

// Mapa unico cenario -> classe do card. Antes existia duplicado dentro do
// bootstrap de link compartilhado.
const SC_CARD_CLASS = { pess: '.pessimist', base: '.base-sc', otim: '.optimist' };

// Chave propria, nunca herdada. Valor vindo de URL cai em objeto literal, e
// SC_CARD_CLASS['toString'] ou simConfigs['constructor'] resolvem na cadeia de
// prototipo, passando por qualquer checagem de verdade simples.
function temChave(obj, k) { return Object.prototype.hasOwnProperty.call(obj, k); }
// Espelha no DOM o cenario que esta em simConfigs[asset].sel. Init e bootstrap
// de link compartilhado chamam isto em vez de fixar o card zero, entao a ordem
// em que os dois rodam deixa de importar.
function syncScenarioCards(asset) {
    const selector = document.getElementById('sc-' + asset);
    if (!selector) return;
    const sel  = simConfigs[asset].sel;
    const alvo = selector.querySelector(temChave(SC_CARD_CLASS, sel) ? SC_CARD_CLASS[sel] : SC_CARD_CLASS.pess);
    selector.querySelectorAll('.sc-card').forEach(c => c.classList.toggle('active-sc', c === alvo));
}

function selectScenario(asset, scenario, el) {
    simConfigs[asset].sel = scenario;
    const selector = document.getElementById('sc-' + asset);
    if (selector) {
        selector.querySelectorAll('.sc-card').forEach(c => c.classList.remove('active-sc'));
        el.classList.add('active-sc');
    }
    recalcSim(asset);
}

function recalcSim(asset) {
    const c = simConfigs[asset];
    if (!c) return;
    const ini  = parseFloat(document.getElementById(c.ini)?.value)   || 10000;
    const ap   = parseFloat(document.getElementById(c.ap)?.value)    || 500;
    const prz  = parseFloat(document.getElementById(c.prazo)?.value) || (asset === 'btc' ? 4 : 10);
    const totalInv = ini + ap * 12 * prz;

    const base = calcFinal(ini, ap, c.base, prz);
    const otim = calcFinal(ini, ap, c.otim, prz);
    const pess = (asset === 'btc' && c.pess == null) ? totalInv * (window.btcPessMultiplier || 0.40) : calcFinal(ini, ap, c.pess, prz);

    const p = c.prefix;

    // BRL vs USD: CDI e NTN-B sao ativos em reais, nao dolares
    var isBrl = (asset === 'cdi' || asset === 'ntnb');
    var fmtVal = isBrl ? fmtBRL : fmtUSD;

    // Valor final da carteira
    document.getElementById(p + '-pess').textContent   = fmtVal(pess);
    document.getElementById(p + '-base').textContent   = fmtVal(base);
    document.getElementById(p + '-otim').textContent   = fmtVal(otim);

    // Retorno sobre total investido
    document.getElementById(p + '-pess-r').textContent = fmtRet(pess, ini, ap, prz);
    document.getElementById(p + '-base-r').textContent = fmtRet(base, ini, ap, prz);
    document.getElementById(p + '-otim-r').textContent = fmtRet(otim, ini, ap, prz);

    // Breakdown: total investido vs lucro
    const breakdown = (fv) => {
        const lucro = fv - totalInv;
        const sign  = lucro >= 0 ? '+' : '';
        return 'Aportado: ' + fmtVal(totalInv) + ' · Retorno: ' + sign + fmtVal(lucro);
    };
    const setPessBreak = document.getElementById(p + '-pess-break');
    const setBaseBreak = document.getElementById(p + '-base-break');
    const setOtimBreak = document.getElementById(p + '-otim-break');
    if (setPessBreak) setPessBreak.textContent = breakdown(pess);
    if (setBaseBreak) setBaseBreak.textContent = breakdown(base);
    if (setOtimBreak) setOtimBreak.textContent = breakdown(otim);

    // Preço atual do ativo via prices.php (armazenado em window._livePrices)
    const _lp = window._livePrices || {};
    const _priceKey = { gold: 'gold', silver: 'silver', platinum: 'platinum', copper: 'copper', btc: 'bitcoin' }[asset];
    const _currentPrice = _lp[_priceKey];
    const _priceLabel = _currentPrice ? `$ ${Number(_currentPrice).toLocaleString('en-US')}` : '';
    const elPP = document.getElementById(p + '-pess-price');
    const elBP = document.getElementById(p + '-base-price');
    const elOP = document.getElementById(p + '-otim-price');
    if (elPP) elPP.textContent = _priceLabel;
    if (elBP) elBP.textContent = _priceLabel;
    if (elOP) elOP.textContent = _priceLabel;

    drawSimChart(asset, ini, ap, prz, c, pess, base, otim);

    // Clarity: simulator_run
    if (window.clarity && window.SZ_CLARITY_ID && window.SZ_CLARITY_ID !== 'XXXXXXXXXX') {
        try { window.clarity('event', 'simulator_run'); } catch(e) {}
    }
}

const simCharts = {};

function drawSimChart(asset, ini, ap, prazo, c, pessVal, baseVal, otimVal) {
    const canvasId = { gold: 'chart-gold', silver: 'chart-silver', platinum: 'chart-platinum', copper: 'chart-copper', btc: 'chart-btc', cdi: 'chart-cdi', ntnb: 'chart-ntnb', usdbrl: 'chart-usdbrl' }[asset];
    const canvas   = document.getElementById(canvasId);
    if (!canvas) return;

    const colors = { gold: '#c9a84c', silver: '#c0c0c0', platinum: '#8ecfdd', copper: '#b87333', btc: '#f07a40', cdi: '#5b9cf6', ntnb: '#4caf7d', usdbrl: '#c9a84c' };
    const color  = colors[asset];
    const sel    = simConfigs[asset].sel;

    const labels = [];
    for (let i = 0; i <= prazo; i++) labels.push('Ano ' + i);

    // A condição era só `asset === 'btc'`, com 0.4 fixo: a linha pessimista do gráfico
    // ignorava c.pess e window.btcPessMultiplier. Com o BTC Radar no ar, o card exibia
    // o valor de uma taxa anual (−10% a.a.) enquanto o gráfico logo abaixo desenhava a
    // curva do drawdown total. Agora segue a mesma regra de recalcSim().
    const seriePess = (asset === 'btc' && c.pess == null)
        ? Array.from({ length: prazo + 1 }, (_, i) => { const tv = ini + ap * 12 * i; return tv * (window.btcPessMultiplier || 0.40); })
        : calcSerie(ini, ap, c.pess, prazo);
    const serieBase = calcSerie(ini, ap, c.base, prazo);
    const serieOtim = calcSerie(ini, ap, c.otim, prazo);

    const opPess = sel === 'pess' ? 1 : 0.3;
    const opBase = sel === 'base' ? 1 : 0.3;
    const opOtim = sel === 'otim' ? 1 : 0.3;

    if (simCharts[asset]) simCharts[asset].destroy();
    simCharts[asset] = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'Pessimista', data: seriePess, borderColor: `rgba(224,92,92,${opPess})`, backgroundColor: sel === 'pess' ? 'rgba(224,92,92,0.07)' : 'transparent', borderWidth: sel === 'pess' ? 2.5 : 1, pointRadius: sel === 'pess' ? 2 : 0, tension: 0.4, fill: sel === 'pess' },
                { label: 'Base',       data: serieBase, borderColor: sel === 'base' ? color : `rgba(91,156,246,${opBase})`, backgroundColor: sel === 'base' ? color + '12' : 'transparent', borderWidth: sel === 'base' ? 2.5 : 1, pointRadius: sel === 'base' ? 2 : 0, tension: 0.4, fill: sel === 'base' },
                { label: 'Otimista',   data: serieOtim, borderColor: `rgba(76,175,125,${opOtim})`, backgroundColor: sel === 'otim' ? 'rgba(76,175,125,0.07)' : 'transparent', borderWidth: sel === 'otim' ? 2.5 : 1, pointRadius: sel === 'otim' ? 2 : 0, tension: 0.4, fill: sel === 'otim' },
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: '#888', font: { size: 11, family: 'DM Mono' }, boxWidth: 12 } },
                tooltip: { backgroundColor: '#111', borderColor: '#333', borderWidth: 1, titleColor: '#aaa', bodyColor: '#e8e8e8', callbacks: { label: ctx => ' ' + ctx.dataset.label + ': ' + fmtUSD(ctx.raw) } }
            },
            scales: {
                x: { ticks: { color: '#555', font: { size: 10, family: 'DM Mono' } }, grid: { color: 'rgba(255,255,255,0.04)' } },
                y: { ticks: { color: '#555', font: { size: 10, family: 'DM Mono' }, callback: v => fmtUSD(v) }, grid: { color: 'rgba(255,255,255,0.04)' } }
            }
        }
    });
}

// ── COMPARADOR ──
let compModo   = 'indice';
let compEscala = 'linear';
let compChart  = null;

function setModoComparador(modo, btn) {
    compModo = modo;
    document.querySelectorAll('#btn-modo-abs, #btn-modo-idx, #btn-modo-pct').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    recalcComparador();
}

function setEscalaComparador(escala, btn) {
    compEscala = escala;
    document.querySelectorAll('#btn-esc-lin, #btn-esc-log').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    recalcComparador();
}

function recalcComparador() {
    const prazo = parseInt(document.getElementById('c-prazo')?.value) || 10;
    const ativos = [
        { key: 'gold',     ini: 'c-g-ini', ap: 'c-g-ap', tx: 'c-g-tx', label: 'Ouro',    color: '#c9a84c', dash: [] },
        { key: 'silver',   ini: 'c-s-ini', ap: 'c-s-ap', tx: 'c-s-tx', label: 'Prata',   color: '#d0d0d0', dash: [6,3] },
        { key: 'platinum', ini: 'c-p-ini', ap: 'c-p-ap', tx: 'c-p-tx', label: 'Platina', color: '#8ecfdd', dash: [3,3] },
        { key: 'copper',   ini: 'c-cu-ini',ap: 'c-cu-ap',tx: 'c-cu-tx',label: 'Cobre',   color: '#b87333', dash: [2,4] },
        { key: 'btc',      ini: 'c-b-ini', ap: 'c-b-ap', tx: 'c-b-tx', label: 'Bitcoin', color: '#f07a40', dash: [10,4] },
    ];
    const labels = [];
    for (let i = 0; i <= prazo; i++) labels.push('Ano ' + i);

    const rawSeries = ativos.map(a => {
        const ini  = parseFloat(document.getElementById(a.ini)?.value) || 10000;
        const ap   = parseFloat(document.getElementById(a.ap)?.value)  || 500;
        const taxa = parseFloat(document.getElementById(a.tx)?.value)  || 8;
        return { ...a, ini, ap, taxa, serie: calcSerie(ini, ap, taxa / 100, prazo) };
    });

    const datasets = rawSeries.map(a => {
        let data;
        if (compModo === 'absoluto') {
            data = a.serie;
        } else if (compModo === 'indice') {
            const base = a.serie;
            data = a.serie.map(v => (v / base) * 100);
        } else {
            data = a.serie.map((v, i) => {
                const totalInv = a.ini + a.ap * 12 * i;
                return ((v - totalInv) / totalInv) * 100;
            });
        }
        if (compEscala === 'logarithmic') data = data.map(v => Math.max(v, 0.01));
        return { label: a.label, data, borderColor: a.color, backgroundColor: a.color + '18', borderWidth: 2.5, pointRadius: prazo <= 10 ? 4 : 2, pointHoverRadius: 6, tension: 0.35, fill: false, borderDash: a.dash };
    });

    const canvas = document.getElementById('chart-comparador');
    if (!canvas) return;
    if (compChart) compChart.destroy();

    const yLabel      = compModo === 'absoluto' ? v => fmtUSD(v) : compModo === 'indice' ? v => fmt(v, 1) + ' pts' : v => fmt(v, 1) + '%';
    const tooltipLbl  = compModo === 'absoluto' ? ctx => ` ${ctx.dataset.label}: ${fmtUSD(ctx.raw)}` : compModo === 'indice' ? ctx => ` ${ctx.dataset.label}: ${fmt(ctx.raw, 1)} pts` : ctx => ` ${ctx.dataset.label}: ${fmt(ctx.raw, 1)}%`;

    compChart = new Chart(canvas, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: '#aaa', font: { size: 12, family: 'DM Mono' }, boxWidth: 28, padding: 20 }, position: 'top' },
                tooltip: { backgroundColor: '#0d0d0d', borderColor: '#2a2a2a', borderWidth: 1, titleColor: '#777', bodyColor: '#e8e8e8', bodyFont: { family: 'DM Mono', size: 12 }, padding: 12, callbacks: { label: tooltipLbl } }
            },
            scales: {
                x: { ticks: { color: '#555', font: { size: 11, family: 'DM Mono' } }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { type: compEscala, ticks: { color: '#555', font: { size: 11, family: 'DM Mono' }, callback: yLabel }, grid: { color: 'rgba(255,255,255,0.05)' }, ...(compModo === 'indice' ? { suggestedMin: 80 } : {}) }
            }
        }
    });

    const tbody = document.getElementById('comp-tbody');
    tbody.innerHTML = rawSeries.map(a => {
        const final = a.serie[a.serie.length - 1];
        const totalInv = a.ini + a.ap * 12 * prazo;
        const ret  = ((final - totalInv) / totalInv) * 100;
        const cagr = (Math.pow(final / Math.max(a.ini, 1), 1 / prazo) - 1) * 100;
        const retColor = ret >= 0 ? '#4caf7d' : '#e05c5c';
        const rank  = rawSeries.slice().sort((x, y) => y.serie[y.serie.length - 1] - x.serie[x.serie.length - 1]).findIndex(x => x.key === a.key) + 1;
        const rankBadge = rank <= 3 ? `<span class="rank-badge">${rank}º</span>` : '';
        return `<tr>
            <td><span class="u-fontweight700" data-color="${a.color}">${a.label}</span>${rankBadge}</td>
            <td class="u-colorvarmuted-fontfamilydmmonomonospace">$ ${fmt(totalInv, 0)}</td>
            <td class="u-fontfamilydmmonomonospace" data-color="${a.color}">${fmtUSD(final)}</td>
            <td class="u-fontfamilydmmonomonospace" data-color="${retColor}">${ret >= 0 ? '+' : ''}${fmt(ret,1)}%</td>
            <td class="u-fontfamilydmmonomonospace" data-color="${retColor}">${cagr >= 0 ? '+' : ''}${fmt(cagr,1)}% a.a.</td>
        </tr>`;
    }).join('');
}

// ── INIT ──
function initSimulators() {
    // Sem reset para 'pess' aqui. simConfigs ja nasce em 'pess', e este init roda
    // 500ms depois do carregamento, ou seja, depois do bootstrap de link
    // compartilhado (200ms) e de qualquer clique do usuario nesse intervalo. O
    // reset apagava os dois.
    Object.keys(simConfigs).forEach(asset => {
        syncScenarioCards(asset);
        recalcSim(asset);
    });
    compModo = 'indice';
    const btnIdx = document.getElementById('btn-modo-idx');
    if (btnIdx) {
        document.querySelectorAll('#btn-modo-abs, #btn-modo-idx, #btn-modo-pct').forEach(b => b.classList.remove('active'));
        btnIdx.classList.add('active');
    }
    recalcComparador();
}
setTimeout(initSimulators, 500);

// ── ALOCAÇÃO — portfólio por perfil de investidor ──

// Perfis: conservador (pessimista), moderado (base), arrojado (otimista)
// Soma sempre 100%
// Cada perfil agora tem tres tabelas de peso, uma por cenario macro
// (pessimista/base/otimista), nao mais uma unica. Cobre e o dial que varia
// por cenario dentro de cada perfil (0 a 5%, minimo no pessimista, maximo no
// otimista); Bitcoin varia junto, em 2x a amplitude do cobre, mesma direcao,
// por ser o ativo de maior volatilidade da carteira (VOL_PORT.btc = 0,85
// contra 0,21 do cobre). Ouro, prata e platina ficam fixos em qualquer
// cenario dentro do mesmo perfil, ouro por ser protecao monetaria e
// geopolitica, prata e platina por nao terem regra de tilt definida.
// NTN-B e CDI absorvem toda a diferenca: no base, financiam a entrada do
// cobre; no pessimista, recebem o que sai de cobre e Bitcoin; no otimista,
// cedem para financiar o aumento de cobre e Bitcoin, CDI primeiro, NTN-B so
// se CDI nao bastar. Reserva nunca muda dentro do mesmo perfil, e
// dimensionada para liquidez, nao para leitura de mercado.
// As nove tabelas foram calculadas e conferidas em script (soma = 100,00 nas
// nove, sem excecao) antes de virar literal aqui.
const PERFIS = {
    conservador: {
        desc: 'Perfil de máxima proteção: prioriza renda fixa real e liquidez, com exposição mínima a ativos de risco. Concentração maior em NTN-B e CDI, participação marginal em metais, cobre e cripto.',
        items: {
            pessimista: [
                { key: 'ntnb',     pct: 44.5, color: '#4caf7d',             label: 'NTN-B'   },
                { key: 'cdi',      pct: 28.5, color: '#5b9cf6',             label: 'CDI'     },
                { key: 'gold',     pct: 10,   color: '#c9a84c',             label: 'Ouro'    },
                { key: 'silver',   pct:  2,   color: '#c0c0c0',             label: 'Prata'   },
                { key: 'platinum', pct:  2,   color: '#8ecfdd',             label: 'Platina' },
                { key: 'copper',   pct:  0,   color: '#b87333',             label: 'Cobre'   },
                { key: 'btc',      pct:  1,   color: '#f07a40',             label: 'Bitcoin' },
                { key: 'reserva',  pct: 12,   color: 'rgba(201,168,76,0.55)', label: 'Reserva' },
            ],
            base: [
                { key: 'ntnb',     pct: 42.5, color: '#4caf7d',             label: 'NTN-B'   },
                { key: 'cdi',      pct: 27.5, color: '#5b9cf6',             label: 'CDI'     },
                { key: 'gold',     pct: 10,   color: '#c9a84c',             label: 'Ouro'    },
                { key: 'silver',   pct:  2,   color: '#c0c0c0',             label: 'Prata'   },
                { key: 'platinum', pct:  2,   color: '#8ecfdd',             label: 'Platina' },
                { key: 'copper',   pct:  1,   color: '#b87333',             label: 'Cobre'   },
                { key: 'btc',      pct:  3,   color: '#f07a40',             label: 'Bitcoin' },
                { key: 'reserva',  pct: 12,   color: 'rgba(201,168,76,0.55)', label: 'Reserva' },
            ],
            otimista: [
                { key: 'ntnb',     pct: 42.5, color: '#4caf7d',             label: 'NTN-B'   },
                { key: 'cdi',      pct: 24.5, color: '#5b9cf6',             label: 'CDI'     },
                { key: 'gold',     pct: 10,   color: '#c9a84c',             label: 'Ouro'    },
                { key: 'silver',   pct:  2,   color: '#c0c0c0',             label: 'Prata'   },
                { key: 'platinum', pct:  2,   color: '#8ecfdd',             label: 'Platina' },
                { key: 'copper',   pct:  2,   color: '#b87333',             label: 'Cobre'   },
                { key: 'btc',      pct:  5,   color: '#f07a40',             label: 'Bitcoin' },
                { key: 'reserva',  pct: 12,   color: 'rgba(201,168,76,0.55)', label: 'Reserva' },
            ],
        }
    },
    moderado: {
        desc: 'Perfil balanceado: divide o portfólio entre proteção real (NTN-B, CDI) e ativos de crescimento (metais, cobre, Bitcoin), sem concentração extrema em nenhuma ponta.',
        items: {
            pessimista: [
                { key: 'ntnb',     pct: 29.5, color: '#4caf7d',             label: 'NTN-B'   },
                { key: 'cdi',      pct: 23,   color: '#5b9cf6',             label: 'CDI'     },
                { key: 'gold',     pct: 15,   color: '#c9a84c',             label: 'Ouro'    },
                { key: 'silver',   pct:  5,   color: '#c0c0c0',             label: 'Prata'   },
                { key: 'platinum', pct:  5,   color: '#8ecfdd',             label: 'Platina' },
                { key: 'copper',   pct:  0.5, color: '#b87333',             label: 'Cobre'   },
                { key: 'btc',      pct:  7,   color: '#f07a40',             label: 'Bitcoin' },
                { key: 'reserva',  pct: 15,   color: 'rgba(201,168,76,0.55)', label: 'Reserva' },
            ],
            base: [
                { key: 'ntnb',     pct: 27,   color: '#4caf7d',             label: 'NTN-B'   },
                { key: 'cdi',      pct: 21,   color: '#5b9cf6',             label: 'CDI'     },
                { key: 'gold',     pct: 15,   color: '#c9a84c',             label: 'Ouro'    },
                { key: 'silver',   pct:  5,   color: '#c0c0c0',             label: 'Prata'   },
                { key: 'platinum', pct:  5,   color: '#8ecfdd',             label: 'Platina' },
                { key: 'copper',   pct:  2,   color: '#b87333',             label: 'Cobre'   },
                { key: 'btc',      pct: 10,   color: '#f07a40',             label: 'Bitcoin' },
                { key: 'reserva',  pct: 15,   color: 'rgba(201,168,76,0.55)', label: 'Reserva' },
            ],
            otimista: [
                { key: 'ntnb',     pct: 27,   color: '#4caf7d',             label: 'NTN-B'   },
                { key: 'cdi',      pct: 15,   color: '#5b9cf6',             label: 'CDI'     },
                { key: 'gold',     pct: 15,   color: '#c9a84c',             label: 'Ouro'    },
                { key: 'silver',   pct:  5,   color: '#c0c0c0',             label: 'Prata'   },
                { key: 'platinum', pct:  5,   color: '#8ecfdd',             label: 'Platina' },
                { key: 'copper',   pct:  4,   color: '#b87333',             label: 'Cobre'   },
                { key: 'btc',      pct: 14,   color: '#f07a40',             label: 'Bitcoin' },
                { key: 'reserva',  pct: 15,   color: 'rgba(201,168,76,0.55)', label: 'Reserva' },
            ],
        }
    },
    arrojado: {
        desc: 'Perfil de maior tolerância a risco: prioriza metais, cobre e Bitcoin em busca de crescimento, com renda fixa reduzida ao mínimo necessário de estabilidade.',
        items: {
            pessimista: [
                { key: 'ntnb',     pct: 14.5, color: '#4caf7d',             label: 'NTN-B'   },
                { key: 'cdi',      pct:  9.5, color: '#5b9cf6',             label: 'CDI'     },
                { key: 'gold',     pct: 22,   color: '#c9a84c',             label: 'Ouro'    },
                { key: 'silver',   pct:  7,   color: '#c0c0c0',             label: 'Prata'   },
                { key: 'platinum', pct: 10,   color: '#8ecfdd',             label: 'Platina' },
                { key: 'copper',   pct:  1,   color: '#b87333',             label: 'Cobre'   },
                { key: 'btc',      pct: 21,   color: '#f07a40',             label: 'Bitcoin' },
                { key: 'reserva',  pct: 15,   color: 'rgba(201,168,76,0.55)', label: 'Reserva' },
            ],
            base: [
                { key: 'ntnb',     pct: 11,   color: '#4caf7d',             label: 'NTN-B'   },
                { key: 'cdi',      pct:  7,   color: '#5b9cf6',             label: 'CDI'     },
                { key: 'gold',     pct: 22,   color: '#c9a84c',             label: 'Ouro'    },
                { key: 'silver',   pct:  7,   color: '#c0c0c0',             label: 'Prata'   },
                { key: 'platinum', pct: 10,   color: '#8ecfdd',             label: 'Platina' },
                { key: 'copper',   pct:  3,   color: '#b87333',             label: 'Cobre'   },
                { key: 'btc',      pct: 25,   color: '#f07a40',             label: 'Bitcoin' },
                { key: 'reserva',  pct: 15,   color: 'rgba(201,168,76,0.55)', label: 'Reserva' },
            ],
            otimista: [
                { key: 'ntnb',     pct: 11,   color: '#4caf7d',             label: 'NTN-B'   },
                { key: 'cdi',      pct:  1,   color: '#5b9cf6',             label: 'CDI'     },
                { key: 'gold',     pct: 22,   color: '#c9a84c',             label: 'Ouro'    },
                { key: 'silver',   pct:  7,   color: '#c0c0c0',             label: 'Prata'   },
                { key: 'platinum', pct: 10,   color: '#8ecfdd',             label: 'Platina' },
                { key: 'copper',   pct:  5,   color: '#b87333',             label: 'Cobre'   },
                { key: 'btc',      pct: 29,   color: '#f07a40',             label: 'Bitcoin' },
                { key: 'reserva',  pct: 15,   color: 'rgba(201,168,76,0.55)', label: 'Reserva' },
            ],
        }
    },
};

let perfilAtivo = 'moderado';

function setPerfilAlocacao(perfil, btn) {
    perfilAtivo = perfil;
    document.querySelectorAll('.alloc-perfil-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const descEl = document.getElementById('alloc-perfil-desc');
    if (descEl) descEl.textContent = PERFIS[perfil].desc;
    const val = parseInt(document.getElementById('portfolio-slider')?.value) || 500000;
    atualizarAlocacao(val);
    desenharBenchmark(); // recalcula benchmark com novo perfil
    _refreshPortfolioMC();
    _refreshGeoPortfolioMC();
}

function getAllocItems() { return PERFIS[perfilAtivo].items[benchCenario] || PERFIS[perfilAtivo].items.base; }

// Formata percentual de alocacao em PT-BR. Precisa existir porque o
// rebalanceamento por cenario introduziu casos com meio ponto (ex.: cobre em
// 0,5% no moderado pessimista); item.pct + '%' cru mostraria "0.5%" com
// ponto, fora do padrao PT-BR usado no resto do app. Numero inteiro continua
// sem casa decimal, so ganha casa quando o valor realmente tem fracao.
function fmtPct(n) {
    return (n % 1 === 0 ? n : n.toFixed(1).replace('.', ',')) + '%';
}

function fmtBRL(v) {
    if (v >= 1e6) return 'R$ ' + (v/1e6).toFixed(2).replace('.',',') + ' M';
    return 'R$ ' + fmt(v, 0);
}

function fmtBRLShort(v) {
    if (v >= 1e6) return 'R$ ' + (v/1e6).toFixed(1).replace('.',',') + 'M';
    if (v >= 1e3) return 'R$ ' + Math.round(v/1000) + 'K';
    return 'R$ ' + Math.round(v);
}

function atualizarAlocacao(val) {
    val = parseInt(val);
    document.getElementById('portfolio-display').textContent = 'R$ ' + fmt(val, 0);
    document.getElementById('total-alocado').textContent = 'R$ ' + fmt(val, 0);

    const items = getAllocItems();
    items.forEach(item => {
        const v = (val * item.pct) / 100;
        const elVal = document.getElementById('val-' + item.key);
        const elPct = document.getElementById('pct-' + item.key);
        const elBar = document.getElementById('bar-' + item.key);
        if (elVal) elVal.textContent = 'R$ ' + fmt(v, 0);
        if (elPct) elPct.textContent = fmtPct(item.pct);
        if (elBar) elBar.style.width = item.pct + '%';
    });

    const centerEl = document.getElementById('donut-center-val');
    if (centerEl) centerEl.textContent = fmtBRLShort(val);

    desenharDonut(val);
    desenharBenchmark();
}

function desenharDonut(val) {
    val = val || parseInt(document.getElementById('portfolio-slider').value);
    const canvas = document.getElementById('chart-donut');
    if (!canvas) return;

    const items = getAllocItems();

    if (donutChart) donutChart.destroy();
    donutChart = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: items.map(d => d.label + ' ' + fmtPct(d.pct)),
            datasets: [{
                data: items.map(d => d.pct),
                backgroundColor: items.map(d => d.color),
                borderColor: '#0f0f0f',
                borderWidth: 3,
                hoverBorderWidth: 4,
                hoverBorderColor: '#1a1a1a',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '68%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#111',
                    borderColor: '#2a2a2a',
                    borderWidth: 1,
                    titleColor: '#aaa',
                    bodyColor: '#e8e8e8',
                    bodyFont: { family: 'DM Mono', size: 12 },
                    callbacks: {
                        label: ctx => {
                            const v = (val * ctx.raw) / 100;
                            return ' ' + ctx.raw + '% · R$ ' + fmt(v, 0);
                        }
                    }
                }
            },
            animation: { animateRotate: true, duration: 600 }
        }
    });

    // Atualiza legenda
    const legEl = document.getElementById('donut-legend');
    if (legEl) {
        legEl.innerHTML = items.map(i =>
            `<div class="donut-leg-item"><span class="donut-leg-dot" data-bg="${i.color}"></span><span class="donut-leg-label">${i.label} ${fmtPct(i.pct)}</span></div>`
        ).join('');
    }
}

let donutChart = null;

// ── BENCHMARK CHART ──
let benchPrazo = 5;
let benchChart = null;
let benchCenario = 'base'; // pessimista | base | otimista

function setBenchPrazo(anos, btn) {
    benchPrazo = anos;
    document.querySelectorAll('.bench-prazo-group .comp-toggle').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    desenharBenchmark();
    _refreshPortfolioMC();
}

function setBenchCenario(cenario, btn) {
    benchCenario = cenario;
    document.querySelectorAll('.bench-cenario-group .comp-toggle').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    // Sincronizar com seletor de alocação
    document.querySelectorAll('.alloc-cenario-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.cenario === cenario);
    });
    const descEl = document.getElementById('alloc-cenario-desc');
    if (descEl) descEl.textContent = getCenarioDescricao(cenario);
    const val = parseInt(document.getElementById('portfolio-slider')?.value) || 500000;
    atualizarAlocacao(val);
    desenharBenchmark();
    _refreshPortfolioMC();
    _refreshGeoPortfolioMC();
}

function setAllocCenario(cenario, btn) {
    benchCenario = cenario;
    document.querySelectorAll('.alloc-cenario-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    // Sincronizar com seletor do benchmark
    document.querySelectorAll('.bench-cenario-group .comp-toggle').forEach(b => {
        b.classList.toggle('active', b.textContent.toLowerCase().includes(cenario === 'pessimista' ? 'pessimista' : cenario === 'otimista' ? 'otimista' : 'base'));
    });
    const descEl = document.getElementById('alloc-cenario-desc');
    if (descEl) descEl.textContent = getCenarioDescricao(cenario);
    // Atualizar cor da borda do desc baseado no cenário
    if (descEl) {
        const colors = { pessimista: 'rgba(224,112,112,0.4)', base: 'rgba(91,156,246,0.3)', otimista: 'rgba(76,175,125,0.4)' };
        descEl.style.borderLeftColor = colors[cenario] || colors.base;
    }
    const val = parseInt(document.getElementById('portfolio-slider')?.value) || 500000;
    atualizarAlocacao(val);
    desenharBenchmark();
    _refreshPortfolioMC();
    _refreshGeoPortfolioMC();
}

function desenharBenchmark() {
    const val       = parseInt(document.getElementById('portfolio-slider')?.value) || 500000;
    const prazo     = benchPrazo;
    const canvas    = document.getElementById('chart-benchmark');
    const tbody     = document.getElementById('bench-tbody');
    if (!canvas) return;

    // Atualizar badge Perfil × Cenário
    const comboEl = document.getElementById('bench-assume-combo');
    if (comboEl) {
        const perfilLabels = { conservador: 'Conservador', moderado: 'Moderado', arrojado: 'Arrojado' };
        const cenarioLabels = { pessimista: 'Pessimista', base: 'Base', otimista: 'Otimista' };
        comboEl.textContent = (perfilLabels[perfilAtivo] || 'Moderado') + ' × ' + (cenarioLabels[benchCenario] || 'Base');
    }

    const labels = [];
    for (let y = 0; y <= prazo; y++) labels.push(y === 0 ? 'Hoje' : 'Ano ' + y);

    const perfil     = perfilAtivo || 'moderado';
    const taxasAtivo = window.taxasCenario[benchCenario] || window.taxasCenario.base;
    const itens      = PERFIS[perfil].items[benchCenario] || PERFIS[perfil].items.base;
    const pNtnb  = (itens.find(i => i.key === 'ntnb')?.pct     || 0) / 100;
    const pCdi   = (itens.find(i => i.key === 'cdi')?.pct      || 0) / 100;
    const pOuro  = (itens.find(i => i.key === 'gold')?.pct     || 0) / 100;
    const pPrata = (itens.find(i => i.key === 'silver')?.pct   || 0) / 100;
    const pPlat  = (itens.find(i => i.key === 'platinum')?.pct || 0) / 100;
    const pCobre = (itens.find(i => i.key === 'copper')?.pct   || 0) / 100;
    const pBtc   = (itens.find(i => i.key === 'btc')?.pct      || 0) / 100;
    const pRes   = (itens.find(i => i.key === 'reserva')?.pct  || 0) / 100;

    function portfolioAno(y) {
        const selic = getSelicAno(y);
        const ntnb  = getNtnbAno(y);
        return (ntnb  * pNtnb)
             + (selic * pCdi)
             + ((taxasAtivo.ouro || taxasAtivo.gold) * pOuro)
             + ((taxasAtivo.prata || taxasAtivo.silver) * pPrata)
             + ((taxasAtivo.platina || taxasAtivo.platinum) * pPlat)
             + ((taxasAtivo.cobre || taxasAtivo.copper) * pCobre)
             + (taxasAtivo.btc * pBtc)
             + (selic * pRes);
    }

    const seriePort  = [val];
    const serieSelic = [val];
    const serieNtnb  = [val];

    for (let y = 1; y <= prazo; y++) {
        seriePort.push( seriePort[y-1]  * (1 + portfolioAno(y)));
        serieSelic.push(serieSelic[y-1] * (1 + getSelicAno(y)));
        serieNtnb.push( serieNtnb[y-1]  * (1 + getNtnbAno(y)));
    }

    if (benchChart) benchChart.destroy();
    benchChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Portfólio MultiAsset',
                    data: seriePort,
                    borderColor: '#c9a84c',
                    backgroundColor: 'rgba(201,168,76,0.08)',
                    borderWidth: 3,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    tension: 0.35,
                    fill: true,
                    pointBackgroundColor: '#c9a84c',
                },
                {
                    label: 'NTN-B curta (IPCA+7,5%)',
                    data: serieNtnb,
                    borderColor: '#4caf7d',
                    backgroundColor: 'rgba(76,175,125,0.05)',
                    borderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    tension: 0.3,
                    fill: false,
                    borderDash: [6, 3],
                    pointBackgroundColor: '#4caf7d',
                },
                {
                    label: 'Selic projetada',
                    data: serieSelic,
                    borderColor: '#5b9cf6',
                    backgroundColor: 'rgba(91,156,246,0.04)',
                    borderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    tension: 0.3,
                    fill: false,
                    borderDash: [3, 3],
                    pointBackgroundColor: '#5b9cf6',
                },
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: '#aaa',
                        font: { size: 12, family: 'DM Mono' },
                        boxWidth: 28,
                        padding: 16,
                        usePointStyle: false,
                    }
                },
                tooltip: {
                    backgroundColor: '#0d0d0d',
                    borderColor: '#2a2a2a',
                    borderWidth: 1,
                    titleColor: '#777',
                    bodyColor: '#e8e8e8',
                    bodyFont: { family: 'DM Mono', size: 12 },
                    padding: 12,
                    callbacks: {
                        label: ctx => ` ${ctx.dataset.label}: R$ ${fmt(ctx.raw, 0)}`
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#555', font: { size: 11, family: 'DM Mono' } },
                    grid: { color: 'rgba(255,255,255,0.04)' }
                },
                y: {
                    ticks: {
                        color: '#555',
                        font: { size: 11, family: 'DM Mono' },
                        callback: v => fmtBRLShort(v)
                    },
                    grid: { color: 'rgba(255,255,255,0.04)' }
                }
            }
        }
    });

    // Tabela comparativa
    const final = {
        port:  seriePort[prazo],
        ntnb:  serieNtnb[prazo],
        selic: serieSelic[prazo],
    };

    // IPCA acumulado no período para calcular retorno real
    let ipcaAcum = 1;
    for (let y = 1; y <= prazo; y++) ipcaAcum *= (1 + getIpcaAno(y));

    function rowData(label, finalVal, color) {
        const ret    = ((finalVal - val) / val) * 100;
        const cagr   = (Math.pow(finalVal / val, 1 / prazo) - 1) * 100;
        const real   = ((finalVal / val) / ipcaAcum - 1) * 100;
        const sign   = ret  >= 0 ? '+' : '';
        const rSign  = real >= 0 ? '+' : '';
        const cSign  = cagr >= 0 ? '+' : '';
        const rColor = ret  >= 0 ? '#4caf7d' : '#e05c5c';
        return `<tr>
            <td><span class="u-fontweight700" data-color="${color}">${label}</span></td>
            <td class="u-fontfamilydmmonomonospace" data-color="${rColor}">${sign}${fmt(ret,1)}%</td>
            <td class="u-fontfamilydmmonomonospace" data-color="${rColor}">${rSign}${fmt(real,1)}%</td>
            <td class="u-fontfamilydmmonomonospace" data-color="${rColor}">${cSign}${fmt(cagr,1)}% a.a.</td>
            <td class="u-fontfamilydmmonomonospace" data-color="${color}">R$ ${fmt(finalVal,0)}</td>
        </tr>`;
    }

    if (tbody) {
        tbody.innerHTML =
            rowData('Portfólio MultiAsset', final.port,  '#c9a84c') +
            rowData('NTN-B curta (IPCA+7,5%)', final.ntnb, '#4caf7d') +
            rowData('Selic projetada',      final.selic, '#5b9cf6');
    }
}


// ══════════════════════════════════════════════════════════════════
// ── MONTE CARLO DO PORTFÓLIO COMPLETO ──────────────────────────
// ══════════════════════════════════════════════════════════════════

// Volatilidade por chave de ativo no portfólio.
// FONTE ÚNICA: VOL_ANUAL (motor Monte Carlo por ativo) deriva daqui. Antes eram
// dois objetos independentes que divergiam em prata (0,28 vs 0,34) e platina
// (0,22 vs 0,32), e o texto de metodologia exibido ao usuário publicava os
// valores daqui enquanto os simuladores individuais calculavam com os de lá.
const VOL_PORT = {
    ntnb:     0.08,   // duration risk: NTN-B intermediária ~8%/ano
    cdi:      0.005,  // essencialmente sem risco de mercado
    gold:     0.15,
    silver:   0.34,   // histórico 5a: ~34% a.a.
    platinum: 0.32,   // histórico 5a: ~32% a.a.
    copper:   0.21,   // histórico COMEX HG=F: 20,6% a.a. em 10a, 21,5% em 5a.
                      // Cobre não entra em nenhum perfil de carteira: a chave existe
                      // aqui porque VOL_ANUAL, que alimenta o Monte Carlo do simulador
                      // individual, deriva deste objeto e não pode ter fonte própria.
    btc:      0.85,
    reserva:  0.005,
    usdbrl:   0.12,   // volatilidade cambial histórica ~12% a.a.
};

// Gerador de normal aleatoria para Monte Carlo (usado por _runPortfolioMC e _runPortfolioMCGeo)
// NOTA: _runPortfolioMC chamava randNorm() que nao existia — este era um bug silencioso
function randNorm() {
    let u, v;
    do { u = Math.random(); v = Math.random(); } while (u === 0);
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

let portfolioMCChart = null;
let portfolioMCOpen  = false;

function togglePortfolioMC(btn) {
    const content = document.getElementById('bench-mc-content');
    if (portfolioMCOpen) {
        content.style.display = 'none';
        btn.classList.remove('active');
        portfolioMCOpen = false;
        document.getElementById('bench-mc-toggle-hint').textContent = 'Clique para simular probabilidades reais →';
        return;
    }
    btn.classList.add('bmt-loading', 'active');
    document.getElementById('bench-mc-toggle-hint').textContent = 'Calculando 10.000 trajetórias...';
    setTimeout(function() {
        _runPortfolioMC();
        content.style.display = 'block';
        btn.classList.remove('bmt-loading');
        portfolioMCOpen = true;
        document.getElementById('bench-mc-toggle-hint').textContent = 'Atualizado com perfil e cenário ativos';
    }, 40);
}

function _runPortfolioMC() {
    const val    = parseInt(document.getElementById('portfolio-slider').value) || 500000;
    const prazo  = benchPrazo;
    const perfil = perfilAtivo || 'moderado';
    const N      = 10000;

    const taxasAtivo = window.taxasCenario[benchCenario] || window.taxasCenario.base;

    // Taxa base por chave de ativo
    function _baseTaxa(key, y) {
        switch(key) {
            case 'ntnb':     return getNtnbAno(y);
            case 'cdi':      return getSelicAno(y);
            case 'reserva':  return getSelicAno(y);
            case 'gold':     return taxasAtivo.gold || taxasAtivo.ouro || 0.10;
            case 'silver':   return taxasAtivo.silver || taxasAtivo.prata || 0.10;
            case 'platinum': return taxasAtivo.platinum || taxasAtivo.platina || 0.10;
            case 'copper':   return taxasAtivo.copper || taxasAtivo.cobre || 0.10;
            case 'btc':      return taxasAtivo.btc || 0.10;
            default:         return 0.10;
        }
    }

    const itens = PERFIS[perfil].items[benchCenario] || PERFIS[perfil].items.base;

    // Roda N simulações
    const paths = [];
    for (let n = 0; n < N; n++) {
        let pv = val;
        const serie = [pv];
        for (let y = 1; y <= prazo; y++) {
            let portReturn = 0;
            itens.forEach(function(item) {
                const w    = item.pct / 100;
                const base = _baseTaxa(item.key, y);
                const vol  = VOL_PORT[item.key] || 0.10;
                // Retorno log-normal individual para cada ativo
                const drift      = base - 0.5 * vol * vol;
                const shock      = vol * randNorm();
                const assetRet   = Math.exp(drift + shock) - 1;
                portReturn += w * assetRet;
            });
            pv = Math.max(pv * (1 + portReturn), 0);
            serie.push(pv);
        }
        paths.push(serie);
    }

    // Percentis por ano
    const labels = [];
    for (let y = 0; y <= prazo; y++) labels.push(y === 0 ? 'Hoje' : 'Ano ' + y);

    const pct = function(arr, p) { return arr[Math.floor(p * (arr.length - 1))]; };
    const result = { p10: [], p25: [], p50: [], p75: [], p90: [] };
    for (let y = 0; y <= prazo; y++) {
        const vals = paths.map(function(p) { return p[y]; }).sort(function(a,b) { return a - b; });
        result.p10.push(pct(vals, 0.10));
        result.p25.push(pct(vals, 0.25));
        result.p50.push(pct(vals, 0.50));
        result.p75.push(pct(vals, 0.75));
        result.p90.push(pct(vals, 0.90));
    }

    // Benchmarks determinísticos
    const serieNtnb  = [val];
    const serieSelic = [val];
    for (let y = 1; y <= prazo; y++) {
        serieNtnb.push(serieNtnb[y-1]   * (1 + getNtnbAno(y)));
        serieSelic.push(serieSelic[y-1] * (1 + getSelicAno(y)));
    }
    const ntnbFinal  = serieNtnb[prazo];
    const selicFinal = serieSelic[prazo];

    // Probabilidades a partir das trajetórias finais
    const finalVals    = paths.map(function(p) { return p[prazo]; }).sort(function(a,b) { return a - b; });
    const probNtnb     = (finalVals.filter(function(v) { return v > ntnbFinal; }).length / N * 100).toFixed(0);
    const probSelic    = (finalVals.filter(function(v) { return v > selicFinal; }).length / N * 100).toFixed(0);
    const probPositivo = (finalVals.filter(function(v) { return v > val; }).length / N * 100).toFixed(0);
    const medFinal     = result.p50[prazo];
    const cagr         = ((Math.pow(medFinal / val, 1 / prazo) - 1) * 100).toFixed(1);
    const p10Final     = result.p10[prazo];
    const p90Final     = result.p90[prazo];

    // Render métricas
    const probGrid = document.getElementById('bench-mc-prob-grid');
    if (probGrid) {
        const colorProb = function(v) { return parseFloat(v) >= 65 ? '#4caf7d' : parseFloat(v) >= 45 ? '#c9a84c' : '#e05c5c'; };
        probGrid.innerHTML =
            '<div class="bench-mc-prob-card">' +
                '<span class="bmc-icon"><i class="fas fa-chart-line"></i></span>' +
                '<span class="bmc-label">Superar NTN-B</span>' +
                '<span class="bmc-value" data-color="' + colorProb(probNtnb) + '">' + probNtnb + '%</span>' +
                '<span class="bmc-sub">das 10.000 trajetórias<br>terminam acima da NTN-B</span>' +
            '</div>' +
            '<div class="bench-mc-prob-card">' +
                '<span class="bmc-icon"><i class="fas fa-percent"></i></span>' +
                '<span class="bmc-label">Superar Selic</span>' +
                '<span class="bmc-value" data-color="' + colorProb(probSelic) + '">' + probSelic + '%</span>' +
                '<span class="bmc-sub">das trajetórias superam<br>o CDI no período</span>' +
            '</div>' +
            '<div class="bench-mc-prob-card">' +
                '<span class="bmc-icon"><i class="fas fa-chart-column"></i></span>' +
                '<span class="bmc-label">Mediana · CAGR</span>' +
                '<span class="bmc-value" class="u-colorc9a84c">+' + cagr + '%</span>' +
                '<span class="bmc-sub">ao ano · valor mediano<br>' + fmtBRLShort(medFinal) + '</span>' +
            '</div>' +
            '<div class="bench-mc-prob-card">' +
                '<span class="bmc-icon"><i class="fas fa-shield-halved"></i></span>' +
                '<span class="bmc-label">Capital positivo</span>' +
                '<span class="bmc-value" data-color="' + colorProb(probPositivo) + '">' + probPositivo + '%</span>' +
                '<span class="bmc-sub">P10: ' + fmtBRLShort(p10Final) + '<br>P90: ' + fmtBRLShort(p90Final) + '</span>' +
            '</div>';
    }

    // Render gráfico
    _renderPortfolioMCChart(result, serieNtnb, serieSelic, labels);
}

function _renderPortfolioMCChart(result, serieNtnb, serieSelic, labels) {
    const canvas = document.getElementById('chart-portfolio-mc');
    if (!canvas) return;
    if (portfolioMCChart) portfolioMCChart.destroy();

    portfolioMCChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                // Bandas do cone
                {
                    label: 'P90',
                    data: result.p90,
                    borderColor: 'rgba(201,168,76,0.0)',
                    backgroundColor: 'rgba(201,168,76,0.08)',
                    borderWidth: 0,
                    pointRadius: 0,
                    tension: 0.4,
                    fill: false,
                },
                {
                    label: 'P75',
                    data: result.p75,
                    borderColor: 'rgba(201,168,76,0.0)',
                    backgroundColor: 'rgba(201,168,76,0.10)',
                    borderWidth: 0,
                    pointRadius: 0,
                    tension: 0.4,
                    fill: 0,
                },
                {
                    label: 'Mediana do portfólio (P50)',
                    data: result.p50,
                    borderColor: '#c9a84c',
                    backgroundColor: 'transparent',
                    borderWidth: 3,
                    pointRadius: 4,
                    pointBackgroundColor: '#c9a84c',
                    tension: 0.4,
                    fill: false,
                },
                {
                    label: 'P25',
                    data: result.p25,
                    borderColor: 'rgba(201,168,76,0.0)',
                    backgroundColor: 'rgba(201,168,76,0.06)',
                    borderWidth: 0,
                    pointRadius: 0,
                    tension: 0.4,
                    fill: 2,
                },
                {
                    label: 'P10',
                    data: result.p10,
                    borderColor: 'rgba(201,168,76,0.0)',
                    backgroundColor: 'rgba(201,168,76,0.04)',
                    borderWidth: 0,
                    pointRadius: 0,
                    tension: 0.4,
                    fill: 3,
                },
                // Benchmarks determinísticos
                {
                    label: 'NTN-B (IPCA+7,5%)',
                    data: serieNtnb,
                    borderColor: '#4caf7d',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [7, 4],
                    pointRadius: 3,
                    pointBackgroundColor: '#4caf7d',
                    tension: 0.3,
                    fill: false,
                },
                {
                    label: 'Selic projetada',
                    data: serieSelic,
                    borderColor: '#5b9cf6',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [3, 3],
                    pointRadius: 3,
                    pointBackgroundColor: '#5b9cf6',
                    tension: 0.3,
                    fill: false,
                },
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: '#888',
                        font: { size: 11, family: 'DM Mono' },
                        boxWidth: 22,
                        padding: 14,
                        filter: function(item) {
                            return ['Mediana do portfólio (P50)', 'NTN-B (IPCA+7,5%)', 'Selic projetada'].indexOf(item.text) !== -1;
                        }
                    }
                },
                tooltip: {
                    backgroundColor: '#0d0d0d',
                    borderColor: '#2a2a2a',
                    borderWidth: 1,
                    titleColor: '#777',
                    bodyColor: '#e8e8e8',
                    bodyFont: { family: 'DM Mono', size: 11 },
                    padding: 12,
                    callbacks: {
                        label: function(ctx) {
                            if (ctx.dataset.borderWidth === 0) return null;
                            return ' ' + ctx.dataset.label + ': R$ ' + fmt(ctx.raw, 0);
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#555', font: { size: 11, family: 'DM Mono' } },
                    grid: { color: 'rgba(255,255,255,0.04)' }
                },
                y: {
                    ticks: {
                        color: '#555',
                        font: { size: 11, family: 'DM Mono' },
                        callback: function(v) { return fmtBRLShort(v); }
                    },
                    grid: { color: 'rgba(255,255,255,0.04)' }
                }
            }
        }
    });
}

// Recalcula MC do portfólio automaticamente quando perfil ou cenário muda
function _refreshPortfolioMC() {
    if (portfolioMCOpen) {
        setTimeout(function() { _runPortfolioMC(); }, 40);
    }
}

// ══════════════════════════════════════════════════════════════════
// ── ENGINE GEOPOLITICO ───────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════

let geoProbChart = null;
let geoReturnChart = null;
let geoPortfolioMCChart = null;
let geoPortfolioMCOpen = false;

function _initGeoScenarios() {
    _renderGeoScenarioCards();
    _renderGeoProbChart();
    _renderGeoReturnChart();
    _renderGeoMacroGrid();
    _renderGeoImpactGrid();
}

function _renderGeoScenarioCards() {
    var container = document.getElementById('geo-scenario-selector');
    if (!container) return;
    container.innerHTML = window.geoScenarios.map(function(s, i) {
        var isActive = window.geoActiveScenario && window.geoActiveScenario.id === s.id;
        var probRange = (s.probMin * 100).toFixed(0) + '-' + (s.probMax * 100).toFixed(0) + '%';
        return '<div class="geo-sc-card' + (isActive ? ' active' : '') + '" data-ev="geo:' + s.id + '">' +
            '<div class="geo-sc-index">' + (i + 1) + '</div>' +
            '<div class="geo-sc-body">' +
                '<div class="geo-sc-name">' + s.nome + '</div>' +
                '<div class="geo-sc-prob">Prob. estimada: ' + probRange + '</div>' +
            '</div>' +
        '</div>';
    }).join('');
}

function selectGeoScenario(id, el) {
    if (window.geoActiveScenario && window.geoActiveScenario.id === id) {
        window.geoActiveScenario = null;
    } else {
        window.geoActiveScenario = window.geoScenarios.find(function(s) { return s.id === id; }) || null;
    }
    _renderGeoScenarioCards();
    _renderGeoScenarioDetail();
    _renderGeoMacroGrid();
    _renderGeoImpactGrid();
    _refreshGeoPortfolioMC();
}

function _renderGeoScenarioDetail() {
    var el = document.getElementById('geo-scenario-detail');
    if (!el) return;
    var s = window.geoActiveScenario;
    if (!s) {
        el.innerHTML = '<div class="u-fontsize12px-colorvarmuted-lineheight16-padding10px0">Selecione um cenario geopolitico acima para ver os retornos condicionais projetados para cada ativo.</div>';
        return;
    }
    var labels = { gold: 'Ouro', silver: 'Prata', platinum: 'Platina', copper: 'Cobre', btc: 'BTC', ntnb: 'NTN-B', cdi: 'CDI' };
    var retItems = ['gold','silver','platinum','copper','btc','ntnb','cdi'].map(function(k) {
        var val = s.retornos[k] || 0;
        var cls = val >= 0.10 ? 'geo-ret-pos' : val < 0.05 ? 'geo-ret-neg' : 'geo-ret-neu';
        var sign = val >= 0 ? '+' : '';
        return '<div class="geo-return-item">' +
            '<div class="geo-ret-label">' + (labels[k] || k) + '</div>' +
            '<div class="geo-ret-value ' + cls + '">' + sign + (val * 100).toFixed(1) + '%</div>' +
        '</div>';
    }).join('');
    el.innerHTML =
        '<div class="geo-detail-section">' +
            '<div class="geo-detail-label">Descricao</div>' +
            '<div class="geo-detail-text">' + s.desc + '</div>' +
        '</div>' +
        '<div class="geo-detail-section">' +
            '<div class="geo-detail-label">Retornos anuais condicionais (CAGR)</div>' +
            '<div class="geo-return-grid">' + retItems + '</div>' +
        '</div>';
}

function _renderGeoProbChart() {
    var canvas = document.getElementById('chart-geo-prob');
    if (!canvas) return;
    if (geoProbChart) geoProbChart.destroy();
    var labels = window.geoScenarios.map(function(s) { return s.nome; });
    var probMins = window.geoScenarios.map(function(s) { return s.probMin * 100; });
    var probMaxs = window.geoScenarios.map(function(s) { return s.probMax * 100; });
    var probMids = window.geoScenarios.map(function(s) { return (s.probMin + s.probMax) / 2 * 100; });
    geoProbChart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'Piso', data: probMins, backgroundColor: 'rgba(201,168,76,0.15)', borderColor: 'rgba(201,168,76,0.3)', borderWidth: 1, barPercentage: 0.7 },
                { label: 'Teto', data: probMaxs.map(function(v, i) { return v - probMins[i]; }), backgroundColor: 'rgba(201,168,76,0.35)', borderColor: 'rgba(201,168,76,0.55)', borderWidth: 1, barPercentage: 0.7 }
            ]
        },
        options: {
            indexAxis: 'y', responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0d0d0d', borderColor: '#2a2a2a', borderWidth: 1, bodyColor: '#e8e8e8', bodyFont: { family: 'DM Mono', size: 11 }, callbacks: { label: function(ctx) { var i = ctx.dataIndex; return ' ' + probMins[i].toFixed(0) + '% - ' + probMaxs[i].toFixed(0) + '% (central: ' + probMids[i].toFixed(0) + '%)'; } } } },
            scales: { x: { stacked: true, ticks: { color: '#555', font: { size: 10, family: 'DM Mono' }, callback: function(v) { return v + '%'; } }, grid: { color: 'rgba(255,255,255,0.04)' }, max: 60 }, y: { stacked: true, ticks: { color: '#888', font: { size: 10 } }, grid: { display: false } } }
        }
    });
}

function _renderGeoReturnChart() {
    var canvas = document.getElementById('chart-geo-return');
    if (!canvas) return;
    if (geoReturnChart) geoReturnChart.destroy();
    var assets = ['gold', 'silver', 'platinum', 'copper', 'btc'];
    var assetLabels = ['Ouro', 'Prata', 'Platina', 'Cobre', 'Bitcoin'];
    var colors = ['rgba(106,150,212,0.7)', 'rgba(224,143,143,0.7)', 'rgba(76,175,125,0.7)', 'rgba(201,168,76,0.7)', 'rgba(180,130,130,0.7)'];
    var datasets = window.geoScenarios.map(function(s, i) {
        return { label: s.nome, data: assets.map(function(a) { return (s.retornos[a] || 0) * 100; }), backgroundColor: colors[i], borderColor: colors[i].replace('0.7', '1'), borderWidth: 0, barPercentage: 0.8, categoryPercentage: 0.9 };
    });
    var benchCen = benchCenario || 'base';
    var taxasAtivo = window.taxasCenario[benchCen] || window.taxasCenario.base;
    var baseRates = assets.map(function(a) {
        var key = a === 'btc' ? 'btc' : a;
        return ((taxasAtivo[key] || taxasAtivo[a]) * 100) || 0;
    });
    datasets.push({ label: 'Cenario base atual', data: baseRates, backgroundColor: 'transparent', borderColor: '#c9a84c', borderWidth: 2, borderDash: [6, 4], type: 'line', pointRadius: 5, pointBackgroundColor: '#c9a84c', fill: false, tension: 0 });
    geoReturnChart = new Chart(canvas, {
        type: 'bar', data: { labels: assetLabels, datasets: datasets },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#888', font: { size: 10 }, boxWidth: 14, padding: 10 } }, tooltip: { backgroundColor: '#0d0d0d', borderColor: '#2a2a2a', borderWidth: 1, bodyColor: '#e8e8e8', bodyFont: { family: 'DM Mono', size: 11 }, callbacks: { label: function(ctx) { return ' ' + ctx.dataset.label + ': ' + (ctx.raw >= 0 ? '+' : '') + ctx.raw.toFixed(1) + '% a.a.'; } } } }, scales: { x: { ticks: { color: '#888', font: { size: 12 } }, grid: { display: false } }, y: { ticks: { color: '#555', font: { size: 11, family: 'DM Mono' }, callback: function(v) { return v + '%'; } }, grid: { color: 'rgba(255,255,255,0.04)' } } } }
    });
}

var _geoSparkCharts = {};

function _renderGeoMacroGrid() {
    var el = document.getElementById('geo-macro-grid');
    if (!el) return;
    var s = window.geoActiveScenario || window.geoScenarios[0];
    var macroKeys = [
        { key: 'selic', label: 'Selic (% a.a.)', format: function(v) { return (v * 100).toFixed(1) + '%'; }, color: '#6a96d4' },
        { key: 'ipca', label: 'IPCA (% a.a.)', format: function(v) { return (v * 100).toFixed(1) + '%'; }, color: '#e08f8f' },
        { key: 'usdbrl', label: 'USD/BRL', format: function(v) { return 'R$ ' + v.toFixed(2); }, color: '#c9a84c' },
        { key: 'brent', label: 'Brent (USD/bbl)', format: function(v) { return '$ ' + v.toFixed(0); }, color: '#d4885a' }
    ];
    // Destroi sparklines anteriores antes de recriar o HTML
    Object.keys(_geoSparkCharts).forEach(function(k) {
        if (_geoSparkCharts[k]) { _geoSparkCharts[k].destroy(); _geoSparkCharts[k] = null; }
    });
    _geoSparkCharts = {};
    el.innerHTML = macroKeys.map(function(mk) {
        var path = s.macro[mk.key];
        var current = path[0], future = path[path.length - 1];
        var dirColor = future > current * 1.05 ? 'var(--red)' : future < current * 0.95 ? 'var(--green)' : 'var(--muted)';
        return '<div class="geo-macro-mini">' +
            '<div class="geo-macro-mini-label">' + mk.label + '</div>' +
            '<div class="geo-macro-mini-value" data-color="' + dirColor + '">' + mk.format(current) + ' &rarr; ' + mk.format(future) + '</div>' +
            '<div class="u-height60px-positionrelative"><canvas id="geo-macro-spark-' + mk.key + '" class="u-width100-height60px"></canvas></div>' +
        '</div>';
    }).join('');
    // Renderiza sparklines apos o DOM atualizar (um unico rAF basta)
    requestAnimationFrame(function() {
        macroKeys.forEach(function(mk) {
            _renderGeoSparkline('geo-macro-spark-' + mk.key, s.macro[mk.key], mk.color);
        });
    });
}

function _renderGeoSparkline(canvasId, data, color) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    // Garante que o canvas tem dimensoes explicitas para o Chart.js
    canvas.width = canvas.parentElement.clientWidth || 200;
    canvas.height = 60;
    if (_geoSparkCharts[canvasId]) _geoSparkCharts[canvasId].destroy();
    var ctx = canvas.getContext('2d');
    _geoSparkCharts[canvasId] = new Chart(ctx, {
        type: 'line',
        data: { labels: ['2026','2027','2028','2029','2030'], datasets: [{ data: data, borderColor: color, borderWidth: 1.5, pointRadius: 0, tension: 0.3, fill: false }] },
        options: { responsive: false, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false } } }
    });
}

function _renderGeoImpactGrid() {
    var el = document.getElementById('geo-impact-grid');
    if (!el) return;
    var s = window.geoActiveScenario;
    if (!s) { el.innerHTML = ''; return; }
    var sections = [
        { key: 'beneficiados', cls: 'benefit', icon: 'fa-arrow-trend-up', color: 'var(--green)', label: 'Setores Beneficiados' },
        { key: 'penalizados', cls: 'penalty', icon: 'fa-arrow-trend-down', color: 'var(--red)', label: 'Setores Penalizados' },
        { key: 'neutros', cls: 'neutral-card', icon: 'fa-scale-balanced', color: 'var(--blue)', label: 'Impacto Neutro ou Ambivalente' }
    ];
    el.innerHTML = sections.map(function(sec) {
        var items = (s.setoresBR[sec.key] || []).map(function(item) { return '<li>' + item + '</li>'; }).join('');
        return '<div class="geo-impact-card ' + sec.cls + '">' +
            '<div class="geo-impact-header"><i class="fas ' + sec.icon + '" data-color="' + sec.color + '"></i><span>' + sec.label + '</span></div>' +
            '<ul class="geo-impact-list">' + items + '</ul></div>';
    }).join('');
}

function toggleGeoPortfolioMC(btn) {
    var content = document.getElementById('geo-mc-content');
    if (geoPortfolioMCOpen) {
        content.style.display = 'none';
        btn.classList.remove('active');
        geoPortfolioMCOpen = false;
        document.getElementById('geo-mc-toggle-hint').textContent = 'Expandir simulacao geopolitica condicional';
        return;
    }
    btn.classList.add('bmt-loading', 'active');
    document.getElementById('geo-mc-toggle-hint').textContent = 'Calculando 5 cenarios x 2.000 trajetorias...';
    setTimeout(function() {
        _runPortfolioMCGeo();
        content.style.display = 'block';
        btn.classList.remove('bmt-loading');
        geoPortfolioMCOpen = true;
        document.getElementById('geo-mc-toggle-hint').textContent = 'Simulacao condicional por cenario geopolitico';
    }, 40);
}

function _runPortfolioMCGeo() {
    var val = parseInt(document.getElementById('portfolio-slider').value) || 500000;
    var prazo = benchPrazo;
    var perfil = perfilAtivo || 'moderado';
    var N = 2000;
    var itens = PERFIS[perfil].items[benchCenario] || PERFIS[perfil].items.base;
    var taxasAtivo = window.taxasCenario[benchCenario] || window.taxasCenario.base;

    function _baseTaxa(key, y) {
        switch(key) {
            case 'ntnb': return getNtnbAno(y); case 'cdi': return getSelicAno(y); case 'reserva': return getSelicAno(y);
            case 'gold': return taxasAtivo.gold || taxasAtivo.ouro || 0.10;
            case 'silver': return taxasAtivo.silver || taxasAtivo.prata || 0.10;
            case 'platinum': return taxasAtivo.platinum || taxasAtivo.platina || 0.10;
            case 'copper': return taxasAtivo.copper || taxasAtivo.cobre || 0.10;
            case 'btc': return taxasAtivo.btc || 0.10;
            default: return 0.10;
        }
    }

    // Cenario base (sem overlay geopolitico)
    var basePaths = [];
    for (var n = 0; n < N; n++) {
        var pv = val, serie = [pv];
        for (var y = 1; y <= prazo; y++) {
            var portReturn = 0;
            itens.forEach(function(item) {
                var w = item.pct / 100, base = _baseTaxa(item.key, y), vol = VOL_PORT[item.key] || 0.10;
                portReturn += w * (Math.exp(base - 0.5 * vol * vol + vol * randNorm()) - 1);
            });
            pv = Math.max(pv * (1 + portReturn), 0); serie.push(pv);
        }
        basePaths.push(serie);
    }

    var geoResults = [{ id: 'base', label: 'Cenario base (sem overlay)', paths: basePaths, color: '#c9a84c' }];
    var geoColors = ['#6a96d4', '#e08f8f', '#4caf7d', '#d4885a', '#8ecfdd'];

    window.geoScenarios.forEach(function(geo, gi) {
        var paths = [];
        for (var n = 0; n < N; n++) {
            var pv = val, serie = [pv];
            for (var y = 1; y <= prazo; y++) {
                var portReturn = 0;
                itens.forEach(function(item) {
                    var w = item.pct / 100, geoRet = geo.retornos[item.key];
                    var base = (geoRet !== undefined) ? geoRet : _baseTaxa(item.key, y);
                    var vol = VOL_PORT[item.key] || 0.10;
                    portReturn += w * (Math.exp(base - 0.5 * vol * vol + vol * randNorm()) - 1);
                });
                pv = Math.max(pv * (1 + portReturn), 0); serie.push(pv);
            }
            paths.push(serie);
        }
        geoResults.push({ id: geo.id, label: geo.nome, paths: paths, color: geoColors[gi] || '#888' });
    });

    // Calcular percentis
    var labels = []; for (var y = 0; y <= prazo; y++) labels.push(y === 0 ? 'Hoje' : 'Ano ' + y);
    geoResults.forEach(function(gr) {
        var pct = function(arr, p) { return arr[Math.floor(p * (arr.length - 1))]; };
        var result = { p10: [], p25: [], p50: [], p75: [], p90: [] };
        for (var y = 0; y <= prazo; y++) {
            var vals = gr.paths.map(function(p) { return p[y]; }).sort(function(a,b) { return a - b; });
            result.p10.push(pct(vals, 0.10)); result.p25.push(pct(vals, 0.25)); result.p50.push(pct(vals, 0.50)); result.p75.push(pct(vals, 0.75)); result.p90.push(pct(vals, 0.90));
        }
        gr.result = result;
        gr.finalVals = gr.paths.map(function(p) { return p[prazo]; }).sort(function(a,b) { return a - b; });
        gr.medFinal = result.p50[prazo];
        gr.cagr = ((Math.pow(gr.medFinal / val, 1 / prazo) - 1) * 100).toFixed(1);
    });

    // Render grid de probabilidades
    var probGrid = document.getElementById('geo-mc-prob-grid');
    if (probGrid) {
        probGrid.innerHTML = geoResults.map(function(gr) {
            var probPos = (gr.finalVals.filter(function(v) { return v > val; }).length / N * 100).toFixed(0);
            var colorProb = parseFloat(probPos) >= 65 ? '#4caf7d' : parseFloat(probPos) >= 45 ? '#c9a84c' : '#e05c5c';
            return '<div class="bench-mc-prob-card">' +
                '<span class="bmc-icon"><i class="fas fa-chart-line"></i></span>' +
                '<span class="bmc-label">' + gr.label + '</span>' +
                '<span class="bmc-value" data-color="' + gr.color + '">' + (parseFloat(gr.cagr) >= 0 ? '+' : '') + gr.cagr + '%</span>' +
                '<span class="bmc-sub">CAGR · Positivo: <strong data-color="' + colorProb + '">' + probPos + '%</strong><br>Mediana: ' + fmtBRLShort(gr.medFinal) + '</span>' +
            '</div>';
        }).join('');
    }

    _renderGeoPortfolioMCChart(geoResults, labels);
}

function _renderGeoPortfolioMCChart(geoResults, labels) {
    var canvas = document.getElementById('chart-geo-portfolio-mc');
    if (!canvas) return;
    if (geoPortfolioMCChart) geoPortfolioMCChart.destroy();
    var datasets = [];
    geoResults.forEach(function(gr) {
        if (gr.id === 'base') {
            datasets.push({ label: gr.label + ' P75', data: gr.result.p75, borderColor: 'rgba(201,168,76,0.0)', backgroundColor: 'rgba(201,168,76,0.10)', borderWidth: 0, pointRadius: 0, tension: 0.4, fill: false });
            datasets.push({ label: gr.label + ' P25', data: gr.result.p25, borderColor: 'rgba(201,168,76,0.0)', backgroundColor: 'rgba(201,168,76,0.05)', borderWidth: 0, pointRadius: 0, tension: 0.4, fill: 1 });
        }
        datasets.push({ label: gr.label + ' (P50)', data: gr.result.p50, borderColor: gr.color, backgroundColor: 'transparent', borderWidth: gr.id === 'base' ? 3 : 2, borderDash: gr.id === 'base' ? [] : [4, 4], pointRadius: gr.id === 'base' ? 4 : 2, pointBackgroundColor: gr.color, tension: 0.4, fill: false });
    });
    geoPortfolioMCChart = new Chart(canvas, {
        type: 'line', data: { labels: labels, datasets: datasets },
        options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
            plugins: { legend: { position: 'top', labels: { color: '#888', font: { size: 11, family: 'DM Mono' }, boxWidth: 22, padding: 12, filter: function(item) { return item.text.indexOf('P50') !== -1 || item.text.indexOf('base') !== -1; } } },
                tooltip: { backgroundColor: '#0d0d0d', borderColor: '#2a2a2a', borderWidth: 1, titleColor: '#777', bodyColor: '#e8e8e8', bodyFont: { family: 'DM Mono', size: 11 }, padding: 12, callbacks: { label: function(ctx) { if (ctx.dataset.borderWidth === 0) return null; return ' ' + ctx.dataset.label + ': R$ ' + fmt(ctx.raw, 0); } } } },
            scales: { x: { ticks: { color: '#555', font: { size: 11, family: 'DM Mono' } }, grid: { color: 'rgba(255,255,255,0.04)' } }, y: { ticks: { color: '#555', font: { size: 11, family: 'DM Mono' }, callback: function(v) { return 'R$ ' + fmt(v, 0); } }, grid: { color: 'rgba(255,255,255,0.04)' } } } }
    });
    var disc = document.getElementById('geo-mc-disclaimer');
    if (disc) disc.innerHTML = '<strong class="u-colorvarmuted">Metodologia:</strong> 2.000 trajetorias independentes para cada um dos 5 cenarios geopoliticos + cenario base (12.000 simulacoes totais). Volatilidades: ouro 15%, prata 34%, platina 32%, cobre 21%, Bitcoin 85%, NTN-B duration 8%, CDI/reserva 0,5%. As projecoes condicionais usam retornos anuais e trajetorias macro calibradas com dados de prediction markets (Polymarket, Good Judgment, Metaculus) e series historicas de conflito (Correlates of War, UCDP). Nao constitui garantia de retorno. Cenarios geopoliticos sao eventos unicos (Knightianos) sem serie historica para calibracao estatistica; as probabilidades refletem avaliacao qualitativa estruturada.';
}

function _refreshGeoPortfolioMC() {
    if (geoPortfolioMCOpen) {
        setTimeout(function() { _runPortfolioMCGeo(); }, 40);
    }
}

atualizarAlocacao(500000);
setTimeout(() => { desenharDonut(500000); desenharBenchmark(); _initGeoScenarios(); }, 300);

// ── WIDGETS TRADINGVIEW SOB DEMANDA ──
// Antes: os 25 widgets subiam no parse. Medido: 12 estavam em abas fechadas e
// 8 abaixo da dobra, ou seja, 20 de 25 carregavam sem ninguem ver. A pagina tem
// 11.398px e a viewport mostra ~8% dela no load.
// Os <script> viraram type="text/tv-lazy" (tipo desconhecido = o navegador nao
// executa, mas preserva a config). Aqui cada um e instanciado quando o container
// entra em viewport. Aba fechada tem display:none, entao nao intersecta e so
// carrega quando a aba abre — o mesmo mecanismo cobre os dois casos.
// O aviso de indisponivel tambem mora aqui: e armado por container, no instante
// em que o script real entra no DOM. Container ainda pendente nunca e acusado.
(function () {
    var containers = [].slice.call(document.querySelectorAll('.tradingview-widget-container'));
    var pendentes = containers.filter(function (c) {
        return c.querySelector('script[type="text/tv-lazy"]');
    });

    var PRAZO = 9000;   // ms de tolerancia contados a partir da injecao do script

    function mensagem() {
        var fb = document.createElement('div');
        fb.className = 'tv-fallback';
        fb.style.display = 'flex';
  fb.style.alignItems = 'center';
  fb.style.justifyContent = 'center';
  fb.style.height = '100%';
  fb.style.minHeight = '120px';
  fb.style.color = 'var(--gold)';
  fb.style.fontSize = '12px';
  fb.style.fontFamily = "'DM Mono',monospace";
  fb.style.textAlign = 'center';
  fb.style.padding = '16px';
        fb.innerHTML = '<span><i class="fas fa-chart-line" class="u-displayblock-fontsize22px-marginbottom8px-opacity04"></i>Gráfico TradingView indisponível<br><span class="u-fontsize10px-opacity06">Verifique sua conexão ou bloqueador de scripts</span></span>';
        return fb;
    }

    function avisar(container) {
        if (!container.querySelector('.tv-fallback')) container.appendChild(mensagem());
    }

    // Vigia um container ate o iframe nascer. MutationObserver e nao polling:
    // dispara no exato instante da insercao e o mesmo callback resolve os dois
    // casos — cancela o aviso pendente e remove o aviso que ja foi anexado.
    function vigiar(container) {
        var timer = null;
        var mo = null;

        function temIframe() { return !!container.querySelector('iframe'); }

        function encerrar() {
            if (timer) { clearTimeout(timer); timer = null; }
            if (mo) { mo.disconnect(); mo = null; }
        }

        function veredito() {
            timer = null;
            if (temIframe()) { encerrar(); return; }
            // Aba em background nao renderiza o widget: adiar o julgamento ate
            // a aba voltar, senao os 25 containers viram falso positivo.
            if (document.hidden) {
                document.addEventListener('visibilitychange', function volta() {
                    document.removeEventListener('visibilitychange', volta);
                    timer = setTimeout(veredito, PRAZO);
                });
                return;
            }
            avisar(container);
            // Segue vigiando de proposito: iframe atrasado apaga o aviso.
        }

        if ('MutationObserver' in window) {
            mo = new MutationObserver(function () {
                if (!temIframe()) return;
                var velho = container.querySelector('.tv-fallback');
                if (velho) velho.parentNode.removeChild(velho);
                encerrar();
            });
            mo.observe(container, { childList: true, subtree: true });
        }
        timer = setTimeout(veredito, PRAZO);
    }

    function ativar(container) {
        var inerte = container.querySelector('script[type="text/tv-lazy"]');
        if (!inerte) return;
        var real = document.createElement('script');
        real.type = 'text/javascript';
        real.async = true;
        real.src = inerte.getAttribute('data-src');
        real.textContent = inerte.textContent;   // config JSON do widget
        // Falha inequivoca: bloqueador ou rede derrubou o s3.tradingview.com.
        real.onerror = function () { avisar(container); };
        inerte.parentNode.replaceChild(real, inerte);
        vigiar(container);
    }

    // Sem IntersectionObserver, carrega tudo: degrada para o comportamento antigo.
    if (!('IntersectionObserver' in window)) {
        pendentes.forEach(ativar);
        return;
    }

    var io = new IntersectionObserver(function (entradas) {
        entradas.forEach(function (e) {
            if (!e.isIntersecting) return;
            io.unobserve(e.target);
            ativar(e.target);
        });
    }, { rootMargin: '400px 0px' });   // margem para chegar pronto na rolagem

    pendentes.forEach(function (c) { io.observe(c); });
})();

// ── SCROLL REVEAL ──
// Marca js-ready so aqui: e o sinal de que o observer existe e vai revelar.
// Se este script nao rodar, o CSS mantem tudo visivel em vez de esconder.
const podeAnimar = window.matchMedia('(prefers-reduced-motion: no-preference)').matches;

if (podeAnimar && 'IntersectionObserver' in window) {
    document.documentElement.classList.add('js-ready');
    const observer = new IntersectionObserver(entries => {
        entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
    }, { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

// ── ESC CLOSE ──
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        // close any open modals
    }
});



// ══════════════════════════════════════════════════════════════════
// ── MONTE CARLO ENGINE
// ══════════════════════════════════════════════════════════════════

// Deriva de VOL_PORT para não haver duas verdades sobre a mesma volatilidade.
const VOL_ANUAL = {
    gold:     VOL_PORT.gold,
    silver:   VOL_PORT.silver,
    platinum: VOL_PORT.platinum,
    copper:   VOL_PORT.copper,
    btc:      VOL_PORT.btc,
    cdi:      VOL_PORT.cdi,
    ntnb:     VOL_PORT.ntnb,
    usdbrl:   VOL_PORT.usdbrl,
};

let usdBrlLive = 5.75;
const IPCA_PROJ = 0.050;

// PRNG determinístico (mulberry32) — mesmo seed → mesmos resultados
function _makePRNG(seed) {
    seed = seed >>> 0;
    return function() {
        seed = (seed + 0x6D2B79F5) >>> 0;
        var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function runMC(inicial, aporte, taxaAnual, volAnual, prazo, N, seed) {
    N = N || 1000;
    seed = (seed !== undefined) ? seed : 42;
    const rand = _makePRNG(seed);
    function _randNorm() {
        let u, v;
        do { u = rand(); v = rand(); } while (u === 0);
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }
    const anos = parseInt(prazo) || 10;
    const paths = [];
    for (let n = 0; n < N; n++) {
        const serie = [inicial];
        let pv = inicial;
        for (let y = 1; y <= anos; y++) {
            const drift  = taxaAnual - 0.5 * volAnual * volAnual;
            const shock  = volAnual * _randNorm();
            const aportesAno = aporte * 12;
            pv = Math.max(pv * Math.exp(drift + shock) + aportesAno, 0);
            serie.push(pv);
        }
        paths.push(serie);
    }
    const result = { p10: [], p25: [], p50: [], p75: [], p90: [], mean: [] };
    for (let y = 0; y <= anos; y++) {
        const vals = paths.map(function(p) { return p[y]; }).sort(function(a, b) { return a - b; });
        const p = function(pct) { return vals[Math.floor(pct * (vals.length - 1))]; };
        result.p10.push(p(0.10));
        result.p25.push(p(0.25));
        result.p50.push(p(0.50));
        result.p75.push(p(0.75));
        result.p90.push(p(0.90));
        result.mean.push(vals.reduce(function(a,b){return a+b;},0) / vals.length);
    }
    return result;
}

function calcSharpe(taxaAnual, volAnual, rfUSD) {
    rfUSD = rfUSD || 0.05;
    if (volAnual === 0) return '0.00';
    return ((taxaAnual - rfUSD) / volAnual).toFixed(2);
}

function calcMaxDrawdown(volAnual, prazo) {
    const dd = Math.min(volAnual * Math.sqrt(prazo) * 0.7, 0.99);
    return (dd * 100).toFixed(1);
}

const mcCharts = {};
const mcState  = {};

function toggleMC(asset, btn) {
    const content = document.getElementById('mc-content-' + asset);
    const isOpen  = content.style.display !== 'none';
    if (isOpen) {
        content.style.display = 'none';
        btn.classList.remove('active');
        return;
    }
    btn.classList.add('mc-loading', 'active');
    setTimeout(function() {
        _buildMC(asset, 'usd');
        content.style.display = 'block';
        btn.classList.remove('mc-loading');
    }, 30);
}

function _buildMC(asset, currency) {
    const c = simConfigs[asset];
    if (!c) return;
    const ini   = parseFloat(document.getElementById(c.ini) && document.getElementById(c.ini).value)   || 10000;
    const ap    = parseFloat(document.getElementById(c.ap) && document.getElementById(c.ap).value)     || 500;
    const prazo = parseFloat(document.getElementById(c.prazo) && document.getElementById(c.prazo).value) || (asset === 'btc' ? 4 : 10);
    const taxa  = c.base;
    const vol   = VOL_ANUAL[asset] || 0.20;
    const result = runMC(ini, ap, taxa, vol, prazo, 10000);
    mcState[asset] = { currency: currency, result: result, ini: ini, ap: ap, prazo: prazo, taxa: taxa, vol: vol };
    // Clarity: mc_run
    if (window.clarity && window.SZ_CLARITY_ID && window.SZ_CLARITY_ID !== 'XXXXXXXXXX') {
        try { window.clarity('event', 'mc_run'); } catch(e) {}
    }
    _renderMCMetrics(asset, result, ini, ap, prazo, taxa, vol, currency);
    _renderMCChart(asset, result, prazo, currency, ini, ap);
}

function setMCCurrency(asset, currency, btn) {
    const wrap = document.getElementById('mc-brl-' + asset);
    if (wrap) wrap.querySelectorAll('.mc-brl-btn').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    const s = mcState[asset];
    if (!s) return;
    s.currency = currency;
    _renderMCMetrics(asset, s.result, s.ini, s.ap, s.prazo, s.taxa, s.vol, currency);
    _renderMCChart(asset, s.result, s.prazo, currency, s.ini, s.ap);
}

function _convertBRL(val, currency) {
    if (currency !== 'brl') return val;
    return val * usdBrlLive;
}

function _fmtMC(val, currency) {
    const v = _convertBRL(val, currency);
    const sym = currency === 'brl' ? 'R$ ' : '$ ';
    if (v >= 1e6) return sym + (v / 1e6).toFixed(2).replace('.', ',') + ' M';
    if (v >= 1e3) return sym + (v / 1e3).toFixed(1).replace('.', ',') + 'K';
    return sym + Math.round(v).toLocaleString('pt-BR');
}

function _renderMCMetrics(asset, result, ini, ap, prazo, taxa, vol, currency) {
    const container = document.getElementById('mc-metrics-' + asset);
    if (!container) return;
    const finalMedian = result.p50[result.p50.length - 1];
    const finalP10    = result.p10[result.p10.length - 1];
    const totalInv    = ini + ap * 12 * prazo;
    const sharpe  = calcSharpe(taxa, vol, 0.05);
    const maxDD   = calcMaxDrawdown(vol, prazo);
    const retMed  = (((finalMedian - totalInv) / totalInv) * 100).toFixed(0);
    const cagr    = ((Math.pow(finalMedian / Math.max(ini, 1), 1 / prazo) - 1) * 100).toFixed(1);
    const assetColors = { gold: '#c9a84c', silver: '#c0c0c0', platinum: '#8ecfdd', copper: '#b87333', btc: '#f07a40' };
    const color = assetColors[asset] || '#c9a84c';
    const sharpeNum = parseFloat(sharpe);
    const sharpeColor = sharpeNum >= 0.8 ? '#4caf7d' : sharpeNum >= 0.4 ? '#c9a84c' : '#e05c5c';
    const sharpeIcon  = sharpeNum >= 0.8 ? '&#x1F7E2;' : sharpeNum >= 0.4 ? '&#x1F7E1;' : '&#x1F534;';
    container.innerHTML =
        '<div class="mc-metric-card">' +
            '<span class="mc-metric-icon">&#x1F4CA;</span>' +
            '<span class="mc-metric-label">Mediana (P50)</span>' +
            '<span class="mc-metric-value" data-color="' + color + '">' + _fmtMC(finalMedian, currency) + '</span>' +
            '<span class="mc-metric-sub">CAGR ' + cagr + '% &middot; Ret ' + (retMed >= 0 ? '+' : '') + retMed + '%</span>' +
        '</div>' +
        '<div class="mc-metric-card">' +
            '<span class="mc-metric-icon">' + sharpeIcon + '</span>' +
            '<span class="mc-metric-label">Sharpe Ratio</span>' +
            '<span class="mc-metric-value" data-color="' + sharpeColor + '">' + sharpe + '</span>' +
            '<span class="mc-metric-sub">Risk-free 5% &middot; Vol ' + (vol*100).toFixed(0) + '%/ano</span>' +
        '</div>' +
        '<div class="mc-metric-card">' +
            '<span class="mc-metric-icon">&#x26A0;&#xFE0F;</span>' +
            '<span class="mc-metric-label">Drawdown m&aacute;x.</span>' +
            '<span class="mc-metric-value" class="u-colore07070">~' + maxDD + '%</span>' +
            '<span class="mc-metric-sub">Pior caso P10: ' + _fmtMC(finalP10, currency) + '</span>' +
        '</div>' +
        (asset === 'btc' ? '<div class="u-gridcolumn11-fontsize10px-colorrgba24012264055-lineheight15">&#9432; O valor exibido nos cartões de cenário usa juros compostos determinísticos (CAGR fixo). O Monte Carlo acima simula 10.000 trajetórias log-normais com vol. hist. de ' + (vol*100).toFixed(0) + '% a.a. — a mediana P50 é a estimativa probabilisticamente robusta para fins de compliance.</div>' : '');
}

function _renderMCChart(asset, result, prazo, currency, ini, ap) {
    const canvas = document.getElementById('chart-mc-' + asset);
    if (!canvas) return;
    const labels = [];
    for (let y = 0; y <= prazo; y++) labels.push(y === 0 ? 'Hoje' : 'Ano ' + y);
    const conv = function(arr) { return arr.map(function(v) { return _convertBRL(v, currency); }); };
    const sym  = currency === 'brl' ? 'R$' : '$';
    const assetColors = { gold: '#c9a84c', silver: '#c0c0c0', platinum: '#8ecfdd', copper: '#b87333', btc: '#f07a40' };
    const color = assetColors[asset] || '#c9a84c';
    if (mcCharts[asset]) mcCharts[asset].destroy();
    mcCharts[asset] = new Chart(canvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'P90 (melhor 10%)', data: conv(result.p90), borderColor: 'rgba(76,175,125,0.3)', backgroundColor: 'rgba(76,175,125,0.07)', borderWidth: 1.5, borderDash: [5,4], pointRadius: 0, tension: 0.4, fill: false },
                { label: 'P75', data: conv(result.p75), borderColor: 'rgba(76,175,125,0.0)', backgroundColor: 'rgba(76,175,125,0.08)', borderWidth: 0, pointRadius: 0, tension: 0.4, fill: 0 },
                { label: 'Mediana (P50)', data: conv(result.p50), borderColor: color, backgroundColor: color + '12', borderWidth: 2.5, pointRadius: 3, pointBackgroundColor: color, tension: 0.4, fill: false },
                { label: 'P25', data: conv(result.p25), borderColor: 'rgba(224,112,112,0.0)', backgroundColor: 'rgba(224,112,112,0.06)', borderWidth: 0, pointRadius: 0, tension: 0.4, fill: 2 },
                { label: 'P10 (pior 10%)', data: conv(result.p10), borderColor: 'rgba(224,112,112,0.3)', backgroundColor: 'rgba(224,112,112,0.04)', borderWidth: 1.5, borderDash: [5,4], pointRadius: 0, tension: 0.4, fill: 3 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    labels: {
                        color: '#666', font: { size: 10, family: 'DM Mono' }, boxWidth: 14,
                        filter: function(item) { return ['P90 (melhor 10%)', 'Mediana (P50)', 'P10 (pior 10%)'].indexOf(item.text) !== -1; }
                    }
                },
                tooltip: {
                    backgroundColor: '#111', borderColor: '#2a2a2a', borderWidth: 1,
                    titleColor: '#888', bodyColor: '#e8e8e8',
                    bodyFont: { family: 'DM Mono', size: 11 },
                    callbacks: {
                        label: function(ctx) {
                            if (ctx.dataset.borderWidth === 0) return null;
                            return ' ' + ctx.dataset.label + ': ' + sym + ' ' + Math.round(ctx.raw).toLocaleString('pt-BR');
                        }
                    }
                }
            },
            scales: {
                x: { ticks: { color: '#555', font: { size: 10, family: 'DM Mono' } }, grid: { color: 'rgba(255,255,255,0.04)' } },
                y: {
                    ticks: {
                        color: '#555', font: { size: 10, family: 'DM Mono' },
                        callback: function(v) {
                            if (v >= 1e6) return sym + (v/1e6).toFixed(1) + 'M';
                            if (v >= 1e3) return sym + Math.round(v/1000) + 'K';
                            return sym + Math.round(v);
                        }
                    },
                    grid: { color: 'rgba(255,255,255,0.04)' }
                }
            }
        }
    });
}



// ══════════════════════════════════════════════════════════════════
// ── PDF EXPORT ENGINE v4 — 100% jsPDF nativo, máx 2 páginas
// ══════════════════════════════════════════════════════════════════

async function exportPDF(fabEl) {
    if (fabEl) {
        fabEl.classList.add('fab-loading');
        fabEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span class="fab-text"> Gerando...</span>';
    }

    try {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const W = 210, H = 297, mg = 14;
        const GOLD = [201, 168, 76];
        const DARK = [8, 8, 8];
        const SURF = [18, 18, 18];
        const TEXT = [232, 232, 232];
        const MUT  = [110, 110, 110];

        // ── helpers ──────────────────────────────────────────────
        function bg() {
            pdf.setFillColor(...DARK); pdf.rect(0, 0, W, H, 'F');
            pdf.setFillColor(...GOLD); pdf.rect(0, 0, 5, H, 'F');
        }
        function divLine(y, alpha) {
            alpha = alpha || 0.15;
            pdf.setDrawColor(255*alpha, 255*alpha, 255*alpha);
            pdf.setLineWidth(0.2);
            pdf.line(mg, y, W-mg, y);
        }
        function goldLine(y) {
            pdf.setDrawColor(...GOLD); pdf.setLineWidth(0.3);
            pdf.line(mg, y, W-mg, y);
        }
        function val(id) {
            var el = document.getElementById(id);
            return el ? el.textContent.trim() : '—';
        }
        function activeSimLabel() {
            var panel = document.querySelector('.sim-panel.active');
            if (!panel) return 'Ouro';
            var id = panel.id || '';
            var map = { 'sim-ouro':'Ouro (XAU/USD)', 'sim-prata':'Prata (XAG/USD)', 'sim-platina':'Platina (XPT/USD)', 'sim-cobre':'Cobre (XCU/USD)', 'sim-btc':'Bitcoin (BTC/USD)', 'sim-cdi':'CDI', 'sim-ntnb':'NTN-B (IPCA+)', 'sim-usdbrl':'USD/BRL' };
            return map[id] || 'Ativo';
        }
        function getSimConfig() {
            var panel = document.querySelector('.sim-panel.active');
            if (!panel) return { prefix:'g', ini:10000, ap:500, prazo:10, asset:'gold' };
            var id = panel.id || '';
            var map = {
                'sim-ouro':    { prefix:'g', asset:'gold' },
                'sim-prata':   { prefix:'s', asset:'silver' },
                'sim-platina': { prefix:'p', asset:'platinum' },
                'sim-cobre':   { prefix:'cu', asset:'copper' },
                'sim-btc':     { prefix:'b', asset:'btc' },
                'sim-cdi':     { prefix:'c', asset:'cdi' },
                'sim-ntnb':    { prefix:'n', asset:'ntnb' },
                'sim-usdbrl':  { prefix:'u', asset:'usdbrl' },
            };
            var cfg = map[id] || { prefix:'g', asset:'gold' };
            var conf = simConfigs[cfg.asset] || {};
            cfg.ini   = parseFloat((document.getElementById(conf.ini)  || {}).value) || 10000;
            cfg.ap    = parseFloat((document.getElementById(conf.ap)   || {}).value) || 500;
            cfg.prazo = parseFloat((document.getElementById(conf.prazo)|| {}).value) || 10;
            return cfg;
        }
        function pfmt(n) {
            // format BRL short
            if (!n || isNaN(n)) return '—';
            if (n >= 1e6) return 'R$ ' + (n/1e6).toFixed(2).replace('.',',') + ' M';
            if (n >= 1e3) return 'R$ ' + Math.round(n/1000) + ' K';
            return 'R$ ' + Math.round(n).toLocaleString('pt-BR');
        }

        // ════════════════════════════════════════════════════════
        // PÁG 1 — RELATÓRIO COMPLETO
        // ════════════════════════════════════════════════════════
        bg();

        // Header bar
        pdf.setFillColor(...SURF);
        pdf.rect(mg, 10, W-mg*2, 24, 'F');
        pdf.setTextColor(...GOLD);
        pdf.setFontSize(14); pdf.setFont('helvetica','bold');
        pdf.text('MultiAsset', mg+8, 21);
        pdf.setFontSize(7); pdf.setFont('helvetica','normal');
        pdf.setTextColor(...MUT);
        pdf.text('CONSULTORIA', mg+8, 28);

        // Date + title right
        var dt = new Date().toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric'});
        pdf.setFontSize(7); pdf.setTextColor(...MUT);
        pdf.text(dt, W-mg-4, 18, {align:'right'});
        pdf.setFontSize(8); pdf.setFont('helvetica','bold'); pdf.setTextColor(...TEXT);
        pdf.text('Relatório MultiAsset Pro', W-mg-4, 26, {align:'right'});

        goldLine(36);

        var cy = 44;

        // ── SIMULADOR ATIVO ──────────────────────────────────────
        var simLabel = activeSimLabel();
        var cfg = getSimConfig();
        var p = cfg.prefix;
        var totalInv = cfg.ini + cfg.ap * 12 * cfg.prazo;

        pdf.setFontSize(7); pdf.setTextColor(...GOLD); pdf.setFont('helvetica','bold');
        pdf.text('SIMULADOR — ' + simLabel.toUpperCase(), mg, cy); cy += 6;

        pdf.setFillColor(...SURF);
        pdf.roundedRect(mg, cy, W-mg*2, 42, 3, 3, 'F');

        // Parâmetros
        pdf.setFontSize(7); pdf.setFont('helvetica','normal'); pdf.setTextColor(...MUT);
        pdf.text('Inicial', mg+4, cy+7);
        pdf.text('Aporte/mês', mg+45, cy+7);
        pdf.text('Prazo', mg+86, cy+7);
        pdf.text('Total investido', mg+122, cy+7);

        pdf.setFont('helvetica','bold'); pdf.setTextColor(...TEXT); pdf.setFontSize(9);
        pdf.text('$ '+cfg.ini.toLocaleString('en'), mg+4, cy+14);
        pdf.text('$ '+cfg.ap.toLocaleString('en'), mg+45, cy+14);
        pdf.text(cfg.prazo+' anos', mg+86, cy+14);
        pdf.text('$ '+(Math.round(totalInv)).toLocaleString('en'), mg+122, cy+14);

        divLine(cy+18, 0.06);

        // 3 cenários
        var cenarios = [
            { label:'CONSERVADOR', valId: p+'-pess', retId: p+'-pess-r', color:[224,92,92] },
            { label:'MODERADO',    valId: p+'-base', retId: p+'-base-r', color:[91,156,246] },
            { label:'AGRESSIVO',   valId: p+'-otim', retId: p+'-otim-r', color:[76,175,125] },
        ];
        // Cards de cenário: 3 colunas iguais com padding generoso
        var gap  = 4;
        var cW   = (W - mg*2 - gap*2) / 3;
        var cH   = 22;
        cenarios.forEach(function(cen, ci) {
            var cx2 = mg + ci*(cW + gap);
            var fv  = val(cen.valId);
            var ret = val(cen.retId);

            // Card background
            pdf.setFillColor(18, 18, 18);
            pdf.roundedRect(cx2, cy+18, cW, cH, 2, 2, 'F');
            // Colored top border
            pdf.setFillColor(cen.color[0], cen.color[1], cen.color[2]);
            pdf.roundedRect(cx2, cy+18, cW, 1.5, 0.5, 0.5, 'F');

            // Label
            pdf.setFontSize(6); pdf.setFont('helvetica','bold');
            pdf.setTextColor(cen.color[0], cen.color[1], cen.color[2]);
            pdf.text(cen.label, cx2 + cW/2, cy+24, {align:'center'});

            // Value
            pdf.setFontSize(10); pdf.setFont('helvetica','bold');
            pdf.setTextColor(...TEXT);
            var fvShort = fv.length > 12 ? fv.substring(0,12) : fv;
            pdf.text(fvShort, cx2 + cW/2, cy+32, {align:'center'});

            // Return %
            pdf.setFontSize(7); pdf.setFont('helvetica','normal');
            pdf.setTextColor(cen.color[0], cen.color[1], cen.color[2]);
            pdf.text(ret, cx2 + cW/2, cy+37.5, {align:'center'});
        });
        cy += 50;

        // ── PORTFÓLIO ─────────────────────────────────────────────
        pdf.setFontSize(7); pdf.setTextColor(...GOLD); pdf.setFont('helvetica','bold');
        pdf.text('PORTFÓLIO ESTRATÉGICO', mg, cy); cy += 5;

        var portfolioVal = parseInt((document.getElementById('portfolio-slider')||{}).value)||500000;
        var perfis_label = {conservador:'Conservador',moderado:'Moderado',arrojado:'Arrojado'};
        var cenario_label = {pessimista:'Pessimista',base:'Base',otimista:'Otimista'};
        pdf.setFontSize(6.5); pdf.setFont('helvetica','normal'); pdf.setTextColor(...MUT);
        pdf.text('Perfil: '+(perfis_label[perfilAtivo]||'Moderado')+'  ·  Cenário: '+(cenario_label[benchCenario]||'Base')+'  ·  Total: '+(pfmt(portfolioVal)), mg, cy); cy += 5;

        var items = getAllocItems();
        var barMaxW = W-mg*2-50;
        items.forEach(function(item) {
            if (cy+8 > H-28) return;
            var v = portfolioVal * item.pct / 100;
            var bW = Math.max(barMaxW * item.pct / 100, 1);

            pdf.setFillColor(22,22,22);
            pdf.roundedRect(mg, cy, W-mg*2, 7, 1, 1, 'F');

            // Color bar
            function hexToRgb(hex) { var r=hex.match(/[A-Fa-f0-9]{2}/g); return r?r.slice(0,3).map(function(x){return parseInt(x,16);}):[201,168,76]; }
            var clr = item.color.startsWith('#')?hexToRgb(item.color.replace('#','')):[201,168,76];
            // Background track
            pdf.setFillColor(30,30,30);
            pdf.roundedRect(mg+38, cy+1.5, barMaxW-40, 4, 1, 1, 'F');
            // Colored fill bar
            pdf.setFillColor(clr[0],clr[1],clr[2]);
            var fillW = Math.max((barMaxW-40) * item.pct / 100, 1.5);
            pdf.roundedRect(mg+38, cy+1.5, fillW, 4, 1, 1, 'F');

            pdf.setFontSize(6.5); pdf.setFont('helvetica','normal');
            pdf.setTextColor(...TEXT); pdf.text(item.label, mg+4, cy+5.5);
            pdf.setTextColor(clr[0],clr[1],clr[2]); pdf.text(fmtPct(item.pct), mg+32, cy+5.5);
            pdf.setTextColor(...MUT); pdf.text('R$'+Math.round(v).toLocaleString('pt-BR'), W-mg-3, cy+5.5, {align:'right'});
            cy += 9;
        });
        cy += 4;

        // ── BENCHMARK RESUMO ────────────────────────────────────
        pdf.setFontSize(7); pdf.setTextColor(...GOLD); pdf.setFont('helvetica','bold');
        pdf.text('PROJEÇÃO — ' + benchPrazo + ' ANOS', mg, cy); cy += 5;

        var tbody = document.getElementById('bench-tbody');
        if (tbody) {
            var rows = tbody.querySelectorAll('tr');
            rows.forEach(function(row) {
                if (cy+9 > H-28) return;
                var cells = row.querySelectorAll('td');
                if (cells.length < 5) return;

                pdf.setFillColor(18,18,18);
                pdf.roundedRect(mg, cy, W-mg*2, 8, 1.5, 1.5, 'F');

                pdf.setFontSize(7); pdf.setFont('helvetica','normal');
                pdf.setTextColor(...TEXT);
                pdf.text(cells[0].textContent.trim().substring(0,28), mg+3, cy+6);

                // CAGR + final value
                var cagr = cells[3].textContent.trim();
                var fv   = cells[4].textContent.trim();
                var isPos = cagr.indexOf('+') !== -1;
                pdf.setTextColor(isPos?76:224, isPos?175:92, isPos?125:92);
                pdf.text(cagr, W-mg-38, cy+6);
                pdf.setTextColor(...MUT);
                pdf.text(fv.substring(0,14), W-mg-3, cy+6, {align:'right'});
                cy += 10;
            });
        }

        cy += 4;
        goldLine(cy); cy += 6;

        // ── DISCLAIMER COMPACTO ──────────────────────────────────
        pdf.setFontSize(5.8); pdf.setFont('helvetica','normal'); pdf.setTextColor(70,70,70);
        var disc = [
            'Documento informativo e educacional. Não constitui recomendação de investimento.',
            'Valores simulados com base em modelos matemáticos. Resultados passados não garantem retornos futuros.',
            'MultiAsset  ·  multi-assets.com'
        ];
        disc.forEach(function(line) { pdf.text(line, W/2, cy, {align:'center'}); cy += 4.5; });

        // ── FOOTER ──────────────────────────────────────────────
        pdf.setFillColor(12,12,12); pdf.rect(0, H-11, W, 11, 'F');
        pdf.setFontSize(5.5); pdf.setTextColor(55,55,55);
        pdf.text('DOCUMENTO INFORMATIVO · NÃO CONSTITUI RECOMENDAÇÃO DE INVESTIMENTO', W/2, H-5, {align:'center'});
        pdf.setTextColor(80,80,80);
        pdf.text('1 / 1', W-mg, H-5, {align:'right'});

        // ── DOWNLOAD ────────────────────────────────────────────
        var ts = new Date().toISOString().slice(0,10);
        // Clarity: pdf_download
        if (window.clarity && window.SZ_CLARITY_ID && window.SZ_CLARITY_ID !== 'XXXXXXXXXX') {
            try { window.clarity('event', 'pdf_download'); } catch(e) {}
        }
        pdf.save('multiasset-relatorio-' + ts + '.pdf');

    } catch(err) {
        console.error('PDF error:', err);
        alert('Erro ao gerar PDF: ' + err.message);
    } finally {
        if (fabEl) {
            fabEl.classList.remove('fab-loading');
            fabEl.innerHTML = '<i class="fas fa-file-pdf"></i><span class="fab-text">Exportar Relatório</span>';
        }
    }
}

// ── MACRO INDICATORS — fetch automático ──
// Análise macro servida pelo servidor via macro_api.php
const MACRO_CACHE_KEY = 'szuchmacher_macro_cache';
const MACRO_CACHE_TTL = 1 * 24 * 60 * 60 * 1000; // 1 dia — atualização diária

function setMacroEl(id, valor, decimals) {
    const el = document.getElementById(id);
    if (el && valor > 0) el.textContent = valor.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + (id !== 'macro-usd' ? '%' : '');
}

async function fetchBCBSerie(serie) {
    const res = await fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados/ultimos/1?formato=json`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error('bcb ' + serie);
    const d = await res.json();
    return parseFloat(d[0]?.valor || 0);
}

async function fetchMacroIndicators() {
    let selicPct = null, ipcaPct = null, cdiPct = null;

    try {
        const res = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL', { signal: AbortSignal.timeout(8000) });
        if (res.ok) {
            const d = await res.json();
            const usd = parseFloat(d.USDBRL?.bid || 0);
            if (usd > 0) {
                usdBrlLive = usd;
                window.macroLive.usd = usd;
                const el = document.getElementById('macro-usd');
                if (el) el.textContent = usd.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }
        }
    } catch(e) {}

    try {
        const v = await fetchBCBSerie(13522);
        if (v > 0) { ipcaPct = v; setMacroEl('macro-ipca', v, 2); }
    } catch(e) {}

    let selicOk = false, cdiOk = false;
    try {
        const res = await fetch('https://brasilapi.com.br/api/taxas/v1', { signal: AbortSignal.timeout(10000) });
        if (res.ok) {
            const taxas = await res.json();
            const selic = taxas.find(t => /selic/i.test(t.nome));
            const cdi   = taxas.find(t => /^cdi$/i.test(t.nome));
            if (selic?.valor > 0) { selicPct = parseFloat(selic.valor); setMacroEl('macro-selic', selicPct, 2); selicOk = true; }
            if (cdi?.valor   > 0) { cdiPct = parseFloat(cdi.valor); setMacroEl('macro-cdi', cdiPct, 2); cdiOk = true; }
        }
    } catch(e) {}

    if (!selicOk) {
        try {
            const v = await fetchBCBSerie(432);
            if (v > 0) { selicPct = v; setMacroEl('macro-selic', v, 2); }
        } catch(e) {}
    }

    if (!cdiOk) {
        try {
            const diaria = await fetchBCBSerie(12);
            if (diaria > 0) {
                const anual = (Math.pow(1 + diaria / 100, 252) - 1) * 100;
                cdiPct = anual;
                setMacroEl('macro-cdi', anual, 2);
            }
        } catch(e) {}
    }

    if (selicPct > 0) window.macroLive.selic = selicPct / 100;
    if (ipcaPct > 0) window.macroLive.ipca = ipcaPct / 100;
    if (cdiPct > 0) window.macroLive.cdi = cdiPct / 100;
    updateBenchAssumptionsUI();
    if (typeof desenharBenchmark === 'function') desenharBenchmark();
}

async function loadMarketData() {
    try {
        const res = await fetch('market-data.php', { signal: AbortSignal.timeout(12000) });
        const data = await res.json();
        if (!data || !data.ok) return;
        const fmtChg = function (n) {
            if (n == null || isNaN(n)) return '—';
            const sign = n >= 0 ? '+' : '';
            return sign + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
        };
        if (data.ibov) {
            const el = document.getElementById('macro-ibov');
            const ch = document.getElementById('macro-ibov-chg');
            if (el) el.textContent = Number(data.ibov.value).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
            if (ch) ch.textContent = fmtChg(data.ibov.change_pct) + ' hoje';
        }
        if (data.wti) {
            const el = document.getElementById('macro-wti');
            const ch = document.getElementById('macro-wti-chg');
            if (el) el.textContent = 'US$ ' + Number(data.wti.value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            if (ch) ch.textContent = fmtChg(data.wti.change_pct) + ' hoje';
        }
    } catch (e) {
        console.warn('market-data.php indisponível:', e.message);
    }
}

async function gerarAnaliseMacro(forcar = false) {
    // Busca análise gerada pelo cron diário no servidor
    // O arquivo macro_data.json é atualizado às 23:00 BRT pelo macro_cron.php
    const CACHE_KEY = 'szuchmacher_macro_v3';
    const CACHE_TTL = 2 * 60 * 60 * 1000; // re-consulta servidor a cada 2h no máximo

    // Checa cache local primeiro (evita requisição desnecessária)
    if (!forcar) {
        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                const obj = JSON.parse(cached);
                if (Date.now() - obj.timestamp < CACHE_TTL) {
                    renderMacro(obj.data);
                    return;
                }
            }
        } catch(e) {}
    }

    try {
        const res = await fetch('macro_api.php', {
            signal: AbortSignal.timeout(45000),
            headers: { 'Accept': 'application/json' }
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const json = await res.json();
        if (!json.ok || !json.data) throw new Error('Invalid response');

        // Salva no localStorage do browser (cache local 2h)
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            timestamp:    Date.now(),
            generated_at: json.generated_at || '',
            data:         json.data,
        }));

        renderMacro(json.data);

    } catch(e) {
        console.warn('macro_api.php indisponível, tentando macro_data.json:', e.message);
        try {
            const res2 = await fetch('macro_data.json', {
                signal: AbortSignal.timeout(15000),
                headers: { 'Accept': 'application/json' }
            });
            if (!res2.ok) throw new Error('HTTP ' + res2.status);
            const json2 = await res2.json();
            if (!json2.data) throw new Error('macro_data.json sem campo data');
            localStorage.setItem(CACHE_KEY, JSON.stringify({
                timestamp:    Date.now(),
                generated_at: json2.generated_at || '',
                data:         json2.data,
            }));
            renderMacro(json2.data);
        } catch(e2) {
            console.warn('macro_data.json indisponível, usando conteúdo estático:', e2.message);
        }
    }
}

function _showMacroStamp(generatedAt) {
    const se = document.getElementById('macro-stamp-inline');
    const st = document.getElementById('macro-stamp-text');
    if (se && st && generatedAt) {
        st.textContent = 'Atualizado em ' + generatedAt;
        se.style.display = 'inline-flex';
    }
}

function renderMacro(d) {
    // Sanitizar citações [N] que LLMs às vezes inserem
    const stripCites = s => typeof s === 'string' ? s.replace(/(\[\d+\])+/g, '') : s;
    // Escape HTML obrigatório: os campos vêm de LLM (macro_api.php) e entram via
    // innerHTML. Sem isso, qualquer markup que o modelo reproduzir vira XSS
    // armazenado no domínio. escRich libera apenas <strong>, que o prompt pede
    // nos campos beneficiados/penalizados/cenários.
    const escHtml = s => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    // Whitelist apenas <strong>. Qualquer outra coisa que pareca tag fica
    // como texto literal escapado (inofensivo). Remover "tags" por regex
    // apagava texto legitimo entre < e > nos campos do LLM, ex.:
    // "crescimento < 2%" virava "crescimento" — delecao silenciosa.
    const escRich = s => escHtml(s)
        .replace(/&lt;strong&gt;/g, '<strong>').replace(/&lt;\/strong&gt;/g, '</strong>');
    const sanitize = obj => {
        if (typeof obj === 'string') return stripCites(obj);
        if (Array.isArray(obj)) return obj.map(sanitize);
        if (obj && typeof obj === 'object') { const r = {}; for (const k in obj) r[k] = sanitize(obj[k]); return r; }
        return obj;
    };
    d = sanitize(d);
    const set = (id, val) => { const el = document.getElementById(id); if (el && val) el.innerHTML = val; };

    set('macro-cenario-eyebrow', escHtml(d.eyebrow));
    set('macro-alert-title', escHtml(d.alert_title));
    set('macro-alert-text', escHtml(d.alert_text));
    set('macro-alert-badge', escHtml(d.alert_badge));

    if (d.canais?.length) {
        const dirMap = { up: '↑', down: '↓', neutral: '~' };
        const clsMap = { up: 'up', down: 'down', neutral: 'neutral' };
        const tbody = document.getElementById('macro-canais-tbody');
        if (tbody) {
            tbody.innerHTML = d.canais.map(c => `<tr>
                <td><strong>${escHtml(c.variavel)}</strong></td>
                <td><span class="macro-dir ${clsMap[c.direcao] || 'neutral'}">${dirMap[c.direcao] || '~'}</span></td>
                <td>${escHtml(c.mecanismo)}</td>
            </tr>`).join('');
        }
    }

    if (d.brasil?.length) {
        const cont = document.getElementById('macro-brasil-content');
        if (cont) {
            cont.innerHTML = d.brasil.map(b => `<div class="macro-brazil-item">
                <div class="macro-brazil-label">${escHtml(b.label)}</div>
                <div class="macro-brazil-text">${escHtml(b.text)}</div>
            </div>`).join('');
        }
    }

    if (d.beneficiados?.length) {
        const el = document.getElementById('macro-setores-beneficiados');
        if (el) el.innerHTML = d.beneficiados.map(s => `<li>${escRich(s)}</li>`).join('');
    }
    if (d.penalizados?.length) {
        const el = document.getElementById('macro-setores-penalizados');
        if (el) el.innerHTML = d.penalizados.map(s => `<li>${escRich(s)}</li>`).join('');
    }
    if (d.cenarios_brent?.length) {
        const el = document.getElementById('macro-cenarios-brent');
        if (el) el.innerHTML = d.cenarios_brent.map(s => `<li>${escRich(s)}</li>`).join('');
    }

    // Timestamp de última atualização
    const _se2 = document.getElementById('macro-stamp-inline');
    const _st2 = document.getElementById('macro-stamp-text');
    if (_se2 && _st2) {
        const _now = new Date();
        _st2.textContent = 'Atualizado em ' + _now.toLocaleDateString('pt-BR', {timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric'}) + ' às ' + _now.toLocaleTimeString('pt-BR', {timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}) + ' BRT';
        _se2.style.display = 'inline-flex';
    }

    // Atualizar cenários dos ativos
    if (d.ativos) {
        const map = [
            { key: 'ouro',    ids: { conservador: ['g-rate-cons','g-desc-cons'], moderado: ['g-rate-mod','g-desc-mod'], agressivo: ['g-rate-agr','g-desc-agr'] } },
            { key: 'prata',   ids: { conservador: ['s-rate-cons','s-desc-cons'], moderado: ['s-rate-mod','s-desc-mod'], agressivo: ['s-rate-agr','s-desc-agr'] } },
            { key: 'platina', ids: { conservador: ['p-rate-cons','p-desc-cons'], moderado: ['p-rate-mod','p-desc-mod'], agressivo: ['p-rate-agr','p-desc-agr'] } },
            { key: 'bitcoin', ids: { conservador: ['b-rate-cons','b-desc-cons'], moderado: ['b-rate-mod','b-desc-mod'], agressivo: ['b-rate-agr','b-desc-agr'] } },
        ];
        map.forEach(({ key, ids }) => {
            const ativo = d.ativos[key];
            if (!ativo) return;
            ['conservador', 'moderado', 'agressivo'].forEach(perfil => {
                const p = ativo[perfil];
                if (!p) return;
                // p.taxa não alimenta mais o .sc-rate: o payload traz faixa de alocação
                // ("8-12% do patrimônio") e o card exibe retorno anual esperado. Em produção
                // o card do ouro exibia "8-12% do patrimônio" no lugar de "+9,3% a.a.".
                // O retorno mostrado é o curado no HTML, coerente com simConfigs.
                const [, descId] = ids[perfil];
                // b-desc-cons tem dois escritores: este e o do BTC Radar, que troca a
                // descrição de perda total pela de taxa anual. Sem esta guarda, quem
                // resolvesse por último vencia, e o card podia exibir "−10% a.a." com
                // um texto falando em perda de 60% do capital.
                if (descId === 'b-desc-cons' && window._btcRadarDescAplicada) return;
                if (p.desc)  { const el = document.getElementById(descId);  if (el) el.textContent = p.desc; }
            });
        });
    }
    syncAutomationFromMacro(d);
}

// ── RENDA FIXA DIÁRIA — NTNB11 + CDI/Selic — cache até 9h BRT ──
const RF_CACHE_KEY = 'szuchmacher_rf_diario';

function rfCacheValido() {
    try {
        const raw = localStorage.getItem(RF_CACHE_KEY);
        if (!raw) return false;
        const obj = JSON.parse(raw);
        const agora = new Date();
        const nove  = new Date(agora); nove.setHours(9, 0, 0, 0);
        return obj.ts >= nove.getTime() && agora >= nove;
    } catch(e) { return false; }
}

function aplicarRFCache(obj) {
    const priceEl = document.getElementById('alloc-ntnb-price');
    const rateEl  = document.getElementById('alloc-cdi-rate');
    if (priceEl && obj.ntnb)  priceEl.textContent = 'R$ ' + parseFloat(obj.ntnb).toLocaleString('pt-BR', {minimumFractionDigits:2,maximumFractionDigits:2});
    if (rateEl  && obj.selic) rateEl.textContent  = parseFloat(obj.selic).toLocaleString('pt-BR', {minimumFractionDigits:2,maximumFractionDigits:2}) + '%';
}

async function fetchRFDiario() {
    if (rfCacheValido()) {
        try { aplicarRFCache(JSON.parse(localStorage.getItem(RF_CACHE_KEY))); } catch(e) {}
        return;
    }
    let ntnbPrice = null, selicRate = null;

    // IB5M11 (IMA-B 5+): proxy server-side (market-data.php) — evita CORS Yahoo
    // no browser. A chave do payload continua 'ntnb11' por contrato; a fonte
    // trocou de NTNB11 para IB5M11 na auditoria de 15/08/2026, quando se
    // confirmou que o NTNB11.SA nao existe no Yahoo e que o fallback brapi.dev
    // (removido daqui) respondia 401 sem token desde maio/2026.
    try {
        const res = await fetch('/market-data.php', { signal: AbortSignal.timeout(10000), headers: { 'Accept': 'application/json' } });
        if (res.ok) {
            const d = await res.json();
            const seeded = Array.isArray(d?.stale) && d.stale.indexOf('ntnb11') !== -1;
            const p = d?.ntnb11?.value;
            if (!seeded && p > 0) ntnbPrice = p;
        }
    } catch(e) {}

    // CDI/Selic: BrasilAPI → BCB série 432
    try {
        const res = await fetch('https://brasilapi.com.br/api/taxas/v1', { signal: AbortSignal.timeout(10000) });
        if (res.ok) { const taxas = await res.json(); const s = taxas.find(t => /selic/i.test(t.nome)); if (s?.valor > 0) selicRate = parseFloat(s.valor); }
    } catch(e) {}
    if (!selicRate) {
        try {
            const res = await fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json', { signal: AbortSignal.timeout(8000) });
            if (res.ok) { const d = await res.json(); const v = parseFloat(d[0]?.valor); if (v > 0) selicRate = v; }
        } catch(e) {}
    }

    if (ntnbPrice || selicRate) {
        const payload = { ts: Date.now(), ntnb: ntnbPrice, selic: selicRate };
        localStorage.setItem(RF_CACHE_KEY, JSON.stringify(payload));
        aplicarRFCache(payload);
        if (selicRate > 0) {
            window.macroLive.selic = selicRate / 100;
            updateBenchAssumptionsUI();
            if (typeof desenharBenchmark === 'function') desenharBenchmark();
        }
    }
}

function scheduleRFDiario() {
    fetchRFDiario();
    const agora = new Date();
    const nove  = new Date(agora);
    nove.setHours(9, 0, 0, 0);
    if (agora < nove) {
        setTimeout(function () {
            fetchRFDiario();
            scheduleRFDiario();
        }, nove.getTime() - agora.getTime());
    } else {
        const amanha = new Date(agora);
        amanha.setDate(amanha.getDate() + 1);
        amanha.setHours(9, 0, 0, 0);
        setTimeout(scheduleRFDiario, amanha.getTime() - agora.getTime());
    }
}

// Macro strip + mercado + RF + narrativa — bootstrap automático
fetchMacroIndicators();
loadMarketData();
scheduleRFDiario();
gerarAnaliseMacro(false);
setInterval(fetchMacroIndicators, 30 * 60 * 1000);
setInterval(loadMarketData, 10 * 60 * 1000);
setInterval(function () { gerarAnaliseMacro(false); }, 2 * 60 * 60 * 1000);


// ══════════════════════════════════════════════════════════════════
// ── EXIT-INTENT POPUP ENGINE
// ══════════════════════════════════════════════════════════════════

(function() {
    const POPUP_KEY     = 'szuchmacher_exit_shown';
    const POPUP_SUB_KEY = 'szuchmacher_subscribed';
    const MIN_TIME_MS   = 12000; // mínimo 12s na página antes de mostrar
    let   pageEnterTime = Date.now();
    let   popupShown    = false;

    // Não mostrar se já viu ou já subscreveu
    function shouldShow() {
        return !sessionStorage.getItem(POPUP_KEY) &&
               !localStorage.getItem(POPUP_SUB_KEY) &&
               !popupShown;
    }

    function showExitPopup() {
        if (!shouldShow()) return;
        if (Date.now() - pageEnterTime < MIN_TIME_MS) return;
        popupShown = true;
        sessionStorage.setItem(POPUP_KEY, '1');
        // Clarity: popup_shown
        if (window.clarity && window.SZ_CLARITY_ID && window.SZ_CLARITY_ID !== 'XXXXXXXXXX') {
            try { window.clarity('event', 'popup_shown', { time_on_page: Math.round((Date.now() - pageEnterTime) / 1000) }); } catch(e) {}
        }
        const overlay = document.getElementById('exit-popup-overlay');
        if (overlay) {
            overlay.classList.add('active');
            // Focus no input para mobile
            setTimeout(function() {
                var inp = document.getElementById('popup-email-input');
                if (inp && window.innerWidth > 768) inp.focus();
            }, 400);
        }
    }

    // Desktop: detecta cursor saindo pelo topo da página
    document.addEventListener('mouseleave', function(e) {
        if (e.clientY <= 2) showExitPopup();
    });

    // Mobile: detecta botão back (popstate) ou visibilidade perdida
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'hidden') showExitPopup();
    });

    // Fallback: após 90 segundos sem ação (visitante idle)
    setTimeout(function() {
        if (!popupShown) showExitPopup();
    }, 90000);
})();

function closeExitPopup() {
    var overlay = document.getElementById('exit-popup-overlay');
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(function() { overlay.classList.remove('active'); overlay.style.opacity = ''; }, 300);
    }
}

function submitExitPopup() {
    var emailInput = document.getElementById('popup-email-input');
    var btn        = document.getElementById('popup-submit-btn');
    var email      = emailInput ? emailInput.value.trim() : '';

    if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
        emailInput.style.borderColor = 'var(--red)';
        emailInput.focus();
        setTimeout(function () { emailInput.style.borderColor = ''; }, 2000);
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

    // /relatorio-signup e o caminho real: grava o inscrito no KV, aplica rate limit
    // e dispara o e-mail de boas-vindas com o ultimo Fechamento via Resend. Antes
    // daqui o popup ia direto para o Formspree, que so repassa para a caixa de
    // entrada: o visitante lia "a primeira analise chega em breve" e nada chegava.
    // Formspree fica como rede de seguranca para nao perder lead se o handler cair.
    function _formspreeFallback() {
        if (!(window.SZ && window.SZ.submitLead)) {
            return Promise.reject(new Error('formspree_pending'));
        }
        return window.SZ.submitLead({
            email: email,
            form: 'multiasset_exit_popup',
            origem: 'exit_popup',
            extra: { interesse: 'fechamento_mercado' }
        });
    }

    var submitPromise = fetch('/relatorio-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, source: 'multiasset_exit_popup' })
    }).then(function (r) {
        if (!r.ok) throw new Error('signup status ' + r.status);
        return r;
    }).catch(function (err) {
        console.warn('relatorio-signup indisponivel, usando Formspree:', err.message);
        return _formspreeFallback();
    });

    submitPromise.then(function () {
        localStorage.setItem('szuchmacher_subscribed', '1');
        var main    = document.getElementById('popup-main-content');
        var success = document.getElementById('popup-success');
        if (main)    main.style.display    = 'none';
        if (success) success.style.display = 'block';
        // Dispara PDF como isca imediata: o visitante sai com o relatorio na mao
        try { exportPDF(null); } catch(e) {}
        setTimeout(closeExitPopup, 5000);
        window.ga && window.ga('lead_capture', {
            source: 'exit_popup',
            form: 'multiasset_exit_popup'
        });
        // Clarity: popup_signup
        if (window.clarity && window.SZ_CLARITY_ID && window.SZ_CLARITY_ID !== 'XXXXXXXXXX') {
            try { window.clarity('event', 'popup_signup', { source: 'exit_popup' }); } catch(e) {}
        }
    }).catch(function () {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-envelope"></i> Receber análises';
        _shareToast('Não foi possível enviar agora. Tente novamente ou escreva para contato@multi-assets.com.', 4500);
    });
}

// Fechar popup com ESC
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeExitPopup();
});

// Fechar ao clicar no overlay (fora do card)
document.addEventListener('click', function(e) {
    var overlay = document.getElementById('exit-popup-overlay');
    var card    = document.getElementById('exit-popup-card');
    if (overlay && overlay.classList.contains('active') &&
        card && !card.contains(e.target)) {
        closeExitPopup();
    }
});

// ── PREÇOS AO VIVO — proxy server-side prices.php ─────────────────────────────
// Contador por ciclo de 15 min, não pela vida da página: sem resetar no
// setInterval, três falhas nas primeiras horas travavam o card em "$ —" pro
// resto do dia, porque a escada de retry só disparava uma vez.
let _pricesFalhas = 0;
function agendarRetryPrices() {
    if (_pricesFalhas >= 3) return;
    _pricesFalhas++;
    setTimeout(loadLivePrices, _pricesFalhas * 20000);
}
async function loadLivePrices() {
    try {
        const res  = await fetch('prices.php', { signal: AbortSignal.timeout(10000) });
        const data = await res.json();
        if (!data || !data.ok) {
            agendarRetryPrices();
            return;
        }
        window._livePrices = data;
        // source_state 'stale'/'stale-cache' indica cache vencido servido
        // durante a revalidacao: dado velho sem o flag stale ainda assim
        // nao e cotacao do minuto, e precisa do mesmo sinal honesto.
        const defasado = data.stale || data.source_state === 'stale' || data.source_state === 'stale-cache';
        if (defasado) {
            console.warn('prices.php: cotação parcial — fonte ao vivo indisponível, valores podem estar defasados');
        }
        // Atualiza o display de preço ao vivo no header de cada ativo
        const map = {
            'sp-gold-price':   data.gold,
            'sp-silver-price': data.silver,
            'sp-plat-price':   data.platinum,
            'sp-copper-price': data.copper,
            'sp-btc-price':    data.bitcoin,
        };
        Object.entries(map).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = val ? `$ ${Number(val).toLocaleString('en-US')}` : '$ —';
                // Sinal honesto de cotação defasada: tooltip no próprio preço,
                // sem mudar o layout.
                el.title = defasado ? 'Cotação defasada: fonte ao vivo indisponível no momento' : '';
            }
        });
        // Re-renderiza cards para exibir preço atual em todos os *-pess-price
        Object.keys(simConfigs).forEach(asset => recalcSim(asset));
        _pricesFalhas = 0;
    } catch (e) {
        console.warn('prices.php indisponível:', e.message);
        agendarRetryPrices();
    }
}
loadLivePrices();
setInterval(() => { _pricesFalhas = 0; loadLivePrices(); }, 15 * 60 * 1000);

// ══════════════════════════════════════════════════════════════════
// ── SIMULAÇÕES COMPARTILHÁVEIS (URL params + deep link)
// ══════════════════════════════════════════════════════════════════
const _SHARE_ASSET_TO_PANEL = {
    gold:     'sim-ouro',
    silver:   'sim-prata',
    platinum: 'sim-platina',
    copper:   'sim-cobre',
    btc:      'sim-btc',
    cdi:      'sim-cdi',
    ntnb:     'sim-ntnb',
    usdbrl:   'sim-usdbrl',
};

// Feedback visual (toast) com fallback inline
function _shareToast(msg, ms) {
    if (window.SZ && typeof window.SZ.toast === 'function') {
        window.SZ.toast(msg, ms);
        return;
    }
    var el = document.createElement('div');
    el.className = 'sz-toast';
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(function(){ el.classList.add('show'); });
    setTimeout(function(){
        el.classList.remove('show');
        setTimeout(function(){ if (el.parentNode) el.parentNode.removeChild(el); }, 350);
    }, ms || 2600);
}

// Cópia p/ clipboard com fallback
function _shareCopy(text) {
    if (window.SZ && typeof window.SZ.copyToClipboard === 'function') {
        return window.SZ.copyToClipboard(text);
    }
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text);
        }
    } catch(e) {}
    return new Promise(function(resolve, reject){
        try {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed'; ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            resolve();
        } catch(e) { reject(e); }
    });
}

function shareSim(asset, btnEl) {
    var c = simConfigs[asset];
    if (!c) return;
    var ini   = parseFloat(document.getElementById(c.ini)?.value)   || (asset === 'btc' ? 10000 : 10000);
    var ap    = parseFloat(document.getElementById(c.ap)?.value)    || 500;
    var prazo = parseFloat(document.getElementById(c.prazo)?.value) || (asset === 'btc' ? 4 : 10);
    var sel   = c.sel || 'pess';

    var qs = new URLSearchParams({
        sim: asset,
        ini: String(ini),
        ap: String(ap),
        prazo: String(prazo),
        sc: sel,
    });
    var url = location.origin + location.pathname + '?' + qs.toString() + '#simuladores';
    if (window.SZ && window.SZ.appendUTM) {
        url = window.SZ.appendUTM(url, { utm_content: 'sim_' + asset });
    }

    _shareCopy(url).then(function(){
        _shareToast('Link copiado! Cole onde quiser compartilhar sua simulação.', 2800);
        if (btnEl) {
            btnEl.classList.add('copied');
            var span = btnEl.querySelector('span');
            var original = span ? span.textContent : null;
            if (span) span.textContent = 'Link copiado ✓';
            setTimeout(function(){
                btnEl.classList.remove('copied');
                if (span && original) span.textContent = original;
            }, 2400);
        }
        window.ga && window.ga('simulation_shared', { asset: asset, prazo: prazo, ini: ini, ap: ap, scenario: sel });
        if (window.clarity) window.clarity('set', 'shared_sim', asset);
        if (window.clarity && window.SZ_CLARITY_ID && window.SZ_CLARITY_ID !== 'XXXXXXXXXX') {
            try { window.clarity('event', 'share_click', { asset: asset, type: 'sim' }); } catch(e) {}
        }
    }).catch(function(err){
        console.warn('copy failed', err);
        _shareToast('Não foi possível copiar automaticamente. URL: ' + url, 5000);
    });
}

function sharePortfolio(btnEl) {
    var slider = document.getElementById('portfolio-slider');
    var total  = slider ? parseInt(slider.value) : 500000;
    var perfil  = (typeof perfilAtivo  !== 'undefined') ? perfilAtivo  : 'moderado';
    var cenario = (typeof benchCenario !== 'undefined') ? benchCenario : 'base';
    var prazo   = (typeof benchPrazo   !== 'undefined') ? benchPrazo   : 5;

    var qs = new URLSearchParams({
        sim: 'portfolio',
        total: String(total),
        perfil: perfil,
        cenario: cenario,
        prazo: String(prazo),
    });
    var url = location.origin + location.pathname + '?' + qs.toString() + '#alocacao';
    if (window.SZ && window.SZ.appendUTM) {
        url = window.SZ.appendUTM(url, { utm_content: 'portfolio_' + perfil + '_' + cenario });
    }

    _shareCopy(url).then(function(){
        _shareToast('Link copiado! Cole onde quiser compartilhar seu portfólio.', 2800);
        if (btnEl) {
            btnEl.classList.add('copied');
            var span = btnEl.querySelector('span');
            var original = span ? span.textContent : null;
            if (span) span.textContent = 'Link copiado ✓';
            setTimeout(function(){
                btnEl.classList.remove('copied');
                if (span && original) span.textContent = original;
            }, 2400);
        }
        window.ga && window.ga('simulation_shared', { asset: 'portfolio', total: total, perfil: perfil, cenario: cenario, prazo: prazo });
        if (window.clarity) window.clarity('set', 'shared_sim', 'portfolio');
        if (window.clarity && window.SZ_CLARITY_ID && window.SZ_CLARITY_ID !== 'XXXXXXXXXX') {
            try { window.clarity('event', 'share_click', { type: 'portfolio' }); } catch(e) {}
        }
    }).catch(function(err){
        console.warn('copy failed', err);
        _shareToast('Não foi possível copiar automaticamente. URL: ' + url, 5000);
    });
}

// Bootstrap: lê URL params e pré-configura a simulação após o DOM carregar
function _applyShareParams() {
    try {
        var qs  = new URLSearchParams(location.search);
        var sim = qs.get('sim');
        if (!sim) return;

        // ── Ativo individual ──
        // simConfigs cobre os ativos que shareSim sabe exportar. A lista fixa
        // de metais que estava aqui deixava CDI, NTN-B e USD/BRL sem nenhum
        // parametro aplicado, e obrigava a lembrar de edita-la a cada ativo
        // novo. Ler simConfigs direto resolve os dois casos, com guarda de
        // chave propria (temChave) contra a cadeia de prototipo.
        if (temChave(simConfigs, sim)) {
            var c = simConfigs[sim];

            var ini   = qs.get('ini');
            var ap    = qs.get('ap');
            var prazo = qs.get('prazo');
            var sc    = qs.get('sc');

            var elIni = document.getElementById(c.ini);
            var elAp  = document.getElementById(c.ap);
            var elPz  = document.getElementById(c.prazo);
            if (ini   !== null && elIni) elIni.value = ini;
            if (ap    !== null && elAp)  elAp.value  = ap;
            if (prazo !== null && elPz)  elPz.value  = prazo;

            if (sc && temChave(SC_CARD_CLASS, sc)) {
                simConfigs[sim].sel = sc;
                syncScenarioCards(sim);
            }

            var panelId = _SHARE_ASSET_TO_PANEL[sim];
            if (panelId) {
                var navBtns = document.querySelectorAll('.sim-nav-btn');
                for (var i = 0; i < navBtns.length; i++) {
                    var onc = navBtns[i].getAttribute('onclick') || '';
                    if (onc.indexOf(panelId) >= 0) {
                        if (typeof activateSim === 'function') activateSim(panelId, navBtns[i]);
                        break;
                    }
                }
            }

            recalcSim(sim);

            setTimeout(function(){
                var anchor = document.getElementById('simuladores');
                if (anchor) anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 450);

            window.ga && window.ga('simulation_loaded_from_share', { asset: sim, prazo: prazo, ini: ini, ap: ap, scenario: sc });
            if (window.clarity) window.clarity('set', 'loaded_from_share', sim);
            return;
        }

        // ── Portfólio completo ──
        if (sim === 'portfolio') {
            var total   = qs.get('total');
            var perfil  = qs.get('perfil');
            var cenario = qs.get('cenario');
            var pPrazo  = qs.get('prazo');

            if (total) {
                var slider = document.getElementById('portfolio-slider');
                if (slider) {
                    slider.value = total;
                    if (typeof atualizarAlocacao === 'function') atualizarAlocacao(total);
                }
            }
            if (perfil && ['conservador','moderado','arrojado'].indexOf(perfil) >= 0) {
                var pbtn = document.querySelector('.alloc-perfil-btn[data-perfil="' + perfil + '"]');
                if (pbtn && typeof setPerfilAlocacao === 'function') setPerfilAlocacao(perfil, pbtn);
            }
            if (cenario && ['pessimista','base','otimista'].indexOf(cenario) >= 0) {
                var cbtn = document.querySelector('.alloc-cenario-btn[data-cenario="' + cenario + '"]');
                if (cbtn && typeof setAllocCenario === 'function') setAllocCenario(cenario, cbtn);
            }
            if (pPrazo) {
                var pr = parseInt(pPrazo);
                var pbs = document.querySelectorAll('.bench-prazo-group .comp-toggle');
                for (var j = 0; j < pbs.length; j++) {
                    if (pbs[j].textContent.indexOf(pr + ' ano') >= 0) {
                        if (typeof setBenchPrazo === 'function') setBenchPrazo(pr, pbs[j]);
                        break;
                    }
                }
            }

            setTimeout(function(){
                var anchor = document.getElementById('alocacao');
                if (anchor) anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 450);

            window.ga && window.ga('simulation_loaded_from_share', { asset: 'portfolio', total: total, perfil: perfil, cenario: cenario, prazo: pPrazo });
            if (window.clarity) window.clarity('set', 'loaded_from_share', 'portfolio');
        }
    } catch(e) {
        console.warn('_applyShareParams:', e && e.message);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(_applyShareParams, 200); });
} else {
    setTimeout(_applyShareParams, 200);
}


// --- Fase B do CSP: eventos e estilos dinamicos externalizados. ---
// Os handlers inline viraram data-ev + delegation; as cores calculadas em
// runtime viraram data-color/data-bg aplicadas por CSSOM (propriedade a
// propriedade), que o CSP permite mesmo sem unsafe-inline.
function applyInline(root) {
  if (!root || root.nodeType !== 1) return;
  var hasColor = root.hasAttribute('data-color');
  var hasBg = root.hasAttribute('data-bg');
  if (hasColor) root.style.color = root.getAttribute('data-color');
  if (hasBg) root.style.background = root.getAttribute('data-bg');
  var els = root.querySelectorAll ? root.querySelectorAll('[data-color],[data-bg]') : [];
  for (var i = 0; i < els.length; i++) {
    var el = els[i];
    if (el.hasAttribute('data-color')) el.style.color = el.getAttribute('data-color');
    if (el.hasAttribute('data-bg')) el.style.background = el.getAttribute('data-bg');
  }
}
var EVENTS = {
  '0': { t: 'click', f: function(event) { switchTab(this,'tab-comm') } },
  '1': { t: 'click', f: function(event) { switchTab(this,'tab-crypto') } },
  '2': { t: 'click', f: function(event) { switchTab(this,'tab-forex') } },
  '3': { t: 'click', f: function(event) { switchTab(this,'tab-cmc-mkt') } },
  '4': { t: 'click', f: function(event) { switchTab(this,'tab-cmc-ta') } },
  '5': { t: 'click', f: function(event) { switchTab(this,'tab-cmc-screen') } },
  '6': { t: 'click', f: function(event) { activateSim('sim-ouro', this) } },
  '7': { t: 'click', f: function(event) { activateSim('sim-prata', this) } },
  '8': { t: 'click', f: function(event) { activateSim('sim-platina', this) } },
  '9': { t: 'click', f: function(event) { activateSim('sim-cobre', this) } },
  '10': { t: 'click', f: function(event) { activateSim('sim-btc', this) } },
  '11': { t: 'click', f: function(event) { activateSim('sim-cdi', this) } },
  '12': { t: 'click', f: function(event) { activateSim('sim-ntnb', this) } },
  '13': { t: 'click', f: function(event) { activateSim('sim-usdbrl', this) } },
  '14': { t: 'click', f: function(event) { activateSim('sim-comparador', this) } },
  '15': { t: 'input', f: function(event) { recalcSim('gold') } },
  '16': { t: 'click', f: function(event) { selectScenario('gold','pess',this) } },
  '17': { t: 'click', f: function(event) { selectScenario('gold','base',this) } },
  '18': { t: 'click', f: function(event) { selectScenario('gold','otim',this) } },
  '19': { t: 'click', f: function(event) { toggleMC('gold',this) } },
  '20': { t: 'click', f: function(event) { setMCCurrency('gold','usd',this) } },
  '21': { t: 'click', f: function(event) { setMCCurrency('gold','brl',this) } },
  '22': { t: 'click', f: function(event) { shareSim('gold', this) } },
  '23': { t: 'input', f: function(event) { recalcSim('silver') } },
  '24': { t: 'click', f: function(event) { selectScenario('silver','pess',this) } },
  '25': { t: 'click', f: function(event) { selectScenario('silver','base',this) } },
  '26': { t: 'click', f: function(event) { selectScenario('silver','otim',this) } },
  '27': { t: 'click', f: function(event) { toggleMC('silver',this) } },
  '28': { t: 'click', f: function(event) { setMCCurrency('silver','usd',this) } },
  '29': { t: 'click', f: function(event) { setMCCurrency('silver','brl',this) } },
  '30': { t: 'click', f: function(event) { shareSim('silver', this) } },
  '31': { t: 'input', f: function(event) { recalcSim('platinum') } },
  '32': { t: 'click', f: function(event) { selectScenario('platinum','pess',this) } },
  '33': { t: 'click', f: function(event) { selectScenario('platinum','base',this) } },
  '34': { t: 'click', f: function(event) { selectScenario('platinum','otim',this) } },
  '35': { t: 'click', f: function(event) { toggleMC('platinum',this) } },
  '36': { t: 'click', f: function(event) { setMCCurrency('platinum','usd',this) } },
  '37': { t: 'click', f: function(event) { setMCCurrency('platinum','brl',this) } },
  '38': { t: 'click', f: function(event) { shareSim('platinum', this) } },
  '39': { t: 'input', f: function(event) { recalcSim('copper') } },
  '40': { t: 'click', f: function(event) { selectScenario('copper','pess',this) } },
  '41': { t: 'click', f: function(event) { selectScenario('copper','base',this) } },
  '42': { t: 'click', f: function(event) { selectScenario('copper','otim',this) } },
  '43': { t: 'click', f: function(event) { toggleMC('copper',this) } },
  '44': { t: 'click', f: function(event) { setMCCurrency('copper','usd',this) } },
  '45': { t: 'click', f: function(event) { setMCCurrency('copper','brl',this) } },
  '46': { t: 'click', f: function(event) { shareSim('copper', this) } },
  '47': { t: 'input', f: function(event) { recalcSim('btc') } },
  '48': { t: 'click', f: function(event) { selectScenario('btc','pess',this) } },
  '49': { t: 'click', f: function(event) { selectScenario('btc','base',this) } },
  '50': { t: 'click', f: function(event) { selectScenario('btc','otim',this) } },
  '51': { t: 'click', f: function(event) { toggleMC('btc',this) } },
  '52': { t: 'click', f: function(event) { setMCCurrency('btc','usd',this) } },
  '53': { t: 'click', f: function(event) { setMCCurrency('btc','brl',this) } },
  '54': { t: 'click', f: function(event) { shareSim('btc', this) } },
  '55': { t: 'input', f: function(event) { recalcSim('cdi') } },
  '56': { t: 'click', f: function(event) { selectScenario('cdi','pess',this) } },
  '57': { t: 'click', f: function(event) { selectScenario('cdi','base',this) } },
  '58': { t: 'click', f: function(event) { selectScenario('cdi','otim',this) } },
  '59': { t: 'click', f: function(event) { toggleMC('cdi',this) } },
  '60': { t: 'click', f: function(event) { setMCCurrency('cdi','brl',this) } },
  '61': { t: 'click', f: function(event) { shareSim('cdi', this) } },
  '62': { t: 'input', f: function(event) { recalcSim('ntnb') } },
  '63': { t: 'click', f: function(event) { selectScenario('ntnb','pess',this) } },
  '64': { t: 'click', f: function(event) { selectScenario('ntnb','base',this) } },
  '65': { t: 'click', f: function(event) { selectScenario('ntnb','otim',this) } },
  '66': { t: 'click', f: function(event) { toggleMC('ntnb',this) } },
  '67': { t: 'click', f: function(event) { setMCCurrency('ntnb','brl',this) } },
  '68': { t: 'click', f: function(event) { shareSim('ntnb', this) } },
  '69': { t: 'input', f: function(event) { recalcSim('usdbrl') } },
  '70': { t: 'click', f: function(event) { selectScenario('usdbrl','pess',this) } },
  '71': { t: 'click', f: function(event) { selectScenario('usdbrl','base',this) } },
  '72': { t: 'click', f: function(event) { selectScenario('usdbrl','otim',this) } },
  '73': { t: 'click', f: function(event) { toggleMC('usdbrl',this) } },
  '74': { t: 'click', f: function(event) { setMCCurrency('usdbrl','usd',this) } },
  '75': { t: 'click', f: function(event) { setMCCurrency('usdbrl','brl',this) } },
  '76': { t: 'click', f: function(event) { shareSim('usdbrl', this) } },
  '77': { t: 'input', f: function(event) { recalcComparador() } },
  '78': { t: 'input', f: function(event) { document.getElementById('c-g-tx-d').textContent=this.value.replace('.',',')+' %'; recalcComparador() } },
  '79': { t: 'input', f: function(event) { document.getElementById('c-s-tx-d').textContent=this.value.replace('.',',')+' %'; recalcComparador() } },
  '80': { t: 'input', f: function(event) { document.getElementById('c-p-tx-d').textContent=this.value.replace('.',',')+' %'; recalcComparador() } },
  '81': { t: 'input', f: function(event) { document.getElementById('c-cu-tx-d').textContent=this.value.replace('.',',')+' %'; recalcComparador() } },
  '82': { t: 'input', f: function(event) { document.getElementById('c-b-tx-d').textContent=this.value.replace('.',',')+' %'; recalcComparador() } },
  '83': { t: 'input', f: function(event) { document.getElementById('c-prazo-d').textContent=this.value+' anos'; recalcComparador() } },
  '84': { t: 'click', f: function(event) { setModoComparador('absoluto', this) } },
  '85': { t: 'click', f: function(event) { setModoComparador('indice', this) } },
  '86': { t: 'click', f: function(event) { setModoComparador('percentual', this) } },
  '87': { t: 'click', f: function(event) { setEscalaComparador('linear', this) } },
  '88': { t: 'click', f: function(event) { setEscalaComparador('logarithmic', this) } },
  '89': { t: 'input', f: function(event) { atualizarAlocacao(this.value) } },
  '90': { t: 'click', f: function(event) { setPerfilAlocacao('conservador',this) } },
  '91': { t: 'click', f: function(event) { setPerfilAlocacao('moderado',this) } },
  '92': { t: 'click', f: function(event) { setPerfilAlocacao('arrojado',this) } },
  '93': { t: 'click', f: function(event) { setAllocCenario('pessimista',this) } },
  '94': { t: 'click', f: function(event) { setAllocCenario('base',this) } },
  '95': { t: 'click', f: function(event) { setAllocCenario('otimista',this) } },
  '96': { t: 'click', f: function(event) { setBenchPrazo(3,this) } },
  '97': { t: 'click', f: function(event) { setBenchPrazo(5,this) } },
  '98': { t: 'click', f: function(event) { setBenchPrazo(10,this) } },
  '99': { t: 'click', f: function(event) { setBenchCenario('pessimista',this) } },
  '100': { t: 'click', f: function(event) { setBenchCenario('base',this) } },
  '101': { t: 'click', f: function(event) { setBenchCenario('otimista',this) } },
  '102': { t: 'click', f: function(event) { togglePortfolioMC(this) } },
  '103': { t: 'click', f: function(event) { sharePortfolio(this) } },
  '104': { t: 'click', f: function(event) { toggleGeoPortfolioMC(this) } },
  '105': { t: 'click', f: function(event) { exportPDF(this) } },
  '106': { t: 'click', f: function(event) { closeExitPopup() } },
  '107': { t: 'keydown', f: function(event) { if(event.key==='Enter') submitExitPopup() } },
  '108': { t: 'click', f: function(event) { submitExitPopup() } }
};
var EVTYPES = ['click', 'input', 'keydown'];
for (var ti = 0; ti < EVTYPES.length; ti++) {
  (function (type) {
    document.addEventListener(type, function (event) {
      var t = event.target;
      var el = t && t.closest ? t.closest('[data-ev]') : null;
      if (!el) return;
      var k = el.getAttribute('data-ev');
      if (k && k.indexOf('geo:') === 0) {
        if (type === 'click') selectGeoScenario(k.slice(4), el);
        return;
      }
      if (k && k.charAt(0) === 'e') k = k.slice(1);
      var rec = EVENTS[k];
      if (rec && rec.t === type) rec.f.call(el, event);
    });
  })(EVTYPES[ti]);
}
applyInline(document);
if (document.body) {
  var mo = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var nodes = muts[i].addedNodes;
      for (var j = 0; j < nodes.length; j++) {
        if (nodes[j].nodeType === 1) applyInline(nodes[j]);
      }
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
}
