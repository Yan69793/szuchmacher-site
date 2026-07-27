/**
 * Relatorio Prices Handler — sz-sites Worker
 *
 * Alimenta os cards "Cotacao atual" de relatorios.html (fetchLiveMarketPrices,
 * relatorios.html:529). O front espera valores PLANOS:
 *
 *   { ok: true, ibovespa: 137000, usd_brl: 5.4321, sp500: 5420, wti: 74 }
 *
 * que e um formato diferente do /market-data.php ({ibov:{value,change_pct}, ...})
 * e inclui usd_brl, que nenhum outro handler expunha.
 *
 * A rota existia no front desde sempre, mas nunca foi portada do PHP: em producao
 * devolvia 404 e o .catch() silencioso de relatorios.html:542 escondia a falha, de
 * modo que os cards ficavam permanentemente no rotulo do relatorio_cache.json.
 *
 * Decisao de dado: quando uma fonte falha, o campo e OMITIDO em vez de cair para
 * um valor semente. O rotulo que o front aplica e literalmente "Cotacao atual" —
 * servir um numero velho sob esse rotulo seria mentir sobre dado de mercado. O
 * front so sobrescreve o card quando o campo vem preenchido (`if (d.ibovespa)`),
 * entao a omissao preserva o valor datado do relatorio.
 */

import { jsonResponse, brtNow } from '../utils/http.js';
import { readCache, writeCache } from '../utils/cache.js';
import { fetchYahoo, bcbSgs, parseSgsValor } from '../utils/market.js';

const CACHE_KEY = 'relatorio-prices';
const CACHE_TTL = 600; // 10 min, alinhado ao market-data

export async function handleRelatorioPrices(env) {
  const cache = await readCache(env.CACHE, CACHE_KEY);
  if (cache?.ts && Date.now() / 1000 - cache.ts < CACHE_TTL) {
    return jsonResponse({ ...cache, source_state: 'cache' }, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  }

  const [ibov, sp500, wti, ptax] = await Promise.all([
    fetchYahoo('%5EBVSP'),
    fetchYahoo('%5EGSPC'),
    fetchYahoo('CL%3DF'),
    bcbSgs(1, 8000),
  ]);

  const usdBrl = parseSgsValor(ptax);

  const payload = {
    ok: true,
    updated_at: brtNow(),
    ts: Math.floor(Date.now() / 1000),
    source_state: 'live',
  };

  // Campos ausentes ficam de fora do JSON — ver "Decisao de dado" acima.
  const indisponiveis = [];
  if (ibov) payload.ibovespa = ibov.value; else indisponiveis.push('ibovespa');
  if (sp500) payload.sp500 = sp500.value; else indisponiveis.push('sp500');
  if (wti) payload.wti = wti.value; else indisponiveis.push('wti');
  if (usdBrl != null) payload.usd_brl = usdBrl; else indisponiveis.push('usd_brl');
  payload.indisponiveis = indisponiveis;

  // Nenhuma fonte respondeu: devolver o ultimo cache bom, se houver, em vez de um
  // payload vazio que faria o front nao atualizar nada de qualquer forma.
  if (indisponiveis.length === 4) {
    if (cache?.ts) {
      return jsonResponse({ ...cache, source_state: 'stale-cache' }, {
        headers: { 'Cache-Control': 'public, max-age=60' },
      });
    }
    return jsonResponse({ ok: false, error: 'Fontes de mercado indisponiveis' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  await writeCache(env.CACHE, CACHE_KEY, payload, CACHE_TTL * 2);
  return jsonResponse(payload, { headers: { 'Cache-Control': 'public, max-age=300' } });
}
