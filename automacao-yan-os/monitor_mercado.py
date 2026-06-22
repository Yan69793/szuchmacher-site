"""
monitor_mercado.py
Monitor de mercado em tempo real com Qwen + alertas WhatsApp.

Roda em background durante o pregão (09:00–18:45 BRT).
Checa preços a cada MONITOR_INTERVALO_MIN minutos.
Usa Qwen para análise rápida (custo baixo, velocidade alta).
Envia alerta via WhatsApp apenas quando threshold é superado.

Uso:
  python monitor_mercado.py              # roda o loop completo
  python monitor_mercado.py --testar     # envia alerta de teste
  python monitor_mercado.py --agora      # uma verificação imediata
"""

import sys
import time
import json
import argparse
import requests
import urllib.parse
import schedule
import threading
from datetime import datetime, time as dtime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "data"))
from config import (
    QWEN_API_KEY, QWEN_BASE_URL, QWEN_MODEL,
    CALLMEBOT_PHONE, CALLMEBOT_APIKEY, CALLMEBOT_USER,
    TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM, TWILIO_TO,
    TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
    MONITOR_THRESHOLDS, MONITOR_INTERVALO_MIN,
    MONITOR_HORARIO_INICIO, MONITOR_HORARIO_FIM
)


# ─── Estado do monitor ────────────────────────────────────────────────────────

class EstadoMonitor:
    def __init__(self):
        self.precos_anteriores = {}
        self.alertas_enviados = set()  # evita duplicatas na mesma sessão
        self.ultima_checagem = None
        self.total_alertas = 0


estado = EstadoMonitor()


# ─── Coleta de preços em tempo real ──────────────────────────────────────────

def coletar_precos_live() -> dict:
    """
    Coleta preços intradiários de múltiplas fontes públicas.
    Prioriza velocidade sobre completude.
    """
    precos = {}
    erros = []

    # ── Ibovespa e Dólar via Yahoo Finance ──────────────────────────────────
    tickers = {
        "ibovespa": "^BVSP",
        "sp500":    "^GSPC",
        "nasdaq":   "^IXIC",
        "dolar":    "BRL=X",
        "wti":      "CL=F",
        "ouro":     "GC=F",
    }
    for nome, ticker in tickers.items():
        try:
            url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1m&range=1d"
            resp = requests.get(url, timeout=8,
                                headers={"User-Agent": "Mozilla/5.0"})
            if resp.status_code == 200:
                data = resp.json()
                meta = data.get("chart", {}).get("result", [{}])[0].get("meta", {})
                preco_atual = meta.get("regularMarketPrice", 0)
                preco_fechamento_ant = meta.get("previousClose", 0)
                if preco_atual and preco_fechamento_ant:
                    var_pct = ((preco_atual - preco_fechamento_ant) / preco_fechamento_ant) * 100
                    precos[nome] = {
                        "preco": round(preco_atual, 2),
                        "var_pct": round(var_pct, 2),
                        "sinal": "+" if var_pct >= 0 else "",
                    }
        except Exception as e:
            erros.append(f"{nome}: {e}")

    if erros:
        print(f"[monitor] Avisos coleta: {'; '.join(erros[:3])}")

    return precos


# ─── Análise Qwen ─────────────────────────────────────────────────────────────

