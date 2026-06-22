"""
atualizador_site.py — YAN OS (re-escopado 2026-06-14)

Publica o relatório semanal em szuchmacher.com.br.

Modelo atual:
  - relatorios.html se auto-atualiza por JS lendo /relatorio_cache.json.
  - Este módulo gera esse JSON (no contrato exato do front) e sobe via FTP,
    junto com o PDF do fechamento.
  - NÃO toca index.html (teaser ilustrativo intencional).
  - NÃO toca macro_data.json (editorial macro curado à parte).

Distribuição do PDF aos assinantes: data/enviador.py (chamado pelo main.py).
"""

import io
import sys
import json
import time
import hashlib
import hmac
import ftplib
from datetime import datetime
from pathlib import Path
from typing import Optional

# Corrige UnicodeEncodeError (charmap) ao imprimir em consoles cp1252 no Windows
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

sys.path.insert(0, str(Path(__file__).parent))
from config import (
    SITE_METHOD, SITE_HOST, SITE_FTP_HOST, SITE_USER, SITE_PASS,
    SITE_REMOTE_DIR, SITE_URL, SITE_WEBHOOK_URL, SITE_WEBHOOK_SECRET,
    OUTPUT_DIR, LOG_DIR
)

_MESES = ["jan", "fev", "mar", "abr", "mai", "jun",
          "jul", "ago", "set", "out", "nov", "dez"]


# ─── Logger ────────────────────────────────────────────────────────────────

