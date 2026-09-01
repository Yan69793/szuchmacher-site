
    /* ── Formulario de inscricao gratuita ────────────────────────────────────
     * Envia POST para /relatorio-signup (Worker sz-sites), que armazena o
     * email em KV e dispara email de boas-vindas com o ultimo relatorio.
     * ────────────────────────────────────────────────────────────────────── */
    (function () {
      'use strict';
      var form = document.getElementById('reportSignupForm');
      if (!form) return;
      var msg = document.getElementById('reportSignupMsg');
      var btn = form.querySelector('button[type="submit"]');
      var origText = btn ? btn.textContent : '';

      function showMsg(text, isError) {
        if (!msg) return;
        msg.textContent = text;
        msg.style.display = 'block';
        msg.style.color = isError ? '#b33' : '#2a6b2a';
      }

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = (form.querySelector('input[name="email"]') || {}).value;
        if (!email) return;

        if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
        if (msg) msg.style.display = 'none';

        fetch('/relatorio-signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim() }),
        })
          .then(function (r) { return r.json(); })
          .then(function (d) {
            if (d.ok) {
              showMsg('Inscricao confirmada. Verifique seu email para acessar o ultimo relatorio.', false);
              form.reset();
            } else {
              showMsg(d.error || 'Erro ao processar. Tente novamente.', true);
            }
          })
          .catch(function () {
            showMsg('Erro de conexao. Tente novamente em instantes.', true);
          })
          .then(function () {
            if (btn) { btn.disabled = false; btn.textContent = origText; }
          });
      });
    })();
  
