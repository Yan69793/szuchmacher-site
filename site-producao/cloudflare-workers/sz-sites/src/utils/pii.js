// Minimizacao de dado pessoal em logs (LGPD art. 6o, III). Os logs do Worker
// vao para o Workers Observability com head_sampling_rate 1, entao nenhum
// e-mail completo deve ser escrito ali.
export function maskEmail(email) {
  if (!email || typeof email !== 'string') return '(sem-email)';
  const s = email.trim().toLowerCase();
  const at = s.lastIndexOf('@');
  if (at < 1) return '***';
  return `${s[0]}***@${s.slice(at + 1)}`;
}

// Corpo de erro de API externa pode ecoar o destinatario. Corta e mascara.
export function safeErrorBody(body, max = 200) {
  const s = String(body ?? '').slice(0, max);
  return s.replace(/[^\s"'<>@]+@[^\s"'<>@]+\.[^\s"'<>@]+/g, (m) => maskEmail(m));
}