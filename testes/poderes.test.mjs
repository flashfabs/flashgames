import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Partida, MAPAS, ITEM, AJUSTES, DIRECAO, CAIXA, CHAO, gradeVazia, indice, celulaAFrente, destinoAtalho, preverBomba, preverItemVoando, preverGelo,
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
  assert.deepEqual(partida.vista().b[0].slice(3, 5), [DIRECAO.NENHUMA, 1]);
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

test('pushing detection needs the player at the edge of its cell, facing the cell', () => {
  const temBomba = (x, y) => x === 3 && y === 1;
  assert.deepEqual(celulaAFrente({ x: 2, y: 1 }, DIRECAO.DIREITA, temBomba), [3, 1]);
  assert.equal(celulaAFrente({ x: 1.8, y: 1 }, DIRECAO.DIREITA, temBomba), null);
  assert.equal(celulaAFrente({ x: 2, y: 1.2 }, DIRECAO.DIREITA, temBomba), null);
  assert.equal(celulaAFrente({ x: 2, y: 1 }, DIRECAO.ESQUERDA, temBomba), null);
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
  assert.deepEqual(MAPAS[0].itens, [ITEM.BOMBA, ITEM.FOGO, ITEM.ATALHO]);
  assert.deepEqual(MAPAS[0].novos, [ITEM.ATALHO]);
  assert.deepEqual(MAPAS[1].novos, [ITEM.TENIS, ITEM.CHUTE]);
  assert.deepEqual(MAPAS[2].novos, [ITEM.ESCUDO, ITEM.DETONADOR]);
  assert.deepEqual(MAPAS[3].novos, [ITEM.PERFURANTE, ITEM.IMA]);
  assert.deepEqual(MAPAS[4].novos, [ITEM.FANTASMA, ITEM.GELO]);
  for (let n = 1; n < MAPAS.length; n++) {
    assert.ok(MAPAS[n].novos.length > 0, `${MAPAS[n].nome} brings something new`);
    assert.deepEqual(MAPAS[n].itens, [...MAPAS[n - 1].itens, ...MAPAS[n].novos]);
  }
  assert.deepEqual(new Set(MAPAS.at(-1).itens), new Set(Object.values(ITEM)));
});

test('a magnet pulls nearby items to its player, over walls', () => {
  const grade = gradeVazia();
  grade[indice(4, 1)] = ITEM.FOGO;
  grade[indice(3, 3)] = ITEM.BOMBA;
  grade[indice(6, 1)] = ITEM.TENIS;
  const partida = new Partida([{ id: 'a', slot: 0 }], { grade });
  const [a] = partida.jogadores;
  rodar(partida, 0.2);
  assert.equal(partida.grade[indice(4, 1)], ITEM.FOGO, 'nothing moves without the power');
  a.ima = AJUSTES.imaS;
  partida.passo(DT);
  assert.equal(partida.grade[indice(4, 1)], CHAO);
  assert.equal(partida.grade[indice(3, 3)], CHAO, 'the pillar in between does not stop it');
  assert.equal(partida.grade[indice(6, 1)], ITEM.TENIS, 'out of reach');
  assert.equal(partida.vista().iv.length, 2);
  assert.equal(partida.vista().j[0].m, 1);
  rodar(partida, 0.5);
  assert.equal(a.alcance, AJUSTES.alcanceInicial + 1);
  assert.equal(a.bombasMax, 2);
  assert.equal(partida.voando.length, 0);
  assert.ok(partida.tirarEventos().some(ev => ev.e === 'item' && ev.item === ITEM.FOGO));
});

test('the magnet wears off, and picking one up turns it on', () => {
  const grade = gradeVazia();
  grade[indice(2, 1)] = ITEM.IMA;
  const partida = new Partida([{ id: 'a', slot: 0 }], { grade });
  const [a] = partida.jogadores;
  partida.definirEntrada('a', DIRECAO.DIREITA);
  rodar(partida, 0.3);
  partida.definirEntrada('a', DIRECAO.NENHUMA);
  assert.ok(a.ima > 0);
  const perto = indice(Math.round(a.x) + 2, 1);
  partida.grade[perto] = ITEM.FOGO;
  partida.passo(DT);
  assert.equal(partida.grade[perto], CHAO, 'still on');
  rodar(partida, AJUSTES.imaS);
  partida.grade[perto] = ITEM.FOGO;
  rodar(partida, 0.5);
  assert.equal(partida.grade[perto], ITEM.FOGO, 'worn off');
});

