"""
qualificador_leads.py
Qualifica leads do formulário de contato com Qwen e envia briefing via WhatsApp.

Como funciona:
  1. Recebe POST do formulário szuchmacher.com.br/contact
  2. Qwen classifica o lead (fit, urgência, perfil patrimonial, abordagem sugerida)
  3. Envia briefing estruturado via WhatsApp/Telegram em <30 segundos

Dois modos de integração:
  A) Webhook Flask — recebe POST direto do formulário
  B) Email parser — processa emails de notificação do Formspree/formulário
  C) Leitura manual — você cola os dados e recebe o briefing

Uso:
  python qualificador_leads.py              # inicia servidor webhook na porta 8765
  python qualificador_leads.py --email      # modo email (não requer servidor)
  python qualificador_leads.py --manual     # qualifica manualmente (interativo)
  python qualificador_leads.py --testar     # envia lead fictício de teste
"""

import sys
import json
import argparse
import requests
import urllib.parse
from datetime import datetime
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).parent / "data"))
from config import (
    QWEN_API_KEY, QWEN_BASE_URL, QWEN_MODEL,
    CALLMEBOT_PHONE, CALLMEBOT_APIKEY, CALLMEBOT_USER,
    TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM, TWILIO_TO,
    TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
    LEAD_WEBHOOK_PORT, LEAD_WEBHOOK_HOST, LEAD_WEBHOOK_SECRET
)


# ─── Estrutura do lead ────────────────────────────────────────────────────────

LEAD_VAZIO = {
    "nome": "",
    "email": "",
    "telefone": "",
    "perfil": "",          # empresario | executivo | familia | outro
    "patrimonio": "",      # 1-3 | 3-10 | 10-30 | 30+  (em R$ milhões)
    "objetivo": "",        # governanca | liquidez | alocacao | risco
    "mensagem": "",
    "origem": "site",
    "data_hora": "",
}


# ─── Análise Qwen ─────────────────────────────────────────────────────────────

PROMPT_QUALIFICACAO = """Você é assistente de um wealth advisor brasileiro especializado em clientes UHNW (Ultra High Net Worth).

Analise o lead abaixo e produza um briefing de qualificação em JSON com exatamente esta estrutura:
{
  "fit_score": <1-10, onde 10 é fit perfeito para UHNW>,
  "urgencia": <"alta" | "media" | "baixa">,
  "perfil_resumido": "<1 frase sobre quem é o lead>",
  "patrimonio_estimado": "<faixa declarada ou estimada>",
  "objetivo_principal": "<o que o lead realmente quer>",
  "pontos_de_atencao": ["<risco ou desafio>", "<outro se houver>"],
  "abordagem_sugerida": "<como conduzir a primeira conversa — tom, foco, o que NÃO dizer>",
  "tempo_resposta_ideal": "<imediato | em 2h | no dia | em 24h>",
  "gancho_conversa": "<frase de abertura sugerida para o contato>",
  "observacoes": "<qualquer insight adicional relevante>"
}

Responda APENAS com o JSON, sem texto antes ou depois.

DADOS DO LEAD:
Nome: {nome}
Perfil declarado: {perfil}
Faixa patrimonial: {patrimonio}
Objetivo principal: {objetivo}
Mensagem: {mensagem}
Telefone: {telefone}
Email: {email}
Origem: {origem}
Data/hora: {data_hora}
"""


def qualificar_com_qwen(lead: dict) -> dict:
    """
    Usa Qwen para qualificar o lead.
    Retorna dict com análise estruturada.
    """
    if not QWEN_API_KEY:
        return _qualificacao_simples(lead)

    try:
        prompt = PROMPT_QUALIFICACAO.format(**{k: lead.get(k, "—") for k in LEAD_VAZIO})
        from openai import OpenAI
        client = OpenAI(api_key=QWEN_API_KEY, base_url=QWEN_BASE_URL)
        resp = client.chat.completions.create(
            model=QWEN_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=600,
            temperature=0.2,
            response_format={"type": "json_object"},
        )
        texto = resp.choices[0].message.content.strip()
        return json.loads(texto)

    except ImportError:
        print("[leads] openai não instalado. pip install openai")
        return _qualificacao_simples(lead)
    except json.JSONDecodeError as e:
        print(f"[leads] JSON inválido do Qwen: {e}")
        return _qualificacao_simples(lead)
    except Exception as e:
        print(f"[leads] ERRO Qwen: {e}")
        return _qualificacao_simples(lead)


