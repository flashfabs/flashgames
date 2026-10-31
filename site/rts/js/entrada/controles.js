// Mouse, trackpad and keyboard on the battlefield: selection (click, box, Shift, double click by kind), orders (context
// click, A, M or R and a click, S, H, Shift for the queue), the command card (Q W E R A S D F), placing buildings,
// rally points, control groups, camera (screen edges, arrows, middle button or Space and drag, two-finger scroll) and
// the three zoom levels (wheel, pinch, + and −).
// The on-screen buttons call executar() and executarSlot(), so every command works without the keyboard.
import { FP, SEM_ENTIDADE, DONO_NEUTRO } from '../sim/contratos.js';
import { HABILIDADE } from '../interface/catalogo.js';
import { ACAO, ACOES_COM_ALVO, SETAS, E_MAC, acaoDaTecla, modificadores } from './teclas.js';
import { idsNaCaixa, entidadeNoPonto, mesmoTipoNaTela, aplicarSelecao, podarSelecao, ARRASTO_MINIMO } from './selecao.js';
import { paraMundo, paraTela } from './camera.js';
import { TECLAS_DA_GRADE } from '../interface/cartao.js';

/** Client pixels from the window edge where the camera scrolls. */
const BORDA_PX = 8;
/** Camera speed in cells per second at the default zoom; it scales so the screen speed is the same at every level. */
const VELOCIDADE_CAMERA = 26;
const DUPLO_CLIQUE_MS = 350;
// A mouse wheel notch comes as a lone event with a big deltaY (or in lines); a trackpad scroll as a stream of small
// pixel deltas. A burst keeps the kind of its first event.
const ROLAGEM_GRANDE = 40;
const SILENCIO_ANTES_DA_RODA_MS = 80;
const FIM_DA_RAJADA_MS = 200;
const PAUSA_ENTRE_PASSOS_DA_RODA_MS = 120;
/** Shift on a training button queues this many at once. */
const LOTE_COM_SHIFT = 5;
/** Placing a building is a mode of its own, next to the order modes of ACOES_COM_ALVO; so is aiming an ability. */
const MODO_COLOCAR = 'colocar';
const MODO_HABILIDADE = 'habilidade';

