// A member moves its own character with the same rules the host runs, from snapshots that arrive late, and
// reports positions that arrive late too. These tests play both sides tick by tick and check that the host
// accepts everything the member predicts, with every power, so the member's character is never pulled back.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Partida, AJUSTES, DIRECAO, CAIXA, ITEM, gradeVazia, gerarGrade, indice,
  moverComColisao, bloqueiaPrevisto, celulaAFrente, destinoAtalho,
} from '../site/js/pavio/regras.js';

const DT = 1 / 60;
const LATENCIA = 4; // ticks each way, about 67 ms

function sorteador(semente) {
  let s = semente;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

// Host with player 'a' (local) and 'm' (the member under test).
function criarMesa(grade, slotMembro = 0) {
  const partida = new Partida([{ id: 'm', slot: slotMembro, remoto: true }, { id: 'a', slot: slotMembro === 0 ? 1 : 0 }], { grade, sorteio: () => 0.99 });
  const eu = partida.jogadores[0];
  const local = { x: eu.x, y: eu.y, olhar: eu.olhar, andando: false, tenis: 0, fantasma: false, chute: false, atalhos: 0, empurrao: 0 };
  return { partida, eu, local, vistas: [], mensagens: [], tick: 0, recusas: [], entrada: { d: 0, d2: 0 }, ultimoChute: -99, liberadoAtalho: 0 };
}

// Like performance.now() on the member: every message gets a later timestamp than the one before.
function enviar(mesa, mensagem) {
  mesa.relogio = Math.max(mesa.relogio ?? 0, mesa.tick * 1000 * DT) + 0.01;
  mesa.mensagens.push({ chegaEm: mesa.tick + LATENCIA, ...mensagem, x: mesa.local.x, y: mesa.local.y, o: mesa.local.olhar, a: mesa.local.andando ? 1 : 0, c: mesa.relogio });
}

function recusar(mesa, motivo) {
  if (mesa.eu.vivo) mesa.recusas.push(`${motivo} no tick ${mesa.tick}`);
}

function passo(mesa, { bomba = false } = {}) {
  const { partida, local } = mesa;
  // Host: messages that arrived, then one step.
  while (mesa.mensagens.length && mesa.mensagens[0].chegaEm <= mesa.tick) {
    const m = mesa.mensagens.shift();
    if (!partida.aplicarPosicao('m', m) && m.t === 'p') recusar(mesa, 'posição');
    if (m.t === 'bomba') partida.pedirBomba('m');
    if (m.t === 'chute') partida.chutar('m', m.d);
    if (m.t === 'atalho' && !partida.atravessar('m', m.d)) recusar(mesa, 'atalho');
  }
  partida.passo(DT);
  mesa.vistas.push(partida.vista());
  // Member: the snapshot from LATENCIA ticks ago.
  const vista = mesa.vistas[Math.max(0, mesa.vistas.length - 1 - LATENCIA)];
  const servidor = vista.j[0];
  local.tenis = servidor.t;
  local.fantasma = Boolean(servidor.g);
  local.chute = Boolean(servidor.k);
  local.atalhos = servidor.at;
  if (servidor.v) {
    const bloqueia = (x, y) => bloqueiaPrevisto(vista.g, vista.b, local, x, y);
    moverComColisao(local, mesa.entrada, DT, bloqueia);
    const d = mesa.entrada.d;
    if (local.chute && d && mesa.tick - mesa.ultimoChute > 12) {
      const parada = (x, y) => vista.b.some(([bx, by, , deslize]) => !deslize && bx === x && by === y);
      if (celulaAFrente(local, d, parada)) {
        mesa.ultimoChute = mesa.tick;
        enviar(mesa, { t: 'chute', d });
      }
    }
    if (local.atalhos > 0) {
      const caixa = (x, y) => vista.g[indice(x, y)] === CAIXA;
      const destino = d && !local.fantasma && mesa.tick >= mesa.liberadoAtalho
        ? destinoAtalho(local, d, local.atalhos, caixa, (x, y) => !bloqueia(x, y)) : null;
      local.empurrao = destino ? local.empurrao + DT : 0;
      if (destino && local.empurrao >= AJUSTES.empurrarAtalhoS) {
        enviar(mesa, { t: 'atalho', d });
        Object.assign(local, { x: destino.x, y: destino.y, empurrao: 0 });
        mesa.liberadoAtalho = mesa.tick + 24;
      }
    }
    if (bomba) enviar(mesa, { t: 'bomba' });
    enviar(mesa, { t: 'p' });
  }
  mesa.tick++;
}

function andar(mesa, d, segundos, d2 = DIRECAO.NENHUMA) {
  mesa.entrada = { d, d2 };
  for (let t = 0; t < segundos; t += DT) passo(mesa);
}

function assentar(mesa) {
  andar(mesa, DIRECAO.NENHUMA, (LATENCIA * 3) * DT);
  assert.deepEqual(mesa.recusas, []);
  assert.ok(Math.abs(mesa.eu.x - mesa.local.x) + Math.abs(mesa.eu.y - mesa.local.y) < 1e-6, `host ${mesa.eu.x},${mesa.eu.y} member ${mesa.local.x},${mesa.local.y}`);
}

test('walking off a fresh bomb and back into it agrees with the host', () => {
  const mesa = criarMesa(gradeVazia());
  mesa.partida.bombas.length = 0;
  passo(mesa, { bomba: true });
  andar(mesa, DIRECAO.DIREITA, 0.25);
  andar(mesa, DIRECAO.ESQUERDA, 0.5);
  andar(mesa, DIRECAO.DIREITA, 0.6);
  andar(mesa, DIRECAO.ESQUERDA, 0.6);
  assentar(mesa);
  assert.equal(mesa.local.x, 2, 'once off the bomb, it blocks the way back');
});

test('fast sneakers and corner sliding agree with the host', () => {
  const mesa = criarMesa(gradeVazia());
  mesa.eu.tenis = AJUSTES.maxTenis;
  andar(mesa, DIRECAO.DIREITA, 0.43);
  andar(mesa, DIRECAO.BAIXO, 0.5);
  andar(mesa, DIRECAO.DIREITA, 0.3, DIRECAO.CIMA);
  andar(mesa, DIRECAO.CIMA, 1);
  assentar(mesa);
});

test('a ghost walking through crates, and out of one when it wears off, agrees with the host', () => {
  const grade = gradeVazia();
  for (let x = 3; x <= 9; x++) grade[indice(x, 1)] = CAIXA;
  const mesa = criarMesa(grade);
  mesa.eu.fantasma = 1.2;
  andar(mesa, DIRECAO.DIREITA, 3.5);
  assentar(mesa);
  assert.ok(mesa.local.x > 9, 'walked out of the crates after the power wore off');
  assert.equal(mesa.eu.fantasma, 0);
});

test('kicking a bomb and following it agrees with the host', () => {
  const mesa = criarMesa(gradeVazia());
  const { partida } = mesa;
  partida.jogadores[1].x = 4;
  partida.jogadores[1].y = 1;
  partida.pedirBomba('a');
  passo(mesa);
  partida.jogadores[1].x = 19;
  partida.jogadores[1].y = 13;
  partida.bombas[0].restante = 99;
  mesa.eu.chute = true;
  andar(mesa, DIRECAO.DIREITA, 3);
  assentar(mesa);
  assert.ok(partida.bombas[0].x > 10, 'the bomb was kicked');
});

test('crossing crates with shortcuts agrees with the host', () => {
  const grade = gradeVazia();
  grade[indice(3, 1)] = CAIXA;
  grade[indice(6, 1)] = CAIXA;
  grade[indice(7, 1)] = CAIXA;
  const mesa = criarMesa(grade);
  mesa.eu.atalhos = 3;
  andar(mesa, DIRECAO.DIREITA, 2.5);
  assentar(mesa);
  assert.ok(mesa.local.x > 8);
  assert.equal(mesa.eu.atalhos, 0);
});

test('a long random walk with bombs on a crowded map agrees with the host', () => {
  const sorteio = sorteador(7);
  const grade = gerarGrade(sorteio, 0.4);
  const mesa = criarMesa(grade);
  mesa.eu.bombasMax = 3;
  const direcoes = [DIRECAO.CIMA, DIRECAO.BAIXO, DIRECAO.ESQUERDA, DIRECAO.DIREITA];
  for (let k = 0; k < 40 && mesa.eu.vivo; k++) {
    mesa.entrada = { d: direcoes[Math.floor(sorteio() * 4)], d2: sorteio() < 0.5 ? direcoes[Math.floor(sorteio() * 4)] : DIRECAO.NENHUMA };
    for (let t = 0; t < 0.3; t += DT) passo(mesa, { bomba: t === 0 && sorteio() < 0.2 });
  }
  assert.deepEqual(mesa.recusas, []);
});

test('a bomb pressed a little early, still on the last one, drops on the next cell', () => {
  const partida = new Partida([{ id: 'a', slot: 0 }, { id: 'b', slot: 1 }], { grade: gradeVazia(), sorteio: () => 0.99 });
  const [a] = partida.jogadores;
  a.bombasMax = 2;
  partida.pedirBomba('a');
  partida.passo(DT);
  partida.definirEntrada('a', DIRECAO.DIREITA);
  for (let t = 0; t < 0.12; t += DT) partida.passo(DT);
  partida.pedirBomba('a');
  partida.passo(DT);
  assert.equal(partida.bombas.length, 1, 'still standing on the first bomb');
  for (let t = 0; t < 0.15; t += DT) partida.passo(DT);
  assert.deepEqual(partida.bombas.map(b => [b.x, b.y]), [[1, 1], [2, 1]]);
});

test('a bomb press waits only a moment', () => {
  const partida = new Partida([{ id: 'a', slot: 0 }, { id: 'b', slot: 1 }], { grade: gradeVazia(), sorteio: () => 0.99 });
  const [a] = partida.jogadores;
  partida.pedirBomba('a');
  partida.passo(DT);
  partida.bombas[0].restante = AJUSTES.bufferBombaS + 0.2;
  a.y = 5;
  partida.pedirBomba('a');
  for (let t = 0; t < 0.6; t += DT) partida.passo(DT);
  assert.equal(partida.bombas.length, 0, 'the press expired before the first bomb blew');
  assert.equal(a.pedidosBomba, 0);
});

test('a turn pressed a little past the corner still slides into the opening', () => {
  const partida = new Partida([{ id: 'a', slot: 0 }], { grade: gradeVazia() });
  const [a] = partida.jogadores;
  a.x = 2.15;
  partida.definirEntrada('a', DIRECAO.BAIXO);
  for (let t = 0; t < 0.5; t += DT) partida.passo(DT);
  assert.equal(a.x, 3);
  assert.ok(a.y > 1.5);
});

test('an item under the ghost path is still picked up the same way', () => {
  const grade = gradeVazia();
  grade[indice(2, 1)] = ITEM.TENIS;
  const mesa = criarMesa(grade);
  andar(mesa, DIRECAO.DIREITA, 1.5);
  assentar(mesa);
  assert.equal(mesa.eu.tenis, 1);
});
