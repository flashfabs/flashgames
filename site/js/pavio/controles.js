// Input for Pavio: keyboard, touch and gamepads, merged into { d, d2 }: a primary direction plus a
// secondary one, so a held diagonal keeps going and turns at the next opening.
// Touch: the stick appears wherever a finger lands on the left half; any tap on the right half drops a bomb,
// except on the ice button, shown there while the player has ice.

import { DIRECAO } from './regras.js';

const TECLAS = {
  KeyW: DIRECAO.CIMA,
  ArrowUp: DIRECAO.CIMA,
  KeyS: DIRECAO.BAIXO,
  ArrowDown: DIRECAO.BAIXO,
  KeyA: DIRECAO.ESQUERDA,
  ArrowLeft: DIRECAO.ESQUERDA,
  KeyD: DIRECAO.DIREITA,
  ArrowRight: DIRECAO.DIREITA,
};
const TECLAS_BOMBA = new Set(['Space', 'Enter', 'NumpadEnter']);
const TECLAS_MOLOTOV = new Set(['KeyQ']);
const BOTOES_MOLOTOV = [4, 5];
const TECLAS_GELO = new Set(['KeyF', 'ShiftLeft', 'ShiftRight']);
const TECLAS_PORTAL = new Set(['KeyE']);
const BOTOES_PORTAL = [6, 7];
const BOTOES_BOMBA = [0, 2];
const BOTOES_GELO = [1, 3];
const FOLGA_BOTAO_GELO_PX = 12;
const BOTOES_DIRECAO = [[12, DIRECAO.CIMA], [13, DIRECAO.BAIXO], [14, DIRECAO.ESQUERDA], [15, DIRECAO.DIREITA]];
const NENHUMA = Object.freeze({ d: DIRECAO.NENHUMA, d2: DIRECAO.NENHUMA });
const ZONA_MORTA_TOQUE_PX = 10;
const RAIO_MANCHE_PX = 56;
const ZONA_MORTA_CONTROLE = 0.35;
const HISTERESE = 1.25;
const PROPORCAO_SECUNDARIA = 0.38;

export const temToque = () => navigator.maxTouchPoints > 0 || matchMedia('(any-pointer: coarse)').matches;

// Stick sensitivity for a settings screen (0.6 relaxed to 1.6 twitchy), remembered on this device. Higher
// means a smaller dead zone and a shorter throw; it applies from the next touch.
const CHAVE_SENSIBILIDADE = 'salinha:sensibilidade-toque';
export const SENSIBILIDADE_TOQUE = Object.freeze({ min: 0.6, max: 1.6, padrao: 1 });

export function lerSensibilidadeToque() {
  try {
    const valor = Number.parseFloat(localStorage.getItem(CHAVE_SENSIBILIDADE));
    return Number.isFinite(valor) ? Math.min(SENSIBILIDADE_TOQUE.max, Math.max(SENSIBILIDADE_TOQUE.min, valor)) : SENSIBILIDADE_TOQUE.padrao;
  } catch {
    return SENSIBILIDADE_TOQUE.padrao;
  }
}

export function definirSensibilidadeToque(valor) {
  const nova = Math.min(SENSIBILIDADE_TOQUE.max, Math.max(SENSIBILIDADE_TOQUE.min, Number(valor) || SENSIBILIDADE_TOQUE.padrao));
  try {
    localStorage.setItem(CHAVE_SENSIBILIDADE, String(nova));
  } catch {
    // Storage may be blocked (private mode); it still applies for this visit.
  }
  sensibilidadeAtual = nova;
  return nova;
}

let sensibilidadeAtual = lerSensibilidadeToque();

const vertical = direcao => direcao === DIRECAO.CIMA || direcao === DIRECAO.BAIXO;
const iguais = (a, b) => a.d === b.d && a.d2 === b.d2;

function emCampoDeTexto(evento) {
  return evento.target instanceof Element && evento.target.closest('input, textarea, select, [contenteditable]');
}

// Stick vector to directions. The current axis is kept until the other is clearly bigger, so the
// direction does not flicker near the diagonals.
function direcaoDoManche(dx, dy, zonaMorta, anterior) {
  const distancia = Math.hypot(dx, dy);
  if (distancia < zonaMorta) return NENHUMA;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  let horizontal = ax > ay;
  if (anterior.d) {
    if (vertical(anterior.d) && ay * HISTERESE > ax) horizontal = false;
    else if (!vertical(anterior.d) && ax * HISTERESE > ay) horizontal = true;
  }
  const horizontalDe = dx > 0 ? DIRECAO.DIREITA : DIRECAO.ESQUERDA;
  const verticalDe = dy > 0 ? DIRECAO.BAIXO : DIRECAO.CIMA;
  const menor = horizontal ? ay : ax;
  return {
    d: horizontal ? horizontalDe : verticalDe,
    d2: menor > distancia * PROPORCAO_SECUNDARIA ? (horizontal ? verticalDe : horizontalDe) : DIRECAO.NENHUMA,
  };
}