export function ligarControles({
  canvas,
  palco,
  caixaSelecao,
  camera,
  estado,
  selecionadas,
  indice,
  zoom,
  grupos,
  ordens,
  som,
  latencia,
  simulacao,
  visivel,
  catalogo,
  cartao,
  colocacao,
  acoes = {},
  bloqueado = () => false,
  roda = 'auto',
  aoMudar = () => {},
}) {
  const setas = new Set();
  let espaco = false;
  let arrasto = null;
  let modo = null; // ACAO.ATACAR_MOVENDO, MOVER or PATRULHAR waiting for a click, MODO_COLOCAR or MODO_HABILIDADE
  let armada = null; // the ability waiting for its target: { habilidade, unidades }
  let modoComFila = false;
  let ultimoClique = null;
  let pausado = false;
  let gestoAte = -Infinity;
  // how the latest command was given, for the playtest log (C15)
  let origem = 'mouse';
  const rolagem = { ultima: -Infinity, ehRoda: false, ultimoPasso: -Infinity };
  const ponteiro = { x: -1, y: -1, dentro: false };
  const tmp = { x: 0, y: 0 };

  const cat = () => catalogo();
  /** Own units in the selection: the ones orders go to (buildings never walk). */
  const unidades = () => [...selecionadas].filter(id => cat().ehUnidade(indice.tipo(id)));
  const predios = () => [...selecionadas].filter(id => cat().ehPredio(indice.tipo(id)));
  const ponto = (clienteX, clienteY) => paraMundo(canvas, camera, clienteX, clienteY, { x: 0, y: 0 });
  const projetar = (retrato, k, saida) => paraTela(canvas, camera, retrato.x[k] / FP, retrato.y[k] / FP, saida);
  const centroDaTela = () => {
    const r = canvas.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  };
  const origemDoPonteiro = e => (e.pointerType === 'touch' ? 'toque' : 'mouse');

  function avisar() {
    palco.dataset.modo = modo ?? '';
    aoMudar();
  }

  // ---------- selection ----------

  function terminarCaixa(e) {
    const { x0, y0 } = arrasto;
    arrasto = null;
    caixaSelecao.hidden = true;
    const atual = estado.atual;
    if (!atual) return;
    const jogador = estado.jogadorLocal;
    if (Math.abs(e.clientX - x0) + Math.abs(e.clientY - y0) < ARRASTO_MINIMO) {
      const k = entidadeNoPonto(atual, projetar, e.clientX, e.clientY, j => atual.dono[j] === jogador);
      // With nothing of the player's there, a visible resource pile is picked alone, to read what is left in it.
      const recurso = k < 0 ? entidadeNoPonto(atual, projetar, e.clientX, e.clientY, j => cat().ehRecurso(atual.tipo[j]) && visivel(atual.x[j] / FP, atual.y[j] / FP)) : -1;
      if (recurso >= 0) {
        aplicarSelecao(selecionadas, [atual.id[recurso]], 'trocar');
        ultimoClique = null;
      } else if (k < 0) {
        if (!e.shiftKey) selecionadas.clear();
        ultimoClique = null;
      } else {
        const duplo = ultimoClique && e.timeStamp - ultimoClique.quando <= DUPLO_CLIQUE_MS && ultimoClique.tipo === atual.tipo[k];
        if (duplo) {
          const r = canvas.getBoundingClientRect();
          aplicarSelecao(selecionadas, mesmoTipoNaTela(atual, jogador, atual.tipo[k], projetar, { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }), e.shiftKey ? 'somar' : 'trocar');
        } else {
          aplicarSelecao(selecionadas, [atual.id[k]], e.shiftKey ? 'alternar' : 'trocar');
        }
        // Further quick clicks on the same kind keep the whole kind selected instead of falling back to one unit.
        ultimoClique = { quando: e.timeStamp, tipo: atual.tipo[k] };
      }
    } else {
      // A box takes units; buildings only when it caught no unit.
      const pegos = idsNaCaixa(atual, jogador, projetar, { x0, y0, x1: e.clientX, y1: e.clientY });
      const soUnidades = pegos.filter(id => cat().ehUnidade(indice.tipo(id)));
      aplicarSelecao(selecionadas, soUnidades.length ? soUnidades : pegos.filter(id => cat().ehPredio(indice.tipo(id))), e.shiftKey ? 'somar' : 'trocar');
      ultimoClique = null;
    }
    if (selecionadas.size) som.tocar('selecao');
    latencia.anotar(e.timeStamp, 'selecao');
    avisar();
  }

  function selecionarTudo() {
    const atual = estado.atual;
    if (!atual) return;
    selecionadas.clear();
    for (let k = 0; k < atual.n; k++) if (atual.dono[k] === estado.jogadorLocal && cat().ehUnidade(atual.tipo[k])) selecionadas.add(atual.id[k]);
  }

  // ---------- orders ----------

  /** What is under the pointer for a context order: a visible enemy, a resource node, or nothing. */
  function alvoSob(clienteX, clienteY) {
    const atual = estado.atual;
    if (!atual) return { inimigo: SEM_ENTIDADE, recurso: SEM_ENTIDADE, estrutura: SEM_ENTIDADE, qualquer: SEM_ENTIDADE };
    const jogador = estado.jogadorLocal;
    const ver = j => visivel(atual.x[j] / FP, atual.y[j] / FP);
    const recurso = entidadeNoPonto(atual, projetar, clienteX, clienteY, j => cat().ehRecurso(atual.tipo[j]) && ver(j));
    const estrutura = entidadeNoPonto(atual, projetar, clienteX, clienteY, j => cat().categoria(atual.tipo[j]) === 'estrutura' && ver(j));
    const inimigo = entidadeNoPonto(atual, projetar, clienteX, clienteY, j => atual.dono[j] !== jogador && atual.dono[j] !== DONO_NEUTRO && !cat().ehRecurso(atual.tipo[j]) && ver(j));
    const qualquer = entidadeNoPonto(atual, projetar, clienteX, clienteY, ver);
    const id = k => (k < 0 ? SEM_ENTIDADE : atual.id[k]);
    return { inimigo: id(inimigo), recurso: id(recurso), estrutura: id(estrutura), qualquer: id(qualquer) };
  }

  function entrarModo(acao) {
    if (unidades().length === 0) {
      som.tocar('recusa');
      return;
    }
    colocacao.terminar();
    modo = acao;
    modoComFila = false;
    avisar();
  }

  function cancelarModo() {
    if (modo === MODO_COLOCAR) colocacao.terminar();
    armada = null;
    modo = null;
    modoComFila = false;
    avisar();
  }

  function ordemComAlvo(e) {
    const acao = modo;
    ordens.comAlvo(acao, unidades(), ponto(e.clientX, e.clientY), alvoSob(e.clientX, e.clientY).inimigo, e.shiftKey, e.timeStamp);
    // With Shift held the mode stays, so every click adds a point to the queue until Shift is released.
    if (e.shiftKey) modoComFila = true;
    else cancelarModo();
  }

  function ordemDeContexto(e) {
    const ids = unidades();
    const noChao = ponto(e.clientX, e.clientY);
    const alvo = alvoSob(e.clientX, e.clientY);
    if (ids.length === 0) {
      // Buildings alone: a context click sets where their units gather.
      const deles = predios();
      if (deles.length) ordens.encontro(deles, noChao, alvo.qualquer, e.timeStamp);
      return;
    }
    // Units that bring structures back go to a neutral structure under the pointer; the others just move there.
    if (alvo.estrutura !== SEM_ENTIDADE) {
      const religam = ids.filter(id => cat().info(indice.tipo(id)).habilidade?.codigo === HABILIDADE.RELIGAR);
      if (religam.length) {
        ordens.habilidade(religam, HABILIDADE.RELIGAR, alvo.estrutura, noChao, e.shiftKey, e.timeStamp);
        const resto = ids.filter(id => !religam.includes(id));
        if (resto.length) ordens.deContexto(resto, noChao, SEM_ENTIDADE, e.shiftKey, e.timeStamp);
        return;
      }
    }
    if (alvo.recurso !== SEM_ENTIDADE && alvo.inimigo === SEM_ENTIDADE) {
      const coletores = ids.filter(id => cat().ehColetor(indice.tipo(id)));
      if (coletores.length) {
        ordens.coletar(coletores, alvo.recurso, noChao, e.shiftKey, e.timeStamp);
        const resto = ids.filter(id => !coletores.includes(id));
        if (resto.length) ordens.deContexto(resto, noChao, SEM_ENTIDADE, e.shiftKey, e.timeStamp);
        return;
      }
    }
    ordens.deContexto(ids, noChao, alvo.inimigo, e.shiftKey, e.timeStamp);
  }

  // ---------- placing buildings ----------

  /** Places a building of `tipo`: construtores is [the headquarters holding it ready] or the units raising it on site. */
  function comecarColocacao(tipo, construtores) {
    const [largura, altura] = cat().info(tipo).pegada;
    modo = MODO_COLOCAR;
    modoComFila = false;
    colocacao.comecar(tipo, construtores, largura, altura);
    if (ponteiro.dentro) {
      const { x, y } = ponto(ponteiro.x, ponteiro.y);
      colocacao.apontar(x, y);
    }
    avisar();
  }

  function colocar(e) {
    const { x, y } = ponto(e.clientX, e.clientY);
    colocacao.apontar(x, y);
    const atual = colocacao.estado;
    if (!atual.valido) {
      som.tocar('recusa');
      aoMudar(atual.motivo ?? 'posicao');
      return;
    }
    ordens.construir(atual.construtor, atual.tipo, atual.cx, atual.cy, e.shiftKey, e.timeStamp);
    // Shift keeps placing (poles in a row); the simulation decides whether another one is ready.
    if (e.shiftKey) modoComFila = true;
    else cancelarModo();
  }

  // ---------- abilities ----------

  /** The click that gives an aimed ability its target: a neutral structure or an enemy building under the pointer. */
  function usarHabilidade(e) {
    const { habilidade, unidades: deles } = armada;
    const alvo = alvoSob(e.clientX, e.clientY);
    const id = habilidade.alvo === 'estrutura' ? alvo.estrutura : alvo.inimigo !== SEM_ENTIDADE && cat().ehPredio(indice.tipo(alvo.inimigo)) ? alvo.inimigo : SEM_ENTIDADE;
    if (id === SEM_ENTIDADE) {
      som.tocar('recusa');
      return;
    }
    ordens.habilidade(deles, habilidade.codigo, id, ponto(e.clientX, e.clientY), e.shiftKey, e.timeStamp);
    if (e.shiftKey) modoComFila = true;
    else cancelarModo();
  }

  // ---------- groups ----------

  function chamarGrupo(grupo, quando) {
    const { ids: membros, centralizar } = grupos.chamar(grupo, quando, indice.existe);
    if (membros.length === 0) {
      som.tocar('recusa');
      return;
    }
    aplicarSelecao(selecionadas, membros, 'trocar');
    if (centralizar) {
      const centro = indice.centro(membros);
      if (centro) Object.assign(camera, { x: centro.x, y: centro.y });
    }
    som.tocar('selecao');
  }

  // ---------- actions shared by keys and buttons ----------

  function alternarPausa(valor = !pausado) {
    pausado = valor;
    simulacao.pausar(pausado);
  }

  /** Runs an action from a key or an on-screen button; timeStamp is the input event's. */
  function executar({ acao, grupo, fila = false }, timeStamp = performance.now()) {
    if (ACOES_COM_ALVO.has(acao)) entrarModo(acao);
    else if (acao === ACAO.PARAR) ordens.parar(unidades(), timeStamp);
    else if (acao === ACAO.SEGURAR) ordens.segurar(unidades(), timeStamp);
    else if (acao === ACAO.PAUSAR) alternarPausa();
    else if (acao === ACAO.CANCELAR) cancelarModo();
    else if (acao === ACAO.SELECIONAR_TUDO) selecionarTudo();
    else if (acao === ACAO.CHAMAR_GRUPO) chamarGrupo(grupo, timeStamp);
    else if (acao === ACAO.GUARDAR_GRUPO) grupos.guardar(grupo, [...selecionadas]);
    else if (acao === ACAO.SOMAR_GRUPO) grupos.somar(grupo, [...selecionadas]);
    else if (acao === ACAO.ZOOM_MAIS || acao === ACAO.ZOOM_MENOS) zoom.passo(acao === ACAO.ZOOM_MAIS ? 1 : -1, ...centroDaTela());
    else acoes[acao]?.(timeStamp);
    if (fila && ACOES_COM_ALVO.has(acao)) modoComFila = true;
    avisar();
  }

  /**
   * Runs a slot of the command card (interface/cartao.js): a unit order, training or research (Shift queues five),
   * queueing a building at the headquarters, placing the one that is ready, or raising one on site with units.
   */
  function executarSlot(slot, { fila = false } = {}, timeStamp = performance.now()) {
    if (!slot) return false;
    if (slot.acao) {
      executar({ acao: slot.acao, fila }, timeStamp);
      return true;
    }
    const { predios: deles, construtores } = cartao();
    if (slot.modo === 'posicionar') {
      comecarColocacao(slot.tipo, [deles[0]]);
      som.tocar('clique');
      return true;
    }
    if (slot.falta) {
      som.tocar('recusa');
      aoMudar(slot.falta);
      return true;
    }
    if (slot.modo === 'erguer') {
      comecarColocacao(slot.tipo, construtores);
      som.tocar('clique');
      return true;
    }
    if (slot.modo === 'habilidade') {
      // A toggle goes at once; an ability with a target waits for the click on it.
      if (slot.habilidade.alvo === null) {
        ordens.habilidade(slot.unidades, slot.habilidade.codigo, SEM_ENTIDADE, null, false, timeStamp);
      } else {
        colocacao.terminar();
        modo = MODO_HABILIDADE;
        modoComFila = false;
        armada = { habilidade: slot.habilidade, unidades: slot.unidades };
      }
      avisar();
      return true;
    }
    // The simulation gives each item to the listed building with the shortest queue.
    const quantos = fila && slot.modo !== 'construir' ? LOTE_COM_SHIFT : 1;
    if (slot.modo === 'pesquisar') ordens.pesquisar(deles, slot.pesquisa, timeStamp);
    else ordens.produzir(deles, slot.tipo, quantos, timeStamp);
    avisar();
    return true;
  }

  // ---------- pointer ----------

  canvas.addEventListener('contextmenu', e => e.preventDefault());

  canvas.addEventListener('pointerdown', e => {
    if (bloqueado()) return;
    canvas.focus({ preventScroll: true });
    origem = origemDoPonteiro(e);
    // Control and click is the Mac's right click; it is never used for anything else.
    const contexto = e.button === 2 || (E_MAC && e.button === 0 && e.ctrlKey);
    if (e.button === 1 || (e.button === 0 && espaco)) {
      e.preventDefault();
      arrasto = { pan: true, x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (contexto) {
      if (modo) cancelarModo();
      else ordemDeContexto(e);
      return;
    }
    if (e.button !== 0) return;
    if (modo === MODO_COLOCAR) {
      colocar(e);
      return;
    }
    if (modo === MODO_HABILIDADE) {
      usarHabilidade(e);
      return;
    }
    if (modo) {
      ordemComAlvo(e);
      return;
    }
    arrasto = { x0: e.clientX, y0: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', e => {
    if (modo === MODO_COLOCAR) {
      const { x, y } = ponto(e.clientX, e.clientY);
      colocacao.apontar(x, y);
    }
    if (!arrasto) return;
    if (arrasto.pan) {
      // The map point that was under the pointer follows it.
      const { x: antesX, y: antesY } = paraMundo(canvas, camera, arrasto.x, arrasto.y, tmp);
      const depois = paraMundo(canvas, camera, e.clientX, e.clientY, tmp);
      camera.x -= depois.x - antesX;
      camera.y -= depois.y - antesY;
      arrasto.x = e.clientX;
      arrasto.y = e.clientY;
      return;
    }
    const r = palco.getBoundingClientRect();
    Object.assign(caixaSelecao.style, {
      left: `${Math.min(arrasto.x0, e.clientX) - r.left}px`,
      top: `${Math.min(arrasto.y0, e.clientY) - r.top}px`,
      width: `${Math.abs(e.clientX - arrasto.x0)}px`,
      height: `${Math.abs(e.clientY - arrasto.y0)}px`,
    });
    caixaSelecao.hidden = Math.abs(e.clientX - arrasto.x0) + Math.abs(e.clientY - arrasto.y0) < ARRASTO_MINIMO;
  });

  canvas.addEventListener('pointerup', e => {
    if (!arrasto) return;
    if (arrasto.pan) arrasto = null;
    else terminarCaixa(e);
  });

  canvas.addEventListener('pointercancel', () => {
    arrasto = null;
    caixaSelecao.hidden = true;
  });

  addEventListener('pointermove', e => {
    ponteiro.x = e.clientX;
    ponteiro.y = e.clientY;
    ponteiro.dentro = true;
  });
  document.documentElement.addEventListener('pointerleave', () => {
    ponteiro.dentro = false;
  });

  // ---------- wheel, pinch and gestures ----------

  function ehRodaDeMouse(e) {
    if (roda === 'zoom') return true;
    if (roda === 'arrastar') return false;
    if (e.timeStamp - rolagem.ultima > FIM_DA_RAJADA_MS) {
      const silencio = e.timeStamp - rolagem.ultima > SILENCIO_ANTES_DA_RODA_MS;
      rolagem.ehRoda = e.deltaMode !== 0 || (silencio && e.deltaX === 0 && Math.abs(e.deltaY) >= ROLAGEM_GRANDE);
    }
    rolagem.ultima = e.timeStamp;
    return rolagem.ehRoda;
  }

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    if (bloqueado()) return;
    if (e.ctrlKey) {
      // Safari may send the same pinch as gesture events too; while a gesture runs it wins.
      if (e.timeStamp > gestoAte) zoom.pinca(e.deltaY, e.timeStamp, e.clientX, e.clientY);
      return;
    }
    if (ehRodaDeMouse(e)) {
      if (e.timeStamp - rolagem.ultimoPasso < PAUSA_ENTRE_PASSOS_DA_RODA_MS) return;
      rolagem.ultimoPasso = e.timeStamp;
      zoom.passo(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY);
      return;
    }
    // Two fingers drag the map like a page: the ground moves by the scrolled pixels, foreshortening included.
    const { x: antesX, y: antesY } = paraMundo(canvas, camera, e.clientX, e.clientY, tmp);
    const depois = paraMundo(canvas, camera, e.clientX + e.deltaX, e.clientY + e.deltaY, tmp);
    camera.x += depois.x - antesX;
    camera.y += depois.y - antesY;
  }, { passive: false });

  canvas.addEventListener('gesturestart', e => {
    e.preventDefault();
    gestoAte = Infinity;
    zoom.comecarGesto();
  });
  canvas.addEventListener('gesturechange', e => {
    e.preventDefault();
    const [cx, cy] = centroDaTela();
    zoom.gesto(e.scale, e.clientX ?? cx, e.clientY ?? cy);
  });
  canvas.addEventListener('gestureend', e => {
    e.preventDefault();
    gestoAte = e.timeStamp + 150;
  });
  // A pinch over the HUD must not zoom the page either.
  addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', e => e.preventDefault());

  // ---------- keyboard ----------

  const eCampo = alvo => alvo instanceof HTMLElement && alvo.matches('input, textarea, select, [contenteditable]');

  addEventListener('keydown', e => {
    if (eCampo(e.target) || bloqueado()) return;
    origem = 'tecla';
    const mods = modificadores(e);
    if (SETAS[e.code] && (mods === '' || mods === 'shift')) {
      setas.add(e.code);
      e.preventDefault();
      return;
    }
    if (e.code === 'Space' && mods === '') {
      espaco = true;
      e.preventDefault();
      return;
    }
    // The command card first: Q W E R A S D F do what the grid shows for this selection.
    const posicao = TECLAS_DA_GRADE.indexOf(e.code);
    if (posicao >= 0 && (mods === '' || mods === 'shift')) {
      const slot = cartao().slots[posicao];
      if (slot) {
        e.preventDefault();
        if (!e.repeat) executarSlot(slot, { fila: e.shiftKey }, e.timeStamp);
        return;
      }
    }
    const acao = acaoDaTecla(e);
    if (!acao) return;
    e.preventDefault();
    if (e.repeat) return;
    executar(acao, e.timeStamp);
  });

  addEventListener('keyup', e => {
    setas.delete(e.code);
    if (e.code === 'Space') espaco = false;
    if (e.key === 'Shift' && modoComFila) cancelarModo();
  });

  // Keys released while the page had no focus never send keyup (and the Mac drops keyup of keys pressed with Cmd).
  addEventListener('blur', () => {
    setas.clear();
    espaco = false;
    arrasto = null;
    caixaSelecao.hidden = true;
  });

  // ---------- per frame ----------

  /** Camera by arrows and screen edges, called once per frame; also keeps the selection free of dead units. */
  function moverCamera(dt) {
    if (estado.atual && podarSelecao(selecionadas, indice.existe)) aoMudar();
    let dx = 0;
    let dy = 0;
    for (const code of setas) {
      dx += SETAS[code][0];
      dy += SETAS[code][1];
    }
    if (ponteiro.dentro && !arrasto && document.hasFocus() && !bloqueado()) {
      if (ponteiro.x <= BORDA_PX) dx -= 1;
      if (ponteiro.x >= innerWidth - 1 - BORDA_PX) dx += 1;
      if (ponteiro.y <= BORDA_PX) dy -= 1;
      if (ponteiro.y >= innerHeight - 1 - BORDA_PX) dy += 1;
    }
    if (dx || dy) {
      const v = ((dt / 1000) * VELOCIDADE_CAMERA) / zoom.fator;
      camera.x += Math.sign(dx) * v;
      camera.y += Math.sign(dy) * v;
    }
    if (estado.mapa) {
      camera.x = Math.min(Math.max(camera.x, 0), estado.mapa.largura);
      camera.y = Math.min(Math.max(camera.y, 0), estado.mapa.altura);
    }
  }

  return {
    moverCamera,
    executar,
    executarSlot,
    entrarModo,
    cancelarModo,
    comecarColocacao,
    alternarPausa,
    /** Marks the next command as given by an on-screen button (for the playtest log). */
    marcarBotao() {
      origem = 'botao';
    },
    get modo() {
      return modo;
    },
    get pausado() {
      return pausado;
    },
    get origem() {
      return origem;
    },
    /** Code of the ability waiting for its target, or 0. */
    get habilidadeArmada() {
      return armada?.habilidade.codigo ?? 0;
    },
    /** Kind of the building being placed, or -1. */
    get colocando() {
      return colocacao.estado?.tipo ?? -1;
    },
  };
}
