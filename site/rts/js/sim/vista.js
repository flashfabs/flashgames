// What one team can see (C4): its own entities, other entities on cells it sees now, the ghosts of buildings and
// nodes it saw before, the cells it has explored, its players' economy and queues. The computer players read only
// this, so they cannot cheat by construction.
import { FP_BITS, alocarCamposRetrato } from './contratos.js';
import { visaoDoTime, celulaVisivel } from './neblina.js';
import { copiarEntidade, montarLotacao, montarFilas } from './retrato.js';
import { ocupacaoDosNos } from './economia.js';
import { fantasmasDoTime } from './fantasmas.js';
import { ocultaDoTime } from './bandeiras.js';

// Buffers a team's view can reuse from one call to the next (the computer teams ask for it every decision): one set
// per simulation and team, never saved, so a decision does not allocate a copy of every entity it sees.
const reservas = new WeakMap();

function reservaDe(sim, time) {
  let porTime = reservas.get(sim);
  if (!porTime) {
    porTime = [];
    reservas.set(sim, porTime);
  }
  porTime[time] ??= {
    proprias: alocarCamposRetrato(sim.capacidade),
    inimigas: alocarCamposRetrato(sim.capacidade),
    slotsProprias: new Int32Array(sim.capacidade),
    slotsInimigas: new Int32Array(sim.capacidade),
    visao: new Uint8Array(sim.mapa.largura * sim.mapa.altura),
  };
  return porTime[time];
}

// The entities of `slots[0..n)` in the snapshot layout: fresh arrays, or views of exactly n over `reserva`.
function copiarEntidades(sim, slots, n, ocupacao, reserva) {
  const r = reserva ? {} : alocarCamposRetrato(n);
  if (reserva) for (const nome of Object.keys(reserva)) r[nome] = reserva[nome].subarray(0, n);
  for (let k = 0; k < n; k++) copiarEntidade(sim, slots[k], r, k, ocupacao);
  r.n = n;
  return r;
}

/**
 * VistaDoTime (contratos.js) of `time` at the current tick. With `reaproveitar`, the entity arrays and the sight grid
 * are views over buffers this team reuses: valid until its next view, which is all a decision inside the step needs.
 */
export function vistaDoTime(sim, time, { reaproveitar = false } = {}) {
  const { largura } = sim.mapa;
  const reserva = reaproveitar ? reservaDe(sim, time) : null;
  const proprias = reserva ? reserva.slotsProprias : new Int32Array(sim.capacidade);
  const inimigas = reserva ? reserva.slotsInimigas : new Int32Array(sim.capacidade);
  let nProprias = 0;
  let nInimigas = 0;
  for (let i = 0; i < sim.capacidade; i++) {
    if (!sim.ativo[i]) continue;
    if (sim.time[i] === time) proprias[nProprias++] = i;
    else if (celulaVisivel(sim, time, (sim.y[i] >> FP_BITS) * largura + (sim.x[i] >> FP_BITS)) && !ocultaDoTime(sim, i, time)) inimigas[nInimigas++] = i;
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
    proprias: copiarEntidades(sim, proprias, nProprias, ocupacao, reserva?.proprias),
    inimigas: copiarEntidades(sim, inimigas, nInimigas, ocupacao, reserva?.inimigas),
    fantasmas: fantasmasDoTime(sim, time),
    proximaRajada: sim.extras.economia.rajada[1],
    visao: reserva ? visaoDoTime(sim, time, reserva.visao) : visaoDoTime(sim, time),
  };
}