def analisar_com_qwen(precos: dict, gatilhos: list) -> str:
    """
    Usa Qwen para gerar análise concisa do movimento de mercado.
    Custo: ~0,001 USD por análise. Velocidade: <3 segundos.
    """
    if not QWEN_API_KEY:
        return _analise_simples(precos, gatilhos)

    # Formata dados para o prompt
    linhas_precos = []
    for nome, dados in precos.items():
        sinal = dados.get("sinal", "")
        var = dados.get("var_pct", 0)
        preco = dados.get("preco", 0)
        linhas_precos.append(f"  {nome}: {preco} ({sinal}{var:.2f}%)")

    prompt = f"""Você é analista macro sênior. Analise em 2-3 frases curtas (máx 280 chars) os movimentos de mercado abaixo. Tom: objetivo, institucional. Sem recomendações.

Horário: {datetime.now().strftime('%H:%M')} BRT
Gatilhos ativados: {', '.join(gatilhos)}
Preços intradiários:
{chr(10).join(linhas_precos)}

Responda apenas com a análise, sem introdução."""

    try:
        from openai import OpenAI
        client = OpenAI(api_key=QWEN_API_KEY, base_url=QWEN_BASE_URL)
        resp = client.chat.completions.create(
            model=QWEN_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=120,
            temperature=0.3,
        )
        return resp.choices[0].message.content.strip()
    except ImportError:
        print("[monitor] openai não instalado. Usando análise simples. pip install openai")
        return _analise_simples(precos, gatilhos)
    except Exception as e:
        print(f"[monitor] Qwen indisponível: {e}")
        return _analise_simples(precos, gatilhos)


def _analise_simples(precos: dict, gatilhos: list) -> str:
    """Análise sem IA — fallback baseado em regras."""
    partes = []
    for nome, dados in precos.items():
        var = dados.get("var_pct", 0)
        preco = dados.get("preco", 0)
        sinal = "+" if var >= 0 else ""
        if abs(var) >= 1.0:
            partes.append(f"{nome.upper()} {sinal}{var:.2f}% ({preco})")
    return "Movimentos relevantes: " + " | ".join(partes) if partes else "Sem movimentos relevantes."


# ─── Sistema de alertas ───────────────────────────────────────────────────────

def detectar_gatilhos(precos: dict) -> list:
    """
    Verifica quais thresholds foram ultrapassados.
    Retorna lista de strings descrevendo cada gatilho.
    """
    gatilhos = []
    th = MONITOR_THRESHOLDS

    ibov = precos.get("ibovespa", {})
    if abs(ibov.get("var_pct", 0)) >= th["ibovespa_var_pct"]:
        sinal = "+" if ibov["var_pct"] >= 0 else ""
        gatilhos.append(f"Ibovespa {sinal}{ibov['var_pct']:.2f}%")

    dolar = precos.get("dolar", {})
    if dolar.get("preco", 0) >= th["dolar_nivel"]:
        gatilhos.append(f"Dólar R${dolar['preco']:.2f} (acima de {th['dolar_nivel']})")
    if abs(dolar.get("var_pct", 0)) >= th["dolar_var_pct"]:
        sinal = "+" if dolar["var_pct"] >= 0 else ""
        gatilhos.append(f"Dólar {sinal}{dolar['var_pct']:.2f}%")

    sp500 = precos.get("sp500", {})
    if abs(sp500.get("var_pct", 0)) >= th["sp500_var_pct"]:
        sinal = "+" if sp500["var_pct"] >= 0 else ""
        gatilhos.append(f"S&P 500 {sinal}{sp500['var_pct']:.2f}%")

    wti = precos.get("wti", {})
    if abs(wti.get("var_pct", 0)) >= th["wti_var_pct"]:
        sinal = "+" if wti["var_pct"] >= 0 else ""
        gatilhos.append(f"WTI {sinal}{wti['var_pct']:.2f}%")

    ouro = precos.get("ouro", {})
    if abs(ouro.get("var_pct", 0)) >= th["ouro_var_pct"]:
        sinal = "+" if ouro["var_pct"] >= 0 else ""
        gatilhos.append(f"Ouro {sinal}{ouro['var_pct']:.2f}%")

    return gatilhos


def formatar_mensagem_alerta(gatilhos: list, analise: str, precos: dict) -> str:
    """Formata mensagem de alerta para WhatsApp."""
    hora = datetime.now().strftime("%H:%M")
    ibov = precos.get("ibovespa", {})
    dolar = precos.get("dolar", {})

    linhas = [
        f"⚡ *ALERTA DE MERCADO* — {hora} BRT",
        "",
        f"*Gatilhos:* {', '.join(gatilhos)}",
        "",
        f"Ibov: {ibov.get('preco', '—')} pts ({ibov.get('sinal','')}{ibov.get('var_pct','—'):.2f}%)",
        f"Dólar: R${dolar.get('preco', '—')} ({dolar.get('sinal','')}{dolar.get('var_pct','—'):.2f}%)",
        "",
        f"_{analise}_",
        "",
        "— YanOS Monitor",
    ]
    return "\n".join(linhas)


