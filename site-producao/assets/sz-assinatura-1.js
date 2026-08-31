
    document.addEventListener('DOMContentLoaded', function () {
        try {
            var p = new URLSearchParams(window.location.search);
            if (p.get('checkout') === 'ok') {
                var ok = document.getElementById('checkout-ok');
                if (ok) ok.hidden = false;
                window.ga && window.ga('checkout_complete', { page: 'assinatura' });
            }
        } catch (e) {}
        window.SZ && window.SZ.wireStripeButtons && window.SZ.wireStripeButtons();
        window.SZ && window.SZ.bindFormspree && window.SZ.bindFormspree(document.getElementById('leadForm'), {
            onSuccess: function () { var f = document.getElementById('leadForm'); if (f) f.innerHTML = '<h3>Inscrição recebida</h3><p class="sub">Recebi seus dados. Retorno em até 24 horas úteis.</p>'; }
        });
    });

