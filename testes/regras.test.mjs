import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Partida, moverComColisao, MAPAS, gerarGrade, gradeVazia, gradeDoMapa, layoutDoMapa, indice, SPAWNS, DIRECAO, CAIXA, CHAO, PAREDE, ITEM, AJUSTES, COLUNAS, LINHAS,
} from '../site/js/pavio/regras.js';

const DT = 1 / 60;
const rodar = (partida, segundos) => {
  for (let t = 0; t < segundos; t += DT) partida.passo(DT);
};
const semItens = () => 0.99;

test('grid has walls on the border and free spawn areas', () => {
  const grade = gerarGrade(() => 0);
  for (let x = 0; x < COLUNAS; x++) {
    assert.equal(grade[indice(x, 0)], PAREDE);
    assert.equal(grade[indice(x, LINHAS - 1)], PAREDE);
  }
  for (const [x, y] of SPAWNS) {
    assert.equal(grade[indice(x, y)], CHAO);
  }
  assert.equal(grade[indice(3, 3)], CAIXA);
});

test('player walks along a lane and stops at walls', () => {
  const partida = new Partida([{ id: 'a', slot: 0 }], { grade: gradeVazia() });
  partida.definirEntrada('a', DIRECAO.CIMA);
  rodar(partida, 0.5);
  assert.equal(partida.jogadores[0].y, 1);
  partida.definirEntrada('a', DIRECAO.DIREITA);
  rodar(partida, 0.5);
  assert.ok(partida.jogadores[0].x > 2);
  assert.equal(partida.jogadores[0].y, 1);
});

test('corner assist slides the player into the open lane', () => {
  const partida = new Partida([{ id: 'a', slot: 0 }], { grade: gradeVazia() });
  const jogador = partida.jogadores[0];
  jogador.x = 3;
  jogador.y = 1.3;
  partida.definirEntrada('a', DIRECAO.DIREITA);
  rodar(partida, 0.3);
  assert.equal(jogador.y, 1);
  assert.ok(jogador.x > 3);
});

test('a player can leave their own bomb but not walk back onto it', () => {
  const partida = new Partida([{ id: 'a', slot: 0 }, { id: 'b', slot: 1 }], { grade: gradeVazia(), sorteio: semItens });
  partida.pedirBomba('a');
  partida.passo(DT);
  assert.equal(partida.bombas.length, 1);
  partida.definirEntrada('a', DIRECAO.DIREITA);
  rodar(partida, 0.6);
  assert.ok(partida.jogadores[0].x >= 2);
  partida.definirEntrada('a', DIRECAO.ESQUERDA);
  rodar(partida, 0.6);
  assert.equal(partida.jogadores[0].x, 2);
});

test('explosion breaks the first crate, stops there and kills players in range', () => {
  const grade = gradeVazia();
  grade[indice(4, 1)] = CAIXA;
  grade[indice(5, 1)] = CAIXA;
  const partida = new Partida([{ id: 'a', slot: 0 }, { id: 'b', slot: 1 }], { grade, sorteio: semItens });
  const [a] = partida.jogadores;
  a.x = 3;
  partida.pedirBomba('a');
  rodar(partida, AJUSTES.pavioS + AJUSTES.gracaChamaS + 0.05);
  assert.equal(partida.grade[indice(4, 1)], CHAO);
  assert.equal(partida.grade[indice(5, 1)], CAIXA);
  assert.equal(a.vivo, false);
  rodar(partida, AJUSTES.folgaFimS + 0.1);
  assert.deepEqual(partida.resultado, { vencedor: 'b' });
});

test('bombs in range of a blast explode in a chain', () => {
  const partida = new Partida([{ id: 'a', slot: 0 }, { id: 'b', slot: 1 }], { grade: gradeVazia(), sorteio: semItens });
  const [a] = partida.jogadores;
  a.bombasMax = 2;
  partida.pedirBomba('a');
  partida.passo(DT);
  a.x = 3;
  partida.pedirBomba('a');
  partida.passo(DT);
  assert.equal(partida.bombas.length, 2);
  partida.bombas[1].restante = 99;
  a.x = 5;
  a.y = 3;
  rodar(partida, AJUSTES.pavioS);
  assert.equal(partida.bombas.length, 0);
  assert.ok(partida.chamas.has(indice(5, 1)), 'second bomb flames reach past the first one');
});

