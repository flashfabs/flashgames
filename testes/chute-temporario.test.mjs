import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Partida, ITEM, AJUSTES, DIRECAO, CHAO, CAIXA, gradeVazia, indice } from '../site/js/pavio/regras.js';

const passo = 1 / 60;
function avancar(partida, segundos) { for (let t = 0; t < segundos; t += passo) partida.passo(passo); }

test('kick lasts 50 seconds and a new pickup replaces the remaining time', () => {
  const grade = gradeVazia();
  grade[indice(2, 1)] = ITEM.CHUTE;
  grade[indice(3, 1)] = ITEM.CHUTE;
  const partida = new Partida([{ id: 'a', slot: 0 }, { id: 'b', slot: 1 }], { grade });
  const jogador = partida.jogadores[0];
  jogador.x = 2; partida.passo(passo);
  assert.equal(jogador.chuteTempo, 50);
  avancar(partida, 10);
  assert.ok(jogador.chuteTempo < 41);
  jogador.x = 3; partida.passo(passo);
  assert.equal(jogador.chuteTempo, 50);
  assert.equal(partida.vista().j[0].kt, 50);
  avancar(partida, AJUSTES.chuteS + 0.1);
  assert.equal(jogador.chute, false);
  assert.equal(partida.vista().j[0].kt, 0);
});

test('a kicked banana slides and stops before an obstacle', () => {
  const grade = gradeVazia();
  grade[indice(3, 1)] = ITEM.BANANA;
  grade[indice(7, 1)] = CAIXA;
  const partida = new Partida([{ id: 'a', slot: 0 }, { id: 'b', slot: 1 }], { grade });
  const jogador = partida.jogadores[0]; jogador.x = 2; jogador.chute = true; jogador.chuteTempo = 50;
  assert.equal(partida.chutar('a', DIRECAO.DIREITA), true);
  assert.equal(partida.grade[indice(3, 1)], CHAO);
  avancar(partida, 0.2);
  assert.ok(partida.vista().iv.some(([x, , item]) => item === ITEM.BANANA && x > 3));
  avancar(partida, 1);
  assert.equal(partida.grade[indice(6, 1)], ITEM.BANANA);
  assert.equal(jogador.atordoado, 0);
});

test('a banana blocked immediately stays in place', () => {
  const grade = gradeVazia(); grade[indice(3, 1)] = ITEM.BANANA; grade[indice(4, 1)] = CAIXA;
  const partida = new Partida([{ id: 'a', slot: 0 }, { id: 'b', slot: 1 }], { grade });
  const jogador = partida.jogadores[0]; jogador.x = 2; jogador.chute = true; jogador.chuteTempo = 50;
  assert.equal(partida.chutar('a', DIRECAO.DIREITA), false);
  assert.equal(partida.grade[indice(3, 1)], ITEM.BANANA);
});
