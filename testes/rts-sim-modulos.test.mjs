// Every module of the simulation loads when it is the first one imported, as the page imports the placement rule or
// the contracts on its own and the worker starts from the simulation: an import cycle that runs one module's top level
// before another's (a registration before the registry exists) breaks only some entry points, so each is tried in a
// fresh Node process.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const pasta = new URL('../site/rts/js/sim/', import.meta.url);
const modulos = readdirSync(pasta, { recursive: true }).filter(nome => nome.endsWith('.js')).sort();

test('every simulation module can be the first one imported', () => {
  assert.ok(modulos.length > 20);
  const falhas = [];
  for (const nome of modulos) {
    const url = new URL(nome, pasta).href;
    try {
      execFileSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(url)});`], { stdio: 'pipe', cwd: fileURLToPath(new URL('..', import.meta.url)) });
    } catch (erro) {
      falhas.push(`${nome}: ${String(erro.stderr).split('\n').find(linha => /^[A-Za-z]*Error:/.test(linha)) ?? erro.message}`);
    }
  }
  assert.deepEqual(falhas, []);
});
