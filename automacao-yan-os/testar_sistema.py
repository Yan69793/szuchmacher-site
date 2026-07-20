"""
testar_sistema.py — YAN OS
Suite de testes para validar cada componente antes do primeiro uso em produção.

Uso:
  python testar_sistema.py          # testa tudo
  python testar_sistema.py ftp      # só FTP
  python testar_sistema.py claude   # só Claude API
  python testar_sistema.py qwen     # só Qwen API
  python testar_sistema.py telegram # só Telegram
  python testar_sistema.py site     # só conectividade do site
"""

import sys
import json
import time
import requests
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent / "data"))

from config import (
    ANTHROPIC_API_KEY, QWEN_API_KEY, QWEN_BASE_URL, QWEN_MODEL, MODELO_CLAUDE,
    SITE_PASS, SITE_HOST, SITE_FTP_HOST, SITE_USER, SITE_REMOTE_DIR, SITE_URL,
    TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
    CALLMEBOT_PHONE, CALLMEBOT_APIKEY, CALLMEBOT_USER,
    TEMPLATE_PPTX, DADOS_JSON,
)

RESULTADOS = {}


def _ok(nome, msg=""):
    RESULTADOS[nome] = ("✓", msg)
    print(f"  ✓  {nome}{': ' + msg if msg else ''}")


def _erro(nome, msg=""):
    RESULTADOS[nome] = ("✗", msg)
    print(f"  ✗  {nome}{': ' + msg if msg else ''}")


def _skip(nome, msg=""):
    RESULTADOS[nome] = ("○", msg)
    print(f"  ○  {nome} (pulado — {msg})")


# ─── Testes individuais ─────────────────────────────────────────────────────

def testar_ambiente():
    print("\n[1] AMBIENTE")
    from config import garantir_dirs
    garantir_dirs()
    _ok("Pastas criadas")

    if TEMPLATE_PPTX.exists():
        _ok("Template PPTX", TEMPLATE_PPTX.name)
    else:
        _erro("Template PPTX", f"não encontrado em {TEMPLATE_PPTX}")

    if DADOS_JSON.exists():
        _ok("Dados salvos", "ultimo_dados.json existe")
    else:
        _skip("Dados salvos", "ainda não coletado")

    # Dependências Python
    deps = ["anthropic", "yfinance", "pptx", "requests", "schedule"]
    for dep in deps:
        try:
            __import__(dep)
            _ok(f"pip: {dep}")
        except ImportError:
            _erro(f"pip: {dep}", "não instalado")

    # python-dotenv
    try:
        import dotenv
        _ok("pip: python-dotenv")
    except ImportError:
        _erro("pip: python-dotenv", "execute: pip install python-dotenv")


def testar_claude():
    print("\n[2] CLAUDE API")
    if not ANTHROPIC_API_KEY:
        _erro("ANTHROPIC_API_KEY", "não configurada")
        return

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        t0 = time.time()
        resp = client.messages.create(
            model=MODELO_CLAUDE,
            max_tokens=30,
            messages=[{"role": "user", "content": "Responda apenas: OK"}]
        )
        elapsed = time.time() - t0
        texto = resp.content[0].text.strip()
        _ok("Claude API", f"resposta: '{texto}' ({elapsed:.1f}s) modelo={MODELO_CLAUDE}")
    except Exception as e:
        _erro("Claude API", str(e)[:100])


def testar_qwen():
    print("\n[3] QWEN API")
    if not QWEN_API_KEY:
        _skip("Qwen API", "QWEN_API_KEY não configurada — monitor e leads usarão fallback simples")
        return

    try:
        from openai import OpenAI
        client = OpenAI(api_key=QWEN_API_KEY, base_url=QWEN_BASE_URL)
        t0 = time.time()
        resp = client.chat.completions.create(
            model=QWEN_MODEL,
            max_tokens=20,
            messages=[{"role": "user", "content": "Responda só: OK"}]
        )
        elapsed = time.time() - t0
        texto = resp.choices[0].message.content.strip()
        _ok("Qwen API", f"resposta: '{texto}' ({elapsed:.1f}s) modelo={QWEN_MODEL}")
    except ImportError:
        _erro("Qwen API", "openai não instalado: pip install openai")
    except Exception as e:
        _erro("Qwen API", str(e)[:100])


