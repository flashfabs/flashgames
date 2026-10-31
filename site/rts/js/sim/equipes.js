// The seam for the computer teams' behaviours (sim/comportamentos/, front F6): when they run in the tick, what they
// read and how they act. They run inside the tick, so they are part of the deterministic simulation and replays
// recreate them; they read only what their team sees (the C4 view), the public static map and their own state, and
// they act only by commands, validated and applied exactly like a player's.
import { comandoValido, EVENTO, SEM_ENTIDADE } from './contratos.js';
import { vistaDoTime } from './vista.js';
import { montarMapaEstatico } from './retrato.js';
import { slotVivo } from './entidades.js';
import { indiceDificuldade, missaoDe, extrasMissao, rotular } from './gatilhos.js';
import { montarBaldes } from './movimento.js';
import * as indice from './comportamentos/indice.js';

/** Each team decides once every PERIODO_EQUIPES ticks (a third of a second), team t on the ticks where tick % PERIODO_EQUIPES === t. */
export const PERIODO_EQUIPES = 10;

let comportamentos = indice;

/** Swaps the behaviours module ({ ativo, decidir }) for tests and tools; returns the one in use before. */
export function usarComportamentos(modulo) {
  const anterior = comportamentos;
  comportamentos = modulo ?? indice;
  return anterior;
}

// The static map is the same for the whole match: built once per simulation, never saved.
const mapasEstaticos = new WeakMap();

function mapaEstaticoDe(sim) {
  let mapa = mapasEstaticos.get(sim);
  if (!mapa) {
    mapa = montarMapaEstatico(sim, -1);
    mapasEstaticos.set(sim, mapa);
  }
  return mapa;
}

// Mission label of one of the team's own live entities; '' for anyone else's, for unlabelled ones and with no mission.
function rotuloDe(sim, time, id) {
  const i = slotVivo(sim, id);
  const m = missaoDe(sim);
  if (i < 0 || sim.time[i] !== time || !m) return '';
  const ex = extrasMissao(sim);
  const r = ex.rotulo[i];
  return r > 0 && ex.rotuloGeracao[i] === sim.geracao[i] ? m.rotulos[r - 1] : '';
}

// Times the mission trigger with this id fired; 0 for an unknown id or with no mission.
function vezesQueDisparou(sim, id) {
  const gatilhos = missaoDe(sim) ? sim.opcoes.missao.gatilhos ?? [] : [];
  const k = gatilhos.findIndex(g => g?.id === id);
  return k < 0 ? 0 : extrasMissao(sim).disparos[k];
}

/** What a behaviour's decidir() receives: no simulation, only the team's view and a way to command. */
function contextoDaEquipe(sim, time, aplicar) {
  let seq = 0;
  return {
    tick: sim.tick,
    time,
    dificuldade: indiceDificuldade(sim.opcoes.dificuldade),
    vista: vistaDoTime(sim, time, { reaproveitar: true }),
    mapa: mapaEstaticoDe(sim),
    lugares: sim.opcoes.lugares ?? null,
    estado: sim.extras.comportamentos ?? null,
    rotuloDe: id => rotuloDe(sim, time, id),
    // the mission script and how many times each of its triggers fired (the teams start and stop by them)
    missao: missaoDe(sim) ? sim.opcoes.missao : null,
    disparou: id => vezesQueDisparou(sim, id),
    // the team's own attack warnings, presentation only; an ONDA carries its number of units in the target field
    emitir({ tipo, x, y, arg, unidades = SEM_ENTIDADE }) {
      if (tipo === EVENTO.AVISO_ATAQUE || tipo === EVENTO.ONDA) sim.eventos.push(tipo, sim.tick, SEM_ENTIDADE, tipo === EVENTO.ONDA ? unidades : SEM_ENTIDADE, x, y, x, y, arg);
    },
    // a mission label on one of the team's own live entities (a wave taking reserve units, a rebuilt building)
    rotular(id, nome) {
      const i = slotVivo(sim, id);
      if (i >= 0 && sim.time[i] === time) rotular(sim, i, nome);
    },
    comandar(c) {
      const comando = { tipo: c.tipo, unidades: c.unidades ?? [], alvo: c.alvo ?? 0, x: c.x ?? 0, y: c.y ?? 0, arg: c.arg ?? 0, fila: c.fila ?? 0, tick: sim.tick, jogador: time, seq: seq++ };
      if (comandoValido(comando)) aplicar(sim, comando);
    },
  };
}

/**
 * At match start and after a load: builds what a first decision would otherwise build inside a step (the static map,
 * and the behaviours module's own preparation when it has one), so the first decision costs what the others do.
 * Caches only, never state.
 */
export function prepararEquipes(sim) {
  let alguma = false;
  for (let time = 0; time < sim.times; time++) if (comportamentos.ativo(sim, time)) alguma = true;
  if (!alguma) return;
  mapaEstaticoDe(sim);
  comportamentos.preparar?.(sim);
}

/**
 * Runs the behaviours of every team whose turn it is, in team order. `aplicar(sim, comando)` is the simulation's own
 * command step, so a behaviour's command goes through the same rules as a player's and takes effect in this tick.
 */
export function conduzirEquipes(sim, aplicar) {
  const fase = sim.tick % PERIODO_EQUIPES;
  let baldesProntos = false;
  for (let time = fase; time < sim.times; time += PERIODO_EQUIPES) {
    if (!comportamentos.ativo(sim, time)) continue;
    // the view reads the spatial buckets (an ambusher shows to units close by); they are not saved, so they are rebuilt
    // here from this tick's positions, and a loaded match sees what the one that never stopped sees
    if (!baldesProntos) {
      montarBaldes(sim);
      baldesProntos = true;
    }
    comportamentos.decidir(contextoDaEquipe(sim, time, aplicar));
  }
}
