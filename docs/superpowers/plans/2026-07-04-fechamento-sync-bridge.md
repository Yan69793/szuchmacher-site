# Ponte de Sincronização Fechamento → relatorio_cache.json — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar um script de sincronização único que, sempre que o pipeline de fechamento de mercado (rotina principal OU fallback) gerar um relatório válido, atualiza automaticamente `site-producao/relatorio_cache.json` e deploya o site — resolvendo a lacuna que deixou o widget "Fechamento da Semana" do site institucional travado por 2 semanas.

**Architecture:** Um script Python (`sync_relatorio_cache.py`) lê os artefatos já gerados no dia (`outputs/fechamento_szuchmacher_YYYYMMDD.html` + `logs/precos_YYYYMMDD.json`), extrai apenas dado validado (variação semanal do Ibovespa só se o texto gerado a informar explicitamente; demais tickers usam variação do dia, rotulada como tal), monta o schema exato de `relatorio_cache.json` e sobrescreve o arquivo. Em seguida roda `deploy-cloudflare.ps1`. O script é chamado a partir de dois pontos de sucesso independentes: o fim da rotina principal e o fim do fallback OpenRouter.

**Tech Stack:** Python 3 (stdlib apenas — `json`, `re`, `datetime`, `pathlib`, `subprocess`, `sys`), PowerShell (chamada final de deploy).

**Nota sobre versionamento:** `E:\Diretorio\Claude\relatorio-diario-szuchmacher` não é um repositório git (`git status` confirma "not a git repository"). Os passos deste plano salvam arquivos diretamente, sem commit, nesse projeto. `E:\Diretorio\Claude\Site` é git-tracked, mas commits só acontecem se o usuário pedir explicitamente — nenhum passo deste plano commita automaticamente.

---

## Mapa de arquivos

- **Criar:** `E:\Diretorio\Claude\relatorio-diario-szuchmacher\scripts\sync_relatorio_cache.py` — único responsável por ler os artefatos do dia, montar o JSON e (se tudo certo) disparar o deploy.
- **Modificar:** `C:\Users\User\.claude\scheduled-tasks\fechamento-diario-szuchmacher\SKILL.md` — adicionar PASSO 6 chamando o script acima.
- **Modificar:** `E:\Diretorio\Claude\relatorio-diario-szuchmacher\scripts\briefing_fallback_openrouter.py` — chamar o mesmo script no caminho de sucesso do fallback.

---

### Task 1: Criar o script de sincronização

**Files:**
- Create: `E:\Diretorio\Claude\relatorio-diario-szuchmacher\scripts\sync_relatorio_cache.py`

- [ ] **Step 1: Escrever o script completo**

