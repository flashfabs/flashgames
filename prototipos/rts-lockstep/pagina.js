// Page of the lockstep spike: the room from site/js/sala.js (unchanged), one simulation Worker per peer, the host's
// turn clock, an artificial delay on every received game message and the robot player. No renderer: a minimap and
// a panel with the figures the spike has to measure (checksums compared, bytes per turn, command latency).
//
// Address parameters:
//   criar=1                  create a room on load (otherwise a button); #CODE in the address joins that room
//   jogadores=N              the host starts by itself once N people are in the room (otherwise a button)
//   atraso=MS, variacao=MS   delay added to every received game message: atraso plus up to variacao, in order
//   pico=P, picoms=MS        with probability P a message waits picoms more (and holds back the ones after it)
//   d=TURNOS                 input delay in turns (2)
//   unidades=N               units per player (250); semente=S (7)
//   robo=1, cps=N            the robot plays, N commands per second on average (3)
//   rede=peerjs              site/js/rede.js mode; peerjs skips the TURN credentials function, absent here

import { Sala } from '../../site/js/sala.js';
import { criarTique } from '../../site/js/relogio.js';
import { VERSAO_COMANDOS, VERSAO_SIMULACAO } from '../../site/rts/js/sim/contratos.js';
import { MENSAGEM, VERSAO_LOCKSTEP, TURNO_MS, fatiar, criarJuntador, bytesDe } from './protocolo.js';
import { criarAnfitriao, criarParticipante, criarEstatistica } from './lockstep.js';
import { criarRobo } from './robo.js';

const parametros = new URLSearchParams(location.search);
const numero = (nome, padrao) => {
  const valor = Number(parametros.get(nome));
  return parametros.has(nome) && Number.isFinite(valor) ? valor : padrao;
};
const config = {
  criar: parametros.get('criar') === '1',
  jogadores: Math.trunc(numero('jogadores', 0)),
  atraso: numero('atraso', 0),
  variacao: numero('variacao', 0),
  pico: numero('pico', 0),
  picoMs: numero('picoms', 300),
  atrasoTurnos: Math.max(1, Math.trunc(numero('d', 2))),
  porJogador: Math.max(1, Math.trunc(numero('unidades', 250))),
  semente: Math.trunc(numero('semente', 7)),
  robo: parametros.get('robo') === '1',
  comandosPorSegundo: numero('cps', 3),
};
const MAX_FECHAMENTOS_POR_TIQUE = 4;
const CORES = ['#e8b04a', '#4aa3e8', '#7ad36b', '#e86a8a', '#b48ae8', '#e8e06a', '#6ae0d8', '#e8956a'];

const el = id => document.getElementById(id);
const hex = n => (n >>> 0).toString(16).padStart(8, '0');

let sala = null;
let papel = null; // 'anfitriao' | 'membro'
let estado = 'sala'; // sala, iniciando, jogando, dessincronia, erro
let erro = null;
let anfitriao = null;
let participante = null;
let trabalhador = null;
let robo = null;
let relogio = null;
let partida = null; // the start message
let jogador = null;
let tick = 0;
let trabalhadorPronto = false;
let dessincronia = null;
const prontos = new Set();
const juntadores = new Map(); // sender -> slices being put back together
const somasLocais = new Map(); // tick -> total checksum as hex, for comparing pages after the run
const medidas = {
  bytesTurno: criarEstatistica(), // every turn packet, as sent to each member (all slices)
  bytesTurnoComComandos: criarEstatistica(),
  bytesCmd: criarEstatistica(),
  bytesSoma: criarEstatistica(),
  msTurno: criarEstatistica(), // simulation time of one turn in the Worker
  fatiadas: 0,
  maiorMensagem: 0,
  comandos: 0,
};
let idFatia = 0;

// ---------- sending, with slices for anything over the message limit ----------

function enviarFatiado(enviarUma, mensagem) {
  const partes = fatiar(mensagem, ++idFatia);
  let bytes = 0;
  for (const parte of partes) {
    const tamanho = bytesDe(parte);
    bytes += tamanho;
    medidas.maiorMensagem = Math.max(medidas.maiorMensagem, tamanho);
    enviarUma(parte);
  }
  if (partes.length > 1) medidas.fatiadas++;
  return bytes;
}

// The host's own messages loop back inside the page, so they cost nothing on the wire and are not counted.
function enviarAoAnfitriao(mensagem) {
  if (papel === 'anfitriao') {
    sala.enviarAoAnfitriao(mensagem);
    return 0;
  }
  return enviarFatiado(parte => sala.enviarAoAnfitriao(parte), mensagem);
}

// ---------- receiving, through the artificial delay ----------

