# Pre-flight check before a GPU batch on the RTX 4090 PC: free space on C: and D:, size of D:\rts,
# free VRAM (the WhatsApp sync in WSL also uses the GPU), running Blender processes and the GPU lock.
# Prints one line "CHECAGEM <json>" and exits 1 when any limit is broken.
param(
    [double]$MinLivreCGB = 5,
    [double]$MinLivreDGB = 12,
    [double]$TetoRtsGB = 12,
    [int]$MinVramMiB = 6000
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$problemas = @()
$livre = @{}
foreach ($letra in "C", "D") {
    $livre[$letra] = [math]::Round((Get-PSDrive $letra).Free / 1GB, 1)
}
if ($livre["C"] -lt $MinLivreCGB) { $problemas += "C: has $($livre['C']) GB free, below $MinLivreCGB" }
if ($livre["D"] -lt $MinLivreDGB) { $problemas += "D: has $($livre['D']) GB free, below $MinLivreDGB" }

$tamanhoRts = (Get-ChildItem D:\rts -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
$tamanhoRtsGB = [math]::Round(($tamanhoRts / 1GB), 2)
if ($tamanhoRtsGB -gt $TetoRtsGB) { $problemas += "D:\rts uses $tamanhoRtsGB GB, above the $TetoRtsGB GB budget" }

$gpu = (& nvidia-smi --query-gpu=name,memory.free,memory.used,utilization.gpu --format=csv,noheader,nounits) -split ",\s*"
$vramLivre = [int]$gpu[1]
if ($vramLivre -lt $MinVramMiB) { $problemas += "only $vramLivre MiB of VRAM free, below $MinVramMiB" }

$blenders = @(Get-Process blender -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
$dono = $null
if (Test-Path D:\rts\trava-gpu\dono) { $dono = (Get-Content D:\rts\trava-gpu\dono -Raw).Trim() }

$resultado = [ordered]@{
    ok = ($problemas.Count -eq 0)
    problemas = $problemas
    livreGB = $livre
    rtsGB = $tamanhoRtsGB
    gpu = $gpu[0]
    vramLivreMiB = $vramLivre
    vramUsadaMiB = [int]$gpu[2]
    usoGpu = [int]$gpu[3]
    blenderRodando = $blenders
    travaDono = $dono
    energia = ((& powercfg /getactivescheme) -replace "^.*\(", "" -replace "\)\s*$", "")
}
Write-Output ("CHECAGEM " + ($resultado | ConvertTo-Json -Compress -Depth 4))
if ($problemas.Count -gt 0) { exit 1 }
