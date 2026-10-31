// Placing a building: the footprint follows the pointer cell by cell, its validity is checked against the rule of
// the CONSTRUIR command, and the renderer draws the ghost only when the cell or the validity changes. Pure state and
// arithmetic; the caller feeds pointer positions in map cells.
// regraDaPagina is the page's reading of that rule from the snapshot, for an answer every frame; the simulation still
// decides, and a refusal comes back as COMANDO_RECUSADO.
import { FP, BANDEIRA } from '../sim/contratos.js';

/** Top-left cell of a footprint of largura × altura cells centred under the map point (px, py). */
export function cantoDaPegada(px, py, largura, altura) {
  return { cx: Math.floor(px - largura / 2 + 0.5), cy: Math.floor(py - altura / 2 + 0.5) };
}

/**
 * Cells the player may build on: within the reach of a powered network node of the player (raioRede of its kind),
 * 1 per cell; null when the player has no network node at all (no network rule applies then).
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
 * Why a building of `tipo` cannot stand with its top-left cell at (cx, cy), or null when it can: 'fora_da_area',
 * 'terreno_improprio' (rock, or more than one height level under it), 'celula_nao_ventosa' or 'terreno_ocupado'.
 * @param {{mapa: object, retrato: object, catalogo: object, area: Uint8Array | null}} contexto
 */
export function regraDaPagina({ mapa, retrato, catalogo, area }, tipo, cx, cy) {
  const info = catalogo.info(tipo);
  const [largura, altura] = info.pegada;
  if (!mapa || cx < 0 || cy < 0 || cx + largura > mapa.largura || cy + altura > mapa.altura) return 'fora_da_area';
  let nivelMin = Infinity;
  let nivelMax = -Infinity;
  let ventosa = false;
  let naArea = area === null;
  for (let y = cy; y < cy + altura; y++) {
    for (let x = cx; x < cx + largura; x++) {
      const c = y * mapa.largura + x;
      if (mapa.bloqueado[c]) return 'terreno_improprio';
      nivelMin = Math.min(nivelMin, mapa.nivel?.[c] ?? 0);
      nivelMax = Math.max(nivelMax, mapa.nivel?.[c] ?? 0);
      if (mapa.ventosa?.[c]) ventosa = true;
      if (area?.[c]) naArea = true;
    }
  }
  if (!naArea) return 'fora_da_area';
  if (nivelMax > nivelMin) return 'terreno_improprio';
  if (info.exigeVentosa && !ventosa) return 'celula_nao_ventosa';
  if (retrato && ocupado(retrato, catalogo, cx, cy, largura, altura)) return 'terreno_ocupado';
  return null;
}

// Whether a unit stands inside the footprint, or a building or node footprint overlaps it.
function ocupado(retrato, catalogo, cx, cy, largura, altura) {
  const x0 = cx * FP;
  const y0 = cy * FP;
  const x1 = (cx + largura) * FP;
  const y1 = (cy + altura) * FP;
  for (let k = 0; k < retrato.n; k++) {
    const info = catalogo.info(retrato.tipo[k]);
    if (info.categoria === 'unidade' || info.categoria === 'coletor' || info.categoria === 'faisca') {
      if (retrato.x[k] >= x0 && retrato.x[k] < x1 && retrato.y[k] >= y0 && retrato.y[k] < y1) return true;
      continue;
    }
    const [w, h] = info.pegada;
    const ex0 = retrato.x[k] - (w * FP) / 2;
    const ey0 = retrato.y[k] - (h * FP) / 2;
    if (ex0 < x1 && ex0 + w * FP > x0 && ey0 < y1 && ey0 + h * FP > y0) return true;
  }
  return false;
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