// One queue per sender with non-decreasing delivery times, so the delay never reorders the reliable channel. A Worker
// timer drains them, because page timers in a background tab wake only once a second.
const filas = new Map(); // sender -> { itens: [{ entrega, mensagem }], ultima }
const DRENAGEM_MS = 5;
let drenagem = null;

function aoMensagem(de, mensagem) {
  const semAtraso = config.atraso <= 0 && config.variacao <= 0 && config.pico <= 0;
  if (de === sala.meuId || semAtraso) {
    tratar(de, mensagem);
    return;
  }
  if (!filas.has(de)) filas.set(de, { itens: [], ultima: 0 });
  const fila = filas.get(de);
  let atraso = config.atraso + Math.random() * config.variacao;
  if (Math.random() < config.pico) atraso += config.picoMs;
  fila.ultima = Math.max(fila.ultima, performance.now() + atraso);
  fila.itens.push({ entrega: fila.ultima, mensagem });
  drenagem ??= criarTique(DRENAGEM_MS, drenarFilas);
}

function drenarFilas() {
  const agora = performance.now();
  for (const [de, fila] of filas) {
    while (fila.itens.length && fila.itens[0].entrega <= agora) tratar(de, fila.itens.shift().mensagem);
  }
}

function tratar(de, mensagem) {
  try {
    if (mensagem?.t === MENSAGEM.FATIA) {
      if (!juntadores.has(de)) juntadores.set(de, criarJuntador());
      const inteira = juntadores.get(de).receber(mensagem);
      if (inteira) tratar(de, inteira);
      return;
    }
    if (papel === 'anfitriao') tratarNoAnfitriao(de, mensagem);
    else tratarNoMembro(mensagem);
  } catch (falha) {
    falhar(`mensagem ${mensagem?.t} de ${de}: ${falha?.message ?? falha}`);
  }
}

function tratarNoAnfitriao(de, mensagem) {
  if (mensagem.t === MENSAGEM.PRONTO) {
    prontos.add(de);
    tentarComecarRelogio();
  } else {
    anfitriao?.receber(de, mensagem);
  }
}

function tratarNoMembro(mensagem) {
  switch (mensagem.t) {
    case MENSAGEM.INICIO:
      iniciarComoMembro(mensagem);
      break;
    case MENSAGEM.TURNO:
      participante?.receberTurno(mensagem);
      break;
    case MENSAGEM.DESSINC:
      registrarDessincronia(mensagem);
      break;
    default:
      break;
  }
}

// ---------- the match ----------

function prepararPartida(inicio, meuJogador) {
  partida = inicio;
  jogador = meuJogador;
  estado = 'iniciando';
  trabalhador = new Worker(new URL('./trabalhador.js', import.meta.url), { type: 'module' });
  trabalhador.onmessage = ({ data }) => aoTrabalhador(data);
  trabalhador.onerror = evento => falhar(`Worker: ${evento.message || 'não carregou'}`);
  participante = criarParticipante({
    jogador,
    atrasoTurnos: inicio.atrasoTurnos,
    enviar: mensagem => {
      const bytes = enviarAoAnfitriao(mensagem);
      if (bytes) medidas.bytesCmd.adicionar(bytes);
      medidas.comandos++;
    },
    executar: pacote => trabalhador.postMessage({ t: 'turno', pacote }),
  });
  trabalhador.postMessage({ t: 'iniciar', jogador, partida: { semente: inicio.semente, jogadores: Object.keys(inicio.jogadores).length, porJogador: inicio.porJogador } });
}

function aoTrabalhador(data) {
  switch (data.t) {
    case 'pronto':
      trabalhadorPronto = true;
      if (config.robo) {
        robo = criarRobo({ comandar: comando => participante.comandar(comando), porSegundo: config.comandosPorSegundo, largura: data.largura, altura: data.altura });
        robo.atualizar(data.relatorio);
      }
      desenharMapa(data.relatorio, data.largura);
      if (papel === 'anfitriao') tentarComecarRelogio();
      else sala.enviarAoAnfitriao({ t: MENSAGEM.PRONTO });
      break;
    case 'executado':
      tick = data.tick;
      medidas.msTurno.adicionar(data.ms);
      if (data.soma) registrarSoma(data.soma);
      if (data.relatorio) {
        robo?.atualizar(data.relatorio);
        desenharMapa(data.relatorio);
      }
      if (estado === 'iniciando') {
        estado = 'jogando';
        robo?.ligar();
      }
      break;
    case 'erro':
      falhar(`simulação: ${data.mensagem}`);
      break;
    default:
      break;
  }
}

