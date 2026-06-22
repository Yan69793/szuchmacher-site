/**
 * sz-site.js — interações compartilhadas (home + relatórios)
 * Scroll header · reveal progressivo · menu mobile
 */
(function () {
  'use strict';

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.add('js-ready');

  /* ── Header scroll ───────────────────────────────────────── */
  var header = document.querySelector('header');
  if (header) {
    var onScroll = function () {
      header.classList.toggle('is-scrolled', window.scrollY > 12);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ── Mobile menu ─────────────────────────────────────────── */
  var btn = document.getElementById('menuBtn');
  var nav = document.getElementById('siteNav');
  if (btn && nav) {
    function closeMenu() {
      nav.classList.remove('nav-open');
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', 'Abrir menu');
    }
    function openMenu() {
      nav.classList.add('nav-open');
      btn.setAttribute('aria-expanded', 'true');
      btn.setAttribute('aria-label', 'Fechar menu');
    }
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      nav.classList.contains('nav-open') ? closeMenu() : openMenu();
    });
    nav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', closeMenu);
    });
    document.addEventListener('click', function (e) {
      if (nav.classList.contains('nav-open') && !nav.contains(e.target) && e.target !== btn) {
        closeMenu();
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMenu();
    });
  }

  /* ── Scroll reveal ───────────────────────────────────────── */
  var reveals = document.querySelectorAll('.reveal');
  if (reveals.length && !reducedMotion && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        });
      },
      { root: null, rootMargin: '0px 0px -8% 0px', threshold: 0.12 }
    );
    reveals.forEach(function (el, i) {
      if (i < 4) {
        el.classList.add('is-visible');
        return;
      }
      io.observe(el);
    });
  } else {
    reveals.forEach(function (el) {
      el.classList.add('is-visible');
    });
  }

  /* ── Active nav anchor ───────────────────────────────────── */
  if (nav && location.pathname === '/' || location.pathname.endsWith('/index.html')) {
    var sections = document.querySelectorAll('main section[id]');
    var links = nav.querySelectorAll('a[href^="#"]');
    if (sections.length && links.length && 'IntersectionObserver' in window) {
      var map = {};
      links.forEach(function (a) {
        var id = a.getAttribute('href').slice(1);
        if (id) map[id] = a;
      });
      var navIo = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              var id = entry.target.id;
              links.forEach(function (a) {
                a.removeAttribute('aria-current');
              });
              if (map[id]) map[id].setAttribute('aria-current', 'page');
            }
          });
        },
        { rootMargin: '-40% 0px -50% 0px', threshold: 0 }
      );
      sections.forEach(function (s) {
        navIo.observe(s);
      });
    }
  }
})();