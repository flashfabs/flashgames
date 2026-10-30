// RTS movement acceptance: a group crosses a narrow bridge almost as fast as one unit alone, and with 20 group orders
// given on the same tick to about 2,000 units nobody spends more than 5 seconds without progress.
import test from 'node:test';
import assert from 'node:assert/strict';
import { atravessarPonte, ordensSimultaneas } from './rts-sim-cenarios.mjs';
import { PASSOS_POR_SEGUNDO } from '../site/rts/js/sim/contratos.js';

test('20 tanks cross a 2-cell bridge within 1.5 times the time of one tank plus 8 s', () => {
  const sozinho = atravessarPonte(1);
  const grupo = atravessarPonte(20);
  assert.ok(sozinho.chegada > 0 && grupo.chegada > 0, 'everyone arrived');
  assert.equal(grupo.naMargemDireita, 20);
  const limite = Math.floor(1.5 * sozinho.chegada) + 8 * PASSOS_POR_SEGUNDO;
  assert.ok(grupo.chegada <= limite, `20 tanks took ${grupo.chegada} ticks, the limit is ${limite} (one tank: ${sozinho.chegada})`);
  assert.ok(grupo.maisLongeDaVaga <= 2, `every tank ends within 2 cells of its formation slot (${grupo.maisLongeDaVaga})`);
});

test('with 20 simultaneous group orders no unit goes 5 s without progress, and all arrive', () => {
  const resultado = ordensSimultaneas({ grupos: 20, porGrupo: 100, semente: 7 });
  assert.ok(resultado.unidades > 1900, `${resultado.unidades} units`);
  assert.ok(resultado.chegada > 0, `${resultado.pendentes} units never arrived`);
  assert.ok(resultado.maiorParado <= 5 * PASSOS_POR_SEGUNDO, `unit ${resultado.quemParado} went ${resultado.maiorParado} ticks without progress`);
  assert.ok(resultado.maisLongeDaVaga <= 3, `every unit ends within 3 cells of its slot (${resultado.maisLongeDaVaga})`);
});
