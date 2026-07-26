"""
main.py — YAN OS v2.0
Orquestrador central. Roda o pipeline completo diariamente.

Uso:
  python main.py                         # fluxo completo (padrão diário)
  python main.py --manual                # dados via teclado
  python main.py --sem-ia                # só dados + PPTX, sem Claude
  python main.py --so-narrativa          # narrativa com dados já coletados
  python main.py --sem-site              # não publica no site
  python main.py --monitor               # inicia monitor de mercado
  python main.py --leads                 # inicia servidor de leads
  python main.py --instalar              # instala Task Scheduler 18:30
  python main.py --diagnostico-template  # mapa do template PPTX
  python main.py --testar                # diagnóstico completo do sistema
"""

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path

# Corrige UnicodeEncodeError (charmap) em consoles cp1252 (Windows)
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

# Garante que data/ está no path
sys.path.insert(0, str(Path(__file__).parent / "data"))

from coletor          import coletar
from gerador          import gerar_narrativa, revisar_narrativa
from populador        import popular_pptx
try:
    from populador import diagnosticar_template
except ImportError:
    diagnosticar_template = None  # ferramenta de dev opcional
from atualizador_site import atualizar_sites
from config           import (
    ANTHROPIC_API_KEY, BASE_DIR, OUTPUT_DIR,
    DADOS_JSON, TEMPLATE_PPTX, MODELO_CLAUDE,
    garantir_dirs, diagnostico, is_interativo,
)


# ─── Helpers ───────────────────────────────────────────────────────────────

def _checar_template():
    if not TEMPLATE_PPTX.exists():
        print(f"""
╔══════════════════════════════════════════════════╗
║  TEMPLATE PPTX NÃO ENCONTRADO                   ║
║                                                  ║
║  Copie seu arquivo base para:                    ║
║  template/Fechamento_template.pptx               ║
╚══════════════════════════════════════════════════╝
""")
        sys.exit(1)


def _checar_api_key() -> str:
    key = os.environ.get("ANTHROPIC_API_KEY", "") or ANTHROPIC_API_KEY
    if not key:
        print("""
[ERRO] ANTHROPIC_API_KEY não encontrada.

  Opção 1 — no .env:
    ANTHROPIC_API_KEY=sk-ant-...

  Opção 2 — PowerShell:
    $env:ANTHROPIC_API_KEY = "sk-ant-..."
""")
        sys.exit(1)
    return key


def _salvar_dados(dados: dict):
    # Escrita atomica: _carregar_dados() e o caminho do --so-narrativa, que
    # depende deste arquivo estar integro depois de uma coleta interrompida.
    DADOS_JSON.parent.mkdir(parents=True, exist_ok=True)
    tmp = DADOS_JSON.with_suffix(DADOS_JSON.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, DADOS_JSON)
    print(f"[✓] Dados salvos: {DADOS_JSON.name}")


def _carregar_dados() -> dict:
    if not DADOS_JSON.exists():
        print("[ERRO] Sem dados salvos. Execute sem --so-narrativa primeiro.")
        sys.exit(1)
    with open(DADOS_JSON, "r", encoding="utf-8") as f:
        return json.load(f)


def _nome_saida() -> str:
    data_str = datetime.now().strftime("%Y%m%d")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    return str(OUTPUT_DIR / f"Fechamento_Mirabaud_{data_str}.pptx")


def _banner():
    print("\n" + "═" * 52)
    print("  YAN OS — RELATÓRIO SEMANAL DE FECHAMENTO")
    print(f"  {datetime.now().strftime('%A, %d/%m/%Y %H:%M')}")
    print("═" * 52)


def _enviar_email(caminho_pdf: str):
    """Envia o PDF aos assinantes (falha silenciosa)."""
    try:
        from enviador import enviar_briefing_auto
        if enviar_briefing_auto(caminho_pdf):
            print("  ✓ E-mail enviado aos assinantes")
        else:
            print("  ⚠ E-mail não enviado (configure DESTINATARIOS e EMAIL_* no .env)")
    except Exception as e:
        print(f"  ⚠ E-mail: {e}")


# ─── Fluxos ────────────────────────────────────────────────────────────────

