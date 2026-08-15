export async function readCache(kv, key) {
  if (!kv) return null;
  const raw = await kv.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// A KV aceita no máximo 1 write por segundo na mesma chave; duas revalidações
// concorrentes no instante do vencimento colidem com 429. No caminho em foreground
// isso propagaria como 500 pro visitante, e no caminho em background como rejeição
// não tratada dentro do waitUntil — pior que servir a resposta sem persistir o
// cache novo, que é o que sobra de qualquer jeito quando o write falha.
export async function writeCache(kv, key, value, ttlSeconds) {
  if (!kv) return;
  try {
    await kv.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
  } catch (err) {
    console.error(`writeCache falhou para '${key}':`, err?.message ?? err);
  }
}

// A entrada precisa sobreviver bem além do TTL de frescor: é justamente o intervalo
// entre "venceu" e "expirou de vez" que dá o que servir enquanto a revalidação roda.
export const STALE_GRACE = 6;

export function staleTtl(ttlSeconds) {
  return ttlSeconds * STALE_GRACE;
}

// Decide o que fazer com o cache antes de qualquer chamada de upstream.
// 'cache': dentro do TTL. 'stale': vencido, mas serve agora e revalida atrás.
// 'miss': não há nada utilizável, o chamador precisa buscar em foreground.
//
// Sem isso, o visitante que chega no instante do vencimento paga a cascata de
// upstream inteira: /api/btc-scenarios mediu 13,0 s frio contra 0,33 s quente.
// Single-flight em memória por isolado: N requests concorrentes contra a mesma
// chave compartilham UMA execução da tarefa. Sem isso, o vencimento do cache
// dispara N cascatas de upstream ao mesmo tempo (thundering herd), com N writes
// no KV colidindo no limite de 1 write/segundo por chave. O Map vive por isolado,
// então a deduplicação não cobre isolados diferentes, mas reduz o problema de
// "um por request" para "um por isolado", que é a ordem de grandeza que importa.
const inflight = new Map();

export async function singleFlight(key, task) {
  if (inflight.has(key)) return inflight.get(key);
  const p = Promise.resolve().then(task);
  inflight.set(key, p);
  try {
    return await p;
  } finally {
    if (inflight.get(key) === p) inflight.delete(key);
  }
}

export async function readCacheOrRevalidate(kv, key, ttlSeconds, ctx, revalidate) {
  const cached = await readCache(kv, key);
  if (!cached?.ts) return { cached: null, state: 'miss' };

  if (Date.now() / 1000 - cached.ts < ttlSeconds) return { cached, state: 'cache' };

  if (ctx?.waitUntil) {
    // A resposta já saiu com o valor stale; uma rejeição aqui não chega a mais
    // ninguém, mas sem .catch() vira erro não tratado na invocação do Worker.
    // O singleFlight deduplica as revalidações concorrentes de requests que
    // chegam juntos no instante do vencimento.
    ctx.waitUntil(singleFlight(`reval:${key}`, revalidate).catch((err) => {
      console.error(`revalidação em background falhou para '${key}':`, err?.message ?? err);
    }));
    return { cached, state: 'stale' };
  }

  // Sem `ctx` não há background: devolver o cache vencido aqui o congelaria para
  // sempre. O chamador revalida em foreground, e cada handler já sabe cair no
  // cache anterior se o upstream falhar.
  return { cached: null, state: 'miss' };
}