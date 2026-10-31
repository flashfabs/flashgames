# One end-to-end test run of a session on the RTX 4090 PC, started by lancar.ps1 through WMI so it survives the SSH connection.
# It waits for the test lock D:\rts\trava-testes (one run at a time on the PC), unpacks the session's tree next to its cached node_modules, runs npm ci only when package-lock.json changed, installs the Playwright browsers on D:, and runs the Playwright steps.
# Performance steps first check which ANGLE backend reaches the NVIDIA card and also hold the GPU lock D:\rts\trava-gpu, so they never measure next to a Blender batch.
# Everything it learns goes to D:\rts\testes\<session>\execucoes\<run>: testes.log, estado.json, resumo.txt, one JSON report and one output folder per step.
# Every run also appends one line to D:\rts\testes\fila.log (start, session, run, seconds waiting for the test lock, total seconds, exit code), to measure the queue across sessions.
param(
    [Parameter(Mandatory)][string]$Sessao,
    [Parameter(Mandatory)][string]$Execucao,
    [ValidateSet("e2e", "rts", "playwright")][string]$Modo = "e2e",
    [string]$Argumentos = "",
    [int]$Processos = 2
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$utf8 = New-Object System.Text.UTF8Encoding $false
$pasta = "D:\rts\testes\$Sessao"
$arvore = "$pasta\arvore"
$saida = "$pasta\execucoes\$Execucao"
$estado = "$saida\estado.json"
$log = "$saida\testes.log"
$resumo = "$saida\resumo.txt"
$travaTestes = "D:\rts\trava-testes"
$travaGpu = "D:\rts\trava-gpu"
$fila = "D:\rts\testes\fila.log"
$pastaSenhas = "D:\rts\testes\senhas"
New-Item -ItemType Directory -Force -Path $saida, "D:\rts\cache\tmp-testes", "D:\rts\npm-cache", "D:\rts\playwright" | Out-Null
[IO.File]::WriteAllText($log, "", $utf8)

function Registrar([string]$texto) { [IO.File]::AppendAllText($log, "$texto`r`n", $utf8) }
function Gravar-Estado($dados) { [IO.File]::WriteAllText($estado, ($dados | ConvertTo-Json -Compress -Depth 5), $utf8) }

function Dono-Da-Trava([string]$caminho) {
    if (Test-Path "$caminho\dono") { return (Get-Content "$caminho\dono" -Raw -Encoding UTF8).Trim() }
    if (Test-Path $caminho) { return "(no owner file)" }
    return $null
}

function Soltar-Trava([string]$caminho) {
    $dono = Dono-Da-Trava $caminho
    # only our own: two sessions can launch runs with the same name in the same second
    if ($dono -and $dono.StartsWith("$Sessao ") -and $dono.Contains($Execucao)) {
        Remove-Item "$caminho\dono" -ErrorAction SilentlyContinue
        Remove-Item $caminho -ErrorAction SilentlyContinue
    }
}

# Runs waiting for the test lock queue by ticket, first come first served: a file in D:\rts\testes\senhas named by the
# time it started waiting, holding the waiting process id. Only the oldest live ticket tries the lock. A ticket whose
# process is gone, or older than the longest wait, is dropped; one still being written (no id yet) counts as alive.
function Primeira-Senha {
    $agora = Get-Date
    foreach ($senha in (Get-ChildItem $pastaSenhas -File -ErrorAction SilentlyContinue | Sort-Object Name)) {
        $conteudo = Get-Content $senha.FullName -Raw -ErrorAction SilentlyContinue
        $viva = if ($conteudo -match "pid=(\d+)") { [bool](Get-Process -Id $Matches[1] -ErrorAction SilentlyContinue) } else { $senha.LastWriteTime -gt $agora.AddMinutes(-1) }
        if ($viva -and $senha.LastWriteTime -gt $agora.AddHours(-4)) { return $senha.FullName }
        Remove-Item $senha.FullName -ErrorAction SilentlyContinue
    }
    return $null
}

# Creating a folder is atomic, so two runs can never both get the lock. A test lock whose owner process is gone (the PC restarted mid-run) is taken over.
# With a ticket ($senha), the run also waits for its turn in the queue before trying the lock.
function Esperar-Trava([string]$caminho, [string]$dono, [string]$rotulo, [int]$limiteMinutos, [bool]$retomarOrfa, [string]$senha = "") {
    $limite = (Get-Date).AddMinutes($limiteMinutos)
    $avisado = ""
    $avisadoSenha = ""
    while ($true) {
        if ($senha) {
            if (-not (Test-Path $senha)) { [IO.File]::WriteAllText($senha, "pid=$PID", $utf8) }
            $primeira = Primeira-Senha
            if ($primeira -and $primeira -ne $senha) {
                if ($primeira -ne $avisadoSenha) {
                    Registrar "FILA waiting for the turn of: $(Split-Path $primeira -Leaf)"
                    Gravar-Estado ([ordered]@{ estado = "esperando a vez na fila"; primeiro = (Split-Path $primeira -Leaf); pid = $PID })
                    $avisadoSenha = $primeira
                }
                if ((Get-Date) -gt $limite) { return $false }
                Start-Sleep -Seconds 15
                continue
            }
        }
        try {
            New-Item -ItemType Directory -Path $caminho -ErrorAction Stop | Out-Null
            # the owner line carries the time the lock was taken, not the time the wait began
            $dono = "$dono $(Get-Date -Format o)"
            [IO.File]::WriteAllText("$caminho\dono", $dono, $utf8)
            Registrar "TRAVA $rotulo pegou: $dono"
            return $true
        } catch {
            $atual = Dono-Da-Trava $caminho
            if ($retomarOrfa -and $atual -match "pid=(\d+)" -and -not (Get-Process -Id $Matches[1] -ErrorAction SilentlyContinue)) {
                Registrar "TRAVA $rotulo orphan, taken over: $atual"
                Remove-Item "$caminho\dono" -ErrorAction SilentlyContinue
                Remove-Item $caminho -ErrorAction SilentlyContinue
                continue
            }
            if ($atual -ne $avisado) {
                Registrar "TRAVA $rotulo ocupada por: $atual"
                Gravar-Estado ([ordered]@{ estado = "esperando $rotulo"; dono = $atual; pid = $PID })
                $avisado = $atual
            }
            if ((Get-Date) -gt $limite) { return $false }
            Start-Sleep -Seconds 15
        }
    }
}

# Runs a command line through cmd.exe in the session's tree, appending its output to the log, and returns the exit code.
function Rodar([string]$linha) {
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = "cmd.exe"
    $info.Arguments = "/d /s /c `"$linha >> `"$log`" 2>&1`""
    $info.WorkingDirectory = $arvore
    $info.UseShellExecute = $false
    $processo = [System.Diagnostics.Process]::Start($info)
    $processo.WaitForExit()
    return $processo.ExitCode
}

function Citar([string]$valor) {
    if ($valor -match '[\s"&|<>^]') { return '"' + ($valor -replace '"', '\"') + '"' }
    return $valor
}

# Which ANGLE backend lets headless Chromium draw with the NVIDIA card from this session (SSH and WMI run in session 0, where some backends fall back to WARP or SwiftShader).
function Escolher-Angle {
    $saidaPlaca = "$saida\placa.json"
    $codigo = Rodar "node scripts\pc-testes\placa.mjs d3d11,gl,vulkan,d3d11on12 `"$saidaPlaca`""
    if ($codigo -ne 0 -or -not (Test-Path $saidaPlaca)) { Registrar "PLACA check failed (code $codigo)"; return $null }
    $placa = Get-Content $saidaPlaca -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($r in $placa.resultados) { Registrar "PLACA $($r.angle): $($r.placa)" }
    if ($placa.escolhido) { Registrar "PLACA chosen ANGLE backend: $($placa.escolhido)" } else { Registrar "ERRO no ANGLE backend reaches the NVIDIA card; performance numbers would not mean anything" }
    return $placa.escolhido
}

$passos = New-Object System.Collections.ArrayList
function Rodar-Passo([string]$nome, [string[]]$argumentosPlaywright, [bool]$usaGpu) {
    $inicio = Get-Date
    $codigo = $null
    $comGpu = $false
    try {
        if ($usaGpu) {
            $angle = Escolher-Angle
            if (-not $angle) { $codigo = 4; return }
            $env:SALINHA_ANGLE = $angle
            if (-not (Esperar-Trava $travaGpu "$Sessao testes/$Execucao" "gpu" 60 $false)) {
                Registrar "ERRO the GPU lock stayed busy for 60 min"
                $codigo = 5
                return
            }
            $comGpu = $true
        }
        Gravar-Estado ([ordered]@{ estado = "rodando"; passo = $nome; pid = $PID })
        $env:PLAYWRIGHT_JSON_OUTPUT_NAME = "$saida\relatorio-$nome.json"
        $linha = "npx.cmd playwright test " + (($argumentosPlaywright | ForEach-Object { Citar $_ }) -join " ") + " --reporter=list,json --output=`"$saida\resultados-$nome`""
        Registrar "PASSO $nome inicio: $linha"
        $codigo = Rodar $linha
    } finally {
        if ($comGpu) { Soltar-Trava $travaGpu }
        $segundos = [math]::Round(((Get-Date) - $inicio).TotalSeconds, 1)
        $passo = [ordered]@{ nome = $nome; codigo = $codigo; segundos = $segundos; esperados = $null; inesperados = $null; instaveis = $null; pulados = $null }
        if (Test-Path "$saida\relatorio-$nome.json") {
            try {
                $estatisticas = (Get-Content "$saida\relatorio-$nome.json" -Raw -Encoding UTF8 | ConvertFrom-Json).stats
                $passo.esperados = $estatisticas.expected
                $passo.inesperados = $estatisticas.unexpected
                $passo.instaveis = $estatisticas.flaky
                $passo.pulados = $estatisticas.skipped
            } catch { Registrar "AVISO could not read the JSON report of $nome" }
        }
        [void]$passos.Add($passo)
        Registrar "PASSO $nome fim: codigo $codigo em $segundos s, $($passo.esperados) passaram, $($passo.inesperados) falharam, $($passo.instaveis) instaveis, $($passo.pulados) pulados"
    }
}

