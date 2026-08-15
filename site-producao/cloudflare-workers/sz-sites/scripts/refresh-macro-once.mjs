// refresh-macro-once.mjs — execução manual controlada do handler (sem deploy).
// Lê OPENROUTER_KEY de config.php, roda forceRefresh, grava JSON em %TEMP%.
// Não imprime a chave. Não é caminho de produção.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleMacroApi } from '../src/handlers/macro-api.js';

const here = dirname(fileURLToPath(import.meta.url));
const configPath = join(here, '..', '..', '..', 'config.php');
const cfg = readFileSync(configPath, 'utf8');
const m = cfg.match(/define\('OPENROUTER_KEY',\s*'([^']+)'\)/);
if (!m || !m[1].startsWith('sk-')) {
  console.error(JSON.stringify({ ok: false, error: 'OPENROUTER_KEY ausente ou invalida em config.php' }));
  process.exit(1);
}

const store = new Map();
const env = {
  CACHE: {
    async get(key) { return store.get(key) ?? null; },
    async put(key, value) { store.set(key, value); },
  },
  ASSETS: {
    async fetch() { return new Response('nf', { status: 404 }); },
  },
  OPENROUTER_KEY: m[1],
  CRON_SECRET: 'local-once',
};

const started = Date.now();
const res = await handleMacroApi(
  new Request('https://szuchmacher.com.br/macro_api.php'),
  env,
  { forceRefresh: true },
);
const body = await res.json();
const out = {
  status: res.status,
  ok: !!body.ok,
  error: body.error ?? null,
  generated_at: body.generated_at ?? null,
  cache: body.cache ?? null,
  eyebrow: body.data?.eyebrow ?? null,
  ms: Date.now() - started,
  kv_wrote: store.has('macro-api'),
  kv_bytes: store.has('macro-api') ? store.get('macro-api').length : 0,
};
console.log(JSON.stringify(out));
if (out.ok && out.kv_wrote) {
  const dest = join(process.env.TEMP || '/tmp', 'macro-api-kv.json');
  writeFileSync(dest, store.get('macro-api'), 'utf8');
  console.log(JSON.stringify({ wrote: dest }));
  process.exit(0);
}
process.exit(1);