def _qualificacao_simples(lead: dict) -> dict:
    """Qualificação baseada em regras — fallback sem IA."""
    patrimonio = lead.get("patrimonio", "")
    objetivo = lead.get("objetivo", "")

    # Score baseado em faixa patrimonial
    score_map = {"1-3": 5, "3-10": 7, "10-30": 9, "30+": 10}
    fit_score = score_map.get(patrimonio, 4)

    urgencia_map = {"governanca": "alta", "liquidez": "alta", "alocacao": "media", "risco": "media"}
    urgencia = urgencia_map.get(objetivo, "media")

    return {
        "fit_score": fit_score,
        "urgencia": urgencia,
        "perfil_resumido": f"{lead.get('perfil','Lead').capitalize()} com patrimônio declarado de R${patrimonio}M",
        "patrimonio_estimado": f"R${patrimonio}M (declarado)",
        "objetivo_principal": objetivo,
        "pontos_de_atencao": ["Qualificação automática — confirmar perfil na conversa"],
        "abordagem_sugerida": "Foco em diagnóstico patrimonial inicial. Evitar falar em produtos na primeira conversa.",
        "tempo_resposta_ideal": "em 2h" if urgencia == "alta" else "em 24h",
        "gancho_conversa": f"Vi que você está buscando suporte com {objetivo} — posso ajudar com um diagnóstico inicial.",
        "observacoes": "Análise gerada por regras (Qwen indisponível).",
    }


# ─── Formatação do briefing ───────────────────────────────────────────────────

EMOJIS_SCORE = {10: "🟢🟢", 9: "🟢🟢", 8: "🟢", 7: "🟡🟢", 6: "🟡", 5: "🟡",
                4: "🔴🟡", 3: "🔴", 2: "🔴", 1: "🔴🔴", 0: "⚫"}
EMOJIS_URGENCIA = {"alta": "🔥", "media": "⚡", "baixa": "🕐"}


def formatar_briefing_lead(lead: dict, analise: dict) -> str:
    """Formata briefing para WhatsApp."""
    score = analise.get("fit_score", 0)
    emoji_score = EMOJIS_SCORE.get(score, "⚫")
    emoji_urg = EMOJIS_URGENCIA.get(analise.get("urgencia", "media"), "⚡")
    hora = datetime.now().strftime("%d/%m %H:%M")

    pontos = analise.get("pontos_de_atencao", [])
    pontos_txt = "\n".join(f"  ⚠️ {p}" for p in pontos) if pontos else "  Nenhum"

    return f"""👤 *NOVO LEAD — {hora}*

*{lead.get('nome', 'Lead').upper()}*
{lead.get('email', '')} · {lead.get('telefone', '')}

{emoji_score} *Fit Score: {score}/10* · {emoji_urg} Urgência: *{analise.get('urgencia','').upper()}*
⏱ Resposta ideal: *{analise.get('tempo_resposta_ideal','—')}*

*Perfil:* {analise.get('perfil_resumido','—')}
*Patrimônio:* {analise.get('patrimonio_estimado','—')}
*Objetivo:* {analise.get('objetivo_principal','—')}

*Pontos de atenção:*
{pontos_txt}

*Abordagem sugerida:*
_{analise.get('abordagem_sugerida','—')}_

*Gancho de conversa:*
"_{analise.get('gancho_conversa','—')}_"

{f"📝 {analise.get('observacoes','')}" if analise.get('observacoes') else ''}

— YanOS Leads"""


# ─── Canais de envio (reutiliza lógica do monitor) ───────────────────────────

def _enviar_telegram(mensagem: str) -> bool:
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        return False
    try:
        resp = requests.post(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            json={"chat_id": TELEGRAM_CHAT_ID, "text": mensagem, "parse_mode": "Markdown"},
            timeout=15
        )
        return resp.status_code == 200
    except Exception:
        return False


