#!/usr/bin/env python3
"""
macro_agent.py — Agent 1: Macro Editorial Agent
MultiAsset · szuchmacher.com.br

Coleta dados de mercado, gera análise macro via Claude e publica
macro_data.json no site via FTP.

Uso:
  python agents/macro_agent.py             # coleta + gera + sobe FTP
  python agents/macro_agent.py --dry-run   # coleta + gera + salva local (sem FTP)

Deve ser rodado a partir de automacao-yan-os/:
  cd E:\\Diretorio\\Claude\\Site\\automacao-yan-os
  python agents/macro_agent.py --dry-run
"""

import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path

# ─── Paths ──────────────────────────────────────────────────────────────────
_AGENTS_DIR  = Path(__file__).parent                    # automacao-yan-os/agents/
_BASE_DIR    = _AGENTS_DIR.parent                       # automacao-yan-os/
_PROJECT_DIR = _BASE_DIR.parent                         # E:\Diretorio\Claude\Site\
_DATA_DIR    = _BASE_DIR / "data"

sys.path.insert(0, str(_DATA_DIR))

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

from config import (
    ANTHROPIC_API_KEY, MODELO_CLAUDE,
    DADOS_JSON, LOG_DIR,
    SITE_FTP_HOST, SITE_USER, SITE_PASS, SITE_REMOTE_DIR,
)
from atualizador_site import FTPClient

MACRO_JSON_PATH = _PROJECT_DIR / "site-producao" / "macro_data.json"
LOG_PATH        = LOG_DIR / f"macro_agent_{datetime.now().strftime('%Y%m%d')}.log"


# ─── Logger ────────────────────────────────────────────────────────────────

def log(msg: str):
    ts   = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    linha = f"[{ts}] {msg}"
    print(linha)
    try:
        LOG_DIR.mkdir(exist_ok=True)
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(linha + "\n")
    except Exception:
        pass


# ─── Dados de mercado ───────────────────────────────────────────────────────

def carregar_dados_mercado() -> dict:
    """Lê ultimo_dados.json; re-coleta via Yahoo Finance se arquivo > 6h."""
    if DADOS_JSON.exists():
        idade_h = (time.time() - DADOS_JSON.stat().st_mtime) / 3600
        if idade_h <= 6:
            log(f"Cache de mercado OK ({idade_h:.1f}h) — usando ultimo_dados.json")
            with open(DADOS_JSON, encoding="utf-8") as f:
                return json.load(f)
        log(f"Cache expirado ({idade_h:.1f}h) — re-coletando")
    else:
        log("ultimo_dados.json não encontrado — coletando agora")

    try:
        from coletor import coletar
        dados = coletar(modo_manual=False)
        log("Coleta automática concluída")
        return dados
    except Exception as e:
        log(f"ERRO na coleta automática: {e}")
        if DADOS_JSON.exists():
            log("Fallback: último cache disponível")
            with open(DADOS_JSON, encoding="utf-8") as f:
                return json.load(f)
        return {}


def carregar_macro_atual() -> dict:
    """Lê macro_data.json existente para preservar seções semi-estáticas."""
    if MACRO_JSON_PATH.exists():
        with open(MACRO_JSON_PATH, encoding="utf-8") as f:
            return json.load(f)
    log("AVISO: macro_data.json não encontrado — seções semi-estáticas ficarão vazias")
    return {}


# ─── Formata dados para o prompt ───────────────────────────────────────────

def _val(dados: dict, secao: str, chave: str, campo: str) -> str:
    try:
        v = dados.get(secao, {}).get(chave, {})
        valor    = v.get(campo, "N/D")
        variacao = v.get("variacao", "?")
        return f"{valor} ({variacao})"
    except Exception:
        return "N/D"


