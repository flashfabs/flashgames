import { test } from 'node:test';
import assert from 'node:assert/strict';

const perto = (valor, esperado) => assert.ok(Math.abs(valor - esperado) < 1e-9, `${valor} should be ${esperado}`);
import { novaMedida, contarRecebido, medirPerda, nivelConexao } from '../site/js/sala.js';

test('loss is measured from the gaps in the fast channel sequence numbers', () => {
  const medida = novaMedida();
  assert.equal(medirPerda(medida), null, 'nothing to judge yet');
  for (let seq = 1; seq <= 20; seq++) if (seq % 5 !== 3) contarRecebido(medida, seq);
  perto(medirPerda(medida), 0.2);
  for (let seq = 21; seq <= 40; seq++) contarRecebido(medida, seq);
  perto(medirPerda(medida), 0.1);
  contarRecebido(medida, 41);
  perto(medirPerda(medida), 0.1); // too few new messages keep the last figure
});

test('connection level combines ping and loss', () => {
  assert.equal(nivelConexao({}), null);
  assert.equal(nivelConexao({ ping: 30, perda: 0 }), 'boa');
  assert.equal(nivelConexao({ ping: 90, perda: 0 }), 'media');
  assert.equal(nivelConexao({ ping: 30, perda: 0.03 }), 'media');
  assert.equal(nivelConexao({ ping: 30, perda: 0.2 }), 'ruim');
  assert.equal(nivelConexao({ ping: 200, perda: null }), 'ruim');
});
