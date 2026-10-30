#!/usr/bin/env bash
# Builds a clean folder ready for Netlify's deploy-site from a commit of the repository (main by default):
# only netlify.toml, site/ and netlify/ come from git, plus site/versao.json with the commit and the time.
# When package.json has "dependencies" (runtime packages of the Netlify Functions), they are installed with
# npm ci --omit=dev, so the functions bundle with them; dev tools such as Playwright never go along.
#
# Usage: scripts/preparar-publicacao.sh [parent folder]    (default: $TMPDIR)
#        REF=<branch or commit> scripts/preparar-publicacao.sh ...
# The last line printed is the absolute path of the new folder.
# Publishing main refuses when the local main does not contain origin/main (a clone behind GitHub would put an old version live).
set -euo pipefail

aqui="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repositorio="$(cd "$(git -C "$aqui" rev-parse --path-format=absolute --git-common-dir)/.." && pwd)"
ref="${REF:-main}"
pai="${1:-${TMPDIR:-/tmp}}"

if [[ "$ref" == "main" ]]; then
  if ! git -C "$repositorio" fetch --quiet origin main; then
    echo "error: could not fetch origin/main to check that main in $repositorio is up to date" >&2
    exit 1
  fi
  if ! git -C "$repositorio" merge-base --is-ancestor origin/main main; then
    local_curto="$(git -C "$repositorio" rev-parse --short main)"
    origem_curto="$(git -C "$repositorio" rev-parse --short origin/main)"
    echo "error: main (${local_curto}) in $repositorio is behind origin/main (${origem_curto}); update it with: git -C $repositorio pull --ff-only origin main" >&2
    exit 1
  fi
fi

commit="$(git -C "$repositorio" rev-parse --verify "${ref}^{commit}")"
curto="$(git -C "$repositorio" rev-parse --short "$commit")"
mensagem="$(git -C "$repositorio" log -1 --format=%s "$commit")"
hora="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

mkdir -p "$pai"
pasta="$(mktemp -d "${pai%/}/salinha-publicacao-${curto}-XXXXXX")"

caminhos=()
for caminho in netlify.toml site netlify package.json package-lock.json; do
  if git -C "$repositorio" cat-file -e "${commit}:${caminho}" 2>/dev/null; then caminhos+=("$caminho"); fi
done
git -C "$repositorio" archive "$commit" "${caminhos[@]}" | tar -x -C "$pasta"

if [[ ! -f "$pasta/site/index.html" ]]; then
  echo "error: $commit has no site/index.html" >&2
  exit 1
fi

COMMIT="$commit" CURTO="$curto" HORA="$hora" MENSAGEM="$mensagem" REF_NOME="$ref" node -e '
const { COMMIT: commit, CURTO: curto, HORA: hora, MENSAGEM: mensagem, REF_NOME: ref } = process.env;
process.stdout.write(JSON.stringify({ commit, curto, hora, ref, mensagem }, null, 2) + "\n");
' > "$pasta/site/versao.json"

# Runtime dependencies of the functions, if any; otherwise package.json stays out of the published folder.
if [[ -f "$pasta/package.json" ]] && node -e 'process.exit(Object.keys(require(process.argv[1]).dependencies ?? {}).length ? 0 : 1)' "$pasta/package.json"; then
  (cd "$pasta" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund >&2)
else
  rm -f "$pasta/package.json" "$pasta/package-lock.json"
fi

echo "Commit ${curto} (${mensagem}) from ${ref}, prepared at ${hora}:" >&2
(cd "$pasta" && find . -maxdepth 2 -not -path './node_modules/*' | sort | sed 's/^/  /') >&2
echo "$pasta"
