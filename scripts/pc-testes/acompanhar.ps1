# Follows a run of execucao.ps1: prints the step, lock, failure and summary lines of its log as they appear, and returns when estado.json says the run ended.
# Exit 0 when every step passed, 1 when one failed, 3 when the run never started, 2 when this follow timed out (the run keeps going on the PC).
param(
    [Parameter(Mandatory)][string]$Sessao,
    [Parameter(Mandatory)][string]$Execucao,
    [int]$LimiteMinutos = 240
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
$saida = "D:\rts\testes\$Sessao\execucoes\$Execucao"
$log = "$saida\testes.log"
$estado = "$saida\estado.json"
$falhou = [string][char]0x2718
$interessa = "^(PASSO|TRAVA|PLACA|PREPARO|AVISO|ERRO)|$falhou|^\s+\d+ (passed|failed|flaky|skipped|did not run)|^\s+\d+\) \["
$lidas = 0
$comeco = Get-Date
$limite = $comeco.AddMinutes($LimiteMinutos)
while ($true) {
    if (Test-Path $log) {
        $linhas = @(Get-Content $log -Encoding UTF8 -ErrorAction SilentlyContinue)
        for ($i = $lidas; $i -lt $linhas.Count; $i++) {
            if ($linhas[$i] -match $interessa) { Write-Output $linhas[$i] }
        }
        $lidas = $linhas.Count
    }
    if (Test-Path $estado) {
        $dados = Get-Content $estado -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($dados.estado -eq "ok" -or $dados.estado -eq "erro") {
            Write-Output ("ESTADO " + ($dados | ConvertTo-Json -Compress -Depth 5))
            if ($dados.estado -eq "ok") { exit 0 } else { exit 1 }
        }
    } elseif (((Get-Date) - $comeco).TotalSeconds -gt 90) {
        Write-Output "ESTADO execucao.ps1 never started (no estado.json after 90 s)"
        exit 3
    }
    if ((Get-Date) -gt $limite) { Write-Output "ESTADO follow timed out; the run keeps going on the PC"; exit 2 }
    Start-Sleep -Seconds 3
}
