// Builds the per-tick snapshot (contratos.js, C2) and the static map message from the simulation state.
// Runs in the worker after each step; everything it returns is freshly allocated, so it can be transferred.
import { VERSAO_SIMULACAO, BANDEIRA, SEM_ENTIDADE, FP_BITS, TAMANHO_REGISTRO_FILA, alocarCamposRetrato, alocarFantasmas, idDe } from './contratos.js';
import { visaoDoTime } from './neblina.js';
import { LIMITE_SEM_PROGRESSO } from './movimento.js';
import { tipoEstatico } from './dados.js';

const vazia = n => new Uint8Array(n);

/** Static part of the match: terrain, bases, players and kinds. Sent once. */
export function montarMapaEstatico(sim, jogadorLocal) {
  const { mapa } = sim;
  const celulas = mapa.largura * mapa.altura;
  return {
    t: 'pronto',
    versao: VERSAO_SIMULACAO,
    largura: mapa.largura,
    altura: mapa.altura,
    bloqueado: mapa.bloqueado.slice(),
    relevo: mapa.relevo.slice(),
    nivel: mapa.nivel.slice(),
    ventosa: mapa.ventosa ? mapa.ventosa.slice() : vazia(celulas),
    cobertura: mapa.cobertura ? mapa.cobertura.slice() : vazia(celulas),
    solo: mapa.solo ? mapa.solo.slice() : vazia(celulas),
    decoracao: mapa.decoracao ? mapa.decoracao.slice() : vazia(celulas),
    bases: mapa.bases.map(base => ({ ...base })),
    jogadorLocal,
    jogadores: Array.from({ length: sim.times }, (_, jogador) => ({ jogador, time: jogador, faccao: sim.faccoes?.[jogador] ?? '' })),
    tipos: sim.tipos.map(tipoEstatico),
    pesquisas: (sim.pesquisas ?? []).map(p => ({ nome: p.nome, predio: p.predio, custo: p.custo, tempo: p.tempo })),
    nos: (mapa.nos ?? []).map(no => ({ x: no.x, y: no.y })),
  };
}

/** BANDEIRA.* bits of a live entity; the snapshot, the team view and the placement rule read the same bits. */
export function bandeirasDe(sim, i) {
  const alvo = sim.alvo[i];
  return (sim.parada[i] ? BANDEIRA.PARADA : 0) | (alvo >= 0 ? BANDEIRA.EM_COMBATE : 0) | (sim.semProgresso[i] >= LIMITE_SEM_PROGRESSO >> 1 ? BANDEIRA.PRESA : 0);
}

/** Fills slot i's entry k of per-entity snapshot arrays (CAMPOS_RETRATO). */
export function copiarEntidade(sim, i, r, k) {
  const { largura, nivel } = sim.mapa;
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
  r.bandeiras[k] = bandeirasDe(sim, i);
  r.alvo[k] = alvo >= 0 ? idDe(alvo, sim.geracao[alvo]) : SEM_ENTIDADE;
  r.progresso[k] = 255;
  r.carga[k] = 0;
  r.ocupacao[k] = 0;
  r.ligacao[k] = SEM_ENTIDADE;
  r.veterania[k] = 0;
}

/** Snapshot of every live entity in slot order, the local team's fog and ghosts, the economy and this tick's events. */
export function montarRetrato(sim, { msPasso = 0, soma = 0, tickSoma = 0, jogadorLocal = 0 } = {}) {
  let n = 0;
  for (let i = 0; i < sim.capacidade; i++) if (sim.ativo[i]) n++;
  const r = alocarCamposRetrato(n);
  let k = 0;
  for (let i = 0; i < sim.capacidade; i++) {
    if (!sim.ativo[i]) continue;
    copiarEntidade(sim, i, r, k);
    k++;
  }
  const lotacao = new Int32Array(2 * sim.times);
  for (let j = 0; j < sim.times; j++) lotacao[2 * j + 1] = sim.regras.tetoLotacao ?? 0;
  return {
    t: 'retrato',
    versao: VERSAO_SIMULACAO,
    tick: sim.tick,
    msPasso,
    soma,
    tickSoma,
    n,
    ...r,
    visao: visaoDoTime(sim, jogadorLocal),
    recursos: new Int32Array(sim.times),
    lotacao,
    filas: new Int32Array(0 * TAMANHO_REGISTRO_FILA),
    fantasmas: alocarFantasmas(0),
    proximaRajada: 0,
    eventos: Int32Array.from(sim.eventos),
  };
}
