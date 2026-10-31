// Placing a building: the footprint follows the pointer cell by cell, its validity is the simulation's own rule for
// the CONSTRUIR command (sim/construcao.js motivoPosicao, called by the caller), and the renderer draws the ghost only
// when the cell or the validity changes. Pure state and arithmetic; the caller feeds pointer positions in map cells.
import { FP, BANDEIRA } from '../sim/contratos.js';

/** Top-left cell of a footprint of largura × altura cells centred under the map point (px, py). */
export function cantoDaPegada(px, py, largura, altura) {
  return { cx: Math.floor(px - largura / 2 + 0.5), cy: Math.floor(py - altura / 2 + 0.5) };
}

/**
 * Cells shaded as the building area while placing: within the reach of a powered network node of the player
 * (raioRede of its kind), 1 per cell; null when the player has no network node at all. Only for the eye: validity
 * comes from the simulation's rule.
 */
export function areaDaRede(mapa, retrato, catalogo, jogador) {
  if (!mapa || !retrato) return null;
  const { largura, altura } = mapa;
  let area = null;
  for (let k = 0; k < retrato.n; k++) {
    if (retrato.dono[k] !== jogador) continue;
    const info = catalogo.info(retrato.tipo[k]);
    if (info.raioRede <= 0 || retrato.bandeiras[k] & BANDEIRA.EM_OBRA) continue;
    if (!info.raizRede && !(retrato.bandeiras[k] & BANDEIRA.ENERGIZADO)) continue;
    area ??= new Uint8Array(largura * altura);
    const cx = retrato.x[k] / FP;
    const cy = retrato.y[k] / FP;
    const r = info.raioRede;
    for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(altura, Math.ceil(cy + r)); y++) {
      for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(largura, Math.ceil(cx + r)); x++) {
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) area[y * largura + x] = 1;
      }
    }
  }
  return area;
}

/**
 * @param {object} opcoes
 * @param {(tipo: number, cx: number, cy: number) => string | null} opcoes.validar why it cannot stand there, or null
 * @param {(fantasma: object | null) => void} opcoes.desenhar called only when the ghost changes
 */
export function criarColocacao({ validar, desenhar }) {
  let atual = null; // { tipo, construtor, largura, altura, cx, cy, valido, motivo }

  function mostrar() {
    desenhar(atual && { tipo: atual.tipo, cx: atual.cx, cy: atual.cy, largura: atual.largura, altura: atual.altura, valido: atual.valido });
  }

  function julgar(cx, cy) {
    const motivo = validar(atual.tipo, cx, cy);
    return { motivo, valido: motivo === null };
  }

  return {
    /** Starts placing a building of `tipo`; construtor is who the CONSTRUIR command goes to. */
    comecar(tipo, construtor, largura, altura) {
      atual = { tipo, construtor, largura, altura, cx: -1, cy: -1, valido: false, motivo: null };
    },
    /** Follows the pointer (map cells); returns whether the ghost changed. */
    apontar(px, py) {
      if (!atual) return false;
      const { cx, cy } = cantoDaPegada(px, py, atual.largura, atual.altura);
      const { motivo, valido } = julgar(cx, cy);
      atual.motivo = motivo;
      if (cx === atual.cx && cy === atual.cy && valido === atual.valido) return false;
      Object.assign(atual, { cx, cy, valido });
      mostrar();
      return true;
    },
    /** Re-checks the current cell (the network or the units under it changed with a new snapshot). */
    revalidar() {
      if (!atual || atual.cx < 0) return;
      const { motivo, valido } = julgar(atual.cx, atual.cy);
      atual.motivo = motivo;
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