```python
#!/usr/bin/env python3
"""Sincroniza o fechamento de mercado gerado por este pipeline com o
relatorio_cache.json consumido por site-producao/relatorios.html.

Uso: python sync_relatorio_cache.py [YYYYMMDD]
Sem argumento, usa a data de hoje. Sai com codigo 1 e mensagem em stderr
se os artefatos do dia estiverem ausentes ou incompletos -- nunca escreve
um relatorio_cache.json parcial ou com dado inventado.
"""
import json
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SITE_PRODUCAO = Path(r"E:\Diretorio\Claude\Site\site-producao")
CACHE_FILE = SITE_PRODUCAO / "relatorio_cache.json"
DEPLOY_SCRIPT = SITE_PRODUCAO / "scripts" / "deploy-cloudflare.ps1"

MESES_PT = {
    "jan": "jan", "feb": "fev", "mar": "mar", "apr": "abr", "may": "mai", "jun": "jun",
    "jul": "jul", "aug": "ago", "sep": "set", "oct": "out", "nov": "nov", "dec": "dez",
}


def format_brl_number(value, decimals=0):
    s = f"{value:,.{decimals}f}"
    return s.replace(",", "_").replace(".", ",").replace("_", ".")


def format_pct(value):
    sign = "+" if value >= 0 else ""
    return f"{sign}{value:.2f}".replace(".", ",") + "%"


def strip_tags(html):
    return re.sub(r"<[^>]+>", " ", html)


def load_prices(date_str):
    path = PROJECT_ROOT / "logs" / f"precos_{date_str}.json"
    if not path.exists():
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_html(date_str):
    path = PROJECT_ROOT / "outputs" / f"fechamento_szuchmacher_{date_str}.html"
    if not path.exists():
        return None
    return path.read_text(encoding="utf-8")


def extract_weekly_ibov_pct(html_text):
    """So retorna algo se o texto gerado informar explicitamente a variacao
    semanal do Ibovespa. Caso contrario, retorna None -- o chamador deve
    usar a variacao diaria em vez de inventar uma semanal."""
    m = re.search(
        r"encerrou a semana com (?:ganho|perda) acumulad[oa] de (-?\d+,\d+)%",
        html_text,
    )
    if not m:
        return None
    return float(m.group(1).replace(",", "."))


def extract_paragraphs(html_text, max_count=3):
    m = re.search(
        r'<span class="section-title">Destaques do Pregão</span>.*?'
        r'<div class="section-body">(.*?)</div>\s*</div>',
        html_text,
        re.S,
    )
    if not m:
        return []
    body = m.group(1)
    paragraphs = re.findall(r"<p>(.*?)</p>", body, re.S)
    return [strip_tags(p).strip() for p in paragraphs][:max_count]


def extract_agenda_items(html_text, max_count=3):
    m = re.search(
        r'<span class="section-title">Agenda</span>.*?<div class="card">(.*?)</div>\s*</div>',
        html_text,
        re.S,
    )
    if not m:
        return []
    body = m.group(1)
    items = re.findall(r'<div class="agenda-text">(.*?)</div>', body, re.S)
    return [strip_tags(i).replace("\n", " ").strip() for i in items][:max_count]


def format_date_label_pt(date_str):
    dt = datetime.strptime(date_str, "%Y%m%d")
    label = dt.strftime("%d %b %Y").lower()
    for en, pt in MESES_PT.items():
        label = label.replace(en, pt)
    return label


def build_cache(date_str, prices, html_text):
    paragraphs = extract_paragraphs(html_text)
    if len(paragraphs) < 2:
        raise ValueError(
            f"Menos de 2 paragrafos extraidos de 'Destaques do Pregao' para {date_str}"
        )

    p = prices["prices"]
    for key in ("IBOV", "USDBRL", "SPX", "WTI"):
        if key not in p:
            raise ValueError(f"Preco '{key}' ausente em precos_{date_str}.json")

    ibov, usd, spx, wti = p["IBOV"], p["USDBRL"], p["SPX"], p["WTI"]

    weekly_ibov = extract_weekly_ibov_pct(html_text)
    if weekly_ibov is not None:
        ibov_label = f"Semana · {format_pct(weekly_ibov)}"
    else:
        ibov_label = f"Sexta · {format_pct(ibov['change_pct'])}"

    date_label_pt = format_date_label_pt(date_str)

    ibov_close_fmt = format_brl_number(ibov["close"], 0)
    usd_close_fmt = format_brl_number(usd["close"], 2)
    wti_close_fmt = format_brl_number(wti["close"], 2)

    ibov_direction = "em alta" if ibov["change_pct"] >= 0 else "em baixa"
    usd_direction = "sobe" if usd["change_pct"] >= 0 else "recua"
    wti_direction = "sobe" if wti["change_pct"] >= 0 else "recua"

    headline = (
        f"Ibovespa fecha {ibov_direction} de {format_pct(abs(ibov['change_pct']))[1:]}, "
        f"aos {ibov_close_fmt} pontos; dólar {usd_direction} a R$ {usd_close_fmt} "
        f"e petróleo (WTI) {wti_direction} a US$ {wti_close_fmt}"
    )

    return {
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "date_label": f"Fechamento · semana encerrada em {date_label_pt}",
        "eyebrow": "Fechamento da semana",
        "h2": "Leitura semanal dos vetores que movem preços",
        "prices": {
            "ibovespa": {
                "value": ibov_close_fmt,
                "change_pct": format_pct(weekly_ibov if weekly_ibov is not None else ibov["change_pct"]),
                "label": ibov_label,
            },
            "usd_brl": {
                "value": format_brl_number(usd["close"], 4),
                "change_pct": format_pct(usd["change_pct"]),
                "label": f"Sexta · {format_pct(usd['change_pct'])}",
            },
            "sp500": {
                "value": format_brl_number(spx["close"], 2),
                "change_pct": format_pct(spx["change_pct"]),
                "label": f"Sexta · {format_pct(spx['change_pct'])}",
            },
            "wti": {
                "value": wti_close_fmt,
                "change_pct": format_pct(wti["change_pct"]),
                "label": f"Sexta · {format_pct(wti['change_pct'])}",
            },
        },
        "report": {
            "headline": headline,
            "paragraph1": paragraphs[0] if len(paragraphs) > 0 else "",
            "paragraph2": paragraphs[1] if len(paragraphs) > 1 else "",
            "paragraph3": paragraphs[2] if len(paragraphs) > 2 else "",
            "next_week": " ".join(extract_agenda_items(html_text)),
            "source_note": (
                "Relatório interno Szuchmacher Consultoria, dados TradingView e "
                f"fontes públicas validadas, referentes à semana encerrada em {date_label_pt}."
            ),
        },
    }


def run_deploy():
    result = subprocess.run(
        ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(DEPLOY_SCRIPT)],
        cwd=str(SITE_PRODUCAO),
        capture_output=True,
        text=True,
    )
    print(result.stdout)
    if result.returncode != 0:
        print(result.stderr, file=sys.stderr)
    return result.returncode


def main():
    date_str = sys.argv[1] if len(sys.argv) > 1 else datetime.now().strftime("%Y%m%d")

    prices = load_prices(date_str)
    html_text = load_html(date_str)

    if prices is None or html_text is None:
        print(
            f"ERRO sync_relatorio_cache: artefatos ausentes para {date_str} "
            f"(precos={'ok' if prices else 'ausente'}, html={'ok' if html_text else 'ausente'})",
            file=sys.stderr,
        )
        return 1

    try:
        cache = build_cache(date_str, prices, html_text)
    except Exception as exc:
        print(f"ERRO sync_relatorio_cache: falha ao montar cache para {date_str}: {exc}", file=sys.stderr)
        return 1

    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=4)
    print(f"OK sync_relatorio_cache: {CACHE_FILE} atualizado para {date_str}")

    deploy_code = run_deploy()
    if deploy_code != 0:
        print(f"ERRO sync_relatorio_cache: deploy-cloudflare.ps1 saiu com codigo {deploy_code}", file=sys.stderr)
        return 1

    print("OK sync_relatorio_cache: deploy concluido")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Verificar sintaxe**

Run: `python -m py_compile "E:\Diretorio\Claude\relatorio-diario-szuchmacher\scripts\sync_relatorio_cache.py"`
Expected: nenhum output, código de saída 0.

---

### Task 2: Dry-run contra os artefatos reais de 03/07 (sem deploy)

Objetivo: confirmar que o script produz um `relatorio_cache.json` estruturalmente e
numericamente igual ao que foi corrigido manualmente nesta sessão, **antes** de
plugar o script nos dois pontos de chamada reais.

**Files:**
- Test: nenhum arquivo novo — roda o script já criado, mas com a chamada de deploy
  comentada temporariamente para o dry-run.

- [ ] **Step 1: Comentar a chamada de deploy temporariamente**

Em `sync_relatorio_cache.py`, dentro de `main()`, comentar as 4 linhas depois de
`print(f"OK sync_relatorio_cache: {CACHE_FILE} atualizado...")` (a chamada a
`run_deploy()` e o bloco `if deploy_code != 0`), deixando só `return 0` no lugar,
por exemplo:

```python
    # DRY-RUN: deploy desabilitado temporariamente para verificacao
    # deploy_code = run_deploy()
    # if deploy_code != 0:
    #     print(f"ERRO sync_relatorio_cache: deploy-cloudflare.ps1 saiu com codigo {deploy_code}", file=sys.stderr)
    #     return 1
    # print("OK sync_relatorio_cache: deploy concluido")
    return 0
