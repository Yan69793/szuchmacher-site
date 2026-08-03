/* =============================================================
 * portfolio-persistence.js — localStorage + URL share
 *
 * Depende de PortfolioStore.js estar carregado antes.
 * ============================================================= */

var PortfolioPersistence = (function () {
  'use strict';

  var STORAGE_KEY = 'multiasset-portfolio-v1';
  var DEBOUNCE_MS = 500;
  var _debounceTimer = null;

  /* ── localStorage ── */

  function save() {
    var state = PortfolioStore.exportState();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('PortfolioPersistence: localStorage cheio ou indisponível.', e);
    }
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var state = JSON.parse(raw);
      return PortfolioStore.importState(state);
    } catch (e) {
      console.warn('PortfolioPersistence: falha ao carregar de localStorage.', e);
      return false;
    }
  }

  /* Escuta mudanças no store e persiste com debounce. */
  function autoPersist() {
    PortfolioStore.onChange(function () {
      if (_debounceTimer) clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(save, DEBOUNCE_MS);
    });
  }

  function clear() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  }

  /* ── URL share ── */

  function encodeState() {
    var state = PortfolioStore.exportState();
    // Remove updatedAt para encurtar a URL — não é relevante no share
    delete state.updatedAt;
    var json = JSON.stringify(state);
    // Base64url sem padding
    return btoa(unescape(encodeURIComponent(json)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  function decodeState(encoded) {
    try {
      // Restaura Base64url → Base64 padrão
      var base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
      // Recoloca padding
      while (base64.length % 4) base64 += '=';
      var json = decodeURIComponent(escape(atob(base64)));
      var state = JSON.parse(json);
      return state;
    } catch (e) {
      console.warn('PortfolioPersistence: URL share inválida.', e);
      return null;
    }
  }

  function getShareUrl() {
    var encoded = encodeState();
    var base = window.location.origin + window.location.pathname;
    return base + '?c=' + encoded;
  }

  function applyFromUrl() {
    var params = new URLSearchParams(window.location.search);
    var encoded = params.get('c');
    if (!encoded) return false;

    var state = decodeState(encoded);
    if (!state) return false;

    var ok = PortfolioStore.importState(state);
    if (ok) {
      // Limpa o ?c= da URL sem recarregar
      var url = new URL(window.location);
      url.searchParams.delete('c');
      window.history.replaceState({}, '', url.toString());
      save(); // Persiste o estado importado
    }
    return ok;
  }

  return {
    save: save,
    load: load,
    clear: clear,
    autoPersist: autoPersist,
    getShareUrl: getShareUrl,
    applyFromUrl: applyFromUrl,
  };
})();
