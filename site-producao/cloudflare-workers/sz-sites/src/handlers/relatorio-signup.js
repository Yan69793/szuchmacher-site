import { maskEmail, safeErrorBody } from '../utils/pii.js';
import {
	POLICY_VERSION, OPTIN_TTL, SUBSCRIBER_TTL, DELETED_TTL,
	sha256Hex, randomToken, ipHash, normEmail, unsubscribeUrl, verifyEmailSig, escapeHtml,
} from '../utils/subscriber.js';

/**
 * Relatorio Signup Handler — sz-sites Worker
 *
 * Endpoint publico que recebe inscricao para receber o Fechamento de Mercado
 * gratuito por email. Armazena o email no KV e envia email de boas-vindas
 * com o link do ultimo relatorio.
 *
 * Rate limit: 3 requisicoes por IP a cada 15 min (KV-based).
 */

const RATE_LIMIT_WINDOW = 900; // 15 min em segundos
const RATE_LIMIT_MAX = 3;

// O popup do simulador em multi-assets.com passou a usar este endpoint. Antes o
// CORS estava fixo em szuchmacher.com.br e a chamada do outro dominio seria
// barrada pelo browser.
const DEFAULT_ORIGIN = 'https://szuchmacher.com.br';
const ALLOWED_ORIGINS = new Set([
	'https://szuchmacher.com.br',
	'https://www.szuchmacher.com.br',
	'https://multi-assets.com',
	'https://www.multi-assets.com',
]);

function resolveOrigin(request) {
	const origin = request.headers.get('Origin');
	return origin && ALLOWED_ORIGINS.has(origin) ? origin : DEFAULT_ORIGIN;
}

function validateEmail(email) {
	if (!email || typeof email !== 'string') return false;
	// RFC 5322 simplificado: usuario@dominio.ext
	return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email.trim());
}

async function checkRateLimit(env, ip) {
	const key = `rate:signup:${ip}`;
	try {
		const current = await env.CACHE.get(key);
		const count = current ? parseInt(current, 10) : 0;
		if (count >= RATE_LIMIT_MAX) return false;
		await env.CACHE.put(key, String(count + 1), { expirationTtl: RATE_LIMIT_WINDOW });
		return true;
	} catch {
		return true; // se KV falhar, permite (evita bloquear usuario legitimo)
	}
}

async function getLatestReportUrl(env) {
	try {
		// Acessa o asset diretamente via binding ASSETS. O pathname comeca
		// com /sz/ porque e assim que os assets de szuchmacher.com.br estao
		// organizados no diretorio public/.
		const assetReq = new Request('https://szuchmacher.com.br/sz/relatorio_cache.json');
		const res = await env.ASSETS.fetch(assetReq);
		if (!res.ok) {
			console.error(`[relatorio-signup] ASSETS.fetch status ${res.status}`);
			return null;
		}
		const data = await res.json();
		return {
			url: data.latest_url || (data.latest_slug ? `https://szuchmacher.com.br/fechamento/${data.latest_slug}` : null),
			dateLabel: data.date_label || null,
		};
	} catch (err) {
		console.error(`[relatorio-signup] getLatestReportUrl: ${err?.message ?? err}`);
		return null;
	}
}

// source distingue a origem do lead (pagina de relatorios x popup do simulador),
// senao os dois funis viram um balde so no KV e nao da para medir conversao.
const VALID_SOURCES = new Set(['relatorio-signup', 'multiasset_exit_popup']);

