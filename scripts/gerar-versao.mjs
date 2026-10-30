// Writes site/versao.json with the deployed commit, so production can be checked against main (npm run fumaca).
// Netlify runs it as the build command and passes the commit and branch in COMMIT_REF and HEAD. Without COMMIT_REF,
// an existing file stays as it is (a folder made by preparar-publicacao.sh already has one and no .git), and
// only a missing file is written from the local git.
//
// Usage: node scripts/gerar-versao.mjs [destination]    (default: site/versao.json)

import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';

const destino = process.argv[2] ?? 'site/versao.json';

function git(...argumentos) {
  try {
    return execFileSync('git', argumentos, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

if (!process.env.COMMIT_REF && existsSync(destino)) {
  console.log(`No COMMIT_REF; keeping ${destino}`);
  process.exit(0);
}

const commit = process.env.COMMIT_REF || git('rev-parse', '--verify', 'HEAD^{commit}');
if (!commit) {
  console.error(`error: no commit to write in ${destino} (set COMMIT_REF or run inside the repository)`);
  process.exit(1);
}

const versao = {
  commit,
  curto: commit.slice(0, 7),
  hora: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  ref: process.env.HEAD || git('rev-parse', '--abbrev-ref', 'HEAD'),
  mensagem: git('log', '-1', '--format=%s', commit),
};
writeFileSync(destino, JSON.stringify(versao, null, 2) + '\n');
console.log(`${destino}: ${versao.curto} (${versao.mensagem}) from ${versao.ref}`);
