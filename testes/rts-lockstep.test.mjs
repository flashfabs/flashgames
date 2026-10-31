// Lockstep spike (prototipos/rts-lockstep/): the command envelope check, slicing under the PeerJS message limit, the
// host's turn closing rules, and a whole match in memory with a host and three members on links with random delays,
// where every peer must end every checksum interval with the same state.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIPO_COMANDO, criarComando, comandoParaArray } from '../site/rts/js/sim/contratos.js';
import { idDoSlot } from '../site/rts/js/sim/entidades.js';
import { FP } from '../site/rts/js/sim/simulacao.js';
import {
  MENSAGEM, LIMITE_MENSAGEM, MAX_UNIDADES_ENVELOPE, PASSOS_POR_TURNO, SOMA_A_CADA, TURNO_MS,
  envelopeValido, fatiar, criarJuntador, bytesDe, primeiroPasso,
} from '../prototipos/rts-lockstep/protocolo.js';
import { criarAnfitriao, criarParticipante, LIMITE_ATRASO_PASSOS, CAMPOS_SOMA } from '../prototipos/rts-lockstep/lockstep.js';
import { criarPartida, executarTurno, somasDoEstado } from '../prototipos/rts-lockstep/partida.js';

function sorteador(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const comando = campos => comandoParaArray(criarComando({ tick: 4, jogador: 1, seq: 3, tipo: TIPO_COMANDO.MOVER, unidades: [65537, 65538], x: 5 * FP, y: 9 * FP, ...campos }));

test('the envelope takes any C1 command array and checks fields, not kinds', () => {
  assert.equal(envelopeValido(comando({})), true);
  assert.equal(envelopeValido(comando({ tipo: 40, arg: 123456, alvo: 65539 })), true, 'a kind the simulation does not know yet still travels');
  assert.equal(envelopeValido(comando({ unidades: [] })), true);
  assert.equal(envelopeValido(comando({ unidades: Array(MAX_UNIDADES_ENVELOPE).fill(65537) })), true);
  for (const [nome, ruim] of [
    ['float', comando({ x: 1.5 })],
    ['text', [...comando({}).slice(0, 5), '7', ...comando({}).slice(6)]],
    ['player 8', comando({ jogador: 8 })],
    ['kind 0', comando({ tipo: 0 })],
    ['kind 256', comando({ tipo: 256 })],
    ['queue 2', comando({ fila: 2 })],
    ['unit id 0', comando({ unidades: [65537, 0] })],
    ['negative seq', comando({ seq: -1 })],
    ['too many units', comando({ unidades: Array(MAX_UNIDADES_ENVELOPE + 1).fill(65537) })],
    ['short', comando({}).slice(0, 8)],
  ]) assert.equal(envelopeValido(ruim), false, nome);
});

test('a turn bigger than one message goes out in slices under the limit and comes back whole', () => {
  const pequeno = { t: MENSAGEM.TURNO, n: 12, c: [comando({})] };
  assert.deepEqual(fatiar(pequeno, 1), [pequeno]);
  // three commands with the most units, ids of 10 digits: about 34 KB of JSON
  const maiorId = 0x7fff0000 + 4095;
  const grande = { t: MENSAGEM.TURNO, n: 13, c: [0, 1, 2].map(seq => comando({ seq, unidades: Array(MAX_UNIDADES_ENVELOPE).fill(maiorId) })) };
  assert.ok(bytesDe(grande) > 2 * LIMITE_MENSAGEM);
  assert.ok(bytesDe(grande.c[0]) < LIMITE_MENSAGEM, 'one command with the most units fits a message');
  const fatias = fatiar(grande, 7);
  assert.ok(fatias.length >= 3);
  for (const fatia of fatias) assert.ok(bytesDe(fatia) < LIMITE_MENSAGEM, `slice of ${bytesDe(fatia)} bytes`);
  const juntador = criarJuntador();
  const resultados = fatias.map(fatia => juntador.receber(JSON.parse(JSON.stringify(fatia))));
  assert.deepEqual(resultados.at(-1), grande);
  assert.ok(resultados.slice(0, -1).every(r => r === null));
  assert.equal(juntador.pendentes, 0);
  // quotes and non-ASCII text grow when escaped or encoded; slices still fit
  const texto = { t: 'teste', p: '"á\\'.repeat(9000) };
  const pedacos = fatiar(texto, 8);
  for (const fatia of pedacos) assert.ok(bytesDe(fatia) < LIMITE_MENSAGEM);
  const outro = criarJuntador();
  assert.deepEqual(pedacos.map(f => outro.receber(f)).at(-1), texto);
});

test('the host stamps ticks, moves late commands to the next open turn and refuses spoofed or repeated ones', () => {
  const jogadores = new Map([['a', 0], ['b', 1]]);
  const anfitriao = criarAnfitriao({ jogadores, idLocal: 'a' });
  anfitriao.receber('b', { t: MENSAGEM.CMD, n: 3, c: [comando({ jogador: 1, seq: 0 })] });
  anfitriao.receber('a', { t: MENSAGEM.CMD, n: 3, c: [comando({ jogador: 0, seq: 0 })] });
  assert.deepEqual(anfitriao.fecharTurno(), { t: MENSAGEM.TURNO, n: 1, c: [] });
  assert.deepEqual(anfitriao.fecharTurno().c, []);
  const turno3 = anfitriao.fecharTurno();
  assert.deepEqual(turno3.c.map(a => [a[0], a[1], a[2]]), [[primeiroPasso(3), 0, 0], [primeiroPasso(3), 1, 0]], 'sorted by player, tick of the turn');
  // aimed at turn 2, which is closed: runs on turn 4
  anfitriao.receber('b', { t: MENSAGEM.CMD, n: 2, c: [comando({ jogador: 1, seq: 1 })] });
  // claims to be player 0, repeats seq 1, bad envelope
  anfitriao.receber('b', { t: MENSAGEM.CMD, n: 5, c: [comando({ jogador: 0, seq: 9 }), comando({ jogador: 1, seq: 1 }), comando({ jogador: 1, seq: 2, fila: 3 })] });
  const turno4 = anfitriao.fecharTurno();
  assert.deepEqual(turno4.c.map(a => [a[0], a[1], a[2]]), [[primeiroPasso(4), 1, 1]]);
  assert.deepEqual({ ...anfitriao.contagem, esperas: 0 }, { aceitos: 3, recusados: 3, atrasados: 1, comparacoes: 0, esperas: 0 });
});

test('the host clock waits for a member whose checksums fall too far behind', () => {
  const anfitriao = criarAnfitriao({ jogadores: new Map([['a', 0], ['b', 1]]), idLocal: 'a' });
  const turnosLivres = LIMITE_ATRASO_PASSOS / PASSOS_POR_TURNO;
  for (let k = 0; k < turnosLivres; k++) {
    assert.equal(anfitriao.podeFechar(), true);
    anfitriao.fecharTurno();
  }
  assert.equal(anfitriao.podeFechar(), false);
  anfitriao.receber('b', { t: MENSAGEM.SOMA, k: SOMA_A_CADA, s: CAMPOS_SOMA.map((_, k) => k + 1) });
  assert.equal(anfitriao.podeFechar(), true);
});

// A match with a host and three members. Links are FIFO queues with a random delay each way (a reliable channel with
// jitter and rare stalls); messages cross them as JSON, sliced like on the wire. Time is virtual, in 5 ms steps.
function jogarEmMemoria({ semente, turnos, atrasoMax, desviar = null }) {
  const sortear = sorteador(semente);
  const ids = ['h', 'm1', 'm2', 'm3'];
  const jogadores = new Map(ids.map((id, k) => [id, k]));
  const configuracao = { semente: 7, jogadores: ids.length, porJogador: 30, largura: 96, altura: 96 };
  let agora = 0;
  const links = new Map(); // "from>to" -> { fila: [{ entrega, mensagem }], ultima }
  const enviar = (de, para, mensagem) => {
    const chave = `${de}>${para}`;
    if (!links.has(chave)) links.set(chave, { fila: [], ultima: 0 });
    const link = links.get(chave);
    let atraso = sortear() * atrasoMax;
    if (sortear() < 0.01) atraso += 300;
    link.ultima = Math.max(link.ultima, agora + atraso);
    for (const parte of fatiar(mensagem, Math.floor(sortear() * 1e9))) link.fila.push({ entrega: link.ultima, mensagem: JSON.stringify(parte) });
  };
  const dessincronias = [];
  const anfitriao = criarAnfitriao({ jogadores, idLocal: 'h', aoDessincronia: r => dessincronias.push(r) });
  const pares = ids.map(id => {
    const sim = criarPartida(configuracao);
    const somas = new Map();
    const par = { id, sim, somas, juntadores: new Map() };
    par.participante = criarParticipante({
      jogador: jogadores.get(id),
      atrasoTurnos: 2,
      agora: () => agora,
      enviar: mensagem => (id === 'h' ? anfitriao.receber('h', JSON.parse(JSON.stringify(mensagem))) : enviar(id, 'h', mensagem)),
      executar: pacote => {
        if (desviar && desviar.id === id && pacote.n === desviar.turno) pacote = { ...pacote, c: [...pacote.c, desviar.comando(sim)] };
        executarTurno(sim, pacote, (tick, s) => {
          somas.set(tick, s);
          if (id === 'h') anfitriao.registrarSomaLocal(tick, s);
          else enviar(id, 'h', { t: MENSAGEM.SOMA, k: tick, s });
        });
      },
    });
    return par;
  });
  const porId = new Map(pares.map(p => [p.id, p]));
  const receber = (para, de, texto) => {
    let mensagem = JSON.parse(texto);
    const par = porId.get(para);
    if (mensagem.t === MENSAGEM.FATIA) {
      if (!par.juntadores.has(de)) par.juntadores.set(de, criarJuntador());
      mensagem = par.juntadores.get(de).receber(mensagem);
      if (!mensagem) return;
    }
    if (para === 'h') anfitriao.receber(de, mensagem);
    else if (mensagem.t === MENSAGEM.TURNO) par.participante.receberTurno(mensagem);
  };
  // random orders from each player's own view of its units, now and then one with the most units
  const ordenar = par => {
    const proprios = [];
    for (let i = 0; i < par.sim.capacidade; i++) if (par.sim.ativo[i] && par.sim.time[i] === jogadores.get(par.id)) proprios.push(idDoSlot(par.sim, i));
    if (proprios.length === 0) return;
    const quantos = sortear() < 0.03 ? MAX_UNIDADES_ENVELOPE : 1 + Math.floor(sortear() * 8);
    const unidades = Array.from({ length: quantos }, () => proprios[Math.floor(sortear() * proprios.length)]);
    const tipos = [TIPO_COMANDO.MOVER, TIPO_COMANDO.ATACAR_MOVENDO, TIPO_COMANDO.PATRULHAR, TIPO_COMANDO.PARAR, 30];
    par.participante.comandar({ tipo: tipos[Math.floor(sortear() * tipos.length)], unidades, x: Math.floor(sortear() * 96 * FP), y: Math.floor(sortear() * 96 * FP), fila: sortear() < 0.2 ? 1 : 0 });
  };
  let fechados = 0;
  // a desync stops the host's clock for good
  while (fechados < turnos && dessincronias.length === 0) {
    agora += 5;
    for (const [chave, link] of links) {
      const [de, para] = chave.split('>');
      while (link.fila.length && link.fila[0].entrega <= agora) receber(para, de, link.fila.shift().mensagem);
    }
    if (agora >= fechados * TURNO_MS && anfitriao.podeFechar()) {
      const pacote = anfitriao.fecharTurno();
      fechados++;
      for (const par of pares) if (par.id !== 'h') enviar('h', par.id, pacote);
      porId.get('h').participante.receberTurno(JSON.parse(JSON.stringify(pacote)));
    }
    for (const par of pares) if (sortear() < 0.02) ordenar(par);
  }
  // let the last packets and checksums land
  for (let k = 0; k < 400; k++) {
    agora += 5;
    for (const [chave, link] of links) {
      const [de, para] = chave.split('>');
      while (link.fila.length && link.fila[0].entrega <= agora) receber(para, de, link.fila.shift().mensagem);
    }
  }
  return { anfitriao, pares, dessincronias };
}

test('host and three members on jittery links keep the same state at every checksum', () => {
  const turnos = 400;
  const { anfitriao, pares, dessincronias } = jogarEmMemoria({ semente: 11, turnos, atrasoMax: 180 });
  assert.deepEqual(dessincronias, []);
  for (const par of pares) assert.equal(par.participante.turnoExecutado, turnos, `${par.id} ran every turn`);
  const checagens = (turnos * PASSOS_POR_TURNO) / SOMA_A_CADA;
  assert.equal(anfitriao.contagem.comparacoes, 3 * checagens);
  const referencia = pares[0].somas;
  for (const par of pares.slice(1)) assert.deepEqual([...par.somas], [...referencia], `${par.id} matches the host at every checksum`);
  assert.equal(pares[0].sim.tick, turnos * PASSOS_POR_TURNO);
  assert.ok(anfitriao.contagem.aceitos > 50, `${anfitriao.contagem.aceitos} commands`);
  assert.ok(anfitriao.contagem.atrasados > 0, 'some commands missed their turn and ran on the next one');
  assert.equal(anfitriao.contagem.recusados, 0);
  // the orders really moved the armies: the state is not the one without commands
  const parado = criarPartida({ semente: 7, jogadores: 4, porJogador: 30, largura: 96, altura: 96 });
  for (let n = 1; n <= turnos; n++) executarTurno(parado, { n, c: [] }, () => {});
  assert.notEqual(somasDoEstado(parado)[0], somasDoEstado(pares[0].sim)[0]);
});

test('a peer that runs a command the others did not get is caught at the next checksum, by subsystem', () => {
  const desviar = {
    id: 'm2',
    turno: 37,
    comando: sim => {
      let unidade = 0;
      for (let i = 0; i < sim.capacidade; i++) if (sim.ativo[i] && sim.time[i] === 2) unidade = idDoSlot(sim, i);
      return [primeiroPasso(37), 2, 1_000_000, TIPO_COMANDO.MOVER, -1, 10 * FP, 80 * FP, 0, 0, unidade];
    },
  };
  const { dessincronias } = jogarEmMemoria({ semente: 5, turnos: 80, atrasoMax: 60, desviar });
  assert.ok(dessincronias.length >= 1);
  const [primeira] = dessincronias;
  assert.equal(primeira.membro, 'm2');
  assert.equal(primeira.tick, Math.ceil(primeiroPasso(37) / SOMA_A_CADA) * SOMA_A_CADA);
  assert.ok(primeira.subsistemas.includes('total'));
  assert.ok(primeira.subsistemas.includes('ordens'), `differing: ${primeira.subsistemas}`);
});
