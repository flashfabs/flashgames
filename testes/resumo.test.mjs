import { test } from 'node:test';
import assert from 'node:assert/strict';
import { destaquesDaPartida, linhaDoTempo, textoDaMorte, conquistasDaRodada, formatarDuracao } from '../site/js/pavio/resumo.js';
import { Partida, gradeVazia, somarEstatisticasRodada, AJUSTES } from '../site/js/pavio/regras.js';

const linha = (id, campos = {}) => ({ id, caixas: 0, eliminacoes: 0, bombas: 0, itens: {}, morte: null, tempoVivo: 60, distancia: 0, maiorCadeia: 0, ...campos });

test('match highlights name the best of each kind and share ties', () => {
  const destaques = destaquesDaPartida([
    linha('ana', { caixas: 7, eliminacoes: 1, tempoVivo: 80, maiorCadeia: 3 }),
    linha('gil', { caixas: 7, morte: { tempo: 41, por: 'ana', causa: 'bomba' }, tempoVivo: 41 }),
    linha('ivo', { caixas: 2, morte: { tempo: 70, por: null, causa: 'propria' }, tempoVivo: 70 }),
  ]);
  const por = Object.fromEntries(destaques.map(d => [d.chave, d]));
  assert.deepEqual(por.caixas.ids, ['ana', 'gil']);
  assert.equal(por.caixas.texto, '7 caixas');
  assert.deepEqual(por.eliminacoes.ids, ['ana']);
  assert.equal(por.eliminacoes.texto, '1 eliminação');
  assert.deepEqual(por.tempoVivo.ids, ['ana']);
  assert.equal(por.tempoVivo.texto, '1:20');
  assert.deepEqual(por.cadeia.ids, ['ana']);
  assert.deepEqual(por.rapida.ids, ['ana']);
  assert.equal(por.rapida.vitima, 'gil');
  assert.equal(por.rapida.texto, '0:41');
});

test('match highlights skip what nobody did or what does not set anyone apart', () => {
  assert.deepEqual(destaquesDaPartida([linha('ana'), linha('gil')]), []);
  assert.deepEqual(destaquesDaPartida(null), []);
});

test('the timeline lists eliminations in order and describes each one', () => {
  const tempo = linhaDoTempo([
    linha('ana'),
    linha('gil', { morte: { tempo: 50, por: 'ana', causa: 'bomba' } }),
    linha('ivo', { morte: { tempo: 12, por: null, causa: 'saiu' } }),
  ]);
  assert.deepEqual(tempo.map(m => m.id), ['ivo', 'gil']);
  const nomes = { ana: 'Ana' };
  assert.equal(textoDaMorte(tempo[1], id => nomes[id]), 'explodiu com a bomba de Ana');
  assert.equal(textoDaMorte(tempo[0]), 'saiu da sala');
  assert.equal(textoDaMorte({ causa: 'propria' }), 'explodiu com a própria bomba');
  assert.equal(textoDaMorte({ causa: 'subita' }), 'ficou preso na morte súbita');
});

test('round achievements go to the best of the round and skip what everyone shares', () => {
  const conquistas = conquistasDaRodada({
    ana: { partidas: 5, caixas: 40, eliminacoes: 3, tempoVivo: 400, itens: { b: 2, f: 3 }, maiorCadeia: 2, distancia: 300 },
    gil: { partidas: 5, caixas: 55, eliminacoes: 3, tempoVivo: 250, itens: { b: 1 }, maiorCadeia: 1, distancia: 300 },
  });
  const por = Object.fromEntries(conquistas.map(c => [c.chave, c]));
  assert.deepEqual(por.demolidor.ids, ['gil']);
  assert.equal(por.cacador, undefined, 'a tie between everyone is no achievement');
  assert.deepEqual(por.sobrevivente.ids, ['ana']);
  assert.equal(por.sobrevivente.texto, '6:40');
  assert.deepEqual(por.colecionador.ids, ['ana']);
  assert.deepEqual(por.cadeia.ids, ['ana']);
  assert.equal(por.andarilho, undefined);
  assert.deepEqual(conquistasDaRodada({ so: { caixas: 9 } }), [], 'alone there is nobody to beat');
});

test('summaries read what the rules record in a real match', () => {
  const partida = new Partida([{ id: 'a', slot: 0 }, { id: 'b', slot: 1 }], { grade: gradeVazia(), sorteio: () => 0.99 });
  partida.pedirBomba('a');
  for (let t = 0; t < AJUSTES.pavioS + 1.5 && !partida.resultado; t += 1 / 60) partida.passo(1 / 60);
  const estatisticas = partida.estatisticas();
  assert.deepEqual(linhaDoTempo(estatisticas).map(m => [m.id, m.causa]), [['a', 'propria']]);
  assert.ok(Array.isArray(conquistasDaRodada(somarEstatisticasRodada({}, estatisticas))));
  assert.equal(formatarDuracao(125.4), '2:05');
});
