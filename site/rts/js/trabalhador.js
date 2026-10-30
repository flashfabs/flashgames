// Worker that owns the simulation: a fixed clock at 30 ticks per second times the chosen speed (75, 100 or 125%),
// at most 4 ticks of catch-up per wake so a slow machine drops time instead of spiralling, pause by reason (the player,
// the hidden tab), commands scheduled for the next tick and recorded for the replay, save and load, and one
// transferable snapshot per tick for the renderer (protocol in sim/contratos.js).
import { criarSimulacao, passo, agendarComando, somaDeVerificacao, PASSOS_POR_SEGUNDO } from './sim/simulacao.js';
import { montarMapaEstatico, montarRetrato } from './sim/retrato.js';
import { salvar, carregar } from './sim/persistencia.js';
import { criarGravador } from './sim/replay.js';
import { PARA_TRABALHADOR, DO_TRABALHADOR, VELOCIDADES, comandoValido, transferiveisDoRetrato } from './sim/contratos.js';

const MAX_RECUPERACAO = 4;

let sim = null;
let gravador = null;
let jogadorLocal = 0;
let percentual = 100;
const pausas = new Set();
let relogio = null;

self.onmessage = ({ data }) => {
  try {
    tratar(data);
  } catch (erro) {
    pararRelogio();
    self.postMessage({ t: DO_TRABALHADOR.ERRO, mensagem: String(erro?.stack ?? erro) });
  }
};

function tratar(data) {
  switch (data.t) {
    case PARA_TRABALHADOR.INICIAR: {
      const { avancar = 0, jogadorLocal: local = 0, ...opcoes } = data.opcoes;
      jogadorLocal = local;
      sim = criarSimulacao(opcoes);
      gravador = criarGravador(opcoes);
      // ?avancar=<ticks> fast-forwards the match (screenshots, benchmarks of the mid-game)
      for (let k = 0; k < avancar; k++) passo(sim);
      self.postMessage(montarMapaEstatico(sim, jogadorLocal));
      iniciarRelogio();
      return;
    }
    case PARA_TRABALHADOR.COMANDO: {
      if (!sim) return;
      const comando = { ...data.comando, tick: sim.tick + 1 };
      if (!comandoValido(comando)) return;
      agendarComando(sim, comando);
      gravador?.registrar(comando);
      return;
    }
    case PARA_TRABALHADOR.PAUSAR: {
      const motivo = data.motivo ?? 'jogador';
      if (data.valor) pausas.add(motivo);
      else pausas.delete(motivo);
      return;
    }
    case PARA_TRABALHADOR.VELOCIDADE:
      if (!VELOCIDADES.includes(data.percentual)) return;
      percentual = data.percentual;
      if (sim) iniciarRelogio();
      return;
    case PARA_TRABALHADOR.SALVAR: {
      if (!sim) return;
      const bytes = salvar(sim);
      self.postMessage({ t: DO_TRABALHADOR.SALVO, tick: sim.tick, bytes, replay: gravador?.replay(sim.tick) ?? null }, [bytes]);
      return;
    }
    case PARA_TRABALHADOR.CARREGAR:
      sim = carregar(data.bytes);
      // a loaded match has no replay from its first tick
      gravador = null;
      self.postMessage(montarMapaEstatico(sim, jogadorLocal));
      iniciarRelogio();
      return;
    default:
      return;
  }
}

function pararRelogio() {
  clearInterval(relogio);
  relogio = null;
}

function iniciarRelogio() {
  pararRelogio();
  const passoMs = 100000 / (PASSOS_POR_SEGUNDO * percentual);
  let proximo = performance.now();
  relogio = setInterval(() => {
    if (pausas.size > 0) {
      proximo = performance.now();
      return;
    }
    let feitos = 0;
    while (performance.now() >= proximo && feitos < MAX_RECUPERACAO) {
      executarPasso();
      proximo += passoMs;
      feitos++;
    }
    if (feitos === MAX_RECUPERACAO) proximo = performance.now(); // too far behind: drop the backlog
  }, 4);
}

function executarPasso() {
  const inicio = performance.now();
  passo(sim);
  const msPasso = performance.now() - inicio;
  const retrato = montarRetrato(sim, { msPasso, soma: somaDeVerificacao(sim), jogadorLocal });
  self.postMessage(retrato, transferiveisDoRetrato(retrato));
}
