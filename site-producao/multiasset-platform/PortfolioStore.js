/* =============================================================
 * PortfolioStore.js — fonte única de verdade para alocação
 *
 * Responsabilidades:
 *   1. Servir os pesos ativos (preset ou custom) via getActiveWeights()
 *   2. Validar soma = 100% em modo custom
 *   3. Notificar assinantes quando os pesos mudam
 *   4. Isolar PERFIS como seed data, sem expor o objeto cru
 *
 * O pipeline visual (atualizarAlocacao, desenharDonut, desenharBenchmark,
 * Monte Carlo) consome Array<{key, pct, color, label}> — esta é a
 * interface estável. O store garante que preset e custom devolvem
 * exatamente o mesmo formato.
 * ============================================================= */

/* ── Catálogo de metadados dos ativos ──
   Fonte única de nome, cor e label. Separado dos pesos para que
   customWeights não precise repetir esses campos — mas o getActiveWeights()
   sempre devolve o objeto completo, com color e label resolvidos.       */
const ASSET_CATALOG = {
  ntnb:     { color: '#4caf7d',             label: 'NTN-B'   },
  cdi:      { color: '#5b9cf6',             label: 'CDI'     },
  gold:     { color: '#c9a84c',             label: 'Ouro'    },
  silver:   { color: '#c0c0c0',             label: 'Prata'   },
  platinum: { color: '#8ecfdd',             label: 'Platina' },
  copper:   { color: '#b87333',             label: 'Cobre'   },
  btc:      { color: '#f07a40',             label: 'Bitcoin' },
  reserva:  { color: 'rgba(201,168,76,0.55)', label: 'Reserva' },
};

/* ── PERFIS seed ──
   Mesmos dados do multiasset-app.html, extraídos para referência local.
   Somas conferidas: 100,00 em todas as 9 tabelas.                     */
const PERFIS = {
  conservador: {
    desc: 'Perfil de máxima proteção: prioriza renda fixa real e liquidez, com exposição mínima a ativos de risco. Concentração maior em NTN-B e CDI, participação marginal em metais, cobre e cripto.',
    items: {
      pessimista: [
        { key: 'ntnb', pct: 44.5 }, { key: 'cdi', pct: 28.5 },
        { key: 'gold', pct: 10 },   { key: 'silver', pct: 2 },
        { key: 'platinum', pct: 2 },{ key: 'copper', pct: 0 },
        { key: 'btc', pct: 1 },     { key: 'reserva', pct: 12 },
      ],
      base: [
        { key: 'ntnb', pct: 42.5 }, { key: 'cdi', pct: 27.5 },
        { key: 'gold', pct: 10 },   { key: 'silver', pct: 2 },
        { key: 'platinum', pct: 2 },{ key: 'copper', pct: 1 },
        { key: 'btc', pct: 3 },     { key: 'reserva', pct: 12 },
      ],
      otimista: [
        { key: 'ntnb', pct: 42.5 }, { key: 'cdi', pct: 24.5 },
        { key: 'gold', pct: 10 },   { key: 'silver', pct: 2 },
        { key: 'platinum', pct: 2 },{ key: 'copper', pct: 2 },
        { key: 'btc', pct: 5 },     { key: 'reserva', pct: 12 },
      ],
    }
  },
  moderado: {
    desc: 'Perfil balanceado: divide o portfólio entre proteção real (NTN-B, CDI) e ativos de crescimento (metais, cobre, Bitcoin), sem concentração extrema em nenhuma ponta.',
    items: {
      pessimista: [
        { key: 'ntnb', pct: 29.5 }, { key: 'cdi', pct: 23 },
        { key: 'gold', pct: 15 },   { key: 'silver', pct: 5 },
        { key: 'platinum', pct: 5 },{ key: 'copper', pct: 0.5 },
        { key: 'btc', pct: 7 },     { key: 'reserva', pct: 15 },
      ],
      base: [
        { key: 'ntnb', pct: 27 },   { key: 'cdi', pct: 21 },
        { key: 'gold', pct: 15 },   { key: 'silver', pct: 5 },
        { key: 'platinum', pct: 5 },{ key: 'copper', pct: 2 },
        { key: 'btc', pct: 10 },    { key: 'reserva', pct: 15 },
      ],
      otimista: [
        { key: 'ntnb', pct: 27 },   { key: 'cdi', pct: 15 },
        { key: 'gold', pct: 15 },   { key: 'silver', pct: 5 },
        { key: 'platinum', pct: 5 },{ key: 'copper', pct: 4 },
        { key: 'btc', pct: 14 },    { key: 'reserva', pct: 15 },
      ],
    }
  },
  arrojado: {
    desc: 'Perfil de maior tolerância a risco: prioriza metais, cobre e Bitcoin em busca de crescimento, com renda fixa reduzida ao mínimo necessário de estabilidade.',
    items: {
      pessimista: [
        { key: 'ntnb', pct: 14.5 }, { key: 'cdi', pct: 9.5 },
        { key: 'gold', pct: 22 },   { key: 'silver', pct: 7 },
        { key: 'platinum', pct: 10 },{ key: 'copper', pct: 1 },
        { key: 'btc', pct: 21 },    { key: 'reserva', pct: 15 },
      ],
      base: [
        { key: 'ntnb', pct: 11 },   { key: 'cdi', pct: 7 },
        { key: 'gold', pct: 22 },   { key: 'silver', pct: 7 },
        { key: 'platinum', pct: 10 },{ key: 'copper', pct: 3 },
        { key: 'btc', pct: 25 },    { key: 'reserva', pct: 15 },
      ],
      otimista: [
        { key: 'ntnb', pct: 11 },   { key: 'cdi', pct: 1 },
        { key: 'gold', pct: 22 },   { key: 'silver', pct: 7 },
        { key: 'platinum', pct: 10 },{ key: 'copper', pct: 5 },
        { key: 'btc', pct: 29 },    { key: 'reserva', pct: 15 },
      ],
    }
  },
};