$inicioGeral = Get-Date
$codigoGeral = 0
$comTrava = $false
$esperaTestes = $null
$senha = $null
try {
    Gravar-Estado ([ordered]@{ estado = "esperando testes"; pid = $PID })
    New-Item -ItemType Directory -Force -Path $pastaSenhas | Out-Null
    $senha = Join-Path $pastaSenhas ("{0}-{1}-{2}" -f $inicioGeral.ToUniversalTime().ToString("yyyyMMddTHHmmssfff"), $Sessao, $Execucao)
    [IO.File]::WriteAllText($senha, "pid=$PID", $utf8)
    $pegou = Esperar-Trava $travaTestes "$Sessao $Execucao pid=$PID" "testes" 180 $true $senha
    Remove-Item $senha -ErrorAction SilentlyContinue
    $senha = $null
    if (-not $pegou) { throw "the test lock stayed busy for 180 min" }
    $comTrava = $true
    $esperaTestes = [math]::Round(((Get-Date) - $inicioGeral).TotalSeconds, 1)
    Registrar "FILA waited $esperaTestes s for the test lock"
    Gravar-Estado ([ordered]@{ estado = "preparando"; pid = $PID })

    # A fresh tree each run, keeping node_modules, which npm ci only rebuilds when the lock file changes.
    if (Test-Path $arvore) {
        Get-ChildItem $arvore -Force | Where-Object { $_.Name -ne "node_modules" } | Remove-Item -Recurse -Force
    } else {
        New-Item -ItemType Directory -Path $arvore | Out-Null
    }
    tar -xzf "$saida\fonte.tar.gz" -C $arvore
    if ($LASTEXITCODE -ne 0) { throw "tar could not unpack the tree" }
    Remove-Item "$saida\fonte.tar.gz"

    $env:TEMP = "D:\rts\cache\tmp-testes"
    $env:TMP = "D:\rts\cache\tmp-testes"
    $env:npm_config_cache = "D:\rts\npm-cache"
    $env:PLAYWRIGHT_BROWSERS_PATH = "D:\rts\playwright"
    $env:SALINHA_PYTHON = "python"
    $env:SALINHA_PROCESSOS = "$Processos"
    # As on the Action: a Playwright browser missing here must fail the run, not be skipped.
    $env:CI = "1"

    $hash = (Get-FileHash "$arvore\package-lock.json").Hash
    $marca = "$arvore\node_modules\.rtx-testes-lock"
    if (-not (Test-Path $marca) -or (Get-Content $marca -Raw).Trim() -ne $hash) {
        Registrar "PREPARO npm ci"
        if ((Rodar "npm.cmd ci --no-audit --no-fund") -ne 0) { throw "npm ci failed" }
        [IO.File]::WriteAllText($marca, $hash, $utf8)
    } else {
        Registrar "PREPARO node_modules reused (package-lock.json unchanged)"
    }
    Registrar "PREPARO playwright install chromium firefox webkit"
    if ((Rodar "npx.cmd playwright install chromium firefox webkit") -ne 0) { throw "playwright install failed" }

    if ($Modo -eq "e2e" -or $Modo -eq "rts") {
        # The rts mode leaves out the Pavio and Farm functional specs, which an RTS-only change cannot reach; the Action still runs them on every push.
        $funcionais = @("--project=funcionais", "--workers=$Processos")
        if ($Modo -eq "rts") { $funcionais += "testes/e2e/rts-" }
        Rodar-Passo "funcionais" $funcionais $false
        # Only the RTS performance spec: the Pavio one measures the Mac GPU as a stand-in for an iPad, and its limits do not hold on this PC (see docs/rts/ESTADO.md).
        Rodar-Passo "desempenho" @("--project=desempenho", "testes/e2e/rts-desempenho.spec.mjs") $true
        Rodar-Passo "rts-determinismo" @("--project=rts-determinismo-*") $false
    } else {
        $lista = @($utf8.GetString([Convert]::FromBase64String($Argumentos)) -split "`n" | Where-Object { $_ -ne "" })
        # the GPU lock for the performance project or the Pavio performance specs by file name, not for any word "longo" (a -g filter)
        $usaGpu = ($lista -join " ") -match "desempenho|(longo|galeria)\.spec"
        Rodar-Passo "playwright" $lista $usaGpu
    }
    foreach ($passo in $passos) { if ($passo.codigo -ne 0 -and $codigoGeral -eq 0) { $codigoGeral = $passo.codigo } }
} catch {
    Registrar "ERRO $_"
    $codigoGeral = -1
} finally {
    if ($senha) { Remove-Item $senha -ErrorAction SilentlyContinue }
    if ($comTrava) { Soltar-Trava $travaTestes }
    $fim = Get-Date
    $final = [ordered]@{
        estado = $(if ($codigoGeral -eq 0) { "ok" } else { "erro" })
        codigo = $codigoGeral
        passos = @($passos)
        inicio = $inicioGeral.ToString("o")
        fim = $fim.ToString("o")
        segundos = [math]::Round(($fim - $inicioGeral).TotalSeconds, 1)
        esperaSegundos = $esperaTestes
    }
    $linhas = @("execucao $Execucao da sessao $($Sessao): $($final.estado), codigo $codigoGeral, $($final.segundos) s, $($esperaTestes) s esperando a trava")
    foreach ($passo in $passos) {
        $linhas += "  $($passo.nome): codigo $($passo.codigo), $($passo.segundos) s, $($passo.esperados) passaram, $($passo.inesperados) falharam, $($passo.instaveis) instaveis, $($passo.pulados) pulados"
    }
    [IO.File]::WriteAllText($resumo, ($linhas -join "`r`n") + "`r`n", $utf8)
    Gravar-Estado $final
    # A busy file (two runs ending together) only loses this one line.
    try { [IO.File]::AppendAllText($fila, "$($final.inicio) $Sessao $Execucao espera=$esperaTestes total=$($final.segundos) codigo=$codigoGeral`r`n", $utf8) } catch { Registrar "AVISO could not append to fila.log" }
    # Keep the five newest runs of this session.
    Get-ChildItem "$pasta\execucoes" -Directory | Sort-Object Name -Descending | Select-Object -Skip 5 | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
}
