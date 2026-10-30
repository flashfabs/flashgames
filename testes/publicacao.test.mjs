import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = new URL('../scripts/preparar-publicacao.sh', import.meta.url).pathname;
const gerador = new URL('../scripts/gerar-versao.mjs', import.meta.url).pathname;
const ambiente = { ...process.env, GIT_AUTHOR_NAME: 'teste', GIT_AUTHOR_EMAIL: 'teste@exemplo.invalid', GIT_COMMITTER_NAME: 'teste', GIT_COMMITTER_EMAIL: 'teste@exemplo.invalid' };

const git = (pasta, ...argumentos) => execFileSync('git', ['-C', pasta, ...argumentos], { env: ambiente, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function salvar(pasta, mensagem) {
  writeFileSync(join(pasta, 'site', 'index.html'), `<p>${mensagem}</p>\n`);
  git(pasta, 'add', '.');
  git(pasta, 'commit', '--quiet', '-m', mensagem);
  git(pasta, 'push', '--quiet', 'origin', 'main');
}

// A GitHub stand-in plus two clones with the script: "atrasado" publishes, "outro" pushes a newer main.
function montarRepositorios(t) {
  const base = mkdtempSync(join(tmpdir(), 'salinha-publicacao-teste-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const origem = join(base, 'origem.git');
  execFileSync('git', ['init', '--quiet', '--bare', '-b', 'main', origem]);
  const atrasado = join(base, 'atrasado');
  const outro = join(base, 'outro');
  execFileSync('git', ['clone', '--quiet', origem, atrasado], { stdio: 'ignore' });
  mkdirSync(join(atrasado, 'scripts'));
  mkdirSync(join(atrasado, 'site'));
  copyFileSync(script, join(atrasado, 'scripts', 'preparar-publicacao.sh'));
  copyFileSync(gerador, join(atrasado, 'scripts', 'gerar-versao.mjs'));
  salvar(atrasado, 'first');
  const antigo = git(atrasado, 'rev-parse', 'HEAD');
  execFileSync('git', ['clone', '--quiet', origem, outro], { stdio: 'ignore' });
  salvar(outro, 'second');
  return { base, atrasado, antigo, novo: git(outro, 'rev-parse', 'HEAD') };
}

function preparar({ atrasado, base }, ref) {
  const env = { ...ambiente };
  if (ref) env.REF = ref;
  return spawnSync('bash', [join(atrasado, 'scripts', 'preparar-publicacao.sh'), join(base, 'publicacoes')], { env, encoding: 'utf8' });
}

const commitPublicado = (resultado) => JSON.parse(readFileSync(join(resultado.stdout.trim().split('\n').at(-1), 'site', 'versao.json'), 'utf8')).commit;

test('publishing refuses a local main that is behind origin/main, and goes ahead once it is updated', (t) => {
  const repositorios = montarRepositorios(t);
  const recusado = preparar(repositorios);
  assert.notEqual(recusado.status, 0);
  assert.match(recusado.stderr, /behind origin\/main/);
  assert.equal(recusado.stdout, '');

  git(repositorios.atrasado, 'pull', '--quiet', '--ff-only', 'origin', 'main');
  const aceito = preparar(repositorios);
  assert.equal(aceito.status, 0, aceito.stderr);
  assert.equal(commitPublicado(aceito), repositorios.novo);
});

test('an explicit REF commit is prepared even when main is behind, for rollbacks', (t) => {
  const repositorios = montarRepositorios(t);
  const resultado = preparar(repositorios, repositorios.antigo);
  assert.equal(resultado.status, 0, resultado.stderr);
  assert.equal(commitPublicado(resultado), repositorios.antigo);
});

// The Netlify build command: COMMIT_REF wins; without it a prepared folder keeps its versao.json, even with no .git.
test('the build writes versao.json from COMMIT_REF and keeps the one of a prepared folder', (t) => {
  const repositorios = montarRepositorios(t);
  const gerar = (cwd, env) => spawnSync('node', [join(repositorios.atrasado, 'scripts', 'gerar-versao.mjs')], { cwd, env: { ...ambiente, ...env }, encoding: 'utf8' });
  const versao = (pasta) => JSON.parse(readFileSync(join(pasta, 'site', 'versao.json'), 'utf8'));

  const netlify = gerar(repositorios.atrasado, { COMMIT_REF: repositorios.antigo, HEAD: 'main' });
  assert.equal(netlify.status, 0, netlify.stderr);
  assert.deepEqual({ ...versao(repositorios.atrasado), hora: '' }, { commit: repositorios.antigo, curto: repositorios.antigo.slice(0, 7), hora: '', ref: 'main', mensagem: 'first' });

  git(repositorios.atrasado, 'pull', '--quiet', '--ff-only', 'origin', 'main');
  const pasta = preparar(repositorios).stdout.trim().split('\n').at(-1);
  const mantido = gerar(pasta, { COMMIT_REF: '' });
  assert.equal(mantido.status, 0, mantido.stderr);
  assert.equal(versao(pasta).commit, repositorios.novo);
});
