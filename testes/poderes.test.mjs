import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Partida, MAPAS, ITEM, AJUSTES, DIRECAO, CAIXA, gradeVazia, indice, bombaAFrente, preverBomba,
} from '../site/js/pavio/regras.js';

const DT = 1 / 60;
const rodar = (partida, segundos) => {
  for (let t = 0; t < segundos; t += DT) partida.passo(DT);
};
const semItens = () => 0.99;

// Player a drops a bomb at (3, 1) and steps back to (2, 1), ready to kick it to the right.
function comBombaAFrente({ grade = gradeVazia(), remoto = false } = {}) {
  const partida = new Partida([{ id: 'a', slot: 0, remoto }, { id: 'b', slot: 1 }], { grade, sorteio: semItens });
  const [a] = partida.jogadores;
  a.x = 3;
  partida.pedirBomba('a');
  partida.passo(DT);
  a.x = 2;
  partida.passo(DT);
  partida.bombas[0].restante = 99;
  return { partida, a, bomba: partida.bombas[0] };
}

test('walking into a bomb with the kick power sends it sliding to the wall', () => {
  const { partida, a, bomba } = comBombaAFrente();
  a.chute = true;
  partida.definirEntrada('a', DIRECAO.DIREITA);
  rodar(partida, 0.1);
  assert.ok(partida.tirarEventos().some(ev => ev.e === 'chute'));
  assert.ok(partida.vista().b[0][0] > 3, 'the snapshot shows the bomb between cells');
  rodar(partida, 6);
  assert.equal(bomba.x, 19);
  assert.equal(bomba.y, 1);
  assert.equal(bomba.deslize, DIRECAO.NENHUMA);
  assert.equal(a.x, 18, 'the kicker follows and stops behind the bomb');
});

test('without the kick power a bomb is just an obstacle', () => {
  const { partida, a, bomba } = comBombaAFrente();
  partida.definirEntrada('a', DIRECAO.DIREITA);
  rodar(partida, 1);
  assert.equal(bomba.x, 3);
  assert.equal(a.x, 2);
});

test('a kicked bomb stops before crates and players', () => {
  const grade = gradeVazia();
  grade[indice(8, 1)] = CAIXA;
  const { partida, a, bomba } = comBombaAFrente({ grade });
  a.chute = true;
  assert.equal(partida.chutar('a', DIRECAO.DIREITA), true);
  rodar(partida, 2);
  assert.equal(bomba.x, 7);
  assert.equal(partida.chutar('a', DIRECAO.DIREITA), false, 'too far to kick it again');

  const outra = comBombaAFrente();
  const [, b] = outra.partida.jogadores;
  b.x = 10;
  b.y = 1;
  outra.a.chute = true;
  outra.partida.chutar('a', DIRECAO.DIREITA);
  rodar(outra.partida, 2);
  assert.equal(outra.bomba.x, 9);
});

test('a kicked bomb that slides into fire blows up', () => {
  const { partida, a } = comBombaAFrente();
  a.chute = true;
  partida.chamas.set(indice(6, 1), { restante: 5, idade: 1, forma: 'c', dono: 'b', item: null });
  partida.chutar('a', DIRECAO.DIREITA);
  rodar(partida, 0.6);
  assert.equal(partida.bombas.length, 0);
  assert.ok(partida.tirarEventos().some(ev => ev.e === 'bum' && ev.x === 6));
});

test('remote players kick on request, with some slack on their reported position', () => {
  const { partida, a, bomba } = comBombaAFrente({ remoto: true });
  a.chute = true;
  a.x = 1.5;
  assert.equal(partida.chutar('a', DIRECAO.DIREITA), false, 'not touching the bomb yet');
  a.x = 1.8;
  assert.equal(partida.chutar('a', DIRECAO.DIREITA), true);
  rodar(partida, 0.3);
  assert.ok(bomba.x > 3);
});

test('remote bombs wait for the detonator', () => {
  const partida = new Partida([{ id: 'a', slot: 0 }, { id: 'b', slot: 1 }], { grade: gradeVazia(), sorteio: semItens });
  const [a] = partida.jogadores;
  a.detonador = true;
  partida.pedirBomba('a');
  partida.passo(DT);
  assert.deepEqual(partida.vista().b[0].slice(3), [DIRECAO.NENHUMA, 1]);
  a.y = 5;
  rodar(partida, AJUSTES.pavioS + 0.5);
  assert.equal(partida.bombas.length, 1, 'no normal fuse');
  partida.pedirBomba('a');
  partida.passo(DT);
  assert.equal(partida.bombas.length, 0, 'pressing with no bomb left sets it off');
});

