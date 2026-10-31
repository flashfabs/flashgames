# Runs one node command on the RTX 4090 PC holding the test lock D:\rts\trava-testes, so no end-to-end run of another
# session shares the CPU with a measurement. It queues by ticket in D:\rts\testes\senhas like the test executor
# (scripts/pc-testes/execucao.ps1), first come first served, takes the lock, prints the CPU load before and after, and
# releases the lock even when node fails. Called by ferramentas/rts/rtx-node.sh --quieto; the exit code is node's.
# The node arguments come as base64 of a JSON list, so arguments starting with a dash never meet PowerShell's binder.
param([Parameter(Mandatory = $true)][string]$Sessao, [Parameter(Mandatory = $true)][string]$Argumentos64)
$ErrorActionPreference = "Stop"
$Argumentos = @([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Argumentos64)) | ConvertFrom-Json)
$utf8 = New-Object System.Text.UTF8Encoding $false
$trava = "D:\rts\trava-testes"
$pastaSenhas = "D:\rts\testes\senhas"
$execucao = "medida-" + (Get-Date -Format "yyyyMMdd-HHmmss")
$dono = "$Sessao $execucao pid=$PID $(Get-Date -Format o)"

function Primeira-Senha {
    $agora = Get-Date
    foreach ($s in (Get-ChildItem $pastaSenhas -File -ErrorAction SilentlyContinue | Sort-Object Name)) {
        $conteudo = Get-Content $s.FullName -Raw -ErrorAction SilentlyContinue
        $viva = if ($conteudo -match "pid=(\d+)") { [bool](Get-Process -Id $Matches[1] -ErrorAction SilentlyContinue) } else { $s.LastWriteTime -gt $agora.AddMinutes(-1) }
        if ($viva -and $s.LastWriteTime -gt $agora.AddHours(-4)) { return $s.FullName }
        Remove-Item $s.FullName -ErrorAction SilentlyContinue
    }
    return $null
}

function Carga-Da-Cpu { [int](Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average }

New-Item -ItemType Directory -Force $pastaSenhas | Out-Null
$senha = Join-Path $pastaSenhas ("{0}-{1}-{2}" -f (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssfff"), $Sessao, $execucao)
[IO.File]::WriteAllText($senha, "pid=$PID", $utf8)
$inicio = Get-Date
$pegou = $false
$avisado = ""
try {
    while (-not $pegou) {
        if (-not (Test-Path $senha)) { [IO.File]::WriteAllText($senha, "pid=$PID", $utf8) }
        $primeira = Primeira-Senha
        if ($primeira -and $primeira -ne $senha) {
            if ($primeira -ne $avisado) { Write-Output "FILA esperando a vez de: $(Split-Path $primeira -Leaf)"; $avisado = $primeira }
            Start-Sleep -Seconds 15
            continue
        }
        try {
            New-Item -ItemType Directory -Path $trava -ErrorAction Stop | Out-Null
            [IO.File]::WriteAllText("$trava\dono", $dono, $utf8)
            $pegou = $true
        } catch {
            $atual = if (Test-Path "$trava\dono") { (Get-Content "$trava\dono" -Raw -Encoding UTF8).Trim() } else { "" }
            if ($atual -match "pid=(\d+)" -and -not (Get-Process -Id $Matches[1] -ErrorAction SilentlyContinue)) {
                Write-Output "TRAVA orfa, retomada: $atual"
                Remove-Item "$trava\dono" -ErrorAction SilentlyContinue
                Remove-Item $trava -ErrorAction SilentlyContinue
                continue
            }
            if ($atual -ne $avisado) { Write-Output "TRAVA ocupada por: $atual"; $avisado = $atual }
            Start-Sleep -Seconds 15
        }
    }
    Remove-Item $senha -ErrorAction SilentlyContinue
    Write-Output ("TRAVA pegou depois de {0:N0} s; CARGA antes {1}%" -f ((Get-Date) - $inicio).TotalSeconds, (Carga-Da-Cpu))
    & node @Argumentos
    $codigo = $LASTEXITCODE
    Write-Output "CARGA depois $(Carga-Da-Cpu)%"
    exit $codigo
} finally {
    Remove-Item $senha -ErrorAction SilentlyContinue
    if ($pegou) {
        $atual = if (Test-Path "$trava\dono") { (Get-Content "$trava\dono" -Raw -Encoding UTF8).Trim() } else { "" }
        if ($atual.Contains($execucao)) {
            Remove-Item "$trava\dono" -ErrorAction SilentlyContinue
            Remove-Item $trava -ErrorAction SilentlyContinue
        }
    }
}
