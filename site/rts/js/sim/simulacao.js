// Deterministic RTS simulation. Integer math only (typed arrays, Math.imul, truncating division, shifts, table
// trigonometry), so every JavaScript engine produces the same state bit for bit; floats live only in the presentation.
// Commands are the only input, entities are visited in slot order, and the whole state can be saved and loaded.
// Runs in the worker, in Node and in JavaScriptCore.
import { FP_BITS, FP, PASSOS_POR_SEGUNDO, TIPO_COMANDO, EVENTO, CATEGORIA, DONO_NEUTRO, compararComandos } from './contratos.js';
import { sortear, raizInteira } from './matematica.js';
import { DADOS_PROTOTIPO, ECONOMIA_PADRAO, validarTiposUnidade, compilarDados } from './dados.js';
import { gerarMapa, montarMapa, lerMapaDeArquivos } from './mapa.js';
import { avancarCaminhos } from './caminhos.js';
import { atualizarNeblina } from './neblina.js';
import { criarEstado } from './estado.js';
import { criarOrdem, redirecionarOrdem, atribuirOrdem, limparOrdens, ordenarGrupo, ordenarPatrulha, classeDoCampo } from './ordens.js';
import { montarBaldes, mover, TAMANHO_BALDE_BITS } from './movimento.js';
import { combater } from './combate.js';
import { ocuparSlot, slotDoJogador, slotVivo, emitirEvento, idDoSlot } from './entidades.js';
import { centroDaPegada } from './pegadas.js';
import { avancarEconomia, processarDerrames, comandoColetar, cancelarTarefa } from './economia.js';
import { atualizarRede, avancarObras, comandoConstruir, comandoReciclar } from './construcao.js';
import { avancarProducao, comandoProduzir, comandoPesquisar, comandoCancelar, comandoPontoDeEncontro } from './producao.js';
import { atualizarFantasmas } from './fantasmas.js';
import { aplicarMudancasDaGrade } from './pegadas.js';
import { classificarEntidades } from './listas.js';

export { FP_BITS, FP, PASSOS_POR_SEGUNDO };

// facing at the start: team 0 looks north-east, team 1 south-west, others east
const DIRECAO_INICIAL = [224, 96];

/** Rules of the prototype match: respawn at base, team default orders and the computer's waves. */
export const REGRAS_PROTOTIPO = Object.freeze({ renascer: true, esperaRenascer: 4 * PASSOS_POR_SEGUNDO, ordensPadrao: true, ondas: true, trocaOnda: 40 * PASSOS_POR_SEGUNDO });
/** No scripted behaviour: units only do what commands tell them. */
export const REGRAS_LIVRES = Object.freeze({ renascer: false, esperaRenascer: 0, ordensPadrao: false, ondas: false, trocaOnda: 0 });

/**
 * New simulation.
 * @param {object} opcoes
 * @param {number} [opcoes.semente]
 * @param {number} [opcoes.largura] generated map width in cells (ignored with `mapa`)
 * @param {number} [opcoes.altura]
 * @param {object} [opcoes.mapa] explicit layers for montarMapa
 * @param {{cabecalho: object, camadas: Uint8Array|string, entidades: object}} [opcoes.arquivosMapa] a map in the C6 files
 *   (mapa.json, camadas.bin as bytes or base64, entidades.json); its entities take the first slots, in file order
 * @param {number} [opcoes.unidadesPorTime] prototype armies placed around each base
 * @param {{tipo: number, time: number, x: number, y: number}[]} [opcoes.unidades] explicit units, world units
 * @param {number} [opcoes.capacidade] entity slots (defaults to the starting units, plus room to build and produce
 *   when the match has design data)
 * @param {number} [opcoes.cargaInicial] Carga each player starts with (defaults to the economy data's)
 * @param {object} [opcoes.missao] the mission (C7): its players' starting Carga here, its triggers in the missions module
 * @param {string} [opcoes.dificuldade] 'facil', 'normal' (default) or 'dificil'
 * @param {object} [opcoes.dados] the design data files (C5: unidades, predios, economia, pesquisas, armas), compiled
 * @param {object[]} [opcoes.tipos] unit kinds in the simulation's units, validated (the prototype's form; without
 *   dados or tipos, the prototype's two vehicles)
 * @param {object} [opcoes.regras] REGRAS_PROTOTIPO (default) or REGRAS_LIVRES
 * @param {number} [opcoes.expansoesPorPasso] flow field budget per tick
 */
