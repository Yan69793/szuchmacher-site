# backup-kv.ps1 - exporta (somente leitura) chaves do KV CACHE do Worker sz-sites.
#
# Uso:
#   .\scripts\backup-kv.ps1 -CountOnly                 # so conta as chaves, nao grava nada
#   .\scripts\backup-kv.ps1                            # exporta subscriber: cifrado (DPAPI)
#   .\scripts\backup-kv.ps1 -Prefixes subscriber:,ent: # prefixos extras
#
# Somente leitura no Cloudflare: usa apenas `wrangler kv key list` e `key get`.
# A saida fica FORA do repositorio (padrao E:\Diretorio\Claude\BACKUPS\kv) e e
# cifrada com DPAPI do usuario Windows atual (so este usuario nesta maquina
# decifra). Os e-mails sao dado pessoal (LGPD): nunca gravar em claro.
# Retencao: mantem os $Keep arquivos mais recentes.
param(
    [string]   $NamespaceId = 'fd40efe1057c4c54b3d33277d4665434',
    [string[]] $Prefixes    = @('subscriber:'),
    [string]   $OutDir      = 'E:\Diretorio\Claude\BACKUPS\kv',
    [int]      $Keep        = 12,
    [switch]   $CountOnly
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security

# Windows PowerShell 5.1 com ErrorActionPreference=Stop transforma qualquer
# linha de stderr de comando nativo (avisos do wrangler) em excecao. Aqui o
# stderr e descartado e so o exit code decide.
function Invoke-Wrangler([string[]] $A) {
    $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try { $out = & npx --no-install wrangler $A 2>$null; $code = $LASTEXITCODE }
    finally { $ErrorActionPreference = $old }
    if ($code -ne 0) { throw "wrangler $($A[0..2] -join ' ') saiu com $code" }
    return $out
}

$workerDir = Join-Path (Split-Path -Parent $PSScriptRoot) 'cloudflare-workers\sz-sites'
Push-Location $workerDir
try {
    $all = @()
    foreach ($p in $Prefixes) {
        $json = Invoke-Wrangler @('kv', 'key', 'list', '--namespace-id', $NamespaceId, '--prefix', $p, '--remote')
        # PS 5.1: ConvertFrom-Json devolve o array JSON como UM objeto; o ForEach desenrola.
        $keys = @(($json -join "`n") | ConvertFrom-Json | ForEach-Object { $_ })
        Write-Host ("{0,-14} {1} chaves" -f $p, $keys.Count)
        $all += $keys
    }
    if ($CountOnly) { Write-Host "Total: $($all.Count) (CountOnly, nada gravado)"; return }

    $items = foreach ($k in $all) {
        $val = Invoke-Wrangler @('kv', 'key', 'get', $k.name, '--namespace-id', $NamespaceId, '--remote', '--text')
        $item = [ordered]@{ key = $k.name; value = ($val -join "`n") }
        if ($k.PSObject.Properties.Name -contains 'expiration' -and $k.expiration) { $item.expiration = [int64]$k.expiration }
        [pscustomobject]$item
    }
    $payload = [ordered]@{
        exported_at  = (Get-Date).ToUniversalTime().ToString('o')
        namespace_id = $NamespaceId
        prefixes     = $Prefixes
        count        = @($items).Count
        items        = @($items)
    } | ConvertTo-Json -Depth 5 -Compress

    if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Force $OutDir | Out-Null }
    $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
    $enc = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, 'CurrentUser')
    $file = Join-Path $OutDir ("kv-cache-{0}.json.dpapi" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
    [IO.File]::WriteAllBytes($file, $enc)
    $sha = (Get-FileHash $file -Algorithm SHA256).Hash
    Write-Host "OK $(@($items).Count) chaves -> $file (sha256 $($sha.Substring(0,12)))"

    Get-ChildItem $OutDir -Filter 'kv-cache-*.json.dpapi' | Sort-Object Name -Descending |
        Select-Object -Skip $Keep | Remove-Item -Force
} finally {
    Pop-Location
}