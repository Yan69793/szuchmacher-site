#!/usr/bin/env python3
"""
lead_nurture_agent.py — Agent 3: Lead Nurture Agent
Follow-up automático de leads qualificados sem resposta em 48h.

Fluxo:
  1. Lê logs/leads.jsonl (gerado pelo qualificador_leads.py)
  2. Filtra fit_score >= limiar e idade >= 48h
  3. Gera mensagem personalizada (Qwen ou template)
  4. Envia e-mail ao lead + avisa Yan via CallMeBot/Telegram
  5. Registra estado em data/leads_nurture_state.json

Uso:
  python agents/lead_nurture_agent.py
  python agents/lead_nurture_agent.py --dry-run
  python agents/lead_nurture_agent.py --testar
"""

from __future__ import annotations

import argparse
import json
import os
import smtplib
import sys
import urllib.parse
from datetime import datetime, timedelta, timezone
from email.mime.text import MIMEText
from pathlib import Path

import requests

_AGENTS_DIR = Path(__file__).parent
_BASE_DIR = _AGENTS_DIR.parent
_LOG_FILE = _BASE_DIR / "logs" / "leads.jsonl"
_STATE_FILE = _BASE_DIR / "data" / "leads_nurture_state.json"
_LOG_DIR = _BASE_DIR / "logs"

sys.path.insert(0, str(_BASE_DIR / "data"))
sys.path.insert(0, str(_BASE_DIR))

from config import (  # noqa: E402
    QWEN_API_KEY,
    QWEN_BASE_URL,
    QWEN_MODEL,
    CALLMEBOT_PHONE,
    CALLMEBOT_APIKEY,
    CALLMEBOT_USER,
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID,
)

EMAIL_REMETENTE = os.environ.get("EMAIL_REMETENTE", "")
EMAIL_SENHA = os.environ.get("EMAIL_SENHA", "")
EMAIL_SMTP_HOST = os.environ.get("EMAIL_SMTP_HOST", "smtp.gmail.com")
EMAIL_SMTP_PORT = int(os.environ.get("EMAIL_SMTP_PORT", "587"))

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

NURTURE_HOURS = 48
MIN_FIT_SCORE = 6

PROMPT_NURTURE = """Você escreve follow-up de wealth advisor brasileiro (tom sóbrio, sem promessa de retorno, CVM 20/2021).

Lead não respondeu há 48h após o primeiro contato. Escreva um e-mail curto (máx. 120 palavras) em português do Brasil.

Regras:
- Personalize com o nome e o objetivo declarado
- Uma pergunta aberta no final
- Sem linguagem de vendedor agressivo
- Assinatura: Yan Szuchmacher · Szuchmacher Consultoria

Responda APENAS JSON:
{{"assunto": "...", "corpo": "..."}}

DADOS:
Nome: {nome}
Email: {email}
Perfil: {perfil}
Patrimônio: {patrimonio}
Objetivo: {objetivo}
Fit score: {fit_score}/10
Urgência: {urgencia}
Gancho anterior: {gancho}
"""


