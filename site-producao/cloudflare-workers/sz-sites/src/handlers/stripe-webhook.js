/**
 * Stripe Webhook Handler — sz-sites Worker
 *
 * Recebe eventos do Stripe (checkout.session.completed) e envia email de
 * boas-vindas com o link do ultimo relatorio de fechamento.
 *
 * Seguranca: verifica assinatura do webhook (HMAC-SHA256 via Web Crypto API).
 * Sem assinatura valida, devolve 401.
 *
 * Resposta: sempre 200 para o Stripe (evita retry). Erros internos logam
 * no console do Worker e vao para tail.
 */

const WELCOME_SUBJECT = 'Bem-vindo — Szuchmacher Consultoria';
const WELCOME_PREHEADER = 'Seu acesso ao Fechamento de Mercado';

// Stripe envia v1= em hexadecimal (RFC 2104, secao 2). Base64 nao funciona:
// todo caractere hex tambem e valido em base64, entao atob nao lanca erro —
// devolve bytes errados e crypto.subtle.verify retorna false em toda entrega.
// Bug em producao desde o Stripe live (19/07/2026).
function hexToUint8Array(hex) {
	if (hex.length % 2 !== 0) hex = '0' + hex;
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
	}
	return bytes;
}

async function verifyStripeSignature(rawBody, signatureHeader, secret) {
	if (!signatureHeader || !secret) return false;

	const parts = {};
	for (const part of signatureHeader.split(',')) {
		const [k, ...v] = part.split('=');
		parts[k.trim()] = v.join('=').trim();
	}

	const ts = parts.t;
	const sigs = parts.v1;
	if (!ts || !sigs) return false;

	// Rejeita timestamp com mais de 5 min de deriva (anti-replay)
	const now = Math.floor(Date.now() / 1000);
	if (Math.abs(now - parseInt(ts, 10)) > 300) return false;

	const signedPayload = `${ts}.${rawBody}`;

	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['verify']
	);

	for (const sig of sigs.split(' ')) {
		const sigBytes = hexToUint8Array(sig);
		const ok = await crypto.subtle.verify(
			'HMAC',
			key,
			sigBytes,
			new TextEncoder().encode(signedPayload)
		);
		if (ok) return true;
	}
	return false;
}

async function getLatestReportFromCache(env) {
	try {
		const assetReq = new Request('https://szuchmacher.com.br/sz/relatorio_cache.json');
		const res = await env.ASSETS.fetch(assetReq);
		if (!res.ok) return null;
		const data = await res.json();
		if (data.latest_url) return data.latest_url;
		if (data.latest_slug) return `https://szuchmacher.com.br/fechamento/${data.latest_slug}`;
		return null;
	} catch (err) {
		console.error(`[stripe-webhook] getLatestReportFromCache: ${err?.message ?? err}`);
		return null;
	}
}

