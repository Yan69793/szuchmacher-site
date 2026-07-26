"""
agendar_briefing.py
===================
Script de execução automática do Fechamento de Mercado Mirabaud.
Invocado pelo Windows Task Scheduler às 18:30 em dias úteis.

Fluxo completo:
  1. Valida que é dia útil (não roda em fins de semana)
  2. Chama main.py com --contexto vazio (modo headless, sem input interativo)
  3. Exporta o PPTX gerado para PDF via COM automation (PowerPoint)
  4. Copia PPTX e PDF para a pasta output com nome datado
  5. Registra log em logs/briefing_YYYYMMDD.log

Uso:
  python agendar_briefing.py                      # execução normal
  python agendar_briefing.py --forcar             # força mesmo em fim de semana/feriado
  python agendar_briefing.py --so-pdf             # apenas exporta PDF do último PPTX gerado

Pré-requisitos:
  - ANTHROPIC_API_KEY definida como variável de ambiente do SISTEMA (não de usuário)
  - Microsoft PowerPoint instalado (para exportação PDF via COM)
  - python-pptx, python-dotenv instalados no venv
  - Executar sempre a partir de E:\\Site\\HTML's\\files
"""

import argparse
import glob
import logging
import os
import subprocess
import sys
from datetime import date, datetime
from pathlib import Path

# ---------------------------------------------------------------------------
# Caminhos base — ajuste se a estrutura mudar
# ---------------------------------------------------------------------------
BASE_DIR    = Path(__file__).parent
OUTPUT_DIR  = BASE_DIR / "output"
LOGS_DIR    = BASE_DIR / "logs"
MAIN_PY     = BASE_DIR / "main.py"
PYTHON_EXE  = sys.executable   # mesmo interpretador que está rodando este script

# Este script não importava config, então load_dotenv() nunca rodava aqui: quem
# seguiu o .env.example e pôs a ANTHROPIC_API_KEY só no .env tinha a tarefa
# agendada saindo com exit(1) em _checar_api_key, enquanto `python main.py`
# funcionava normalmente. Carregar o .env alinha os dois pontos de entrada.
try:
    from dotenv import load_dotenv
    load_dotenv(BASE_DIR / ".env")
except ImportError:
    pass   # sem python-dotenv, vale só a variável de ambiente do sistema

# Feriados nacionais Brasil 2026 (B3 fechada)
# Fonte: calendário B3 + Decreto federal
FERIADOS_BR_2026 = {
    date(2026, 1,  1),   # Ano Novo
    date(2026, 2, 16),   # Carnaval (segunda)
    date(2026, 2, 17),   # Carnaval (terça)
    date(2026, 4,  3),   # Sexta-feira Santa
    date(2026, 4, 21),   # Tiradentes
    date(2026, 5,  1),   # Dia do Trabalho
    date(2026, 6,  4),   # Corpus Christi
    date(2026, 9,  7),   # Independência
    date(2026, 10, 12),  # Nossa Senhora Aparecida
    date(2026, 11,  2),  # Finados
    date(2026, 11, 15),  # Proclamação da República
    date(2026, 11, 20),  # Consciência Negra
    date(2026, 12, 25),  # Natal
}


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
def _configurar_log(data_str: str) -> logging.Logger:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    log_path = LOGS_DIR / f"briefing_{data_str}.log"

    logger = logging.getLogger("briefing")
    logger.setLevel(logging.DEBUG)

    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")

    # Console
    ch = logging.StreamHandler()
    ch.setFormatter(fmt)
    logger.addHandler(ch)

    # Arquivo
    fh = logging.FileHandler(log_path, encoding="utf-8")
    fh.setFormatter(fmt)
    logger.addHandler(fh)

    return logger


# ---------------------------------------------------------------------------
# Validações
# ---------------------------------------------------------------------------
def _e_dia_util(hoje: date, forcar: bool, log: logging.Logger) -> bool:
    """Retorna True se deve executar hoje."""
    if forcar:
        log.info("Flag --forcar ativa: ignorando validação de dia útil.")
        return True

    if hoje.weekday() >= 5:  # 5=sábado, 6=domingo
        log.info(f"Hoje é {hoje.strftime('%A')} — fim de semana. Briefing não gerado.")
        return False

    if hoje in FERIADOS_BR_2026:
        log.info(f"Hoje ({hoje.strftime('%d/%m/%Y')}) é feriado B3. Briefing não gerado.")
        return False

    return True


def _checar_api_key(log: logging.Logger):
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        log.error(
            "ANTHROPIC_API_KEY não encontrada.\n"
            "Defina-a como variável de ambiente do SISTEMA no Windows:\n"
            "  Painel de Controle > Sistema > Variáveis de ambiente > Sistema > Nova\n"
            "  Nome: ANTHROPIC_API_KEY  |  Valor: sk-ant-..."
        )
        sys.exit(1)
    log.info("ANTHROPIC_API_KEY encontrada.")


