#!/usr/bin/env bash
# Runs the end-to-end tests of this worktree on the RTX 4090 Windows PC, so the Mac only edits, commits and runs npm test.
#
# Usage: scripts/rtx-testes.sh [command]
#   (nothing) or e2e            funcionais, the RTS performance spec (with the GPU lock) and rts-determinismo-*; the Pavio performance spec stays on the Mac
#   -- <playwright args...>     npx playwright test <args>, e.g. -- --project=funcionais testes/e2e/sala.spec.mjs
#   acompanhar <run>            follows a run after a dropped connection and brings its results back
#   estado                      the test and GPU locks, and the newest runs of this session
#
# What runs is the worktree as it is now, committed or not: untracked files go too, ignored ones (node_modules) do not.
# On the PC each session has D:\rts\testes\<session>, with its tree, cached node_modules and the five newest runs; one run at a time holds D:\rts\trava-testes, and performance steps also hold D:\rts\trava-gpu.
# The run is started through WMI, so it survives a dropped SSH connection; this script reconnects and keeps following it.
# Results land in test-results/rtx/<run>/ (testes.log, resumo.txt, estado.json, one JSON report and one output folder per step); the exit code is 0 only when every step passed.
# Environment: RTX_HOST (default rtx4090), RTX_SESSAO (default: the worktree folder name), SALINHA_PROCESSOS (functional workers, default 2).
set -euo pipefail

aqui="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
raiz="$(cd "$aqui/.." && pwd)"
host="${RTX_HOST:-rtx4090}"
sessao="${RTX_SESSAO:-$(basename "$raiz")}"
processos="${SALINHA_PROCESSOS:-2}"
ssh_opcoes=(-o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=4 -o LogLevel=ERROR)

erro() { echo "error: $*" >&2; exit 1; }

[[ "$sessao" =~ ^[A-Za-z0-9._-]+$ ]] || erro "RTX_SESSAO must be plain letters, digits, dots, dashes and underscores: $sessao"
[[ "$processos" =~ ^[0-9]+$ ]] || erro "SALINHA_PROCESSOS must be a number: $processos"

# Runs a local PowerShell script from scripts/pc-testes on the PC as -EncodedCommand (UTF-16LE base64), with -Name 'value' arguments.
pc() {
  local script="$1"; shift
  local chamada="\$ProgressPreference='SilentlyContinue'; & {
$(cat "$aqui/pc-testes/$script")
}"
  while (($#)); do
    chamada+=" -$1 '${2//\'/\'\'}'"
    shift 2
  done
  local codificado
  codificado="$(printf '%s' "$chamada" | iconv -f UTF-8 -t UTF-16LE | base64 | tr -d '\n')"
  ssh "${ssh_opcoes[@]}" "$host" "powershell -NoProfile -NonInteractive -EncodedCommand $codificado"
}

# The worktree as it is now, as a tree object: a copy of the index plus every untracked file that is not ignored.
empacotar() {
  local destino="$1" indice arvore
  indice="$(mktemp -t rtx-testes-indice)"
  cp "$(git -C "$raiz" rev-parse --path-format=absolute --git-path index)" "$indice"
  GIT_INDEX_FILE="$indice" git -C "$raiz" add -A
  arvore="$(GIT_INDEX_FILE="$indice" git -C "$raiz" write-tree)"
  rm -f "$indice"
  git -C "$raiz" archive --format=tar.gz -o "$destino" "$arvore"
}

acompanhar() {
  local execucao="$1" tentativas=0 codigo
  while true; do
    codigo=0
    pc acompanhar.ps1 Sessao "$sessao" Execucao "$execucao" || codigo=$?
    case "$codigo" in
      0|1) break ;;
      2) echo "warning: still running on the PC; following again" >&2 ;;
      3) erro "run $execucao never started on the PC" ;;
      *)
        tentativas=$((tentativas + 1))
        ((tentativas > 40)) && erro "lost the PC for too long; the run goes on there: $0 acompanhar $execucao"
        echo "warning: connection dropped, the run keeps going on the PC; reconnecting in 15 s" >&2
        sleep 15 ;;
    esac
  done
  buscar "$execucao"
  return "$codigo"
}

buscar() {
  local execucao="$1" local_="$raiz/test-results/rtx"
  mkdir -p "$local_"
  rm -rf "${local_:?}/$execucao"
  scp -q -r "${ssh_opcoes[@]}" "$host:D:/rts/testes/$sessao/execucoes/$execucao" "$local_/"
  echo "RESULTADO test-results/rtx/$execucao"
  [[ -f "$local_/$execucao/resumo.txt" ]] && tr -d '\r' < "$local_/$execucao/resumo.txt"
  return 0
}

rodar() {
  local modo="$1"; shift
  ssh "${ssh_opcoes[@]}" "$host" "exit 0" 2>/dev/null || erro "the PC ($host) does not answer over SSH; is it on and in the same Tailscale network?"
  local execucao pacote argumentos=""
  execucao="$(date +%Y%m%d-%H%M%S)"
  pacote="$(mktemp -t rtx-testes).tar.gz"
  empacotar "$pacote"
  if [[ "$modo" == "playwright" ]]; then
    argumentos="$(printf '%s\n' "$@" | base64 | tr -d '\n')"
  fi
  ssh "${ssh_opcoes[@]}" "$host" "New-Item -ItemType Directory -Force D:\\rts\\testes\\scripts, D:\\rts\\testes\\$sessao\\execucoes\\$execucao | Out-Null"
  scp -q "${ssh_opcoes[@]}" "$aqui"/pc-testes/*.ps1 "$aqui/pc-testes/placa.mjs" "$host:D:/rts/testes/scripts/"
  scp -q "${ssh_opcoes[@]}" "$pacote" "$host:D:/rts/testes/$sessao/execucoes/$execucao/fonte.tar.gz"
  rm -f "$pacote"
  local chamada=(Sessao "$sessao" Execucao "$execucao" Modo "$modo" Processos "$processos")
  [[ -n "$argumentos" ]] && chamada+=(Argumentos "$argumentos")
  pc lancar.ps1 "${chamada[@]}"
  echo "EXECUCAO $execucao of $sessao started on $host ($(git -C "$raiz" rev-parse --short HEAD)$([[ -n "$(git -C "$raiz" status --porcelain)" ]] && echo ' with changes'))"
  acompanhar "$execucao"
}

comando="${1:-e2e}"
case "$comando" in
  e2e) rodar e2e ;;
  --) shift; (($#)) || erro "usage: $0 -- <playwright args>"; rodar playwright "$@" ;;
  acompanhar) (($# == 2)) || erro "usage: $0 acompanhar <run>"; acompanhar "$2" ;;
  estado) pc estado.ps1 Sessao "$sessao" ;;
  -h|--help) sed -n '2,16p' "$0" ;;
  *) erro "unknown command $comando (run $0 --help)" ;;
esac