test('shield absorbs one hit', () => {
  const partida = new Partida([{ id: 'a', slot: 0 }, { id: 'b', slot: 1 }], { grade: gradeVazia(), sorteio: semItens });
  const [a] = partida.jogadores;
  a.escudo = true;
  partida.pedirBomba('a');
  rodar(partida, AJUSTES.pavioS + 0.2);
  assert.equal(a.vivo, true);
  assert.equal(a.escudo, false);
});

test('items are picked up by walking over them', () => {
  const grade = gradeVazia();
  grade[indice(2, 1)] = ITEM.FOGO;
  const partida = new Partida([{ id: 'a', slot: 0 }], { grade });
  partida.definirEntrada('a', DIRECAO.DIREITA);
  rodar(partida, 0.4);
  assert.equal(partida.jogadores[0].alcance, AJUSTES.alcanceInicial + 1);
  assert.equal(partida.grade[indice(2, 1)], CHAO);
});

test('sudden death eventually closes the arena', () => {
  const partida = new Partida([{ id: 'a', slot: 0 }, { id: 'b', slot: 1 }], { grade: gradeVazia() });
  rodar(partida, AJUSTES.morteSubitaS + 20);
  assert.equal(partida.jogadores[0].vivo, false);
  assert.ok(partida.resultado);
});

test('a held diagonal keeps moving and turns at the next opening', () => {
  const partida = new Partida([{ id: 'a', slot: 0 }], { grade: gradeVazia() });
  const jogador = partida.jogadores[0];
  // Up is blocked by the top wall in row 1, so the secondary direction (right) moves the player.
  partida.definirEntrada('a', DIRECAO.CIMA, DIRECAO.DIREITA);
  rodar(partida, 0.2);
  assert.ok(jogador.x > 1);
  assert.equal(jogador.y, 1);
  // Down from row 1 is blocked by pillars at even columns and open at odd ones.
  jogador.x = 2.1;
  partida.definirEntrada('a', DIRECAO.BAIXO, DIRECAO.DIREITA);
  rodar(partida, 0.6);
  assert.equal(jogador.x, 3);
  assert.ok(jogador.y > 1.5);
});

test('remote positions are accepted when plausible and refused through walls', () => {
  const partida = new Partida([{ id: 'a', slot: 0 }, { id: 'b', slot: 1, remoto: true }], { grade: gradeVazia() });
  const b = partida.jogadores[1];
  assert.equal(partida.aplicarPosicao('b', { x: 19, y: 12.8, o: DIRECAO.CIMA, a: 1, c: 1000 }), true);
  assert.equal(b.y, 12.8);
  assert.equal(partida.aplicarPosicao('b', { x: 19, y: 12.7, c: 900 }), false, 'older reports are ignored');
  assert.equal(partida.aplicarPosicao('b', { x: 19, y: 4, c: 1100 }), false, 'too far for the elapsed time');
  assert.equal(partida.aplicarPosicao('b', { x: 18, y: 12, c: 2000 }), false, 'inside a pillar');
  partida.passo(1 / 60);
  assert.equal(b.y, 12.8, 'the host never moves remote players itself');
});

test('flames need a moment before they hurt', () => {
  const partida = new Partida([{ id: 'a', slot: 0 }, { id: 'b', slot: 1 }], { grade: gradeVazia(), sorteio: semItens });
  partida.pedirBomba('a');
  rodar(partida, AJUSTES.pavioS + AJUSTES.gracaChamaS / 2);
  assert.equal(partida.jogadores[0].vivo, true);
  rodar(partida, AJUSTES.gracaChamaS);
  assert.equal(partida.jogadores[0].vivo, false);
});

test('shared movement stops at bombs the player is not standing on', () => {
  const jogador = { x: 1, y: 1, tenis: 0, olhar: 0, andando: false };
  const bloqueia = (x, y) => x === 2 && y === 1;
  moverComColisao(jogador, { d: DIRECAO.DIREITA }, 0.5, bloqueia);
  assert.equal(jogador.x, 1);
  assert.equal(jogador.andando, false);
});

