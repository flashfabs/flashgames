// Pavio: round flow (lobby with ready checks, a series of matches, results), networking and frame loop.
// The host runs the rules and streams snapshots; each member moves its own character locally (no input
// delay), reports the position, and renders everyone else slightly in the past, blended between snapshots.

import {
  Partida, MAX_JOGADORES, DIRECAO, SPAWNS, MAPAS, PONTOS, COLUNAS, LINHAS, PAREDE, CAIXA,
  indice, gradeVazia, moverComColisao, sobrepoe,
} from './regras.js';
import { criarPintor, efeitoAtivo, CORES, VISUAL_ITEM, DESCRICAO_ITEM } from './desenho.js';
import { criarControles, temToque } from './controles.js';
import { criarPassoFixo } from '../relogio.js';

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
const QUADRO_MIN_MS = 15; // caps drawing near 60 fps on 120 Hz screens
const CONTAGEM_S = 3;
const RESULTADO_S = 7;
const FINAL_S = 15;
const MAX_EFEITOS = 60;
const FASES = new Set(['lobby', 'contagem', 'jogo', 'resultado', 'final']);
const TOTAL_PARTIDAS = MAPAS.length;
const MUROS = MAPAS.map(mapa => new Set(mapa.muros.map(([x, y]) => indice(x, y))));
const GRADE_LOBBY = gradeVazia().join('');
const BITS = { v: 1, a: 2, e: 4, i: 8, g: 16, p: 32 };
const ZERO = Object.freeze({ vitorias: 0, caixas: 0, eliminacoes: 0 });

function h(tag, atributos = {}, ...filhos) {
  const elemento = document.createElement(tag);
  for (const [chave, valor] of Object.entries(atributos)) {
    if (chave === 'class') elemento.className = valor;
    else if (chave.startsWith('on')) elemento.addEventListener(chave.slice(2), valor);
    else if (valor !== false && valor != null) elemento.setAttribute(chave, valor === true ? '' : valor);
  }
  elemento.append(...filhos.flat().filter(filho => filho != null && filho !== false));
  return elemento;
}

function embaralhar(lista) {
  for (let i = lista.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }
  return lista;
}

function formatarTempo(segundos) {
  const total = Math.max(0, Math.ceil(segundos));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function pontosDe(placar = ZERO) {
  return placar.caixas * PONTOS.caixa + placar.eliminacoes * PONTOS.eliminacao + placar.vitorias * PONTOS.vitoria;
}

function compactarJogador(j) {
  let marcas = 0;
  for (const [chave, bit] of Object.entries(BITS)) if (j[chave]) marcas |= bit;
  return [j.x, j.y, marcas, j.o, j.b, j.f, j.t, j.cx, j.el];
}

function expandirJogador(dados) {
  const [x, y, marcas, o, b, f, t, cx, el] = Array.isArray(dados) ? dados : [];
  const jogador = { x: Number(x) || 0, y: Number(y) || 0, o, b, f, t, cx: cx ?? 0, el: el ?? 0 };
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
  };
  el.arena = h('div', { class: 'pavio-arena' }, el.canvas, el.faixa, el.aviso);
  el.toque = h('div', { class: 'pavio-toque', hidden: true, 'aria-hidden': 'true' }, el.base, el.manete, el.dicaBomba);
  el.hud.append(el.hudItens, el.hudPontos, el.hudTempo);
  palco.replaceChildren(h('div', { class: 'pavio' }, el.hud, el.arena, el.toque));
  return el;
}

function legendaControles(toque) {
  if (toque) {
    return h('div', { class: 'pavio-legenda' },
      h('p', {}, 'Arraste o dedo no lado esquerdo da tela para andar e toque no lado direito para soltar bomba.'),
      h('p', {}, 'Teclado e controle de videogame também funcionam.'),
    );
  }
  return h('div', { class: 'pavio-legenda' },
    h('p', {}, h('kbd', {}, 'WASD'), ' ou ', h('kbd', {}, 'setas'), ' andam · ', h('kbd', {}, 'Espaço'), ' solta bomba · controle de videogame também funciona'),
    h('p', {}, 'Segurando duas direções, você segue numa e vira na outra assim que der.'),
  );
}

