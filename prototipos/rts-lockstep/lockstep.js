// Lockstep over the room's star (draft of contract C16): the host is the clock and the relay. Every member sends its
// commands to the host for turn "the last turn it ran + atrasoTurnos"; the host closes one turn every TURNO_MS with
// whatever arrived for it (late commands go to the next open turn, so nobody waits for a slow link) and sends the turn
// packet to everyone, itself included. Each peer runs turn n only after running turn n - 1 and getting packet n, so all
// of them feed the simulation the same commands on the same ticks. Every SOMA_A_CADA ticks each member sends its
// checksums per subsystem, which double as its progress report: the host compares them with its own and stops closing
// turns when a member falls too far behind.
// Pure state machines with the transport passed in: the page wires them to site/js/sala.js, the Node test to queues.

import { SUBSISTEMAS } from '../../site/rts/js/sim/soma.js';
import { MENSAGEM, envelopeValido, primeiroPasso } from './protocolo.js';

/** How far ahead of the next turn a member may aim a command, in turns. */
const MAX_ANTECEDENCIA = 50;
/** The host stops closing turns while a member's last checksum is this many ticks behind the next turn (5 s). */
export const LIMITE_ATRASO_PASSOS = 150;
/** Names of the checksum array fields: the total, then one per subsystem. */
export const CAMPOS_SOMA = Object.freeze(['total', ...SUBSISTEMAS]);

/** Running figures: count, mean, percentiles and maximum (percentiles over the last `limite` samples). */
export function criarEstatistica(limite = 20000) {
  const valores = [];
  let n = 0;
  let total = 0;
  let maximo = 0;
  return {
    adicionar(v) {
      if (valores.length < limite) valores.push(v);
      else valores[n % limite] = v;
      n++;
      total += v;
      if (n === 1 || v > maximo) maximo = v;
    },
    resumo() {
      if (n === 0) return { n: 0 };
      const ordenados = valores.slice().sort((a, b) => a - b);
      const pct = p => ordenados[Math.min(ordenados.length - 1, Math.floor((p / 100) * ordenados.length))];
      const r = v => Math.round(v * 10) / 10;
      return { n, media: r(total / n), p50: r(pct(50)), p95: r(pct(95)), p99: r(pct(99)), max: r(maximo), total: r(total) };
    },
  };
}

/**
 * Host side. `jogadores` maps every member id (the host's own included) to its player index.
 * receber() takes the members' CMD and SOMA messages (the host's own commands come through it too, from the room's
 * loopback); fecharTurno() returns the next turn packet; registrarSomaLocal() feeds the host's own checksums.
 * aoDessincronia({ tick, membro, jogador, subsistemas, local, remoto }) fires on the first differing checksum.
 */
