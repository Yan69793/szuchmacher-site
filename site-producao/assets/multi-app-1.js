
(function () {
  if (!window.matchMedia('(min-width: 769px)').matches) return; // mobile: fica no <picture>
  var v = document.querySelector('[data-hero-video]');
  if (!v) return;
  var s = v.querySelector('source[data-src]');
  if (s && !s.getAttribute('src')) s.src = s.getAttribute('data-src');
  v.muted = true; // exigencia das politicas de autoplay
  v.addEventListener('playing', function () { v.classList.add('is-playing'); }, { once: true });
  v.load();
  function tryPlay() {
    try {
      var p = v.play();
      if (p && p.then) return p.then(function () { return true; }, function () { return false; });
    } catch (e) {}
    return Promise.resolve(!v.paused);
  }
  tryPlay().then(function (ok) {
    if (ok) return;
    var evs = ['pointerdown', 'touchstart', 'keydown', 'scroll'];
    function kick() {
      tryPlay().then(function (ok2) {
        if (ok2) evs.forEach(function (e) { window.removeEventListener(e, kick); });
      });
    }
    evs.forEach(function (e) { window.addEventListener(e, kick, { passive: true }); });
  });
})();