# ─── Canais de envio ──────────────────────────────────────────────────────────

def enviar_callmebot(mensagem: str) -> bool:
    """Envia via CallMeBot — Telegram (CALLMEBOT_USER) ou WhatsApp (PHONE + APIKEY)."""
    msg_encoded = urllib.parse.quote(mensagem)
    if CALLMEBOT_USER:
        url = f"https://api.callmebot.com/text.php?user=@{CALLMEBOT_USER}&text={msg_encoded}"
    elif CALLMEBOT_PHONE and CALLMEBOT_APIKEY:
        url = f"https://api.callmebot.com/whatsapp.php?phone={CALLMEBOT_PHONE}&text={msg_encoded}&apikey={CALLMEBOT_APIKEY}"
    else:
        return False
    try:
        resp = requests.get(url, timeout=15)
        if resp.status_code == 200:
            print(f"  ✓ CallMeBot enviado")
            return True
        print(f"  CallMeBot: {resp.status_code} — {resp.text[:100]}")
        return False
    except Exception as e:
        print(f"  ERRO CallMeBot: {e}")
        return False


def enviar_twilio(mensagem: str) -> bool:
    """Envia via Twilio WhatsApp API (produção)."""
    if not all([TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM, TWILIO_TO]):
        return False
    try:
        url = f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json"
        resp = requests.post(url,
            data={"From": TWILIO_FROM, "To": TWILIO_TO, "Body": mensagem},
            auth=(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN),
            timeout=15
        )
        if resp.status_code in (200, 201):
            print(f"  ✓ Twilio enviado: {resp.json().get('sid','')}")
            return True
        print(f"  Twilio: {resp.status_code} — {resp.text[:100]}")
        return False
    except Exception as e:
        print(f"  ERRO Twilio: {e}")
        return False


def enviar_telegram(mensagem: str) -> bool:
    """Envia via Telegram Bot (alternativa confiável)."""
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        return False
    try:
        url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
        resp = requests.post(url, json={
            "chat_id": TELEGRAM_CHAT_ID,
            "text": mensagem,
            "parse_mode": "Markdown"
        }, timeout=15)
        if resp.status_code == 200:
            print(f"  ✓ Telegram enviado")
            return True
        print(f"  Telegram: {resp.status_code}")
        return False
    except Exception as e:
        print(f"  ERRO Telegram: {e}")
        return False


def enviar_alerta(mensagem: str) -> bool:
    """
    Tenta enviar alerta pelos canais configurados.
    Sequência: Telegram → CallMeBot → Twilio.
    """
    print(f"[monitor] Enviando alerta...")

    # Telegram é o mais confiável para alta frequência
    if enviar_telegram(mensagem):
        return True
    # CallMeBot como segunda opção
    if enviar_callmebot(mensagem):
        return True
    # Twilio como fallback premium
    if enviar_twilio(mensagem):
        return True

    print("[monitor] AVISO: Nenhum canal de alerta configurado.")
    print("  Configure: CALLMEBOT_PHONE + CALLMEBOT_APIKEY, ou")
    print("             TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID, ou")
    print("             TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM + TWILIO_TO")
    return False


# ─── Loop principal ───────────────────────────────────────────────────────────

def esta_em_horario_pregao() -> bool:
    """Verifica se estamos no horário do pregão."""
    agora = datetime.now().time()
    h_inicio = dtime(*[int(x) for x in MONITOR_HORARIO_INICIO.split(":")])
    h_fim    = dtime(*[int(x) for x in MONITOR_HORARIO_FIM.split(":")])
    return h_inicio <= agora <= h_fim


