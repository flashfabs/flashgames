import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Partida, ITEM, AJUSTES, DIRECAO, gradeVazia, indice, CHAO, PAREDE } from '../site/js/pavio/regras.js';
const dt = 1 / 60;
const rodar = (partida, tempo) => { for (let t = 0; t + dt / 2 < tempo; t += dt) partida.passo(dt); };

test('one Molotov charge arms a hidden 2.6 second fuse and burns a 3 by 3 area for three seconds', () => {
  const grade = gradeVazia();
  for (let y = 2; y <= 4; y++) for (let x = 2; x <= 4; x++) grade[indice(x, y)] = CHAO;
  const partida = new Partida([{ id: 'a', slot: 0 }], { grade });
  const [a] = partida.jogadores;
  a.x = 3; a.y = 3;
  partida.grade[indice(3, 3)] = ITEM.MOLOTOV;
  partida.passo(dt);
  assert.equal(a.molotov, 1);
  assert.equal(partida.usarMolotov('a'), true);
  assert.equal(partida.usarMolotov('a'), false);
  assert.equal(a.molotov, 0);
  assert.equal(partida.vista().ml.length, 1);
  a.x = 8; a.y = 7;
  rodar(partida, 2.5);
  assert.equal(partida.chamas.size, 0);
  rodar(partida, 0.12);
  assert.equal(partida.molotovs.length, 0);
  assert.equal(partida.chamas.size, 9);
  for (let y = 2; y <= 4; y++) for (let x = 2; x <= 4; x++) assert.ok(partida.chamas.has(indice(x, y)));
  assert.ok(!partida.chamas.has(indice(5, 3)));
  rodar(partida, 2.8);
  assert.equal(partida.chamas.size, 9);
  rodar(partida, 0.3);
  assert.equal(partida.chamas.size, 0);
});

test('Molotov fire respects walls and cannot be used while stunned', () => {
  const grade = gradeVazia();
  const partida = new Partida([{ id: 'a', slot: 0 }], { grade });
  const [a] = partida.jogadores;
  a.molotov = 1;
  a.atordoado = 1;
  assert.equal(partida.usarMolotov('a'), false);
  assert.equal(a.molotov, 1);
  a.atordoado = 0;
  assert.equal(partida.usarMolotov('a'), true);
  a.x = 4;
  rodar(partida, 2.65);
  assert.equal(partida.grade[indice(0, 1)], PAREDE);
  assert.equal(partida.chamas.has(indice(0, 1)), false);
});

test('Molotov fire breaks crates and counts eliminations for its owner', () => {
  const grade = gradeVazia();
  for (let y = 2; y <= 4; y++) for (let x = 2; x <= 4; x++) grade[indice(x, y)] = CHAO;
  grade[indice(4, 3)] = '+';
  const partida = new Partida([{ id: 'a', slot: 0 }, { id: 'b', slot: 1 }], { grade, sorteio: () => 0.99 });
  const [a, b] = partida.jogadores;
  a.x = 3; a.y = 3; a.molotov = 1;
  b.x = 4; b.y = 4;
  assert.equal(partida.usarMolotov('a'), true);
  a.x = 8; a.y = 7;
  rodar(partida, 2.8);
  assert.equal(partida.grade[indice(4, 3)], CHAO);
  assert.equal(a.caixas, 1);
  assert.equal(b.vivo, false);
  assert.equal(a.eliminacoes, 1);
});

test('robots anticipate the square and duration of a Molotov fire', async () => {
  const { mapaDePerigo } = await import('../site/js/pavio/robo.js');
  const partida = new Partida([{ id: 'a', slot: 0 }], { grade: gradeVazia() });
  const [a] = partida.jogadores;
  a.x = 3; a.y = 3; a.molotov = 1;
  partida.usarMolotov('a');
  const perigo = mapaDePerigo(partida);
  assert.equal(perigo.ini[indice(3, 3)], AJUSTES.pavioMolotovS);
  assert.equal(perigo.fim[indice(3, 3)], AJUSTES.pavioMolotovS + AJUSTES.fogoMolotovS);
  assert.equal(perigo.ini[indice(5, 3)], Infinity);
});

test('Molotov can be found in ordinary crates and is separate from bombs', () => {
  const grade = gradeVazia();
  grade[indice(2, 1)] = '+';
  const mapa = { itens: [ITEM.MOLOTOV], morteSubitaS: 240 };
  const partida = new Partida([{ id: 'a', slot: 0 }], { grade, mapa, sorteio: () => 0 });
  const [a] = partida.jogadores;
  partida.pedirBomba('a');
  partida.passo(dt);
  assert.ok(partida.bombas[0].restante <= AJUSTES.pavioS);
  a.x = 5; a.y = 3;
  partida.bombas[0].restante = 0;
  rodar(partida, AJUSTES.chamaS + 0.1);
  assert.equal(partida.grade[indice(2, 1)], ITEM.MOLOTOV);
  a.x = 2; a.y = 1;
  partida.passo(dt);
  assert.equal(partida.vista().j[0].mo, 1);
  assert.equal(partida.usarMolotov('a'), true);
  assert.equal(partida.bombas.length, 0);
  assert.equal(partida.vista().ml.length, 1);
  assert.equal(partida.molotovs[0].restante, AJUSTES.pavioMolotovS);
});


test('a normal bomb and a Molotov cannot be placed on the same cell', () => {
  const partida = new Partida([{ id: 'a', slot: 0 }], { grade: gradeVazia() });
  const [a] = partida.jogadores;
  a.molotov = 1;
  partida.pedirBomba('a');
  partida.passo(dt);
  assert.equal(partida.usarMolotov('a'), false);
  assert.equal(a.molotov, 1);
  assert.equal(partida.molotovs.length, 0);
  a.x = 3;
  assert.equal(partida.usarMolotov('a'), true);
  partida.pedirBomba('a');
  rodar(partida, AJUSTES.bufferBombaS + 0.1);
  assert.equal(partida.bombas.length, 1);
  assert.equal(partida.molotovs.length, 1);
});