/* ── Store ────────────────────────────────────────────────────── */

const PortfolioStore = (function () {
  'use strict';

  var _mode = 'preset';
  var _presetProfile = 'moderado';
  var _presetScenario = 'base';
  var _customWeights = null;  // null ou Array<{key, pct}>
  var _listeners = [];

  /* ── Helpers ── */

  function _validateSum(items) {
    var sum = items.reduce(function (s, i) { return s + i.pct; }, 0);
    if (Math.abs(sum - 100) > 0.01) {
      throw new Error('Soma dos percentuais deve ser 100%. Atual: ' + sum.toFixed(1) + '%');
    }
  }

  function _resolveMeta(item) {
    var meta = ASSET_CATALOG[item.key];
    if (!meta) {
      console.warn('PortfolioStore: chave desconhecida "' + item.key + '" — usando fallback.');
      return { key: item.key, pct: item.pct, color: '#888', label: item.key };
    }
    return { key: item.key, pct: item.pct, color: meta.color, label: meta.label };
  }

  function _notify() {
    var weights = getActiveWeights();
    _listeners.forEach(function (fn) {
      try { fn(weights); } catch (e) { console.error('PortfolioStore listener error:', e); }
    });
  }

  /* ── API pública ── */

  function getActiveWeights() {
    var items;
    if (_mode === 'custom' && _customWeights && _customWeights.length) {
      items = _customWeights;
    } else {
      var profileItems = PERFIS[_presetProfile] && PERFIS[_presetProfile].items;
      items = (profileItems && profileItems[_presetScenario]) || [];
    }
    return items.map(_resolveMeta);
  }

  function getMode() {
    return _mode;
  }

  function getPresetProfile() {
    return _presetProfile;
  }

  function getPresetScenario() {
    return _presetScenario;
  }

  function getCustomWeightsRaw() {
    // Devolve sem metadados, útil para persistência
    return _customWeights ? _customWeights.map(function (i) { return { key: i.key, pct: i.pct }; }) : null;
  }

  function setCustomWeights(items) {
    // Aceita Array<{key, pct}> ou Array<{key, pct, color, label}>
    var stripped = items.map(function (i) { return { key: i.key, pct: i.pct }; });
    _validateSum(stripped);
    _customWeights = stripped;
    _mode = 'custom';
    _notify();
  }

  function resetToPreset(profile, scenario) {
    if (profile && PERFIS[profile]) {
      _presetProfile = profile;
    }
    if (scenario) {
      _presetScenario = scenario;
    }
    _mode = 'preset';
    _customWeights = null;
    _notify();
  }

  function setPresetScenario(scenario) {
    if (!scenario) return;
    _presetScenario = scenario;
    if (_mode === 'preset') _notify();
  }

  function setPresetProfile(profile) {
    if (!profile || !PERFIS[profile]) return;
    _presetProfile = profile;
    if (_mode === 'preset') _notify();
  }

  function onChange(fn) {
    _listeners.push(fn);
    return function unsubscribe() {
      _listeners = _listeners.filter(function (f) { return f !== fn; });
    };
  }

  /* ── Exportação do estado para persistência ── */

  function exportState() {
    return {
      version: 1,
      mode: _mode,
      presetProfile: _presetProfile,
      presetScenario: _presetScenario,
      customWeights: _customWeights,
      updatedAt: new Date().toISOString(),
    };
  }

  function importState(state) {
    if (!state || state.version !== 1) return false;
    try {
      if (state.mode === 'custom' && state.customWeights && state.customWeights.length) {
        _validateSum(state.customWeights);
        _customWeights = state.customWeights;
        _mode = 'custom';
      } else {
        _mode = 'preset';
        _customWeights = null;
      }
      if (state.presetProfile && PERFIS[state.presetProfile]) {
        _presetProfile = state.presetProfile;
      }
      if (state.presetScenario) {
        _presetScenario = state.presetScenario;
      }
      _notify();
      return true;
    } catch (e) {
      console.warn('PortfolioStore: falha ao importar estado, ignorando.', e);
      return false;
    }
  }

  /* ── Catálogos expostos (read-only, para UI) ── */

  function getAssetCatalog() {
    return ASSET_CATALOG;
  }

  function getPerfilDescriptions() {
    var out = {};
    Object.keys(PERFIS).forEach(function (k) {
      out[k] = PERFIS[k].desc;
    });
    return out;
  }

  function getAvailableKeys() {
    return Object.keys(ASSET_CATALOG);
  }

  return {
    getActiveWeights: getActiveWeights,
    getMode: getMode,
    getPresetProfile: getPresetProfile,
    getPresetScenario: getPresetScenario,
    getCustomWeightsRaw: getCustomWeightsRaw,
    setCustomWeights: setCustomWeights,
    resetToPreset: resetToPreset,
    setPresetScenario: setPresetScenario,
    setPresetProfile: setPresetProfile,
    onChange: onChange,
    exportState: exportState,
    importState: importState,
    getAssetCatalog: getAssetCatalog,
    getPerfilDescriptions: getPerfilDescriptions,
    getAvailableKeys: getAvailableKeys,
  };
})();

/* Se ambiente suporta módulos, exporta. Senão, fica como global. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PortfolioStore: PortfolioStore, PERFIS: PERFIS, ASSET_CATALOG: ASSET_CATALOG };
}