async function sendWelcomeEmail(env, toEmail, reportInfo, unsubUrl = null) {
	const apiKey = env.RESEND_API_KEY;
	const fromEmail = env.FROM_EMAIL || 'yan@szuchmacher.com.br';

	if (!apiKey) {
		console.error('[relatorio-signup] RESEND_API_KEY ausente');
		return { ok: false, error: 'Configuracao de envio pendente (API key)' };
	}

	const reportUrl = reportInfo?.url || 'https://szuchmacher.com.br/relatorios.html';
	const dateLabel = reportInfo?.dateLabel || 'edicao mais recente';

	let html = buildWelcomeHtml(reportUrl, dateLabel);
	let plain = buildWelcomePlain(reportUrl, dateLabel);
	if (unsubUrl) {
		html = html.replace('</body>', unsubFooterHtml(unsubUrl) + '</body>');
		plain += `\n\nDescadastrar ou excluir seus dados: ${unsubUrl}\n`;
	}

	try {
		const res = await fetch('https://api.resend.com/emails', {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
				'User-Agent': 'sz-sites-worker/1.0',
			},
			body: JSON.stringify({
				from: `Szuchmacher Consultoria <${fromEmail}>`,
				to: [toEmail],
				subject: 'Bem-vindo — Fechamento de Mercado Szuchmacher',
				text: plain,
				html: html,
				...(unsubUrl ? { headers: { 'List-Unsubscribe': `<${unsubUrl}>` } } : {}),
			}),
		});

		if (res.ok) return { ok: true };
		const errBody = await res.text();
		const detail = `Resend API erro ${res.status}: ${safeErrorBody(errBody)}`;
		console.error(`[relatorio-signup] ${detail}`);
		return { ok: false, error: detail };
	} catch (err) {
		const msg = err?.message ?? String(err);
		console.error(`[relatorio-signup] excecao fetch Resend: ${msg}`);
		return { ok: false, error: `Falha ao conectar ao servidor de email: ${msg}` };
	}
}

function buildWelcomeHtml(reportUrl, dateLabel) {
	return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Bem-vindo</title></head>
<body style="margin:0;padding:0;background-color:#eef0f4;font-family:Georgia,'Times New Roman',Times,serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#eef0f4">
<tr><td align="center" style="padding:32px 16px 40px;">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="max-width:600px;width:100%;background-color:#ffffff;">

<tr><td style="padding:0;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#0a1428">
<tr><td height="3" bgcolor="#92703a" style="height:3px;line-height:3px;font-size:3px;background-color:#92703a;">&nbsp;</td></tr>
<tr><td style="padding:28px 32px 8px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr><td style="font-family:Georgia,serif;font-size:22px;color:#ffffff;line-height:28px;">Szuchmacher Consultoria</td>
<td align="right" width="120" style="font-family:'Courier New',monospace;font-size:11px;color:#d4b87a;line-height:16px;">Fechamento de Mercado</td></tr>
</table>
</td></tr>
<tr><td style="padding:4px 32px 20px;">
<p style="font-family:Georgia,serif;font-size:15px;font-style:italic;color:#d8d8d8;line-height:23px;margin:0;">Voce foi inscrito para receber o fechamento diario. Abaixo, a edicao mais recente.</p>
</td></tr>
<tr><td style="padding:0 32px 28px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#152238" style="background-color:#152238;border:1px solid #92703a;">
<tr><td style="padding:18px 20px 14px;font-family:Georgia,serif;font-size:14px;color:#ffffff;line-height:21px;">${dateLabel} — drivers, mercados e agenda.</td></tr>
<tr><td align="center" style="padding:0 20px 18px;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
<tr><td align="center" bgcolor="#92703a" style="background-color:#92703a;">
<a href="${reportUrl}" target="_blank" style="display:block;padding:12px 24px;font-family:'Courier New',monospace;font-size:11px;color:#ffffff;text-decoration:none;line-height:14px;">ABRIR RELATORIO</a>
</td></tr>
</table>
</td></tr>
</table>
</td></tr>
<tr><td height="1" bgcolor="#92703a" style="height:1px;line-height:1px;font-size:1px;background-color:#92703a;opacity:0.35;">&nbsp;</td></tr>
</table>
</td></tr>

<tr><td style="padding:28px 32px 0;">
<p style="font-family:Georgia,serif;font-size:14px;color:#1a2030;line-height:24px;margin:0 0 14px;">Prezado(a),</p>
<p style="font-family:Georgia,serif;font-size:14px;color:#1a2030;line-height:24px;margin:0 0 14px;">Obrigado por se inscrever. O Fechamento de Mercado e enviado em dias uteis, por volta das 19h (horario de Brasilia).</p>
<p style="font-family:Georgia,serif;font-size:14px;color:#1a2030;line-height:24px;margin:0 0 14px;">O botao acima da acesso a ${dateLabel}. As proximas edicoes chegarao diretamente por e-mail.</p>
<p style="font-family:Georgia,serif;font-size:14px;color:#1a2030;line-height:24px;margin:0;">Atenciosamente,<br><strong style="color:#0a1428;">Yan Szuchmacher</strong><br><span style="color:#5a6272;font-size:13px;">Szuchmacher Consultoria</span></p>
</td></tr>

<tr><td style="padding:32px 32px 0;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top:1px solid #d8dce3;">
<tr><td align="center" style="padding-top:20px;">
<a href="https://szuchmacher.com.br" target="_blank" style="font-family:'Courier New',monospace;font-size:10px;color:#92703a;text-decoration:none;">szuchmacher.com.br</a>
<p style="font-family:Georgia,serif;font-size:10px;color:#5a6272;line-height:15px;margin:10px 0 0;">Material informativo, nao constitui recomendacao de investimento</p>
</td></tr>
</table>
</td></tr>

<tr><td style="padding:20px 32px 28px;">
<p style="font-family:Georgia,serif;font-size:10px;color:#8a92a0;line-height:15px;margin:0;">Link direto: <a href="${reportUrl}" style="color:#92703a;text-decoration:underline;">${reportUrl}</a></p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function buildWelcomePlain(reportUrl, dateLabel) {
	const url = reportUrl || 'https://szuchmacher.com.br/relatorios.html';
	const label = dateLabel || 'edicao mais recente';
	return `Voce foi inscrito para receber o Fechamento de Mercado Szuchmacher.

Obrigado por se inscrever. O relatorio e enviado em dias uteis, por volta das 19h (horario de Brasilia).

Acesse a ${label}: ${url}

As proximas edicoes chegarao diretamente por e-mail.

Atenciosamente,
Yan Szuchmacher
Szuchmacher Consultoria

---
Material informativo, nao constitui recomendacao de investimento.`;
}

function jsonResponse(data, status = 200, origin = DEFAULT_ORIGIN) {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Cache-Control': 'no-store',
			'Access-Control-Allow-Origin': origin,
			'Access-Control-Allow-Methods': 'POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
			Vary: 'Origin',
		},
	});
}

