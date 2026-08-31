
// BTC hero price — CoinGecko public API, sem key
(function fetchBtcHero() {
    var priceEl = document.getElementById('btc-hero-price');
    var changeEl = document.getElementById('btc-hero-change');
    if (!priceEl) return;
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true')
        .then(function(r) { return r.json(); })
        .then(function(d) {
            var price = d.bitcoin.usd;
            var change = d.bitcoin.usd_24h_change;
            priceEl.textContent = '$ ' + price.toLocaleString('en-US', {maximumFractionDigits:0});
            if (changeEl) {
                var sign = change >= 0 ? '+' : '';
                changeEl.textContent = sign + change.toFixed(2) + '% (24h)';
                changeEl.className = 'cripto-stat-change ' + (change >= 0 ? 'change-pos' : 'change-neg');
            }
        })
        .catch(function() {});
    setTimeout(fetchBtcHero, 120000);
})();
