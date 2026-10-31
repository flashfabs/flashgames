// The computer teams' behaviours (front F6) behind the step seam (sim/equipes.js): the tick asks ativo() whether a
// team has mission teams to run and hands decidir() that team's context, which holds no simulation: its view (C4),
// the static map and places, the mission script and which of its triggers fired, its own state and its own units'
// labels. The decisions (decisoes.js) come back through the context only: commands applied by the player rules, the
// teams' own attack warnings (AVISO_ATAQUE, ONDA) and labels on the team's own units.
import { RESULTADO, resultadoDaMissao } from '../gatilhos.js';
import { equipesDaPartida, equipesDoContexto } from './formato.js';
import { decidirJogador } from './decisoes.js';

/** Whether `time` commands any mission team of a match still being played. */
export function ativo(sim, time) {
  const c = equipesDaPartida(sim);
  return c !== null && c.jogadores.includes(time) && resultadoDaMissao(sim).every(r => r === RESULTADO.JOGANDO);
}

/**
 * One decision of the team's mission teams; returns what was decided (commands, events, labels), already sent
 * through the context, for tests and tools.
 */
export function decidir(ctx) {
  const c = equipesDoContexto(ctx);
  const { proprias } = ctx.vista;
  const rotulos = new Int32Array(proprias.n);
  for (let k = 0; k < proprias.n; k++) rotulos[k] = c.rotulos.indexOf(ctx.rotuloDe(proprias.id[k]));
  const vezes = Int32Array.from(c.equipes, eq => (eq.desde === null ? 1 : ctx.disparou(eq.desde)));
  const ativas = Uint8Array.from(c.equipes, (eq, e) => (vezes[e] > 0 && (eq.ate === null || ctx.disparou(eq.ate) === 0) ? 1 : 0));
  const saida = decidirJogador({ tick: ctx.tick, jogador: ctx.time, vista: ctx.vista, rotulos, ativas, vezes, equipes: c.equipes, estado: ctx.estado, tipos: ctx.mapa.tipos });
  for (const evento of saida.eventos) ctx.emitir(evento);
  for (const { id, rotulo } of saida.rotulos) ctx.rotular(id, c.rotulos[rotulo]);
  for (const comando of saida.comandos) ctx.comandar(comando);
  return saida;
}