def formatar_dados_para_prompt(dados: dict) -> str:
    d = dados
    linhas = [
        "=== DADOS DE MERCADO ===",
        f"Data: {dados.get('data', datetime.now().strftime('%Y-%m-%d'))}",
        "",
        "BRASIL:",
        f"  Ibovespa: {_val(d, 'brasil', 'ibovespa', 'pontos')}",
        f"  Dólar BRL: {_val(d, 'brasil', 'dolar', 'valor')}",
        f"  DI Jan/28: {_val(d, 'brasil', 'di_jan28', 'taxa')}",
        "",
        "EUA:",
        f"  S&P 500: {_val(d, 'eua', 'sp500', 'pontos')}",
        f"  Nasdaq: {_val(d, 'eua', 'nasdaq', 'pontos')}",
        f"  Dow Jones: {_val(d, 'eua', 'dow', 'pontos')}",
        "",
        "EUROPA:",
        f"  DAX: {_val(d, 'europa', 'dax', 'pontos')}",
        f"  CAC: {_val(d, 'europa', 'cac', 'pontos')}",
        f"  FTSE: {_val(d, 'europa', 'ftse', 'pontos')}",
        "",
        "ÁSIA:",
        f"  Nikkei: {_val(d, 'asia', 'nikkei', 'pontos')}",
        f"  Hang Seng: {_val(d, 'asia', 'hang_seng', 'pontos')}",
        f"  Shanghai: {_val(d, 'asia', 'shanghai', 'pontos')}",
        "",
        "YIELDS:",
        f"  Treasury 10Y: {_val(d, 'yields', 'treasury_10y', 'taxa')}",
        "",
        "COMMODITIES:",
        f"  WTI (petróleo): {_val(d, 'commodities', 'wti', 'preco')}",
        f"  Ouro: {_val(d, 'commodities', 'ouro', 'preco')}",
        f"  Minério de ferro: {_val(d, 'commodities', 'minerio', 'preco')}",
    ]
    return "\n".join(linhas)


# ─── Claude ─────────────────────────────────────────────────────────────────