def _enviar_callmebot(mensagem: str) -> bool:
    msg_enc = urllib.parse.quote(mensagem)
    if CALLMEBOT_USER:
        url = f"https://api.callmebot.com/text.php?user=@{CALLMEBOT_USER}&text={msg_enc}"
    elif CALLMEBOT_PHONE and CALLMEBOT_APIKEY:
        url = f"https://api.callmebot.com/whatsapp.php?phone={CALLMEBOT_PHONE}&text={msg_enc}&apikey={CALLMEBOT_APIKEY}"
    else:
        return False
    try:
        resp = requests.get(url, timeout=15)
        return resp.status_code == 200
    except Exception:
        return False


def _enviar_twilio(mensagem: str) -> bool:
    if not all([TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM, TWILIO_TO]):
        return False
    try:
        resp = requests.post(
            f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json",
            data={"From": TWILIO_FROM, "To": TWILIO_TO, "Body": mensagem},
            auth=(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN),
            timeout=15
        )
        return resp.status_code in (200, 201)
    except Exception:
        return False


def enviar_briefing(mensagem: str) -> bool:
    if _enviar_telegram(mensagem):
        print("  ✓ Briefing enviado via Telegram")
        return True
    if _enviar_callmebot(mensagem):
        print("  ✓ Briefing enviado via CallMeBot")
        return True
    if _enviar_twilio(mensagem):
        print("  ✓ Briefing enviado via Twilio")
        return True
    print("  ✗ Nenhum canal configurado. Briefing impresso no terminal:")
    print("\n" + mensagem)
    return False


# ─── Processamento completo de um lead ───────────────────────────────────────

def processar_lead(lead_raw: dict) -> dict:
    """
    Fluxo completo: recebe dados brutos → qualifica → envia briefing.
    Returns: dict com lead + análise + status de envio.
    """
    # Garante campos obrigatórios
    lead = {**LEAD_VAZIO, **lead_raw}
    lead["data_hora"] = lead.get("data_hora") or datetime.now().strftime("%d/%m/%Y %H:%M")

    print(f"\n[leads] Processando lead: {lead.get('nome','—')} ({lead.get('email','—')})")
    print(f"[leads] Qualificando com Qwen ({QWEN_MODEL})...")

    analise = qualificar_com_qwen(lead)
    print(f"[leads] Fit score: {analise.get('fit_score','—')}/10 | Urgência: {analise.get('urgencia','—')}")

    briefing = formatar_briefing_lead(lead, analise)
    enviado = enviar_briefing(briefing)

    # Salva log do lead
    _salvar_log_lead(lead, analise, enviado)

    return {"lead": lead, "analise": analise, "enviado": enviado}


def _salvar_log_lead(lead: dict, analise: dict, enviado: bool):
    """Salva lead qualificado em JSON para histórico."""
    log_dir = Path(__file__).parent / "logs"
    log_dir.mkdir(exist_ok=True)
    log_file = log_dir / "leads.jsonl"

    entrada = {
        "timestamp": datetime.now().isoformat(),
        "lead": lead,
        "analise": analise,
        "enviado": enviado,
    }
    with open(log_file, "a", encoding="utf-8") as f:
        f.write(json.dumps(entrada, ensure_ascii=False) + "\n")


# ─── Servidor webhook ─────────────────────────────────────────────────────────