```

- [ ] **Step 2: Rodar contra a data 20260703 (artefatos ja existentes)**

Run: `cd "E:\Diretorio\Claude\relatorio-diario-szuchmacher" && python scripts\sync_relatorio_cache.py 20260703`
Expected: `OK sync_relatorio_cache: E:\Diretorio\Claude\Site\site-producao\relatorio_cache.json atualizado para 20260703` — sem nenhuma linha `ERRO`.

- [ ] **Step 3: Conferir o conteudo gerado**

Run: `Get-Content "E:\Diretorio\Claude\Site\site-producao\relatorio_cache.json" | ConvertFrom-Json | Select-Object -ExpandProperty prices`
Expected: `ibovespa.value` = `174.070`, `ibovespa.label` = `Semana · +0,45%` (a extração da variação semanal via regex funcionou), `usd_brl.value` = `5,1689`, `sp500.value` = `7.483,24`, `wti.value` = `68,78` — mesmos números da correção manual feita nesta sessão.

- [ ] **Step 4: Reverter o comentário do Step 1**

Descomentar as linhas de `run_deploy()` removidas no Step 1, restaurando o
arquivo para a versão completa do Task 1 (com deploy ativo).

- [ ] **Step 5: Confirmar reversão**

Run: `python -m py_compile "E:\Diretorio\Claude\relatorio-diario-szuchmacher\scripts\sync_relatorio_cache.py"`
Expected: nenhum output, código de saída 0. Reabrir o arquivo e confirmar visualmente que `run_deploy()` está sendo chamado dentro de `main()`.

---

### Task 3: Plugar na rotina principal (PASSO 6)

**Files:**
- Modify: `C:\Users\User\.claude\scheduled-tasks\fechamento-diario-szuchmacher\SKILL.md`

- [ ] **Step 1: Ler o arquivo atual**

Confirmar que o PASSO 5 termina com a instrução `Registrar no log — linha final
obrigatória: ENVIADO OK` (linha 74 do arquivo, conforme lido durante o brainstorming).

- [ ] **Step 2: Adicionar PASSO 6 logo após o PASSO 5, antes da seção "Proibições"**

Inserir o seguinte bloco entre a seção `## PASSO 5 — Resumo` (que termina em
"Retornar: data, caminho do HTML, quantidade de destinatários BCC.") e a seção
`## Proibições`:

