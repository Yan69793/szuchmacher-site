"""
gerador.py — YAN OS
Gera a narrativa editorial do briefing via Claude API.

Produz:
  destaques  — 4 parágrafos curtos (máx 600 chars total)
  no_radar   — até 4 bullets de eventos macro
  drivers    — 3-4 parágrafos de análise (máx 850 chars)
  la_trame   — parágrafo filosófico-narrativo (máx 1080 chars)
  agenda     — até 3 eventos do próximo dia útil
"""

import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

try:
    import anthropic
except ImportError:
    print("[ERRO] anthropic não instalado. Execute: pip install anthropic")
    sys.exit(1)

# Importa o prompt editorial completo
_PROMPT_FILE = Path(__file__).parent.parent / "Fechamento_de_Mercado_Prompt.txt"


def _carregar_system_prompt() -> str:
    """Carrega o prompt do arquivo ou usa o default embutido."""
    if _PROMPT_FILE.exists():
        return _PROMPT_FILE.read_text(encoding="utf-8")
    return _SYSTEM_PROMPT_DEFAULT


_SYSTEM_PROMPT_DEFAULT = """Você é um analista macro sênior especializado em economia global e mercados financeiros,
com foco em Brasil, EUA, Europa e Ásia. Sua escrita é objetiva, técnica e clara, em português do Brasil,
sem recomendações de trading.

Produza um briefing executivo de fechamento de mercado com base nos dados fornecidos.
Siga rigorosamente os limites de caracteres e o formato especificado."""


def _construir_prompt_usuario(dados: dict, contexto_extra: str = "") -> str:
    """Constrói o prompt com os dados do dia."""
    hoje = dados.get("data", datetime.now().strftime("%Y-%m-%d"))

    def _g(s, c, sub="pontos", d="—"):
        try:
            v = dados.get(s, {}).get(c, {})
            if isinstance(v, dict):
                for campo in [sub, "pontos", "valor", "taxa", "preco"]:
                    if campo in v and v[campo] not in ("", "—", None):
                        return f"{v[campo]} ({v.get('variacao', '—')})"
        except Exception:
            pass
        return d

    linhas_dados = f"""
DATA: {hoje}
CONTEXTO EXTRA DO ANALISTA: {contexto_extra if contexto_extra else 'Nenhum'}

=== BRASIL ===
Ibovespa: {_g('brasil','ibovespa','pontos')}
Dólar: {_g('brasil','dolar','valor')}
DI Jan/28: {_g('brasil','di_jan28','taxa')}

=== EUA ===
S&P 500: {_g('eua','sp500','pontos')}
Nasdaq: {_g('eua','nasdaq','pontos')}
Dow Jones: {_g('eua','dow','pontos')}

=== EUROPA ===
DAX: {_g('europa','dax','pontos')}
CAC 40: {_g('europa','cac','pontos')}
FTSE 100: {_g('europa','ftse','pontos')}

=== ÁSIA ===
Nikkei: {_g('asia','nikkei','pontos')}
Hang Seng: {_g('asia','hang_seng','pontos')}
Shanghai: {_g('asia','shanghai','pontos')}

=== YIELDS GLOBAIS ===
Treasury 10Y: {_g('yields','treasury_10y','taxa')}
Bund 10Y: {_g('yields','bund_10y','taxa')}
JGB 10Y: {_g('yields','jgb_10y','taxa')}

=== COMMODITIES ===
WTI: {_g('commodities','wti','preco')}
Ouro spot: {_g('commodities','ouro','preco')}
Minério de ferro: {_g('commodities','minerio','preco')}
"""

    return f"""Com base nos dados de fechamento abaixo, produza o briefing seguindo EXATAMENTE o formato especificado no system prompt.

{linhas_dados}

IMPORTANTE: Responda APENAS com JSON válido, sem texto antes ou depois. Estrutura exata:
{{
  "destaques": ["parágrafo 1", "parágrafo 2", "parágrafo 3", "parágrafo 4"],
  "no_radar": ["• bullet 1", "• bullet 2", "• bullet 3", "• bullet 4"],
  "drivers": [
    {{"titulo": "Título do driver 1", "texto": "Texto do parágrafo 1"}},
    {{"titulo": "Título do driver 2", "texto": "Texto do parágrafo 2"}},
    {{"titulo": "Título do driver 3", "texto": "Texto do parágrafo 3"}}
  ],
  "la_trame": "Parágrafo em itálico da La Trame du Jour.",
  "agenda": ["• Evento 1", "• Evento 2", "• Evento 3"],
  "headline": "Manchete: 1 frase densa com os 2-3 vetores principais do período.",
  "paragraph1": "Parágrafo 1 — Brasil: Ibovespa, câmbio, juros, usando os números fornecidos.",
  "paragraph2": "Parágrafo 2 — externo: EUA, Europa, Ásia e commodities.",
  "paragraph3": "Highlights da semana. Síntese e o que condiciona o próximo período.",
  "what_could_go_wrong": "2-3 frases: o que poderia invalidar a leitura atual.",
  "next_week": "2-3 frases com os eventos datados do próximo período."
}}

Regras INVIOLÁVEIS:
- NUNCA invente dados. Use apenas os números fornecidos acima.
- Se um mercado não tiver dados (—), não cite valores daquele mercado.
- Destaques: máximo 600 caracteres no total. Negrite a primeira frase de cada parágrafo.
- No Radar: máximo 650 caracteres. Apenas eventos CONFIRMADOS do dia de hoje.
- Drivers: máximo 850 caracteres. SEM números nos parágrafos, apenas cenário macro.
- La Trame: máximo 1.080 caracteres. Tom filosófico, analítico, estilo institucional.
- Agenda: máximo 3 eventos do PRÓXIMO dia útil. Verifique feriados.
- headline: máximo 220 caracteres, densa e factual.
- paragraph1/2/3: máximo 900 caracteres CADA. paragraph3 deve começar com "Highlights da semana.".
- what_could_go_wrong e next_week: máximo 600 caracteres CADA. NÃO inclua os prefixos
  "O que poderia nos fazer errar." nem "Na próxima semana." — o site os adiciona automaticamente.
- Estes campos (headline, paragraph*, what_could_go_wrong, next_week) alimentam relatorios.html.
  Tom institucional, factual, sem recomendação de compra/venda."""