test('a double press does not set off the bomb just dropped', () => {
  const partida = new Partida([{ id: 'a', slot: 0 }, { id: 'b', slot: 1 }], { grade: gradeVazia(), sorteio: semItens });
  const [a] = partida.jogadores;
  a.detonador = true;
  a.bombasMax = 2;
  partida.pedirBomba('a');
  partida.pedirBomba('a');
  partida.passo(DT);
  assert.equal(partida.bombas.length, 1);
  assert.equal(a.vivo, true);
  rodar(partida, AJUSTES.armarDetonadorS);
  partida.pedirBomba('a');
  partida.passo(DT);
  assert.equal(partida.bombas.length, 0, 'standing on it, a press sets it off once armed');
});

test('remote bombs blow by themselves after a while, or soon after their owner dies', () => {
  const partida = new Partida([{ id: 'a', slot: 0 }, { id: 'b', slot: 1 }], { grade: gradeVazia(), sorteio: semItens });
  const [a] = partida.jogadores;
  a.detonador = true;
  partida.pedirBomba('a');
  partida.passo(DT);
  a.y = 5;
  rodar(partida, AJUSTES.detonadorS);
  assert.equal(partida.bombas.length, 0);

  const outra = new Partida([{ id: 'a', slot: 0 }, { id: 'b', slot: 1 }, { id: 'c', slot: 2 }], { grade: gradeVazia(), sorteio: semItens });
  outra.jogadores[0].detonador = true;
  outra.pedirBomba('a');
  outra.passo(DT);
  outra.removerJogador('a');
  assert.equal(outra.bombas[0].remota, false);
  rodar(outra, AJUSTES.pavioS);
  assert.equal(outra.bombas.length, 0);
});

test('kick and detonator are picked up as items', () => {
  const grade = gradeVazia();
  grade[indice(2, 1)] = ITEM.CHUTE;
  grade[indice(3, 1)] = ITEM.DETONADOR;
  const partida = new Partida([{ id: 'a', slot: 0 }], { grade });
  partida.definirEntrada('a', DIRECAO.DIREITA);
  rodar(partida, 0.8);
  const [a] = partida.jogadores;
  assert.equal(a.chute, true);
  assert.equal(a.detonador, true);
  assert.deepEqual([partida.vista().j[0].k, partida.vista().j[0].r], [1, 1]);
});

test('kick detection needs the player at the edge of its cell, facing the bomb', () => {
  const temBomba = (x, y) => x === 3 && y === 1;
  assert.deepEqual(bombaAFrente({ x: 2, y: 1 }, DIRECAO.DIREITA, temBomba), [3, 1]);
  assert.equal(bombaAFrente({ x: 1.8, y: 1 }, DIRECAO.DIREITA, temBomba), null);
  assert.equal(bombaAFrente({ x: 2, y: 1.2 }, DIRECAO.DIREITA, temBomba), null);
  assert.equal(bombaAFrente({ x: 2, y: 1 }, DIRECAO.ESQUERDA, temBomba), null);
});

test('members predict a sliding bomb up to the last free cell', () => {
  const parede = x => x === 6;
  assert.deepEqual(preverBomba([3, 1, 2, DIRECAO.DIREITA, 0], 0.1, parede), [3.7, 1, 2, DIRECAO.DIREITA, 0]);
  assert.deepEqual(preverBomba([3, 1, 2, DIRECAO.DIREITA, 0], 1, parede), [5, 1, 2, DIRECAO.DIREITA, 0]);
  assert.deepEqual(preverBomba([9.5, 1, 2, DIRECAO.ESQUERDA, 0], 1, parede), [7, 1, 2, DIRECAO.ESQUERDA, 0]);
  const parada = [3, 1, 2, DIRECAO.NENHUMA, 0];
  assert.equal(preverBomba(parada, 1, parede), parada);
});

test('each match of the round unlocks new powers on top of the previous ones', () => {
  assert.deepEqual(MAPAS[0].itens, [ITEM.BOMBA, ITEM.FOGO]);
  assert.deepEqual(MAPAS[1].novos, [ITEM.TENIS, ITEM.CHUTE]);
  assert.deepEqual(MAPAS[2].novos, [ITEM.ESCUDO, ITEM.DETONADOR]);
  for (let n = 1; n < MAPAS.length; n++) {
    assert.ok(MAPAS[n].novos.length > 0, `${MAPAS[n].nome} brings something new`);
    assert.deepEqual(MAPAS[n].itens, [...MAPAS[n - 1].itens, ...MAPAS[n].novos]);
  }
  assert.deepEqual(new Set(MAPAS.at(-1).itens), new Set(Object.values(ITEM)));
});
