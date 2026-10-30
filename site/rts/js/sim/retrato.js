// Builds the per-tick snapshot (contratos.js, C2) and the static map message from the simulation state.
// Runs in the worker after each step; everything it returns is freshly allocated, so it can be transferred.
import { VERSAO_SIMULACAO, BANDEIRA, SEM_ENTIDADE, FP_BITS, alocarCamposRetrato, idDe } from './contratos.js';
import { visaoDoTime } from './neblina.js';
import { LIMITE_SEM_PROGRESSO } from './movimento.js';

/** Static part of the match: terrain, bases and players. Sent once. */
export function montarMapaEstatico(sim, jogadorLocal) {
  return {
    t: 'pronto',
    versao: VERSAO_SIMULACAO,
    largura: sim.mapa.largura,
    altura: sim.mapa.altura,
    bloqueado: sim.mapa.bloqueado.slice(),
    relevo: sim.mapa.relevo.slice(),
    nivel: sim.mapa.nivel.slice(),
    bases: sim.mapa.bases.map(base => ({ ...base })),
    jogadorLocal,
    jogadores: Array.from({ length: sim.times }, (_, jogador) => ({ jogador, time: jogador })),
  };
}

/** Snapshot of every live entity in slot order, the local team's fog, resources and this tick's events. */
export function montarRetrato(sim, { msPasso = 0, soma = 0, jogadorLocal = 0 } = {}) {
  let n = 0;
  for (let i = 0; i < sim.capacidade; i++) if (sim.ativo[i]) n++;
  const r = alocarCamposRetrato(n);
  const { largura, nivel } = sim.mapa;
  let k = 0;
  for (let i = 0; i < sim.capacidade; i++) {
    if (!sim.ativo[i]) continue;
    const maximo = sim.tipos[sim.tipo[i]].vida;
    const alvo = sim.alvo[i];
    r.id[k] = idDe(i, sim.geracao[i]);
    r.tipo[k] = sim.tipo[i];
    r.dono[k] = sim.time[i];
    r.x[k] = sim.x[i];
    r.y[k] = sim.y[i];
    r.nivel[k] = nivel[(sim.y[i] >> FP_BITS) * largura + (sim.x[i] >> FP_BITS)];
    r.dirCorpo[k] = sim.dirCorpo[i];
    r.dirTorre[k] = sim.dirTorre[i];
    r.vida[k] = Math.max(1, Math.min(255, Math.trunc((sim.vida[i] * 255) / maximo)));
    r.bandeiras[k] = (sim.parada[i] ? BANDEIRA.PARADA : 0) | (alvo >= 0 ? BANDEIRA.EM_COMBATE : 0) | (sim.semProgresso[i] >= LIMITE_SEM_PROGRESSO >> 1 ? BANDEIRA.PRESA : 0);
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
    visao: visaoDoTime(sim, jogadorLocal),
    recursos: new Int32Array(sim.times),
    eventos: Int32Array.from(sim.eventos),
  };
}