def gerar_analise_claude(dados_str: str, macro_atual: dict) -> dict:
    if not ANTHROPIC_API_KEY:
        raise ValueError("ANTHROPIC_API_KEY não configurada no .env")

    try:
        import anthropic
    except ImportError:
        raise ImportError("Instale: pip install anthropic")

    data_atual     = macro_atual.get("data", {})
    ultimo_eyebrow = data_atual.get("eyebrow", "")
    ultimo_alert   = data_atual.get("alert_title", "")
    mes_ano        = datetime.now().strftime("%B %Y").capitalize()

    prompt_sistema = (
        "Você é o analista macro sênior da Szuchmacher Consultoria. "
        "Produz análise macroeconômica editorial de alta qualidade para clientes UHNW. "
        "Resposta: técnica, objetiva, em português do Brasil, sem elogios."
    )

    prompt_usuario = f"""Com base nos dados de mercado abaixo, gere a análise macro atualizada.

{dados_str}

Contexto anterior (para continuidade editorial):
- Último eyebrow: {ultimo_eyebrow}
- Último destaque: {ultimo_alert}

Retorne EXATAMENTE este JSON (sem markdown, sem explicações):

{{
  "eyebrow": "Cenário Global · {mes_ano}",
  "alert_title": "manchete com 2-3 dados objetivos separados por · ",
  "alert_text": "parágrafo de 4-6 frases: contexto global + impacto Brasil + Selic/câmbio/inflação + perspectiva",
  "alert_badge": "1 evento-chave em destaque, ex: COPOM 17-18/JUN",
  "canais": [
    {{"variavel": "Petróleo (Brent)", "direcao": "up|down|neutral", "mecanismo": "1-2 frases de transmissão macro"}},
    {{"variavel": "Inflação Global", "direcao": "up|down|neutral", "mecanismo": "..."}},
    {{"variavel": "Juros (Fed / BCB)", "direcao": "up|down|neutral", "mecanismo": "..."}},
    {{"variavel": "PIB Global", "direcao": "up|down|neutral", "mecanismo": "..."}},
    {{"variavel": "Dólar (DXY)", "direcao": "up|down|neutral", "mecanismo": "..."}},
    {{"variavel": "Real (BRL)", "direcao": "up|down|neutral", "mecanismo": "..."}},
    {{"variavel": "Ouro", "direcao": "up|down|neutral", "mecanismo": "..."}},
    {{"variavel": "Bitcoin", "direcao": "up|down|neutral", "mecanismo": "..."}}
  ],
  "brasil": [
    {{"label": "SELIC e COPOM — [próxima reunião/contexto]", "text": "3-4 frases técnicas sobre política monetária"}},
    {{"label": "Câmbio e Contas Externas", "text": "3-4 frases sobre câmbio e balanço de pagamentos"}},
    {{"label": "Renda Fixa — [destaque do momento]", "text": "3-4 frases sobre NTN-B, CDI, crédito privado"}},
    {{"label": "[4º tema macro relevante]", "text": "3-4 frases técnicas"}}
  ],
  "beneficiados": [
    "<strong>[Setor/Ativo]</strong> — razão objetiva (máx 15 palavras)",
    "<strong>[Setor/Ativo]</strong> — razão objetiva",
    "<strong>[Setor/Ativo]</strong> — razão objetiva",
    "<strong>[Setor/Ativo]</strong> — razão objetiva",
    "<strong>[Setor/Ativo]</strong> — razão objetiva"
  ],
  "penalizados": [
    "<strong>[Setor/Ativo]</strong> — razão objetiva",
    "<strong>[Setor/Ativo]</strong> — razão objetiva",
    "<strong>[Setor/Ativo]</strong> — razão objetiva",
    "<strong>[Setor/Ativo]</strong> — razão objetiva",
    "<strong>[Setor/Ativo]</strong> — razão objetiva"
  ],
  "cenarios_brent": [
    "<strong>[Cenário 1 — título]:</strong> descrição e impactos (2-3 frases)",
    "<strong>[Cenário 2]:</strong> ...",
    "<strong>[Cenário 3]:</strong> ...",
    "<strong>[Cenário 4]:</strong> ...",
    "<strong>[Cenário 5]:</strong> ..."
  ]
}}"""

    cliente = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    log(f"Chamando {MODELO_CLAUDE}...")

    resposta = cliente.messages.create(
        model=MODELO_CLAUDE,
        max_tokens=4096,
        system=prompt_sistema,
        messages=[{"role": "user", "content": prompt_usuario}],
    )

    texto = resposta.content[0].text.strip()

    # Remove blocos markdown se presentes
    if texto.startswith("```"):
        texto = texto.split("\n", 1)[1]
        texto = texto.rsplit("```", 1)[0].strip()

    try:
        resultado = json.loads(texto)
        log("JSON recebido do Claude: válido")
        return resultado
    except json.JSONDecodeError as e:
        log(f"ERRO parse JSON Claude: {e}")
        log(f"Resposta raw (500 chars): {texto[:500]}")
        raise


# ─── Monta JSON final ───────────────────────────────────────────────────────

def montar_macro_data(analise: dict, macro_atual: dict) -> dict:
    """
    Une seções dinâmicas (Claude) com seções semi-estáticas (arquivo atual).
    'ativos' e 'premissas_*' são teses de longa duração — preservadas do arquivo.
    """
    hoje_brt  = datetime.now().strftime("%d/%m/%Y às %H:%M BRT")
    data_atual = macro_atual.get("data", {})

    return {
        "generated_at": hoje_brt,
        "data": {
            # Dinâmicas: geradas pelo Claude
            "eyebrow":        analise.get("eyebrow", ""),
            "alert_title":    analise.get("alert_title", ""),
            "alert_text":     analise.get("alert_text", ""),
            "alert_badge":    analise.get("alert_badge", ""),
            "canais":         analise.get("canais",         data_atual.get("canais", [])),
            "brasil":         analise.get("brasil",         data_atual.get("brasil", [])),
            "beneficiados":   analise.get("beneficiados",   data_atual.get("beneficiados", [])),
            "penalizados":    analise.get("penalizados",    data_atual.get("penalizados", [])),
            "cenarios_brent": analise.get("cenarios_brent", data_atual.get("cenarios_brent", [])),
            # Semi-estáticas: preservadas do arquivo atual
            "ativos":             data_atual.get("ativos", {}),
            "premissas_perfis":   data_atual.get("premissas_perfis", {}),
            "premissas_cenarios": data_atual.get("premissas_cenarios", {}),
        },
    }