test('an item flying to a player who dies drops where it is', () => {
  const grade = gradeVazia();
  grade[indice(4, 1)] = ITEM.FOGO;
  const partida = new Partida([{ id: 'a', slot: 0 }, { id: 'b', slot: 1 }], { grade });
  partida.jogadores[0].ima = AJUSTES.imaS;
  partida.passo(DT);
  partida.removerJogador('a');
  partida.passo(DT);
  assert.equal(partida.voando.length, 0);
  assert.equal(partida.grade[indice(4, 1)], ITEM.FOGO);
});

test('members predict a flying item toward where its player is drawn', () => {
  assert.deepEqual(preverItemVoando([4, 1, ITEM.FOGO, 0], { x: 1, y: 1 }, 0.125), [3, 1, ITEM.FOGO, 0]);
  assert.deepEqual(preverItemVoando([4, 1, ITEM.FOGO, 0], { x: 1, y: 1 }, 2), [1, 1, ITEM.FOGO, 0]);
  const sem = [4, 1, ITEM.FOGO, 5];
  assert.equal(preverItemVoando(sem, undefined, 1), sem);
});

// Player b drops a bomb at (5, 1) and walks away; player a stands at (1, 1) facing right with ice.
function comGelo({ grade = gradeVazia(), distancia = 4 } = {}) {
  const partida = new Partida([{ id: 'a', slot: 0 }, { id: 'b', slot: 1 }], { grade, sorteio: semItens });
  const [a, b] = partida.jogadores;
  b.x = 1 + distancia;
  b.y = 1;
  partida.pedirBomba('b');
  partida.passo(DT);
  b.x = 19;
  b.y = 13;
  a.olhar = DIRECAO.DIREITA;
  a.gelo = 1;
  return { partida, a, b, bomba: partida.bombas[0] };
}

test('ice freezes the first bomb ahead and its fuse waits', () => {
  const { partida, a, bomba } = comGelo();
  partida.jogarGelo('a');
  partida.passo(DT);
  assert.equal(a.gelo, 0);
  assert.equal(partida.vista().gl.length, 1);
  rodar(partida, 0.4);
  assert.equal(partida.gelos.length, 0);
  assert.equal(bomba.congelada > 0, true);
  assert.equal(partida.vista().b[0][5], 1);
  const restante = bomba.restante;
  rodar(partida, AJUSTES.congelarS - 0.5);
  assert.equal(bomba.restante, restante, 'the fuse did not move while frozen');
  rodar(partida, restante + 0.6);
  assert.equal(partida.bombas.length, 0, 'it blows once thawed');
});

test('ice without charges does nothing, and the item gives a few charges', () => {
  const { partida, a, bomba } = comGelo();
  a.gelo = 0;
  partida.jogarGelo('a');
  rodar(partida, 0.5);
  assert.equal(bomba.congelada, 0);
  const grade = gradeVazia();
  grade[indice(2, 1)] = ITEM.GELO;
  grade[indice(3, 1)] = ITEM.GELO;
  grade[indice(4, 1)] = ITEM.GELO;
  const outra = new Partida([{ id: 'a', slot: 0 }], { grade });
  outra.definirEntrada('a', DIRECAO.DIREITA);
  rodar(outra, 1.2);
  assert.equal(outra.jogadores[0].gelo, AJUSTES.maxGelo);
  assert.equal(outra.vista().j[0].gl, AJUSTES.maxGelo);
});