function linhaPoder(item) {
  if (!item) return null;
  return h('p', { class: 'pavio-poder' }, 'Poder novo: ', h('strong', {}, `${VISUAL_ITEM[item].emoji} ${VISUAL_ITEM[item].nome}`), ` · ${DESCRICAO_ITEM[item]}`);
}

export function criarPavio({ sala, palco, som, aoMudarInfo }) {
  const el = montarPalco(palco);
  const pintor = criarPintor(el.canvas);
  const toqueDisponivel = temToque();
  const estado = {
    fase: 'lobby',
    idPartida: 0,
    numero: 0, // match number inside the round, 1-based
    mapa: 0,
    escalacao: [], // [{ id, nome, slot, cor }] of the current round
    cores: {},
    prontos: [],
    placar: {}, // id -> { vitorias, caixas, eliminacoes } of the current round
    resultado: null,
    motivo: null,
    fimFaseEm: 0,
  };

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

  // Members only.
  let retratos = [];
  let ultimoRetrato = null;
  let gradeAtual = { gv: -1, g: GRADE_LOBBY };
  const atrasos = [];
  let menorAtraso = 0;
  let atrasoInterpolacao = 100;
  const eventosVistos = new Set();
  const local = { ativo: false, x: 0, y: 0, olhar: DIRECAO.BAIXO, andando: false, tenis: 0, vivo: false, fantasma: false };
  let historico = [];
  let divergenteDesde = 0;
  let ultimoEnvioPosicao = 0;
  let ultimaPosicaoEnviada = '';

  // Everyone.
  let entrada = { d: DIRECAO.NENHUMA, d2: DIRECAO.NENHUMA };
  const efeitos = [];
  let tremor = 0;
  let chaveAviso = '';
  let refContagem = null;
  let ultimaContagem = null;
  let ultimoHud = '';
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
    aoEntrada: nova => {
      entrada = nova;
      som.destravar();
      if (sala.souAnfitriao) partida?.definirEntrada(sala.meuId, nova.d, nova.d2);
    },
    aoBomba: () => {
      som.destravar();
      soltarBomba();
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
  ];

  function ajustarArena() {
    const largura = palco.clientWidth;
    const altura = palco.clientHeight - el.hud.offsetHeight - 8;
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
    const presentes = new Set(sala.membros.keys());
    for (const id of Object.keys(estado.cores)) if (!presentes.has(id)) delete estado.cores[id];
    const usadas = new Set(Object.values(estado.cores));
    for (const membro of sala.membrosOrdenados()) {
      if (estado.cores[membro.id] !== undefined) continue;
      let cor = 0;
      while (usadas.has(cor)) cor++;
      estado.cores[membro.id] = cor;
      usadas.add(cor);
    }
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
      placar: estado.placar,
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
      case 'pedirEstado':
        if (de !== sala.meuId) publicarEstado(de);
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
    estado.escalacao = membros.map(membro => ({ id: membro.id, nome: membro.nome, slot: 0, cor: estado.cores[membro.id] }));
    estado.placar = Object.fromEntries(membros.map(membro => [membro.id, { ...ZERO }]));
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
    partida = new Partida(
      estado.escalacao.map(({ id, slot }) => ({ id, slot, remoto: id !== sala.meuId })),
      { mapa: MAPAS[estado.mapa] },
    );
    partida.definirEntrada(sala.meuId, entrada.d, entrada.d2);
    eventosPendentes = [];
    ultimaVersaoGrade = -1;
    suavizados.clear();
    passosDesdeRetrato = PASSOS_POR_RETRATO;
    mudarFase('contagem', CONTAGEM_S);
  }

  function somarEstatisticas(vencedor) {
    for (const { id, caixas, eliminacoes } of partida.estatisticas()) {
      const placar = estado.placar[id];
      if (!placar) continue;
      placar.caixas += caixas;
      placar.eliminacoes += eliminacoes;
      if (id === vencedor) placar.vitorias += 1;
    }
  }

  function encerrarPartida(resultado) {
    estado.resultado = resultado;
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
      if (estado.escalacao[n]?.id === sala.meuId) return jogador;
      const suave = suavizados.get(n);
      if (!suave || Math.abs(suave.x - jogador.x) + Math.abs(suave.y - jogador.y) > 2) {
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
    estado.placar = mensagem.placar && typeof mensagem.placar === 'object' ? mensagem.placar : {};
    estado.resultado = mensagem.resultado ?? null;
    estado.motivo = typeof mensagem.motivo === 'string' ? mensagem.motivo : null;
    estado.fimFaseEm = performance.now() + (Number(mensagem.restante) || 0) * 1000;
    if (estado.idPartida !== partidaAnterior) prepararPartidaLocal();
    if (estado.fase !== anterior) aoEntrarNaFase(estado.fase, anterior);
    chaveAviso = '';
    informar();
  }

  function prepararPartidaLocal() {
    retratos = [];
    ultimoRetrato = null;
    gradeAtual = { gv: -1, g: GRADE_LOBBY };
    historico = [];
    divergenteDesde = 0;
    const eu = estado.escalacao.find(item => item.id === sala.meuId);
    local.ativo = Boolean(eu) && estado.fase !== 'lobby';
    if (!eu) return;
    const [x, y] = SPAWNS[eu.slot] ?? SPAWNS[0];
    Object.assign(local, { x, y, olhar: DIRECAO.BAIXO, andando: false, tenis: 0, vivo: true, fantasma: false });
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
      j: mensagem.j.map(expandirJogador),
      b: mensagem.b,
      c: mensagem.c,
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
    if (x < 0 || y < 0 || x >= COLUNAS || y >= LINHAS) return true;
    const celula = gradeAtual.g[indice(x, y)];
    if (celula === PAREDE) return true;
    if (local.fantasma) return false;
    if (celula === CAIXA) return true;
    return (ultimoRetrato?.b ?? []).some(([bx, by]) => bx === x && by === y && !sobrepoe(local, bx, by));
  }

  function passoLocal(dt, agora) {
    if (sala.souAnfitriao || estado.fase !== 'jogo' || !local.ativo || !local.vivo || !sala.conectada) {
      local.andando = false;
      return;
    }
    moverComColisao(local, entrada, dt, bloqueiaLocal);
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
    // Grid, bombs and flames come from the newest snapshot: they matter more than smoothness.
    return { g: gradeAtual.g, j: jogadores, b: ultimoRetrato.b, c: ultimoRetrato.c, tm: ultimoRetrato.tm, ms: ultimoRetrato.ms };
  }

  // ---- Shared ----

  function aoEntrarNaFase(fase) {
    chaveAviso = '';
    controles.definirModo({ jogando: (fase === 'contagem' || fase === 'jogo') && meuIndice() >= 0, toqueVisivel: toqueDisponivel });
    if (fase === 'contagem') {
      efeitos.length = 0;
      ultimaContagem = null;
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    } else if (fase === 'jogo') {
      som.tocar('vai');
    } else if (fase === 'resultado') {
      som.tocar(estado.resultado?.vencedor === sala.meuId ? 'vitoria' : 'fim');
    } else if (fase === 'final') {
      som.tocar(campeoes()[0]?.id === sala.meuId ? 'vitoria' : 'fim');
    } else {
      efeitos.length = 0;
      local.ativo = false;
    }
  }

  function tratarEventos(eventos) {
    const agora = performance.now() / 1000;
    const eu = meuIndice();
    let explosoes = 0;
    let blocos = 0;
    for (const evento of eventos) {
      switch (evento?.e) {
        case 'bum':
          explosoes++;
          break;
        case 'bomba':
          som.tocar('bomba');
          break;
        case 'caixa':
          if (evento.j === eu) efeitos.push({ tipo: 'ponto', texto: `+${PONTOS.caixa}`, x: evento.x, y: evento.y, inicio: agora });
          break;
        case 'item':
          som.tocar('item');
          efeitos.push({ tipo: 'item', x: evento.x, y: evento.y, item: evento.item, inicio: agora });
          break;
        case 'escudo':
          som.tocar('escudo');
          efeitos.push({ tipo: 'escudo', x: evento.x, y: evento.y, inicio: agora });
          break;
        case 'morte':
          som.tocar('morte');
          efeitos.push({ tipo: 'morte', x: evento.x, y: evento.y, cor: estado.escalacao[evento.j]?.cor ?? 0, inicio: agora });
          break;
        case 'subita':
          som.tocar('alarme');
          mostrarFaixa('Morte súbita! A arena está fechando.');
          break;
        case 'bloco':
          blocos++;
          break;
        default:
          break;
      }
    }
    if (explosoes) {
      som.tocar('bum');
      tremor = Math.min(tremor + 3 + explosoes, 7);
    }
    if (blocos) som.tocar('bloco');
    if (efeitos.length > MAX_EFEITOS) efeitos.splice(0, efeitos.length - MAX_EFEITOS);
  }

  function mostrarFaixa(texto) {
    el.faixa.textContent = texto;
    el.faixa.hidden = false;
    clearTimeout(timerFaixa);
    timerFaixa = setTimeout(() => {
      el.faixa.hidden = true;
    }, 3500);
  }

  function linhasDoPlacar() {
    return estado.escalacao
      .map(item => {
        const placar = { ...ZERO, ...estado.placar[item.id] };
        return { ...item, ...placar, pontos: pontosDe(placar) };
      })
      .sort((a, b) => b.pontos - a.pontos || b.vitorias - a.vitorias);
  }

  function campeoes() {
    const linhas = linhasDoPlacar();
    if (!linhas.length) return [];
    return linhas.filter(linha => linha.pontos === linhas[0].pontos && linha.vitorias === linhas[0].vitorias);
  }

  function informar() {
    const pontos = Object.fromEntries(Object.entries(estado.placar).map(([id, placar]) => [id, pontosDe({ ...ZERO, ...placar })]));
    aoMudarInfo?.({ fase: estado.fase, cores: estado.cores, prontos: estado.prontos, pontos, escalacao: estado.escalacao });
  }

  function tabelaPlacar() {
    const linhas = linhasDoPlacar();
    return h('table', { class: 'pavio-placar' },
      h('thead', {}, h('tr', {},
        h('th', {}, '#'), h('th', { class: 'pavio-placar-nome' }, 'Jogador'),
        h('th', { title: 'Partidas vencidas' }, '🏆'), h('th', { title: 'Caixas destruídas' }, '📦'),
        h('th', { title: 'Eliminações' }, '💀'), h('th', { title: 'Pontos' }, '⭐'),
      )),
      h('tbody', {}, linhas.map((linha, posicao) => {
        const cor = h('span', { class: 'pavio-placar-cor' });
        cor.style.setProperty('--cor', (CORES[linha.cor] ?? CORES[0]).base);
        return h('tr', { class: linha.id === sala.meuId ? 'pavio-placar-eu' : '' },
          h('td', {}, String(posicao + 1)),
          h('td', { class: 'pavio-placar-nome' }, cor, linha.nome),
          h('td', {}, String(linha.vitorias)),
          h('td', {}, String(linha.caixas)),
          h('td', {}, String(linha.eliminacoes)),
          h('td', { class: 'pavio-placar-pontos' }, String(linha.pontos)),
        );
      })),
    );
  }

  function legendaPontos() {
    return h('p', { class: 'pavio-regra-pontos' },
      `Caixa destruída = ${PONTOS.caixa} ponto · eliminação = ${PONTOS.eliminacao} · partida vencida = ${PONTOS.vitoria}`);
  }

  function cartaoLobby() {
    const membros = sala.membrosOrdenados();
    const prontos = new Set(estado.prontos);
    const estouPronto = prontos.has(sala.meuId);
    const faltam = membros.filter(membro => !prontos.has(membro.id)).length;
    const lista = h('ul', { class: 'pavio-prontos' }, membros.map(membro => {
      const cor = h('span', { class: 'pavio-placar-cor' });
      cor.style.setProperty('--cor', (CORES[estado.cores[membro.id]] ?? CORES[0]).base);
      return h('li', { class: prontos.has(membro.id) ? 'pronto' : '' },
        cor, h('span', { class: 'pavio-prontos-nome' }, membro.nome),
        h('span', { class: 'pavio-prontos-estado' }, prontos.has(membro.id) ? '✅ pronto' : '⏳ esperando'));
    }));
    let situacao = 'Todo mundo pronto!';
    if (faltam) situacao = faltam === 1 && !estouPronto ? 'Só falta você.' : `Esperando ${faltam} ${faltam === 1 ? 'pessoa ficar pronta' : 'pessoas ficarem prontas'}.`;
    return [
      h('h2', {}, 'Pavio'),
      h('p', {}, `Rodada de ${TOTAL_PARTIDAS} partidas: cada uma num mapa mais fechado e com um poder novo.`),
      lista,
      h('button', {
        class: estouPronto ? 'botao botao--secundario' : 'botao botao--grande',
        type: 'button',
        onclick: () => sala.enviarAoAnfitriao({ t: 'pronto', v: !estouPronto }),
      }, estouPronto ? 'Cancelar pronto' : 'Estou pronto'),
      h('p', { class: 'pavio-dica' }, membros.length > 1 ? situacao : 'Mande o link lá de cima pra galera. Sozinho vira treino.'),
      legendaControles(toqueDisponivel),
    ];
  }

  function cartaoContagem(jogando) {
    const mapa = MAPAS[estado.mapa];
    refContagem = h('div', { class: 'pavio-numero' }, String(CONTAGEM_S));
    return [
      h('p', { class: 'pavio-sobretitulo' }, `Partida ${estado.numero} de ${TOTAL_PARTIDAS} · ${mapa.nome}`),
      h('p', {}, mapa.descricao),
      linhaPoder(mapa.novo),
      refContagem,
      !jogando && h('p', { class: 'pavio-pilula' }, 'Você entra na próxima rodada.'),
    ];
  }

  function cartaoResultado() {
    const vencedor = estado.resultado?.vencedor ?? null;
    let titulo = estado.escalacao.length > 1 ? 'Empate! Ninguém sobrou.' : 'Fim da partida';
    if (vencedor === sala.meuId) titulo = 'Você venceu a partida! 🏆';
    else if (vencedor) titulo = `${estado.escalacao.find(item => item.id === vencedor)?.nome ?? 'Alguém'} venceu a partida! 🏆`;
    const proximo = MAPAS[Math.min(estado.numero, TOTAL_PARTIDAS - 1)];
    refContagem = h('strong', {}, String(RESULTADO_S));
    return [
      h('p', { class: 'pavio-sobretitulo' }, `Partida ${estado.numero} de ${TOTAL_PARTIDAS}`),
      h('h2', {}, titulo),
      tabelaPlacar(),
      legendaPontos(),
      h('p', {}, `Próxima: ${proximo.nome}`, proximo.novo ? ` · poder novo ${VISUAL_ITEM[proximo.novo].emoji} ${VISUAL_ITEM[proximo.novo].nome}` : '', ' · começa em ', refContagem, ' s'),
    ];
  }

  function cartaoFinal() {
    const topo = campeoes();
    let titulo = 'Fim do treino';
    if (estado.escalacao.length > 1 && topo.length === 1) {
      titulo = topo[0].id === sala.meuId ? 'Você é o campeão da rodada! 🏆' : `${topo[0].nome} é o campeão da rodada! 🏆`;
    } else if (estado.escalacao.length > 1) {
      titulo = `Empate entre ${topo.map(linha => linha.nome).join(' e ')}`;
    }
    refContagem = h('strong', {}, String(FINAL_S));
    return [
      h('p', { class: 'pavio-sobretitulo' }, estado.motivo ? 'Rodada interrompida' : 'Fim da rodada'),
      estado.motivo && h('p', { class: 'pavio-motivo' }, estado.motivo),
      h('h2', {}, titulo),
      tabelaPlacar(),
      legendaPontos(),
      h('p', {}, 'Voltando ao lobby em ', refContagem, ' s'),
      sala.souAnfitriao && h('button', { class: 'botao botao--secundario', type: 'button', onclick: () => voltarAoLobby() }, 'Voltar ao lobby agora'),
    ];
  }

  function montarAviso({ jogando, morto }) {
    refContagem = null;
    let conteudo = [];
    let estilo = 'cartao';
    if (estado.fase === 'lobby') {
      conteudo = cartaoLobby();
    } else if (estado.fase === 'contagem') {
      estilo = 'contagem';
      conteudo = cartaoContagem(jogando);
    } else if (estado.fase === 'jogo') {
      estilo = 'pilula';
      if (!jogando) conteudo = [h('p', {}, 'Assistindo · você entra na próxima rodada')];
      else if (morto) conteudo = [h('p', {}, 'Você explodiu! Agora é torcer.')];
    } else if (estado.fase === 'resultado') {
      conteudo = cartaoResultado();
    } else {
      conteudo = cartaoFinal();
    }
    conteudo = conteudo.filter(Boolean);
    el.aviso.className = `pavio-aviso pavio-aviso--${estilo}`;
    el.aviso.hidden = conteudo.length === 0;
    el.aviso.replaceChildren(...conteudo);
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
    if (refContagem.textContent !== texto) refContagem.textContent = texto;
    if (estado.fase === 'contagem' && numero !== ultimaContagem) {
      ultimaContagem = numero;
      som.tocar('bip');
    }
  }

  function atualizarHud(vista) {
    const mostrar = Boolean(vista) && estado.fase !== 'lobby';
    el.hud.style.visibility = mostrar ? 'visible' : 'hidden';
    if (!mostrar) return;
    const n = meuIndice();
    const eu = vista.j[n];
    const paraSubita = (vista.ms ?? 120) - (Number(vista.tm) || 0);
    const tempo = paraSubita > 0 ? `⏱ ${formatarTempo(paraSubita)}` : '☠ Morte súbita';
    let pontos = '';
    if (n >= 0) {
      const placar = { ...ZERO, ...estado.placar[sala.meuId] };
      const aoVivo = estado.fase === 'contagem' || estado.fase === 'jogo';
      const total = pontosDe(placar) + (aoVivo && eu ? (eu.cx ?? 0) * PONTOS.caixa + (eu.el ?? 0) * PONTOS.eliminacao : 0);
      pontos = `⭐ ${total}`;
    }
    const itens = eu
      ? [`💣 ${eu.b}`, `🔥 ${eu.f}`, `👟 ${eu.t}`, eu.e && '🛡️', eu.p && '💥', eu.g && '👻'].filter(Boolean).join('   ')
      : '';
    const chave = `${itens}|${pontos}|${tempo}`;
    if (chave === ultimoHud) return;
    ultimoHud = chave;
    el.hudItens.textContent = itens;
    el.hudPontos.textContent = pontos;
    el.hudTempo.textContent = tempo;
    el.hudTempo.classList.toggle('pavio-hud-tempo--subita', paraSubita <= 0);
  }

  function jogadoresDoLobby() {
    return sala.membrosOrdenados().slice(0, MAX_JOGADORES).map((membro, n) => ({
      x: SPAWNS[n][0],
      y: SPAWNS[n][1],
      v: 1,
      o: DIRECAO.BAIXO,
      a: 0,
      cor: estado.cores[membro.id] ?? n,
      nome: membro.nome,
      eu: membro.id === sala.meuId,
    }));
  }

  function quadro() {
    if (destruido) return;
    quadroId = requestAnimationFrame(quadro);
    const agoraMs = performance.now();
    const dt = Math.min(0.05, Math.max(0, (agoraMs - ultimoQuadro) / 1000));
    ultimoQuadro = agoraMs;
    controles.atualizar();
    passoLocal(dt, agoraMs);
    enviarPosicao(agoraMs);
    if (agoraMs - ultimoDesenho < QUADRO_MIN_MS) return;
    const dtDesenho = (agoraMs - ultimoDesenho) / 1000;
    ultimoDesenho = agoraMs;

    let vista = null;
    if (estado.fase !== 'lobby') vista = sala.souAnfitriao ? (partida ? vistaDoAnfitriao(dtDesenho) : null) : vistaDoMembro();
    const jogadores = vista
      ? vista.j.map((jogador, n) => {
        const info = estado.escalacao[n];
        return { ...jogador, cor: info?.cor ?? n, nome: info?.nome ?? '…', eu: info?.id === sala.meuId };
      })
      : jogadoresDoLobby();
    const agora = agoraMs / 1000;
    tremor *= 0.85;
    for (let k = efeitos.length - 1; k >= 0; k--) if (!efeitoAtivo(efeitos[k], agora)) efeitos.splice(k, 1);
    const mapa = vista ? estado.mapa : 0;
    pintor.desenhar({
      g: vista?.g ?? GRADE_LOBBY,
      muros: MUROS[mapa],
      chaveMuros: mapa,
      j: jogadores,
      b: vista?.b ?? [],
      c: vista?.c ?? [],
      agora,
      efeitos,
      tremor: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : tremor,
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
  const relogio = sala.souAnfitriao ? criarPassoFixo(HZ_SIMULACAO, passoAnfitriao) : null;
  ajustarArena();
  quadro();

  return {
    destruir() {
      destruido = true;
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