function registrarSoma({ tick: tickSoma, s }) {
  somasLocais.set(tickSoma, hex(s[0]));
  if (papel === 'anfitriao') {
    anfitriao.registrarSomaLocal(tickSoma, s);
    return;
  }
  const bytes = enviarAoAnfitriao({ t: MENSAGEM.SOMA, k: tickSoma, s });
  medidas.bytesSoma.adicionar(bytes);
}

function registrarDessincronia(registro) {
  if (dessincronia) return;
  dessincronia = registro;
  estado = 'dessincronia';
  robo?.desligar();
  relogio?.parar();
}

// ---------- host ----------

function comecar() {
  if (papel !== 'anfitriao' || partida) return;
  const jogadores = new Map(sala.membrosOrdenados().map((membro, indice) => [membro.id, indice]));
  const inicio = {
    t: MENSAGEM.INICIO,
    v: VERSAO_LOCKSTEP,
    vc: VERSAO_COMANDOS,
    vs: VERSAO_SIMULACAO,
    semente: config.semente,
    porJogador: config.porJogador,
    atrasoTurnos: config.atrasoTurnos,
    jogadores: Object.fromEntries(jogadores),
  };
  anfitriao = criarAnfitriao({
    jogadores,
    idLocal: sala.meuId,
    aoDessincronia: registro => {
      enviarFatiado(parte => sala.transmitir(parte), { t: MENSAGEM.DESSINC, ...registro });
      registrarDessincronia(registro);
    },
  });
  enviarFatiado(parte => sala.transmitir(parte), inicio);
  prepararPartida(inicio, jogadores.get(sala.meuId));
}

// The clock starts once every member built the match; turn 1 closes right away, then one every TURNO_MS.
function tentarComecarRelogio() {
  if (relogio || !trabalhadorPronto || !partida) return;
  for (const id of Object.keys(partida.jogadores)) if (id !== sala.meuId && !prontos.has(id)) return;
  let base = performance.now();
  let fechados = 0;
  relogio = criarTique(10, () => {
    const agora = performance.now();
    let feitos = 0;
    while (agora >= base + fechados * TURNO_MS) {
      if (feitos === MAX_FECHAMENTOS_POR_TIQUE || !anfitriao.podeFechar()) {
        // waiting for a member, or too far behind: go on from now instead of closing a burst of turns later
        base = agora - fechados * TURNO_MS;
        break;
      }
      fecharTurno();
      fechados++;
      feitos++;
    }
  });
}

function fecharTurno() {
  const pacote = anfitriao.fecharTurno();
  const bytes = enviarFatiado(parte => sala.transmitir(parte), pacote);
  medidas.bytesTurno.adicionar(bytes);
  if (pacote.c.length) medidas.bytesTurnoComComandos.adicionar(bytes);
  participante.receberTurno(pacote);
}

// ---------- member ----------

function iniciarComoMembro(inicio) {
  if (partida) return;
  const versoes = [[inicio.v, VERSAO_LOCKSTEP, 'do lockstep'], [inicio.vc, VERSAO_COMANDOS, 'dos comandos'], [inicio.vs, VERSAO_SIMULACAO, 'da simulação']];
  for (const [deles, minha, nome] of versoes) {
    if (deles !== minha) {
      falhar(`versão ${nome} diferente: anfitrião ${deles}, esta página ${minha}`);
      return;
    }
  }
  const meu = inicio.jogadores[sala.meuId];
  if (!Number.isInteger(meu)) {
    falhar('a partida começou sem esta página');
    return;
  }
  prepararPartida(inicio, meu);
}

// ---------- room ----------

async function criarSala() {
  try {
    sala = await Sala.criar({ nome: 'Anfitrião', maxMembros: 4 });
    papel = 'anfitriao';
    ligarSala();
  } catch (falha) {
    falhar(falha.message);
  }
}

async function entrarSala(codigo) {
  try {
    sala = await Sala.entrar(codigo, { nome: 'Jogador' });
    papel = 'membro';
    ligarSala();
  } catch (falha) {
    falhar(falha.message);
  }
}

function ligarSala() {
  sala.on('mensagem', aoMensagem);
  sala.on('membros', () => {
    if (papel === 'anfitriao' && config.jogadores > 0 && sala.membros.size >= config.jogadores) comecar();
  });
  sala.on('saiu', membro => anfitriao?.remover(membro.id));
  sala.on('caiu', motivo => falhar(`saiu da sala: ${motivo}`));
  if (papel === 'anfitriao' && config.jogadores === 1) comecar();
}

function falhar(mensagem) {
  if (erro) return;
  erro = mensagem;
  estado = 'erro';
  robo?.desligar();
  relogio?.parar();
  console.error('lockstep:', mensagem);
}

// ---------- report and screen ----------