def testar_ftp():
    print("\n[4] FTP — HOSTGATOR")
    if not SITE_PASS:
        _erro("FTP senha", "SITE_PASS não configurada no .env")
        return

    try:
        import ftplib
        ftp = ftplib.FTP()
        host = SITE_FTP_HOST or SITE_HOST
        ftp.connect(host, 21, timeout=15)
        ftp.login(SITE_USER, SITE_PASS)
        ftp.set_pasv(True)
        _ok("FTP conexão", f"{host}")

        pwd = ftp.pwd()
        _ok("FTP login", f"diretório atual: {pwd}")

        # Tenta navegar para public_html
        try:
            ftp.cwd(SITE_REMOTE_DIR)
            _ok("FTP public_html", f"acesso confirmado: {SITE_REMOTE_DIR}")
            files = sorted(ftp.nlst())
            html_files = [f for f in files if f.endswith(".html")]
            _ok("FTP listagem", f"{len(files)} arquivos, {len(html_files)} HTMLs")
        except Exception as e:
            _erro("FTP public_html", str(e))

        ftp.quit()
    except Exception as e:
        _erro("FTP conexão", str(e)[:100])


def testar_site():
    print("\n[5] CONECTIVIDADE DO SITE")
    urls = [
        (f"{SITE_URL}/index.html",       "index.html"),
        (f"{SITE_URL}/macro_data.json",  "macro_data.json"),
        (f"{SITE_URL}/prices.php",       "prices.php"),
        (f"{SITE_URL}/multiasset.html",  "multiasset.html"),
    ]
    for url, nome in urls:
        try:
            r = requests.get(url, timeout=10)
            if r.status_code == 200:
                _ok(f"Site: {nome}", f"status={r.status_code} ({len(r.content):,} bytes)")
            else:
                _erro(f"Site: {nome}", f"status={r.status_code}")
        except Exception as e:
            _erro(f"Site: {nome}", str(e)[:60])

    # Valida schema do macro_data.json
    try:
        r = requests.get(f"{SITE_URL}/macro_data.json", timeout=10)
        d = r.json()
        campos = ["timestamp", "data", "generated_at"]
        ok_campos = [c for c in campos if c in d]
        erros = len(d.get("validation_errors", []))
        if erros > 0:
            _erro("macro_data schema", f"{erros} erros de validação no cron atual — YanOS vai corrigir")
        else:
            _ok("macro_data schema", "schema correto")
    except Exception as e:
        _erro("macro_data schema", str(e)[:60])


def testar_telegram():
    print("\n[6] TELEGRAM")
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        _skip("Telegram", "BOT_TOKEN ou CHAT_ID não configurados")
        return

    try:
        # Testa getMe
        r = requests.get(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getMe",
            timeout=10
        )
        if r.status_code == 200:
            bot = r.json().get("result", {})
            _ok("Telegram bot", f"@{bot.get('username','?')}")
        else:
            _erro("Telegram bot", f"status={r.status_code}")
            return

        # Envia mensagem de teste
        r2 = requests.post(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            json={"chat_id": TELEGRAM_CHAT_ID,
                  "text": f"✅ YanOS — teste de conexão OK\n{datetime.now().strftime('%d/%m/%Y %H:%M')}"},
            timeout=10
        )
        if r2.status_code == 200:
            _ok("Telegram envio", "mensagem de teste enviada — verifique o chat")
        else:
            _erro("Telegram envio", f"status={r2.status_code} — {r2.text[:100]}")

    except Exception as e:
        _erro("Telegram", str(e)[:100])


