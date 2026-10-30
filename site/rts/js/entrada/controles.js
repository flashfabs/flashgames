// Mouse and keyboard: box and click selection (a set of entity ids), move orders, middle-button pan, wheel zoom around the pointer,
// keyboard camera, fullscreen, HUD toggle, pause and select-all.
import { FP, TIPO_COMANDO } from '../sim/contratos.js';
import { EFEITO } from '../render/renderizador.js';
import { paraMundo, definirZoom } from './camera.js';

export function ligarControles({ canvas, palco, caixaSelecao, painel, camera, estado, selecionadas, simulacao, efeitos }) {
  const teclas = new Set();
  let arrasto = null;
  let pausado = false;
  const mundo = (x, y) => paraMundo(canvas, camera, x, y);

  function ordenarMovimento(destino) {
    if (selecionadas.size === 0) return;
    simulacao.enviarComando({ tipo: TIPO_COMANDO.MOVER, unidades: [...selecionadas], x: Math.floor(destino.x * FP), y: Math.floor(destino.y * FP) });
    efeitos.adicionar(EFEITO.ORDEM, destino.x, destino.y, 0, 0, 600, 0.9);
  }

  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    if (e.button === 0) {
      arrasto = { x: e.clientX, y: e.clientY, mundo: mundo(e.clientX, e.clientY) };
    } else if (e.button === 1) {
      arrasto = { pan: true, x: e.clientX, y: e.clientY };
    } else if (e.button === 2) {
      ordenarMovimento(mundo(e.clientX, e.clientY));
    }
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (!arrasto) return;
    if (arrasto.pan) {
      const antes = mundo(arrasto.x, arrasto.y);
      const depois = mundo(e.clientX, e.clientY);
      camera.x -= depois.x - antes.x;
      camera.y -= depois.y - antes.y;
      arrasto.x = e.clientX;
      arrasto.y = e.clientY;
      return;
    }
    const r = palco.getBoundingClientRect();
    Object.assign(caixaSelecao.style, {
      left: `${Math.min(arrasto.x, e.clientX) - r.left}px`,
      top: `${Math.min(arrasto.y, e.clientY) - r.top}px`,
      width: `${Math.abs(e.clientX - arrasto.x)}px`,
      height: `${Math.abs(e.clientY - arrasto.y)}px`,
    });
    caixaSelecao.hidden = Math.abs(e.clientX - arrasto.x) + Math.abs(e.clientY - arrasto.y) < 6;
  });
  canvas.addEventListener('pointerup', e => {
    if (!arrasto || arrasto.pan) {
      arrasto = null;
      return;
    }
    const fim = mundo(e.clientX, e.clientY);
    if (!e.shiftKey) selecionadas.clear();
    const { atual, mapa } = estado;
    if (atual && mapa) {
      const x0 = Math.min(arrasto.mundo.x, fim.x);
      const x1 = Math.max(arrasto.mundo.x, fim.x);
      const y0 = Math.min(arrasto.mundo.y, fim.y);
      const y1 = Math.max(arrasto.mundo.y, fim.y);
      const clique = x1 - x0 < 0.3 && y1 - y0 < 0.3;
      let melhor = -1;
      let melhorD = 0.5;
      for (let k = 0; k < atual.n; k++) {
        if (atual.dono[k] !== estado.jogadorLocal) continue;
        const x = atual.x[k] / FP;
        const y = atual.y[k] / FP;
        if (clique) {
          const d = Math.hypot(x - fim.x, y - fim.y);
          if (d < melhorD) {
            melhorD = d;
            melhor = atual.id[k];
          }
        } else if (x >= x0 && x <= x1 && y >= y0 && y <= y1) {
          selecionadas.add(atual.id[k]);
        }
      }
      if (melhor >= 0) selecionadas.add(melhor);
    }
    caixaSelecao.hidden = true;
    arrasto = null;
  });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const antes = mundo(e.clientX, e.clientY);
    definirZoom(camera, camera.zoom * Math.exp(-e.deltaY * 0.0015));
    const depois = mundo(e.clientX, e.clientY);
    camera.x += antes.x - depois.x;
    camera.y += antes.y - depois.y;
  }, { passive: false });
  window.addEventListener('keydown', e => {
    teclas.add(e.key.toLowerCase());
    if (e.key === 'f') palco.requestFullscreen?.();
    if (e.key === 'h') painel.hidden = !painel.hidden;
    if (e.key === 'p') {
      pausado = !pausado;
      simulacao.pausar(pausado);
    }
    if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const atual = estado.atual;
      if (atual) for (let k = 0; k < atual.n; k++) if (atual.dono[k] === estado.jogadorLocal) selecionadas.add(atual.id[k]);
    }
  });
  window.addEventListener('keyup', e => teclas.delete(e.key.toLowerCase()));

  // Keyboard camera, called once per frame.
  function moverCamera(dt) {
    const v = (dt / 1000) * 18 / camera.zoom;
    if (teclas.has('w') || teclas.has('arrowup')) camera.y -= v;
    if (teclas.has('s') || teclas.has('arrowdown')) camera.y += v;
    if (teclas.has('a') || teclas.has('arrowleft')) camera.x -= v;
    if (teclas.has('d') || teclas.has('arrowright')) camera.x += v;
  }

  return { moverCamera };
}
