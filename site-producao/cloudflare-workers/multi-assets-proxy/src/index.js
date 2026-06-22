/**
 * Proxy multi-assets.com → szuchmacher.com.br/multi-assets.com/
 * Necessário enquanto o addon domain não estiver no cPanel HostGator.
 */
const ORIGIN_HOST = 'szuchmacher.com.br';
const ORIGIN_PREFIX = '/multi-assets.com';

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    const target = new URL(request.url);
    target.hostname = ORIGIN_HOST;
    target.pathname = ORIGIN_PREFIX + incoming.pathname;
    target.search = incoming.search;

    const headers = new Headers(request.headers);
    headers.set('Host', ORIGIN_HOST);

    const init = {
      method: request.method,
      headers,
      redirect: 'follow',
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = request.body;
    }

    const response = await fetch(target.toString(), init);
    const out = new Response(response.body, response);
    out.headers.set('X-MultiAsset-Proxy', '1');
    return out;
  },
};