# ─── Geração via Claude ─────────────────────────────────────────────────────

def gerar_narrativa(dados: dict, api_key: str,
                    contexto_extra: str = "",
                    modelo: str = "claude-sonnet-4-6") -> dict:
    """
    Gera a narrativa editorial completa via Claude API.

    Args:
        dados: dicionário com dados de mercado
        api_key: ANTHROPIC_API_KEY
        contexto_extra: notas do analista para contextualizar a IA
        modelo: modelo Claude a usar

    Returns:
        Dicionário com as seções do briefing.
    """
    print(f"\n[gerador] Gerando narrativa com {modelo}...")

    system_prompt = _carregar_system_prompt()
    user_prompt   = _construir_prompt_usuario(dados, contexto_extra)

    try:
        client = anthropic.Anthropic(api_key=api_key)
        resposta = client.messages.create(
            model=modelo,
            max_tokens=4096,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}]
        )

        texto = resposta.content[0].text.strip()
        print(f"[gerador] Tokens usados: {resposta.usage.input_tokens} in / {resposta.usage.output_tokens} out")

        # Parse JSON
        narrativa = _extrair_json(texto)
        _validar_narrativa(narrativa)
        print("[gerador] ✓ Narrativa gerada com sucesso.")
        return narrativa

    except anthropic.AuthenticationError:
        print("[gerador] ERRO: API Key inválida. Verifique ANTHROPIC_API_KEY.")
        raise
    except anthropic.RateLimitError:
        print("[gerador] ERRO: Rate limit atingido. Aguarde e tente novamente.")
        raise
    except json.JSONDecodeError as e:
        print(f"[gerador] AVISO: JSON mal formado. Tentando recuperar... ({e})")
        return _narrativa_emergencia(dados)
    except Exception as e:
        print(f"[gerador] ERRO: {e}")
        raise


def _extrair_json(texto: str) -> dict:
    """Extrai JSON da resposta, tolerando texto extra ao redor."""
    # Remove blocos de código markdown
    texto = texto.replace("```json", "").replace("```", "").strip()

    # Tenta parse direto
    try:
        return json.loads(texto)
    except json.JSONDecodeError:
        pass

    # Extrai o primeiro objeto JSON encontrado
    inicio = texto.find("{")
    fim    = texto.rfind("}") + 1
    if inicio >= 0 and fim > inicio:
        return json.loads(texto[inicio:fim])

    raise json.JSONDecodeError("JSON não encontrado na resposta", texto, 0)