```markdown
## PASSO 6 — Sincronizar relatorio_cache.json (site institucional)

Só executar se o PASSO 4 terminou com `ENVIADO OK` no log.

```powershell
cd E:\Diretorio\Claude\relatorio-diario-szuchmacher
python scripts\sync_relatorio_cache.py
```

Se a saída contiver `ERRO sync_relatorio_cache`, registrar no log e **não**
tentar corrigir manualmente nem repetir — é sinal de artefato do dia incompleto
ou schema inesperado; o widget do site institucional fica um dia atrasado, o
que é aceitável. O e-mail de fechamento já foi enviado no PASSO 4 e essa etapa
não deve bloquear nem reverter esse sucesso.
```

- [ ] **Step 3: Confirmar que o arquivo ainda é markdown+frontmatter válido**

Reler o arquivo inteiro e confirmar que o frontmatter (`---\nname: ...\n---`) no
topo não foi tocado e que a seção `## Proibições` continua logo após o novo
PASSO 6.

---

### Task 4: Plugar no fallback OpenRouter

**Files:**
- Modify: `E:\Diretorio\Claude\relatorio-diario-szuchmacher\scripts\briefing_fallback_openrouter.py`

- [ ] **Step 1: Localizar o caminho de sucesso do envio**

Ler o arquivo e localizar o ponto onde o fallback confirma sucesso do envio de
e-mail (mesmo ponto que hoje gera a linha de log `ENVIADO OK` para o caminho de
fallback, análogo ao que foi visto em `logs/briefing_20260703.log` na entrada
"Geracao manual pos-falha watchdog... ENVIADO OK").

