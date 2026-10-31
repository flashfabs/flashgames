// Re-powering dead structures: a unit whose kind has `religa`, sent to a structure whose kind has `religavel`, walks
// there, stops in reach and builds up progress for its team, one tick per tick while it stays (any new order of the
// player calls it off; the count pauses when it leaves, and a unit of
// another team first winds the other team's progress back); at the structure's time (its kind's `tempoReligar` in
// ticks, or what the mission set) the structure changes hands. A re-powered structure that is destroyed goes dead
// again (back to the neutral side, DONO_NEUTRO, healed) instead of disappearing, so it can be taken again.
import { EVENTO, FP, PASSOS_POR_SEGUNDO, TIPO_COMANDO, DONO_NEUTRO } from './contratos.js';
import * as estado from './estado.js';
import { slotVivo, emitirEvento } from './entidades.js';
import { atualizarNeblina } from './neblina.js';
import { ordenarGrupo, limparOrdens } from './ordens.js';

// a unit works on a structure within the structure's radius plus this distance
const ALCANCE_RELIGAR = (3 * FP) >> 1;
const SEM_TIME = 255;
// a re-powerable kind with no time of its own
const TEMPO_PADRAO = 30 * PASSOS_POR_SEGUNDO;

/**
 * Re-powering state, only typed arrays: per structure slot the progress in ticks, the team it
 * belongs to (SEM_TIME none), the time the mission set (0: the kind's), the last tick someone worked on it and the
 * generation all of that belongs to; per unit slot the id of the structure it was sent to (0 none) and the order that
 * took it there (slot + 1 and the tick it was made; 0 once the unit stopped in reach).
 */
export function criarExtrasReligar(sim) {
  const n = sim.capacidade;
  return {
    progresso: new Int32Array(n),
    progressoTime: new Uint8Array(n).fill(SEM_TIME),
    tempo: new Int32Array(n),
    trabalhadoEm: new Int32Array(n).fill(-1),
    geracao: new Uint16Array(n),
    alvo: new Int32Array(n),
    ordem: new Int16Array(n),
    ordemCriadaEm: new Int32Array(n),
  };
}
// saved, loaded and hashed with the state once the core keeps registered extras (estado.js)
estado.registrarExtras?.('religar', criarExtrasReligar);

/** The re-powering state in sim.extras.religar, made on first use when the core did not make it. */
export function extrasReligar(sim) {
  sim.extras ??= {};
  sim.extras.religar ??= criarExtrasReligar(sim);
  return sim.extras.religar;
}

// the structure's own record, cleared when the slot holds a different entity than the one it was written for
function registro(sim, ex, j) {
  if (ex.geracao[j] !== sim.geracao[j]) {
    ex.geracao[j] = sim.geracao[j];
    ex.progresso[j] = 0;
    ex.progressoTime[j] = SEM_TIME;
    ex.tempo[j] = 0;
    ex.trabalhadoEm[j] = -1;
  }
}

const religavel = (sim, j) => sim.tipos[sim.tipo[j]].religavel === 1;
// compiled kinds carry it in extras (dados.js); the prototype's form at the top
const religa = (sim, i) => (sim.tipos[sim.tipo[i]].extras?.religa ?? sim.tipos[sim.tipo[i]].religa) === 1;

/** Ticks of work structure j needs. */
export function tempoParaReligar(sim, j) {
  const ex = extrasReligar(sim);
  registro(sim, ex, j);
  return ex.tempo[j] > 0 ? ex.tempo[j] : sim.tipos[sim.tipo[j]].tempoReligar || TEMPO_PADRAO;
}

/** Mission override of how long structure j takes, in ticks. */
export function definirTempoReligar(sim, j, passos) {
  const ex = extrasReligar(sim);
  registro(sim, ex, j);
  ex.tempo[j] = Math.max(0, passos);
}

/** Progress of structure j as { time, passos, total }; time -1 when nobody started. */
export function progressoReligar(sim, j) {
  const ex = extrasReligar(sim);
  registro(sim, ex, j);
  return { time: ex.progressoTime[j] === SEM_TIME ? -1 : ex.progressoTime[j], passos: ex.progresso[j], total: tempoParaReligar(sim, j) };
}

/** Whether someone (of `jogador`, or anyone with -1) worked on structure j this tick or the one before. */
export function sendoReligada(sim, j, jogador = -1) {
  const ex = extrasReligar(sim);
  if (!sim.ativo[j] || ex.geracao[j] !== sim.geracao[j]) return false;
  if (ex.trabalhadoEm[j] < sim.tick - 1) return false;
  return jogador < 0 || ex.progressoTime[j] === jogador;
}

