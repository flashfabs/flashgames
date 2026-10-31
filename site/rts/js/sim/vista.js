// What one team can see (C4): its own entities, other entities on cells it sees now, the ghosts of buildings and
// nodes it saw before, the cells it has explored, its players' economy and queues. The computer players read only
// this, so they cannot cheat by construction.
import { FP_BITS, TAMANHO_REGISTRO_FILA, alocarCamposRetrato, alocarFantasmas } from './contratos.js';
import { visaoDoTime, celulaVisivel } from './neblina.js';
import { copiarEntidade } from './retrato.js';

function copiarEntidades(sim, slots) {
  const r = alocarCamposRetrato(slots.length);
  slots.forEach((i, k) => copiarEntidade(sim, i, r, k));
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
    else if (celulaVisivel(sim, time, (sim.y[i] >> FP_BITS) * largura + (sim.x[i] >> FP_BITS))) inimigas.push(i);
  }
  const lotacao = new Int32Array(2 * sim.times);
  lotacao[2 * time + 1] = sim.regras.tetoLotacao ?? 0;
  return {
    tick: sim.tick,
    time,
    recursos: new Int32Array(sim.times),
    lotacao,
    filas: new Int32Array(0 * TAMANHO_REGISTRO_FILA),
    proprias: copiarEntidades(sim, proprias),
    inimigas: copiarEntidades(sim, inimigas),
    fantasmas: alocarFantasmas(0),
    proximaRajada: 0,
    visao: visaoDoTime(sim, time),
  };
}