def fluxo_completo(api_key: str, contexto_extra: str = "",
                   modo_manual: bool = False, publicar_site: bool = True) -> str:
    """Fluxo padrão: coleta → narrativa → PPTX → PDF → site."""
    _banner()

    # 1. Coleta de dados
    print("\n[1/4] Coletando dados de mercado...")
    dados = coletar(modo_manual=modo_manual)
    _salvar_dados(dados)

    # 2. Contexto do analista
    if contexto_extra:
        print(f"\n[2/4] Contexto: {contexto_extra}")
    elif is_interativo():
        print("\n[2/4] Contexto adicional para a IA (opcional):")
        print("  Ex: Copom amanhã; WTI colapso; foco em juros")
        print("  Pressione ENTER para pular.")
        contexto_extra = input("  > ").strip()
    else:
        print("\n[2/4] Sem contexto extra (run não-interativo).")

    # 3. Narrativa Claude
    print("\n[3/4] Gerando narrativa com Claude...")
    narrativa = gerar_narrativa(dados, api_key, contexto_extra, MODELO_CLAUDE)
    narrativa = revisar_narrativa(narrativa)

    # 4. PPTX
    print("\n[4/4] Gerando PPTX...")
    saida = _nome_saida()
    popular_pptx(str(TEMPLATE_PPTX), dados, narrativa, saida)
    print(f"\n  ✓ PPTX: {saida}")

    # Exportar PDF (usa o PDF se gerado; cai para o PPTX se PowerPoint indisponível)
    from exportador_pdf import exportar_pdf
    pdf = exportar_pdf(saida) or saida

    # 5. Site — relatorio_cache.json (falha silenciosa — não bloqueia o briefing)
    if publicar_site:
        print("\n[+] Publicando relatório (relatorio_cache.json)...")
        try:
            ok = atualizar_sites(dados, narrativa, caminho_pdf=pdf)
            print(f"  {'✓ Relatório publicado' if ok else '⚠ Site: verifique SITE_PASS no .env'}")
        except Exception as e:
            print(f"  ⚠ Site: {e}")
            print("  O relatório foi gerado com sucesso. Publique manualmente se necessário.")

        # 6. E-mail aos assinantes
        _enviar_email(pdf)

    print(f"\n{'═'*52}")
    print(f"  RELATÓRIO CONCLUÍDO: {Path(saida).name}")
    print(f"{'═'*52}\n")
    return saida


def fluxo_sem_ia(modo_manual: bool = False, publicar_site: bool = True) -> str:
    _banner()
    print("\n[Modo sem IA] Coletando dados...")
    dados = coletar(modo_manual=modo_manual)
    _salvar_dados(dados)

    narrativa_vazia = {
        "destaques": ["[preencher]"] * 4,
        "no_radar":  ["• [preencher]"] * 4,
        "drivers":   [{"titulo": "[driver]", "texto": "[texto]"}] * 4,
        "la_trame":  "[La Trame du Jour — preencher manualmente]",
        "agenda":    ["• [preencher]"] * 3,
    }

    saida = _nome_saida()
    popular_pptx(str(TEMPLATE_PPTX), dados, narrativa_vazia, saida)
    print(f"\n  ✓ PPTX (sem narrativa): {saida}")

    if publicar_site:
        try:
            atualizar_sites(dados, narrativa_vazia, caminho_pdf=None)
        except Exception as e:
            print(f"  ⚠ Sites: {e}")

    return saida


def fluxo_so_narrativa(api_key: str, contexto_extra: str = "",
                        publicar_site: bool = True) -> str:
    _banner()
    print("\n[Modo só narrativa] Carregando dados salvos...")
    dados = _carregar_dados()

    if not contexto_extra and is_interativo():
        contexto_extra = input("Contexto adicional (ENTER para pular): ").strip()

    print("Gerando narrativa com Claude...")
    narrativa = gerar_narrativa(dados, api_key, contexto_extra, MODELO_CLAUDE)
    narrativa = revisar_narrativa(narrativa)

    saida = _nome_saida()
    popular_pptx(str(TEMPLATE_PPTX), dados, narrativa, saida)
    print(f"\n  ✓ PPTX: {saida}")

    # Exportar PDF (usa o PDF se gerado; cai para o PPTX se PowerPoint indisponível)
    from exportador_pdf import exportar_pdf
    pdf = exportar_pdf(saida) or saida

    if publicar_site:
        try:
            atualizar_sites(dados, narrativa, caminho_pdf=pdf)
        except Exception as e:
            print(f"  ⚠ Site: {e}")
        _enviar_email(pdf)

    return saida


