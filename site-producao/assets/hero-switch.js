(function () {
  'use strict';

  function resolveVariant() {
    try {
      var params = new URLSearchParams(window.location.search);
      var q = params.get('hero');
      if (q === 'classic' || q === 'editorial') return q;
    } catch (e) {}

    if (window.SZ_HERO_VARIANT === 'classic') return 'classic';
    return 'editorial';
  }

  function apply() {
    var variant = resolveVariant();
    var classic = document.getElementById('hero-classic');
    var editorial = document.getElementById('hero-editorial');
    if (!classic || !editorial) return;

    var showEditorial = variant === 'editorial';
    if (showEditorial) {
      editorial.removeAttribute('hidden');
      classic.setAttribute('hidden', '');
    } else {
      classic.removeAttribute('hidden');
      editorial.setAttribute('hidden', '');
    }
    document.body.setAttribute('data-hero-variant', variant);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
})();