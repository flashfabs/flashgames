// Replays: a match is its options (seed, map, units, rules) plus every command with its tick, so playing the commands
// back reproduces it exactly. The golden replays in testes/rts-replays/ carry the checksums they must give, and the
// same function checks them in Node and in a Worker of each browser engine. No DOM, no fetch: callers pass the JSON.
import { VERSAO_SIMULACAO, comandoParaArray, comandoDeArray } from './contratos.js';
import { criarSimulacao, passo, agendarComando } from './simulacao.js';
import { somaDeVerificacao, somasPorSubsistema } from './soma.js';

const FORMATO = 'rts-replay';

const hex = n => n.toString(16).padStart(8, '0');

/** Records the commands of a running match so it can be saved as a replay. */
export function criarGravador(opcoes) {
  const comandos = [];
  return {
    registrar(comando) {
      comandos.push(comandoParaArray(comando));
    },
    /** The replay of everything recorded so far, `passos` ticks long. */
    replay(passos) {
      return { formato: FORMATO, versao: VERSAO_SIMULACAO, opcoes, passos, comandos: comandos.slice() };
    },
  };
}

/**
 * Plays a replay (already parsed JSON) and returns the checksum every `aCada` ticks and at the end, as 8-digit hex.
 * @param {{formato: string, versao: number, opcoes: object, passos: number, comandos: number[][], aCada?: number}} replay
 * @param {{aCada?: number, subsistemas?: boolean}} [config]
 */
export function executarReplay(replay, config = {}) {
  if (replay.formato !== FORMATO) throw new Error('replay: formato desconhecido');
  if (replay.versao !== VERSAO_SIMULACAO) throw new Error(`replay da versão ${replay.versao}, a simulação é a ${VERSAO_SIMULACAO}`);
  const aCada = config.aCada ?? replay.aCada ?? 600;
  const sim = criarSimulacao(replay.opcoes);
  for (const comando of replay.comandos) agendarComando(sim, comandoDeArray(comando));
  const somas = [];
  const subsistemas = [];
  for (let k = 0; k < replay.passos; k++) {
    passo(sim);
    if (sim.tick % aCada !== 0) continue;
    somas.push(hex(somaDeVerificacao(sim)));
    if (config.subsistemas) subsistemas.push(Object.fromEntries(Object.entries(somasPorSubsistema(sim)).map(([nome, valor]) => [nome, hex(valor)])));
  }
  const resultado = { somas, final: hex(somaDeVerificacao(sim)) };
  if (config.subsistemas) resultado.subsistemas = subsistemas;
  return resultado;
}
