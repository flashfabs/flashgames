import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarPassoFixo } from '../site/js/relogio.js';

test('a delayed tick retains all elapsed time while limiting work per wakeup', () => {
  let instante = 0, executar, passos = 0;
  criarPassoFixo(60, () => passos++, { agora: () => instante, criarTimer: (_, callback) => { executar = callback; return { parar() {} }; } });
  instante = 1000;
  executar();
  assert.equal(passos, 15);
  executar(); executar(); executar();
  assert.equal(passos, 60);
  instante = 1400;
  executar(); executar();
  assert.equal(passos, 84);
});
