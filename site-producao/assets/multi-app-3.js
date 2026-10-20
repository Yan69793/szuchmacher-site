
// BTC hero price — CoinGecko public API, sem key
(function fetchBtcHero() {
    var priceEl = document.getElementById('btc-hero-price');
    var changeEl = document.getElementById('btc-hero-change');
    if (!priceEl) return;
    // CoinGecko responde 429 sem CORS no limite. Falhou, usa o proxy do servidor
    // (prices.php), que nao traz variacao 24h: o preco aparece e a variacao
    // fica marcada como indisponivel, sem valor inventado.
    fetchMultiJson('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true', { timeoutMs: 8000 })
        .catch(function() {
            return fetchMultiJson('/prices.php', { timeoutMs: 8000 }).then(function(p) {
                if (!p || !p.ok || !(p.bitcoin > 0)) throw new Error('prices.php sem BTC');
                return { bitcoin: { usd: p.bitcoin, usd_24h_change: null } };
            });
        })
        .then(function(d) {
            var price = d.bitcoin && d.bitcoin.usd;
            var change = d.bitcoin && d.bitcoin.usd_24h_change;
            if (!Number.isFinite(price) || price <= 0) throw new Error('Cotação BTC inválida');
            priceEl.textContent = '$ ' + price.toLocaleString('pt-BR', {maximumFractionDigits:0});
            if (changeEl && !Number.isFinite(change)) {
                changeEl.textContent = 'variação 24h indisponível';
                changeEl.className = 'cripto-stat-change';
            } else if (changeEl) {
                var sign = change >= 0 ? '+' : '';
                changeEl.textContent = sign + change.toFixed(2) + '% (24h)';
                changeEl.className = 'cripto-stat-change ' + (change >= 0 ? 'change-pos' : 'change-neg');
            }
        })
        .catch(function() { if (changeEl) changeEl.textContent = 'cotação indisponível / anterior'; });
    setTimeout(fetchBtcHero, 120000);
})();
