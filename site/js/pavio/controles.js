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
const TECLAS_GELO = new Set(['KeyE', 'ShiftLeft', 'ShiftRight']);
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

export function criarControles({ camada, base, manete, dicaBomba, dicaGelo, aoEntrada, aoBomba, aoGelo }) {
  const pressionadas = []; // held direction keys, the most recent last
  let toque = NENHUMA;
  let controle = NENHUMA;
  let atual = NENHUMA;
  let ponteiroManche = null;
  let origem = null;
  let bombaNoControle = false;
  let geloNoControle = false;
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

  const recalcular = () => {
    const nova = toque.d ? toque : controle.d ? controle : entradaTeclado();
    if (iguais(nova, atual)) return;
    atual = nova;
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
      recalcular();
    } else if (TECLAS_BOMBA.has(evento.code) && emJogo) {
      evento.preventDefault();
      if (!evento.repeat) aoBomba();
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
    if (evento.clientX < window.innerWidth / 2) {
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
    const gelo = noBotao(dicaGelo, evento);
    (gelo ? aoGelo : aoBomba)();
    const botao = gelo ? dicaGelo : dicaBomba;
    const classe = gelo ? 'pavio-dica-gelo--toque' : 'pavio-dica-bomba--toque';
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
    if (distancia > RAIO_MANCHE_PX) {
      // Drag the base along with the finger, so reversing direction is quick.
      const excesso = distancia - RAIO_MANCHE_PX;
      origem.x += (dx / distancia) * excesso;
      origem.y += (dy / distancia) * excesso;
      dx = evento.clientX - origem.x;
      dy = evento.clientY - origem.y;
      posicionar(base, origem.x, origem.y);
    }
    posicionar(manete, origem.x + dx, origem.y + dy);
    const anterior = toque.d;
    toque = direcaoDoManche(dx, dy, ZONA_MORTA_TOQUE_PX, toque);
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
      for (const pad of controles) {
        if (!pad?.connected) continue;
        bomba = BOTOES_BOMBA.some(botao => pad.buttons[botao]?.pressed);
        gelo = BOTOES_GELO.some(botao => pad.buttons[botao]?.pressed);
        const cruz = BOTOES_DIRECAO.find(([botao]) => pad.buttons[botao]?.pressed);
        novo = cruz ? { d: cruz[1], d2: DIRECAO.NENHUMA } : direcaoDoManche(pad.axes[0] ?? 0, pad.axes[1] ?? 0, ZONA_MORTA_CONTROLE, controle);
        break;
      }
      if (bomba && !bombaNoControle && emJogo) aoBomba();
      if (gelo && !geloNoControle && emJogo) aoGelo();
      bombaNoControle = bomba;
      geloNoControle = gelo;
      if (!iguais(novo, controle)) {
        controle = novo;
        recalcular();
      }
    },
    definirModo({ jogando, toqueVisivel }) {
      emJogo = jogando;
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
