
// Clarity: metodologia_view
(function() {
    if (window.SZ_CLARITY_ID && window.SZ_CLARITY_ID !== 'XXXXXXXXXX') {
        var t = document.createElement('script');
        t.async = 1; t.src = 'https://www.clarity.ms/tag/' + window.SZ_CLARITY_ID;
        document.head.appendChild(t);
        t.onload = function() {
            if (window.clarity) {
                window.clarity('event', 'metodologia_view', { referrer: document.referrer });
            }
        };
    }
})();

