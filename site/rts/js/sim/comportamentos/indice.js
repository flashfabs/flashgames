// Placeholder for the computer teams' behaviours (front F6, which replaces this file whole). The tick calls ativo()
// for the team whose turn it is and, when true, decidir() with that team's context (sim/equipes.js says what it holds).

/** Whether `time` has any behaviour to run; false here, so no team decides. */
export function ativo(_sim, _time) {
  return false;
}

/** Decides one team's commands from its context; nothing here. */
export function decidir(_contexto) {}
