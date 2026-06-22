#!/usr/bin/env python3
"""Gera macro_data.json via OpenRouter (fallback quando Anthropic sem crédito)."""
import json
import re
import sys
from datetime import datetime
from pathlib import Path

import httpx

BASE = Path(__file__).resolve().parents[2]
YAN = BASE / "automacao-yan-os"
MACRO_PATH = BASE / "site-producao" / "macro_data.json"
CFG = BASE / "site-producao" / "config.php"

sys.path.insert(0, str(YAN / "data"))
from coletor import coletar  # noqa: E402


def val(d, *path, field="valor"):
    cur = d
    for p in path:
        cur = cur.get(p, {}) if isinstance(cur, dict) else {}
    return cur.get(field, "N/D") if isinstance(cur, dict) else "N/D"


def main():
    cfg = CFG.read_text(encoding="utf-8")
    m = re.search(r"define\('OPENROUTER_KEY',\s*'([^']+)'\)", cfg)
    if not m:
        print("ERRO: OPENROUTER_KEY ausente em config.php")
        return 1
    or_key = m.group(1)

    print("Coletando mercado (batch)...")
    dados = coletar(modo_manual=False)
    (YAN / "data" / "ultimo_dados.json").write_text(
        json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    macro_atual = json.loads(MACRO_PATH.read_text(encoding="utf-8"))
    data_atual = macro_atual.get("data", {})

    dados_str = f"""Data: {dados.get('data', '')}
Brasil: Ibovespa {val(dados, 'brasil', 'ibovespa', field='pontos')} | USD {val(dados, 'brasil', 'dolar')} | DI Jan/28 {val(dados, 'brasil', 'di_jan28')}
EUA: S&P {val(dados, 'eua', 'sp500', field='pontos')} | Nasdaq {val(dados, 'eua', 'nasdaq', field='pontos')} | Dow {val(dados, 'eua', 'dow', field='pontos')}
Commodities: WTI {val(dados, 'commodities', 'wti', field='preco')} | Ouro {val(dados, 'commodities', 'ouro', field='preco')} | Minerio {val(dados, 'commodities', 'minerio', field='preco')}
Treasury 10Y: {val(dados, 'yields', 'treasury_10y', field='taxa')}
"""

    contexto_copom = """CONTEXTO OBRIGATÓRIO (fato confirmado):
- COPOM reuniu 16–17/jun/2026; comunicado divulgado em 17/06 após encerramento do pregão.
- BCB cortou Selic em 0,25 p.p. para 14,25% a.a.
- FOMC de 17/06 também já ocorreu nesta semana.
- alert_badge deve refletir pós-COPOM (ex: SELIC 14,25% ou COPOM JUN/26).
"""

    prompt = f"""Com base nos dados de mercado abaixo, gere a análise macro atualizada.

{dados_str}

{contexto_copom}

Contexto anterior:
- eyebrow: {data_atual.get('eyebrow', '')}
- alert_title: {data_atual.get('alert_title', '')}

Retorne EXATAMENTE JSON válido (sem markdown) com campos: eyebrow, alert_title, alert_text, alert_badge, canais (8), brasil (4), beneficiados (5), penalizados (5), cenarios_brent (5). Tom técnico PT-BR para UHNW."""

    print("Chamando OpenRouter...")
    r = httpx.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {or_key}",
            "HTTP-Referer": "https://szuchmacher.com.br",
            "Content-Type": "application/json",
        },
        json={
            "model": "anthropic/claude-haiku-4-5",
            "max_tokens": 4096,
            "messages": [
                {"role": "system", "content": "Analista macro Szuchmacher. Responda só JSON."},
                {"role": "user", "content": prompt},
            ],
        },
        timeout=120,
    )
    if r.status_code != 200:
        print("ERRO OpenRouter", r.status_code, r.text[:400])
        return 1

    text = r.json()["choices"][0]["message"]["content"].strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    brace = re.search(r"\{[\s\S]*\}", text)
    if brace:
        text = brace.group(0)
    analise = json.loads(text)

    hoje = datetime.now().strftime("%d/%m/%Y às %H:%M BRT")
    macro_data = {
        "generated_at": hoje,
        "data": {
            "eyebrow": analise.get("eyebrow", ""),
            "alert_title": analise.get("alert_title", ""),
            "alert_text": analise.get("alert_text", ""),
            "alert_badge": analise.get("alert_badge", ""),
            "canais": analise.get("canais", data_atual.get("canais", [])),
            "brasil": analise.get("brasil", data_atual.get("brasil", [])),
            "beneficiados": analise.get("beneficiados", data_atual.get("beneficiados", [])),
            "penalizados": analise.get("penalizados", data_atual.get("penalizados", [])),
            "cenarios_brent": analise.get("cenarios_brent", data_atual.get("cenarios_brent", [])),
            "ativos": data_atual.get("ativos", {}),
            "premissas_perfis": data_atual.get("premissas_perfis", {}),
            "premissas_cenarios": data_atual.get("premissas_cenarios", {}),
        },
    }
    MACRO_PATH.write_text(json.dumps(macro_data, ensure_ascii=False, indent=2), encoding="utf-8")
    print("OK macro_data.json")
    print("eyebrow:", macro_data["data"]["eyebrow"])
    print("alert_badge:", macro_data["data"]["alert_badge"])
    print("alert_title:", macro_data["data"]["alert_title"][:120])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())