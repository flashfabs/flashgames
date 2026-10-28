import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Partida, MAPAS, ITEM, AJUSTES, DIRECAO, COLUNAS, LINHAS, indice, gradeVazia, gradeDoMapa, CAIXA_MISTERIO, ehCaixa, PAREDE } from '../site/js/pavio/regras.js';
const dt = 1 / 60;
const rodar = (p, tempo) => { for (let t = 0; t < tempo; t += dt) p.passo(dt); };

test('fire bonuses accumulate but expire independently', () => {
  const grade = gradeVazia();
  grade[indice(2, 1)] = ITEM.FOGO2;
  const partida = new Partida([{ id: 'a', slot: 0 }], { grade });
  const [a] = partida.jogadores;
  partida.definirEntrada('a', DIRECAO.DIREITA);
  rodar(partida, 0.4);
  assert.equal(a.alcance, 3);
  partida.definirEntrada('a', DIRECAO.NENHUMA);
  rodar(partida, 25);
  partida.grade[indice(Math.round(a.x), Math.round(a.y))] = ITEM.FOGO3;
  partida.passo(dt);
  assert.equal(a.alcance, 6);
  rodar(partida, 20);
  assert.equal(a.alcance, 4);
  rodar(partida, 15.1);
  assert.equal(a.alcance, AJUSTES.alcanceInicial);
});

test('each generated match reserves two distinct mystery crates with a shield', () => {
  for (const mapa of MAPAS) for (let variante = 0; variante < 4; variante++) for (const numero of [0, 0.99]) {
    const partida = new Partida([{ id: 'a', slot: 0 }], { mapa, variante, sorteio: () => numero });
    assert.equal(partida.escudosNasCaixas.size, 2, `${mapa.nome}, ${variante}, ${numero}`);
    for (const i of partida.escudosNasCaixas) assert.equal(partida.grade[i], CAIXA_MISTERIO);
    assert.ok(!partida.itens.includes(ITEM.ESCUDO));
    assert.ok(!partida.itens.includes(ITEM.ESCUDO2));
    assert.equal(partida.morteSubitaS, 240);
  }
  assert.deepEqual([COLUNAS, LINHAS], [40, 30]);
});

test('shield charges absorb a blast in place, with temporary invulnerability', () => {
  const grade = gradeVazia();
  grade[indice(2, 1)] = ITEM.ESCUDO2;
  const partida = new Partida([{ id: 'a', slot: 0 }, { id: 'b', slot: 1 }], { grade });
  const [a] = partida.jogadores;
  partida.definirEntrada('a', DIRECAO.DIREITA);
  rodar(partida, 0.4);
  partida.definirEntrada('a', DIRECAO.NENHUMA);
  assert.equal(a.escudo, 2);
  partida.grade[indice(Math.round(a.x), Math.round(a.y))] = ITEM.ESCUDO;
  partida.passo(dt);
  assert.equal(a.escudo, 3);
  partida.pedirBomba('a');
  partida.passo(dt);
  partida.bombas[0].restante = 0;
  rodar(partida, AJUSTES.gracaChamaS + 0.1);
  assert.equal(a.escudo, 2);
  assert.equal(a.vivo, true);
  assert.ok(a.invulneravel > 0);
  rodar(partida, 0.4);
  assert.equal(a.escudo, 2);
});


test('bomb bonuses accumulate but expire independently', () => {
  const grade = gradeVazia();
  grade[indice(2, 1)] = ITEM.BOMBA2;
  const partida = new Partida([{ id: 'a', slot: 0 }], { grade });
  const [a] = partida.jogadores;
  partida.definirEntrada('a', DIRECAO.DIREITA);
  rodar(partida, 0.4);
  partida.definirEntrada('a', DIRECAO.NENHUMA);
  assert.equal(a.bombasMax, 3);
  assert.deepEqual(partida.vista().j[0].bt, [[2, 35]]);
  rodar(partida, 25);
  partida.grade[indice(Math.round(a.x), Math.round(a.y))] = ITEM.BOMBA;
  partida.passo(dt);
  assert.equal(a.bombasMax, 4);
  assert.deepEqual(partida.vista().j[0].bt, [[2, 10], [1, 35]]);
  rodar(partida, 34);
  assert.equal(a.bombasMax, 2);
  rodar(partida, 1.1);
  assert.equal(a.bombasMax, 1);
  assert.deepEqual(partida.vista().j[0].bt, []);
});

