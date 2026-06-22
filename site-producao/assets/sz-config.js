/* =============================================================
 * sz-config.js — Configuração central Szuchmacher Consultoria
 *
 * ÚNICO local onde IDs externos vivem. Editar este arquivo
 * propaga para TODAS as páginas que o referenciam.
 * ============================================================= */

window.SZ_CLARITY_ID = 'x89me5cgm8';
window.SZ_FORMSPREE_ID    = 'mojrayrl';
window.SZ_STRIPE_CARTA_URL = 'https://buy.stripe.com/test_14A3cx5BAfiG5dc5wVb3q01';
window.SZ_STRIPE_PRO_URL = 'https://buy.stripe.com/test_aFadRb2po8Uiaxwf7vb3q02';
window.SZ_KIWIFY_EBOOK_URL = '_PENDING'; /* substituir pela URL Kiwify após criar produto */

/* Fase 1 stack — editar após criar contas (ver docs/CALCOM-SETUP.md) */
window.SZ_WHATSAPP = '5521981088992';
window.SZ_CALCOM_URL = 'https://cal.com/_PENDING/szuchmacher-diagnostico';
window.SZ_PLAUSIBLE_DOMAIN = ''; /* ex.: 'multi-assets.com' quando Plausible cloud estiver ativo */

(function () {
  function ready(v) {
    return v && typeof v === 'string' && v.indexOf('_PENDING') === -1;
  }

  window.SZ = window.SZ || {};
  window.SZ.clarityReady    = ready(window.SZ_CLARITY_ID);
  window.SZ.formspreeReady  = ready(window.SZ_FORMSPREE_ID);
  window.SZ.stripeCartaReady = ready(window.SZ_STRIPE_CARTA_URL);
  window.SZ.stripeProReady   = ready(window.SZ_STRIPE_PRO_URL);
  window.SZ.calComReady     = ready(window.SZ_CALCOM_URL);
  window.SZ.plausibleReady  = !!(window.SZ_PLAUSIBLE_DOMAIN && ready(window.SZ_PLAUSIBLE_DOMAIN));
  window.SZ.formspreeUrl = function () {
    return window.SZ.formspreeReady ? ('https://formspree.io/f/' + window.SZ_FORMSPREE_ID) : null;
  };

  window.SZ.calComUrl = function (extra) {
    if (!window.SZ.calComReady) return null;
    return window.SZ.appendUTM(window.SZ_CALCOM_URL, Object.assign({
      utm_source: 'multi-assets',
      utm_medium: 'cta',
      utm_campaign: 'consultoria'
    }, extra || {}));
  };

  window.SZ.whatsAppUrl = function (text) {
    var msg = text || 'Olá, gostaria de agendar um diagnóstico patrimonial com a Szuchmacher Consultoria.';
    try {
      var u = new URL('https://wa.me/' + window.SZ_WHATSAPP);
      u.searchParams.set('text', msg);
      return u.toString();
    } catch (e) {
      return 'https://wa.me/' + window.SZ_WHATSAPP;
    }
  };

  window.SZ.trackGoal = function (name, props) {
    window.ga(name, props || {});
    try {
      if (window.plausible && window.SZ.plausibleReady) {
        window.plausible(name, { props: props || {} });
      }
    } catch (e) {}
  };

  window.SZ.wireConversionLinks = function () {
    document.querySelectorAll('[data-sz-cal]').forEach(function (el) {
      var url = window.SZ.calComUrl({
        utm_content: el.getAttribute('data-sz-cal') || 'generic'
      });
      if (url) {
        el.href = url;
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener');
      } else {
        el.href = window.SZ.whatsAppUrl('Olá, quero agendar diagnóstico patrimonial (Cal.com em configuração).');
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener');
        el.setAttribute('data-cal-pending', '1');
      }
    });
    document.querySelectorAll('[data-sz-wa]').forEach(function (el) {
      var custom = el.getAttribute('data-sz-wa-msg');
      el.href = window.SZ.whatsAppUrl(custom || undefined);
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener');
    });
  };

  /* ── Plausible Analytics (privacy-first, opcional) ─────── */
  if (window.SZ.plausibleReady) {
    var ps = document.createElement('script');
    ps.defer = true;
    ps.dataset.domain = window.SZ_PLAUSIBLE_DOMAIN;
    ps.src = 'https://plausible.io/js/script.js';
    document.head.appendChild(ps);
  }

  /* ── Microsoft Clarity init ─────────────────────────────── */
  if (window.SZ.clarityReady) {
    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
      y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, 'clarity', 'script', window.SZ_CLARITY_ID);
  }

  /* ── UTM capture (first-touch + last-touch) ───────────────── */
  var UTM_STORAGE_KEY = 'sz_attribution';
  var UTM_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'li_fat_id'];

  window.SZ.captureUTMs = function () {
    try {
      var params = new URLSearchParams(window.location.search);
      var captured = {};
      var has = false;
      UTM_FIELDS.forEach(function (k) {
        var v = params.get(k);
        if (v) { captured[k] = v; has = true; }
      });
      if (has) {
        var payload = {
          ts: Date.now(),
          landing: window.location.pathname,
          referrer: document.referrer || '',
          utms: captured
        };
        if (!localStorage.getItem(UTM_STORAGE_KEY)) {
          localStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(payload));
        }
        sessionStorage.setItem(UTM_STORAGE_KEY + '_last', JSON.stringify(payload));
      }
    } catch (e) {}
  };

  window.SZ.getAttribution = function () {
    try {
      var first = localStorage.getItem(UTM_STORAGE_KEY);
      var last = sessionStorage.getItem(UTM_STORAGE_KEY + '_last');
      return {
        first_touch: first ? JSON.parse(first) : null,
        last_touch: last ? JSON.parse(last) : null
      };
    } catch (e) { return { first_touch: null, last_touch: null }; }
  };

  window.SZ.captureUTMs();

  window.SZ.appendUTM = function (url, params) {
    params = params || {};
    try {
      var u = new URL(url, window.location.origin);
      var defaults = { utm_source: 'share', utm_medium: 'referral', utm_campaign: 'multiasset_sim' };
      Object.keys(defaults).forEach(function (k) {
        if (!u.searchParams.has(k) && defaults[k]) u.searchParams.set(k, defaults[k]);
      });
      Object.keys(params).forEach(function (k) {
        if (params[k] != null && params[k] !== '') u.searchParams.set(k, String(params[k]));
      });
      return u.toString();
    } catch (e) { return url; }
  };

  /* data-ga / scroll / cliques → Clarity (sem GA4) */
  window.ga = function (name, params) {
    try { if (window.clarity && window.SZ.clarityReady) window.clarity('event', name); } catch (e) {}
    var p = params || {};
    try {
      if (window.clarity && window.SZ.clarityReady) {
        Object.keys(p).forEach(function (k) {
          window.clarity('set', k, String(p[k]));
        });
      }
    } catch (e) {}
  };

  window.SZ.copyToClipboard = function (text) {
    return new Promise(function (resolve, reject) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(resolve).catch(reject);
      } else {
        try {
          var ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          resolve();
        } catch (e) { reject(e); }
      }
    });
  };

  window.SZ.toast = function (msg, ms) {
    ms = ms || 2600;
    var t = document.getElementById('sz-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'sz-toast';
      t.style.cssText = [
        'position:fixed', 'bottom:28px', 'left:50%', 'transform:translateX(-50%) translateY(20px)',
        'background:#0b1630', 'color:#fff', 'padding:12px 22px', 'border-radius:100px',
        'font:500 13px/1.3 system-ui,-apple-system,sans-serif', 'letter-spacing:0.02em',
        'box-shadow:0 12px 40px rgba(0,0,0,0.35),0 2px 8px rgba(0,0,0,0.2)',
        'border:1px solid rgba(201,168,76,0.35)',
        'z-index:9999', 'opacity:0', 'transition:opacity .25s ease,transform .25s ease',
        'pointer-events:none', 'max-width:86vw', 'text-align:center'
      ].join(';');
      document.body.appendChild(t);
    }
    t.textContent = msg;
    requestAnimationFrame(function () {
      t.style.opacity = '1';
      t.style.transform = 'translateX(-50%) translateY(0)';
    });
    clearTimeout(window.SZ._toastT);
    window.SZ._toastT = setTimeout(function () {
      t.style.opacity = '0';
      t.style.transform = 'translateX(-50%) translateY(20px)';
    }, ms);
  };

  function appendAttribution(data) {
    try {
      var attr = window.SZ.getAttribution();
      if (attr.first_touch) {
        data.append('_attrib_first_source', attr.first_touch.utms.utm_source || '');
        data.append('_attrib_first_medium', attr.first_touch.utms.utm_medium || '');
        data.append('_attrib_first_campaign', attr.first_touch.utms.utm_campaign || '');
        data.append('_attrib_first_landing', attr.first_touch.landing || '');
        data.append('_attrib_first_ts', new Date(attr.first_touch.ts).toISOString());
      }
      if (attr.last_touch) {
        data.append('_attrib_last_source', attr.last_touch.utms.utm_source || '');
        data.append('_attrib_last_medium', attr.last_touch.utms.utm_medium || '');
        data.append('_attrib_last_campaign', attr.last_touch.utms.utm_campaign || '');
      }
      data.append('_attrib_referrer', document.referrer || '');
    } catch (e) {}
  }

  window.SZ.submitLead = function (opts) {
    opts = opts || {};
    if (!window.SZ.formspreeReady) {
      return Promise.reject(new Error('formspree_pending'));
    }
    var data = new FormData();
    if (opts.email) data.append('email', opts.email);
    if (opts.nome) data.append('nome', opts.nome);
    data.append('_origem', opts.origem || opts.form || 'lead');
    data.append('form', opts.form || 'generic');
    if (opts.extra) {
      Object.keys(opts.extra).forEach(function (k) {
        data.append(k, opts.extra[k]);
      });
    }
    appendAttribution(data);
    return fetch(window.SZ.formspreeUrl(), {
      method: 'POST',
      body: data,
      headers: { Accept: 'application/json' }
    }).then(function (r) {
      if (!r.ok) throw new Error('status ' + r.status);
      window.ga('form_submit', { form: opts.form || 'generic', origem: opts.origem || '' });
      try {
        if (window.clarity && window.SZ.clarityReady) window.clarity('set', 'converted', 'yes');
      } catch (e) {}
      return r;
    });
  };

  window.SZ.kiwifyEbookReady = ready(window.SZ_KIWIFY_EBOOK_URL);

  window.SZ.wireEbookButtons = function () {
    var mail = 'yan@szuchmacher.com.br';
    document.querySelectorAll('[data-sz-ebook]').forEach(function (el) {
      if (window.SZ.kiwifyEbookReady) {
        el.href = window.SZ_KIWIFY_EBOOK_URL;
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener');
      } else {
        el.href = 'mailto:' + mail + '?subject=Interesse%20no%20Ebook%20de%20Estrat%C3%A9gias';
        el.removeAttribute('target');
      }
    });
  };

  window.SZ.wireStripeButtons = function () {
    var carta = document.querySelector('[data-stripe-carta]');
    var pro = document.querySelector('[data-stripe-pro]');
    var mail = 'yan@szuchmacher.com.br';
    if (carta) {
      carta.href = window.SZ.stripeCartaReady ? window.SZ_STRIPE_CARTA_URL : ('mailto:' + mail + '?subject=Assinatura%20Carta%20Szuchmacher');
      if (window.SZ.stripeCartaReady) {
        carta.setAttribute('target', '_blank');
        carta.setAttribute('rel', 'noopener');
      }
    }
    if (pro) {
      pro.href = window.SZ.stripeProReady ? window.SZ_STRIPE_PRO_URL : ('mailto:' + mail + '?subject=Assinatura%20MultiAsset%20Pro');
      if (window.SZ.stripeProReady) {
        pro.setAttribute('target', '_blank');
        pro.setAttribute('rel', 'noopener');
      }
    }
  };

  document.addEventListener('DOMContentLoaded', function () {
    var url = window.SZ.formspreeUrl();
    document.querySelectorAll('form[data-formspree]').forEach(function (form) {
      if (url) {
        form.action = url;
        form.removeAttribute('data-formspree-pending');
      } else {
        form.setAttribute('data-formspree-pending', '1');
      }
    });

    document.addEventListener('click', function (e) {
      var el = e.target.closest('[data-ga]');
      if (!el) return;
      var name = el.getAttribute('data-ga');
      var params = {};
      for (var i = 0; i < el.attributes.length; i++) {
        var a = el.attributes[i];
        if (a.name.indexOf('data-ga-') === 0 && a.name !== 'data-ga') {
          params[a.name.replace('data-ga-', '')] = a.value;
        }
      }
      window.ga(name, params);
    }, true);

    var page = (document.body && document.body.getAttribute('data-page')) || 'unknown';
    var fired = { s50: false, s90: false };
    window.addEventListener('scroll', function () {
      var h = document.documentElement;
      var pct = (h.scrollTop + window.innerHeight) / h.scrollHeight * 100;
      if (!fired.s50 && pct >= 50) { fired.s50 = true; window.ga('scroll_50', { page: page }); }
      if (!fired.s90 && pct >= 90) { fired.s90 = true; window.ga('scroll_90', { page: page }); }
    }, { passive: true });

    if (page === 'multiasset-app') window.ga('multiasset_view', { page: page });

    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href]');
      if (!a) return;
      var href = a.getAttribute('href') || '';
      if (/^mailto:/i.test(href)) { window.ga('click_email', { href: href }); return; }
      if (/^tel:/i.test(href)) { window.ga('click_phone', { href: href }); return; }
      if (/^https?:\/\//i.test(href) && href.indexOf(window.location.host) === -1) {
        window.ga('click_outbound', { href: href });
      }
    }, true);

    window.SZ.wireStripeButtons();
    window.SZ.wireEbookButtons();
    window.SZ.wireConversionLinks();

    document.addEventListener('click', function (e) {
      var cal = e.target.closest('[data-sz-cal]');
      if (cal) window.SZ.trackGoal('click_agendar', { location: cal.getAttribute('data-sz-cal') || '', pending: cal.hasAttribute('data-cal-pending') });
      var wa = e.target.closest('[data-sz-wa]');
      if (wa) window.SZ.trackGoal('click_whatsapp', { location: wa.getAttribute('data-sz-wa') || '' });
      var vip = e.target.closest('[data-sz-vip]');
      if (vip) window.SZ.trackGoal('click_vip', { location: vip.getAttribute('data-sz-vip') || '' });
    }, true);
  });

  window.SZ.bindFormspree = function (formEl, opts) {
    if (!formEl) return;
    opts = opts || {};
    formEl.addEventListener('submit', function (e) {
      e.preventDefault();
      if (formEl._gotcha && formEl._gotcha.value) return;
      if (!window.SZ.formspreeReady) {
        alert('Configuração de envio pendente. Por favor, escreva diretamente para yan@szuchmacher.com.br.');
        return;
      }
      var btn = formEl.querySelector('button[type="submit"]');
      var orig = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }

      var data = new FormData(formEl);
      appendAttribution(data);

      fetch(formEl.action || window.SZ.formspreeUrl(), {
        method: 'POST',
        body: data,
        headers: { Accept: 'application/json' }
      }).then(function (r) {
        if (!r.ok) throw new Error('status ' + r.status);
        var params = { form: formEl.getAttribute('data-form') || 'generic' };
        ['perfil', 'patrimonio', '_origem'].forEach(function (k) {
          var v = data.get(k); if (v) params[k.replace('_', '')] = v;
        });
        window.ga('form_submit', params);
        try { if (window.clarity && window.SZ.clarityReady) window.clarity('set', 'converted', 'yes'); } catch (e) {}
        if (typeof opts.onSuccess === 'function') opts.onSuccess(formEl);
      }).catch(function () {
        if (btn) { btn.disabled = false; btn.textContent = orig; }
        alert('Não foi possível enviar agora. Tente novamente em instantes ou escreva para yan@szuchmacher.com.br.');
      });
    });
  };
})();