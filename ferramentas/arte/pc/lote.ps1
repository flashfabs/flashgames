# Runs one Blender batch detached from the SSH session, so a dropped connection or a sleeping Mac does not
# kill it. Extra script options come as comma-separated key=value pairs (no leading dashes, which
# PowerShell would read as parameter names) and become --key value. Blender output goes to a log on D:, the state goes to estado.json and the GPU lock taken by
# rtx.sh is released here, in finally, whatever happens.
param(
    [Parameter(Mandatory)][string]$Asset,
    [Parameter(Mandatory)][string]$Execucao,
    [string]$Argumentos = ""
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$blender = "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
$pasta = "D:\rts\saida\$Asset\$Execucao"
$log = "$pasta\blender.log"
$estado = "$pasta\estado.json"
New-Item -ItemType Directory -Force -Path $pasta | Out-Null
New-Item -ItemType Directory -Force -Path "D:\rts\cache\tmp" | Out-Null

function Gravar-Estado($dados) {
    $dados | ConvertTo-Json -Compress | Set-Content -Path $estado -Encoding UTF8
}

$inicio = Get-Date
Gravar-Estado ([ordered]@{ estado = "rodando"; inicio = $inicio.ToString("o"); pid = $PID })
$codigo = $null
try {
    # Blender and Cycles temp files go to D:, never to the small C: drive.
    $env:TEMP = "D:\rts\cache\tmp"
    $env:TMP = "D:\rts\cache\tmp"
    $lista = @("-b", "--factory-startup", "--python-exit-code", "1", "-P", "D:\rts\scripts\blender\renderizar.py", "--",
        "--asset", $Asset, "--saida", $pasta, "--projecao", "D:\rts\config\projecao.json")
    foreach ($par in ($Argumentos -split "," | Where-Object { $_ })) {
        $chave, $valor = $par -split "=", 2
        $lista += "--$chave"
        if ($null -ne $valor) { $lista += $valor }
    }
    $citados = $lista | ForEach-Object { if ($_ -match "\s") { '"' + $_ + '"' } else { $_ } }
    $processo = Start-Process -FilePath $blender -ArgumentList $citados -NoNewWindow -PassThru `
        -RedirectStandardOutput $log -RedirectStandardError "$pasta\blender.err.log"
    # Reading Handle now is what makes ExitCode available after the wait in Windows PowerShell 5.1.
    $null = $processo.Handle
    $processo.WaitForExit()
    $codigo = $processo.ExitCode
} catch {
    Add-Content -Path $log -Value "LOTE erro: $_"
    $codigo = -1
} finally {
    $fim = Get-Date
    Gravar-Estado ([ordered]@{
        estado = $(if ($codigo -eq 0) { "ok" } else { "erro" })
        codigo = $codigo
        inicio = $inicio.ToString("o")
        fim = $fim.ToString("o")
        segundos = [math]::Round(($fim - $inicio).TotalSeconds, 1)
    })
    $dono = if (Test-Path D:\rts\trava-gpu\dono) { Get-Content D:\rts\trava-gpu\dono -Raw } else { "" }
    if ($dono.Contains($Execucao)) {
        Remove-Item D:\rts\trava-gpu\dono -ErrorAction SilentlyContinue
        Remove-Item D:\rts\trava-gpu -ErrorAction SilentlyContinue
    }
}
