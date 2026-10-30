// What one team can see (C4): its own units, enemy units on cells it sees now, the cells it has explored and its
// resources. The computer players read only this, so they cannot cheat by construction.
import { FP_BITS, alocarCamposRetrato, idDe } from './contratos.js';
import { visaoDoTime, celulaVisivel } from './neblina.js';

function copiarEntidades(sim, slots) {
  const r = alocarCamposRetrato(slots.length);
  const { largura, nivel } = sim.mapa;
  slots.forEach((i, k) => {
    r.id[k] = idDe(i, sim.geracao[i]);
    r.tipo[k] = sim.tipo[i];
    r.dono[k] = sim.time[i];
    r.x[k] = sim.x[i];
    r.y[k] = sim.y[i];
    r.nivel[k] = nivel[(sim.y[i] >> FP_BITS) * largura + (sim.x[i] >> FP_BITS)];
    r.dirCorpo[k] = sim.dirCorpo[i];
    r.dirTorre[k] = sim.dirTorre[i];
    r.vida[k] = Math.max(1, Math.min(255, Math.trunc((sim.vida[i] * 255) / sim.tipos[sim.tipo[i]].vida)));
    r.bandeiras[k] = sim.parada[i];
    r.alvo[k] = sim.alvo[i] >= 0 ? idDe(sim.alvo[i], sim.geracao[sim.alvo[i]]) : -1;
  });
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
  return {
    tick: sim.tick,
    time,
    recursos: new Int32Array(1),
    proprias: copiarEntidades(sim, proprias),
    inimigas: copiarEntidades(sim, inimigas),
    // buildings arrive with the next wave; their last seen state will live here
    fantasmas: { id: new Int32Array(0), tipo: new Uint16Array(0), dono: new Uint8Array(0), x: new Int32Array(0), y: new Int32Array(0), n: 0 },
    visao: visaoDoTime(sim, time),
  };
}