function relatorio() {
  return {
    papel,
    estado,
    erro,
    motor: navigator.userAgent,
    webrtc: typeof RTCPeerConnection === 'function',
    codigo: sala?.codigo ?? null,
    membros: sala ? sala.membros.size : 0,
    jogador,
    turno: participante?.turnoExecutado ?? 0,
    tick,
    config,
    contagem: anfitriao ? { ...anfitriao.contagem } : null,
    confirmados: anfitriao?.confirmados() ?? null,
    dessincronias: anfitriao ? anfitriao.dessincronias.slice(0, 10) : dessincronia ? [dessincronia] : [],
    comandos: medidas.comandos,
    bytes: {
      turno: medidas.bytesTurno.resumo(),
      turnoComComandos: medidas.bytesTurnoComComandos.resumo(),
      cmd: medidas.bytesCmd.resumo(),
      soma: medidas.bytesSoma.resumo(),
      fatiadas: medidas.fatiadas,
      maiorMensagem: medidas.maiorMensagem,
    },
    latencia: participante?.latencia.resumo() ?? null,
    intervaloTurnos: participante?.intervalo.resumo() ?? null,
    msTurno: medidas.msTurno.resumo(),
    ping: sala ? Object.fromEntries(sala.membrosOrdenados().map(m => [m.id, m.ping === null ? null : Math.round(m.ping)])) : null,
  };
}

window.__lockstep = {
  relatorio,
  somas: () => Object.fromEntries(somasLocais),
};

function desenharMapa(dados, largura) {
  const tela = el('mapa');
  if (largura && tela.width !== largura) tela.width = tela.height = largura;
  const ctx = tela.getContext('2d');
  ctx.fillStyle = '#15171c';
  ctx.fillRect(0, 0, tela.width, tela.height);
  const { posicoes } = dados;
  for (let k = 0; k < posicoes.length; k += 3) {
    ctx.fillStyle = CORES[posicoes[k + 2] % CORES.length];
    ctx.fillRect(posicoes[k], posicoes[k + 1], 1, 1);
  }
}

function linha(nome, r) {
  if (!r || !r.n) return `${nome}: —`;
  return `${nome}: n ${r.n}, média ${r.media}, p50 ${r.p50}, p95 ${r.p95}, máx ${r.max}`;
}

// The room link keeps this page's parameters (delay, robot, units), minus the ones only the host uses.
function linkDaSala() {
  const busca = new URLSearchParams(location.search);
  busca.delete('criar');
  busca.delete('jogadores');
  const texto = busca.toString();
  return `${location.origin}${location.pathname}${texto ? `?${texto}` : ''}#${sala.codigo}`;
}

function atualizarPainel() {
  const r = relatorio();
  el('link').textContent = !sala?.codigo ? '' : papel === 'anfitriao' ? linkDaSala() : `na sala ${sala.codigo}`;
  el('comecar').hidden = !(papel === 'anfitriao' && !partida && sala.membros.size >= 2);
  el('criar').hidden = Boolean(sala) || Boolean(location.hash);
  const textos = [
    `estado: ${r.estado}${r.erro ? ` (${r.erro})` : ''}`,
    `papel: ${r.papel ?? '—'}, jogador ${r.jogador ?? '—'}, pessoas na sala ${r.membros}`,
    `turno ${r.turno}, passo ${r.tick} (${(r.tick / 30).toFixed(0)} s de jogo)`,
    `comandos enviados: ${r.comandos}`,
    linha('latência do comando (ms)', r.latencia),
    linha('intervalo entre turnos (ms)', r.intervaloTurnos),
    linha('turno no Worker (ms)', r.msTurno),
  ];
  if (r.contagem) {
    const c = r.contagem;
    textos.push(`somas comparadas ${c.comparacoes}, dessincronias ${r.dessincronias.length}, comandos aceitos ${c.aceitos}, atrasados ${c.atrasados}, recusados ${c.recusados}, esperas ${c.esperas}`);
    textos.push(linha('bytes por turno', r.bytes.turno), linha('bytes por turno com comandos', r.bytes.turnoComComandos));
  } else {
    textos.push(linha('bytes por envio de comando', r.bytes.cmd), linha('bytes por soma', r.bytes.soma));
  }
  textos.push(`mensagens fatiadas ${r.bytes.fatiadas}, maior mensagem ${r.bytes.maiorMensagem} bytes`);
  if (r.dessincronias.length) textos.push(`DESSINCRONIA: ${JSON.stringify(r.dessincronias[0])}`);
  el('painel').textContent = textos.join('\n');
}

el('criar').addEventListener('click', criarSala);
el('comecar').addEventListener('click', comecar);
setInterval(atualizarPainel, 500);

const codigo = location.hash.slice(1).toUpperCase();
if (codigo) entrarSala(codigo);
else if (config.criar) criarSala();