test('every map variant keeps all its walls, its spawns free and its open cells reachable', () => {
  for (const mapa of MAPAS) {
    for (const variante of [0, 1]) {
      const { muros, semPilares } = layoutDoMapa(mapa, variante);
      const grade = gradeDoMapa(mapa, variante, () => 0.99);
      for (const [x, y] of SPAWNS) assert.equal(grade[indice(x, y)], CHAO, `${mapa.nome} ${variante} spawn ${x},${y}`);
      for (const [x, y] of muros) assert.equal(grade[indice(x, y)], PAREDE, `${mapa.nome} ${variante} wall ${x},${y}`);
      for (const [x, y] of semPilares) assert.notEqual(grade[indice(x, y)], PAREDE, `${mapa.nome} ${variante} open pillar ${x},${y}`);
    }
  }
});

test('map layouts are the same seen from every corner, and variants differ', () => {
  for (const mapa of MAPAS) {
    const grades = [0, 1].map(variante => gradeDoMapa(mapa, variante, () => 0));
    for (const grade of grades) {
      for (let y = 0; y < LINHAS; y++) {
        for (let x = 0; x < COLUNAS; x++) {
          const parede = grade[indice(x, y)] === PAREDE;
          assert.equal(grade[indice(COLUNAS - 1 - x, y)] === PAREDE, parede, `${mapa.nome} mirrored across`);
          assert.equal(grade[indice(x, LINHAS - 1 - y)] === PAREDE, parede, `${mapa.nome} mirrored down`);
        }
      }
    }
    assert.notDeepEqual(grades[0], grades[1], `${mapa.nome} variants differ`);
  }
});

test('crate-free cells stay clear and sudden death fills opened pillars too', () => {
  const patio = MAPAS[0];
  const { livres } = layoutDoMapa(patio, 0);
  const grade = gradeDoMapa(patio, 0, () => 0);
  for (const i of livres) assert.equal(grade[i], CHAO);
  assert.equal(grade[indice(10, 6)], CHAO, 'the square has no pillar');
  const partida = new Partida([{ id: 'a', slot: 0 }, { id: 'b', slot: 1 }], { mapa: patio, variante: 0 });
  assert.ok(partida.espiral.some(([x, y]) => x === 10 && y === 6), 'sudden death reaches the opened pillar');
  assert.ok(!partida.espiral.some(([x, y]) => partida.grade[indice(x, y)] === PAREDE), 'and skips walls');
});

test('crates and eliminations are credited to the bomb owner', () => {
  const grade = gradeVazia();
  grade[indice(1, 3)] = CAIXA;
  const partida = new Partida([{ id: 'a', slot: 0 }, { id: 'b', slot: 1 }], { grade, sorteio: semItens });
  const [a, b] = partida.jogadores;
  b.x = 3;
  b.y = 1;
  partida.pedirBomba('a');
  partida.passo(DT);
  // Take the owner out of the blast; only the credit matters here.
  a.x = 19;
  a.y = 13;
  rodar(partida, AJUSTES.pavioS + AJUSTES.gracaChamaS + 0.05);
  assert.equal(a.caixas, 1);
  assert.equal(a.eliminacoes, 1);
  assert.equal(b.vivo, false);
});

test('piercing flames go through crates', () => {
  const grade = gradeVazia();
  grade[indice(2, 1)] = CAIXA;
  grade[indice(3, 1)] = CAIXA;
  const partida = new Partida([{ id: 'a', slot: 0 }, { id: 'b', slot: 1 }], { grade, sorteio: semItens });
  const [a] = partida.jogadores;
  a.perfurante = true;
  partida.pedirBomba('a');
  partida.passo(DT);
  a.x = 1;
  a.y = 5;
  rodar(partida, AJUSTES.pavioS);
  assert.equal(partida.grade[indice(2, 1)], CHAO);
  assert.equal(partida.grade[indice(3, 1)], CHAO);
  assert.equal(a.caixas, 2);
});

test('a ghost walks through crates while the power lasts', () => {
  const grade = gradeVazia();
  grade[indice(2, 1)] = CAIXA;
  const partida = new Partida([{ id: 'a', slot: 0 }], { grade });
  const [a] = partida.jogadores;
  partida.definirEntrada('a', DIRECAO.DIREITA);
  rodar(partida, 0.3);
  assert.equal(a.x, 1, 'blocked without the power');
  a.fantasma = AJUSTES.fantasmaS;
  rodar(partida, 0.5);
  assert.ok(a.x > 2);
});
