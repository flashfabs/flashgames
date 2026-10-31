// Snapshot flags (C2, BANDEIRA) of an entity, read the same way by the snapshot, the team view and the placement rule.
import { BANDEIRA, CATEGORIA, FAIXA_ESTADO } from './contratos.js';
import { TAREFA } from './estado.js';
import { LIMITE_SEM_PROGRESSO, TAMANHO_BALDE_BITS } from './movimento.js';
import { bandeirasDeCombate, habilidadesDe, ocultoPara } from './habilidades.js';

/** BANDEIRA.* bits of a live entity. */
export function bandeirasDe(sim, i) {
  const alvo = sim.alvo[i];
  let b = (sim.parada[i] ? BANDEIRA.PARADA : 0) | (alvo >= 0 ? BANDEIRA.EM_COMBATE : 0) | (sim.semProgresso[i] >= LIMITE_SEM_PROGRESSO >> 1 ? BANDEIRA.PRESA : 0);
  if (sim.obra[i] > 0) b |= BANDEIRA.EM_OBRA;
  if (sim.energizado[i]) b |= BANDEIRA.ENERGIZADO;
  const tarefa = sim.tarefa[i];
  // a harvester with nothing to do, or loaded with no depot to go to
  const semDeposito = tarefa === TAREFA.IR_DEPOSITO && sim.tarefaAlvo[i] < 0;
  if (sim.coletorPorTipo[sim.tipo[i]] && (tarefa === TAREFA.NENHUMA || semDeposito) && (sim.parada[i] || sim.ordens.ordem[i] < 0)) b |= BANDEIRA.OCIOSA;
  if (tarefa === TAREFA.CARREGAR || tarefa === TAREFA.DESCARREGAR || tarefa === TAREFA.RECOLHER) b |= BANDEIRA.COLETANDO;
  const categoria = sim.categoriaPorTipo[sim.tipo[i]];
  if (categoria === CATEGORIA.RECURSO && sim.carga[i] === 0) b |= BANDEIRA.ESGOTADO;
  const filas = sim.extras.producao;
  if (filas && (filas.estado[2 * i] === FAIXA_ESTADO.PRODUZINDO || filas.estado[2 * i + 1] === FAIXA_ESTADO.PRODUZINDO)) b |= BANDEIRA.PRODUZINDO;
  // set up, stunned, hidden and slowed: the bits from 512 up belong to the combat module
  return b | bandeirasDeCombate(sim, i);
}

/**
 * Whether live entity i is out of sight of team `time` though its cell may be visible: a unit in ambush (its ability)
 * that no unit or building of that team stands close enough to reveal. The snapshot and the team view leave it out.
 */
export function ocultaDoTime(sim, i, time) {
  if (!habilidadesDe(sim)[sim.tipo[i]] || !ocultoPara(sim, i, time)) return false;
  const { baldeCabeca, baldeProximo, baldeLargura, x, y, ativo } = sim;
  const linhas = Math.trunc(baldeCabeca.length / baldeLargura);
  const bx = x[i] >> TAMANHO_BALDE_BITS;
  const by = y[i] >> TAMANHO_BALDE_BITS;
  for (let yb = Math.max(0, by - 1); yb <= Math.min(linhas - 1, by + 1); yb++) {
    for (let xb = Math.max(0, bx - 1); xb <= Math.min(baldeLargura - 1, bx + 1); xb++) {
      for (let j = baldeCabeca[yb * baldeLargura + xb]; j >= 0; j = baldeProximo[j]) {
        if (ativo[j] && sim.time[j] === time && !ocultoPara(sim, i, time, x[j], y[j])) return false;
      }
    }
  }
  return true;
}