def iniciar_servidor_webhook():
    """
    Inicia servidor Flask que recebe POSTs do formulário do site.
    O formulário deve fazer POST para http://localhost:8765/lead
    (use ngrok ou tunnel para expor para a internet).
    """
    try:
        from flask import Flask, request, jsonify
    except ImportError:
        print("[leads] Flask não instalado. Execute: pip install flask")
        print("  Alternativa: use --manual para qualificação interativa")
        sys.exit(1)

    import hmac
    import hashlib

    # Fail-closed: webhook exposto fora de loopback sem segredo e porta aberta
    # para a internet. Com host publico, a assinatura HMAC e obrigatoria.
    if LEAD_WEBHOOK_HOST not in ("127.0.0.1", "localhost", "::1") and not LEAD_WEBHOOK_SECRET:
        print("[leads] ERRO: LEAD_WEBHOOK_HOST fora de loopback exige LEAD_WEBHOOK_SECRET configurado.")
        sys.exit(1)

    app = Flask(__name__)

    @app.route("/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok", "servico": "YanOS Leads", "ts": datetime.now().isoformat()})

    @app.route("/lead", methods=["POST"])
    def receber_lead():
        # Valida assinatura se configurada
        if LEAD_WEBHOOK_SECRET:
            sig_recebida = request.headers.get("X-Sig", "")
            sig_esperada = hmac.new(
                LEAD_WEBHOOK_SECRET.encode(), request.data, hashlib.sha256
            ).hexdigest()
            if not hmac.compare_digest(sig_recebida, sig_esperada):
                return jsonify({"error": "Assinatura inválida"}), 403

        try:
            dados = request.get_json(force=True) or {}
        except Exception:
            dados = dict(request.form)

        resultado = processar_lead(dados)
        return jsonify({"ok": True, "fit_score": resultado["analise"].get("fit_score")}), 200

    print(f"\n[leads] Servidor iniciado na porta {LEAD_WEBHOOK_PORT}")
    print(f"  Endpoint: POST http://localhost:{LEAD_WEBHOOK_PORT}/lead")
    print(f"  Health:   GET  http://localhost:{LEAD_WEBHOOK_PORT}/health")
    print(f"  Para expor à internet: ngrok http {LEAD_WEBHOOK_PORT}")
    print(f"\n  Pressione Ctrl+C para parar.\n")

    app.run(host=LEAD_WEBHOOK_HOST, port=LEAD_WEBHOOK_PORT, debug=False)


# ─── Modo interativo ──────────────────────────────────────────────────────────

def modo_manual():
    """Qualificação interativa — você cola os dados, recebe o briefing."""
    print("\n=== QUALIFICADOR MANUAL DE LEADS ===")
    print("Preencha os dados do lead (ENTER para pular campo):\n")

    lead = {}
    campos = [
        ("nome",       "Nome completo"),
        ("email",      "E-mail"),
        ("telefone",   "Telefone/WhatsApp"),
        ("perfil",     "Perfil (empresario/executivo/familia/outro)"),
        ("patrimonio", "Faixa patrimonial (1-3 / 3-10 / 10-30 / 30+)"),
        ("objetivo",   "Objetivo (governanca/liquidez/alocacao/risco)"),
        ("mensagem",   "Mensagem do lead"),
    ]

    for chave, label in campos:
        valor = input(f"  {label}: ").strip()
        if valor:
            lead[chave] = valor

    if not lead.get("nome"):
        print("Nome obrigatório. Abortando.")
        return

    processar_lead(lead)


def lead_de_teste() -> dict:
    return {
        "nome": "Carlos Drummond Andrade",
        "email": "cda@exemplo.com.br",
        "telefone": "21999887766",
        "perfil": "empresario",
        "patrimonio": "10-30",
        "objetivo": "alocacao",
        "mensagem": "Tenho uma holding familiar com investimentos distribuídos entre CDBs de banco médio e alguns fundos multimercado. Gostaria de uma visão macro do portfólio e entender se faz sentido internacionalizar parte do patrimônio dado o cenário atual de juros e câmbio.",
        "origem": "site",
    }


# ─── CLI ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Qualificador de leads YanOS")
    parser.add_argument("--manual",  action="store_true", help="Modo interativo")
    parser.add_argument("--testar",  action="store_true", help="Processa lead de teste")
    parser.add_argument("--email",   action="store_true", help="Modo email (futuro)")
    args = parser.parse_args()

    if args.testar:
        print("[leads] Processando lead de TESTE...")
        resultado = processar_lead(lead_de_teste())
        print(f"\n✓ Fit score: {resultado['analise'].get('fit_score','—')}/10")
        return

    if args.manual:
        modo_manual()
        return

    if args.email:
        print("[leads] Modo email ainda não implementado. Use --manual ou o servidor webhook.")
        return

    # Padrão: servidor webhook
    iniciar_servidor_webhook()


if __name__ == "__main__":
    main()
