# restore-kv.ps1 - teste de restauracao de um backup de backup-kv.ps1.
#
# Uso:
#   .\scripts\restore-kv.ps1 -File <arquivo.json.dpapi> -VerifyOnly
#       decifra, valida o JSON e mostra contagem/amostra mascarada. Nao toca no Cloudflare.
#   .\scripts\restore-kv.ps1 -File <arquivo> -TargetNamespaceId <id de TESTE>
#       grava as chaves num namespace de TESTE via `wrangler kv bulk put`.
#
# Guarda: recusa o namespace de producao (CACHE) como destino. Restaurar em
# producao e decisao manual, fora deste script.
param(
    [Parameter(Mandatory)] [string] $File,
    [string] $TargetNamespaceId,
    [switch] $VerifyOnly
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
$PROD = 'fd40efe1057c4c54b3d33277d4665434'

$enc = [IO.File]::ReadAllBytes($File)
$json = [Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($enc, $null, 'CurrentUser'))
$data = $json | ConvertFrom-Json
$items = @($data.items)
if ($items.Count -ne [int]$data.count) { throw "Contagem divergente: cabecalho $($data.count), itens $($items.Count)" }
$bad = @($items | Where-Object { -not $_.key -or $null -eq $_.value })
if ($bad.Count) { throw "$($bad.Count) itens sem key/value" }
Write-Host "Backup de $($data.exported_at): $($items.Count) chaves, prefixos $($data.prefixes -join ',')"
$items | Select-Object -First 3 | ForEach-Object {
    $k = $_.key; $at = $k.LastIndexOf('@')
    $mask = if ($at -gt 0) { $k.Substring(0, [Math]::Min($k.IndexOf(':') + 2, $k.Length)) + '***' + $k.Substring($at) } else { $k.Substring(0, [Math]::Min(12, $k.Length)) + '...' }
    Write-Host "  amostra: $mask"
}
if ($VerifyOnly) { Write-Host 'VerifyOnly: OK, nada gravado.'; return }

if (-not $TargetNamespaceId) { throw 'Informe -TargetNamespaceId (namespace de TESTE) ou use -VerifyOnly.' }
if ($TargetNamespaceId -eq $PROD) { throw 'Recusado: destino e o namespace de producao CACHE.' }

$tmp = Join-Path $env:TEMP ("kv-restore-{0}.json" -f [guid]::NewGuid())
try {
    $bulk = foreach ($i in $items) {
        $o = [ordered]@{ key = $i.key; value = $i.value }
        if ($i.PSObject.Properties.Name -contains 'expiration' -and $i.expiration) { $o.expiration = [int64]$i.expiration }
        [pscustomobject]$o
    }
    [IO.File]::WriteAllText($tmp, ('[' + ((@($bulk) | ForEach-Object { $_ | ConvertTo-Json -Depth 3 -Compress }) -join ',') + ']'), (New-Object Text.UTF8Encoding($false)))
    Push-Location (Join-Path (Split-Path -Parent $PSScriptRoot) 'cloudflare-workers\sz-sites')
    try {
        Invoke-Wrangler @('kv', 'bulk', 'put', $tmp, '--namespace-id', $TargetNamespaceId, '--remote') | Out-Null
        $json2 = Invoke-Wrangler @('kv', 'key', 'list', '--namespace-id', $TargetNamespaceId, '--remote')
        $n = @(($json2 -join "`n") | ConvertFrom-Json | ForEach-Object { $_ }).Count
        Write-Host "Restaurado em $TargetNamespaceId : $n chaves (esperado >= $($items.Count))"
        if ($n -lt $items.Count) { throw 'Restauracao incompleta' }
    } finally { Pop-Location }
} finally {
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
}