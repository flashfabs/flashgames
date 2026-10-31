// What one team can see (C4): its own entities, other entities on cells it sees now, the ghosts of buildings and
// nodes it saw before, the cells it has explored, its players' economy and queues. The computer players read only
// this, so they cannot cheat by construction.
import { FP_BITS, alocarCamposRetrato } from './contratos.js';
import { visaoDoTime, celulaVisivel } from './neblina.js';
import { copiarEntidade, montarLotacao, montarFilas } from './retrato.js';
import { ocupacaoDosNos } from './economia.js';
import { fantasmasDoTime } from './fantasmas.js';
import { ocultaDoTime } from './bandeiras.js';

function copiarEntidades(sim, slots, ocupacao) {
  const r = alocarCamposRetrato(slots.length);
  slots.forEach((i, k) => copiarEntidade(sim, i, r, k, ocupacao));
  r.n = slots.length;
  return r;
}

/** VistaDoTime (contratos.js) of `time` at the current tick. */
export function vistaDoTime(sim, time) {
  const { largura } = sim.mapa;
  const proprias = [];
  const inimigas = [];
  for (let i = 0; i < sim.capacidade; i++) {
    if (!sim.ativo[i]) continue;
    if (sim.time[i] === time) proprias.push(i);
    else if (celulaVisivel(sim, time, (sim.y[i] >> FP_BITS) * largura + (sim.x[i] >> FP_BITS)) && !ocultaDoTime(sim, i, time)) inimigas.push(i);
  }
  // teams are players for now: a team's players are the one with its index
  const recursos = new Int32Array(sim.times);
  if (time < sim.times) recursos[time] = sim.extras.economia.carga[time];
  const ocupacao = ocupacaoDosNos(sim);
  return {
    tick: sim.tick,
    time,
    recursos,
    lotacao: montarLotacao(sim, j => j === time),
    filas: montarFilas(sim, time),
    proprias: copiarEntidades(sim, proprias, ocupacao),
    inimigas: copiarEntidades(sim, inimigas, ocupacao),
    fantasmas: fantasmasDoTime(sim, time),
    proximaRajada: sim.extras.economia.rajada[1],
    visao: visaoDoTime(sim, time),
  };
}