export function criarSimulacao(opcoes = {}) {
  const { semente = 1, largura = 192, altura = 192, unidadesPorTime = 1000, unidades = null } = opcoes;
  const dados = carregarDados(opcoes);
  const arquivo = opcoes.arquivosMapa ? lerMapaDeArquivos(opcoes.arquivosMapa, dados) : null;
  const mapa = arquivo ? montarMapa(arquivo.camadas) : opcoes.mapa ? montarMapa(opcoes.mapa) : gerarMapa(largura, altura, semente);
  if (arquivo) {
    mapa.solos = arquivo.solos;
    mapa.decoracoes = arquivo.decoracoes;
  }
  const doMapa = arquivo ? arquivo.entidades : [];
  // a match on map files plays by the free rules: no respawn, no prototype waves
  const regras = { tetoLotacao: dados.economia.lotacaoMaxima, ...(opcoes.regras ?? (arquivo ? REGRAS_LIVRES : REGRAS_PROTOTIPO)) };
  const explicitas = unidades ? unidades.length : arquivo ? 0 : unidadesPorTime * mapa.bases.length;
  const iniciais = doMapa.length + explicitas;
  const capacidade = Math.max(1, opcoes.capacidade ?? iniciais + (opcoes.dados ? FOLGA_DE_SLOTS : 0));
  if (capacidade < iniciais) throw new Error('simulação: capacidade menor que as unidades iniciais');
  const times = Math.max(mapa.bases.length, ...(unidades ?? []).map(u => u.time + 1), 1);
  const sim = criarEstado({ opcoes, mapa, dados, regras, capacidade, times, semente });
  definirCargaInicial(sim, opcoes);
  sim.faccoes = arquivo ? arquivo.faccoes.slice() : [];
  sim.etiquetas = {};
  sim.entidadesDoMapa = [];
  doMapa.forEach((e, k) => colocarDoMapa(sim, k, e));

  if (regras.ordensPadrao) {
    // orders 0..times-1 are the team defaults: every army heads for the centre
    const centroX = (mapa.largura >> 1) * FP + (FP >> 1);
    const centroY = (mapa.altura >> 1) * FP + (FP >> 1);
    // units idle once inside this field distance of the target; it grows with the army
    const raioChegada = 5 * (4 + raizInteira(Math.trunc(iniciais / times)));
    // fields for the classes of the starting kinds
    let classes = 0;
    for (const u of unidades ?? [{ tipo: 0 }, { tipo: 1 }]) classes |= 1 << classeDoCampo(dados.tipos[u.tipo].classe);
    for (let t = 0; t < times; t++) criarOrdem(sim, TIPO_COMANDO.ATACAR_MOVENDO, centroX, centroY, { fixa: 1, raioChegada, classes });
  }
  const primeiro = doMapa.length;
  if (unidades) {
    unidades.forEach((u, k) => ocuparSlot(sim, primeiro + k, u.tipo, u.time, u.x, u.y, u.direcao ?? DIRECAO_INICIAL[u.time] ?? 0));
  } else {
    for (let i = 0; i < explicitas; i++) {
      const time = Math.trunc(i / unidadesPorTime);
      ocuparSlot(sim, i, i % 10 < 7 ? 0 : 1, time, 0, 0, DIRECAO_INICIAL[time] ?? 0);
      posicionarNaBase(sim, i);
    }
  }
  if (regras.ordensPadrao) for (let i = 0; i < iniciais; i++) atribuirOrdem(sim, i, sim.time[i], 0, 0, 0);
  atualizarNeblina(sim);
  return sim;
}

/** Kinds, economy and research of a match: the design data compiled, the given prototype-form kinds, or the prototype's. */
export function carregarDados(opcoes) {
  if (opcoes.dados) return compilarDados(opcoes.dados);
  return { tipos: opcoes.tipos ? validarTiposUnidade(opcoes.tipos) : DADOS_PROTOTIPO, economia: ECONOMIA_PADRAO, pesquisas: [], armas: null };
}

// Carga each player starts with: the mission's per player (a number, or one per difficulty), else the option, else the
// economy data's.
function definirCargaInicial(sim, opcoes) {
  const carga = sim.extras.economia.carga;
  const jogadores = opcoes.missao?.jogadores ?? [];
  for (let j = 0; j < sim.times; j++) {
    const daMissao = jogadores[j]?.carga;
    const valor = typeof daMissao === 'object' && daMissao !== null ? daMissao[opcoes.dificuldade ?? 'normal'] : daMissao;
    if (Number.isInteger(valor) && valor >= 0) carga[j] = valor;
  }
}

