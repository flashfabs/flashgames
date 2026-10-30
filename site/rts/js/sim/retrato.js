// Builds the per-tick snapshot (contratos.js, C2) and the static map message from the simulation state.
// Runs in the worker after each step; everything it returns is freshly allocated, so it can be transferred.
import { VERSAO_SIMULACAO, BANDEIRA, SEM_ENTIDADE, alocarCamposRetrato, idDe } from './contratos.js';
import { TIPOS } from './simulacao.js';

/** Static part of the match: terrain, bases and players. Sent once. */
export function montarMapaEstatico(sim, jogadorLocal) {
  return {
    t: 'pronto',
    versao: VERSAO_SIMULACAO,
    largura: sim.largura,
    altura: sim.altura,
    bloqueado: sim.bloqueado,
    relevo: sim.relevo,
    nivel: new Uint8Array(sim.largura * sim.altura),
    bases: sim.bases,
    jogadorLocal,
    jogadores: sim.bases.map((_, jogador) => ({ jogador, time: jogador })),
  };
}

/** Snapshot of every live entity in slot order, the local team's fog, resources and this tick's events. */
export function montarRetrato(sim, { msPasso = 0, soma = 0 } = {}) {
  let n = 0;
  for (let i = 0; i < sim.total; i++) if (sim.vida[i] > 0) n++;
  const r = alocarCamposRetrato(n);
  let k = 0;
  for (let i = 0; i < sim.total; i++) {
    if (sim.vida[i] <= 0) continue;
    const maximo = TIPOS[sim.tipo[i]].vida;
    const alvo = sim.alvo[i];
    r.id[k] = idDe(i, sim.geracao[i]);
    r.tipo[k] = sim.tipo[i];
    r.dono[k] = sim.time[i];
    r.x[k] = sim.x[i];
    r.y[k] = sim.y[i];
    r.dirCorpo[k] = sim.dirCorpo[i];
    r.dirTorre[k] = sim.dirTorre[i];
    r.vida[k] = Math.max(1, Math.min(255, Math.trunc((sim.vida[i] * 255) / maximo)));
    r.bandeiras[k] = (sim.parada[i] ? BANDEIRA.PARADA : 0) | (alvo >= 0 ? BANDEIRA.EM_COMBATE : 0);
    r.alvo[k] = alvo >= 0 ? idDe(alvo, sim.geracao[alvo]) : SEM_ENTIDADE;
    k++;
  }
  return {
    t: 'retrato',
    versao: VERSAO_SIMULACAO,
    tick: sim.tick,
    msPasso,
    soma,
    n,
    ...r,
    visao: sim.neblina.slice(),
    recursos: new Int32Array(sim.bases.length),
    eventos: Int32Array.from(sim.eventos),
  };
}
