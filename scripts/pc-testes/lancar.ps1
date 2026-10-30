# Starts execucao.ps1 through WMI and returns at once. A process started with Start-Process from an SSH session dies with the session; one created by Win32_Process.Create does not (the same finding as the art front's lancar.ps1).
param(
    [Parameter(Mandatory)][string]$Sessao,
    [Parameter(Mandatory)][string]$Execucao,
    [ValidateSet("e2e", "playwright")][string]$Modo = "e2e",
    [string]$Argumentos = "",
    [int]$Processos = 2
)
$ErrorActionPreference = "Stop"
if ($Sessao -notmatch '^[A-Za-z0-9._-]+$') { throw "unsupported characters in session '$Sessao'" }
if ($Execucao -notmatch '^[0-9-]+$') { throw "unsupported characters in run '$Execucao'" }
if ($Argumentos -notmatch '^[A-Za-z0-9+/=]*$') { throw "the Playwright arguments must come as base64" }
$linha = "powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File D:\rts\testes\scripts\execucao.ps1 -Sessao $Sessao -Execucao $Execucao -Modo $Modo -Processos $Processos"
if ($Argumentos) { $linha += " -Argumentos $Argumentos" }
$resultado = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $linha; CurrentDirectory = "D:\rts\testes" }
if ($resultado.ReturnValue -ne 0) { throw "Win32_Process.Create returned $($resultado.ReturnValue)" }
Write-Output "LANCADO pid $($resultado.ProcessId)"
