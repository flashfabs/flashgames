// RTS simulation: the scripted prototype match must keep producing the reference checksums measured on 30/10/2026
// in V8, SpiderMonkey and JavaScriptCore, so moving and reshaping the code never changes the game state.
import test from 'node:test';
import assert from 'node:assert/strict';
import { criarSimulacao, passo, agendarComando, somaDeVerificacao } from '../site/rts/js/sim/simulacao.js';

const hex = n => n.toString(16).padStart(8, '0');

test('the prototype match keeps its reference checksums for 3,600 steps with 2,000 units', () => {
  const sim = criarSimulacao({ semente: 7, unidadesPorTime: 1000 });
  const roteiro = [
    { tick: 150, tipo: 'mover', time: 0, unidades: Array.from({ length: 300 }, (_, k) => k * 3), cx: 60, cy: 70 },
    { tick: 900, tipo: 'mover', time: 0, unidades: Array.from({ length: 500 }, (_, k) => k * 2 + 1), cx: 150, cy: 140 },
    { tick: 2100, tipo: 'mover', time: 0, unidades: Array.from({ length: 1000 }, (_, k) => k), cx: 168, cy: 24 },
  ];
  for (const comando of roteiro) agendarComando(sim, comando);
  const somas = [];
  for (let k = 0; k < 3600; k++) {
    passo(sim);
    if (sim.tick % 600 === 0) somas.push(hex(somaDeVerificacao(sim)));
  }
  assert.deepEqual(somas, ['195ec511', 'dcd7309b', '48b484a1', '52c2673a', '6f05c7da', '897f4ba5']);
});