/**
 * Moves entity i to `jogador`: its sight leaves the old team (the fog drops it as if the entity had died), its orders
 * and target are cleared, and the next fog update gives the sight to the new team.
 */
export function trocarDono(sim, i, jogador) {
  if (!sim.ativo[i] || sim.time[i] === jogador) return;
  sim.ativo[i] = 0;
  atualizarNeblina(sim);
  sim.ativo[i] = 1;
  sim.time[i] = jogador;
  limparOrdens(sim, i);
  sim.alvo[i] = -1;
  sim.parada[i] = 1;
  sim.segurando[i] = 0;
}

/**
 * HABILIDADE RELIGAR (habilidades.js): the units able to re-power walk to the structure and work on it when they get there.
 * Units that cannot, or a target that is not re-powerable or already theirs, are left alone.
 */
export function ordenarReligar(sim, unidades, alvoId) {
  const j = slotVivo(sim, alvoId);
  if (j < 0 || !religavel(sim, j)) return;
  const ex = extrasReligar(sim);
  const capazes = unidades.filter(i => religa(sim, i) && sim.time[i] !== sim.time[j]);
  if (capazes.length === 0) return;
  for (const i of capazes) sim.segurando[i] = 0;
  const o = ordenarGrupo(sim, capazes, TIPO_COMANDO.MOVER, sim.x[j], sim.y[j]);
  for (const i of capazes) {
    ex.alvo[i] = alvoId;
    ex.ordem[i] = sim.ordens.ordem[i] === o ? o + 1 : 0;
    ex.ordemCriadaEm[i] = sim.ordens.criadaEm[o];
  }
}

// whether unit i got another order since it was sent to re-power (the player called it off)
function outraOrdem(sim, ex, i) {
  const o = sim.ordens.ordem[i];
  if (o < 0) return false;
  return ex.ordem[i] !== o + 1 || sim.ordens.criadaEm[o] !== ex.ordemCriadaEm[i];
}

/** What a destroyed re-powerable structure does instead of dying: back to the neutral side, healed. */
export function desligar(sim, j) {
  if (!religavel(sim, j)) return false;
  sim.vida[j] = sim.tipos[sim.tipo[j]].vida;
  const ex = extrasReligar(sim);
  registro(sim, ex, j);
  ex.progresso[j] = 0;
  ex.progressoTime[j] = SEM_TIME;
  trocarDono(sim, j, DONO_NEUTRO);
  return true;
}

/** One tick of re-powering, in slot order of the working units; then the structures that reached their time. */
export function avancarReligar(sim) {
  const ex = sim.extras?.religar;
  if (!ex) return;
  const tick = sim.tick;
  for (let i = 0; i < sim.capacidade; i++) {
    if (ex.alvo[i] === 0) continue;
    if (!sim.ativo[i]) {
      ex.alvo[i] = 0;
      continue;
    }
    const j = slotVivo(sim, ex.alvo[i]);
    if (j < 0 || sim.time[j] === sim.time[i] || outraOrdem(sim, ex, i)) {
      ex.alvo[i] = 0;
      continue;
    }
    const alcance = sim.raioPorTipo[sim.tipo[j]] + ALCANCE_RELIGAR;
    const dx = sim.x[j] - sim.x[i];
    const dy = sim.y[j] - sim.y[i];
    if (dx * dx + dy * dy > alcance * alcance) continue;
    // in reach: it stops here and works
    if (sim.ordens.ordem[i] >= 0) {
      limparOrdens(sim, i);
      sim.parada[i] = 1;
      ex.ordem[i] = 0;
    }
    registro(sim, ex, j);
    // one tick of work per structure per tick, whoever arrives first in slot order
    if (ex.trabalhadoEm[j] === tick) continue;
    ex.trabalhadoEm[j] = tick;
    const time = sim.time[i];
    if (ex.progressoTime[j] !== SEM_TIME && ex.progressoTime[j] !== time) {
      ex.progresso[j]--;
      if (ex.progresso[j] <= 0) {
        ex.progresso[j] = 0;
        ex.progressoTime[j] = SEM_TIME;
      }
      continue;
    }
    ex.progressoTime[j] = time;
    ex.progresso[j]++;
    if (ex.progresso[j] < tempoParaReligar(sim, j)) continue;
    ex.progresso[j] = 0;
    ex.progressoTime[j] = SEM_TIME;
    trocarDono(sim, j, time);
    ex.alvo[i] = 0;
    sim.parada[i] = 1;
    if (EVENTO.RELIGADO) emitirEvento(sim, EVENTO.RELIGADO, j, i, sim.tipo[j]);
  }
}

/** Id with generation of the structure unit i was sent to re-power, or 0. */
export const religandoQual = (sim, i) => sim.extras?.religar?.alvo[i] ?? 0;
