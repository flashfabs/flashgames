import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Partida, MAPAS, ITEM, AJUSTES, DIRECAO, CAIXA, gradeVazia, indice, somarEstatisticasRodada,
} from '../site/js/pavio/regras.js';

const DT = 1 / 60;
const rodar = (partida, segundos) => {
  for (let t = 0; t < segundos; t += DT) partida.passo(DT);
};
const semItens = () => 0.99;

test('every map has a stable art theme', () => {
  assert.deepEqual(MAPAS.map(mapa => mapa.tema), ['patio', 'deposito', 'muralhas', 'labirinto', 'fornalha']);
});

test('statistics follow the contract for every player', () => {
  const partida = new Partida([{ id: 'a', slot: 0 }, { id: 'b', slot: 1 }], { grade: gradeVazia() });
  rodar(partida, 0.5);
  for (const linha of partida.estatisticas()) {
    assert.deepEqual(Object.keys(linha).sort(), ['bombas', 'caixas', 'distancia', 'eliminacoes', 'id', 'itens', 'maiorCadeia', 'morte', 'tempoVivo'].sort());
    assert.equal(linha.morte, null);
    assert.ok(Math.abs(linha.tempoVivo - partida.tempo) < 0.01);
  }
});

test('an elimination records who, how and when', () => {
  const grade = gradeVazia();
  grade[indice(1, 3)] = CAIXA;
  const partida = new Partida([{ id: 'a', slot: 0 }, { id: 'b', slot: 1 }, { id: 'c', slot: 2 }], { grade, sorteio: semItens });
  const [a, b] = partida.jogadores;
  b.x = 3;
  b.y = 1;
  partida.pedirBomba('a');
  partida.passo(DT);
  a.x = 1;
  a.y = 5;
  rodar(partida, AJUSTES.pavioS + AJUSTES.gracaChamaS + 0.05);
  const [ea, eb] = partida.estatisticas();
  assert.equal(ea.bombas, 1);
  assert.equal(ea.caixas, 1);
  assert.equal(ea.eliminacoes, 1);
  assert.equal(ea.maiorCadeia, 1);
  assert.equal(eb.morte.causa, 'bomba');
  assert.equal(eb.morte.por, 'a');
  assert.ok(eb.morte.tempo > AJUSTES.pavioS);
  assert.equal(eb.tempoVivo, eb.morte.tempo);
});

test('own bombs, sudden death and leaving are told apart', () => {
  const propria = new Partida([{ id: 'a', slot: 0 }, { id: 'b', slot: 1 }], { grade: gradeVazia(), sorteio: semItens });
  propria.pedirBomba('a');
  rodar(propria, AJUSTES.pavioS + 0.3);
  assert.deepEqual([propria.estatisticas()[0].morte.causa, propria.estatisticas()[0].morte.por], ['propria', null]);
  assert.equal(propria.estatisticas()[0].eliminacoes, 0);

  const subita = new Partida([{ id: 'a', slot: 0 }, { id: 'b', slot: 1 }], { grade: gradeVazia() });
  rodar(subita, AJUSTES.morteSubitaS + 1);
  assert.equal(subita.estatisticas()[0].morte.causa, 'subita');

  const saiu = new Partida([{ id: 'a', slot: 0 }, { id: 'b', slot: 1 }, { id: 'c', slot: 2 }], { grade: gradeVazia() });
  saiu.removerJogador('c');
  assert.equal(saiu.estatisticas()[2].morte.causa, 'saiu');
});

test('items, distance and chains are counted', () => {
  const grade = gradeVazia();
  grade[indice(2, 1)] = ITEM.FOGO;
  grade[indice(3, 1)] = ITEM.FOGO;
  grade[indice(4, 1)] = ITEM.BOMBA;
  const partida = new Partida([{ id: 'a', slot: 0 }, { id: 'b', slot: 1 }], { grade, sorteio: semItens });
  partida.definirEntrada('a', DIRECAO.DIREITA);
  rodar(partida, 1.4);
  partida.definirEntrada('a', DIRECAO.NENHUMA);
  const [a] = partida.jogadores;
  const linha = partida.estatisticas()[0];
  assert.deepEqual(linha.itens, { [ITEM.FOGO]: 2, [ITEM.BOMBA]: 1 });
  assert.ok(Math.abs(linha.distancia - (a.x - 1)) < 0.11);

  // Two bombs in a row: the first one to blow sets off the other.
  a.x = 5;
  partida.pedirBomba('a');
  partida.passo(DT);
  a.x = 6;
  partida.pedirBomba('a');
  partida.passo(DT);
  partida.bombas[1].restante = 99;
  a.x = 7;
  a.y = 5;
  rodar(partida, AJUSTES.pavioS);
  assert.equal(partida.estatisticas()[0].maiorCadeia, 2);
  assert.equal(partida.estatisticas()[0].bombas, 2);
});

test('round totals add matches up', () => {
  const linha = { id: 'a', caixas: 2, eliminacoes: 1, bombas: 3, itens: { f: 1 }, morte: null, tempoVivo: 30, distancia: 12.5, maiorCadeia: 2 };
  const morto = { ...linha, itens: { f: 2, b: 1 }, morte: { tempo: 10, por: 'b', causa: 'bomba' }, tempoVivo: 10, maiorCadeia: 1 };
  const rodada = somarEstatisticasRodada(somarEstatisticasRodada({}, [linha]), [morto]);
  assert.deepEqual(rodada.a, {
    partidas: 2, caixas: 4, eliminacoes: 2, bombas: 6, itens: { f: 3, b: 1 }, mortes: 1, tempoVivo: 40, distancia: 25, maiorCadeia: 2,
  });
});
