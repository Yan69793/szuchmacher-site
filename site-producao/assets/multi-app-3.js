
// BTC hero price — CoinGecko public API, sem key
(function fetchBtcHero() {
    var priceEl = document.getElementById('btc-hero-price');
    var changeEl = document.getElementById('btc-hero-change');
    if (!priceEl) return;
    fetchMultiJson('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true', { timeoutMs: 8000 })
        .then(function(d) {
            var price = d.bitcoin && d.bitcoin.usd;
            var change = d.bitcoin && d.bitcoin.usd_24h_change;
            if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(change)) throw new Error('Cotação BTC inválida');
            priceEl.textContent = '$ ' + price.toLocaleString('en-US', {maximumFractionDigits:0});
            if (changeEl) {
                var sign = change >= 0 ? '+' : '';
                changeEl.textContent = sign + change.toFixed(2) + '% (24h)';
                changeEl.className = 'cripto-stat-change ' + (change >= 0 ? 'change-pos' : 'change-neg');
            }
        })
        .catch(function() { if (changeEl) changeEl.textContent = 'cotação indisponível / anterior'; });
    setTimeout(fetchBtcHero, 120000);
})();
