// Research and unlocks: owned by the combat and missions front, which replaces this whole file. Until then, every
// kind and research is available and finishing a research changes nothing. Production (producao.js) calls these.

/** Whether `jogador` may queue kind `tipo` now (research and mission unlocks; required buildings are checked apart). */
export function tipoLiberado(sim, jogador, tipo) {
  return sim !== null && jogador >= 0 && tipo >= 0;
}

/** Whether `jogador` may queue research `indice` (not done yet, its own requirements met). */
export function pesquisaDisponivel(sim, jogador, indice) {
  return sim !== null && jogador >= 0 && indice >= 0;
}

/** A research of `jogador` finished: apply its effect. */
export function concluirPesquisa(sim, jogador, indice) {
  return sim !== null && jogador >= 0 && indice >= 0;
}
