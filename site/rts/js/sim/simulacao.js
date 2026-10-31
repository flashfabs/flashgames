// Deterministic RTS simulation. Integer math only (typed arrays, Math.imul, truncating division, shifts, table
// trigonometry), so every JavaScript engine produces the same state bit for bit; floats live only in the presentation.
// Commands are the only input, entities are visited in slot order, and the whole state can be saved and loaded.
// Runs in the worker, in Node and in JavaScriptCore.
import { FP_BITS, FP, PASSOS_POR_SEGUNDO, TIPO_COMANDO, EVENTO, compararComandos } from './contratos.js';
import { sortear, raizInteira } from './matematica.js';
import { DADOS_PROTOTIPO, validarTiposUnidade } from './dados.js';
import { gerarMapa, montarMapa } from './mapa.js';
import { avancarCaminhos } from './caminhos.js';
import { atualizarNeblina } from './neblina.js';
import { criarEstado } from './estado.js';
import { criarOrdem, redirecionarOrdem, atribuirOrdem, limparOrdens, ordenarGrupo, ordenarPatrulha } from './ordens.js';
import { montarBaldes, mover, TAMANHO_BALDE_BITS } from './movimento.js';
import { combater } from './combate.js';
import { passoDaMissao } from './gatilhos.js';
import { ocuparSlot, slotDoJogador, slotVivo, emitirEvento } from './entidades.js';

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
 * @param {number} [opcoes.unidadesPorTime] prototype armies placed around each base
 * @param {{tipo: number, time: number, x: number, y: number}[]} [opcoes.unidades] explicit units, world units
 * @param {number} [opcoes.capacidade] entity slots (defaults to the starting units)
 * @param {object[]} [opcoes.tipos] unit kinds, validated (defaults to the prototype's)
 * @param {object} [opcoes.regras] REGRAS_PROTOTIPO (default) or REGRAS_LIVRES
 * @param {number} [opcoes.expansoesPorPasso] flow field budget per tick
 */
export function criarSimulacao(opcoes = {}) {
  const { semente = 1, largura = 192, altura = 192, unidadesPorTime = 1000, unidades = null } = opcoes;
  const mapa = opcoes.mapa ? montarMapa(opcoes.mapa) : gerarMapa(largura, altura, semente);
  const tipos = opcoes.tipos ? validarTiposUnidade(opcoes.tipos) : DADOS_PROTOTIPO;
  const regras = { ...(opcoes.regras ?? REGRAS_PROTOTIPO) };
  const iniciais = unidades ? unidades.length : unidadesPorTime * mapa.bases.length;
  const capacidade = Math.max(1, opcoes.capacidade ?? iniciais);
  if (capacidade < iniciais) throw new Error('simulação: capacidade menor que as unidades iniciais');
  const times = Math.max(mapa.bases.length, ...(unidades ?? []).map(u => u.time + 1), 1);
  const sim = criarEstado({ opcoes, mapa, tipos, regras, capacidade, times, semente });

  if (regras.ordensPadrao) {
    // orders 0..times-1 are the team defaults: every army heads for the centre
    const centroX = (mapa.largura >> 1) * FP + (FP >> 1);
    const centroY = (mapa.altura >> 1) * FP + (FP >> 1);
    // units idle once inside this field distance of the target; it grows with the army
    const raioChegada = 5 * (4 + raizInteira(Math.trunc(iniciais / times)));
    for (let t = 0; t < times; t++) criarOrdem(sim, TIPO_COMANDO.ATACAR_MOVENDO, centroX, centroY, { fixa: 1, raioChegada });
  }
  if (unidades) {
    unidades.forEach((u, i) => ocuparSlot(sim, i, u.tipo, u.time, u.x, u.y, u.direcao ?? DIRECAO_INICIAL[u.time] ?? 0));
  } else {
    for (let i = 0; i < iniciais; i++) {
      const time = Math.trunc(i / unidadesPorTime);
      ocuparSlot(sim, i, i % 10 < 7 ? 0 : 1, time, 0, 0, DIRECAO_INICIAL[time] ?? 0);
      posicionarNaBase(sim, i);
    }
  }
  if (regras.ordensPadrao) for (let i = 0; i < iniciais; i++) atribuirOrdem(sim, i, sim.time[i], 0, 0, 0);
  atualizarNeblina(sim);
  return sim;
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
  const unidades = [];
  for (const id of c.unidades) {
    const i = slotDoJogador(sim, id, c.jogador);
    if (i >= 0 && !unidades.includes(i)) unidades.push(i);
  }
  if (unidades.length === 0) return;
  unidades.sort((a, b) => a - b);
  const { largura, altura } = sim.mapa;
  const dentro = c.x >= 0 && c.y >= 0 && c.x < largura * FP && c.y < altura * FP;
  switch (c.tipo) {
    case TIPO_COMANDO.MOVER:
    case TIPO_COMANDO.ATACAR_MOVENDO:
      if (!dentro) return;
      for (const i of unidades) sim.segurando[i] = 0;
      ordenarGrupo(sim, unidades, c.tipo, c.x, c.y, { fila: c.fila });
      return;
    case TIPO_COMANDO.PATRULHAR:
      if (!dentro) return;
      for (const i of unidades) sim.segurando[i] = 0;
      ordenarPatrulha(sim, unidades, c.x, c.y);
      return;
    case TIPO_COMANDO.ATACAR: {
      const alvo = slotVivo(sim, c.alvo);
      if (alvo < 0 || sim.time[alvo] === c.jogador) return;
      for (const i of unidades) sim.segurando[i] = 0;
      ordenarGrupo(sim, unidades, TIPO_COMANDO.ATACAR, sim.x[alvo], sim.y[alvo], { fila: c.fila, alvo: c.alvo });
      return;
    }
    case TIPO_COMANDO.PARAR:
    case TIPO_COMANDO.SEGURAR_POSICAO:
      for (const i of unidades) {
        limparOrdens(sim, i);
        sim.parada[i] = 1;
        sim.segurando[i] = c.tipo === TIPO_COMANDO.SEGURAR_POSICAO ? 1 : 0;
      }
      return;
    default:
      // construction, production, economy and abilities arrive with the next wave
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

/** Advances the simulation one tick: commands, rules, paths, combat, movement, sight. */
export function passo(sim) {
  sim.tick++;
  sim.eventos.length = 0;
  aplicarComandos(sim);
  passoDaMissao(sim);
  conduzirComputador(sim);
  renascer(sim);
  avancarCaminhos(sim.caminhos, sim.expansoesPorPasso);
  montarBaldes(sim);
  combater(sim);
  mover(sim);
  atualizarNeblina(sim);
}

export { TAMANHO_BALDE_BITS };
/** The rule steps of passo(), for the measurement tool that times each part. */
export const __internos = Object.freeze({ aplicarComandos, conduzirComputador, renascer });
export { somaDeVerificacao, somasPorSubsistema } from './soma.js';
