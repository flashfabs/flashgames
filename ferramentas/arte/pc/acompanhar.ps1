# Follows a batch started by lote.ps1: prints the progress and error lines of the Blender log as they appear
# and returns when estado.json says the batch ended (exit 0 for ok, 1 for error, 3 when it never started).
param(
    [Parameter(Mandatory)][string]$Asset,
    [Parameter(Mandatory)][string]$Execucao,
    [int]$LimiteMinutos = 60
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$pasta = "D:\rts\saida\$Asset\$Execucao"
$log = "$pasta\blender.log"
$estado = "$pasta\estado.json"
$lidas = 0
$comeco = Get-Date
$limite = $comeco.AddMinutes($LimiteMinutos)
while ($true) {
    if (Test-Path $log) {
        $linhas = @(Get-Content $log -ErrorAction SilentlyContinue)
        for ($i = $lidas; $i -lt $linhas.Count; $i++) {
            if ($linhas[$i] -match "^(PROGRESSO|RESUMO|AVISO|ERRO)|Traceback|Error|error:") { Write-Output $linhas[$i] }
        }
        $lidas = $linhas.Count
    }
    if (Test-Path $estado) {
        $dados = Get-Content $estado -Raw | ConvertFrom-Json
        if ($dados.estado -ne "rodando") {
            Write-Output ("ESTADO " + ($dados | ConvertTo-Json -Compress))
            if (Test-Path "$pasta\blender.err.log") {
                Get-Content "$pasta\blender.err.log" | Where-Object { $_ -match "Traceback|Error|error|File " } | Select-Object -Last 20
            }
            if ($dados.estado -eq "ok") { exit 0 } else { exit 1 }
        }
    }
    if (-not (Test-Path $estado) -and ((Get-Date) - $comeco).TotalSeconds -gt 60) {
        Write-Output "ESTADO lote.ps1 never started (no estado.json after 60 s)"
        exit 3
    }
    if ((Get-Date) -gt $limite) { Write-Output "ESTADO acompanhamento esgotado; o lote segue no PC"; exit 2 }
    Start-Sleep -Seconds 2
}