function unsubFooterHtml(url) {
	return `<p style="font-family:Arial,sans-serif;font-size:11px;color:#8a8f99;text-align:center;margin:16px 0 24px;">Nao quer mais receber? <a href="${escapeHtml(url)}" style="color:#92703a;">Descadastrar ou excluir meus dados</a>.</p>`;
}

function htmlPage(title, bodyHtml, status = 200) {
	// Sem estilo inline: a CSP do site (style-src sem unsafe-inline) bloquearia.
	return new Response(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)} | Szuchmacher</title><link rel="stylesheet" href="/assets/sz-privacidade.css"></head><body><main class="container"><h1>${escapeHtml(title)}</h1>${bodyHtml}<p><a href="/">Voltar ao site</a></p></main></body></html>`, {
		status,
		headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
	});
}

async function sendConfirmEmail(env, toEmail, confirmUrl) {
	if (!env.RESEND_API_KEY) return { ok: false, error: 'Configuracao de envio pendente (API key)' };
	const fromEmail = env.FROM_EMAIL || 'yan@szuchmacher.com.br';
	const html = `<!DOCTYPE html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#eef0f4;font-family:Georgia,serif;"><table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#fff;"><tr><td style="padding:28px;">
<p style="font-size:16px;color:#0a1428;">Confirme sua inscricao no Fechamento de Mercado Szuchmacher.</p>
<p><a href="${escapeHtml(confirmUrl)}" style="display:inline-block;padding:12px 22px;background:#0a1428;color:#fff;text-decoration:none;font-family:Arial,sans-serif;font-size:13px;">Confirmar inscricao</a></p>
<p style="font-size:12px;color:#5a6272;">O link vale por 48 horas. Se voce nao pediu esta inscricao, ignore este e-mail: nada sera enviado e o pedido expira sozinho.</p>
</td></tr></table></body></html>`;
	const text = `Confirme sua inscricao no Fechamento de Mercado Szuchmacher:\n${confirmUrl}\n\nO link vale por 48 horas. Se voce nao pediu, ignore este e-mail.`;
	try {
		const res = await fetch('https://api.resend.com/emails', {
			method: 'POST',
			headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'User-Agent': 'sz-sites-worker/1.0' },
			body: JSON.stringify({ from: `Szuchmacher Consultoria <${fromEmail}>`, to: [toEmail], subject: 'Confirme sua inscricao - Fechamento de Mercado', text, html }),
		});
		if (res.ok) return { ok: true };
		return { ok: false, error: `Resend API erro ${res.status}: ${safeErrorBody(await res.text())}` };
	} catch (err) {
		return { ok: false, error: `Falha ao conectar ao servidor de email: ${err?.message ?? err}` };
	}
}

// POST /relatorio-signup
// LGPD (art. 8o): exige consent === true e guarda a prova (data, versao da
// politica, origem, hash do IP). Double opt-in: o inscrito fica 'pending' ate
// clicar no link de confirmacao; so entao recebe as boas-vindas.
export async function handleRelatorioSignup(request, env) {
	const origin = resolveOrigin(request);

	if (request.method === 'OPTIONS') {
		return new Response(null, {
			status: 204,
			headers: {
				'Access-Control-Allow-Origin': origin,
				'Access-Control-Allow-Methods': 'POST, OPTIONS',
				'Access-Control-Allow-Headers': 'Content-Type',
				'Access-Control-Max-Age': '86400',
				Vary: 'Origin',
			},
		});
	}

	if (request.method !== 'POST') {
		return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
	}

	const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
	const allowed = await checkRateLimit(env, ip);
	if (!allowed) {
		return jsonResponse({ ok: false, error: 'Muitas tentativas. Tente novamente em 15 minutos.' }, 429, origin);
	}

	let body;
	try {
		body = await request.json();
	} catch {
		return jsonResponse({ ok: false, error: 'JSON invalido' }, 400, origin);
	}

	const email = (body.email || '').trim();
	if (!validateEmail(email)) {
		return jsonResponse({ ok: false, error: 'Email invalido' }, 422, origin);
	}
	if (body.consent !== true) {
		return jsonResponse({ ok: false, error: 'E necessario aceitar o recebimento e a Politica de Privacidade.' }, 422, origin);
	}

	const key = `subscriber:${normEmail(email)}`;
	let existing = null;
	try { existing = await env.CACHE.get(key, { type: 'json' }); } catch { existing = null; }
	if (existing && existing.status === 'confirmed') {
		// Nao revela nem duplica: mesma resposta de sucesso, sem novo e-mail.
		return jsonResponse({ ok: true, pending: true, message: 'Enviamos um link de confirmacao para o seu e-mail.' }, 200, origin);
	}

	const source = VALID_SOURCES.has(body.source) ? body.source : 'relatorio-signup';
	const record = {
		email: normEmail(email),
		status: 'pending',
		signed_up_at: existing?.signed_up_at || new Date().toISOString(),
		source,
		consent: {
			at: new Date().toISOString(),
			policy_version: typeof body.policy_version === 'string' ? body.policy_version.slice(0, 20) : POLICY_VERSION,
			text_id: source,
			ip_hash: await ipHash(ip, env.SUBSCRIBER_HMAC_SECRET),
		},
	};
	try {
		await env.CACHE.put(key, JSON.stringify(record), { expirationTtl: SUBSCRIBER_TTL });
	} catch (err) {
		console.error(`[relatorio-signup] KV put falhou: ${err?.message ?? err}`);
		return jsonResponse({ ok: false, error: 'Falha temporaria. Tente novamente.' }, 503, origin);
	}

	const token = randomToken();
	await env.CACHE.put(`optin:${await sha256Hex(token)}`, record.email, { expirationTtl: OPTIN_TTL });
	const confirmUrl = `https://szuchmacher.com.br/relatorio-confirm?t=${token}`;
	const sent = await sendConfirmEmail(env, email, confirmUrl);
	if (!sent.ok) {
		console.error(`[relatorio-signup] confirmacao nao enviada: ${maskEmail(email)} - ${sent.error}`);
		return jsonResponse({ ok: true, pending: true, queued: true, message: 'Inscricao registrada. O e-mail de confirmacao pode demorar alguns minutos.' }, 202, origin);
	}
	console.log(`[relatorio-signup] pendente de confirmacao: ${maskEmail(email)} (${source})`);
	return jsonResponse({ ok: true, pending: true, message: 'Enviamos um link de confirmacao para o seu e-mail.' }, 200, origin);
}