# ---------------------------------------------------------------------------
# Etapa 1: gerar PPTX via main.py
# ---------------------------------------------------------------------------
def _gerar_pptx(data_str: str, log: logging.Logger) -> Path:
    """
    Chama main.py em modo headless (--contexto vazio).
    Retorna o caminho do PPTX gerado.
    """
    log.info("Iniciando geração do briefing (main.py --contexto '')...")

    cmd = [
        PYTHON_EXE, str(MAIN_PY),
        "--contexto", ""
    ]

    try:
        result = subprocess.run(
            cmd,
            cwd=str(BASE_DIR),
            capture_output=True,
            text=True,
            timeout=600,   # 10 minutos de timeout
            env=os.environ.copy(),
        )
    except subprocess.TimeoutExpired:
        log.error("main.py excedeu o timeout de 10 minutos. Abortando.")
        sys.exit(1)

    if result.stdout:
        for linha in result.stdout.strip().splitlines():
            log.info(f"[main.py] {linha}")
    if result.stderr:
        for linha in result.stderr.strip().splitlines():
            log.warning(f"[main.py stderr] {linha}")

    if result.returncode != 0:
        log.error(f"main.py terminou com código {result.returncode}. Verifique o log acima.")
        sys.exit(1)

    # Localiza o PPTX gerado (padrão: output/Fechamento_Mirabaud_YYYYMMDD.pptx)
    padrao = str(OUTPUT_DIR / f"Fechamento_Mirabaud_{data_str}.pptx")
    candidatos = glob.glob(padrao)

    if not candidatos:
        # Fallback: pega o PPTX mais recente na pasta output
        todos = sorted(OUTPUT_DIR.glob("*.pptx"), key=lambda p: p.stat().st_mtime, reverse=True)
        if not todos:
            log.error(f"Nenhum PPTX encontrado em {OUTPUT_DIR}. Verifique main.py.")
            sys.exit(1)
        pptx_path = todos[0]
        log.warning(f"PPTX com data exata não encontrado. Usando o mais recente: {pptx_path.name}")
    else:
        pptx_path = Path(candidatos[0])

    log.info(f"PPTX gerado: {pptx_path}")
    return pptx_path


# ---------------------------------------------------------------------------
# Etapa 2: exportar PDF via COM (Microsoft PowerPoint)
# ---------------------------------------------------------------------------
def _exportar_pdf_com(pptx_path: Path, log: logging.Logger) -> Path:
    """
    Exporta PPTX para PDF usando Microsoft PowerPoint via COM automation.
    Requer PowerPoint instalado. Retorna o caminho do PDF gerado.
    """
    pdf_path = pptx_path.with_suffix(".pdf")
    log.info(f"Exportando PDF via PowerPoint COM: {pdf_path.name}...")

    # Script PowerShell inline para exportação COM
    ps_cmd = f"""
$pptPath = '{str(pptx_path).replace("'", "''")}';
$pdfPath = '{str(pdf_path).replace("'", "''")}';

$ppt = New-Object -ComObject PowerPoint.Application;
$ppt.Visible = [Microsoft.Office.Core.MsoTriState]::msoFalse;

try {{
    $presentation = $ppt.Presentations.Open($pptPath, [Microsoft.Office.Core.MsoTriState]::msoFalse, [Microsoft.Office.Core.MsoTriState]::msoFalse, [Microsoft.Office.Core.MsoTriState]::msoFalse);
    $presentation.SaveAs($pdfPath, 32);  # 32 = ppSaveAsPDF
    $presentation.Close();
    Write-Host 'PDF exportado com sucesso.';
}} catch {{
    Write-Error $_.Exception.Message;
    exit 1;
}} finally {{
    $ppt.Quit();
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($ppt) | Out-Null;
    [GC]::Collect();
}}
"""

    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_cmd],
            capture_output=True,
            text=True,
            timeout=120,
        )
    except subprocess.TimeoutExpired:
        log.error("Exportação PDF via COM excedeu 120 segundos.")
        sys.exit(1)

    if result.stdout:
        log.info(f"[PowerShell] {result.stdout.strip()}")
    if result.stderr:
        log.warning(f"[PowerShell stderr] {result.stderr.strip()}")

    if result.returncode != 0:
        log.error("Falha na exportação PDF via COM. Tentando fallback com LibreOffice...")
        return _exportar_pdf_libreoffice(pptx_path, log)

    if not pdf_path.exists():
        log.error(f"PDF não encontrado após exportação: {pdf_path}")
        sys.exit(1)

    log.info(f"PDF gerado: {pdf_path}")
    return pdf_path