def verificar_mercado():
    """
    Executa uma verificação de mercado.
    Chamada pelo scheduler a cada MONITOR_INTERVALO_MIN minutos.
    """
    if not esta_em_horario_pregao():
        return

    hora = datetime.now().strftime("%H:%M")
    print(f"\n[monitor] {hora} — verificando mercado...")
    estado.ultima_checagem = datetime.now()

    precos = coletar_precos_live()
    if not precos:
        print("[monitor] Sem preços disponíveis.")
        return

    gatilhos = detectar_gatilhos(precos)

    # Resumo sempre (sem alerta)
    ibov = precos.get("ibovespa", {})
    dolar = precos.get("dolar", {})
    print(f"  Ibov: {ibov.get('preco','—')} ({ibov.get('sinal','')}{ibov.get('var_pct',0):.2f}%)")
    print(f"  Dólar: R${dolar.get('preco','—')} ({dolar.get('sinal','')}{dolar.get('var_pct',0):.2f}%)")

    if not gatilhos:
        print(f"  Sem gatilhos ativados.")
        return

    # Evita alertas duplicados em janela de 30 minutos
    chave_alerta = "|".join(sorted(gatilhos))
    if chave_alerta in estado.alertas_enviados:
        print(f"  Gatilhos já notificados nesta sessão: {gatilhos}")
        return

    print(f"  ⚡ Gatilhos: {gatilhos}")

    analise = analisar_com_qwen(precos, gatilhos)
    print(f"  Análise Qwen: {analise[:100]}...")

    mensagem = formatar_mensagem_alerta(gatilhos, analise, precos)
    ok = enviar_alerta(mensagem)

    if ok:
        estado.alertas_enviados.add(chave_alerta)
        estado.total_alertas += 1
        # Limpa cache de alertas a cada 30 minutos para não suprimir indefinidamente
        threading.Timer(1800, lambda: estado.alertas_enviados.discard(chave_alerta)).start()


def rodar_monitor():
    """Inicia o loop de monitoramento contínuo."""
    print(f"\n{'='*50}")
    print("YAN OS — MONITOR DE MERCADO")
    print(f"{'='*50}")
    print(f"Intervalo: a cada {MONITOR_INTERVALO_MIN} minutos")
    print(f"Horário:   {MONITOR_HORARIO_INICIO} – {MONITOR_HORARIO_FIM} BRT")
    print(f"Modelo IA: Qwen ({QWEN_MODEL})")
    print(f"Alertas configurados:")
    print(f"  Telegram: {'✓' if TELEGRAM_BOT_TOKEN else '✗'}")
    print(f"  CallMeBot: {'✓' if CALLMEBOT_PHONE else '✗'}")
    print(f"  Twilio:    {'✓' if TWILIO_ACCOUNT_SID else '✗'}")
    print(f"{'='*50}\n")

    schedule.every(MONITOR_INTERVALO_MIN).minutes.do(verificar_mercado)

    # Executa imediatamente na inicialização
    verificar_mercado()

    while True:
        schedule.run_pending()
        time.sleep(30)


# ─── CLI ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Monitor de mercado YanOS")
    parser.add_argument("--testar",  action="store_true", help="Envia alerta de teste")
    parser.add_argument("--agora",   action="store_true", help="Uma verificação imediata")
    args = parser.parse_args()

    if args.testar:
        print("[monitor] Enviando alerta de TESTE...")
        msg = (
            "⚡ *ALERTA DE MERCADO* — TESTE\n\n"
            "Este é um alerta de teste do YanOS Monitor.\n"
            "Se você recebeu esta mensagem, o canal está configurado corretamente.\n\n"
            "— YanOS Monitor"
        )
        ok = enviar_alerta(msg)
        print("✓ Teste enviado!" if ok else "✗ Falha no envio. Verifique as configurações.")
        return

    if args.agora:
        verificar_mercado()
        return

    rodar_monitor()


if __name__ == "__main__":
    main()