test('crates stop the ice, and so does the range', () => {
  const grade = gradeVazia();
  grade[indice(3, 1)] = CAIXA;
  const atras = comGelo({ grade });
  atras.partida.jogarGelo('a');
  rodar(atras.partida, 0.5);
  assert.equal(atras.bomba.congelada, 0);
  const longe = comGelo({ distancia: AJUSTES.alcanceGelo + 1 });
  longe.partida.jogarGelo('a');
  rodar(longe.partida, 1);
  assert.equal(longe.bomba.congelada, 0);
  assert.equal(longe.partida.gelos.length, 0);
});

test('fire from another bomb still sets off a frozen one', () => {
  const { partida, a, bomba } = comGelo();
  bomba.congelada = AJUSTES.congelarS;
  bomba.restante = 0.05;
  a.x = 3;
  partida.pedirBomba('a');
  partida.passo(DT);
  a.y = 5;
  a.x = 1;
  rodar(partida, AJUSTES.pavioS);
  assert.equal(partida.bombas.length, 0);
});

test('the detonator skips frozen bombs', () => {
  const partida = new Partida([{ id: 'a', slot: 0 }, { id: 'b', slot: 1 }], { grade: gradeVazia(), sorteio: semItens });
  const [a] = partida.jogadores;
  a.detonador = true;
  partida.pedirBomba('a');
  partida.passo(DT);
  a.y = 5;
  rodar(partida, 0.5);
  partida.bombas[0].congelada = AJUSTES.congelarS;
  partida.pedirBomba('a');
  partida.passo(DT);
  assert.equal(partida.bombas.length, 1);
});

test('members predict an ice shot up to the last free cell', () => {
  const parede = x => x === 6;
  assert.deepEqual(preverGelo([2, 1, DIRECAO.DIREITA], 0.1, parede), [3.2, 1, DIRECAO.DIREITA]);
  assert.deepEqual(preverGelo([2, 1, DIRECAO.DIREITA], 1, parede), [5, 1, DIRECAO.DIREITA]);
  assert.deepEqual(preverGelo([2, 9, DIRECAO.CIMA], 0.25, () => false), [2, 6, DIRECAO.CIMA]);
});

// Player a at (1, 1) facing crates at (2, 1) onward; the row is otherwise empty.
function comCaixas(caixas, { atalhos = 1 } = {}) {
  const grade = gradeVazia();
  for (const x of caixas) grade[indice(x, 1)] = CAIXA;
  const partida = new Partida([{ id: 'a', slot: 0 }, { id: 'b', slot: 1 }], { grade, sorteio: semItens });
  const [a] = partida.jogadores;
  a.atalhos = atalhos;
  return { partida, a };
}

test('pushing against a crate with a shortcut charge lands on the other side', () => {
  const { partida, a } = comCaixas([2]);
  partida.definirEntrada('a', DIRECAO.DIREITA);
  rodar(partida, AJUSTES.empurrarAtalhoS / 2);
  assert.equal(a.x, 1, 'a bump is not enough');
  rodar(partida, AJUSTES.empurrarAtalhoS);
  assert.ok(a.x >= 3);
  assert.equal(a.atalhos, 0);
  assert.equal(partida.grade[indice(2, 1)], CAIXA, 'the crate is still there');
  assert.ok(partida.tirarEventos().some(ev => ev.e === 'atalho' && ev.x2 === 3));
});

test('crates side by side take one charge each', () => {
  const pouco = comCaixas([2, 3]);
  pouco.partida.definirEntrada('a', DIRECAO.DIREITA);
  rodar(pouco.partida, 1);
  assert.equal(pouco.a.x, 1);
  assert.equal(pouco.a.atalhos, 1);
  const bastante = comCaixas([2, 3, 6], { atalhos: 3 });
  bastante.partida.definirEntrada('a', DIRECAO.DIREITA);
  rodar(bastante.partida, 0.3);
  assert.ok(bastante.a.x >= 4);
  assert.equal(bastante.a.atalhos, 1);
  rodar(bastante.partida, 1.2);
  assert.ok(bastante.a.x >= 7, 'walks on and crosses the next crate');
  assert.equal(bastante.a.atalhos, 0);
});