// GET /relatorio-confirm?t=<token>  (double opt-in)
export async function handleRelatorioConfirm(request, env) {
	const t = new URL(request.url).searchParams.get('t') || '';
	if (!/^[0-9a-f]{64}$/.test(t)) return htmlPage('Link invalido', '<p>Este link de confirmacao e invalido.</p>', 400);
	const tokKey = `optin:${await sha256Hex(t)}`;
	const email = await env.CACHE.get(tokKey);
	if (!email) return htmlPage('Link expirado', '<p>Este link expirou ou ja foi usado. Inscreva-se novamente para receber um novo link.</p>', 410);
	await env.CACHE.delete(tokKey);

	const key = `subscriber:${email}`;
	const rec = (await env.CACHE.get(key, { type: 'json' })) || { email, source: 'relatorio-signup' };
	rec.status = 'confirmed';
	rec.confirmed_at = new Date().toISOString();
	await env.CACHE.put(key, JSON.stringify(rec), { expirationTtl: SUBSCRIBER_TTL });

	let reportInfo = null;
	try { reportInfo = await getLatestReportUrl(env); } catch { reportInfo = null; }
	const unsub = await unsubscribeUrl(email, env);
	const r = await sendWelcomeEmail(env, email, reportInfo, unsub);
	if (!r.ok) console.error(`[relatorio-confirm] boas-vindas nao enviadas: ${maskEmail(email)} - ${r.error}`);
	console.log(`[relatorio-confirm] confirmado: ${maskEmail(email)}`);
	return htmlPage('Inscricao confirmada', '<p>Pronto. Voce passa a receber o Fechamento de Mercado por e-mail. Cada envio traz um link para descadastrar.</p>');
}

