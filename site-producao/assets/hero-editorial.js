(function () {
  'use strict';

  function prefersReducedMotion() {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
      return false;
    }
  }

  function initWordwall(root) {
    if (!root || prefersReducedMotion()) return;

    var track = root.querySelector('.hero-wordwall__track');
    if (!track) return;

    var active = false;
    var tags = root.querySelectorAll('.hero-wordwall__row span');

    function setPos(px, py) {
      root.style.setProperty('--wx', String(px));
      root.style.setProperty('--wy', String(py));
      var rect = root.getBoundingClientRect();
      tags.forEach(function (tag) {
        var r = tag.getBoundingClientRect();
        var cx = r.left + r.width / 2;
        var cy = r.top + r.height / 2;
        var dx = (px / 100) * window.innerWidth - cx;
        var dy = (py / 100) * window.innerHeight - cy;
        var near = Math.hypot(dx, dy) < 120;
        tag.classList.toggle('is-near', near);
      });
    }

    function pointer(x, y) {
      var rect = root.getBoundingClientRect();
      var px = ((x - rect.left) / rect.width) * 100;
      var py = ((y - rect.top) / rect.height) * 100;
      setPos(Math.max(0, Math.min(100, px)), Math.max(0, Math.min(100, py)));
    }

    root.addEventListener('pointerdown', function (e) {
      active = true;
      root.classList.add('is-dragging');
      root.setPointerCapture(e.pointerId);
      pointer(e.clientX, e.clientY);
    });

    root.addEventListener('pointermove', function (e) {
      if (!active) return;
      pointer(e.clientX, e.clientY);
    });

    function end(e) {
      if (!active) return;
      active = false;
      root.classList.remove('is-dragging');
      try { root.releasePointerCapture(e.pointerId); } catch (_) {}
    }

    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
    root.addEventListener('pointerleave', function () {
      if (!active) setPos(50, 50);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var wall = document.getElementById('heroWordwall');
    if (wall) initWordwall(wall);
  });
})();