test('snapshots include the remaining durations of timed boosters', () => {
  const partida = new Partida([{ id: 'a', slot: 0 }], { grade: gradeVazia() });
  Object.assign(partida.jogadores[0], { bombasBonus: [{ valor: 1, restante: 2.2 }], fogosBonus: [{ valor: 1, restante: 3.1 }], fantasma: 4.2, ima: 5.3, escudo: 2 });
  const { bt, ft, gt, mt, es } = partida.vista().j[0];
  assert.deepEqual([bt, ft, gt, mt, es], [[[1, 3]], [[1, 4]], 5, 6, 2]);
});


test('a banana holds players in place for 2.4 seconds, including remote players', () => {
  const grade = gradeVazia();
  grade[indice(2, 1)] = ITEM.BANANA;
  const partida = new Partida([{ id: 'a', slot: 0, remoto: true }], { grade });
  const [a] = partida.jogadores;
  assert.equal(partida.aplicarPosicao('a', { x: 2, y: 1, c: 1000 }), true);
  partida.passo(dt);
  assert.equal(partida.grade[indice(2, 1)], '.');
  assert.equal(partida.vista().j[0].st, 2.4);
  assert.equal(partida.aplicarPosicao('a', { x: 3, y: 1, c: 1100 }), false);
  partida.pedirBomba('a');
  rodar(partida, 2.3);
  assert.deepEqual([a.x, a.y, partida.bombas.length], [2, 1, 0]);
  rodar(partida, 0.2);
  assert.equal(partida.aplicarPosicao('a', { x: 3, y: 1, c: 3100 }), true);
});


test('surprise crates have at least two clear three-cell blast corridors', () => {
  let estado = 123456;
  const sorteio = () => { estado = (Math.imul(1664525, estado) + 1013904223) >>> 0; return estado / 4294967296; };
  let caixas = 0;
  for (const mapa of MAPAS) for (let variante = 0; variante < 4; variante++) {
    const grade = gradeDoMapa(mapa, variante, sorteio);
    for (let i = 0; i < grade.length; i++) {
      if (grade[i] !== CAIXA_MISTERIO) continue;
      caixas++;
      const x = i % COLUNAS, y = Math.floor(i / COLUNAS);
      const abertos = [[0, 1], [0, -1], [1, 0], [-1, 0]].filter(([dx, dy]) => [1, 2, 3].every(n => {
        const cx = x + dx * n, cy = y + dy * n;
        return cx > 0 && cy > 0 && cx < COLUNAS - 1 && cy < LINHAS - 1 && grade[indice(cx, cy)] !== PAREDE && !ehCaixa(grade[indice(cx, cy)]);
      }));
      assert.ok(abertos.length >= 2, `${mapa.nome} at ${x},${y}`);
    }
  }
  assert.ok(caixas > 0);
});

test('piercing pickups expire independently after thirty-five seconds', () => {
  const grade = gradeVazia();
  grade[indice(2, 1)] = ITEM.PERFURANTE;
  const partida = new Partida([{ id: 'a', slot: 0 }], { grade });
  const [a] = partida.jogadores;
  partida.definirEntrada('a', DIRECAO.DIREITA);
  rodar(partida, 0.4);
  partida.definirEntrada('a', DIRECAO.NENHUMA);
  assert.equal(a.perfurante, true);
  assert.deepEqual(partida.vista().j[0].pt, [35]);
  rodar(partida, 25);
  partida.grade[indice(Math.round(a.x), Math.round(a.y))] = ITEM.PERFURANTE;
  partida.passo(dt);
  assert.deepEqual(partida.vista().j[0].pt, [10, 35]);
  rodar(partida, 11);
  assert.equal(a.perfurante, true);
  assert.equal(partida.vista().j[0].pt.length, 1);
  rodar(partida, 24.1);
  assert.equal(a.perfurante, false);
  assert.deepEqual(partida.vista().j[0].pt, []);
});
