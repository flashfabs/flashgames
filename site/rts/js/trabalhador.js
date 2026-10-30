// Worker that owns the simulation: fixed 30 Hz clock, commands scheduled for the next tick,
// and one transferable snapshot per tick for the renderer to interpolate (protocol in sim/contratos.js).
import { criarSimulacao, passo, agendarComando, somaDeVerificacao, PASSOS_POR_SEGUNDO } from './sim/simulacao.js';
import { montarMapaEstatico, montarRetrato } from './sim/retrato.js';
import { PARA_TRABALHADOR, comandoValido, transferiveisDoRetrato } from './sim/contratos.js';

let sim = null;
let pausado = false;
let relogio = null;

self.onmessage = ({ data }) => {
  if (data.t === PARA_TRABALHADOR.INICIAR) {
    sim = criarSimulacao(data.opcoes);
    // ?avancar=<ticks> fast-forwards the match (screenshots, benchmarks of the mid-game)
    for (let k = 0; k < (data.opcoes.avancar ?? 0); k++) passo(sim);
    self.postMessage(montarMapaEstatico(sim, data.opcoes.jogadorLocal ?? 0));
    iniciarRelogio();
  } else if (data.t === PARA_TRABALHADOR.COMANDO && sim) {
    const comando = { ...data.comando, tick: sim.tick + 1 };
    if (comandoValido(comando)) agendarComando(sim, comando);
  } else if (data.t === PARA_TRABALHADOR.PAUSAR) {
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
  const msPasso = performance.now() - inicio;
  const retrato = montarRetrato(sim, { msPasso, soma: somaDeVerificacao(sim) });
  self.postMessage(retrato, transferiveisDoRetrato(retrato));
}
