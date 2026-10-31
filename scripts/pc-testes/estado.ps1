# Shows the test and GPU locks of the PC, the queue for the test lock, and the newest runs of a session with their state.
param([string]$Sessao = "")
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
foreach ($trava in "D:\rts\trava-testes", "D:\rts\trava-gpu") {
    if (Test-Path "$trava\dono") { Write-Output "$trava ocupada por: $((Get-Content "$trava\dono" -Raw -Encoding UTF8).Trim())" }
    elseif (Test-Path $trava) { Write-Output "$trava ocupada (no owner file)" }
    else { Write-Output "$trava livre" }
}
# the queue of runs waiting for the test lock, oldest first (tickets of execucao.ps1)
Get-ChildItem "D:\rts\testes\senhas" -File -ErrorAction SilentlyContinue | Sort-Object Name | ForEach-Object { Write-Output "na fila: $($_.Name)" }
if ($Sessao -and (Test-Path "D:\rts\testes\$Sessao\execucoes")) {
    Get-ChildItem "D:\rts\testes\$Sessao\execucoes" -Directory | Sort-Object Name -Descending | Select-Object -First 5 | ForEach-Object {
        $arquivo = "$($_.FullName)\estado.json"
        $situacao = if (Test-Path $arquivo) { (Get-Content $arquivo -Raw -Encoding UTF8 | ConvertFrom-Json).estado } else { "sem estado" }
        Write-Output "execucao $($_.Name): $situacao"
    }
}
