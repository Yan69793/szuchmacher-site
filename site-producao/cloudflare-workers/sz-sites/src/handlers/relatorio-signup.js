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

async function storeSubscriber(env, email) {
	const key = `subscriber:${email.toLowerCase().trim()}`;
	try {
		await env.CACHE.put(key, JSON.stringify({
			email: email.toLowerCase().trim(),
			signed_up_at: new Date().toISOString(),
			source: 'relatorio-signup',
		}), { expirationTtl: 86400 * 365 }); // 1 ano
		return true;
	} catch {
		return false;
	}
}

async function sendWelcomeEmail(env, toEmail, reportInfo) {
	const apiKey = env.RESEND_API_KEY;
	const fromEmail = env.FROM_EMAIL || 'yan@szuchmacher.com.br';

	if (!apiKey) {
		console.error('[relatorio-signup] RESEND_API_KEY ausente');
		return { ok: false, error: 'Configuracao de envio pendente (API key)' };
	}

	const reportUrl = reportInfo?.url || 'https://szuchmacher.com.br/relatorios.html';
	const dateLabel = reportInfo?.dateLabel || 'edicao mais recente';

	const html = buildWelcomeHtml(reportUrl, dateLabel);
	const plain = buildWelcomePlain(reportUrl, dateLabel);

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
			}),
		});

		if (res.ok) return { ok: true };
		const errBody = await res.text();
		const detail = `Resend API erro ${res.status}: ${errBody}`;
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

function jsonResponse(data, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Cache-Control': 'no-store',
			'Access-Control-Allow-Origin': 'https://szuchmacher.com.br',
			'Access-Control-Allow-Methods': 'POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
		},
	});
}

export async function handleRelatorioSignup(request, env) {
	// CORS preflight
	if (request.method === 'OPTIONS') {
		return new Response(null, {
			status: 204,
			headers: {
				'Access-Control-Allow-Origin': 'https://szuchmacher.com.br',
				'Access-Control-Allow-Methods': 'POST, OPTIONS',
				'Access-Control-Allow-Headers': 'Content-Type',
				'Access-Control-Max-Age': '86400',
			},
		});
	}

	if (request.method !== 'POST') {
		return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
	}

	// Rate limit por IP
	const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
	const allowed = await checkRateLimit(env, ip);
	if (!allowed) {
		return jsonResponse({ ok: false, error: 'Muitas tentativas. Tente novamente em 15 minutos.' }, 429);
	}

	// Parse body
	let body;
	try {
		body = await request.json();
	} catch {
		return jsonResponse({ ok: false, error: 'JSON invalido' }, 400);
	}

	const email = (body.email || '').trim();
	if (!validateEmail(email)) {
		return jsonResponse({ ok: false, error: 'Email invalido' }, 422);
	}

	// Buscar ultimo relatorio
	let reportInfo = null;
	try {
		reportInfo = await getLatestReportUrl(env);
	} catch (err) {
		console.error(`[relatorio-signup] getLatestReportUrl: ${err?.message ?? err}`);
	}

	// Enviar email de boas-vindas
	let sendResult = null;
	try {
		sendResult = await sendWelcomeEmail(env, email, reportInfo);
	} catch (err) {
		const msg = err?.message ?? String(err);
		console.error(`[relatorio-signup] sendWelcomeEmail exception: ${msg}`);
		sendResult = { ok: false, error: msg };
	}
	if (!sendResult || !sendResult.ok) {
		const detail = (sendResult && sendResult.error) ? sendResult.error : 'Falha ao enviar email';
		return jsonResponse({ ok: false, error: detail }, 500);
	}

	// Armazenar inscrito no KV
	await storeSubscriber(env, email);

	console.log(`[relatorio-signup] novo inscrito: ${email}`);

	return jsonResponse({
		ok: true,
		message: 'Inscricao confirmada. Verifique seu email.',
	});
}