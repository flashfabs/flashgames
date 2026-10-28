// Pavio: round flow (lobby with ready checks, a series of matches, results), networking and frame loop.
// The host runs the rules and streams snapshots; each member moves its own character locally (no input
// delay), reports the position, and renders everyone else slightly in the past, blended between snapshots.

import {
  Partida, MAX_JOGADORES, DIRECAO, SPAWNS, MAPAS, PONTOS, COLUNAS, LINHAS, PAREDE, CAIXA, ITEM, AJUSTES,
  indice, gradeVazia, moverComColisao, celulaAFrente, destinoAtalho, preverBomba, preverItemVoando, preverGelo,
  somarEstatisticasRodada, bloqueiaPrevisto, layoutDoMapa,
} from './regras.js';
import { criarPintor, efeitoAtivo, chaveDoTema } from './desenho.js';
import { criarControles, temToque } from './controles.js';
import { criarHud } from './hud.js';
import { tratarEventos as traduzirEventos } from './efeitos.js';
import { criarPassoFixo } from '../relogio.js';
import { criarRobo, aplicarAcaoDoRobo, NIVEIS as NIVEIS_ROBO, ORDEM_NIVEIS, NOMES_ROBOS } from './robo.js';
import { criarDicas } from './dicas.js';
import { criarTelas, atualizarConexoes, h, pontosDe, campeoes, ZERO, TOTAL_PARTIDAS } from './telas.js';

const HZ_SIMULACAO = 60;
const PASSOS_POR_RETRATO = 3; // 20 snapshots per second
const REPETICOES = 3; // events and grid changes ride along this many snapshots: the fast channel may drop some
const GRADE_A_CADA = 10;
const INTERVALO_POSICAO_MS = 33;
const POSICAO_PARADA_MS = 250;
const ATRASO_MIN_MS = 70;
const ATRASO_MAX_MS = 250;
const HISTORICO_MS = 800;
const DIVERGENCIA_TILES = 0.75;
const DIVERGENCIA_MS = 350;
const PREVISAO_MAX_MS = 120; // how far ahead of the newest snapshot kicked bombs and flying items are drawn
const INTERVALO_CHUTE_MS = 200;
const ATALHO_ESPERA_MS = 400; // after a shortcut, the host's count of charges takes a moment to come back
const QUADRO_MIN_MS = 15; // caps drawing near 60 fps on 120 Hz screens
const CONTAGEM_S = 3;
const RESULTADO_S = 7;
const PULO_S = 0.8; // once everyone voted to skip the result, the next match starts this soon
const FINAL_S = 15;
const FASES = new Set(['lobby', 'contagem', 'jogo', 'resultado', 'final']);
// Each match plays a variant of its map, picked by the match number (members know it from the state).
const murosGuardados = new Map();
function murosDaPartida(mapa, variante) {
  const chave = `${mapa}:${variante}`;
  if (!murosGuardados.has(chave)) murosGuardados.set(chave, new Set(layoutDoMapa(MAPAS[mapa], variante).muros.map(([x, y]) => indice(x, y))));
  return murosGuardados.get(chave);
}
const GRADE_LOBBY = gradeVazia().join('');
const BITS = { v: 1, a: 2, e: 4, i: 8, g: 16, p: 32, k: 64, r: 128, m: 256 };
const PARA_BOMBA = new Set([PAREDE, CAIXA, ...Object.values(ITEM)]);
const PARA_GELO = new Set([PAREDE, CAIXA]);
const MUSICA_DA_FASE = { lobby: 'lobby', contagem: 'jogo', jogo: 'jogo', resultado: 'resultado', final: 'resultado' };

function embaralhar(lista) {
  for (let i = lista.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }
  return lista;
}

// Restarts a CSS animation on an element that is already on screen.
function reiniciarAnimacao(elemento, classe) {
  elemento.classList.remove(classe);
  void elemento.offsetWidth;
  elemento.classList.add(classe);
}

function compactarJogador(j) {
  let marcas = 0;
  for (const [chave, bit] of Object.entries(BITS)) if (j[chave]) marcas |= bit;
  return [j.x, j.y, marcas, j.o, j.b, j.f, j.t, j.cx, j.el, j.gl, j.at];
}

function expandirJogador(dados) {
  const [x, y, marcas, o, b, f, t, cx, el, gl, at] = Array.isArray(dados) ? dados : [];
  const jogador = { x: Number(x) || 0, y: Number(y) || 0, o, b, f, t, cx: cx ?? 0, el: el ?? 0, gl: Number(gl) || 0, at: Number(at) || 0 };
  for (const [chave, bit] of Object.entries(BITS)) jogador[chave] = marcas & bit ? 1 : 0;
  return jogador;
}

function montarPalco(palco) {
  const el = {
    palco,
    canvas: h('canvas', { 'aria-label': 'Arena do Pavio' }),
    aviso: h('div', { class: 'pavio-aviso', hidden: true }),
    faixa: h('div', { class: 'pavio-faixa', hidden: true }),
    hud: h('div', { class: 'pavio-hud' }),
    hudItens: h('div', { class: 'pavio-hud-itens' }),
    hudPontos: h('div', { class: 'pavio-hud-pontos' }),
    hudTempo: h('div', { class: 'pavio-hud-tempo' }),
    base: h('div', { class: 'pavio-base' }),
    manete: h('div', { class: 'pavio-manete' }),
    dicaBomba: h('div', { class: 'pavio-dica-bomba' }, '💣'),
    dicaGelo: h('div', { class: 'pavio-dica-gelo', hidden: true }, '❄️'),
  };
  el.arena = h('div', { class: 'pavio-arena' }, el.canvas, el.faixa, el.aviso);
  el.toque = h('div', { class: 'pavio-toque', hidden: true, 'aria-hidden': 'true' }, el.base, el.manete, el.dicaBomba, el.dicaGelo);
  el.hud.append(el.hudItens, el.hudPontos, el.hudTempo);
  // Full screens (lobby, results) cover the whole stage; the countdown and notices sit on the arena.
  el.raiz = h('div', { class: 'pavio' }, el.hud, el.arena, el.toque);
  palco.replaceChildren(el.raiz);
  return el;
}

