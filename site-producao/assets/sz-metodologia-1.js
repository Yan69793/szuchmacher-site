
// Clarity: metodologia_view. So carrega com consentimento de analytics (LGPD).
(function() {
    function fire() {
        if (window.clarity) {
            window.clarity('event', 'metodologia_view', { referrer: document.referrer });
        }
    }
    if (!window.SZ || typeof window.SZ.getConsent !== 'function') return;
    if (window.SZ.getConsent() !== 'analytics') return;
    if (typeof window.SZ.loadClarity === 'function') window.SZ.loadClarity();
    setTimeout(fire, 1500);
})();

