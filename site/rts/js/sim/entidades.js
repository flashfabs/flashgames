// Entity slots: ids with generation, creation in the lowest free slot or a given one, death, and presentation events.
import { EVENTO, SEM_ENTIDADE, idDe, slotDe, geracaoDe, proximaGeracao } from './contratos.js';
import { limparOrdens } from './ordens.js';

/** Id with generation of the entity in a slot. */
export const idDoSlot = (sim, i) => idDe(i, sim.geracao[i]);

/** Slot of a live entity, or -1 when the id is stale or dead. */
export function slotVivo(sim, id) {
  if (id <= 0) return -1;
  const i = slotDe(id);
  if (i >= sim.capacidade || !sim.ativo[i] || sim.geracao[i] !== geracaoDe(id)) return -1;
  return i;
}

/** Slot of a live entity owned by the player, or -1. */
export function slotDoJogador(sim, id, jogador) {
  const i = slotVivo(sim, id);
  return i >= 0 && sim.time[i] === jogador ? i : -1;
}

/** Presentation event record (contratos.js): kind, tick, entity, target, entity position, target position, arg. */
export function emitirEvento(sim, tipo, i, alvo, arg) {
  const temAlvo = alvo >= 0;
  sim.eventos.push(
    tipo,
    sim.tick,
    idDoSlot(sim, i),
    temAlvo ? idDoSlot(sim, alvo) : SEM_ENTIDADE,
    sim.x[i],
    sim.y[i],
    temAlvo ? sim.x[alvo] : sim.x[i],
    temAlvo ? sim.y[alvo] : sim.y[i],
    arg,
  );
}

/**
 * Puts a new entity in slot i (which must be free), with the next generation of that slot, at (x, y) world units.
 * Returns the slot.
 */
export function ocuparSlot(sim, i, tipo, time, x, y, direcao) {
  sim.ativo[i] = 1;
  sim.geracao[i] = proximaGeracao(sim.geracao[i]);
  sim.tipo[i] = tipo;
  sim.time[i] = time;
  sim.x[i] = x;
  sim.y[i] = y;
  sim.vx[i] = 0;
  sim.vy[i] = 0;
  sim.vida[i] = sim.tipos[tipo].vida;
  sim.recarga[i] = 0;
  sim.alvo[i] = -1;
  sim.dirCorpo[i] = direcao;
  sim.dirTorre[i] = direcao;
  sim.parada[i] = 1;
  sim.segurando[i] = 0;
  sim.renascerEm[i] = 0;
  sim.desvioAte[i] = 0;
  sim.experiencia[i] = 0;
  sim.veterania[i] = 0;
  return i;
}

/** New entity in the lowest free slot; -1 when the simulation is full. */
export function criarEntidade(sim, tipo, time, x, y, direcao = 0) {
  for (let i = 0; i < sim.capacidade; i++) {
    if (!sim.ativo[i] && sim.renascerEm[i] === 0) return ocuparSlot(sim, i, tipo, time, x, y, direcao);
  }
  return -1;
}

/** Death of entity i, credited to `autor` (-1 for none). Its slot stays reserved while it waits to respawn. */
export function matar(sim, i, autor) {
  sim.vida[i] = 0;
  emitirEvento(sim, EVENTO.MORTE, i, autor, sim.tipo[i]);
  sim.ativo[i] = 0;
  sim.alvo[i] = -1;
  sim.vx[i] = 0;
  sim.vy[i] = 0;
  limparOrdens(sim, i);
  if (sim.regras.renascer) sim.renascerEm[i] = sim.tick + sim.regras.esperaRenascer;
}
