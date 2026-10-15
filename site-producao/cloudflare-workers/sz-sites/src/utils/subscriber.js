// Utilitarios LGPD para inscritos do Fechamento de Mercado.
// - sha256Hex/randomToken: tokens de uso unico (double opt-in) guardados so como hash.
// - signEmail/verifyEmailSig: HMAC-SHA256 do e-mail para links de descadastro e
//   exclusao sem login. Exige o secret SUBSCRIBER_HMAC_SECRET.
// - ipHash: prova de origem do consentimento sem guardar o IP em claro.

export const POLICY_VERSION = '2026-10-15';
export const OPTIN_TTL = 48 * 3600;
export const SUBSCRIBER_TTL = 86400 * 365;
export const DELETED_TTL = 86400 * 365 * 5;

const enc = new TextEncoder();

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(text) {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(String(text))));
}

export function randomToken(bytes = 32) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return toHex(a);
}

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signEmail(email, secret) {
  if (!secret) return null;
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(normEmail(email)));
  return toHex(sig);
}

export async function verifyEmailSig(email, sig, secret) {
  if (!secret || !sig || !/^[0-9a-f]{64}$/.test(sig)) return false;
  const bytes = new Uint8Array(sig.match(/../g).map((h) => parseInt(h, 16)));
  return crypto.subtle.verify('HMAC', await hmacKey(secret), bytes, enc.encode(normEmail(email)));
}

export function normEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export async function ipHash(ip, secret) {
  return (await sha256Hex(`${secret || 'no-secret'}|${ip || 'unknown'}`)).slice(0, 32);
}

export async function unsubscribeUrl(email, env, base = 'https://szuchmacher.com.br') {
  const s = await signEmail(email, env.SUBSCRIBER_HMAC_SECRET);
  if (!s) return null;
  return `${base}/unsubscribe?e=${encodeURIComponent(normEmail(email))}&s=${s}`;
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}