export function criarControles({ camada, base, manete, dicaBomba, dicaGelo, dicaMolotov, dicaPortal, aoEntrada, aoBomba, aoGelo, aoMolotov = () => {}, aoPrepararPortal = () => true, aoCancelarPortal = () => {}, aoPortal = () => {} }) {
  const pressionadas = []; // held direction keys, the most recent last
  let toque = NENHUMA;
  let controle = NENHUMA;
  let atual = NENHUMA;
  let ponteiroManche = null;
  let origem = null;
  let bombaNoControle = false;
  let geloNoControle = false;
  let molotovNoControle = false;
  let portalNoControle = false;
  let portalArmado = false;
  let toqueAtivo = false;
  // Space and Enter only drop bombs while playing, so they still press buttons in the menus.
  let emJogo = false;

  const entradaTeclado = () => {
    if (!pressionadas.length) return NENHUMA;
    const d = TECLAS[pressionadas.at(-1)];
    for (let k = pressionadas.length - 2; k >= 0; k--) {
      const outra = TECLAS[pressionadas[k]];
      if (vertical(outra) !== vertical(d)) return { d, d2: outra };
    }
    return { d, d2: DIRECAO.NENHUMA };
  };

  const armarPortal = () => {
    if (!emJogo) return;
    if (portalArmado) { portalArmado = false; aoCancelarPortal(); return; }
    portalArmado = Boolean(aoPrepararPortal());
  };
  const direcionarPortal = direcao => {
    if (!portalArmado || !direcao) return;
    portalArmado = false;
    aoPortal(direcao);
  };

  const recalcular = () => {
    const nova = toque.d ? toque : controle.d ? controle : entradaTeclado();
    if (iguais(nova, atual)) return;
    atual = nova;
    direcionarPortal(nova.d);
    aoEntrada(atual);
  };

  const soltarTecla = codigo => {
    const posicao = pressionadas.indexOf(codigo);
    if (posicao >= 0) pressionadas.splice(posicao, 1);
  };

  const aoDescerTecla = evento => {
    if (emCampoDeTexto(evento) || evento.ctrlKey || evento.metaKey || evento.altKey) return;
    if (evento.code in TECLAS) {
      evento.preventDefault();
      if (evento.repeat) return;
      soltarTecla(evento.code);
      pressionadas.push(evento.code);
      direcionarPortal(TECLAS[evento.code]);
      recalcular();
    } else if (TECLAS_PORTAL.has(evento.code) && emJogo) {
      evento.preventDefault();
      if (!evento.repeat) armarPortal();
    } else if (TECLAS_BOMBA.has(evento.code) && emJogo) {
      evento.preventDefault();
      if (!evento.repeat) aoBomba();
    } else if (TECLAS_MOLOTOV.has(evento.code) && emJogo) {
      evento.preventDefault();
      if (!evento.repeat) aoMolotov();
    } else if (TECLAS_GELO.has(evento.code) && emJogo) {
      evento.preventDefault();
      if (!evento.repeat) aoGelo();
    }
  };
  const aoSubirTecla = evento => {
    if (!(evento.code in TECLAS)) return;
    soltarTecla(evento.code);
    recalcular();
  };
  const zerar = () => {
    pressionadas.length = 0;
    portalArmado = false;
    soltarManche();
    recalcular();
  };

  const posicionar = (elemento, x, y) => {
    elemento.style.transform = `translate(${x}px, ${y}px)`;
  };
  const soltarManche = () => {
    ponteiroManche = null;
    toque = NENHUMA;
    camada.classList.remove('pavio-toque--ativo');
    delete base.dataset.d;
    base.style.transform = '';
    manete.style.transform = '';
  };

  const aoTocar = evento => {
    if (!toqueAtivo) return;
    evento.preventDefault();
    if (evento.clientX < window.innerWidth / 2 && !noBotao(dicaMolotov, evento) && !noBotao(dicaGelo, evento) && !noBotao(dicaPortal, evento)) {
      if (ponteiroManche !== null) return;
      ponteiroManche = evento.pointerId;
      origem = { x: evento.clientX, y: evento.clientY };
      camada.classList.add('pavio-toque--ativo');
      posicionar(base, origem.x, origem.y);
      posicionar(manete, origem.x, origem.y);
      try {
        camada.setPointerCapture(evento.pointerId);
      } catch {
        // Capture can fail for synthetic events; tracking by pointerId still works.
      }
      return;
    }
    if (noBotao(dicaPortal, evento)) {
      armarPortal();
      navigator.vibrate?.(12);
      return;
    }
    const molotov = noBotao(dicaMolotov, evento);
    const gelo = !molotov && noBotao(dicaGelo, evento);
    (molotov ? aoMolotov : gelo ? aoGelo : aoBomba)();
    const botao = molotov ? dicaMolotov : gelo ? dicaGelo : dicaBomba;
    const classe = molotov ? 'pavio-dica-molotov--toque' : gelo ? 'pavio-dica-gelo--toque' : 'pavio-dica-bomba--toque';
    botao.classList.remove(classe);
    void botao.offsetWidth; // restart the press animation
    botao.classList.add(classe);
    navigator.vibrate?.(12);
  };
  const noBotao = (botao, evento) => {
    if (!botao || botao.hidden) return false;
    const caixa = botao.getBoundingClientRect();
    const folga = FOLGA_BOTAO_GELO_PX;
    return evento.clientX >= caixa.left - folga && evento.clientX <= caixa.right + folga
      && evento.clientY >= caixa.top - folga && evento.clientY <= caixa.bottom + folga;
  };
  const aoMover = evento => {
    if (evento.pointerId !== ponteiroManche) return;
    evento.preventDefault();
    let dx = evento.clientX - origem.x;
    let dy = evento.clientY - origem.y;
    const distancia = Math.hypot(dx, dy);
    const raio = RAIO_MANCHE_PX / sensibilidadeAtual;
    if (distancia > raio) {
      // Drag the base along with the finger, so reversing direction is quick.
      const excesso = distancia - raio;
      origem.x += (dx / distancia) * excesso;
      origem.y += (dy / distancia) * excesso;
      dx = evento.clientX - origem.x;
      dy = evento.clientY - origem.y;
      posicionar(base, origem.x, origem.y);
    }
    posicionar(manete, origem.x + dx, origem.y + dy);
    const anterior = toque.d;
    toque = direcaoDoManche(dx, dy, ZONA_MORTA_TOQUE_PX / sensibilidadeAtual, toque);
    if (toque.d !== anterior) {
      // The pushed direction lights up on the ring, with a tiny tick where vibration exists.
      if (toque.d) base.dataset.d = String(toque.d);
      else delete base.dataset.d;
      if (toque.d) navigator.vibrate?.(5);
    }
    recalcular();
  };
  const aoSoltar = evento => {
    if (evento.pointerId !== ponteiroManche) return;
    soltarManche();
    recalcular();
  };
  const bloquear = evento => {
    if (toqueAtivo) evento.preventDefault();
  };

  window.addEventListener('keydown', aoDescerTecla);
  window.addEventListener('keyup', aoSubirTecla);
  window.addEventListener('blur', zerar);
  camada.addEventListener('pointerdown', aoTocar);
  camada.addEventListener('pointermove', aoMover);
  camada.addEventListener('pointerup', aoSoltar);
  camada.addEventListener('pointercancel', aoSoltar);
  camada.addEventListener('touchmove', bloquear, { passive: false });
  camada.addEventListener('contextmenu', bloquear);

  return {
    // Called every frame: gamepads have no events for buttons and sticks, they are polled.
    atualizar() {
      const controles = navigator.getGamepads?.() ?? [];
      let novo = NENHUMA;
      let bomba = false;
      let gelo = false;
      let molotov = false;
      let portal = false;
      for (const pad of controles) {
        if (!pad?.connected) continue;
        bomba = BOTOES_BOMBA.some(botao => pad.buttons[botao]?.pressed);
        portal = BOTOES_PORTAL.some(botao => pad.buttons[botao]?.pressed);
        molotov = BOTOES_MOLOTOV.some(botao => pad.buttons[botao]?.pressed);
        gelo = BOTOES_GELO.some(botao => pad.buttons[botao]?.pressed);
        const cruz = BOTOES_DIRECAO.find(([botao]) => pad.buttons[botao]?.pressed);
        novo = cruz ? { d: cruz[1], d2: DIRECAO.NENHUMA } : direcaoDoManche(pad.axes[0] ?? 0, pad.axes[1] ?? 0, ZONA_MORTA_CONTROLE, controle);
        break;
      }
      if (portal && !portalNoControle && emJogo) armarPortal();
      portalNoControle = portal;
      if (bomba && !bombaNoControle && emJogo) aoBomba();
      if (gelo && !geloNoControle && emJogo) aoGelo();
      if (molotov && !molotovNoControle && emJogo) aoMolotov();
      molotovNoControle = molotov;
      bombaNoControle = bomba;
      geloNoControle = gelo;
      if (!iguais(novo, controle)) {
        controle = novo;
        recalcular();
      }
    },
    definirModo({ jogando, toqueVisivel }) {
      emJogo = jogando;
      if (!jogando) portalArmado = false;
      toqueAtivo = jogando && toqueVisivel;
      camada.hidden = !toqueAtivo;
      if (!toqueAtivo) soltarManche();
      recalcular();
    },
    get entrada() {
      return atual;
    },
    destruir() {
      window.removeEventListener('keydown', aoDescerTecla);
      window.removeEventListener('keyup', aoSubirTecla);
      window.removeEventListener('blur', zerar);
      camada.removeEventListener('pointerdown', aoTocar);
      camada.removeEventListener('pointermove', aoMover);
      camada.removeEventListener('pointerup', aoSoltar);
      camada.removeEventListener('pointercancel', aoSoltar);
      camada.removeEventListener('touchmove', bloquear);
      camada.removeEventListener('contextmenu', bloquear);
    },
  };
}
