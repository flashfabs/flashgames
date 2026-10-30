# GPU lock of the RTX 4090: the folder D:\rts\trava-gpu exists while someone holds it, and its file "dono"
# says who (session, run id, time). Creating a folder is atomic, so two callers can never both win.
param(
    [ValidateSet("pegar", "soltar", "estado")][string]$Acao = "estado",
    [string]$Dono = "",
    [string]$Execucao = ""
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$trava = "D:\rts\trava-gpu"

function Ler-Dono {
    if (Test-Path "$trava\dono") { return (Get-Content "$trava\dono" -Raw).Trim() }
    if (Test-Path $trava) { return "(no owner file)" }
    return $null
}

switch ($Acao) {
    "pegar" {
        try {
            New-Item -ItemType Directory -Path $trava -ErrorAction Stop | Out-Null
        } catch {
            $idade = [math]::Round(((Get-Date) - (Get-Item $trava).CreationTime).TotalMinutes, 1)
            Write-Output "TRAVA ocupada ha $idade min por: $(Ler-Dono)"
            exit 75
        }
        Set-Content -Path "$trava\dono" -Value "$Dono $Execucao $(Get-Date -Format o)" -Encoding UTF8
        Write-Output "TRAVA pegou: $(Ler-Dono)"
    }
    "soltar" {
        $atual = Ler-Dono
        if ($null -eq $atual) { Write-Output "TRAVA livre"; exit 0 }
        if ($Execucao -and -not $atual.Contains($Execucao)) {
            Write-Output "TRAVA nao solta: pertence a $atual"
            exit 1
        }
        Remove-Item -Path "$trava\dono" -ErrorAction SilentlyContinue
        Remove-Item -Path $trava -ErrorAction Stop
        Write-Output "TRAVA solta"
    }
    "estado" {
        $atual = Ler-Dono
        if ($null -eq $atual) { Write-Output "TRAVA livre" } else { Write-Output "TRAVA ocupada por: $atual" }
    }
}