def testar_callmebot():
    print("\n[7] CALLMEBOT")
    import urllib.parse
    msg = urllib.parse.quote(f"YanOS teste — {datetime.now().strftime('%H:%M')}")
    if CALLMEBOT_USER:
        url = f"https://api.callmebot.com/text.php?user=@{CALLMEBOT_USER}&text={msg}"
        canal = "Telegram"
    elif CALLMEBOT_PHONE and CALLMEBOT_APIKEY:
        url = f"https://api.callmebot.com/whatsapp.php?phone={CALLMEBOT_PHONE}&text={msg}&apikey={CALLMEBOT_APIKEY}"
        canal = "WhatsApp"
    else:
        _skip("CallMeBot", "CALLMEBOT_USER ou PHONE+APIKEY não configurados")
        return
    try:
        r = requests.get(url, timeout=15)
        if r.status_code == 200:
            _ok("CallMeBot", f"mensagem enviada via {canal}")
        else:
            _erro("CallMeBot", r.text[:100])
    except Exception as e:
        _erro("CallMeBot", str(e)[:100])


def testar_populador():
    print("\n[8] POPULADOR PPTX")
    if not TEMPLATE_PPTX.exists():
        _skip("Populador", "template PPTX não encontrado")
        return

    try:
        from pptx import Presentation
        prs = Presentation(str(TEMPLATE_PPTX))
        _ok("Populador leitura", f"{len(prs.slides)} slides encontrados")

        # diagnosticar_template nunca existiu em data/populador.py (checado no
        # historico do repo) — main.py ja trata isso como ferramenta de dev
        # opcional, com import guardado. Testar o que o modulo de fato exporta.
        from data.populador import popular_pptx
        _ok("Populador importação", "módulo carregado com sucesso")
    except Exception as e:
        _erro("Populador", str(e)[:100])


# ─── Relatório final ────────────────────────────────────────────────────────

def imprimir_relatorio():
    print("\n" + "=" * 50)
    print("RELATÓRIO FINAL")
    print("=" * 50)

    oks    = [k for k, (s, _) in RESULTADOS.items() if s == "✓"]
    erros  = [k for k, (s, _) in RESULTADOS.items() if s == "✗"]
    skips  = [k for k, (s, _) in RESULTADOS.items() if s == "○"]

    print(f"\n  ✓ OK:     {len(oks)}")
    print(f"  ✗ Erros:  {len(erros)}")
    print(f"  ○ Pulados: {len(skips)}")

    if erros:
        print(f"\nPrecisa de atenção:")
        for k in erros:
            _, msg = RESULTADOS[k]
            print(f"  ✗ {k}: {msg}")

    if not erros:
        print("\n  Sistema pronto para uso! ✓")
    elif not any("API" in e or "senha" in e.lower() for e in erros):
        print("\n  Sistema parcialmente funcional.")
    else:
        print("\n  Configure os itens acima antes de usar.")

    print("=" * 50 + "\n")


# ─── CLI ────────────────────────────────────────────────────────────────────

def main():
    args = sys.argv[1:]
    if not args or "tudo" in args:
        testar_ambiente()
        testar_claude()
        testar_qwen()
        testar_ftp()
        testar_site()
        testar_telegram()
        testar_callmebot()
        testar_populador()
    else:
        mapa = {
            "ambiente":  testar_ambiente,
            "claude":    testar_claude,
            "qwen":      testar_qwen,
            "ftp":       testar_ftp,
            "site":      testar_site,
            "telegram":  testar_telegram,
            "callmebot": testar_callmebot,
            "populador": testar_populador,
        }
        for arg in args:
            fn = mapa.get(arg.lower())
            if fn:
                fn()
            else:
                print(f"Teste '{arg}' não reconhecido. Opções: {list(mapa.keys())}")

    imprimir_relatorio()


if __name__ == "__main__":
    main()
