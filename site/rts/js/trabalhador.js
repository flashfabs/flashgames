// Worker that owns the simulation: a fixed clock at 30 ticks per second times the chosen speed (75, 100 or 125%),
// at most 4 ticks of catch-up per wake so a slow machine drops time instead of spiralling, pause by reason (the player,
// the hidden tab), commands scheduled for the next tick and recorded for the replay, save and load, and one
// transferable snapshot per tick for the renderer (protocol in sim/contratos.js). With opcoes.teste, AVANCAR runs many
// ticks at once for the end-to-end tests.
import { criarSimulacao, passo, agendarComando, somaDeVerificacao, PASSOS_POR_SEGUNDO } from './sim/simulacao.js';
import { montarMapaEstatico, montarRetrato } from './sim/retrato.js';
import { salvar, carregar } from './sim/persistencia.js';
import { criarGravador } from './sim/replay.js';
import { PARA_TRABALHADOR, DO_TRABALHADOR, VELOCIDADES, comandoValido, transferiveisDoRetrato } from './sim/contratos.js';
import { camadasEmTexto } from './sim/mapa.js';

const MAX_RECUPERACAO = 4;
// AVANCAR runs at most one hour of game time per message
const MAX_AVANCAR = 108000;

let sim = null;
let gravador = null;
let jogadorLocal = 0;
let teste = false;
let percentual = 100;
const pausas = new Set();
let relogio = null;
// the latest checksum and its tick (see Retrato.soma)
let soma = 0;
let tickSoma = -1;

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
      const { avancar = 0, jogadorLocal: local = 0, teste: modoTeste = false, partida, ...opcoes } = data.opcoes;
      jogadorLocal = local;
      teste = Boolean(modoTeste);
      if (partida) {
        // the map's layers go as base64, so the options (and the replay that records them) stay plain JSON
        const camadas = partida.camadas instanceof ArrayBuffer ? new Uint8Array(partida.camadas) : partida.camadas;
        opcoes.arquivosMapa = { cabecalho: partida.cabecalho, camadas: camadas instanceof Uint8Array ? camadasEmTexto(camadas) : camadas, entidades: partida.entidades };
        opcoes.missao = partida.missao;
      }
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
      tickSoma = -1;
      // a loaded match has no replay from its first tick
      gravador = null;
      self.postMessage(montarMapaEstatico(sim, jogadorLocal));
      iniciarRelogio();
      return;
    case PARA_TRABALHADOR.AVANCAR:
      if (teste && sim) avancarDeUmaVez(data.passos);
      return;
    default:
      return;
  }
}

// Test hook: runs `passos` ticks now, paused or not, and answers one snapshot of the last tick carrying the events of
// all of them in order and the checksum of that tick.
function avancarDeUmaVez(passos) {
  const total = Math.max(0, Math.min(MAX_AVANCAR, Math.trunc(Number(passos) || 0)));
  const eventos = [];
  const inicio = performance.now();
  for (let k = 0; k < total; k++) {
    passo(sim);
    for (const valor of sim.eventos) eventos.push(valor);
  }
  soma = somaDeVerificacao(sim);
  tickSoma = sim.tick;
  const retrato = montarRetrato(sim, { msPasso: total > 0 ? (performance.now() - inicio) / total : 0, soma, tickSoma, jogadorLocal });
  retrato.eventos = Int32Array.from(eventos);
  self.postMessage(retrato, transferiveisDoRetrato(retrato));
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
  if (sim.tick % PASSOS_POR_SEGUNDO === 0 || tickSoma < 0) {
    soma = somaDeVerificacao(sim);
    tickSoma = sim.tick;
  }
  const retrato = montarRetrato(sim, { msPasso, soma, tickSoma, jogadorLocal });
  self.postMessage(retrato, transferiveisDoRetrato(retrato));
}