// Room for buildings, new units and sparks in a match with design data, beyond its starting entities.
const FOLGA_DE_SLOTS = 1024;

// Map entity k (lerMapaDeArquivos) in slot k: units at the centre of their cell, the rest centred on their footprint.
function colocarDoMapa(sim, k, e) {
  const t = sim.tipos[e.tipo];
  const [pl, pa] = t.pegada;
  const dono = e.dono < 0 ? DONO_NEUTRO : e.dono;
  ocuparSlot(sim, k, e.tipo, dono, centroDaPegada(e.cx, pl), centroDaPegada(e.cy, pa), DIRECAO_INICIAL[dono] ?? 64);
  if (t.categoria === CATEGORIA.RECURSO) {
    sim.carga[k] = e.carga;
    sim.cargaMaxima[k] = e.carga;
    sim.no[k] = e.no;
  }
  if (e.etiqueta) sim.etiquetas[e.etiqueta] = k;
  sim.entidadesDoMapa.push(idDoSlot(sim, k));
}

function posicionarNaBase(sim, i) {
  // teams beyond the map's bases share them in turn
  const { bases } = sim.mapa;
  const base = bases[sim.time[i] % bases.length];
  const { largura, bloqueado } = sim.mapa;
  for (let tentativa = 0; tentativa < 40; tentativa++) {
    const cx = base.x - 14 + sortear(sim.sorteio, 29);
    const cy = base.y - 14 + sortear(sim.sorteio, 29);
    if (!bloqueado[cy * largura + cx]) {
      sim.x[i] = cx * FP + 128 + sortear(sim.sorteio, 768);
      sim.y[i] = cy * FP + 128 + sortear(sim.sorteio, 768);
      return;
    }
  }
  sim.x[i] = base.x * FP + 512;
  sim.y[i] = base.y * FP + 512;
}

/** Schedules a command; it runs on its tick (or the next one, if late), in (jogador, seq) order. */
export function agendarComando(sim, comando) {
  sim.comandos.push(comando);
}

function aplicarComandos(sim) {
  const devidos = [];
  const restantes = [];
  for (const comando of sim.comandos) (comando.tick > sim.tick ? restantes : devidos).push(comando);
  sim.comandos = restantes;
  devidos.sort(compararComandos);
  for (const comando of devidos) aplicarComando(sim, comando);
}

// Validates and applies one command; anything invalid is dropped the same way on every machine.
function aplicarComando(sim, c) {
  // the player's live entities among the ids, each once, in slot order
  const unidades = [];
  for (const id of c.unidades) {
    const i = slotDoJogador(sim, id, c.jogador);
    if (i >= 0 && !unidades.includes(i)) unidades.push(i);
  }
  unidades.sort((a, b) => a - b);
  if (c.jogador < sim.times) sim.extras.economia.ultimoComando[c.jogador] = sim.tick;
  switch (c.tipo) {
    case TIPO_COMANDO.PRODUZIR:
      return comandoProduzir(sim, c, unidades);
    case TIPO_COMANDO.PESQUISAR:
      return comandoPesquisar(sim, c, unidades);
    case TIPO_COMANDO.CANCELAR:
      return comandoCancelar(sim, c, unidades);
    case TIPO_COMANDO.PONTO_DE_ENCONTRO:
      return comandoPontoDeEncontro(sim, c, unidades);
    case TIPO_COMANDO.CONSTRUIR:
      return comandoConstruir(sim, c, unidades);
    case TIPO_COMANDO.RECICLAR:
      return comandoReciclar(sim, c, unidades);
    case TIPO_COMANDO.COLETAR:
      return comandoColetar(sim, c, unidades);
    default:
      break;
  }
  // the rest moves units: buildings in the selection are left out
  const moveis = unidades.filter(i => sim.categoriaPorTipo[sim.tipo[i]] === CATEGORIA.UNIDADE);
  if (moveis.length === 0) return;
  const { largura, altura } = sim.mapa;
  const dentro = c.x >= 0 && c.y >= 0 && c.x < largura * FP && c.y < altura * FP;
  switch (c.tipo) {
    case TIPO_COMANDO.MOVER:
    case TIPO_COMANDO.ATACAR_MOVENDO:
      if (!dentro) return;
      for (const i of moveis) {
        sim.segurando[i] = 0;
        cancelarTarefa(sim, i);
      }
      ordenarGrupo(sim, moveis, c.tipo, c.x, c.y, { fila: c.fila });
      return;
    case TIPO_COMANDO.PATRULHAR:
      if (!dentro) return;
      for (const i of moveis) {
        sim.segurando[i] = 0;
        cancelarTarefa(sim, i);
      }
      ordenarPatrulha(sim, moveis, c.x, c.y);
      return;
    case TIPO_COMANDO.ATACAR: {
      const alvo = slotVivo(sim, c.alvo);
      if (alvo < 0 || sim.time[alvo] === c.jogador) return;
      for (const i of moveis) {
        sim.segurando[i] = 0;
        cancelarTarefa(sim, i);
      }
      ordenarGrupo(sim, moveis, TIPO_COMANDO.ATACAR, sim.x[alvo], sim.y[alvo], { fila: c.fila, alvo: c.alvo });
      return;
    }
    case TIPO_COMANDO.PARAR:
    case TIPO_COMANDO.SEGURAR_POSICAO:
      for (const i of moveis) {
        limparOrdens(sim, i);
        cancelarTarefa(sim, i);
        sim.parada[i] = 1;
        sim.segurando[i] = c.tipo === TIPO_COMANDO.SEGURAR_POSICAO ? 1 : 0;
      }
      return;
    default:
      // repair, abilities and conceding belong to the combat and missions module
      return;
  }
}

