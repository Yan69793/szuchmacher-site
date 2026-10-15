
    var el = document.getElementById('contact-email-link');
    if (el) {
      var e = 'yan' + '@' + 'szuchmacher.com.br';
      el.href = 'mailto:' + e;
      el.textContent = e;
    }
    var contactForm = document.getElementById('contactForm');
    if (contactForm && window.SZ && window.SZ.bindFormspree) {
      window.SZ.bindFormspree(contactForm, {
        onSuccess: function () {
          var ok = document.getElementById('contactFormSuccess');
          if (ok) {
            ok.classList.add('show');
          }
          var fields = contactForm.querySelectorAll('input, select, textarea, button, label.consent, .form-row, .form-note');
          fields.forEach(function (n) { n.style.display = 'none'; });
        }
      });
    }
  