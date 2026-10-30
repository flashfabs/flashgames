// Golden replays: three scripted ten-minute matches (testes/rts-replays/*.json, made by ferramentas/rts/gerar-replays.mjs)
// must give the recorded checksums every 600 ticks. The same files run in Chromium, Firefox and WebKit through the
// rts-determinismo Playwright project; together they lock the simulation to one result on every engine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { executarReplay } from '../site/rts/js/sim/replay.js';
import { VERSAO_SIMULACAO } from '../site/rts/js/sim/contratos.js';

const pasta = new URL('./rts-replays/', import.meta.url);
const nomes = readdirSync(pasta).filter(nome => nome.endsWith('.json')).sort();

test('there are three golden replays of 18,000 ticks for this simulation version', () => {
  assert.equal(nomes.length, 3);
  for (const nome of nomes) {
    const replay = JSON.parse(readFileSync(new URL(nome, pasta), 'utf8'));
    assert.equal(replay.versao, VERSAO_SIMULACAO, `${nome}: regenerate with node ferramentas/rts/gerar-replays.mjs after a deliberate change`);
    assert.equal(replay.passos, 18000);
  }
});

for (const nome of nomes) {
  test(`replay ${nome} reproduces its checksums`, () => {
    const replay = JSON.parse(readFileSync(new URL(nome, pasta), 'utf8'));
    const resultado = executarReplay(replay);
    assert.deepEqual(resultado.somas, replay.esperado.somas);
    assert.equal(resultado.final, replay.esperado.final);
  });
}
