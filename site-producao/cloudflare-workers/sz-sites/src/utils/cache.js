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

export async function writeCache(kv, key, value, ttlSeconds) {
  if (!kv) return;
  await kv.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
}