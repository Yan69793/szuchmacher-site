
    document.addEventListener('DOMContentLoaded', function () {
      var em = 'yan' + String.fromCharCode(64) + 'szuchmacher.com.br';
      var el = document.getElementById('contact-email-link');
      if (el) { el.href = 'mai' + 'lto:' + em; el.textContent = em; }

      window.SZ && window.SZ.bindFormspree(document.getElementById('leadForm'), {
        onSuccess: function () {
          var ok = document.getElementById('formSuccess');
          if (ok) {
            ok.classList.add('show');
            ok.setAttribute('role', 'status');
            ok.setAttribute('aria-live', 'polite');
          }
          var fields = document.querySelectorAll('#leadForm input, #leadForm select, #leadForm textarea, #leadForm button, #leadForm label.consent');
          fields.forEach(function (n) { n.style.display = 'none'; });
        }
      });
    });
  