test('a shortcut needs a free cell past the crates', () => {
  const contraBomba = comCaixas([2]);
  const [a, b] = contraBomba.partida.jogadores;
  b.x = 3;
  b.y = 1;
  contraBomba.partida.pedirBomba('b');
  contraBomba.partida.passo(DT);
  b.x = 19;
  b.y = 13;
  contraBomba.partida.bombas[0].restante = 99;
  contraBomba.partida.definirEntrada('a', DIRECAO.DIREITA);
  rodar(contraBomba.partida, 0.5);
  assert.equal(a.x, 1);
  const contraParede = comCaixas([19]);
  contraParede.a.x = 18;
  contraParede.partida.definirEntrada('a', DIRECAO.DIREITA);
  rodar(contraParede.partida, 0.5);
  assert.equal(contraParede.a.x, 18, 'the border is past the crate');
  assert.equal(contraParede.a.atalhos, 1);
});

test('remote players cross crates on request, with some slack', () => {
  const grade = gradeVazia();
  grade[indice(2, 1)] = CAIXA;
  const partida = new Partida([{ id: 'a', slot: 0, remoto: true }, { id: 'b', slot: 1 }], { grade, sorteio: semItens });
  const [a] = partida.jogadores;
  assert.equal(partida.atravessar('a', DIRECAO.DIREITA), false, 'no charge');
  a.atalhos = 2;
  a.x = 0.8;
  assert.equal(partida.atravessar('a', DIRECAO.DIREITA), true);
  assert.deepEqual([a.x, a.y, a.atalhos], [3, 1, 1]);
  assert.equal(partida.vista().j[0].at, 1);
});

test('shortcut items stack up to the limit', () => {
  const grade = gradeVazia();
  for (let x = 2; x <= 8; x++) grade[indice(x, 1)] = ITEM.ATALHO;
  const partida = new Partida([{ id: 'a', slot: 0 }], { grade });
  partida.definirEntrada('a', DIRECAO.DIREITA);
  rodar(partida, 3);
  assert.equal(partida.jogadores[0].atalhos, AJUSTES.maxAtalhos);
});

test('the shortcut landing skips the whole run of crates', () => {
  const caixas = new Set(['2,1', '3,1']);
  const ehCaixa = (x, y) => caixas.has(`${x},${y}`);
  const livre = () => true;
  assert.deepEqual(destinoAtalho({ x: 1, y: 1 }, DIRECAO.DIREITA, 2, ehCaixa, livre), { x: 4, y: 1, caixas: 2 });
  assert.equal(destinoAtalho({ x: 1, y: 1 }, DIRECAO.DIREITA, 1, ehCaixa, livre), null);
  assert.equal(destinoAtalho({ x: 1, y: 1 }, DIRECAO.DIREITA, 2, ehCaixa, () => false), null);
  assert.equal(destinoAtalho({ x: 1, y: 1 }, DIRECAO.CIMA, 2, ehCaixa, livre), null);
});

test('whoever kicks a bomb is credited with what it breaks and hits', () => {
  const grade = gradeVazia();
  grade[indice(9, 1)] = CAIXA;
  const partida = new Partida([{ id: 'a', slot: 0 }, { id: 'b', slot: 1 }, { id: 'c', slot: 2 }], { grade, sorteio: semItens });
  const [a, b, c] = partida.jogadores;
  // b drops a bomb at (3, 1), a kicks it toward c, standing in front of the crate.
  b.x = 3;
  b.y = 1;
  partida.pedirBomba('b');
  partida.passo(DT);
  b.x = 19;
  b.y = 13;
  c.x = 7;
  c.y = 1;
  a.x = 2;
  a.chute = true;
  partida.bombas[0].restante = 1;
  partida.chutar('a', DIRECAO.DIREITA);
  a.x = 1;
  a.y = 5;
  rodar(partida, 1.5);
  assert.equal(c.vivo, false);
  assert.equal(a.eliminacoes, 1);
  assert.equal(b.eliminacoes, 0);
  assert.equal(partida.estatisticas()[2].morte.por, 'a');
});
