#!/usr/bin/env bash
# Drives the Blender art factory on the RTX 4090 Windows PC from the Mac, over SSH.
#
# Usage: ferramentas/arte/rtx.sh <command> [arguments]
#   checar                         reachability, free space on C: and D:, size of D:\rts, free VRAM, GPU lock
#   enviar                         copies arte/blender, ferramentas/arte/pc and site/rts/dados/projecao.json to D:\rts
#   renderizar <asset> [k=v...]    checar + enviar + GPU lock + Blender batch + packing + buscar, no manual step
#   acompanhar <asset> <run>       follows a batch that is still running on the PC (after a dropped connection)
#   reempacotar <asset> [run] [k=v] packs the frames of a run again (packer changes), without the GPU, then buscar;
#                                  pass the run's own options again (elevacao=45 for an elevation variant)
#   buscar <asset> [run]           brings the packed atlases, manifest and provenance of a run into the repository
#   empacotar-fase <phase>         packs the runs of every sprite asset of the phase (as recorded in their provenance)
#                                  into shared atlas pages under site/rts/assets/sprites/<phase>/, without the GPU
#   limpar [--apagar]              keeps the two newest runs of each asset in D:\rts\saida (lists only, unless --apagar)
#   trava [estado|soltar <run>]    shows or releases the GPU lock
#
# Extra key=value args of renderizar become options of arte/blender/renderizar.py, e.g. direcoes=16 elevacao=45
# (--direcoes 16 --elevacao 45); the commit of the scripts is added on its own.
# Environment: RTX_HOST (default rtx4090), RTX_SESSAO (default rts-arte), RTX_MIN_VRAM_MIB (default 6000),
# RTX_BRUTOS=1 also copies the raw frames to ~/rts-arte/saida/<asset>/<run>/ (outside the repository).
set -euo pipefail

aqui="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
raiz="$(cd "$aqui/../.." && pwd)"
host="${RTX_HOST:-rtx4090}"
sessao="${RTX_SESSAO:-rts-arte}"
min_vram="${RTX_MIN_VRAM_MIB:-6000}"
ssh_opcoes=(-o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=4 -o LogLevel=ERROR)

erro() { echo "error: $*" >&2; exit 1; }

