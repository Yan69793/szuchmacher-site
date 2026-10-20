// /health e publico e e lido pelo watchdog scripts/check-macro-cron.ps1
// (Windows PowerShell 5.1, Invoke-RestMethod). Regras:
// - Nenhuma escrita no KV: antes cada GET fazia put+get, o que gastava cota de
//   writes e era abusavel. A leitura das chaves ja prova que o KV responde.
// - 503 so quando o KV falha (sem KV o watchdog tambem nao conseguiria ler o
//   carimbo, entao o alerta "/health ilegivel" e o comportamento certo).
// - macro_cache velho ou vazio vira status 'degraded' com HTTP 200, para o
//   watchdog continuar lendo checks.macro_cron_last e decidir sozinho.
export const MACRO_STALE_SECONDS = 8 * 24 * 3600;

// macro-api grava generated_at em pt-BR ('14/10/2026, 05:00 BRT'), que Date.parse
// nao entende, e grava ts em segundos. ts e a fonte; o texto e reserva para cache
// antigo sem ts.
export function macroGeneratedMs(macro) {
  if (Number.isFinite(macro?.ts) && macro.ts > 0) return macro.ts * 1000;
  const txt = macro?.generated_at;
  if (typeof txt !== 'string') return NaN;
  const m = txt.match(/^(\d{2})\/(\d{2})\/(\d{4}),? (\d{2}):(\d{2})(?: BRT)?$/);
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4] + 3, +m[5]); // BRT = UTC-3
  return Date.parse(txt);
}

export async function handleHealth(env, now = Date.now()) {
  const checks = {};
  let kvOk = true;
  let genMs = NaN;
  try {
    const macro = await env.CACHE.get('macro-api', { type: 'json' });
    checks.macro_cache = macro?.generated_at ?? 'empty';
    genMs = macroGeneratedMs(macro);
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