def log(msg: str) -> None:
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    try:
        _LOG_DIR.mkdir(exist_ok=True)
        path = _LOG_DIR / f"lead_nurture_{datetime.now():%Y%m%d}.log"
        with open(path, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


def load_state() -> dict:
    if not _STATE_FILE.exists():
        return {"nurtured": {}}
    try:
        return json.loads(_STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {"nurtured": {}}


def save_state(state: dict) -> bool:
    _STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    # Escrita atomica: um crash no meio do write nao pode corromper o estado
    # de "ja enviado" e provocar reenvio em lote na proxima execucao.
    tmp = _STATE_FILE.with_suffix(".json.tmp")
    try:
        tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(_STATE_FILE)
        return True
    except Exception as e:
        log(f"ERRO ao salvar estado: {e}")
        return False


def lead_key(lead: dict) -> str:
    email = (lead.get("email") or "").strip().lower()
    if email:
        return f"email:{email}"
    return f"nome:{(lead.get('nome') or '').strip().lower()}"


def parse_ts(raw: str) -> datetime | None:
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except Exception:
        pass
    for fmt in ("%d/%m/%Y %H:%M", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(raw, fmt)
        except Exception:
            continue
    return None


def load_leads() -> list[dict]:
    if not _LOG_FILE.exists():
        return []
    entries = []
    for line in _LOG_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            entries.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return entries


def gerar_mensagem(lead: dict, analise: dict) -> dict:
    fallback = {
        "assunto": f"{lead.get('nome', '').split()[0] or 'Olá'} — retomando nosso contato",
        "corpo": (
            f"Olá {lead.get('nome', '')},\n\n"
            f"Vi seu interesse em {analise.get('objetivo_principal', lead.get('objetivo', 'gestão patrimonial'))} "
            f"e queria retomar a conversa com calma.\n\n"
            f"Faz sentido agendarmos 20 minutos esta semana para entender seu contexto?\n\n"
            f"Abraço,\nYan Szuchmacher\nSzuchmacher Consultoria"
        ),
    }
    if not QWEN_API_KEY:
        return fallback

    prompt = PROMPT_NURTURE.format(
        nome=lead.get("nome", "—"),
        email=lead.get("email", "—"),
        perfil=lead.get("perfil", "—"),
        patrimonio=lead.get("patrimonio", "—"),
        objetivo=lead.get("objetivo", "—"),
        fit_score=analise.get("fit_score", "—"),
        urgencia=analise.get("urgencia", "—"),
        gancho=analise.get("gancho_conversa", "—"),
    )
    try:
        from openai import OpenAI

        client = OpenAI(api_key=QWEN_API_KEY, base_url=QWEN_BASE_URL)
        resp = client.chat.completions.create(
            model=QWEN_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=400,
            temperature=0.4,
            response_format={"type": "json_object"},
        )
        data = json.loads(resp.choices[0].message.content.strip())
        if data.get("assunto") and data.get("corpo"):
            return data
    except Exception as e:
        log(f"Qwen indisponível ({e}) — usando template.")
    return fallback


def enviar_email(dest: str, assunto: str, corpo: str, dry_run: bool) -> bool:
    if not dest:
        log("Lead sem e-mail — pulando envio.")
        return False
    if not EMAIL_REMETENTE or not EMAIL_SENHA:
        log("EMAIL_REMETENTE/SENHA ausentes — pulando envio.")
        return False
    if dry_run:
        log(f"DRY-RUN e-mail → {dest} | {assunto}")
        return True

    msg = MIMEText(corpo, "plain", "utf-8")
    msg["Subject"] = assunto
    msg["From"] = EMAIL_REMETENTE
    msg["To"] = dest

    try:
        with smtplib.SMTP(EMAIL_SMTP_HOST, int(EMAIL_SMTP_PORT), timeout=30) as srv:
            srv.starttls()
            srv.login(EMAIL_REMETENTE, EMAIL_SENHA)
            srv.sendmail(EMAIL_REMETENTE, [dest], msg.as_string())
        log(f"E-mail enviado → {dest}")
        return True
    except Exception as e:
        log(f"ERRO e-mail: {e}")
        return False


def notificar_yan(texto: str, dry_run: bool) -> bool:
    if dry_run:
        log("DRY-RUN notificação Yan")
        print(texto)
        return True

    if TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID:
        try:
            r = requests.post(
                f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                json={"chat_id": TELEGRAM_CHAT_ID, "text": texto, "parse_mode": "Markdown"},
                timeout=15,
            )
            if r.status_code == 200:
                return True
        except Exception:
            pass

    msg_enc = urllib.parse.quote(texto)
    if CALLMEBOT_USER:
        url = f"https://api.callmebot.com/text.php?user=@{CALLMEBOT_USER}&text={msg_enc}"
    elif CALLMEBOT_PHONE and CALLMEBOT_APIKEY:
        url = f"https://api.callmebot.com/whatsapp.php?phone={CALLMEBOT_PHONE}&text={msg_enc}&apikey={CALLMEBOT_APIKEY}"
    else:
        log("Sem canal CallMeBot/Telegram — notificação no terminal.")
        print(texto)
        return False

    try:
        r = requests.get(url, timeout=15)
        return r.status_code == 200
    except Exception as e:
        log(f"ERRO notificação: {e}")
        return False


def candidatos(entries: list[dict], state: dict, now: datetime) -> list[dict]:
    cutoff = now - timedelta(hours=NURTURE_HOURS)
    nurtured = state.get("nurtured", {})
    out = []

    for entry in entries:
        lead = entry.get("lead") or {}
        analise = entry.get("analise") or {}
        ts = parse_ts(entry.get("timestamp", ""))
        if not ts:
            continue
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)

        key = lead_key(lead)
        if nurtured.get(key):
            continue
        if analise.get("fit_score", 0) < MIN_FIT_SCORE:
            continue
        if ts > cutoff:
            continue
        if not (lead.get("email") or "").strip():
            continue

        out.append({"key": key, "lead": lead, "analise": analise, "ts": ts.isoformat()})

    return out


def processar(dry_run: bool = False) -> int:
    now = datetime.now(timezone.utc)
    state = load_state()
    entries = load_leads()
    items = candidatos(entries, state, now)

    log(f"Leads no log: {len(entries)} | Candidatos nurture (>{NURTURE_HOURS}h, fit>={MIN_FIT_SCORE}): {len(items)}")

    if not items:
        return 0

    sent = 0
    for item in items:
        lead = item["lead"]
        analise = item["analise"]
        key = item["key"]
        nome = lead.get("nome", "Lead")
        log(f"Processando nurture: {nome} ({lead.get('email', '')})")

        msg = gerar_mensagem(lead, analise)
        ok_email = enviar_email(lead.get("email", ""), msg["assunto"], msg["corpo"], dry_run)

        # A notificacao reflete o resultado real do envio: antes, o aviso de
        # "enviado" saia mesmo com SMTP falhando, falso positivo que escondia
        # lead sem nurture.
        if ok_email:
            aviso = (
                f"📬 *Lead Nurture enviado*\n"
                f"*{nome}* · {lead.get('email', '')}\n"
                f"Fit {analise.get('fit_score', '—')}/10 · {analise.get('urgencia', '—')}\n"
                f"Assunto: _{msg['assunto']}_"
            )
        else:
            aviso = (
                f"⚠️ *Lead Nurture FALHOU*\n"
                f"*{nome}* · {lead.get('email', '')}\n"
                f"Fit {analise.get('fit_score', '—')}/10 · {analise.get('urgencia', '—')}\n"
                f"Assunto: _{msg['assunto']}_"
            )
        notificar_yan(aviso, dry_run)

        if ok_email or dry_run:
            state.setdefault("nurtured", {})[key] = {
                "sent_at": now.isoformat(),
                "email": lead.get("email", ""),
                "assunto": msg["assunto"],
                "dry_run": dry_run,
            }
            sent += 1

    if not dry_run:
        if not save_state(state):
            # Estado nao persistido = risco de reenvio em lote na proxima
            # execucao. Nao pode sair como sucesso silencioso.
            log("ERRO: estado nao persistido; a proxima execucao pode reenviar leads.")
            return -1
    else:
        log(f"DRY-RUN: {sent} nurture(s) simulados (estado não salvo).")

    return sent


def lead_teste() -> None:
    """Insere lead fictício antigo no log para teste de nurture."""
    _LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    ts = (datetime.now(timezone.utc) - timedelta(hours=72)).isoformat()
    entrada = {
        "timestamp": ts,
        "lead": {
            "nome": "Ana Teste Nurture",
            "email": "yan@szuchmacher.com.br",
            "telefone": "21999999999",
            "perfil": "executivo",
            "patrimonio": "10-30",
            "objetivo": "alocacao",
            "origem": "teste_nurture",
        },
        "analise": {
            "fit_score": 8,
            "urgencia": "media",
            "objetivo_principal": "revisão de alocação macro",
            "gancho_conversa": "Vi seu interesse em alocação — posso ajudar com um diagnóstico inicial.",
        },
        "enviado": True,
    }
    with open(_LOG_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(entrada, ensure_ascii=False) + "\n")
    log("Lead de teste inserido em logs/leads.jsonl")


def main() -> int:
    parser = argparse.ArgumentParser(description="Agent 3 — Lead Nurture")
    parser.add_argument("--dry-run", action="store_true", help="Simula sem enviar e-mail nem salvar estado")
    parser.add_argument("--testar", action="store_true", help="Insere lead fictício + dry-run")
    args = parser.parse_args()

    if args.testar:
        lead_teste()
        processar(dry_run=True)
        return 0

    processar(dry_run=args.dry_run)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())