def _validar_narrativa(narrativa: dict) -> None:
    """Valida estrutura mínima e avisa sobre campos faltantes."""
    campos = ["destaques", "no_radar", "drivers", "la_trame", "agenda"]
    faltando = [c for c in campos if c not in narrativa]
    if faltando:
        print(f"[gerador] AVISO: campos ausentes na narrativa: {faltando}")

    # Valida limites de caracteres (apenas avisos, não bloqueia)
    limites = {
        "destaques": 650,
        "no_radar":  700,
        "la_trame":  1150,
    }
    for campo, limite in limites.items():
        v = narrativa.get(campo, "")
        texto = " ".join(v) if isinstance(v, list) else str(v)
        if len(texto) > limite:
            print(f"[gerador] AVISO: {campo} tem {len(texto)} chars (limite: {limite})")


def _narrativa_emergencia(dados: dict) -> dict:
    """Narrativa mínima de fallback quando a API falha."""
    hoje = dados.get("data", datetime.now().strftime("%Y-%m-%d"))
    ibov = dados.get("brasil", {}).get("ibovespa", {}).get("pontos", "—")
    ibov_var = dados.get("brasil", {}).get("ibovespa", {}).get("variacao", "—")

    return {
        "destaques": [
            f"Ibovespa encerrou em {ibov} pontos, variação de {ibov_var} no pregão de {hoje}.",
            "Narrativa completa indisponível — preencher manualmente.",
            "", ""
        ],
        "no_radar": ["• Verificar calendário macro do dia."],
        "drivers": [
            {"titulo": "Mercado doméstico", "texto": "Preencher manualmente."},
            {"titulo": "Cenário externo", "texto": "Preencher manualmente."},
        ],
        "la_trame": "La Trame du Jour — preencher manualmente.",
        "agenda": ["• Verificar agenda do próximo dia útil."],
    }


# ─── Revisão interativa ─────────────────────────────────────────────────────

def revisar_narrativa(narrativa: dict) -> dict:
    """
    Exibe a narrativa gerada e oferece opção de ajuste manual.
    Retorna a narrativa revisada (ou original se sem alterações).
    """
    from config import is_interativo
    if not is_interativo():
        return narrativa  # run não-supervisionado: aceita a narrativa sem prompt

    print("\n" + "─" * 60)
    print("NARRATIVA GERADA — REVISÃO")
    print("─" * 60)

    # Exibe resumo
    destaques = narrativa.get("destaques", [])
    for i, d in enumerate(destaques[:4], 1):
        if d:
            print(f"\nDestaque {i}: {d[:120]}{'...' if len(d) > 120 else ''}")

    la_trame = narrativa.get("la_trame", "")
    if la_trame:
        print(f"\nLa Trame: {la_trame[:150]}{'...' if len(la_trame) > 150 else ''}")

    print("\n" + "─" * 60)
    print("Opções:")
    print("  ENTER — aceitar e continuar")
    print("  'v'   — ver narrativa completa")
    print("  'e'   — exportar JSON para edição manual")

    try:
        escolha = input("> ").strip().lower()
    except (EOFError, KeyboardInterrupt):
        return narrativa

    if escolha == "v":
        print("\n=== NARRATIVA COMPLETA ===")
        print(json.dumps(narrativa, ensure_ascii=False, indent=2))
        print("=== FIM ===\n")
        input("Pressione ENTER para continuar...")

    elif escolha == "e":
        from pathlib import Path
        import sys
        caminho = Path(__file__).parent.parent / "output" / "narrativa_revisao.json"
        caminho.parent.mkdir(exist_ok=True)
        with open(caminho, "w", encoding="utf-8") as f:
            json.dump(narrativa, f, ensure_ascii=False, indent=2)
        print(f"\nJSON salvo em: {caminho}")
        print("Edite o arquivo e pressione ENTER para carregar as alterações...")
        input()
        try:
            with open(caminho, "r", encoding="utf-8") as f:
                narrativa = json.load(f)
            print("✓ Narrativa atualizada.")
        except Exception as e:
            print(f"Erro ao carregar: {e}. Usando original.")

    return narrativa


if __name__ == "__main__":
    print("gerador.py — módulo de geração de narrativa via Claude")
    print("Use através do main.py ou importe como módulo.")
