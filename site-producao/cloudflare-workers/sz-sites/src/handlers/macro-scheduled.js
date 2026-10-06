import { handleMacroApi } from './macro-api.js';
export async function runScheduledMacro(env, event = {}) {
  const started = Date.now();
  const rec = { ts: Math.floor(Date.now()/1000), cron: event.cron ?? '0 3 * * MON', ok:false, status:0, error:null, generated_at:null, ms:0 };
  try {
    const res = await handleMacroApi(new Request('https://cron.local/macro_api.php?cron=1'), env, { forceRefresh:true });
    const body = await res.clone().json().catch(() => ({}));
    rec.status=res.status; rec.ok=!!body.ok; rec.error=body.error ?? null; rec.generated_at=body.generated_at ?? null; rec.ms=Date.now()-started;
    try { await env.CACHE.put('macro-cron-last', JSON.stringify(rec), { expirationTtl: 30*24*3600 }); } catch {}
    if (!rec.ok) throw new Error('macro cron falhou status='+rec.status+' error='+(rec.error ?? 'unknown'));
    return rec;
  } catch (err) {
    rec.ms=Date.now()-started; if(!rec.error) rec.error=err?.message ?? String(err);
    try { await env.CACHE.put('macro-cron-last', JSON.stringify(rec), { expirationTtl: 30*24*3600 }); } catch {}
    throw err;
  }
}