export function criarAnfitriao({ jogadores, idLocal, limiteAtrasoPassos = LIMITE_ATRASO_PASSOS, aoDessincronia = () => {} }) {
  const pendentes = new Map(); // turn -> command arrays, in arrival order
  const ultimoSeq = new Map(); // player index -> last accepted seq
  const confirmado = new Map(); // member id -> last tick it reported a checksum for
  const somasLocais = new Map(); // tick -> the host's checksum array
  const esperando = new Map(); // tick -> Map(member id -> checksum array) that arrived before the host's own
  const membros = new Set([...jogadores.keys()].filter(id => id !== idLocal));
  const contagem = { aceitos: 0, recusados: 0, atrasados: 0, comparacoes: 0, esperas: 0 };
  const dessincronias = [];
  let proximo = 1;

  function receberComandos(de, { n, c }) {
    const jogador = jogadores.get(de);
    if (jogador === undefined || !Number.isInteger(n) || !Array.isArray(c)) {
      contagem.recusados += Array.isArray(c) ? c.length : 1;
      return;
    }
    // a command that arrives after its turn closed runs on the next open one; the channel keeps a player's order
    const alvo = Math.min(Math.max(n, proximo), proximo + MAX_ANTECEDENCIA);
    for (const a of c) {
      if (!envelopeValido(a) || a[1] !== jogador || a[2] <= (ultimoSeq.get(jogador) ?? -1)) {
        contagem.recusados++;
        continue;
      }
      if (n < proximo) contagem.atrasados++;
      ultimoSeq.set(jogador, a[2]);
      const final = a.slice();
      final[0] = primeiroPasso(alvo);
      if (!pendentes.has(alvo)) pendentes.set(alvo, []);
      pendentes.get(alvo).push(final);
      contagem.aceitos++;
    }
  }

  function comparar(membro, tick, remoto, local) {
    contagem.comparacoes++;
    const diferentes = CAMPOS_SOMA.filter((_, k) => remoto[k] !== local[k]);
    if (diferentes.length === 0) return;
    const registro = { tick, membro, jogador: jogadores.get(membro), subsistemas: diferentes, local: local[0], remoto: remoto[0] };
    dessincronias.push(registro);
    if (dessincronias.length === 1) aoDessincronia(registro);
  }

  function receberSoma(de, { k, s }) {
    if (!membros.has(de) || !Number.isInteger(k) || !Array.isArray(s) || s.length !== CAMPOS_SOMA.length) return;
    confirmado.set(de, Math.max(confirmado.get(de) ?? 0, k));
    const local = somasLocais.get(k);
    if (local) {
      comparar(de, k, s, local);
      return;
    }
    if (!esperando.has(k)) esperando.set(k, new Map());
    esperando.get(k).set(de, s);
  }

  return {
    get proximoTurno() {
      return proximo;
    },
    contagem,
    dessincronias,
    receber(de, mensagem) {
      if (mensagem?.t === MENSAGEM.CMD) receberComandos(de, mensagem);
      else if (mensagem?.t === MENSAGEM.SOMA) receberSoma(de, mensagem);
    },
    /** False while a member is too far behind (or a desync stopped the match); the clock then waits. */
    podeFechar() {
      if (dessincronias.length > 0) return false;
      const limite = primeiroPasso(proximo) - limiteAtrasoPassos;
      for (const id of membros) {
        if ((confirmado.get(id) ?? 0) < limite) {
          contagem.esperas++;
          return false;
        }
      }
      return true;
    },
    fecharTurno() {
      const n = proximo++;
      const c = pendentes.get(n) ?? [];
      pendentes.delete(n);
      c.sort((a, b) => a[1] - b[1] || a[2] - b[2]);
      return { t: MENSAGEM.TURNO, n, c };
    },
    registrarSomaLocal(tick, s) {
      somasLocais.set(tick, s);
      const chegadas = esperando.get(tick);
      if (chegadas) {
        esperando.delete(tick);
        for (const [membro, remoto] of chegadas) comparar(membro, tick, remoto, s);
      }
    },
    /** A member left the room: the clock no longer waits for it. */
    remover(id) {
      membros.delete(id);
      confirmado.delete(id);
    },
    confirmados() {
      return Object.fromEntries(confirmado);
    },
  };
}

/**
 * One peer's side (the host has one too). comandar() stamps player and seq, aims the command at
 * "the last turn run + atrasoTurnos" and sends it to the host; receberTurno() buffers packets and calls
 * executar(pacote) for each turn in order. Measures, for the report, the latency of its own commands (issued to run)
 * and the gaps between turn arrivals.
 */
export function criarParticipante({ jogador, atrasoTurnos, enviar, executar, agora = () => performance.now() }) {
  const fila = new Map();
  const emitidos = new Map(); // seq -> when it was issued
  const latencia = criarEstatistica();
  const intervalo = criarEstatistica();
  let seq = 0;
  let executado = 0;
  let ultimaChegada = null;

  return {
    get turnoExecutado() {
      return executado;
    },
    latencia,
    intervalo,
    /** Sends one command ({ tipo, unidades, alvo, x, y, arg, fila }) and returns its array. */
    comandar({ tipo, unidades = [], alvo = -1, x = 0, y = 0, arg = 0, fila: naFila = 0 }) {
      const turno = executado + atrasoTurnos;
      const a = [primeiroPasso(turno), jogador, seq++, tipo, alvo, x, y, arg, naFila, ...unidades];
      emitidos.set(a[2], agora());
      enviar({ t: MENSAGEM.CMD, n: turno, c: [a] });
      return a;
    },
    receberTurno(pacote) {
      const instante = agora();
      if (ultimaChegada !== null) intervalo.adicionar(instante - ultimaChegada);
      ultimaChegada = instante;
      if (!Number.isInteger(pacote?.n) || pacote.n <= executado || fila.has(pacote.n)) return;
      fila.set(pacote.n, pacote);
      while (fila.has(executado + 1)) {
        const proximo = fila.get(executado + 1);
        fila.delete(executado + 1);
        executado++;
        for (const a of proximo.c) {
          if (a[1] !== jogador || !emitidos.has(a[2])) continue;
          latencia.adicionar(agora() - emitidos.get(a[2]));
          emitidos.delete(a[2]);
        }
        executar(proximo);
      }
    },
  };
}
