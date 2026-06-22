# data/enviador.py
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email.mime.text import MIMEText
from email import encoders
from pathlib import Path
from datetime import datetime
import os


def enviar_briefing(pdf_path: str, destinatarios: list[str]):
    """
    Envia o PDF do Fechamento de Mercado por email.
    Requer variáveis de ambiente:
      EMAIL_REMETENTE  — ex: yan@szuchmacher.com.br
      EMAIL_SENHA      — senha de app (Gmail) ou senha SMTP
      EMAIL_SMTP_HOST  — ex: smtp.gmail.com
      EMAIL_SMTP_PORT  — ex: 587
    """
    remetente   = os.environ["EMAIL_REMETENTE"]
    senha       = os.environ["EMAIL_SENHA"]
    smtp_host   = os.environ.get("EMAIL_SMTP_HOST", "smtp.gmail.com")
    smtp_port   = int(os.environ.get("EMAIL_SMTP_PORT", 587))

    data_hoje   = datetime.now().strftime("%d/%m/%Y")
    nome_arquivo = Path(pdf_path).name

    msg = MIMEMultipart()
    msg["From"]    = remetente
    msg["To"]      = ", ".join(destinatarios)
    msg["Subject"] = f"Fechamento de Mercado — {data_hoje} | Mirabaud"

    corpo = (
        f"Prezados,\n\n"
        f"Segue em anexo o Fechamento de Mercado de {data_hoje}.\n\n"
        f"Atenciosamente,\nYan Szuchmacher\nMirabaud · Private Banking"
    )
    msg.attach(MIMEText(corpo, "plain", "utf-8"))

    # Anexa o PDF
    with open(pdf_path, "rb") as f:
        parte = MIMEBase("application", "octet-stream")
        parte.set_payload(f.read())
    encoders.encode_base64(parte)
    parte.add_header(
        "Content-Disposition",
        f'attachment; filename="{nome_arquivo}"'
    )
    msg.attach(parte)

    with smtplib.SMTP(smtp_host, smtp_port) as servidor:
        servidor.starttls()
        servidor.login(remetente, senha)
        servidor.sendmail(remetente, destinatarios, msg.as_string())

    print(f"[enviador] Email enviado para: {', '.join(destinatarios)}")


def destinatarios_do_env() -> list[str]:
    """Lê a lista de assinantes de DESTINATARIOS (separados por vírgula)."""
    raw = os.environ.get("DESTINATARIOS", "")
    return [e.strip() for e in raw.split(",") if e.strip()]


def enviar_briefing_auto(pdf_path: str) -> bool:
    """
    Lê destinatários e credenciais SMTP do ambiente e envia o PDF.
    Falha-soft: retorna False (sem exceção) se algo não estiver configurado.
    """
    dest = destinatarios_do_env()
    if not dest:
        print("[enviador] DESTINATARIOS vazio — pulando envio de e-mail.")
        return False
    if not os.environ.get("EMAIL_REMETENTE") or not os.environ.get("EMAIL_SENHA"):
        print("[enviador] EMAIL_REMETENTE/EMAIL_SENHA ausentes — pulando envio.")
        return False
    if not pdf_path or not Path(pdf_path).exists():
        print("[enviador] PDF inexistente — pulando envio.")
        return False
    try:
        enviar_briefing(pdf_path, dest)
        return True
    except Exception as e:
        print(f"[enviador] ERRO no envio: {e}")
        return False