// GET  /unsubscribe?e=&s=   -> pagina com as duas opcoes
// POST /unsubscribe (form: e, s, action=unsubscribe|delete)
// LGPD art. 18: revogacao do consentimento e eliminacao dos dados.
export async function handleUnsubscribe(request, env) {
	if (!env.SUBSCRIBER_HMAC_SECRET) {
		return htmlPage('Indisponivel', '<p>Para descadastrar, escreva para yan@szuchmacher.com.br.</p>', 503);
	}
	let e = '', s = '', action = '';
	const u = new URL(request.url);
	if (request.method === 'POST') {
		const ct = request.headers.get('content-type') || '';
		if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
			const form = await request.formData();
			e = String(form.get('e') || ''); s = String(form.get('s') || ''); action = String(form.get('action') || '');
		}
		e = e || u.searchParams.get('e') || '';
		s = s || u.searchParams.get('s') || '';
		// RFC 8058 (one-click) manda POST sem 'action'.
		action = action || 'unsubscribe';
	} else if (request.method === 'GET') {
		e = u.searchParams.get('e') || ''; s = u.searchParams.get('s') || '';
	} else {
		return new Response('Method not allowed', { status: 405 });
	}

	const email = normEmail(e);
	if (!validateEmail(email) || !(await verifyEmailSig(email, s, env.SUBSCRIBER_HMAC_SECRET))) {
		return htmlPage('Link invalido', '<p>Nao foi possivel validar este link.</p>', 403);
	}
	const key = `subscriber:${email}`;

	if (request.method === 'GET') {
		const he = escapeHtml(email), hs = escapeHtml(s);
		return htmlPage('Preferencias de e-mail', `<p>E-mail: <strong>${escapeHtml(email.replace(/^(.).*(@.*)$/, '$1***$2'))}</strong></p>
<form method="post" action="/unsubscribe"><input type="hidden" name="e" value="${he}"><input type="hidden" name="s" value="${hs}"><input type="hidden" name="action" value="unsubscribe"><button type="submit">Parar de receber o Fechamento</button></form>
<form method="post" action="/unsubscribe"><input type="hidden" name="e" value="${he}"><input type="hidden" name="s" value="${hs}"><input type="hidden" name="action" value="delete"><button type="submit">Excluir todos os meus dados</button></form>`);
	}

	if (action === 'delete') {
		await env.CACHE.delete(key);
		await env.CACHE.put(`deleted:${await sha256Hex(email)}`, JSON.stringify({ deleted_at: new Date().toISOString() }), { expirationTtl: DELETED_TTL });
		console.log(`[unsubscribe] dados excluidos: ${maskEmail(email)}`);
		return htmlPage('Dados excluidos', '<p>Seu e-mail foi removido da nossa base. Guardamos apenas um registro anonimo (hash) de que a exclusao foi atendida.</p>');
	}
	const rec = await env.CACHE.get(key, { type: 'json' });
	if (rec) {
		rec.status = 'unsubscribed';
		rec.unsubscribed_at = new Date().toISOString();
		await env.CACHE.put(key, JSON.stringify(rec), { expirationTtl: SUBSCRIBER_TTL });
	}
	console.log(`[unsubscribe] descadastrado: ${maskEmail(email)}`);
	return htmlPage('Descadastro feito', '<p>Voce nao recebera mais o Fechamento de Mercado.</p>');
}
