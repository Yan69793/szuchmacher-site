#!/usr/bin/env python3
"""
macro_agent.py — Agent 1: Macro Editorial Agent
MultiAsset · szuchmacher.com.br

Coleta dados de mercado, busca análise macro do Worker de produção e publica
macro_data.json via Cloudflare Workers.

Uso:
  python agents/macro_agent.py             # coleta + busca + publica
  python agents/macro_agent.py --dry-run   # coleta + busca + salva local (sem deploy)

Deve ser rodado a partir de automacao-yan-os/:
  cd E:\\Diretorio\\Claude\\FREQUENTE\\Site\\automacao-yan-os
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
_PROJECT_DIR = _BASE_DIR.parent                         # E:\Diretorio\Claude\FREQUENTE\Site\
_DATA_DIR    = _BASE_DIR / "data"

sys.path.insert(0, str(_DATA_DIR))

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

from config import (
    DADOS_JSON, LOG_DIR,
)

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
    # Leitura tolerante: arquivo pela metade (escrita concorrente da rotina
    # remota de domingo) nao pode derrubar o agente. Tenta o principal e depois
    # o backup .bak.
    for caminho in (MACRO_JSON_PATH, MACRO_JSON_PATH.with_name(MACRO_JSON_PATH.name + ".bak")):
        try:
            if not caminho.exists():
                continue
            with open(caminho, encoding="utf-8") as f:
                dados = json.load(f)
            if isinstance(dados, dict):
                return dados
        except Exception as e:
            log(f"AVISO: falha ao ler {caminho}: {e}")
    log("AVISO: macro_data.json não encontrado — seções semi-estáticas ficarão vazias")
    return {}


# ─── Busca análise do Worker de produção ────────────────────────────────────

def buscar_analise_macro(macro_atual: dict) -> dict:
    """
    Busca a análise macro já gerada pelo Worker de produção (macro_api.php).
    O Worker usa OpenRouter + claude-haiku-4-5 com cache de 7 dias.
    Se o cache estiver frio, aguarda a geração (timeout ~120s).
    """
    import urllib.request
    from urllib.error import URLError

    url = "https://szuchmacher.com.br/macro_api.php"
    log(f"Buscando macro de produção: {url}")

    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) szuchmacher-macro-agent"}
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            dados = json.loads(resp.read().decode("utf-8"))
    except URLError as e:
        raise RuntimeError(f"macro_api.php falhou: {e}")
    except Exception as e:
        raise RuntimeError(f"macro_api.php erro inesperado: {e}")

    if not dados.get("ok"):
        raise RuntimeError(f"macro_api.php retornou ok=false: {dados.get('erro', 'sem detalhes')}")

    log(f"macro_api.php OK — cache:{dados.get('cache')} gerado:{dados.get('generated_at')}")

    # Extrai a análise macro do campo 'data'
    analise = dados.get("data", {})
    if not analise:
        raise RuntimeError("macro_api.php retornou data vazio")

    # Preserva seções semi-estáticas do arquivo local
    data_atual = macro_atual.get("data", {})
    if not analise.get("ativos"):
        analise["ativos"] = data_atual.get("ativos", {})
    if not analise.get("premissas_perfis"):
        analise["premissas_perfis"] = data_atual.get("premissas_perfis", {})
    if not analise.get("premissas_cenarios"):
        analise["premissas_cenarios"] = data_atual.get("premissas_cenarios", {})

    return analise


# ─── Monta JSON final ───────────────────────────────────────────────────────

def montar_macro_data(analise: dict, macro_atual: dict) -> dict:
    """
    Une seções dinâmicas (Worker) com seções semi-estáticas (arquivo atual).
    'ativos' e 'premissas_*' são teses de longa duração — preservadas do arquivo.
    """
    hoje_brt  = datetime.now().strftime("%d/%m/%Y às %H:%M BRT")
    data_atual = macro_atual.get("data", {})

    return {
        "generated_at": hoje_brt,
        "data": {
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
        # Escrita atomica (temp + rename), mesmo padrao da agenda: leitores
        # concorrentes nunca enxergam o JSON pela metade.
        tmp = MACRO_JSON_PATH.with_suffix(".json.tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(macro_data, f, ensure_ascii=False, indent=2)
        tmp.replace(MACRO_JSON_PATH)
        log(f"Salvo: {MACRO_JSON_PATH}")
        return True
    except Exception as e:
        log(f"ERRO ao salvar: {e}")
        return False


def deploy_cloudflare() -> bool:
    """Chama deploy-cloudflare.ps1 para publicar macro_data.json via Cloudflare Workers."""
    import subprocess
    deploy_script = _PROJECT_DIR / "site-producao" / "scripts" / "deploy-cloudflare.ps1"
    if not deploy_script.exists():
        log(f"ERRO: deploy-cloudflare.ps1 não encontrado em {deploy_script}")
        return False
    log("Executando deploy-cloudflare.ps1...")
    try:
        resultado = subprocess.run(
            ['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(deploy_script)],
            capture_output=True, text=True, timeout=300
        )
        if resultado.returncode == 0:
            log("Deploy Cloudflare concluído")
            return True
        else:
            log(f"Deploy Cloudflare falhou (exit {resultado.returncode}): {resultado.stderr[:500]}")
            return False
    except subprocess.TimeoutExpired:
        log("Deploy Cloudflare timeout (300s)")
        return False
    except Exception as e:
        log(f"Deploy Cloudflare erro: {e}")
        return False


# ─── Entrada ─────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Macro Editorial Agent — MultiAsset")
    parser.add_argument("--dry-run", action="store_true",
                        help="Salva localmente sem publicar via Cloudflare")
    args = parser.parse_args()

    log("=" * 56)
    log(f"MACRO AGENT v2.0  {'[DRY-RUN]' if args.dry_run else '[PRODUÇÃO]'}")
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

    # 3. Pula step de formatação (não geramos mais prompt local)
    log("→ [3/5] Formatação de dados (não aplicável — API de produção)")

    # 4. Busca análise do Worker de produção
    log("→ [4/5] Buscando análise macro do Worker de produção...")
    try:
        analise = buscar_analise_macro(macro_atual)
    except Exception as e:
        log(f"ERRO ao buscar análise: {e}")
        sys.exit(1)

    # 5. Monta + salva
    log("→ [5/5] Montando JSON e salvando...")
    macro_data = montar_macro_data(analise, macro_atual)

    if not salvar_local(macro_data):
        sys.exit(1)

    log(f"   eyebrow     : {macro_data['data'].get('eyebrow', '')}")
    log(f"   alert_title : {macro_data['data'].get('alert_title', '')[:80]}...")
    log(f"   alert_badge : {macro_data['data'].get('alert_badge', '')}")

    # Deploy Cloudflare
    if args.dry_run:
        log("DRY-RUN: Deploy pulado. JSON salvo localmente em site-producao/macro_data.json")
    else:
        log("Publicando via Cloudflare...")
        if not deploy_cloudflare():
            log("AVISO: Deploy Cloudflare falhou. Arquivo local atualizado mas não publicado.")
            sys.exit(1)

    log("=" * 56)
    log("MACRO AGENT CONCLUÍDO")
    log("=" * 56)


if __name__ == "__main__":
    main()