function buildWelcomeEmailHtml(reportUrl, dateLabel) {
	const url = reportUrl || 'https://szuchmacher.com.br/relatorios.html';
	const label = dateLabel || 'última edição';
	return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${WELCOME_SUBJECT}</title>
</head>
<body style="margin:0;padding:0;background-color:#eef0f4;font-family:Georgia,'Times New Roman',Times,serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#eef0f4">
<tr><td align="center" style="padding:32px 16px 40px;">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="max-width:600px;width:100%;background-color:#ffffff;">

  <!-- Banner -->
  <tr><td style="padding:0;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#0a1428">
      <tr><td height="3" bgcolor="#92703a" style="height:3px;line-height:3px;font-size:3px;background-color:#92703a;">&nbsp;</td></tr>
      <tr><td style="padding:28px 32px 8px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
          <tr>
            <td style="font-family:Georgia,serif;font-size:22px;color:#ffffff;line-height:28px;">
              Szuchmacher Consultoria
            </td>
            <td align="right" width="120" style="font-family:'Courier New',monospace;font-size:11px;color:#d4b87a;line-height:16px;white-space:nowrap;">
              ${WELCOME_PREHEADER}
            </td>
          </tr>
        </table>
      </td></tr>
      <tr><td style="padding:4px 32px 20px;">
        <p style="font-family:Georgia,serif;font-size:15px;font-style:italic;color:#d8d8d8;line-height:23px;margin:0;">
          Obrigado pela confiança. Abaixo, o link para o relatório mais recente.
        </p>
      </td></tr>
      <tr><td style="padding:0 32px 28px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#152238" style="background-color:#152238;border:1px solid #92703a;">
          <tr><td style="padding:18px 20px 14px;font-family:Georgia,serif;font-size:14px;color:#ffffff;line-height:21px;">
            ${label} — leitura executiva dos principais movimentos de mercado com implicações para portfólios qualificados.
          </td></tr>
          <tr><td align="center" style="padding:0 20px 18px;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
              <tr><td align="center" bgcolor="#92703a" style="background-color:#92703a;">
                <a href="${url}" target="_blank" style="display:block;padding:12px 24px;font-family:'Courier New',monospace;font-size:11px;color:#ffffff;text-decoration:none;line-height:14px;">
                  ABRIR RELATÓRIO
                </a>
              </td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>
      <tr><td height="1" bgcolor="#92703a" style="height:1px;line-height:1px;font-size:1px;background-color:#92703a;opacity:0.35;">&nbsp;</td></tr>
    </table>
  </td></tr>

  <!-- Corpo -->
  <tr><td style="padding:28px 32px 0;">
    <p style="font-family:Georgia,serif;font-size:14px;color:#1a2030;line-height:24px;margin:0 0 14px;">
      Prezado(a),
    </p>
    <p style="font-family:Georgia,serif;font-size:14px;color:#1a2030;line-height:24px;margin:0 0 14px;">
      Bem-vindo. O Fechamento de Mercado é publicado em dias úteis, por volta das 19h (horário de Brasília), com análise dos vetores que movem preços e implicações para alocação.
    </p>
    <p style="font-family:Georgia,serif;font-size:14px;color:#1a2030;line-height:24px;margin:0 0 14px;">
      O botão acima dá acesso à ${label}. As próximas edições chegam diretamente por e-mail.
    </p>
    <p style="font-family:Georgia,serif;font-size:14px;color:#1a2030;line-height:24px;margin:0;">
      Atenciosamente,<br>
      <strong style="color:#0a1428;">Yan Szuchmacher</strong><br>
      <span style="color:#5a6272;font-size:13px;">Szuchmacher Consultoria</span>
    </p>
  </td></tr>

  <!-- Rodapé -->
  <tr><td style="padding:32px 32px 0;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top:1px solid #d8dce3;">
      <tr><td align="center" style="padding-top:20px;">
        <a href="https://szuchmacher.com.br" target="_blank" style="font-family:'Courier New',monospace;font-size:10px;color:#92703a;text-decoration:none;">szuchmacher.com.br</a>
        <p style="font-family:Georgia,serif;font-size:10px;color:#5a6272;line-height:15px;margin:10px 0 0;">
          Material informativo, não constitui recomendação de investimento
        </p>
      </td></tr>
    </table>
  </td></tr>

  <tr><td style="padding:20px 32px 28px;">
    <p style="font-family:Georgia,serif;font-size:10px;color:#8a92a0;line-height:15px;margin:0;">
      Link direto: <a href="${url}" style="color:#92703a;text-decoration:underline;">${url}</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function buildWelcomeEmailPlain(reportUrl, dateLabel) {
	const url = reportUrl || 'https://szuchmacher.com.br/relatorios.html';
	const label = dateLabel || 'última edição';
	return `Bem-vindo à Szuchmacher Consultoria.

Obrigado pela confiança. O Fechamento de Mercado é publicado em dias úteis, por volta das 19h (horário de Brasília).

Acesse a ${label}: ${url}

As próximas edições chegam diretamente por e-mail.

Atenciosamente,
Yan Szuchmacher
Szuchmacher Consultoria

---
Material informativo, não constitui recomendação de investimento.`;
}

async function sendWelcomeEmail(env, toEmail, reportUrl, dateLabel) {
	const apiKey = env.RESEND_API_KEY;
	const fromEmail = env.FROM_EMAIL || 'yan@szuchmacher.com.br';

	if (!apiKey) {
		console.error('[stripe-webhook] RESEND_API_KEY ausente');
		return false;
	}
	if (!toEmail) {
		console.error('[stripe-webhook] email do destinatario ausente');
		return false;
	}

	const html = buildWelcomeEmailHtml(reportUrl, dateLabel);
	const plain = buildWelcomeEmailPlain(reportUrl, dateLabel);

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
				subject: WELCOME_SUBJECT,
				text: plain,
				html: html,
			}),
		});

		if (res.ok) {
			console.log(`[stripe-webhook] welcome email enviado para ${toEmail}`);
			return true;
		}

		const errBody = await res.text();
		console.error(`[stripe-webhook] Resend API status ${res.status}: ${errBody}`);
		return false;
	} catch (err) {
		console.error(`[stripe-webhook] excecao ao enviar email: ${err?.message ?? err}`);
		return false;
	}
}

export async function handleStripeWebhook(request, env, ctx) {
	// Só aceita POST
	if (request.method !== 'POST') {
		return new Response('Method not allowed', { status: 405 });
	}

	const signature = request.headers.get('stripe-signature');
	const rawBody = await request.text();

	// Verificar assinatura. Sem secret configurado, devolve 503 em vez de
	// cair no literal '[STRIPE_WEBHOOK_SECRET]' que estava publicado no repo.
	if (!env.STRIPE_WEBHOOK_SECRET) {
		console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET nao configurado no Worker');
		return new Response('Webhook secret not configured', { status: 503 });
	}
	const valid = await verifyStripeSignature(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
	if (!valid) {
		console.error('[stripe-webhook] assinatura invalida ou ausente');
		return new Response('Invalid signature', { status: 401 });
	}

	let event;
	try {
		event = JSON.parse(rawBody);
	} catch {
		return new Response('Invalid JSON', { status: 400 });
	}

	const eventType = event.type;
	console.log(`[stripe-webhook] evento recebido: ${eventType}`);

	// Stripe espera resposta rapida (<= 20s). O envio de email roda em
	// background via ctx.waitUntil, que mantem o Worker vivo ate concluir.
	if (eventType === 'checkout.session.completed') {
		const session = event.data?.object;
		const customerEmail = session?.customer_details?.email || session?.customer_email;

		if (customerEmail && ctx) {
			ctx.waitUntil((async () => {
				const reportUrl = await getLatestReportFromCache(env);
				await sendWelcomeEmail(env, customerEmail, reportUrl, null);
			})());
		} else if (customerEmail) {
			// Sem ctx (caminho de teste): envia sincrono com timeout
			console.warn('[stripe-webhook] ctx indisponivel, envio sincrono');
			const reportUrl = await getLatestReportFromCache(env);
			await sendWelcomeEmail(env, customerEmail, reportUrl, null);
		} else {
			console.warn('[stripe-webhook] checkout.session.completed sem email detectavel');
		}
	}

	return new Response(JSON.stringify({ received: true }), {
		status: 200,
		headers: { 'Content-Type': 'application/json; charset=utf-8' },
	});
}
