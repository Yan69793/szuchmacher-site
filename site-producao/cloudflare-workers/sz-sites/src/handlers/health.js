// /health e publico e e lido pelo watchdog scripts/check-macro-cron.ps1
// (Windows PowerShell 5.1, Invoke-RestMethod). Regras:
// - Nenhuma escrita no KV: antes cada GET fazia put+get, o que gastava cota de
//   writes e era abusavel. A leitura das chaves ja prova que o KV responde.
// - 503 so quando o KV falha (sem KV o watchdog tambem nao conseguiria ler o
//   carimbo, entao o alerta "/health ilegivel" e o comportamento certo).
// - macro_cache velho ou vazio vira status 'degraded' com HTTP 200, para o
//   watchdog continuar lendo checks.macro_cron_last e decidir sozinho.
export const MACRO_STALE_SECONDS = 8 * 24 * 3600;

export async function handleHealth(env, now = Date.now()) {
  const checks = {};
  let kvOk = true;
  try {
    const macro = await env.CACHE.get('macro-api', { type: 'json' });
    checks.macro_cache = macro?.generated_at ?? 'empty';
  } catch {
    kvOk = false;
    checks.macro_cache = 'unavailable';
  }
  try {
    const last = await env.CACHE.get('macro-cron-last', { type: 'json' });
    checks.macro_cron_last = last ?? 'empty';
  } catch {
    kvOk = false;
    checks.macro_cron_last = 'unavailable';
  }
  checks.kv = kvOk ? 'ok' : 'fail';

  let macroFresh = false;
  const genMs = Date.parse(checks.macro_cache);
  if (Number.isFinite(genMs)) macroFresh = (now - genMs) / 1000 <= MACRO_STALE_SECONDS;
  checks.macro_fresh = macroFresh;

  const status = !kvOk ? 'fail' : (macroFresh ? 'ok' : 'degraded');
  return new Response(JSON.stringify({
    status,
    version: 'sz-sites-worker',
    checks,
    ts: Math.floor(now / 1000),
  }), {
    status: kvOk ? 200 : 503,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
