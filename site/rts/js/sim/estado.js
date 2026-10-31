// Shape of the simulation state: the per-entity arrays and the empty state every simulation starts from (new or
// loaded). Kept apart so the checksum and the save code read the same list as the simulation.
import { VERSAO_SIMULACAO } from './contratos.js';
import { criarSorteio } from './matematica.js';
import { criarCaminhos, EXPANSOES_POR_PASSO } from './caminhos.js';
import { criarNeblina } from './neblina.js';
import { criarOrdens } from './ordens.js';
import { criarListas } from './listas.js';

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
  // combat module: experience and veterancy level 0..3
  ['experiencia', Int32Array],
  ['veterania', Uint8Array],
  // buildings: construction work left (0 finished), whether the network powers it, the node its cable comes from
  ['obra', Int32Array],
  ['energizado', Uint8Array],
  ['ligacao', Int32Array], // slot, -1 none
  // Carga: carried (harvester), left (pile) or lying (spark), and the amount it started with (pile, spark)
  ['carga', Int32Array],
  ['cargaMaxima', Int32Array],
  ['no', Int16Array], // pile: its node; harvester: the node it works, -1 none
  ['expiraEm', Int32Array], // spark: tick it fades
  ['viagens', Uint16Array], // harvester: deliveries made
  // tasks of harvesters and builders (economia.js, construcao.js)
  ['tarefa', Uint8Array],
  ['tarefaAlvo', Int32Array], // id with generation of the pile, depot, spark or building site, -1 none
  ['tempoTarefa', Int32Array], // tick the timed part of the task ends
  ['esperaDesde', Int32Array], // tick a harvester began waiting at a full node
  // producers: rally point (world units, -1 none) and rally entity (id, -1 none)
  ['encontroX', Int32Array],
  ['encontroY', Int32Array],
  ['encontroAlvo', Int32Array],
]);

/** What a harvester or a builder is doing (sim.tarefa). */
export const TAREFA = Object.freeze({
  NENHUMA: 0,
  IR_NO: 1, // walking to a pile of its node
  ESPERAR: 2, // at a node full of harvesters, waiting its turn
  CARREGAR: 3, // loading at a pile
  IR_DEPOSITO: 4, // walking to a depot with its load
  DESCARREGAR: 5, // unloading at a depot
  IR_FAISCA: 6, // walking to a spark of spilled charge
  RECOLHER: 7, // picking a spark up
  CONSTRUIR: 8, // walking to a building site or raising it
});

// Per-entity arrays whose empty value is -1.
const MENOS_UM = ['alvo', 'celulaVisao', 'ligacao', 'no', 'tarefaAlvo', 'encontroX', 'encontroY', 'encontroAlvo'];

// State that is not one value per entity (queues, per-player economy, ghosts, the combat and mission modules' state)
// lives in sim.extras[grupo], each group an object of typed arrays made by the function its module registers here.
// Saving, loading and the checksum cover every group, in alphabetical order of group and field.
const CRIADORES_EXTRAS = new Map();

/** Registers a group of extra state; `criar(sim, opcoes)` returns an object of typed arrays. Call at module top level. */
export function registrarExtras(grupo, criar) {
  if (CRIADORES_EXTRAS.has(grupo) && CRIADORES_EXTRAS.get(grupo) !== criar) throw new Error(`estado: grupo de extras repetido ${grupo}`);
  CRIADORES_EXTRAS.set(grupo, criar);
}

/** Every extra array as [name, array], in the fixed order saving and hashing use. */
export function arraysExtras(sim) {
  const lista = [];
  for (const grupo of Object.keys(sim.extras).sort()) {
    const arrays = sim.extras[grupo];
    for (const campo of Object.keys(arrays).sort()) lista.push([`${grupo}.${campo}`, arrays[campo]]);
  }
  return lista;
}

/** Empty state for a map; also the starting point of carregar(). */
export function criarEstado({ opcoes, mapa, dados, regras, capacidade, times, semente }) {
  const { tipos } = dados;
  const sim = {
    versao: VERSAO_SIMULACAO,
    opcoes: { ...opcoes, mapa: undefined, arquivosMapa: undefined, tipos: opcoes.tipos },
    tick: 0,
    mapa,
    // what ground units cannot cross: the terrain plus the footprints of buildings, piles and building sites; the
    // flow fields, movement and orders read this, the terrain alone stays in mapa.bloqueado
    grade: { largura: mapa.largura, altura: mapa.altura, bloqueado: mapa.bloqueado.slice() },
    pegadas: new Uint8Array(mapa.largura * mapa.altura), // footprints covering each cell
    passagens: new Uint8Array(mapa.largura * mapa.altura), // re-powered passages (bascule bridges) opening each cell
    gradeMudou: 0, // a footprint changed this tick: fields are recomputed
    tipos,
    economia: dados.economia,
    pesquisas: dados.pesquisas,
    armas: dados.armas,
    regras,
    capacidade,
    times,
    sorteio: criarSorteio(semente ^ 0x6a09e667),
    caminhos: null,
    expansoesPorPasso: opcoes.expansoesPorPasso ?? EXPANSOES_POR_PASSO,
    neblina: criarNeblina(mapa, times),
    ordens: criarOrdens(capacidade),
    comandos: [],
    eventos: [],
    derrames: [], // harvester loads spilled this tick: x, y, Carga, id of the dead harvester (emptied every tick)
    onda: 0,
    baldeLargura: (mapa.largura >> 1) + 1,
    baldeCabeca: null,
    baldeProximo: new Int32Array(capacidade),
    listas: criarListas(capacidade, times), // entities by role, rebuilt at the start of every tick (listas.js)
  };
  for (const [nome, Tipo] of CAMPOS_ENTIDADE) sim[nome] = new Tipo(capacidade);
  for (const nome of MENOS_UM) sim[nome].fill(-1);
  // per-kind lookups for the hot loops
  sim.raioPorTipo = Int32Array.from(tipos, tipo => tipo.raio);
  sim.coletorPorTipo = Uint8Array.from(tipos, tipo => tipo.coletor);
  sim.categoriaPorTipo = Uint8Array.from(tipos, tipo => tipo.categoria);
  // structures that become ground when re-powered (a bascule bridge lowers its deck over the water)
  sim.passagemPorTipo = Uint8Array.from(tipos, tipo => (tipo.extras?.papel === 'religavel-passagem' ? 1 : 0));
  sim.caminhos = criarCaminhos(sim.grade);
  sim.extras = {};
  for (const [grupo, criar] of CRIADORES_EXTRAS) sim.extras[grupo] = criar(sim, opcoes);
  // empty buckets (no list starts anywhere) until the first montarBaldes
  sim.baldeCabeca = new Int32Array(sim.baldeLargura * ((mapa.altura >> 1) + 1)).fill(-1);
  return sim;
}

