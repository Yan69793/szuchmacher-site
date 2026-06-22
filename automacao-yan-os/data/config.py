"""
config.py — YAN OS
Todas as variáveis de ambiente e constantes do sistema.
Edite o arquivo .env na raiz do projeto — nunca coloque senhas aqui.
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Carrega .env automaticamente se existir
_env_path = Path(__file__).parent.parent / ".env"
if _env_path.exists():
    load_dotenv(_env_path)

# ─── Diretórios ────────────────────────────────────────────────────────────
BASE_DIR      = Path(__file__).parent.parent
DATA_DIR      = BASE_DIR / "data"
TEMPLATE_DIR  = BASE_DIR / "template"
OUTPUT_DIR    = BASE_DIR / "output"
LOG_DIR       = BASE_DIR / "logs"

TEMPLATE_PPTX = TEMPLATE_DIR / "Fechamento_template.pptx"
DADOS_JSON    = DATA_DIR / "ultimo_dados.json"
LOG_FILE      = LOG_DIR / "yan_os.log"

# ─── APIs de IA ────────────────────────────────────────────────────────────
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
QWEN_API_KEY      = os.environ.get("QWEN_API_KEY", "")
QWEN_BASE_URL     = "https://dashscope.aliyuncs.com/compatible-mode/v1"
QWEN_MODEL        = os.environ.get("QWEN_MODEL", "qwen-plus")
MODELO_CLAUDE     = os.environ.get("MODELO_CLAUDE", "claude-sonnet-4-6")

# ─── Servidor (HostGator — dados pré-preenchidos) ──────────────────────────
SITE_METHOD      = os.environ.get("SITE_METHOD", "ftp")
SITE_HOST        = os.environ.get("SITE_HOST", "szuchmacher.com.br")
SITE_FTP_HOST    = os.environ.get("SITE_FTP_HOST", "69.6.212.94")   # IP direto (mais estável)
SITE_USER        = os.environ.get("SITE_USER", "hg545631")
SITE_PASS        = os.environ.get("SITE_PASS", "")                   # preencher no .env
SITE_REMOTE_DIR  = os.environ.get("SITE_REMOTE_DIR", "/home1/hg545631/public_html/")
SITE_URL         = os.environ.get("SITE_URL", "https://szuchmacher.com.br")

# Webhook (alternativa ao FTP)
SITE_WEBHOOK_URL    = os.environ.get("SITE_WEBHOOK_URL", "")
SITE_WEBHOOK_SECRET = os.environ.get("SITE_WEBHOOK_SECRET", "yan_os_webhook_2026")

# ─── Notificações ──────────────────────────────────────────────────────────
# Telegram (recomendado — gratuito, sem limite de mensagens)
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID   = os.environ.get("TELEGRAM_CHAT_ID", "")

# CallMeBot — WhatsApp (CALLMEBOT_PHONE + CALLMEBOT_APIKEY) ou Telegram (CALLMEBOT_USER)
CALLMEBOT_PHONE    = os.environ.get("CALLMEBOT_PHONE", "")
CALLMEBOT_APIKEY   = os.environ.get("CALLMEBOT_APIKEY", "")
CALLMEBOT_USER     = os.environ.get("CALLMEBOT_USER", "")

# Twilio WhatsApp (produção)
TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN  = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM        = os.environ.get("TWILIO_FROM", "")
TWILIO_TO          = os.environ.get("TWILIO_TO", "")

# ─── Monitor de mercado ─────────────────────────────────────────────────────
MONITOR_THRESHOLDS = {
    "ibovespa_var_pct": float(os.environ.get("THR_IBOV",  "2.0")),
    "dolar_nivel":      float(os.environ.get("THR_DOLAR_NIVEL", "5.90")),
    "dolar_var_pct":    float(os.environ.get("THR_DOLAR_VAR",   "1.5")),
    "sp500_var_pct":    float(os.environ.get("THR_SP500",  "1.5")),
    "wti_var_pct":      float(os.environ.get("THR_WTI",    "5.0")),
    "ouro_var_pct":     float(os.environ.get("THR_OURO",   "2.0")),
    "treasury_bps":     float(os.environ.get("THR_TREASURY","10")),
}
MONITOR_INTERVALO_MIN  = int(os.environ.get("MONITOR_INTERVALO", "15"))
MONITOR_HORARIO_INICIO = os.environ.get("MONITOR_INICIO", "09:00")
MONITOR_HORARIO_FIM    = os.environ.get("MONITOR_FIM",    "18:45")

# ─── Qualificador de leads ──────────────────────────────────────────────────
LEAD_WEBHOOK_PORT   = int(os.environ.get("LEAD_PORT", "8765"))
LEAD_WEBHOOK_SECRET = os.environ.get("LEAD_SECRET", "yan_os_leads_2026")

# ─── Helpers ───────────────────────────────────────────────────────────────
def is_interativo() -> bool:
    """True somente se houver terminal interativo (stdin é tty).
    Sob Task Scheduler / pipe / cron retorna False — pula prompts e usa defaults."""
    try:
        return sys.stdin is not None and sys.stdin.isatty()
    except Exception:
        return False


def garantir_dirs():
    for d in [DATA_DIR, TEMPLATE_DIR, OUTPUT_DIR, LOG_DIR]:
        d.mkdir(parents=True, exist_ok=True)


def diagnostico():
    """Imprime status de todas as configurações."""
    ok  = lambda v: "✓" if v else "✗"
    print("\n=== YAN OS — DIAGNÓSTICO DE CONFIGURAÇÃO ===")
    print(f"\n  Claude API:        {ok(ANTHROPIC_API_KEY)} ANTHROPIC_API_KEY")
    print(f"  Qwen API:          {ok(QWEN_API_KEY)} QWEN_API_KEY")
    print(f"\n  Telegram:          {ok(TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID)} BOT_TOKEN + CHAT_ID")
    print(f"  CallMeBot:         {ok(CALLMEBOT_PHONE and CALLMEBOT_APIKEY)} PHONE + APIKEY")
    print(f"  Twilio:            {ok(TWILIO_ACCOUNT_SID)} ACCOUNT_SID")
    print(f"\n  E-mail SMTP:       {ok(os.environ.get('EMAIL_REMETENTE') and os.environ.get('EMAIL_SENHA'))} EMAIL_REMETENTE + EMAIL_SENHA")
    print(f"  Destinatarios:     {ok(os.environ.get('DESTINATARIOS'))} DESTINATARIOS")
    print(f"\n  FTP host:          {SITE_FTP_HOST}")
    print(f"  FTP user:          {SITE_USER}")
    print(f"  FTP senha:         {ok(SITE_PASS)} SITE_PASS")
    print(f"  FTP dir:           {SITE_REMOTE_DIR}")
    print(f"\n  Template PPTX:     {ok(TEMPLATE_PPTX.exists())} {TEMPLATE_PPTX.name}")
    print(f"  Arquivo de dados:  {ok(DADOS_JSON.exists())} ultimo_dados.json")
    print(f"\n  Monitor intervalo: {MONITOR_INTERVALO_MIN} min")
    print(f"  Monitor horário:   {MONITOR_HORARIO_INICIO} – {MONITOR_HORARIO_FIM}")
    print("=" * 46)


if __name__ == "__main__":
    diagnostico()
