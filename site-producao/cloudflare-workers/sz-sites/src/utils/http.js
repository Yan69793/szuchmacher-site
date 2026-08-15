export async function fetchJson(url, opts = {}) {
  const timeout = opts.timeout ?? 10000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers: opts.headers,
      body: opts.body,
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!res.ok) {
      // Fontes externas morrendo em silencio foi a causa do incidente NTNB11:
      // brapi 401 desde maio/2026 sem um log sequer. O warn pelo menos deixa
      // rastro nos logs do Worker quando um upstream passa a falhar.
      console.warn(`[fetchJson] ${url} -> HTTP ${res.status}`);
      return null;
    }
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Variante diagnostica do fetchJson: devolve status e erro em vez de null.
// Handlers que precisam distinguir "fonte morta" (401/403/404/410/429/timeout)
// de "fonte sem dados" (200 com payload vazio) usam esta, e alimentam o KV
// de saude de fontes com o resultado. fetchJson continua valendo para os
// caminhos em que a falha e tratada como null de qualquer forma.
export async function fetchJsonStrict(url, opts = {}) {
  const timeout = opts.timeout ?? 10000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers: opts.headers,
      body: opts.body,
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!res.ok) {
      console.warn(`[fetchJsonStrict] ${url} -> HTTP ${res.status}`);
      return { ok: false, status: res.status, data: null, error: `HTTP ${res.status}` };
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      // 200 com corpo nao-JSON (WAF/HTML de erro no meio do caminho): a fonte
      // falhou do mesmo jeito, mas o status real nao pode virar 0 na telemetria.
      console.warn(`[fetchJsonStrict] ${url} -> HTTP ${res.status} com corpo nao-JSON`);
      return { ok: false, status: res.status, data: null, error: `resposta nao-JSON (HTTP ${res.status})` };
    }
    return { ok: true, status: res.status, data, error: null };
  } catch (err) {
    console.warn(`[fetchJsonStrict] ${url} -> ${err?.name ?? 'erro'}: ${err?.message ?? err}`);
    return { ok: false, status: 0, data: null, error: err?.message ?? String(err) };
  } finally {
    clearTimeout(timer);
  }
}

export function jsonResponse(data, init = {}) {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');

  return new Response(JSON.stringify(data), { ...init, headers });
}

export function brtNow() {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date()) + ' BRT';
}