def _log(msg: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    linha = f"[{ts}] {msg}"
    print(linha)
    try:
        LOG_DIR.mkdir(exist_ok=True)
        with open(LOG_DIR / "atualizador.log", "a", encoding="utf-8") as f:
            f.write(linha + "\n")
    except Exception:
        pass


# ─── Gerador do relatorio_cache.json (contrato de relatorios.html) ──────────

def gerar_relatorio_cache(dados: dict, narrativa: dict) -> dict:
    """
    Monta o JSON consumido por relatorios.html → applyReport().

    Contrato (ver relatorios.html, função applyReport):
      { date_label, eyebrow, h2,
        report: { headline, paragraph1..3, what_could_go_wrong, next_week, source_note },
        prices: { ibovespa, usd_brl, sp500, wti } com {value, label} }

    Campos novos vêm de gerador.py; se ausentes (ex.: narrativa de emergência),
    derivamos de destaques/drivers/agenda para nunca devolver JSON vazio.
    """
    hoje = dados.get("data", datetime.now().strftime("%Y-%m-%d"))
    try:
        dt = datetime.strptime(hoje, "%Y-%m-%d")
    except Exception:
        dt = datetime.now()

    data_ext = f"{dt.day:02d} {_MESES[dt.month - 1]} {dt.year}"

    destaques = narrativa.get("destaques", []) or []
    drivers   = narrativa.get("drivers", []) or []

    def _driver_txt(i: int) -> str:
        if i < len(drivers):
            d = drivers[i]
            return d.get("texto", "") if isinstance(d, dict) else str(d)
        return ""

    def _limpa(s: str) -> str:
        return str(s or "").replace("**", "").strip()

    headline = _limpa(narrativa.get("headline")) or \
        (_limpa(destaques[0]) if destaques else "Fechamento de mercado")
    p1 = _limpa(narrativa.get("paragraph1")) or _driver_txt(0) or (_limpa(destaques[0]) if destaques else "")
    p2 = _limpa(narrativa.get("paragraph2")) or _driver_txt(1)
    p3 = _limpa(narrativa.get("paragraph3")) or _driver_txt(2)
    wcgw   = _limpa(narrativa.get("what_could_go_wrong"))
    nextw  = _limpa(narrativa.get("next_week")) or " ".join(
        a.replace("•", "").strip() for a in narrativa.get("agenda", []) if a)

    source_note = (
        "Fontes operacionais e de referência. Relatório interno Szuchmacher Consultoria "
        "com dados consolidados de Reuters, Bloomberg, Banco Central do Brasil, B3, "
        f"Federal Reserve e BLS, semana encerrada em {data_ext}."
    )

    def _price(secao: str, chave: str, campo: str):
        try:
            v = dados.get(secao, {}).get(chave, {})
            return str(v.get(campo, "")).strip(), str(v.get("variacao", "")).strip()
        except Exception:
            return "", ""

    ibov_v, ibov_var = _price("brasil", "ibovespa", "pontos")
    dol_v,  dol_var  = _price("brasil", "dolar", "valor")
    sp_v,   sp_var   = _price("eua", "sp500", "pontos")
    wti_v,  wti_var  = _price("commodities", "wti", "preco")

    fech = f"Fechamento {dt.day:02d}/{dt.month:02d}"

    def _label(var: str) -> str:
        return f"{fech} · {var}".strip() if var and var != "—" else fech

    return {
        "date_label": f"Fechamento · semana encerrada em {data_ext}",
        "eyebrow":    "Fechamento da semana",
        "h2":         "Leitura semanal dos vetores que movem preços",
        "report": {
            "headline":            headline,
            "paragraph1":          p1,
            "paragraph2":          p2,
            "paragraph3":          p3,
            "what_could_go_wrong": wcgw,
            "next_week":           nextw,
            "source_note":         source_note,
        },
        "prices": {
            "ibovespa": {"value": ibov_v, "label": _label(ibov_var)},
            "usd_brl":  {"value": dol_v,  "label": _label(dol_var)},
            "sp500":    {"value": sp_v,   "label": _label(sp_var)},
            "wti":      {"value": wti_v,  "label": _label(wti_var)},
        },
        "generated_at": datetime.now().strftime("%d/%m/%Y %H:%M BRT"),
        "ts": int(time.time()),
    }


# ─── FTP ────────────────────────────────────────────────────────────────────

class FTPClient:
    """Wrapper FTP com reconexão e métodos de conveniência."""

    def __init__(self):
        self.ftp = None

    def conectar(self) -> bool:
        host = SITE_FTP_HOST or SITE_HOST
        _log(f"FTP: conectando em {host} como {SITE_USER}...")
        try:
            self.ftp = ftplib.FTP()
            self.ftp.connect(host, 21, timeout=30)
            self.ftp.login(SITE_USER, SITE_PASS)
            self.ftp.set_pasv(True)
            _log(f"FTP: conectado — {self.ftp.getwelcome()[:60]}")
            return True
        except Exception as e:
            _log(f"FTP ERRO conexao: {e}")
            return False

    def ir_para(self, path: str) -> bool:
        try:
            self.ftp.cwd(path)
            return True
        except Exception as e:
            _log(f"FTP ERRO cd {path}: {e}")
            return False

    def upload_bytes(self, nome_remoto: str, conteudo: bytes) -> bool:
        try:
            self.ftp.storbinary(f"STOR {nome_remoto}", io.BytesIO(conteudo))
            _log(f"FTP OK {nome_remoto} ({len(conteudo):,} bytes)")
            return True
        except Exception as e:
            _log(f"FTP ERRO upload {nome_remoto}: {e}")
            return False

    def upload_json(self, nome_remoto: str, dados: dict) -> bool:
        conteudo = json.dumps(dados, ensure_ascii=False, indent=2).encode("utf-8")
        return self.upload_bytes(nome_remoto, conteudo)

    def upload_arquivo(self, nome_remoto: str, caminho_local: Path) -> bool:
        try:
            with open(caminho_local, "rb") as f:
                return self.upload_bytes(nome_remoto, f.read())
        except Exception as e:
            _log(f"FTP ERRO leitura {caminho_local}: {e}")
            return False

    def fechar(self):
        try:
            if self.ftp:
                self.ftp.quit()
        except Exception:
            pass


# ─── Publicação ──────────────────────────────────────────────────────────────

def atualizar_sites(dados: dict, narrativa: dict,
                    caminho_pdf: Optional[str] = None) -> bool:
    """Publica relatorio_cache.json (+ PDF). Retorna True se ok."""
    _log("=== PUBLICACAO DO RELATORIO INICIADA ===")
    cache = gerar_relatorio_cache(dados, narrativa)

    hoje = dados.get("data", datetime.now().strftime("%Y-%m-%d"))
    try:
        dt = datetime.strptime(hoje, "%Y-%m-%d")
        pdf_nome_remoto = f"Fechamento de Mercado {dt.day:02d}.{dt.month:02d}.{str(dt.year)[2:]}.pdf"
    except Exception:
        pdf_nome_remoto = "Fechamento de Mercado.pdf"

    if SITE_METHOD == "local":
        return _publicar_local(cache, caminho_pdf, pdf_nome_remoto)
    if SITE_METHOD == "ftp":
        return _publicar_ftp(cache, caminho_pdf, pdf_nome_remoto)
    if SITE_METHOD == "webhook":
        return _publicar_webhook(cache)

    _log(f"AVISO: SITE_METHOD='{SITE_METHOD}' desconhecido. Usando local.")
    return _publicar_local(cache, caminho_pdf, pdf_nome_remoto)


def _publicar_ftp(cache: dict, caminho_pdf, pdf_nome_remoto) -> bool:
    if not SITE_PASS:
        _log("ERRO: SITE_PASS nao configurada. Defina no .env")
        return False

    ftp = FTPClient()
    if not ftp.conectar():
        return False

    remote_dir = SITE_REMOTE_DIR.rstrip("/")
    if not ftp.ir_para(remote_dir):
        for alt in ["/public_html", "public_html", "/home1/hg545631/public_html"]:
            if ftp.ir_para(alt):
                break

    sucesso = ftp.upload_json("relatorio_cache.json", cache)

    if caminho_pdf and Path(caminho_pdf).exists():
        if not ftp.upload_arquivo(pdf_nome_remoto, Path(caminho_pdf)):
            _log("AVISO: PDF nao publicado")
    else:
        _log("INFO: PDF nao fornecido — pulando upload do PDF")

    ftp.fechar()
    _log(f"=== FTP CONCLUIDO {'OK' if sucesso else 'COM ERROS'} ===")
    return sucesso


def _publicar_local(cache: dict, caminho_pdf, pdf_nome_remoto) -> bool:
    """Salva localmente para revisão/dry-run."""
    pasta = OUTPUT_DIR / "site_data"
    pasta.mkdir(parents=True, exist_ok=True)
    with open(pasta / "relatorio_cache.json", "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)
    _log(f"LOCAL OK relatorio_cache.json -> {pasta}")
    if caminho_pdf and Path(caminho_pdf).exists():
        _log(f"LOCAL INFO PDF pronto em {caminho_pdf}")
    return True


def _publicar_webhook(cache: dict) -> bool:
    if not SITE_WEBHOOK_URL:
        _log("ERRO: SITE_WEBHOOK_URL nao configurada.")
        return False
    try:
        import requests
        payload = json.dumps({"files": {"relatorio_cache.json": cache}},
                             ensure_ascii=False).encode("utf-8")
        sig = hmac.new(SITE_WEBHOOK_SECRET.encode(), payload, hashlib.sha256).hexdigest()
        r = requests.post(SITE_WEBHOOK_URL, data=payload,
                          headers={"Content-Type": "application/json", "X-Sig": sig},
                          timeout=30)
        ok = r.status_code == 200
        _log(f"WEBHOOK {'OK' if ok else 'ERRO'} status={r.status_code}")
        return ok
    except Exception as e:
        _log(f"WEBHOOK ERRO: {e}")
        return False


# ─── Teste de conexão FTP ───────────────────────────────────────────────────

def testar_conexao_ftp() -> bool:
    if not SITE_PASS:
        print("SITE_PASS nao configurada.")
        return False
    ftp = FTPClient()
    ok = ftp.conectar()
    if ok:
        print(f"  Diretorio atual: {ftp.ftp.pwd()}")
        print(f"  Arquivos: {ftp.ftp.nlst()[:10]}")
    ftp.fechar()
    return ok


if __name__ == "__main__":
    if "--testar-ftp" in sys.argv:
        print("\n=== TESTE DE CONEXAO FTP ===")
        testar_conexao_ftp()
    else:
        print("Uso:")
        print("  python atualizador_site.py --testar-ftp   # testa conexao FTP")