- [ ] **Step 2: Adicionar a chamada ao script de sincronização logo após esse ponto de sucesso**

Adicionar, imediatamente após a confirmação de envio bem-sucedido (mesmo bloco
que registra `ENVIADO OK`), a chamada:

```python
import subprocess

sync_result = subprocess.run(
    [sys.executable, str(Path(__file__).resolve().parent / "sync_relatorio_cache.py")],
    capture_output=True,
    text=True,
)
print(sync_result.stdout)
if sync_result.returncode != 0:
    print(f"AVISO: sync_relatorio_cache falhou apos fallback: {sync_result.stderr}", file=sys.stderr)
```

Se `subprocess` ou `Path`/`sys` não estiverem importados no topo do arquivo,
adicionar os imports faltantes (`import subprocess`, `from pathlib import Path` —
`sys` já deve estar importado dado o uso de `sys.exit`/códigos de saída
identificado durante o brainstorming).

- [ ] **Step 2: Verificar sintaxe**

Run: `python -m py_compile "E:\Diretorio\Claude\relatorio-diario-szuchmacher\scripts\briefing_fallback_openrouter.py"`
Expected: nenhum output, código de saída 0.

---

### Task 5: Verificação final end-to-end (sem esperar até 19h)

**Files:** nenhum novo — só execução.

- [ ] **Step 1: Rodar o script de sync completo (com deploy ativo) uma vez, manualmente, para validar o caminho real**

Run: `cd "E:\Diretorio\Claude\relatorio-diario-szuchmacher" && python scripts\sync_relatorio_cache.py 20260703`
Expected: `OK sync_relatorio_cache: ... atualizado para 20260703` seguido do output do
`deploy-cloudflare.ps1` (build + wrangler deploy) e `OK sync_relatorio_cache: deploy concluido`.

- [ ] **Step 2: Confirmar em produção**

Run: `curl.exe -s "https://szuchmacher.com.br/relatorio_cache.json" -o NUL -w "status=%{http_code}\n"`
Expected: `status=200`. Conferir também visualmente `https://szuchmacher.com.br/relatorios.html` — o widget "Fechamento da Semana" deve mostrar a semana encerrada em 03/07.

- [ ] **Step 3: Resumo para o usuário**

Relatar: script criado e verificado, PASSO 6 plugado na rotina principal, chamada
plugada no fallback, dry-run bateu com a correção manual, deploy real confirmado em
produção. Deixar claro que a causa raiz da falha silenciosa da rotina das 19h em
03/07 (e do exit 5 do fallback) **não foi investigada** — combinado no
brainstorming como fora de escopo desta rodada.

---

## Auto-Revisão do Plano

**Cobertura do spec:** Script único compartilhado (Task 1) ✓, chamado nos dois
pontos de sucesso — rotina principal (Task 3) e fallback (Task 4) ✓, nunca inventa
variação semanal — regex com fallback para diária (Task 1, `extract_weekly_ibov_pct`)
✓, nunca deploya se a escrita falhar (Task 1, `main()` só chama `run_deploy()` após
escrita bem-sucedida) ✓, não toca `cloudflare-workers/sz-sites/src/` (nenhuma task
toca esse diretório) ✓, verificação contra artefato real antes de plugar nos
call sites (Task 2 antes de Task 3/4) ✓.

**Placeholders:** nenhum "TBD"/"implementar depois" — todo código é completo e
executável como escrito.

**Consistência de nomes:** `sync_relatorio_cache.py`, função `build_cache`,
`load_prices`, `load_html`, `run_deploy` usados de forma consistente entre Task 1
(definição) e Tasks 2/3/4 (uso via linha de comando ou import indireto via
subprocess) — Task 4 chama o script como subprocesso (não importa funções Python
diretamente), então não há risco de nome de função divergente entre arquivos.
