// Snapshot flags (C2, BANDEIRA) of an entity, read the same way by the snapshot, the team view and the placement rule.
import { BANDEIRA, CATEGORIA, FAIXA_ESTADO } from './contratos.js';
import { TAREFA } from './estado.js';
import { LIMITE_SEM_PROGRESSO } from './movimento.js';

/** BANDEIRA.* bits of a live entity. */
export function bandeirasDe(sim, i) {
  const alvo = sim.alvo[i];
  let b = (sim.parada[i] ? BANDEIRA.PARADA : 0) | (alvo >= 0 ? BANDEIRA.EM_COMBATE : 0) | (sim.semProgresso[i] >= LIMITE_SEM_PROGRESSO >> 1 ? BANDEIRA.PRESA : 0);
  if (sim.obra[i] > 0) b |= BANDEIRA.EM_OBRA;
  if (sim.energizado[i]) b |= BANDEIRA.ENERGIZADO;
  const tarefa = sim.tarefa[i];
  if (sim.coletorPorTipo[sim.tipo[i]] && tarefa === TAREFA.NENHUMA && (sim.parada[i] || sim.ordens.ordem[i] < 0)) b |= BANDEIRA.OCIOSA;
  if (tarefa === TAREFA.CARREGAR || tarefa === TAREFA.DESCARREGAR || tarefa === TAREFA.RECOLHER) b |= BANDEIRA.COLETANDO;
  const categoria = sim.categoriaPorTipo[sim.tipo[i]];
  if (categoria === CATEGORIA.RECURSO && sim.carga[i] === 0) b |= BANDEIRA.ESGOTADO;
  const filas = sim.extras.producao;
  if (filas && (filas.estado[2 * i] === FAIXA_ESTADO.PRODUZINDO || filas.estado[2 * i + 1] === FAIXA_ESTADO.PRODUZINDO)) b |= BANDEIRA.PRODUZINDO;
  return b;
}