# ─── Agendamento ────────────────────────────────────────────────────────────

def instalar_tarefa_agendada(hora: str = "18:30", dia: str = "Friday"):
    script = Path(__file__).resolve()
    python = sys.executable

    ps = f"""# YanOS — Task Scheduler (semanal)
$action  = New-ScheduledTaskAction -Execute '{python}' `
           -Argument '{script}' `
           -WorkingDirectory '{script.parent}'
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek {dia} -At '{hora}'
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 20)
Register-ScheduledTask -TaskName 'YanOS_Briefing' `
    -Action $action -Trigger $trigger -Settings $settings -Force
Write-Host 'YanOS: tarefa criada para {dia} as {hora} (semanal)'
"""
    ps_path = script.parent / "instalar_agendamento.ps1"
    ps_path.write_text(ps, encoding="utf-8")
    print(f"""
[✓] Script salvo em: {ps_path}

Execute no PowerShell como Administrador:
  .\\instalar_agendamento.ps1

IMPORTANTE: as variáveis de ambiente (ANTHROPIC_API_KEY, SITE_PASS,
TELEGRAM_BOT_TOKEN) precisam estar definidas como variáveis de SISTEMA
(não de usuário) para que a tarefa agendada as encontre.

Veja a Etapa 8 do GUIA_INSTALACAO.md para instruções detalhadas.
""")


# ─── CLI ─────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="YAN OS — Orquestrador de Market Intelligence",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    parser.add_argument("--sem-ia",       action="store_true")
    parser.add_argument("--so-narrativa", action="store_true")
    parser.add_argument("--manual",       action="store_true")
    parser.add_argument("--sem-site",     action="store_true")
    parser.add_argument("--monitor",      action="store_true")
    parser.add_argument("--leads",        action="store_true")
    parser.add_argument("--instalar",     action="store_true")
    parser.add_argument("--hora",         default="18:30")
    parser.add_argument("--dia",          default="Friday")
    parser.add_argument("--contexto",     default="")
    parser.add_argument("--diagnostico-template", action="store_true")
    parser.add_argument("--testar",       action="store_true")
    parser.add_argument("--config",       action="store_true")
    args = parser.parse_args()

    garantir_dirs()

    # Módulos autônomos
    if args.monitor:
        from monitor_mercado import rodar_monitor
        rodar_monitor()
        return

    if args.leads:
        from qualificador_leads import iniciar_servidor_webhook
        iniciar_servidor_webhook()
        return

    if args.testar:
        import subprocess
        # Caminho absoluto e cwd explicito: com o nome relativo, rodar de fora da
        # pasta do projeto dava "can't open file", e sem checar o returncode o
        # main.py saia 0 — a suite parecia ter passado sem nunca ter rodado.
        base = Path(__file__).parent
        r = subprocess.run([sys.executable, str(base / "testar_sistema.py")], cwd=str(base))
        sys.exit(r.returncode)

    if args.config:
        diagnostico()
        return

    if args.instalar:
        instalar_tarefa_agendada(args.hora, args.dia)
        return

    if args.diagnostico_template:
        _checar_template()
        if diagnosticar_template:
            diagnosticar_template(str(TEMPLATE_PPTX))
        else:
            print("[main] diagnosticar_template indisponível neste build do populador.")
        return

    # Fluxos de briefing
    _checar_template()
    publicar = not args.sem_site

    if args.sem_ia:
        fluxo_sem_ia(modo_manual=args.manual, publicar_site=publicar)
        return

    api_key = _checar_api_key()

    if args.so_narrativa:
        fluxo_so_narrativa(api_key, args.contexto, publicar_site=publicar)
        return

    fluxo_completo(api_key, args.contexto, modo_manual=args.manual,
                   publicar_site=publicar)


if __name__ == "__main__":
    main()
