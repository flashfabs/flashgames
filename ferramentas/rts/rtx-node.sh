#!/usr/bin/env bash
# Runs a Node script of the simulation tools on the RTX 4090 Windows PC (Node 24), so long simulations and step
# benchmarks leave the Mac alone. What runs is this worktree as it is now (committed or not), limited to what the
# simulation and its tools need.
#
# Usage: ferramentas/rts/rtx-node.sh [--quieto] [--trazer <path>]... -- <node args...>
#   e.g. ferramentas/rts/rtx-node.sh --trazer testes/rts-replays -- ferramentas/rts/gerar-replays.mjs
#        ferramentas/rts/rtx-node.sh -- ferramentas/rts/medir-passo.mjs
# --trazer copies a file or folder back from the PC's copy into this worktree after the run (repeatable).
# --quieto runs node holding the PC's test lock (D:\rts\trava-testes, in the executor's ticket queue) through
# rtx-quieto.ps1, so no end-to-end run of another session shares the CPU with a measurement.
# On the PC the copy lives in D:\rts\testes\<session>\node (only that folder is written). The exit code is node's.
# Environment: RTX_HOST (default rtx4090), RTX_SESSAO (default: the worktree folder name).
set -euo pipefail

aqui="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
raiz="$(cd "$aqui/../.." && pwd)"
host="${RTX_HOST:-rtx4090}"
sessao="${RTX_SESSAO:-$(basename "$raiz")}"
ssh_opcoes=(-o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=8 -o LogLevel=ERROR)
# what the simulation, its tools and its tests read
CAMINHOS=(package.json site/rts/js site/rts/dados ferramentas/rts testes)

erro() { echo "error: $*" >&2; exit 1; }
[[ "$sessao" =~ ^[A-Za-z0-9._-]+$ ]] || erro "RTX_SESSAO must be plain letters, digits, dots, dashes and underscores: $sessao"

trazer=()
quieto=0
while (($#)); do
  case "$1" in
    --quieto) quieto=1; shift ;;
    --trazer) (($# >= 2)) || erro "--trazer needs a path"; trazer+=("$2"); shift 2 ;;
    --) shift; break ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) erro "unknown option $1 (the node arguments go after --)" ;;
  esac
done
(($#)) || erro "usage: $0 [--trazer <path>]... -- <node args...>"
for caminho in "${trazer[@]}"; do [[ "$caminho" =~ ^[A-Za-z0-9._/-]+$ && "$caminho" != *..* ]] || erro "bad path to bring back: $caminho"; done

ssh "${ssh_opcoes[@]}" "$host" "exit 0" 2>/dev/null || erro "the PC ($host) does not answer over SSH"

# the worktree as it is now: a copy of the index plus every untracked file that is not ignored
pacote="$(mktemp -t rtx-node).tar.gz"
indice="$(mktemp -t rtx-node-indice)"
cp "$(git -C "$raiz" rev-parse --path-format=absolute --git-path index)" "$indice"
GIT_INDEX_FILE="$indice" git -C "$raiz" add -A
arvore="$(GIT_INDEX_FILE="$indice" git -C "$raiz" write-tree)"
rm -f "$indice"
git -C "$raiz" archive --format=tar.gz -o "$pacote" "$arvore" "${CAMINHOS[@]}"

remoto="D:\\rts\\testes\\$sessao\\node"
ssh "${ssh_opcoes[@]}" "$host" "if (Test-Path $remoto) { Remove-Item -Recurse -Force $remoto }; New-Item -ItemType Directory -Force $remoto | Out-Null"
scp -q "${ssh_opcoes[@]}" "$pacote" "$host:D:/rts/testes/$sessao/node/fonte.tar.gz"
rm -f "$pacote"
ssh "${ssh_opcoes[@]}" "$host" "cd $remoto; tar -xzf fonte.tar.gz; Remove-Item fonte.tar.gz"

argumentos=""
for a in "$@"; do argumentos+=" '${a//\'/\'\'}'"; done
echo "NODE on $host ($(git -C "$raiz" rev-parse --short HEAD)$([[ -n "$(git -C "$raiz" status --porcelain)" ]] && echo ' with changes')): node$argumentos" >&2
codigo=0
if ((quieto)); then
  lista="$(node -e 'process.stdout.write(Buffer.from(JSON.stringify(process.argv.slice(1))).toString("base64"))' -- "$@")"
  ssh "${ssh_opcoes[@]}" "$host" "cd $remoto; node --version; & powershell -NoProfile -ExecutionPolicy Bypass -File ferramentas\\rts\\rtx-quieto.ps1 -Sessao '$sessao' -Argumentos64 '$lista'; exit \$LASTEXITCODE" || codigo=$?
else
  ssh "${ssh_opcoes[@]}" "$host" "cd $remoto; node --version; & node$argumentos; exit \$LASTEXITCODE" || codigo=$?
fi

for caminho in "${trazer[@]}"; do
  destino="$raiz/$(dirname "$caminho")"
  mkdir -p "$destino"
  scp -q -r "${ssh_opcoes[@]}" "$host:D:/rts/testes/$sessao/node/$caminho" "$destino/" && echo "TROUXE $caminho" >&2
done
exit "$codigo"