// Prototype rule: the computer side alternates its default order between the centre and the player's base, in waves.
function conduzirComputador(sim) {
  if (!sim.regras.ondas || sim.tick % sim.regras.trocaOnda !== 0) return;
  sim.onda++;
  const { mapa } = sim;
  const destino = sim.onda % 2 === 1 ? mapa.bases[0] : { x: mapa.largura >> 1, y: mapa.altura >> 1 };
  redirecionarOrdem(sim, 1, destino.x * FP + (FP >> 1), destino.y * FP + (FP >> 1));
  for (let i = 0; i < sim.capacidade; i++) if (sim.ativo[i] && sim.ordens.ordem[i] === 1) sim.parada[i] = 0;
}

// Prototype rule: dead units come back at their base after a while, as new entities in the same slot.
function renascer(sim) {
  if (!sim.regras.renascer) return;
  for (let i = 0; i < sim.capacidade; i++) {
    if (sim.ativo[i] || sim.renascerEm[i] === 0 || sim.tick < sim.renascerEm[i]) continue;
    ocuparSlot(sim, i, sim.tipo[i], sim.time[i], 0, 0, DIRECAO_INICIAL[sim.time[i]] ?? 0);
    posicionarNaBase(sim, i);
    if (sim.regras.ordensPadrao) atribuirOrdem(sim, i, sim.time[i], 0, 0, 0);
    emitirEvento(sim, EVENTO.SURGIMENTO, i, -1, sim.tipo[i]);
  }
}

/**
 * Advances the simulation one tick: commands, economy, construction and the power network, production, paths, combat,
 * movement, spilled loads, sight and the ghosts of buildings.
 */
export function passo(sim) {
  sim.tick++;
  sim.eventos.length = 0;
  classificarEntidades(sim);
  aplicarComandos(sim);
  avancarEconomia(sim);
  avancarObras(sim);
  atualizarRede(sim);
  avancarProducao(sim);
  conduzirComputador(sim);
  renascer(sim);
  aplicarMudancasDaGrade(sim);
  avancarCaminhos(sim.caminhos, sim.expansoesPorPasso);
  montarBaldes(sim);
  combater(sim);
  mover(sim);
  processarDerrames(sim);
  // footprints that fell in combat: the next tick's fields already know
  aplicarMudancasDaGrade(sim);
  atualizarNeblina(sim);
  atualizarFantasmas(sim);
}

export { TAMANHO_BALDE_BITS };
/** The rule steps of passo(), for the measurement tool that times each part. */
export const __internos = Object.freeze({ classificarEntidades, aplicarComandos, avancarEconomia, avancarObras, atualizarRede, avancarProducao, conduzirComputador, renascer, processarDerrames, atualizarFantasmas });
export { somaDeVerificacao, somasPorSubsistema } from './soma.js';