# Runs a local PowerShell script on the PC as -EncodedCommand (UTF-16LE base64), which needs no copy on the
# PC and no quoting through the remote shell. Arguments are passed as -Name 'value' pairs.
pc() {
  local script="$1"; shift
  local chamada="\$ProgressPreference='SilentlyContinue'; & {
$(cat "$aqui/pc/$script")
}"
  while (($#)); do
    chamada+=" -$1 '${2//\'/\'\'}'"
    shift 2
  done
  local codificado
  codificado="$(printf '%s' "$chamada" | iconv -f UTF-8 -t UTF-16LE | base64 | tr -d '\n')"
  ssh "${ssh_opcoes[@]}" "$host" "powershell -NoProfile -NonInteractive -EncodedCommand $codificado"
}

validar_asset() {
  [[ "$1" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || erro "asset id must be lowercase ASCII words joined by hyphens: $1"
  [[ -f "$raiz/arte/blender/assets/${1//-/_}.py" ]] || erro "no script arte/blender/assets/${1//-/_}.py for asset $1"
}

checar() {
  ssh "${ssh_opcoes[@]}" "$host" "exit 0" 2>/dev/null || erro "the PC ($host) does not answer over SSH; is it on and in the same Tailscale network?"
  pc checar.ps1 MinVramMiB "$min_vram"
}

enviar() {
  local pacote
  pacote="$(mktemp -t rtx-envio).tar"
  # Only versioned sources go; caches and bytecode stay behind.
  tar -C "$raiz" --exclude '__pycache__' --exclude '*.pyc' -cf "$pacote" arte/blender ferramentas/arte/pc
  scp -q "${ssh_opcoes[@]}" "$pacote" "$host:D:/rts/cache/envio.tar"
  rm -f "$pacote"
  local projecao="$raiz/site/rts/dados/projecao.json"
  if [[ -f "$projecao" ]]; then
    scp -q "${ssh_opcoes[@]}" "$projecao" "$host:D:/rts/config/projecao.json"
  else
    echo "warning: site/rts/dados/projecao.json not in this tree; the PC keeps its last copy (or the built-in defaults)" >&2
  fi
  ssh "${ssh_opcoes[@]}" "$host" "Remove-Item -Recurse -Force -ErrorAction SilentlyContinue D:\\rts\\scripts\\envio; New-Item -ItemType Directory -Force D:\\rts\\scripts\\envio | Out-Null; tar -xf D:\\rts\\cache\\envio.tar -C D:\\rts\\scripts\\envio; Remove-Item -Recurse -Force -ErrorAction SilentlyContinue D:\\rts\\scripts\\blender, D:\\rts\\scripts\\pc; Move-Item D:\\rts\\scripts\\envio\\arte\\blender D:\\rts\\scripts\\blender; Move-Item D:\\rts\\scripts\\envio\\ferramentas\\arte\\pc D:\\rts\\scripts\\pc; Remove-Item -Recurse -Force D:\\rts\\scripts\\envio, D:\\rts\\cache\\envio.tar; 'ENVIO ok'"
}

acompanhar() {
  local asset="$1" execucao="$2" tentativas=0
  # A dropped connection does not stop the batch on the PC: reconnect and keep following it.
  until pc acompanhar.ps1 Asset "$asset" Execucao "$execucao"; do
    local codigo=$?
    [[ $codigo -eq 1 ]] && return 1
    if [[ $codigo -eq 3 ]]; then
      # nothing runs on the PC, so nobody else will release the lock
      pc trava.ps1 Acao soltar Execucao "$asset/$execucao" >/dev/null || true
      return 1
    fi
    tentativas=$((tentativas + 1))
    ((tentativas > 20)) && erro "lost the PC for too long; run: $0 acompanhar $asset $execucao"
    echo "warning: connection dropped, the batch keeps running on the PC; reconnecting in 15 s" >&2
    sleep 15
  done
}

buscar() {
  local asset="$1" execucao="${2:-}"
  if [[ -z "$execucao" ]]; then
    execucao="$(ssh "${ssh_opcoes[@]}" "$host" "(Get-ChildItem D:\\rts\\saida\\$asset -Directory | Sort-Object Name -Descending | Select-Object -First 1).Name" | tr -d '\r')"
    [[ -n "$execucao" ]] || erro "no run of $asset on the PC"
  fi
  local temporaria
  temporaria="$(mktemp -d -t rtx-busca)"
  scp -q -r "${ssh_opcoes[@]}" "$host:D:/rts/saida/$asset/$execucao/pacote" "$temporaria/"
  local procedencias=("$temporaria"/pacote/arte/procedencia/*.json)
  [[ -f "${procedencias[0]}" ]] || erro "run $execucao of $asset has no package (did it fail?)"
  # Replace every published file of the packaged asset ids (an elevation variant is its own id),
  # so stale hashed atlases never pile up.
  local arquivo id
  for arquivo in "${procedencias[@]}"; do
    id="$(basename "$arquivo" .json)"
    find "$raiz/site/rts/assets" \( -name "$id.json" -o -name "$id@*.webp" \) -delete 2>/dev/null || true
  done
  rsync -a "$temporaria/pacote/" "$raiz/"
  if [[ "${RTX_BRUTOS:-0}" == "1" ]]; then
    mkdir -p "$HOME/rts-arte/saida/$asset"
    scp -q -r "${ssh_opcoes[@]}" "$host:D:/rts/saida/$asset/$execucao" "$HOME/rts-arte/saida/$asset/"
  fi
  rm -rf "$temporaria"
  node "$aqui/indice.mjs"
  echo "BUSCA $asset $execucao -> $(cd "$raiz" && git status --short -- site/rts/assets arte/procedencia | wc -l | tr -d ' ') changed files"
}

# Brings a phase package: the shared pages and the phase manifest replace the old ones, and the manifests of
# the packed assets replace theirs (their own pages from single-asset runs go away).
buscar_fase() {
  local fase="$1" execucao="$2"
  local temporaria
  temporaria="$(mktemp -d -t rtx-fase)"
  scp -q -r "${ssh_opcoes[@]}" "$host:D:/rts/saida/$fase/$execucao/pacote" "$temporaria/"
  [[ -f "$temporaria/pacote/site/rts/assets/sprites/$fase/$fase.json" ]] || erro "run $execucao of phase $fase has no package (did it fail?)"
  find "$raiz/site/rts/assets/sprites/$fase" -type f -delete 2>/dev/null || true
  local arquivo id
  while IFS= read -r arquivo; do
    id="$(basename "$arquivo" .json)"
    find "$raiz/site/rts/assets" \( -name "$id.json" -o -name "$id@*.webp" \) -delete 2>/dev/null || true
  done < <(find "$temporaria/pacote/site/rts/assets/sprites" -name '*.json' ! -path "*/$fase/*")
  rsync -a "$temporaria/pacote/" "$raiz/"
  rm -rf "$temporaria"
  node "$aqui/indice.mjs"
  echo "BUSCA fase $fase $execucao -> $(cd "$raiz" && git status --short -- site/rts/assets | wc -l | tr -d ' ') changed files"
}

empacotar_fase() {
  local fase="$1"
  [[ "$fase" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || erro "phase must be lowercase ASCII words joined by hyphens: $fase"
  local execucoes
  execucoes="$(node "$aqui/fase.mjs" "$fase")" || erro "could not list the runs of phase $fase"
  checar
  enviar
  local execucao
  execucao="$(date +%Y%m%d-%H%M%S)"
  pc lancar.ps1 Asset "$fase" Execucao "$execucao" Argumentos "fase=$fase,execucoes=$execucoes,commit=$(git -C "$raiz" rev-parse --short HEAD)"
  echo "LOTE fase $fase $execucao started on $host"
  acompanhar "$fase" "$execucao" || erro "packing phase $fase ($execucao) failed; log at D:\\rts\\saida\\$fase\\$execucao\\blender.log"
  buscar_fase "$fase" "$execucao"
}

# Set while this script holds the GPU lock and the batch has not started yet; the EXIT trap releases it.
trava_pendente=""

soltar_trava_pendente() {
  [[ -n "$trava_pendente" ]] && pc trava.ps1 Acao soltar Execucao "$trava_pendente" >/dev/null
  trava_pendente=""
}
trap soltar_trava_pendente EXIT

renderizar() {
  local asset="$1"; shift
  validar_asset "$asset"
  local argumento commit
  for argumento in "$@"; do
    [[ "$argumento" =~ ^[a-z][a-z0-9-]*(=[A-Za-z0-9._+-]+)?$ ]] || erro "script arguments are key=value with plain characters: $argumento"
  done
  commit="$(git -C "$raiz" rev-parse --short HEAD)"
  [[ -z "$(git -C "$raiz" status --porcelain -- arte/blender)" ]] || commit="$commit-com-mudancas"
  checar
  enviar
  local execucao
  execucao="$(date +%Y%m%d-%H%M%S)"
  pc trava.ps1 Acao pegar Dono "$sessao" Execucao "$asset/$execucao" || erro "the GPU is busy (see above); wait for the lock and try again"
  trava_pendente="$asset/$execucao"
  local juntos
  juntos="$(IFS=,; echo "commit=$commit${*:+,$*}")"
  pc lancar.ps1 Asset "$asset" Execucao "$execucao" Argumentos "$juntos"
  # From here on lote.ps1 releases the lock on the PC, whatever happens to this connection.
  trava_pendente=""
  echo "LOTE $asset $execucao started on $host"
  acompanhar "$asset" "$execucao" || erro "batch $execucao of $asset failed; log at D:\\rts\\saida\\$asset\\$execucao\\blender.log"
  buscar "$asset" "$execucao"
}

reempacotar() {
  local asset="$1" execucao=""
  shift
  if [[ "${1:-}" =~ ^[0-9]{8}-[0-9]{6}$ ]]; then execucao="$1"; shift; fi
  validar_asset "$asset"
  enviar
  if [[ -z "$execucao" ]]; then
    execucao="$(ssh "${ssh_opcoes[@]}" "$host" "(Get-ChildItem D:\\rts\\saida\\$asset -Directory | Sort-Object Name -Descending | Select-Object -First 1).Name" | tr -d '\r')"
  fi
  [[ -n "$execucao" ]] || erro "no run of $asset on the PC"
  local juntos
  juntos="$(IFS=,; echo "so-empacotar,commit=$(git -C "$raiz" rev-parse --short HEAD)${*:+,$*}")"
  pc lancar.ps1 Asset "$asset" Execucao "$execucao" Argumentos "$juntos"
  acompanhar "$asset" "$execucao" || erro "packing $execucao of $asset failed"
  buscar "$asset" "$execucao"
}

comando="${1:-}"
[[ -n "$comando" ]] || { sed -n '2,21p' "$0"; exit 2; }
shift
case "$comando" in
  checar) checar ;;
  enviar) enviar ;;
  renderizar) (($#)) || erro "usage: $0 renderizar <asset> [args]"; renderizar "$@" ;;
  acompanhar) (($# == 2)) || erro "usage: $0 acompanhar <asset> <run>"; acompanhar "$1" "$2" ;;
  buscar) (($#)) || erro "usage: $0 buscar <asset> [run]"; buscar "$@" ;;
  reempacotar) (($#)) || erro "usage: $0 reempacotar <asset> [run]"; reempacotar "$@" ;;
  empacotar-fase) (($# == 1)) || erro "usage: $0 empacotar-fase <phase>"; empacotar_fase "$1" ;;
  limpar) if [[ "${1:-}" == "--apagar" ]]; then pc limpar.ps1 Apagar sim; else pc limpar.ps1; fi ;;
  trava)
    case "${1:-estado}" in
      estado) pc trava.ps1 Acao estado ;;
      soltar) (($# == 2)) || erro "usage: $0 trava soltar <asset>/<run>"; pc trava.ps1 Acao soltar Execucao "$2" ;;
      *) erro "usage: $0 trava [estado|soltar <asset>/<run>]" ;;
    esac ;;
  *) erro "unknown command $comando (run $0 without arguments for help)" ;;
esac
