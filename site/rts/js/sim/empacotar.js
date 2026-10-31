// The camp that packs up and runs, for missions: a scripted stand-in for the roaming camp, with no building AI.
// Packing turns a building, after a few seconds standing still (and open to attack), into a unit of a given kind on the
// same spot, with the same owner, mission label and share of health, which the mission then orders along a route;
// unpacking turns such a unit back into the building it was, on the first free spot near where it stands (terrain and
// footprints only: a fleeing camp has no network or building area). Removing the building is not a death.
import * as estado from './estado.js';
import { CATEGORIA, MOTIVO, EVENTO } from './contratos.js';
import { criarEntidade, removerEntidade, emitirEvento } from './entidades.js';
import { limparOrdens } from './ordens.js';
import { colocarPredio, motivoPosicaoNaSimulacao } from './construcao.js';
import { cantoDaPegada } from './pegadas.js';

/** Where an entity stands in the cycle (sim.extras.empacotar.fase). */
export const FASE = Object.freeze({ NADA: 0, EMPACOTANDO: 1, EMPACOTADO: 2, DESEMPACOTANDO: 3 });
// rings of cells searched around a unit for a spot to unpack on
const RAIO_LUGAR = 6;
// health is carried over as a share of the maximum, in thousandths
const MIL = 1000;

/**
 * Packing state, only typed arrays, per slot: the phase, the tick it ends, the kind the entity becomes (the packed
 * unit while packing; the building while packed or unpacking) and the generation it belongs to.
 */
export function criarExtrasEmpacotar(sim) {
  const n = sim.capacidade;
  return {
    fase: new Uint8Array(n),
    ate: new Int32Array(n),
    tipo: new Int16Array(n),
    geracao: new Uint16Array(n),
  };
}
// saved, loaded and hashed with the state (estado.js)
estado.registrarExtras?.('empacotar', criarExtrasEmpacotar);

function extras(sim) {
  sim.extras ??= {};
  sim.extras.empacotar ??= criarExtrasEmpacotar(sim);
  return sim.extras.empacotar;
}

/** Phase of live entity i (FASE.*). */
export function faseDe(sim, i) {
  const ex = sim.extras?.empacotar;
  return ex && sim.ativo[i] && ex.geracao[i] === sim.geracao[i] ? ex.fase[i] : FASE.NADA;
}

function marcar(sim, ex, i, fase, ate, tipo) {
  ex.fase[i] = fase;
  ex.ate[i] = ate;
  ex.tipo[i] = tipo;
  ex.geracao[i] = sim.geracao[i];
}

/** Starts packing building i into a unit of kind `tipoUnidade` in `passos` ticks; false when it cannot. */
export function iniciarEmpacotar(sim, i, tipoUnidade, passos) {
  if (!sim.ativo[i] || sim.categoriaPorTipo[sim.tipo[i]] !== CATEGORIA.PREDIO || faseDe(sim, i) !== FASE.NADA) return false;
  if (sim.categoriaPorTipo[tipoUnidade] !== CATEGORIA.UNIDADE) return false;
  marcar(sim, extras(sim), i, FASE.EMPACOTANDO, sim.tick + Math.max(1, passos), tipoUnidade);
  return true;
}

/** Starts unpacking packed unit i in `passos` ticks; it stops where it is. False when it is not a packed building. */
export function iniciarDesempacotar(sim, i, passos) {
  if (faseDe(sim, i) !== FASE.EMPACOTADO) return false;
  const ex = extras(sim);
  limparOrdens(sim, i);
  sim.parada[i] = 1;
  marcar(sim, ex, i, FASE.DESEMPACOTANDO, sim.tick + Math.max(1, passos), ex.tipo[i]);
  return true;
}

// share of the maximum health, in thousandths
const fracao = (sim, i) => Math.trunc((sim.vida[i] * MIL) / sim.tipos[sim.tipo[i]].vida);
const vidaDe = (sim, tipo, f) => Math.max(1, Math.trunc((f * sim.tipos[tipo].vida) / MIL));

// the first spot near unit i where building `tipo` fits, scanning rings of top-left cells; null when none
function lugarParaPredio(sim, i, tipo) {
  const [pl, pa] = sim.tipos[tipo].pegada;
  const cx = cantoDaPegada(sim.x[i], pl);
  const cy = cantoDaPegada(sim.y[i], pa);
  // the unit itself does not stand in the way of its own building
  sim.ativo[i] = 0;
  try {
    for (let r = 0; r <= RAIO_LUGAR; r++) {
      for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
          if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
          const motivo = motivoPosicaoNaSimulacao(sim, sim.time[i], tipo, x, y);
          if (motivo === 0 || motivo === MOTIVO.FORA_DA_AREA || motivo === MOTIVO.PERTO_DO_RECURSO) return [x, y];
        }
      }
    }
    return null;
  } finally {
    sim.ativo[i] = 1;
  }
}

/**
 * One tick of packing and unpacking, in slot order. `rotulos` reads and writes the mission labels so the new entity
 * keeps the old one's: { ler(sim, i) -> rotulo, escrever(sim, i, rotulo) }.
 */
export function avancarEmpacotar(sim, rotulos) {
  const ex = sim.extras?.empacotar;
  if (!ex) return;
  for (let i = 0; i < sim.capacidade; i++) {
    const fase = ex.fase[i];
    if (fase !== FASE.EMPACOTANDO && fase !== FASE.DESEMPACOTANDO) continue;
    if (!sim.ativo[i] || ex.geracao[i] !== sim.geracao[i]) {
      ex.fase[i] = FASE.NADA;
      continue;
    }
    if (sim.tick < ex.ate[i]) continue;
    const tipoNovo = ex.tipo[i];
    const tipoVelho = sim.tipo[i];
    const { time } = sim;
    const dono = time[i];
    const f = fracao(sim, i);
    const rotulo = rotulos.ler(sim, i);
    if (fase === FASE.EMPACOTANDO) {
      const x = sim.x[i];
      const y = sim.y[i];
      ex.fase[i] = FASE.NADA;
      removerEntidade(sim, i);
      const novo = criarEntidade(sim, tipoNovo, dono, x, y, sim.dirCorpo[i]);
      if (novo < 0) continue;
      sim.vida[novo] = vidaDe(sim, tipoNovo, f);
      marcar(sim, ex, novo, FASE.EMPACOTADO, 0, tipoVelho);
      rotulos.escrever(sim, novo, rotulo);
      emitirEvento(sim, EVENTO.SURGIMENTO, novo, -1, tipoNovo);
      continue;
    }
    const lugar = lugarParaPredio(sim, i, tipoNovo);
    if (!lugar) {
      // nowhere to stand: it stays packed, and the mission may move it on
      ex.fase[i] = FASE.EMPACOTADO;
      continue;
    }
    ex.fase[i] = FASE.NADA;
    removerEntidade(sim, i);
    const novo = colocarPredio(sim, tipoNovo, dono, lugar[0], lugar[1]);
    if (novo < 0) continue;
    sim.vida[novo] = vidaDe(sim, tipoNovo, f);
    marcar(sim, ex, novo, FASE.NADA, 0, 0);
    rotulos.escrever(sim, novo, rotulo);
  }
}
