import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Partida, gradeVazia, indice, CAIXA_MISTERIO, CHAO, ITEM, AJUSTES, DIRECAO } from '../site/js/pavio/regras.js';

const dt = 1 / 60;
function abrir(valor, escolha = 0, reservada = false) {
  const grade = gradeVazia();
  grade[indice(2, 1)] = CAIXA_MISTERIO;
  const sorteios = [valor, escolha];
  const partida = new Partida([{ id: 'a', slot: 0 }, { id: 'b', slot: 1 }], { grade, sorteio: () => sorteios.shift() ?? 0.99 });
  if (reservada) partida.escudosNasCaixas.add(indice(2, 1));
  partida.pedirBomba('a');
  partida.passo(dt);
  partida.jogadores[0].x = 8;
  partida.bombas[0].restante = 0;
  partida.passo(dt);
  return partida;
}

test('mystery crate outcomes use the requested probability boundaries', () => {
  const explosao = abrir(0.274999);
  for (const x of [3, 4, 5, 6]) assert.ok(explosao.chamas.has(indice(x, 1)), 'the crate explodes immediately with radius four');
  assert.ok(!explosao.chamas.has(indice(7, 1)), 'the explosion stops after four cells');
  for (const [valor, escolha, esperado] of [[0.275, 0, ITEM.BOMBA2], [0.637499, 0.8, ITEM.ATALHO], [0.4, 0.98, ITEM.ESCUDO], [0.4, 0.999, ITEM.ESCUDO2], [0.6375, 0, CHAO]]) {
    const partida = abrir(valor, escolha);
    assert.ok(!partida.chamas.has(indice(3, 1)));
    for (let t = 0; t < AJUSTES.chamaS + 0.1; t += dt) partida.passo(dt);
    assert.equal(partida.grade[indice(2, 1)], esperado);
  }
});

test('mystery crates block movement like ordinary crates', () => {
  const grade = gradeVazia();
  grade[indice(2, 1)] = CAIXA_MISTERIO;
  const partida = new Partida([{ id: 'a', slot: 0 }], { grade });
  partida.definirEntrada('a', DIRECAO.DIREITA);
  for (let t = 0; t < 0.5; t += dt) partida.passo(dt);
  assert.equal(partida.jogadores[0].x, 1);
});

test('a trapped shortcut cannot return to its starting cell', async () => {
  const { destinoAtalho } = await import('../site/js/pavio/regras.js');
  const origem = { x: 1, y: 1 };
  const parede = (x, y) => x === 0 && y === 1;
  const livre = (x, y) => x === 1 && y === 1;
  assert.equal(destinoAtalho(origem, DIRECAO.ESQUERDA, 1, () => false, livre, undefined, parede), null);
});


test('a reserved surprise crate releases one shield even when the draw would explode', () => {
  const partida = abrir(0, 0, true);
  assert.ok(!partida.chamas.has(indice(3, 1)));
  assert.equal(partida.chamas.get(indice(2, 1)).item, ITEM.ESCUDO);
  assert.equal(partida.escudosNasCaixas.size, 0);
  for (let t = 0; t < AJUSTES.chamaS + 0.1; t += dt) partida.passo(dt);
  assert.equal(partida.grade[indice(2, 1)], ITEM.ESCUDO);
});
