// Placing a building: the footprint follows the pointer cell by cell, its validity comes from the same rule the
// simulation applies to the CONSTRUIR command, and the renderer draws the ghost only when the cell or the validity
// changes. Pure state and arithmetic; the caller feeds pointer positions in map cells.
import { FP } from '../sim/contratos.js';

/** Top-left cell of a footprint of largura × altura cells centred under the map point (px, py). */
export function cantoDaPegada(px, py, largura, altura) {
  return { cx: Math.floor(px - largura / 2 + 0.5), cy: Math.floor(py - altura / 2 + 0.5) };
}

/**
 * Fallback rule while the simulation has no placement rule to share: every cell inside the map, passable, and no
 * entity standing on it. The network rule (inside the poles' reach) comes only from the simulation.
 */
export function validarPeloMapa(mapa, retrato, cx, cy, largura, altura) {
  if (!mapa || cx < 0 || cy < 0 || cx + largura > mapa.largura || cy + altura > mapa.altura) return false;
  for (let y = cy; y < cy + altura; y++) for (let x = cx; x < cx + largura; x++) if (mapa.bloqueado[y * mapa.largura + x]) return false;
  if (!retrato) return true;
  const x0 = cx * FP;
  const y0 = cy * FP;
  const x1 = (cx + largura) * FP;
  const y1 = (cy + altura) * FP;
  for (let k = 0; k < retrato.n; k++) if (retrato.x[k] >= x0 && retrato.x[k] < x1 && retrato.y[k] >= y0 && retrato.y[k] < y1) return false;
  return true;
}

/**
 * @param {object} opcoes
 * @param {(tipo: number, cx: number, cy: number) => boolean} opcoes.validar
 * @param {(fantasma: object | null) => void} opcoes.desenhar called only when the ghost changes
 */
export function criarColocacao({ validar, desenhar }) {
  let atual = null; // { tipo, construtor, largura, altura, cx, cy, valido }

  function mostrar() {
    desenhar(atual && { tipo: atual.tipo, cx: atual.cx, cy: atual.cy, largura: atual.largura, altura: atual.altura, valido: atual.valido });
  }

  return {
    /** Starts placing a building of `tipo` that `construtor` (the headquarters) has ready. */
    comecar(tipo, construtor, largura, altura) {
      atual = { tipo, construtor, largura, altura, cx: -1, cy: -1, valido: false };
    },
    /** Follows the pointer (map cells); returns whether the ghost changed. */
    apontar(px, py) {
      if (!atual) return false;
      const { cx, cy } = cantoDaPegada(px, py, atual.largura, atual.altura);
      const valido = validar(atual.tipo, cx, cy);
      if (cx === atual.cx && cy === atual.cy && valido === atual.valido) return false;
      Object.assign(atual, { cx, cy, valido });
      mostrar();
      return true;
    },
    /** Re-checks the current cell (the network or the units under it changed with a new snapshot). */
    revalidar() {
      if (!atual || atual.cx < 0) return;
      const valido = validar(atual.tipo, atual.cx, atual.cy);
      if (valido === atual.valido) return;
      atual.valido = valido;
      mostrar();
    },
    terminar() {
      if (!atual) return;
      atual = null;
      mostrar();
    },
    get ativa() {
      return atual !== null;
    },
    get estado() {
      return atual && { ...atual };
    },
  };
}