// aoTerminarPartida(resumo) records each finished match of this device's player in its profile (conta.js
// registrarPartida). The profile color comes with each member (sala.membros, cor), set when joining.
export function criarPavio({ sala, palco, som, aoMudarInfo, aoTerminarPartida = null }) {
  const el = montarPalco(palco);
  const pintor = criarPintor(el.canvas);
  const dicas = criarDicas({ arena: el.arena, toque: temToque() });
  // Phase changes said out loud for screen readers (the cards themselves are not live regions).
  const anuncio = h('div', { class: 'so-leitor', 'aria-live': 'polite' });
  el.raiz.append(anuncio);
  const hud = criarHud({ raiz: el.hud, itens: el.hudItens, pontos: el.hudPontos, tempo: el.hudTempo });
  const telas = criarTelas({ pintor });
  const toqueDisponivel = temToque();
  const estado = {
    fase: 'lobby',
    idPartida: 0,
    numero: 0, // match number inside the round, 1-based
    mapa: 0,
    escalacao: [], // [{ id, nome, slot, cor, robo? }] of the current round; robo is the robot's level
    cores: {},
    prontos: [],
    robos: [], // [{ id, nome, nivel }]: computer players added by the host, always ready
    pulos: [], // ids that voted to skip the current result screen
    placar: {}, // id -> { vitorias, caixas, eliminacoes } of the current round
    estatisticas: null, // Partida.estatisticas() of the last match that ended
    estatisticasRodada: {}, // id -> round totals, see somarEstatisticasRodada
    resultado: null,
    motivo: null,
    fimFaseEm: 0,
  };
  // Scores when the current match started, for the "+N this match" column on the results.
  let placarInicio = { idPartida: -1, placar: {} };

  // Host only.
  let partida = null;
  let restanteFase = 0;
  let passosDesdeRetrato = 0;
  let numeroRetrato = 0;
  let proximoEvento = 1;
  let eventosPendentes = []; // [{ id, ev, restantes }]
  let gradeRestante = 0;
  let ultimaVersaoGrade = -1;
  const suavizados = new Map();
  let cerebros = []; // robot brains of the current match
  let contadorRobos = 0;
  let nivelNovoRobo = 'medio';

  // Members only.
  let retratos = [];
  let ultimoRetrato = null;
  let gradeAtual = { gv: -1, g: GRADE_LOBBY };
  const atrasos = [];
  let menorAtraso = 0;
  let atrasoInterpolacao = 100;
  const eventosVistos = new Set();
  const local = {
    ativo: false, x: 0, y: 0, olhar: DIRECAO.BAIXO, andando: false, tenis: 0, vivo: false, fantasma: false, chute: false, atalhos: 0, empurrao: 0,
  };
  let atalhoLiberadoEm = 0;
  let bombasVisiveis = []; // newest snapshot's bombs, kicked ones moved ahead to now
  let ultimoChute = { chave: '', em: 0 };
  let historico = [];
  let divergenteDesde = 0;
  let ultimoEnvioPosicao = 0;
  let ultimaPosicaoEnviada = '';

  // Everyone.
  let entrada = { d: DIRECAO.NENHUMA, d2: DIRECAO.NENHUMA };
  const efeitos = [];
  let chaveAviso = '';
  let refContagem = null;
  const partidasRegistradas = new Set();
  let queroJogarDeNovo = false; // a member asked to come back ready from the round's end
  let primeiroEstadoVisto = false;
  let faseDoAviso = null;
  let ultimaContagem = null;
  let timerFaixa = 0;
  let quadroId = 0;
  let ultimoQuadro = performance.now();
  let ultimoDesenho = 0;
  let destruido = false;

  const controles = criarControles({
    camada: el.toque,
    base: el.base,
    manete: el.manete,
    dicaBomba: el.dicaBomba,
    dicaGelo: el.dicaGelo,
    aoEntrada: nova => {
      entrada = nova;
      som.destravar();
      if (nova.d) dicas.andou();
      if (sala.souAnfitriao) partida?.definirEntrada(sala.meuId, nova.d, nova.d2);
    },
    aoBomba: () => {
      som.destravar();
      dicas.soltouBomba();
      soltarBomba();
    },
    aoGelo: () => {
      som.destravar();
      jogarGelo();
    },
  });

  const observador = new ResizeObserver(() => ajustarArena());
  observador.observe(palco);

  const desligar = [
    sala.on('mensagem', (de, mensagem) => (sala.souAnfitriao ? noAnfitriao(de, mensagem) : noMembro(mensagem))),
    sala.on('membros', () => {
      chaveAviso = '';
      if (!sala.souAnfitriao) {
        informar();
        return;
      }
      if (estado.fase === 'lobby') ajustarRobos();
      atribuirCores();
      estado.prontos = estado.prontos.filter(id => sala.membros.has(id));
      publicarEstado();
      verificarLargada();
    }),
    sala.on('saiu', membro => {
      if (!sala.souAnfitriao || estado.fase === 'lobby' || estado.fase === 'final') return;
      if (!estado.escalacao.some(item => item.id === membro.id)) return;
      partida?.removerJogador(membro.id);
      finalizarRodada(`${membro.nome} saiu da sala, então a rodada acabou.`);
    }),
    // A member whose link dropped stands still (and can still be hit) until it comes back or the room drops it.
    sala.on('fora', membro => {
      if (!sala.souAnfitriao) return;
      const jogador = partida?.jogadores.find(item => item.id === membro.id);
      if (jogador) jogador.andando = false;
    }),
    sala.on('reconectou', () => sala.enviarAoAnfitriao({ t: 'pedirEstado' })),
    // Pings change every second: the lobby badges update in place.
    sala.on('qualidade', () => {
      if (estado.fase === 'lobby') atualizarConexoes(el.aviso, sala.membrosOrdenados());
    }),
  ];

  function ajustarArena() {
    // The stage may keep a strip free for the touch controls (telas.css): the arena fits above it.
    const estilo = getComputedStyle(el.raiz);
    const reserva = (parseFloat(estilo.paddingTop) || 0) + (parseFloat(estilo.paddingBottom) || 0);
    const largura = palco.clientWidth;
    const altura = palco.clientHeight - reserva - el.hud.offsetHeight - 8;
    if (largura <= 0 || altura <= 0) return;
    const tamanho = Math.floor(Math.max(160, Math.min(largura, altura * (COLUNAS / LINHAS))));
    el.arena.style.width = `${tamanho}px`;
    el.hud.style.width = `${tamanho}px`;
  }

  function meuIndice() {
    return estado.escalacao.findIndex(item => item.id === sala.meuId);
  }

  function soltarBomba() {
    if (estado.fase !== 'jogo') return;
    if (sala.souAnfitriao) {
      partida?.pedirBomba(sala.meuId);
      return;
    }
    if (!local.ativo || !local.vivo || !sala.conectada) return;
    // The bomb travels on the reliable channel together with the position it was dropped at.
    sala.enviarAoAnfitriao({ t: 'bomba', ...posicaoLocal() });
  }

  function meuGelo() {
    if (sala.souAnfitriao) return partida?.jogadores.find(j => j.id === sala.meuId)?.gelo ?? 0;
    return ultimoRetrato?.j[meuIndice()]?.gl ?? 0;
  }

  // The ice button drops a bomb when there is no ice left, so the gamepad's B and Y keep their old use.
  function jogarGelo() {
    if (estado.fase !== 'jogo') return;
    if (meuGelo() <= 0) {
      soltarBomba();
      return;
    }
    if (sala.souAnfitriao) {
      partida?.jogarGelo(sala.meuId);
      return;
    }
    if (!local.ativo || !local.vivo) return;
    // The shot leaves from (and toward) where this player is on its own screen.
    sala.enviarAoAnfitriao({ t: 'gelo', ...posicaoLocal() });
  }

  function posicaoLocal() {
    return {
      x: Math.round(local.x * 100) / 100,
      y: Math.round(local.y * 100) / 100,
      o: local.olhar,
      a: local.andando ? 1 : 0,
      c: performance.now(),
    };
  }

  // ---- Host side ----

  function atribuirCores() {
    const jogadores = [...sala.membrosOrdenados(), ...estado.robos];
    const presentes = new Set(jogadores.map(({ id }) => id));
    for (const id of Object.keys(estado.cores)) if (!presentes.has(id) || estado.cores[id] >= MAX_JOGADORES) delete estado.cores[id];
    const usadas = new Set(Object.values(estado.cores));
    for (const { id } of jogadores) {
      if (estado.cores[id] !== undefined) continue;
      // Someone's profile color (when it is one of the arena's and free), otherwise the lowest free one.
      let cor = sala.membros.get(id)?.cor;
      if (!Number.isInteger(cor) || cor >= MAX_JOGADORES || usadas.has(cor)) cor = 0;
      while (usadas.has(cor)) cor++;
      // A ninth player (a person joining while robots fill the arena) only watches: no color until one frees up.
      if (cor >= MAX_JOGADORES) continue;
      estado.cores[id] = cor;
      usadas.add(cor);
    }
  }

  // Skipping the result screen: once every person of the match (still in the room) voted, the next match starts.
  function registrarPulo(id) {
    if (estado.fase !== 'resultado' || estado.pulos.includes(id)) return;
    const pessoas = estado.escalacao.filter(item => !item.robo && sala.membros.has(item.id));
    if (!pessoas.some(item => item.id === id)) return;
    estado.pulos = [...estado.pulos, id];
    if (pessoas.every(item => estado.pulos.includes(item.id) || sala.membros.get(item.id)?.fora)) {
      restanteFase = Math.min(restanteFase, PULO_S);
      estado.fimFaseEm = performance.now() + restanteFase * 1000;
    }
    publicarEstado();
  }

  // ---- Robots (host only): computer players that fill the arena. They are not room members, so they never
  // leave and never hold the round back. ----

  function vagasParaRobos() {
    return Math.max(0, MAX_JOGADORES - sala.membros.size);
  }

  // People have priority: robots that no longer fit make room for whoever joined.
  function ajustarRobos() {
    estado.robos = estado.robos.slice(0, vagasParaRobos());
  }

  function adicionarRobo() {
    if (estado.fase !== 'lobby' || estado.robos.length >= vagasParaRobos()) return;
    const usados = new Set(estado.robos.map(robo => robo.nome));
    const nome = NOMES_ROBOS.map(apelido => `🤖 ${apelido}`).find(candidato => !usados.has(candidato)) ?? `🤖 Robô ${contadorRobos + 1}`;
    contadorRobos += 1;
    estado.robos = [...estado.robos, { id: `robo-${contadorRobos}`, nome, nivel: nivelNovoRobo }];
    atribuirCores();
    publicarEstado();
  }

  function removerRobo(id) {
    if (estado.fase !== 'lobby') return;
    estado.robos = estado.robos.filter(robo => robo.id !== id);
    atribuirCores();
    publicarEstado();
  }

  function trocarNivelRobo(id) {
    if (estado.fase !== 'lobby') return;
    const proximo = nivel => ORDEM_NIVEIS[(ORDEM_NIVEIS.indexOf(nivel) + 1) % ORDEM_NIVEIS.length];
    estado.robos = estado.robos.map(robo => (robo.id === id ? { ...robo, nivel: proximo(robo.nivel) } : robo));
    publicarEstado();
  }

  function moverRobos(dt) {
    for (const cerebro of cerebros) aplicarAcaoDoRobo(partida, cerebro.id, cerebro.pensar(partida, dt));
  }

  function publicarEstado(para = null) {
    const mensagem = {
      t: 'estado',
      fase: estado.fase,
      idPartida: estado.idPartida,
      numero: estado.numero,
      mapa: estado.mapa,
      escalacao: estado.escalacao,
      cores: estado.cores,
      prontos: estado.prontos,
      robos: estado.robos,
      pulos: estado.pulos,
      placar: estado.placar,
      estatisticas: estado.estatisticas,
      estatisticasRodada: estado.estatisticasRodada,
      resultado: estado.resultado,
      motivo: estado.motivo,
      restante: Math.max(0, restanteFase),
    };
    if (para) sala.enviarPara(para, mensagem);
    else sala.transmitir(mensagem);
    chaveAviso = '';
    informar();
  }

  function noAnfitriao(de, mensagem) {
    switch (mensagem.t) {
      case 'pronto':
        definirPronto(de, Boolean(mensagem.v));
        break;
      case 'p':
        if (partida && estado.fase === 'jogo') partida.aplicarPosicao(de, mensagem);
        break;
      case 'bomba':
        if (partida && estado.fase === 'jogo') {
          partida.aplicarPosicao(de, mensagem);
          partida.pedirBomba(de);
        }
        break;
      case 'chute':
        if (partida && estado.fase === 'jogo') {
          partida.aplicarPosicao(de, mensagem);
          partida.chutar(de, Number(mensagem.d));
        }
        break;
      case 'gelo':
        if (partida && estado.fase === 'jogo') {
          partida.aplicarPosicao(de, mensagem);
          partida.jogarGelo(de);
        }
        break;
      case 'atalho':
        if (partida && estado.fase === 'jogo') partida.atravessar(de, Number(mensagem.d), mensagem);
        break;
      case 'pedirEstado':
        if (de !== sala.meuId) publicarEstado(de);
        break;
      case 'pular':
        registrarPulo(de);
        break;
      default:
        break;
    }
  }

  function definirPronto(id, valor) {
    if (estado.fase !== 'lobby' || !sala.membros.has(id)) return;
    const prontos = new Set(estado.prontos);
    if (valor) prontos.add(id);
    else prontos.delete(id);
    estado.prontos = [...prontos];
    publicarEstado();
    verificarLargada();
  }

  // The round starts by itself once everyone in the room is ready.
  function verificarLargada() {
    if (estado.fase !== 'lobby' || !sala.membros.size) return;
    if (sala.membrosOrdenados().every(membro => estado.prontos.includes(membro.id) && !membro.fora)) comecarRodada();
  }

  function comecarRodada() {
    atribuirCores();
    const membros = sala.membrosOrdenados().slice(0, MAX_JOGADORES);
    const robos = estado.robos.slice(0, MAX_JOGADORES - membros.length);
    estado.escalacao = [
      ...membros.map(membro => ({ id: membro.id, nome: membro.nome, slot: 0, cor: estado.cores[membro.id] })),
      ...robos.map(robo => ({ id: robo.id, nome: robo.nome, slot: 0, cor: estado.cores[robo.id], robo: robo.nivel })),
    ];
    estado.placar = Object.fromEntries(estado.escalacao.map(item => [item.id, { ...ZERO }]));
    estado.estatisticas = null;
    estado.estatisticasRodada = {};
    estado.numero = 0;
    estado.motivo = null;
    comecarPartida();
  }

  function comecarPartida() {
    estado.numero += 1;
    estado.mapa = Math.min(estado.numero, TOTAL_PARTIDAS) - 1;
    estado.idPartida += 1;
    const slots = embaralhar([...estado.escalacao.keys()]);
    estado.escalacao = estado.escalacao.map((item, n) => ({ ...item, slot: slots[n] }));
    estado.resultado = null;
    // Robots are local players of the host's simulation: their brains give the input on every step.
    partida = new Partida(
      estado.escalacao.map(({ id, slot, robo }) => ({ id, slot, remoto: id !== sala.meuId && !robo })),
      { mapa: MAPAS[estado.mapa], variante: estado.idPartida },
    );
    cerebros = estado.escalacao.filter(item => item.robo).map(item => criarRobo({ id: item.id, nivel: item.robo }));
    partida.definirEntrada(sala.meuId, entrada.d, entrada.d2);
    eventosPendentes = [];
    ultimaVersaoGrade = -1;
    suavizados.clear();
    passosDesdeRetrato = PASSOS_POR_RETRATO;
    mudarFase('contagem', CONTAGEM_S);
  }

  function somarEstatisticas(vencedor) {
    estado.estatisticas = partida.estatisticas();
    estado.estatisticasRodada = somarEstatisticasRodada(estado.estatisticasRodada, estado.estatisticas);
    for (const { id, caixas, eliminacoes } of estado.estatisticas) {
      const placar = estado.placar[id];
      if (!placar) continue;
      placar.caixas += caixas;
      placar.eliminacoes += eliminacoes;
      if (id === vencedor) placar.vitorias += 1;
    }
  }

  function encerrarPartida(resultado) {
    estado.resultado = resultado;
    estado.pulos = [];
    somarEstatisticas(resultado.vencedor);
    if (estado.numero >= TOTAL_PARTIDAS) {
      estado.motivo = null;
      mudarFase('final', FINAL_S);
    } else {
      mudarFase('resultado', RESULTADO_S);
    }
  }

  // Ends the round early (someone left): what was scored so far still counts.
  function finalizarRodada(motivo) {
    if (estado.fase === 'jogo' || estado.fase === 'contagem') somarEstatisticas(null);
    estado.resultado = null;
    estado.motivo = motivo;
    mudarFase('final', FINAL_S);
  }

  function voltarAoLobby() {
    partida = null;
    cerebros = [];
    ajustarRobos();
    // A robot that made room frees its color for whoever joined meanwhile.
    atribuirCores();
    estado.escalacao = [];
    estado.prontos = [];
    estado.placar = {};
    estado.resultado = null;
    estado.motivo = null;
    estado.numero = 0;
    mudarFase('lobby');
  }

  function mudarFase(fase, duracao = 0) {
    const anterior = estado.fase;
    estado.fase = fase;
    restanteFase = duracao;
    estado.fimFaseEm = performance.now() + duracao * 1000;
    publicarEstado();
    aoEntrarNaFase(fase, anterior);
  }

  function passoAnfitriao(dt) {
    if (estado.fase === 'lobby' || !partida) return;
    if (estado.fase === 'contagem') {
      restanteFase -= dt;
      if (restanteFase <= 0) mudarFase('jogo');
    } else if (estado.fase === 'jogo') {
      moverRobos(dt);
      partida.passo(dt);
      if (partida.resultado) encerrarPartida(partida.resultado);
    } else {
      restanteFase -= dt;
      if (restanteFase <= 0) {
        if (estado.fase === 'resultado') comecarPartida();
        else voltarAoLobby();
        return;
      }
    }
    passosDesdeRetrato += 1;
    if (passosDesdeRetrato >= PASSOS_POR_RETRATO) {
      passosDesdeRetrato = 0;
      enviarRetrato();
    }
  }

  function enviarRetrato() {
    const novos = partida.tirarEventos();
    tratarEventos(novos);
    for (const ev of novos) eventosPendentes.push({ id: proximoEvento++, ev, restantes: REPETICOES });
    const vista = partida.vista();
    numeroRetrato += 1;
    if (vista.gv !== ultimaVersaoGrade) {
      ultimaVersaoGrade = vista.gv;
      gradeRestante = REPETICOES;
    }
    const comGrade = gradeRestante > 0 || numeroRetrato % GRADE_A_CADA === 0;
    gradeRestante = Math.max(0, gradeRestante - 1);
    sala.transmitir({
      t: 'q',
      p: estado.idPartida,
      n: numeroRetrato,
      h: Math.round(performance.now()),
      gv: vista.gv,
      ...(comGrade ? { g: vista.g } : {}),
      j: vista.j.map(compactarJogador),
      b: vista.b,
      c: vista.c,
      iv: vista.iv,
      gl: vista.gl,
      tm: vista.tm,
      ms: vista.ms,
      ev: eventosPendentes.map(({ id, ev }) => [id, ev]),
    }, { rapido: true });
    for (const pendente of eventosPendentes) pendente.restantes -= 1;
    eventosPendentes = eventosPendentes.filter(pendente => pendente.restantes > 0);
  }

  // Remote players arrive at ~30 Hz; the host smooths them on screen only.
  function vistaDoAnfitriao(dt) {
    const vista = partida.vista();
    const k = 1 - Math.exp(-dt * 18);
    vista.j = vista.j.map((jogador, n) => {
      // The host's own player and the robots move inside this simulation: nothing to smooth.
      if (estado.escalacao[n]?.id === sala.meuId || estado.escalacao[n]?.robo) return jogador;
      const suave = suavizados.get(n);
      // A jump (shortcut over a crate, respawn) is drawn at once, with the same rule as the guests' view.
      if (!suave || Math.abs(suave.x - jogador.x) > 1.5 || Math.abs(suave.y - jogador.y) > 1.5) {
        suavizados.set(n, { x: jogador.x, y: jogador.y });
        return jogador;
      }
      suave.x += (jogador.x - suave.x) * k;
      suave.y += (jogador.y - suave.y) * k;
      return { ...jogador, x: suave.x, y: suave.y };
    });
    return vista;
  }

  // ---- Member side ----

  function noMembro(mensagem) {
    if (mensagem.t === 'estado') aplicarEstado(mensagem);
    else if (mensagem.t === 'q') receberRetrato(mensagem);
  }

  function aplicarEstado(mensagem) {
    const anterior = estado.fase;
    const partidaAnterior = estado.idPartida;
    estado.fase = FASES.has(mensagem.fase) ? mensagem.fase : 'lobby';
    estado.idPartida = Number(mensagem.idPartida) || 0;
    estado.numero = Number(mensagem.numero) || 0;
    estado.mapa = Math.min(Math.max(Number(mensagem.mapa) || 0, 0), TOTAL_PARTIDAS - 1);
    estado.escalacao = Array.isArray(mensagem.escalacao) ? mensagem.escalacao.slice(0, MAX_JOGADORES) : [];
    estado.cores = mensagem.cores && typeof mensagem.cores === 'object' ? mensagem.cores : {};
    estado.prontos = Array.isArray(mensagem.prontos) ? mensagem.prontos.map(String) : [];
    estado.pulos = Array.isArray(mensagem.pulos) ? mensagem.pulos.map(String) : [];
    estado.robos = Array.isArray(mensagem.robos)
      ? mensagem.robos.slice(0, MAX_JOGADORES).map(robo => ({
        id: String(robo?.id ?? ''),
        nome: String(robo?.nome ?? '🤖'),
        nivel: NIVEIS_ROBO[robo?.nivel] ? robo.nivel : 'medio',
      }))
      : [];
    estado.placar = mensagem.placar && typeof mensagem.placar === 'object' ? mensagem.placar : {};
    estado.estatisticas = Array.isArray(mensagem.estatisticas) ? mensagem.estatisticas : null;
    estado.estatisticasRodada = mensagem.estatisticasRodada && typeof mensagem.estatisticasRodada === 'object' ? mensagem.estatisticasRodada : {};
    estado.resultado = mensagem.resultado ?? null;
    estado.motivo = typeof mensagem.motivo === 'string' ? mensagem.motivo : null;
    estado.fimFaseEm = performance.now() + (Number(mensagem.restante) || 0) * 1000;
    if (estado.idPartida !== partidaAnterior) prepararPartidaLocal();
    if (estado.fase !== anterior) aoEntrarNaFase(estado.fase, anterior);
    if (estado.fase === 'lobby' && queroJogarDeNovo) {
      queroJogarDeNovo = false;
      sala.enviarAoAnfitriao({ t: 'pronto', v: true });
    }
    // Arriving with a round under way: say what happens now, once.
    if (!primeiroEstadoVisto) {
      primeiroEstadoVisto = true;
      if (estado.fase !== 'lobby' && estado.fase !== 'final' && meuIndice() < 0) mostrarFaixa('A rodada já começou: você assiste agora e entra na próxima.');
    }
    chaveAviso = '';
    informar();
  }

  function prepararPartidaLocal() {
    retratos = [];
    ultimoRetrato = null;
    gradeAtual = { gv: -1, g: GRADE_LOBBY };
    historico = [];
    bombasVisiveis = [];
    divergenteDesde = 0;
    const eu = estado.escalacao.find(item => item.id === sala.meuId);
    local.ativo = Boolean(eu) && estado.fase !== 'lobby';
    if (!eu) return;
    const [x, y] = SPAWNS[eu.slot] ?? SPAWNS[0];
    Object.assign(local, { x, y, olhar: DIRECAO.BAIXO, andando: false, tenis: 0, vivo: true, fantasma: false, chute: false, atalhos: 0, empurrao: 0 });
  }

  function receberRetrato(mensagem) {
    if (estado.fase === 'lobby' || Number(mensagem.p) !== estado.idPartida) return;
    if (!Array.isArray(mensagem.j) || !Array.isArray(mensagem.b) || !Array.isArray(mensagem.c)) return;
    // Events first: an older snapshot arriving late still brings events that were not seen yet.
    for (const [id, ev] of Array.isArray(mensagem.ev) ? mensagem.ev : []) {
      if (eventosVistos.has(id)) continue;
      eventosVistos.add(id);
      tratarEventos([ev]);
    }
    while (eventosVistos.size > 400) eventosVistos.delete(eventosVistos.values().next().value);
    if (typeof mensagem.g === 'string' && mensagem.g.length === COLUNAS * LINHAS && mensagem.gv >= gradeAtual.gv) {
      gradeAtual = { gv: mensagem.gv, g: mensagem.g };
    }
    const numero = Number(mensagem.n);
    if (ultimoRetrato && numero <= ultimoRetrato.n) return;
    const chegada = performance.now();
    const retrato = {
      n: numero,
      h: Number(mensagem.h),
      chegada,
      j: mensagem.j.map(expandirJogador),
      b: mensagem.b,
      c: mensagem.c,
      iv: Array.isArray(mensagem.iv) ? mensagem.iv : [],
      gl: Array.isArray(mensagem.gl) ? mensagem.gl : [],
      tm: Number(mensagem.tm) || 0,
      ms: Number(mensagem.ms) || 120,
    };
    atrasos.push(chegada - retrato.h);
    if (atrasos.length > 60) atrasos.shift();
    const ordenados = [...atrasos].sort((a, b) => a - b);
    menorAtraso = ordenados[0];
    const oscilacao = ordenados[Math.floor(ordenados.length * 0.9)] - menorAtraso;
    const alvo = Math.min(ATRASO_MAX_MS, Math.max(ATRASO_MIN_MS, 1000 / 20 + oscilacao + 20));
    atrasoInterpolacao += (alvo - atrasoInterpolacao) * 0.1;
    retratos.push(retrato);
    if (retratos.length > 40) retratos.shift();
    ultimoRetrato = retrato;
    reconciliar(retrato);
  }

  // The server's copy of me lags behind; it only wins when it is nowhere near my recent path.
  function reconciliar(retrato) {
    const n = meuIndice();
    const servidor = retrato.j[n];
    if (n < 0 || !local.ativo || !servidor) return;
    local.tenis = servidor.t ?? 0;
    local.fantasma = Boolean(servidor.g);
    local.chute = Boolean(servidor.k);
    local.atalhos = servidor.at ?? 0;
    local.vivo = Boolean(servidor.v);
    if (estado.fase !== 'jogo') {
      local.x = servidor.x;
      local.y = servidor.y;
      historico = [];
      return;
    }
    const perto = ponto => Math.abs(ponto.x - servidor.x) + Math.abs(ponto.y - servidor.y) <= DIVERGENCIA_TILES;
    if (perto(local) || historico.some(perto)) {
      divergenteDesde = 0;
      return;
    }
    const agora = performance.now();
    if (!divergenteDesde) {
      divergenteDesde = agora;
    } else if (agora - divergenteDesde > DIVERGENCIA_MS) {
      local.x = servidor.x;
      local.y = servidor.y;
      historico = [];
      divergenteDesde = 0;
    }
  }

  function bloqueiaLocal(x, y) {
    return bloqueiaPrevisto(gradeAtual.g, bombasVisiveis, local, x, y);
  }

  // Kicked bombs slide between snapshots: draw them (and collide with them) where they should be by now.
  function preverBombas(agora) {
    if (!ultimoRetrato) return [];
    const segundos = Math.min(agora - ultimoRetrato.chegada, PREVISAO_MAX_MS) / 1000;
    return ultimoRetrato.b.map(bomba => preverBomba(bomba, segundos, paraNaGrade(PARA_BOMBA)));
  }

  function paraNaGrade(solidos) {
    return (x, y) => x < 0 || y < 0 || x >= COLUNAS || y >= LINHAS || solidos.has(gradeAtual.g[indice(x, y)]);
  }

  // Pushing against a still bomb asks the host for a kick; the bomb starts sliding in the next snapshots.
  function pedirChute(agora) {
    const parada = (x, y) => bombasVisiveis.some(([bx, by, , deslize]) => !deslize && bx === x && by === y);
    const alvo = celulaAFrente(local, entrada.d, parada);
    if (!alvo) return;
    const chave = `${alvo}|${entrada.d}`;
    if (chave === ultimoChute.chave && agora - ultimoChute.em < INTERVALO_CHUTE_MS) return;
    ultimoChute = { chave, em: agora };
    sala.enviarAoAnfitriao({ t: 'chute', d: entrada.d, ...posicaoLocal() });
  }

  // Pushing against crates with shortcut charges: jump past them right away and tell the host, which checks it.
  function empurrarCaixaLocal(dt, agora) {
    const caixa = (x, y) => x >= 0 && y >= 0 && x < COLUNAS && y < LINHAS && gradeAtual.g[indice(x, y)] === CAIXA;
    const livre = (x, y) => !bloqueiaLocal(x, y);
    const pode = entrada.d && !local.fantasma && agora >= atalhoLiberadoEm;
    const destino = pode ? destinoAtalho(local, entrada.d, local.atalhos, caixa, livre) : null;
    local.empurrao = destino ? local.empurrao + dt : 0;
    if (!destino || local.empurrao < AJUSTES.empurrarAtalhoS) return;
    sala.enviarAoAnfitriao({ t: 'atalho', d: entrada.d, ...posicaoLocal() });
    local.x = destino.x;
    local.y = destino.y;
    local.empurrao = 0;
    atalhoLiberadoEm = agora + ATALHO_ESPERA_MS;
  }

  function passoLocal(dt, agora) {
    if (sala.souAnfitriao || estado.fase !== 'jogo' || !local.ativo || !local.vivo || !sala.conectada) {
      local.andando = false;
      return;
    }
    moverComColisao(local, entrada, dt, bloqueiaLocal);
    if (local.chute && entrada.d) pedirChute(agora);
    if (local.atalhos > 0) empurrarCaixaLocal(dt, agora);
    historico.push({ t: agora, x: local.x, y: local.y });
    while (historico.length && agora - historico[0].t > HISTORICO_MS) historico.shift();
  }

  function enviarPosicao(agora) {
    if (sala.souAnfitriao || estado.fase !== 'jogo' || !local.ativo || !local.vivo || !sala.conectada) return;
    const chave = `${local.x.toFixed(2)},${local.y.toFixed(2)},${local.olhar},${local.andando}`;
    const mudou = chave !== ultimaPosicaoEnviada;
    if (!(mudou && agora - ultimoEnvioPosicao >= INTERVALO_POSICAO_MS) && agora - ultimoEnvioPosicao < POSICAO_PARADA_MS) return;
    sala.enviarAoAnfitriao({ t: 'p', ...posicaoLocal() }, { rapido: true });
    ultimoEnvioPosicao = agora;
    ultimaPosicaoEnviada = chave;
  }

  function vistaDoMembro() {
    if (!ultimoRetrato) return null;
    const alvo = performance.now() - menorAtraso - atrasoInterpolacao;
    let n = 0;
    while (n + 1 < retratos.length && retratos[n + 1].h <= alvo) n++;
    const a = retratos[n];
    const b = retratos[n + 1];
    let jogadores = a.j;
    if (b && alvo > a.h && b.h > a.h && a.j.length === b.j.length) {
      const t = (alvo - a.h) / (b.h - a.h);
      jogadores = a.j.map((ja, k) => {
        const jb = b.j[k];
        if (Math.abs(jb.x - ja.x) > 1.5 || Math.abs(jb.y - ja.y) > 1.5) return jb;
        return { ...jb, x: ja.x + (jb.x - ja.x) * t, y: ja.y + (jb.y - ja.y) * t };
      });
    }
    const eu = meuIndice();
    if (eu >= 0 && local.ativo && ultimoRetrato.j[eu] && estado.fase === 'jogo') {
      jogadores = jogadores.slice();
      jogadores[eu] = { ...ultimoRetrato.j[eu], x: local.x, y: local.y, o: local.olhar, a: local.andando ? 1 : 0 };
    }
    // Items flying to a magnet head to where their player is drawn now.
    const segundos = Math.min(performance.now() - ultimoRetrato.chegada, PREVISAO_MAX_MS) / 1000;
    const iv = ultimoRetrato.iv.map(voo => preverItemVoando(voo, jogadores[voo[3]], segundos));
    const gl = ultimoRetrato.gl.map(tiro => preverGelo(tiro, segundos, paraNaGrade(PARA_GELO)));
    // Grid, bombs and flames come from the newest snapshot: they matter more than smoothness.
    return { g: gradeAtual.g, j: jogadores, b: bombasVisiveis, c: ultimoRetrato.c, iv, gl, tm: ultimoRetrato.tm, ms: ultimoRetrato.ms };
  }

  // ---- Shared ----

  function aoEntrarNaFase(fase) {
    chaveAviso = '';
    controles.definirModo({ jogando: (fase === 'contagem' || fase === 'jogo') && meuIndice() >= 0, toqueVisivel: toqueDisponivel });
    ajustarArena();
    som.musica(MUSICA_DA_FASE[fase] ?? null, { tema: chaveDoTema(MAPAS[estado.mapa]?.tema, estado.mapa) });
    if (fase === 'contagem') {
      efeitos.length = 0;
      ultimaContagem = null;
      placarInicio = {
        idPartida: estado.idPartida,
        placar: Object.fromEntries(Object.entries(estado.placar).map(([id, placar]) => [id, { ...ZERO, ...placar }])),
      };
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    } else if (fase === 'jogo') {
      som.tocar('vai');
      if (meuIndice() >= 0) vibrar(35);
      efeitos.push({ tipo: 'largada', x: 0, y: 0, inicio: performance.now() / 1000 });
    } else if (fase === 'resultado') {
      som.tocar(estado.resultado?.vencedor === sala.meuId ? 'vitoria' : 'fim');
      registrarMinhaPartida();
    } else if (fase === 'final') {
      som.tocar(campeoes(estado).some(linha => linha.id === sala.meuId) ? 'campeao' : 'fim');
      // The last match ends straight into the round's end; a round cut short leaves its match out.
      if (!estado.motivo) registrarMinhaPartida({ fimDaRodada: true });
    } else {
      efeitos.length = 0;
      local.ativo = false;
    }
  }

  // This device's player's share of the match that just ended, for its profile. Once per match.
  function registrarMinhaPartida({ fimDaRodada = false } = {}) {
    if (!aoTerminarPartida || partidasRegistradas.has(estado.idPartida)) return;
    const minhas = estado.estatisticas?.find(linha => linha.id === sala.meuId);
    if (!minhas || meuIndice() < 0) return;
    partidasRegistradas.add(estado.idPartida);
    const duracaoS = Math.round(Math.max(0, ...estado.estatisticas.map(linha => Number(linha.tempoVivo) || 0)));
    aoTerminarPartida({
      venceu: estado.resultado?.vencedor === sala.meuId,
      caixas: minhas.caixas ?? 0,
      eliminacoes: minhas.eliminacoes ?? 0,
      jogadores: estado.escalacao.length,
      robos: estado.escalacao.filter(item => item.robo).length,
      mapa: MAPAS[estado.mapa]?.tema ?? null,
      duracaoS,
      campeaoDaRodada: fimDaRodada && estado.escalacao.length > 1 && campeoes(estado).some(linha => linha.id === sala.meuId),
      em: Date.now(),
    });
  }

  function tratarEventos(eventos) {
    const eu = meuIndice();
    if (eventos.some(evento => evento?.e === 'item' && evento.j === eu)) dicas.pegouPoder();
    if (eu >= 0 && eventos.some(evento => evento?.e === 'morte' && evento.j === eu)) vibrar([60, 40, 140]);
    traduzirEventos(eventos, { efeitos, som, eu: meuIndice(), escalacao: estado.escalacao, mostrarFaixa });
  }


  function mostrarFaixa(texto) {
    el.faixa.textContent = texto;
    el.faixa.hidden = false;
    clearTimeout(timerFaixa);
    timerFaixa = setTimeout(() => {
      el.faixa.hidden = true;
    }, 3500);
  }

  function informar() {
    const pontos = Object.fromEntries(Object.entries(estado.placar).map(([id, placar]) => [id, pontosDe({ ...ZERO, ...placar })]));
    aoMudarInfo?.({ fase: estado.fase, cores: estado.cores, prontos: estado.prontos, pontos, escalacao: estado.escalacao });
  }

  // What the screens in telas.js get: the state, who is looking, and what their buttons do.
  function contextoDaTela() {
    return {
      estado,
      meuId: sala.meuId,
      souAnfitriao: sala.souAnfitriao,
      idAnfitriao: sala.idAnfitriao,
      link: sala.link,
      codigo: sala.codigo,
      membros: sala.membrosOrdenados(),
      toque: toqueDisponivel,
      placarInicio,
      nivelNovoRobo,
      queroJogarDeNovo,
      vagasRobos: sala.souAnfitriao ? vagasParaRobos() : 0,
      acoes: {
        pronto: valor => {
          som.tocar(valor ? 'pronto' : 'cancelar');
          sala.enviarAoAnfitriao({ t: 'pronto', v: valor });
        },
        voltarAoLobby,
        pular: () => {
          if (sala.souAnfitriao) registrarPulo(sala.meuId);
          else sala.enviarAoAnfitriao({ t: 'pular' });
        },
        jogarDeNovo: () => {
          if (sala.souAnfitriao) {
            voltarAoLobby();
            definirPronto(sala.meuId, true);
            return;
          }
          queroJogarDeNovo = true;
          chaveAviso = '';
        },
        adicionarRobo,
        removerRobo,
        trocarNivelRobo,
        escolherNivelRobo: nivel => {
          nivelNovoRobo = nivel;
          chaveAviso = '';
        },
      },
    };
  }

  // A short buzz on phones and tablets at the moments that matter (start, getting blown up).
  function vibrar(padrao) {
    if (!toqueDisponivel || typeof navigator.vibrate !== 'function') return;
    try {
      navigator.vibrate(padrao);
    } catch {
      // Some browsers refuse without a recent touch; nothing to do.
    }
  }

  function anunciar({ jogando, morto }) {
    if (estado.fase === 'resultado' || estado.fase === 'final') {
      // The card is built right after this call: read its title once it is on the page.
      queueMicrotask(() => {
        anuncio.textContent = el.aviso.querySelector('h2')?.textContent ?? '';
      });
    } else if (estado.fase === 'contagem') {
      anuncio.textContent = `Partida ${estado.numero} de ${TOTAL_PARTIDAS}: ${MAPAS[estado.mapa].nome}. Começa em ${CONTAGEM_S} segundos.`;
    } else if (estado.fase === 'jogo') {
      anuncio.textContent = !jogando ? 'A partida começou. Você está assistindo.' : morto ? 'Você explodiu.' : 'Valendo!';
    }
  }

  function montarAviso({ jogando, morto }) {
    // Rebuilding the card in the same phase (someone got ready, a robot was added) keeps where it was scrolled.
    const rolagem = faseDoAviso === estado.fase ? el.aviso.scrollTop : 0;
    faseDoAviso = estado.fase;
    refContagem = null;
    // First-time tips only while this device's player is in the match and alive.
    dicas.definirJogando(estado.fase === 'jogo' && jogando && !morto);
    let conteudo = [];
    let estilo = 'cartao';
    const tela = contextoDaTela();
    let cartao = null;
    if (estado.fase === 'lobby') {
      cartao = telas.cartaoLobby(tela);
    } else if (estado.fase === 'contagem') {
      estilo = 'contagem';
      cartao = telas.cartaoContagem(tela, { jogando, segundos: CONTAGEM_S });
    } else if (estado.fase === 'jogo') {
      estilo = 'pilula';
      if (!jogando) conteudo = [h('p', {}, 'Assistindo · você entra na próxima rodada')];
      else if (morto) conteudo = [h('p', {}, 'Você explodiu! Agora é torcer.')];
    } else if (estado.fase === 'resultado') {
      cartao = telas.cartaoResultado(tela, { segundos: RESULTADO_S });
    } else {
      cartao = telas.cartaoFinal(tela, { segundos: FINAL_S });
    }
    if (cartao) {
      conteudo = cartao.conteudo;
      refContagem = cartao.contagem;
    }
    anunciar({ jogando, morto });
    conteudo = conteudo.filter(Boolean);
    const destino = estilo === 'cartao' ? el.raiz : el.arena;
    if (el.aviso.parentElement !== destino) destino.append(el.aviso);
    el.aviso.className = `pavio-aviso pavio-aviso--${estilo}`;
    el.aviso.hidden = conteudo.length === 0;
    el.aviso.replaceChildren(...(estilo === 'cartao' ? [h('div', { class: 'pavio-cartao' }, conteudo)] : conteudo));
    el.aviso.scrollTop = rolagem;
  }

  function atualizarAviso(vista, agoraMs) {
    const n = meuIndice();
    const jogando = n >= 0;
    const morto = jogando && vista?.j?.[n] ? !vista.j[n].v : false;
    const chave = `${estado.fase}|${jogando}|${morto}`;
    if (chave !== chaveAviso) {
      chaveAviso = chave;
      montarAviso({ jogando, morto });
    }
    if (!refContagem) return;
    const restante = Math.max(0, (estado.fimFaseEm - agoraMs) / 1000);
    const numero = Math.max(estado.fase === 'contagem' ? 1 : 0, Math.ceil(restante));
    const texto = String(numero);
    if (refContagem.textContent !== texto) {
      refContagem.textContent = texto;
      if (estado.fase === 'contagem') {
        refContagem.dataset.n = texto;
        reiniciarAnimacao(refContagem, 'pavio-numero--pop');
      }
    }
    if (estado.fase === 'contagem' && numero !== ultimaContagem) {
      ultimaContagem = numero;
      som.tocar('bip', { n: numero });
    }
  }

  function atualizarHud(vista) {
    if (!vista || estado.fase === 'lobby') {
      hud.atualizar(null);
      return;
    }
    const n = meuIndice();
    const eu = vista.j[n];
    let total = null;
    if (n >= 0) {
      const placar = { ...ZERO, ...estado.placar[sala.meuId] };
      const aoVivo = estado.fase === 'contagem' || estado.fase === 'jogo';
      total = pontosDe(placar) + (aoVivo && eu ? (eu.cx ?? 0) * PONTOS.caixa + (eu.el ?? 0) * PONTOS.eliminacao : 0);
    }
    el.dicaGelo.hidden = !(eu?.v && eu.gl > 0);
    hud.atualizar({ jogador: eu, pontos: total, paraSubita: (vista.ms ?? 120) - (Number(vista.tm) || 0), fase: estado.fase, qualidade: pintor.qualidade });
  }


  function jogadoresDoLobby() {
    return [...sala.membrosOrdenados(), ...estado.robos].slice(0, MAX_JOGADORES).map((jogador, n) => ({
      x: SPAWNS[n][0],
      y: SPAWNS[n][1],
      v: 1,
      o: DIRECAO.BAIXO,
      a: 0,
      cor: estado.cores[jogador.id] ?? n,
      nome: jogador.nome,
      eu: jogador.id === sala.meuId,
      pronto: jogador.nivel !== undefined || estado.prontos.includes(jogador.id),
    }));
  }

  // Who celebrates on the arena behind the results: the match winner, then the round champions.
  function festejando() {
    if (estado.fase === 'resultado') return new Set([estado.resultado?.vencedor]);
    if (estado.fase === 'final' && estado.escalacao.length > 1) return new Set(campeoes(estado).map(linha => linha.id));
    return null;
  }

  function quadro() {
    if (destruido) return;
    quadroId = requestAnimationFrame(quadro);
    const agoraMs = performance.now();
    const dt = Math.min(0.05, Math.max(0, (agoraMs - ultimoQuadro) / 1000));
    ultimoQuadro = agoraMs;
    controles.atualizar();
    if (!sala.souAnfitriao) bombasVisiveis = preverBombas(agoraMs);
    passoLocal(dt, agoraMs);
    enviarPosicao(agoraMs);
    if (agoraMs - ultimoDesenho < QUADRO_MIN_MS) return;
    const dtDesenho = (agoraMs - ultimoDesenho) / 1000;
    ultimoDesenho = agoraMs;

    let vista = null;
    if (estado.fase !== 'lobby') vista = sala.souAnfitriao ? (partida ? vistaDoAnfitriao(dtDesenho) : null) : vistaDoMembro();
    const festa = festejando();
    const jogadores = vista
      ? vista.j.map((jogador, n) => {
        const info = estado.escalacao[n];
        return { ...jogador, cor: info?.cor ?? n, nome: info?.nome ?? '…', eu: info?.id === sala.meuId, festa: Boolean(festa?.has(info?.id)) };
      })
      : jogadoresDoLobby();
    const agora = agoraMs / 1000;
    for (let k = efeitos.length - 1; k >= 0; k--) if (!efeitoAtivo(efeitos[k], agora)) efeitos.splice(k, 1);
    const mapa = vista ? estado.mapa : 0;
    pintor.desenhar({
      g: vista?.g ?? GRADE_LOBBY,
      muros: murosDaPartida(mapa, estado.idPartida),
      chaveMuros: `${mapa}:${estado.idPartida}`,
      tema: vista ? MAPAS[mapa].tema : 'padrao',
      j: jogadores,
      b: vista?.b ?? [],
      c: vista?.c ?? [],
      iv: vista?.iv ?? [],
      gl: vista?.gl ?? [],
      agora,
      efeitos,
      fase: estado.fase,
      contagem: estado.fase === 'contagem',
      subita: estado.fase === 'jogo' && Boolean(vista) && (Number(vista.tm) || 0) >= (vista.ms ?? 120),
    });
    atualizarHud(vista);
    atualizarAviso(vista, agoraMs);
  }

  if (sala.souAnfitriao) {
    atribuirCores();
    informar();
  } else {
    sala.enviarAoAnfitriao({ t: 'pedirEstado' });
  }
  controles.definirModo({ jogando: false, toqueVisivel: toqueDisponivel });
  som.musica(MUSICA_DA_FASE[estado.fase], { tema: 'padrao' });
  const relogio = sala.souAnfitriao ? criarPassoFixo(HZ_SIMULACAO, passoAnfitriao) : null;
  ajustarArena();
  quadro();

  return {
    // Read-only copy of the game state for the end-to-end tests; app.js exposes it only with ?teste=1.
    espiar() {
      const vista = estado.fase === 'lobby' ? null : sala.souAnfitriao ? partida?.vista() ?? null : vistaDoMembro();
      return JSON.parse(JSON.stringify({ ...estado, vista, local: sala.souAnfitriao ? null : local }));
    },
    destruir() {
      destruido = true;
      dicas.destruir();
      som.musica(null);
      cancelAnimationFrame(quadroId);
      clearTimeout(timerFaixa);
      relogio?.parar();
      observador.disconnect();
      controles.destruir();
      for (const desligarOuvinte of desligar) desligarOuvinte();
      palco.replaceChildren();
    },
  };
}
