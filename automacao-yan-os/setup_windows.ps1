# setup_windows.ps1 — YAN OS v2.0
# Execute UMA vez para configurar todo o ambiente:
#   Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
#   .\setup_windows.ps1

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║         YAN OS v2.0 — SETUP WINDOWS          ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Verifica Python
Write-Host "[1/6] Verificando Python..." -ForegroundColor Yellow
try {
    $pyVersion = python --version 2>&1
    Write-Host "      ✓ $pyVersion" -ForegroundColor Green
} catch {
    Write-Host "      ✗ Python não encontrado. Instale em python.org" -ForegroundColor Red
    exit 1
}

# Cria ambiente virtual
Write-Host "[2/6] Ambiente virtual..." -ForegroundColor Yellow
if (-Not (Test-Path "venv")) {
    python -m venv venv
    Write-Host "      ✓ Criado" -ForegroundColor Green
} else {
    Write-Host "      ✓ Já existe" -ForegroundColor Green
}

# Ativa e instala dependências
Write-Host "[3/6] Instalando dependências..." -ForegroundColor Yellow
& .\venv\Scripts\Activate.ps1
pip install -r requirements.txt --quiet
if ($LASTEXITCODE -eq 0) {
    Write-Host "      ✓ Dependências instaladas" -ForegroundColor Green
} else {
    Write-Host "      ✗ Erro ao instalar dependências" -ForegroundColor Red
}

# Cria pastas necessárias
Write-Host "[4/6] Criando pastas..." -ForegroundColor Yellow
@("template", "output", "logs") | ForEach-Object {
    New-Item -ItemType Directory -Force -Path $_ | Out-Null
}
Write-Host "      ✓ template/, output/, logs/" -ForegroundColor Green

# Verifica .env
Write-Host "[5/6] Arquivo de configuração..." -ForegroundColor Yellow
if (Test-Path ".env") {
    # Lê e verifica campos críticos
    $envContent = Get-Content ".env" -Raw
    $temClaude = $envContent -match "ANTHROPIC_API_KEY=sk-ant-"
    $temSenhaSite = $envContent -notmatch "SITE_PASS=<<PREENCHER"
    
    if ($temClaude) {
        Write-Host "      ✓ ANTHROPIC_API_KEY preenchida" -ForegroundColor Green
    } else {
        Write-Host "      ⚠ ANTHROPIC_API_KEY ainda não preenchida no .env" -ForegroundColor Red
    }
    if ($temSenhaSite) {
        Write-Host "      ✓ SITE_PASS configurada" -ForegroundColor Green
    } else {
        Write-Host "      ⚠ SITE_PASS ainda não preenchida no .env" -ForegroundColor Yellow
    }
} else {
    Write-Host "      ✗ .env não encontrado!" -ForegroundColor Red
}

# Verifica template PPTX
Write-Host "[6/6] Template PPTX..." -ForegroundColor Yellow
if (Test-Path "template\Fechamento_template.pptx") {
    Write-Host "      ✓ Template encontrado" -ForegroundColor Green
} else {
    Write-Host "      ⚠ Faltando: template\Fechamento_template.pptx" -ForegroundColor Red
    Write-Host "        Copie seu PPTX base para essa pasta e renomeie." -ForegroundColor Gray
}

# Resumo final
Write-Host ""
Write-Host "══════════════════════════════════════════════════" -ForegroundColor DarkGray
Write-Host "PRÓXIMOS PASSOS:" -ForegroundColor White
Write-Host ""
Write-Host "  1. Edite o .env com suas credenciais:" -ForegroundColor White
Write-Host "     notepad .env" -ForegroundColor Cyan
Write-Host ""
Write-Host "  2. Copie o template PPTX:" -ForegroundColor White
Write-Host "     template\Fechamento_template.pptx" -ForegroundColor Cyan
Write-Host ""
Write-Host "  3. Rode o diagnóstico completo:" -ForegroundColor White
Write-Host "     python testar_sistema.py" -ForegroundColor Cyan
Write-Host ""
Write-Host "  4. Primeiro briefing de teste:" -ForegroundColor White
Write-Host "     python main.py --manual --sem-site" -ForegroundColor Cyan
Write-Host ""
Write-Host "  5. Depois de validar tudo, instale o agendamento:" -ForegroundColor White
Write-Host "     # (PowerShell como Administrador)" -ForegroundColor DarkGray
Write-Host "     python main.py --instalar" -ForegroundColor Cyan
Write-Host "     .\instalar_agendamento.ps1" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Ver GUIA_INSTALACAO.md para instruções completas." -ForegroundColor Yellow
Write-Host "══════════════════════════════════════════════════" -ForegroundColor DarkGray
Write-Host ""