def _exportar_pdf_libreoffice(pptx_path: Path, log: logging.Logger) -> Path:
    """
    Fallback: exporta via LibreOffice se PowerPoint COM falhar.
    """
    log.info("Tentando exportação via LibreOffice (fallback)...")

    soffice_candidates = [
        r"C:\Program Files\LibreOffice\program\soffice.exe",
        r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
        "soffice",
    ]

    soffice = None
    for candidate in soffice_candidates:
        if Path(candidate).exists() or candidate == "soffice":
            soffice = candidate
            break

    if not soffice:
        log.error("LibreOffice não encontrado. Instale PowerPoint ou LibreOffice.")
        sys.exit(1)

    result = subprocess.run(
        [soffice, "--headless", "--convert-to", "pdf", str(pptx_path),
         "--outdir", str(pptx_path.parent)],
        capture_output=True,
        text=True,
        timeout=120,
    )

    pdf_path = pptx_path.with_suffix(".pdf")

    if result.returncode != 0 or not pdf_path.exists():
        log.error(f"LibreOffice também falhou. stderr: {result.stderr}")
        sys.exit(1)

    log.info(f"PDF gerado via LibreOffice: {pdf_path}")
    return pdf_path


# ---------------------------------------------------------------------------
# Etapa 3: renomear/copiar com data formatada para entrega final
# ---------------------------------------------------------------------------
def _organizar_saida(pptx_path: Path, pdf_path: Path, data_br: str, log: logging.Logger):
    """
    Garante que os arquivos finais têm o nome no formato
    Fechamento_de_Mercado_DD_MM_YY.pptx / .pdf na pasta output.
    """
    nome_final = f"Fechamento_de_Mercado_{data_br}"

    pptx_final = OUTPUT_DIR / f"{nome_final}.pptx"
    pdf_final  = OUTPUT_DIR / f"{nome_final}.pdf"

    # Renomeia apenas se o nome ainda não está no formato correto
    if pptx_path.name != pptx_final.name:
        pptx_path.rename(pptx_final)
        log.info(f"PPTX renomeado para: {pptx_final.name}")
        pptx_path = pptx_final

    if pdf_path.name != pdf_final.name:
        pdf_path.rename(pdf_final)
        log.info(f"PDF renomeado para: {pdf_final.name}")
        pdf_path = pdf_final

    return pptx_path, pdf_path


# ---------------------------------------------------------------------------
# Modo --so-pdf: apenas exporta PDF do último PPTX
# ---------------------------------------------------------------------------
def _so_pdf(log: logging.Logger):
    todos = sorted(OUTPUT_DIR.glob("*.pptx"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not todos:
        log.error(f"Nenhum PPTX encontrado em {OUTPUT_DIR}.")
        sys.exit(1)
    pptx_path = todos[0]
    log.info(f"Modo --so-pdf: exportando {pptx_path.name}")
    pdf_path = _exportar_pdf_com(pptx_path, log)
    log.info(f"Concluído. PDF: {pdf_path}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Agendador do Briefing Mirabaud")
    parser.add_argument("--forcar",   action="store_true", help="Força execução mesmo em feriado/fim de semana")
    parser.add_argument("--so-pdf",   action="store_true", help="Apenas exporta PDF do último PPTX gerado")
    args = parser.parse_args()

    hoje     = date.today()
    data_str = hoje.strftime("%Y%m%d")            # 20260330 — usado internamente
    data_br  = hoje.strftime("%d_%m_%y")          # 30_03_26 — nome final dos arquivos

    log = _configurar_log(data_str)
    log.info(f"{'='*55}")
    log.info(f"BRIEFING MIRABAUD — {hoje.strftime('%d/%m/%Y')}")
    log.info(f"{'='*55}")

    if args.so_pdf:
        _so_pdf(log)
        return

    if not _e_dia_util(hoje, args.forcar, log):
        sys.exit(0)

    _checar_api_key(log)

    # Etapa 1: gerar PPTX
    pptx_path = _gerar_pptx(data_str, log)

    # Etapa 2: exportar PDF
    pdf_path = _exportar_pdf_com(pptx_path, log)

    # Etapa 3: organizar nomes finais
    pptx_final, pdf_final = _organizar_saida(pptx_path, pdf_path, data_br, log)

    log.info(f"{'='*55}")
    log.info(f"CONCLUÍDO")
    log.info(f"  PPTX: {pptx_final}")
    log.info(f"  PDF:  {pdf_final}")
    log.info(f"{'='*55}")


if __name__ == "__main__":
    main()
