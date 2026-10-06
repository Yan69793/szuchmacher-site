export async function fetchAsset(request, env, assetUrl, hops = 0) {
  if (hops > 3) return new Response('Asset loop', { status: 500 });
  const res = await env.ASSETS.fetch(new Request(assetUrl, { method: request.method, headers: request.headers }));
  if (![301,302,307,308].includes(res.status)) return res;
  const loc = res.headers.get('Location');
  if (!loc) return res;
  return fetchAsset(request, env, new URL(loc, assetUrl), hops + 1);
}