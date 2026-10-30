// Worker that owns the simulation: fixed 30 Hz clock, commands scheduled for the next tick,
// and one transferable snapshot per tick for the renderer to interpolate.
import { criarSimulacao, passo, agendarComando, somaDeVerificacao, PASSOS_POR_SEGUNDO } from './simulacao.js';

let sim = null;
let pausado = false;
let relogio = null;

self.onmessage = ({ data }) => {
  if (data.t === 'iniciar') {
    sim = criarSimulacao(data.opcoes);
    // ?avancar=<ticks> fast-forwards the match (screenshots, benchmarks of the mid-game)
    for (let k = 0; k < (data.opcoes.avancar ?? 0); k++) passo(sim);
    self.postMessage({
      t: 'mapa',
      largura: sim.largura,
      altura: sim.altura,
      bloqueado: sim.bloqueado,
      relevo: sim.relevo,
      bases: sim.bases,
      time: sim.time,
      tipo: sim.tipo,
    });
    iniciarRelogio();
  } else if (data.t === 'comando' && sim) {
    agendarComando(sim, { ...data.comando, tick: sim.tick + 1 });
  } else if (data.t === 'pausa') {
    pausado = data.valor;
  }
};

function iniciarRelogio() {
  clearInterval(relogio);
  const passoMs = 1000 / PASSOS_POR_SEGUNDO;
  let proximo = performance.now();
  relogio = setInterval(() => {
    if (pausado) {
      proximo = performance.now();
      return;
    }
    let feitos = 0;
    while (performance.now() >= proximo && feitos < 4) {
      executarPasso();
      proximo += passoMs;
      feitos++;
    }
    if (feitos === 4) proximo = performance.now(); // too far behind: drop the backlog instead of spiralling
  }, 4);
}

function executarPasso() {
  const inicio = performance.now();
  passo(sim);
  const ms = performance.now() - inicio;
  const x = sim.x.slice();
  const y = sim.y.slice();
  const vida = sim.vida.slice();
  const alvo = sim.alvo.slice();
  const neblina = sim.neblina.slice();
  const eventos = Int32Array.from(sim.eventos);
  self.postMessage(
    { t: 'estado', tick: sim.tick, ms, soma: somaDeVerificacao(sim), x, y, vida, alvo, neblina, eventos },
    [x.buffer, y.buffer, vida.buffer, alvo.buffer, neblina.buffer, eventos.buffer],
  );
}
