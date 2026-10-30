// Selection rules on top of a snapshot (C2): click, box, Shift to add or toggle, and every unit of one kind on screen.
// The caller projects positions to client pixels (projetar), so the rules judge what the player sees, height included.
// Pure: no DOM, no allocation per entity.

/** Distance in client pixels within which a click picks a unit. */
export const RAIO_DO_CLIQUE = 18;
/** Below this size in client pixels a drag is still a click. */
export const ARRASTO_MINIMO = 6;

/**
 * @callback Projetar
 * @param {object} retrato
 * @param {number} k       entity index in the snapshot
 * @param {{x: number, y: number}} saida receives client pixels
 */

/** Ids of the player's entities whose projected position falls inside the box {x0, y0, x1, y1} (client pixels). */
export function idsNaCaixa(retrato, jogador, projetar, caixa) {
  const x0 = Math.min(caixa.x0, caixa.x1);
  const x1 = Math.max(caixa.x0, caixa.x1);
  const y0 = Math.min(caixa.y0, caixa.y1);
  const y1 = Math.max(caixa.y0, caixa.y1);
  const ids = [];
  const p = { x: 0, y: 0 };
  for (let k = 0; k < retrato.n; k++) {
    if (retrato.dono[k] !== jogador) continue;
    projetar(retrato, k, p);
    if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) ids.push(retrato.id[k]);
  }
  return ids;
}

/**
 * Index of the entity nearest to (x, y) within raio client pixels, or -1. aceita(k) filters by owner or kind.
 * Used both to select and to find the target of a context order.
 */
export function entidadeNoPonto(retrato, projetar, x, y, aceita = () => true, raio = RAIO_DO_CLIQUE) {
  const p = { x: 0, y: 0 };
  let melhor = -1;
  let melhorD2 = raio * raio;
  for (let k = 0; k < retrato.n; k++) {
    if (!aceita(k)) continue;
    projetar(retrato, k, p);
    const d2 = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d2 <= melhorD2) {
      melhorD2 = d2;
      melhor = k;
    }
  }
  return melhor;
}

/** Ids of the player's entities of the given kind projected inside the screen rectangle {x0, y0, x1, y1}. */
export function mesmoTipoNaTela(retrato, jogador, tipo, projetar, tela) {
  const ids = [];
  const p = { x: 0, y: 0 };
  for (let k = 0; k < retrato.n; k++) {
    if (retrato.dono[k] !== jogador || retrato.tipo[k] !== tipo) continue;
    projetar(retrato, k, p);
    if (p.x >= tela.x0 && p.x <= tela.x1 && p.y >= tela.y0 && p.y <= tela.y1) ids.push(retrato.id[k]);
  }
  return ids;
}

/**
 * Applies picked ids to the selection set. 'trocar' replaces it, 'somar' adds (Shift and box), 'alternar' adds the
 * ones not selected and removes the ones already selected (Shift and click).
 */
export function aplicarSelecao(selecionadas, ids, modo) {
  if (modo === 'trocar') selecionadas.clear();
  if (modo === 'alternar' && ids.length > 0 && ids.every(id => selecionadas.has(id))) {
    for (const id of ids) selecionadas.delete(id);
    return;
  }
  for (const id of ids) selecionadas.add(id);
}

/** Drops ids that are no longer in the snapshot (dead units, freed slots). Returns how many were dropped. */
export function podarSelecao(selecionadas, existe) {
  let removidas = 0;
  for (const id of selecionadas) {
    if (existe(id)) continue;
    selecionadas.delete(id);
    removidas += 1;
  }
  return removidas;
}
