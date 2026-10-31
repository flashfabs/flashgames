// State checksums: one FNV-1a style hash per subsystem, so a desync or a save/load bug points at where the states
// differ, and one total over them for the snapshot, the replays and, later, the lockstep turns.
import { CAMPOS_ENTIDADE, arraysExtras } from './estado.js';
import { MAX_ORDENS, TAMANHO_FILA } from './ordens.js';

const BASE = 0x811c9dc5;
const PRIMO = 16777619;

function misturar(h, v) {
  return Math.imul(h ^ (v | 0), PRIMO);
}

function misturarLista(h, lista, n = lista.length) {
  for (let k = 0; k < n; k++) h = misturar(h, lista[k]);
  return h;
}

/** Subsystems hashed separately, in this order. */
export const SUBSISTEMAS = Object.freeze(['entidades', 'ordens', 'caminhos', 'neblina', 'comandos', 'extras', 'geral']);

/** Hash per subsystem (uint32 each). */
export function somasPorSubsistema(sim) {
  let entidades = BASE;
  for (const [nome] of CAMPOS_ENTIDADE) {
    // only slots that hold or will hold an entity matter, but whole arrays are cheap and leave no blind spot
    entidades = misturarLista(entidades, sim[nome], sim.capacidade);
  }

  const ord = sim.ordens;
  let ordens = BASE;
  for (const nome of ['ativa', 'fixa', 'modo', 'campo', 'campoVeiculo', 'destino', 'tx', 'ty', 'raioChegada', 'alvo', 'criadaEm', 'usos']) ordens = misturarLista(ordens, ord[nome], MAX_ORDENS);
  for (const nome of ['ordem', 'par', 'metaX', 'metaY', 'limiar', 'parMetaX', 'parMetaY', 'parLimiar', 'filaTamanho']) ordens = misturarLista(ordens, ord[nome], sim.capacidade);
  for (const nome of ['filaOrdem', 'filaMetaX', 'filaMetaY', 'filaLimiar']) ordens = misturarLista(ordens, ord[nome], sim.capacidade * TAMANHO_FILA);

  const cam = sim.caminhos;
  let caminhos = BASE;
  for (const nome of ['destino', 'classe', 'pronto', 'expansoes', 'usos', 'ultimoUso']) caminhos = misturarLista(caminhos, cam[nome]);
  caminhos = misturarLista(misturar(caminhos, cam.fila.length), cam.fila);

  let neblina = BASE;
  for (let t = 0; t < sim.times; t++) {
    neblina = misturarLista(neblina, sim.neblina.contagem[t]);
    neblina = misturarLista(neblina, sim.neblina.explorado[t]);
  }

  let comandos = misturar(BASE, sim.comandos.length);
  for (const c of sim.comandos) {
    comandos = misturarLista(comandos, [c.tick, c.jogador, c.seq, c.tipo, c.alvo, c.x, c.y, c.arg, c.fila, c.unidades.length]);
    comandos = misturarLista(comandos, c.unidades);
  }

  // queues, per-player economy, ghosts and the combat and mission modules' state, group by group
  let extras = BASE;
  for (const [, array] of arraysExtras(sim)) extras = misturarLista(misturar(extras, array.length), array);

  const geral = misturarLista(BASE, [sim.tick, sim.sorteio.estado, sim.onda, sim.capacidade, sim.times]);
  return { entidades: entidades >>> 0, ordens: ordens >>> 0, caminhos: caminhos >>> 0, neblina: neblina >>> 0, comandos: comandos >>> 0, extras: extras >>> 0, geral: geral >>> 0 };
}

/** One uint32 over every subsystem. */
export function somaDeVerificacao(sim) {
  const somas = somasPorSubsistema(sim);
  let h = BASE;
  for (const nome of SUBSISTEMAS) h = misturar(h, somas[nome]);
  return h >>> 0;
}