# ─── Persistência ───────────────────────────────────────────────────────────

def salvar_local(macro_data: dict) -> bool:
    try:
        MACRO_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(MACRO_JSON_PATH, "w", encoding="utf-8") as f:
            json.dump(macro_data, f, ensure_ascii=False, indent=2)
        log(f"✅ Salvo: {MACRO_JSON_PATH}")
        return True
    except Exception as e:
        log(f"ERRO ao salvar: {e}")
        return False


def upload_ftp(macro_data: dict) -> bool:
    if not SITE_PASS:
        log("ERRO: SITE_PASS não configurada. Abortando FTP.")
        return False

    ftp = FTPClient()
    if not ftp.conectar():
        return False

    remote_dir = SITE_REMOTE_DIR.rstrip("/")
    if not ftp.ir_para(remote_dir):
        for alt in ["/public_html", "public_html", "/home1/hg545631/public_html"]:
            if ftp.ir_para(alt):
                break

    ok = ftp.upload_json("macro_data.json", macro_data)
    ftp.fechar()
    log(f"FTP {'✅ OK' if ok else '❌ ERRO'} — macro_data.json")
    return ok


# ─── Entrada ─────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Macro Editorial Agent — MultiAsset")
    parser.add_argument("--dry-run", action="store_true",
                        help="Salva localmente sem subir para FTP")
    args = parser.parse_args()

    log("=" * 56)
    log(f"MACRO AGENT v1.0  {'[DRY-RUN]' if args.dry_run else '[PRODUÇÃO]'}")
    log("=" * 56)

    # 1. Dados de mercado
    log("→ [1/5] Carregando dados de mercado...")
    dados = carregar_dados_mercado()
    if not dados:
        log("ERRO CRÍTICO: sem dados de mercado. Abortando.")
        sys.exit(1)

    # 2. Schema atual de referência
    log("→ [2/5] Carregando macro_data.json atual...")
    macro_atual = carregar_macro_atual()

    # 3. Prompt
    dados_str = formatar_dados_para_prompt(dados)
    log("→ [3/5] Dados formatados para Claude")

    # 4. Claude
    log("→ [4/5] Gerando análise via Claude...")
    try:
        analise = gerar_analise_claude(dados_str, macro_atual)
    except Exception as e:
        log(f"ERRO Claude: {e}")
        sys.exit(1)

    # 5. Monta + salva
    log("→ [5/5] Montando JSON e salvando...")
    macro_data = montar_macro_data(analise, macro_atual)

    if not salvar_local(macro_data):
        sys.exit(1)

    log(f"   eyebrow     : {macro_data['data'].get('eyebrow', '')}")
    log(f"   alert_title : {macro_data['data'].get('alert_title', '')[:80]}...")
    log(f"   alert_badge : {macro_data['data'].get('alert_badge', '')}")

    # FTP
    if args.dry_run:
        log("DRY-RUN: FTP pulado. JSON salvo localmente em site-producao/macro_data.json")
    else:
        log("→ Subindo macro_data.json para FTP...")
        if not upload_ftp(macro_data):
            log("AVISO: FTP falhou. Arquivo local atualizado mas não publicado.")
            sys.exit(1)

    log("=" * 56)
    log("MACRO AGENT CONCLUÍDO ✅")
    log("=" * 56)


if __name__ == "__main__":
    main()
