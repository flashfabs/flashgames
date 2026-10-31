// Shape of the simulation state: the per-entity arrays and the empty state every simulation starts from (new or
// loaded). Kept apart so the checksum and the save code read the same list as the simulation.
import { VERSAO_SIMULACAO } from './contratos.js';
import { criarSorteio } from './matematica.js';
import { criarCaminhos, EXPANSOES_POR_PASSO } from './caminhos.js';
import { criarNeblina } from './neblina.js';
import { criarOrdens } from './ordens.js';

/**
 * Per-entity state arrays: name and constructor. Every array here is saved, loaded and hashed; anything outside this
 * list is either derived (rebuilt every tick) or kept elsewhere (orders, fields, fog).
 */
export const CAMPOS_ENTIDADE = Object.freeze([
  ['ativo', Uint8Array],
  ['geracao', Uint16Array],
  ['tipo', Uint8Array],
  ['time', Uint8Array],
  ['x', Int32Array],
  ['y', Int32Array],
  ['vx', Int32Array],
  ['vy', Int32Array],
  ['vida', Int32Array],
  ['recarga', Int32Array],
  ['alvo', Int32Array], // slot of the current target, -1 none
  ['dirCorpo', Uint8Array],
  ['dirTorre', Uint8Array],
  ['parada', Uint8Array], // 1: standing at the end of its order, or idle
  ['segurando', Uint8Array], // 1: holds position, never pushed
  ['renascerEm', Int32Array], // tick to respawn, 0 none
  ['melhorDist', Int32Array], // stuck detection: best distance to the goal so far
  ['semProgresso', Int32Array], // stuck detection: ticks since the last progress
  ['fase', Uint8Array], // progress measure: FASE_SEM_CAMPO, FASE_CAMPO or FASE_ZONA (movimento.js)
  ['visada', Uint8Array], // 1: open ground in a straight line to the goal, checked every few ticks
  ['desvioAte', Int32Array], // side step until this tick
  ['desvioDirecao', Uint8Array],
  ['desvios', Uint8Array], // side steps taken, to alternate sides
  ['celulaVisao', Int32Array], // cell the unit's sight is stamped on, -1 none
  ['raioVisao', Uint8Array],
  ['experiencia', Int32Array], // veterancy experience (veterania.js)
  ['veterania', Uint8Array], // veterancy level 0..3
]);

/** Empty state for a map; also the starting point of carregar(). */
export function criarEstado({ opcoes, mapa, tipos, regras, capacidade, times, semente }) {
  const sim = {
    versao: VERSAO_SIMULACAO,
    opcoes: { ...opcoes, mapa: undefined, tipos: opcoes.tipos },
    tick: 0,
    mapa,
    tipos,
    regras,
    capacidade,
    times,
    sorteio: criarSorteio(semente ^ 0x6a09e667),
    caminhos: criarCaminhos(mapa),
    expansoesPorPasso: opcoes.expansoesPorPasso ?? EXPANSOES_POR_PASSO,
    neblina: criarNeblina(mapa, times),
    ordens: criarOrdens(capacidade),
    comandos: [],
    eventos: [],
    onda: 0,
    baldeLargura: (mapa.largura >> 1) + 1,
    baldeCabeca: null,
    baldeProximo: new Int32Array(capacidade),
  };
  for (const [nome, Tipo] of CAMPOS_ENTIDADE) sim[nome] = new Tipo(capacidade);
  // per-kind lookups for the hot loops
  sim.raioPorTipo = Int32Array.from(tipos, tipo => tipo.raio);
  sim.coletorPorTipo = Uint8Array.from(tipos, tipo => tipo.coletor);
  sim.alvo.fill(-1);
  sim.celulaVisao.fill(-1);
  sim.baldeCabeca = new Int32Array(sim.baldeLargura * ((mapa.altura >> 1) + 1));
  return sim;
}

