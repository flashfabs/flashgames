# Starts lote.ps1 through WMI and returns at once. A process started with Start-Process from an SSH session
# dies when the session ends (it lives in the session's job object); one created by Win32_Process.Create
# does not, so the batch survives the connection that asked for it (tested on 30/10/2026).
# Extra script options come as comma-separated key=value pairs.
param(
    [Parameter(Mandatory)][string]$Asset,
    [Parameter(Mandatory)][string]$Execucao,
    [string]$Argumentos = ""
)
$ErrorActionPreference = "Stop"
foreach ($valor in $Asset, $Execucao, $Argumentos) {
    if ($valor -notmatch '^[A-Za-z0-9._=,/+-]*$') { throw "unsupported characters in '$valor'" }
}
$linha = "powershell -NoProfile -NonInteractive -WindowStyle Hidden -File D:\rts\scripts\pc\lote.ps1 -Asset $Asset -Execucao $Execucao"
if ($Argumentos) { $linha += " -Argumentos $Argumentos" }
$resultado = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $linha; CurrentDirectory = "D:\rts" }
if ($resultado.ReturnValue -ne 0) { throw "Win32_Process.Create returned $($resultado.ReturnValue)" }
Write-Output "LANCADO pid $($resultado.ProcessId)"
