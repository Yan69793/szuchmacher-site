# encodar-demo.ps1 — prepara uma gravacao de tela para embed no multi-assets.com
#
# Uso:
#   .\scripts\encodar-demo.ps1 -Entrada "C:\caminho\gravacao.mp4"
#   .\scripts\encodar-demo.ps1 -Entrada "gravacao.mp4" -Largura 1280 -Poster 3
#
# Gera, em site-producao/assets/video/:
#   demo-multiasset.mp4   H.264, compativel com tudo
#   demo-multiasset.webm  AV1, ~40% menor, para quem suporta
#   demo-multiasset.jpg   poster estatico (frame escolhido)
#
# O <video> serve o WebM primeiro; quem nao suportar cai no MP4.

param(
    [Parameter(Mandatory = $true)][string]$Entrada,
    [int]$Largura = 1280,
    [double]$Poster = 1.0,          # segundo do frame usado como poster
    [string]$Nome  = 'demo-multiasset'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Test-Path $Entrada)) { throw "Arquivo nao encontrado: $Entrada" }

$RAIZ = Split-Path -Parent $PSScriptRoot
$OUT  = Join-Path $RAIZ 'assets\video'
New-Item -ItemType Directory -Path $OUT -Force | Out-Null

$mp4    = Join-Path $OUT "$Nome.mp4"
$webm   = Join-Path $OUT "$Nome.webm"
$jpg    = Join-Path $OUT "$Nome.jpg"
# largura par: alguns encoders rejeitam dimensao impar
$escala = "scale=${Largura}:trunc(ow/a/2)*2"

Write-Host "`n=== ENCODANDO DEMO ===" -ForegroundColor Cyan
Write-Host "  entrada: $Entrada"
Write-Host "  largura: ${Largura}px`n"

# --- H.264: fallback universal ---------------------------------------------
# faststart move o indice para o inicio: o video comeca a tocar sem baixar tudo
# crf 23 + preset slow: bom equilibrio para captura de tela (pouco ruido)
Write-Host "[1/3] MP4 (H.264)..." -ForegroundColor Green
& ffmpeg -hide_banner -loglevel error -y -i $Entrada `
    -vf $escala -c:v libx264 -crf 23 -preset slow -pix_fmt yuv420p `
    -movflags +faststart -an $mp4

# --- AV1: menor, para navegadores que suportam ------------------------------
# svt-av1 e ordens de grandeza mais rapido que libaom com qualidade equivalente
Write-Host "[2/3] WebM (AV1)..." -ForegroundColor Green
& ffmpeg -hide_banner -loglevel error -y -i $Entrada `
    -vf $escala -c:v libsvtav1 -crf 34 -preset 6 -pix_fmt yuv420p `
    -an $webm

# --- Poster estatico --------------------------------------------------------
Write-Host "[3/3] Poster..." -ForegroundColor Green
# -pix_fmt yuvj420p: fontes VP8/VP9 vem em faixa limitada e o encoder mjpeg
# recusa ("Non full-range YUV is non-standard"), falhando sem gerar o arquivo
& ffmpeg -hide_banner -loglevel error -y -ss $Poster -i $Entrada `
    -vf $escala -frames:v 1 -q:v 3 -pix_fmt yuvj420p $jpg

if (-not (Test-Path $jpg)) { throw "Poster nao foi gerado a partir de $Entrada" }

# --- Relatorio --------------------------------------------------------------
$dados = ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 $mp4
$w, $h = $dados.Split('x')
$ratio = [math]::Round([double]$w / [double]$h, 4)

Write-Host "`n=== RESULTADO ===" -ForegroundColor Cyan
foreach ($f in @($mp4, $webm, $jpg)) {
    $kb = [math]::Round((Get-Item $f).Length / 1KB, 0)
    Write-Host ("  {0,-24} {1,6} KB" -f (Split-Path $f -Leaf), $kb)
}
Write-Host "`n  dimensoes: ${w}x${h}   aspect-ratio: $ratio"
Write-Host "`n  Use aspect-ratio: $ratio no CSS para nao causar layout shift.`n" -ForegroundColor Yellow
