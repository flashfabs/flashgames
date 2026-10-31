// The match every peer builds from the start message alone (seed, players, units per player), and the execution of one
// turn packet. Shared by the page's Worker and the Node test, so both run exactly the same code; integer math only.

import { criarSimulacao, passo, agendarComando, somaDeVerificacao, somasPorSubsistema } from '../../site/rts/js/sim/simulacao.js';
import { gerarMapa, celulaLivreMaisProxima } from '../../site/rts/js/sim/mapa.js';
import { FP, comandoDeArray, comandoValido } from '../../site/rts/js/sim/contratos.js';
import { SUBSISTEMAS } from '../../site/rts/js/sim/soma.js';
import { PASSOS_POR_TURNO, SOMA_A_CADA } from './protocolo.js';

/**
 * Options for criarSimulacao: the prototype rules on the generated map, one army per player. The map has two bases;
 * players 2 and 3 start next to bases 0 and 1, a bit towards the centre.
 */
export function opcoesDaPartida({ semente, jogadores, porJogador, largura = 192, altura = 192 }) {
  const mapa = gerarMapa(largura, altura, semente);
  let lado = 1;
  while (lado * lado < porJogador) lado++;
  const unidades = [];
  for (let jogador = 0; jogador < jogadores; jogador++) {
    const base = mapa.bases[jogador % mapa.bases.length];
    const afastamento = jogador < mapa.bases.length ? 0 : 14;
    const cx = base.x + (base.x < largura >> 1 ? afastamento : -afastamento);
    const cy = base.y + (base.y < altura >> 1 ? afastamento : -afastamento);
    for (let k = 0; k < porJogador; k++) {
      // two units per cell each way, in a square around the start point, snapped to open ground
      const celula = celulaLivreMaisProxima(mapa, cx - (lado >> 2) + ((k % lado) >> 1), cy - (lado >> 2) + (Math.trunc(k / lado) >> 1));
      if (celula < 0) throw new Error('partida: sem chão livre perto da base');
      const x = (celula % largura) * FP + (k % 2 === 0 ? FP >> 2 : (3 * FP) >> 2);
      const y = Math.trunc(celula / largura) * FP + (Math.trunc(k / lado) % 2 === 0 ? FP >> 2 : (3 * FP) >> 2);
      unidades.push({ tipo: k % 10 < 7 ? 0 : 1, time: jogador, x, y });
    }
  }
  return { semente, largura, altura, unidades };
}

export const criarPartida = configuracao => criarSimulacao(opcoesDaPartida(configuracao));

/** Checksums as they travel: the total first, then one per subsystem in SUBSISTEMAS order. */
export function somasDoEstado(sim) {
  const porSubsistema = somasPorSubsistema(sim);
  return [somaDeVerificacao(sim), ...SUBSISTEMAS.map(nome => porSubsistema[nome])];
}

/**
 * Runs one turn packet: its commands are scheduled (the simulation's own check drops what it does not accept, alike
 * on every peer) and the turn's ticks run; aoSoma(tick, somas) gets the checksums every SOMA_A_CADA ticks.
 */
export function executarTurno(sim, pacote, aoSoma) {
  for (const a of pacote.c) {
    const comando = comandoDeArray(a);
    if (comandoValido(comando)) agendarComando(sim, comando);
  }
  for (let k = 0; k < PASSOS_POR_TURNO; k++) {
    passo(sim);
    if (sim.tick % SOMA_A_CADA === 0) aoSoma(sim.tick, somasDoEstado(sim));
  }
}
