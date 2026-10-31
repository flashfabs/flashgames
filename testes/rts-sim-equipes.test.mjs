// The seam for the computer teams' behaviours (site/rts/js/sim/equipes.js): when they decide, what they read and how
// they act, with a stand-in behaviour in place of front F6's module.
import test from 'node:test';
import assert from 'node:assert/strict';
import { criarSimulacao, passo } from '../site/rts/js/sim/simulacao.js';
import { TIPO_COMANDO, CATEGORIA, FP, FP_BITS, idDe } from '../site/rts/js/sim/contratos.js';
import { criarEntidade } from '../site/rts/js/sim/entidades.js';
import { PERIODO_EQUIPES, usarComportamentos } from '../site/rts/js/sim/equipes.js';
import { dadosExemplo, mapaExemplo } from './rts-sim-exemplo.mjs';

const novaCaixa = () => criarSimulacao({ dados: dadosExemplo(), arquivosMapa: mapaExemplo() });
const tipoDe = (sim, nome) => sim.tipos.findIndex(t => t.nome === nome);
const celula = n => n * FP + (FP >> 1);
const slotDe = (sim, nome, time) => {
  for (let i = 0; i < sim.capacidade; i++) if (sim.ativo[i] && sim.time[i] === time && sim.tipos[sim.tipo[i]].nome === nome) return i;
  return -1;
};
const turma = (sim, time, cx, cy) => criarEntidade(sim, tipoDe(sim, 'turma-de-linha'), time, celula(cx), celula(cy), 64);

// A behaviour for team 1 that sends every own unit towards the first visible enemy, or to the centre point.
function perseguidor(registro) {
  return {
    ativo: (_sim, time) => time === 1,
    decidir(ctx) {
      registro.push({ tick: ctx.tick, chaves: Object.keys(ctx).sort(), inimigas: Array.from(ctx.vista.inimigas.id.subarray(0, ctx.vista.inimigas.n)) });
      const { proprias, inimigas } = ctx.vista;
      const moveis = [];
      for (let k = 0; k < proprias.n; k++) if (ctx.mapa.tipos[proprias.tipo[k]].categoria === CATEGORIA.UNIDADE) moveis.push(proprias.id[k]);
      if (inimigas.n > 0) ctx.comandar({ tipo: TIPO_COMANDO.ATACAR_MOVENDO, unidades: moveis, x: inimigas.x[0], y: inimigas.y[0] });
      else ctx.comandar({ tipo: TIPO_COMANDO.MOVER, unidades: moveis, x: celula(ctx.lugares.pontos.centro[0]), y: celula(ctx.lugares.pontos.centro[1]) });
    },
  };
}

test('a team decides once every PERIODO_EQUIPES ticks, on its own phase, and its order takes effect in that tick', t => {
  const registro = [];
  const anterior = usarComportamentos(perseguidor(registro));
  t.after(() => usarComportamentos(anterior));
  const sim = novaCaixa();
  const carroca = slotDe(sim, 'carroca-de-pedal', 1);
  assert.ok(carroca >= 0);
  const antes = sim.x[carroca];
  for (let k = 0; k < 3 * PERIODO_EQUIPES; k++) passo(sim);
  assert.deepEqual(registro.map(r => r.tick), [1, 1 + PERIODO_EQUIPES, 1 + 2 * PERIODO_EQUIPES]);
  assert.deepEqual(registro[0].chaves, ['comandar', 'dificuldade', 'disparou', 'emitir', 'estado', 'lugares', 'mapa', 'missao', 'rotular', 'rotuloDe', 'tick', 'time', 'vista'], 'no simulation in the context');
  assert.notEqual(sim.x[carroca], antes, 'the cart moves towards the centre');
});

test('a behaviour commands only its own units, through the same rules as a player', t => {
  const sim = novaCaixa();
  const guincho = slotDe(sim, 'guincho-de-celulas', 0);
  assert.ok(guincho >= 0);
  // team 1 orders the player's harvester by its id: the command drops it, as it would from a cheating player
  const anterior = usarComportamentos({
    ativo: (_sim, time) => time === 1,
    decidir: ctx => ctx.comandar({ tipo: TIPO_COMANDO.MOVER, unidades: [idDe(guincho, sim.geracao[guincho])], x: celula(30), y: celula(30) }),
  });
  t.after(() => usarComportamentos(anterior));
  const [x, y] = [sim.x[guincho], sim.y[guincho]];
  for (let k = 0; k < 40; k++) passo(sim);
  assert.deepEqual([sim.x[guincho], sim.y[guincho]], [x, y]);
});

test('no cheating: changing what the team cannot see changes none of its decisions', t => {
  const decisoes = mexer => {
    const registro = [];
    const anterior = usarComportamentos(perseguidor(registro));
    try {
      const sim = novaCaixa();
      // a player squad far from team 1's sight, in the south-west; the other match moves it and adds one more
      const escondidas = [turma(sim, 0, 4, 36), turma(sim, 0, 5, 36)];
      if (mexer) {
        sim.x[escondidas[0]] = celula(3);
        sim.vida[escondidas[1]] = 1;
        turma(sim, 0, 6, 37);
      }
      for (let k = 0; k < 6 * PERIODO_EQUIPES; k++) passo(sim);
      return registro.map(r => ({ tick: r.tick, inimigas: r.inimigas }));
    } finally {
      usarComportamentos(anterior);
    }
  };
  const a = decisoes(false);
  assert.equal(a.length, 6);
  assert.deepEqual(decisoes(true), a);
});

test('without behaviours the hook costs nothing and changes nothing', () => {
  const sim = novaCaixa();
  for (let k = 0; k < 2 * PERIODO_EQUIPES; k++) passo(sim);
  // the teams state group exists empty: nothing saved or hashed for it
  assert.deepEqual(sim.extras.comportamentos, {});
  assert.ok(sim.x.every((_, i) => !sim.ativo[i] || (sim.x[i] >> FP_BITS) < sim.mapa.largura));
});
