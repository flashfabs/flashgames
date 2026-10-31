// Worker of the lockstep spike: owns the simulation and runs a turn only when the page hands it the packet; it has
// no clock of its own (the host's turn clock drives every peer). After each turn it reports the time the turn took
// and, every SOMA_A_CADA ticks, the checksums plus what the robot and the minimap need (own unit ids, a few enemy ids,
// unit cells).
// Messages in: { t: 'iniciar', jogador, partida: { semente, jogadores, porJogador } }, { t: 'turno', pacote }.
// Messages out: { t: 'pronto', largura, altura }, { t: 'executado', n, tick, ms, soma, relatorio }, { t: 'erro', mensagem }.

import { idDoSlot } from '../../site/rts/js/sim/entidades.js';
import { FP_BITS } from '../../site/rts/js/sim/contratos.js';
import { criarPartida, executarTurno } from './partida.js';

const MAX_INIMIGOS = 64;

let sim = null;
let jogador = 0;

self.onmessage = ({ data }) => {
  try {
    if (data.t === 'iniciar') iniciar(data);
    else if (data.t === 'turno') turno(data.pacote);
  } catch (erro) {
    sim = null;
    self.postMessage({ t: 'erro', mensagem: String(erro?.stack ?? erro) });
  }
};

function iniciar(data) {
  jogador = data.jogador;
  sim = criarPartida(data.partida);
  self.postMessage({ t: 'pronto', largura: sim.mapa.largura, altura: sim.mapa.altura, relatorio: relatorio() });
}

function turno(pacote) {
  if (!sim) return;
  let soma = null;
  const inicio = performance.now();
  executarTurno(sim, pacote, (tick, s) => {
    soma = { tick, s };
  });
  const ms = performance.now() - inicio;
  self.postMessage({ t: 'executado', n: pacote.n, tick: sim.tick, ms, soma, relatorio: soma ? relatorio() : null });
}

// Own ids for the robot's selections, some enemy ids to attack, and every unit's cell and team for the minimap.
function relatorio() {
  const proprios = [];
  const inimigos = [];
  const posicoes = [];
  for (let i = 0; i < sim.capacidade; i++) {
    if (!sim.ativo[i]) continue;
    if (sim.time[i] === jogador) proprios.push(idDoSlot(sim, i));
    else if (inimigos.length < MAX_INIMIGOS && (i * 7 + sim.tick) % 5 === 0) inimigos.push(idDoSlot(sim, i));
    posicoes.push(sim.x[i] >> FP_BITS, sim.y[i] >> FP_BITS, sim.time[i]);
  }
  return { proprios, inimigos, posicoes: Uint8Array.from(posicoes) };
}
