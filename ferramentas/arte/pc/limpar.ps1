# Keeps only the newest runs of each asset in D:\rts\saida and empties old temp files in D:\rts\cache.
# Unless -Apagar is "sim" it only lists what would go.
param(
    [int]$Manter = 2,
    [string]$Apagar = "nao"
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$alvos = @()
foreach ($asset in Get-ChildItem D:\rts\saida -Directory -ErrorAction SilentlyContinue) {
    $execucoes = @(Get-ChildItem $asset.FullName -Directory | Sort-Object Name -Descending)
    if ($execucoes.Count -gt $Manter) { $alvos += $execucoes[$Manter..($execucoes.Count - 1)] }
}
$alvos += @(Get-ChildItem D:\rts\cache -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-1) })
$total = 0
foreach ($alvo in $alvos) {
    $tamanho = if ($alvo.PSIsContainer) { (Get-ChildItem $alvo.FullName -Recurse -File | Measure-Object Length -Sum).Sum } else { $alvo.Length }
    $total += $tamanho
    Write-Output ("{0} {1:N1} MB" -f $alvo.FullName, ($tamanho / 1MB))
    if ($Apagar -eq "sim") { Remove-Item -LiteralPath $alvo.FullName -Recurse -Force }
}
Write-Output ("LIMPEZA {0} itens, {1:N1} MB {2}" -f $alvos.Count, ($total / 1MB), $(if ($Apagar -eq "sim") { "apagados" } else { "a apagar (rode com --apagar)" }))
