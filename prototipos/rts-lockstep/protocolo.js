// Wire format of the lockstep spike (draft of contract C16): message kinds, the command envelope check, sizes and
// slicing. Pure data helpers, no DOM, no PeerJS, safe in a Worker and in Node.
// Messages ride on the room's reliable channel (site/js/sala.js), whose PeerJS 1.5.4 JSON serialization drops any
// message of 16,300 bytes or more, so everything bigger than LIMITE_MENSAGEM goes out in slices.

import { MAX_JOGADORES, PASSOS_POR_SEGUNDO } from '../../site/rts/js/sim/contratos.js';

/** Version of the turn protocol; a page only plays with pages of the same version. */
export const VERSAO_LOCKSTEP = 1;
/** One network turn: the host closes one every TURNO_MS and each turn runs PASSOS_POR_TURNO simulation ticks. */
export const TURNO_MS = 100;
export const PASSOS_POR_TURNO = (PASSOS_POR_SEGUNDO * TURNO_MS) / 1000;
/** Every peer sends its checksums to the host every SOMA_A_CADA ticks. */
export const SOMA_A_CADA = 30;
/** Largest message, in UTF-8 bytes of its JSON, sent as is; PeerJS 1.5.4 drops from 16,300 bytes up. */
export const LIMITE_MENSAGEM = 16000;
/**
 * Units in one command beyond which the envelope is refused: 1,024 ids of up to 10 digits stay near 11,300 bytes,
 * so a single command always fits one message (the README has the numbers). A turn with many commands is sliced.
 */
export const MAX_UNIDADES_ENVELOPE = 1024;

/** Message kinds, in the `t` field. Room-level kinds start with "$" and never reach the game. */
export const MENSAGEM = Object.freeze({
  INICIO: 'inicio', // host to all: { v, vc, vs, semente, porJogador, atrasoTurnos, jogadores: { memberId: index } }
  PRONTO: 'pronto', // member to host: the match is built and waits for turn 1
  CMD: 'cmd', // member to host: { n: target turn, c: [command arrays] }
  TURNO: 'turno', // host to all: { n, c: [command arrays with their final tick] }
  SOMA: 'soma', // member to host: { k: tick, s: [total, ...one per subsystem] }
  DESSINC: 'dessinc', // host to all: { k: tick, jogador, subsistemas: [names] }; the match stops
  FATIA: 'fatia', // either way: { id, i, n, p } one slice of a bigger message's JSON
});

/** First tick of turn n (turns count from 1); the commands of turn n all run on it. */
export const primeiroPasso = n => (n - 1) * PASSOS_POR_TURNO + 1;

// Compact command array of contract C1: [tick, jogador, seq, tipo, alvo, x, y, arg, fila, ...unidades].
const CAMPOS_FIXOS = 9;
const ehInt32 = v => Number.isInteger(v) && v >= -0x80000000 && v <= 0x7fffffff;

/**
 * Envelope check of one command array as it travels: the fields every command has, their integer ranges and the
 * unit list. The kind is only checked to be a positive integer below 256, so new kinds pass without a protocol change;
 * which kinds exist and what they need is the simulation's business.
 */
export function envelopeValido(a) {
  if (!Array.isArray(a) || a.length < CAMPOS_FIXOS || a.length > CAMPOS_FIXOS + MAX_UNIDADES_ENVELOPE) return false;
  for (const v of a) if (!ehInt32(v)) return false;
  const [tick, jogador, seq, tipo, , , , , fila] = a;
  if (tick < 0 || seq < 0) return false;
  if (jogador < 0 || jogador >= MAX_JOGADORES) return false;
  if (tipo < 1 || tipo > 255) return false;
  if (fila !== 0 && fila !== 1) return false;
  for (let k = CAMPOS_FIXOS; k < a.length; k++) if (a[k] <= 0) return false;
  return true;
}

const codificador = new TextEncoder();

/** Size of a message on the wire: UTF-8 bytes of its JSON, which is what PeerJS measures. */
export const bytesDe = mensagem => codificador.encode(JSON.stringify(mensagem)).length;

const PEDACO_INICIAL = 7000; // characters of JSON per slice; escaping at most doubles them

/**
 * The message itself when it fits, or slices of its JSON that each fit under LIMITE_MENSAGEM.
 * `id` tells the slices of different messages apart; the reliable channel keeps them in order.
 */
export function fatiar(mensagem, id) {
  const texto = JSON.stringify(mensagem);
  if (codificador.encode(texto).length < LIMITE_MENSAGEM) return [mensagem];
  const partes = [];
  for (let inicio = 0, tamanho = PEDACO_INICIAL; inicio < texto.length;) {
    const p = texto.slice(inicio, inicio + tamanho);
    if (bytesDe({ t: MENSAGEM.FATIA, id, i: partes.length, n: 0, p }) + 12 >= LIMITE_MENSAGEM) {
      tamanho = Math.max(1, Math.trunc(tamanho * 0.75));
      continue;
    }
    partes.push(p);
    inicio += p.length;
  }
  return partes.map((p, i) => ({ t: MENSAGEM.FATIA, id, i, n: partes.length, p }));
}

/** Puts slices back together; receber returns the whole message on the last slice, null before. */
export function criarJuntador() {
  const abertas = new Map(); // id -> { partes, faltam }
  return {
    receber({ id, i, n, p }) {
      if (!Number.isInteger(n) || n < 1 || !Number.isInteger(i) || i < 0 || i >= n || typeof p !== 'string') return null;
      let aberta = abertas.get(id);
      if (!aberta) {
        aberta = { partes: new Array(n).fill(null), faltam: n };
        abertas.set(id, aberta);
      }
      if (aberta.partes.length !== n || aberta.partes[i] !== null) return null;
      aberta.partes[i] = p;
      if (--aberta.faltam > 0) return null;
      abertas.delete(id);
      return JSON.parse(aberta.partes.join(''));
    },
    get pendentes() {
      return abertas.size;
    },
  };
}
