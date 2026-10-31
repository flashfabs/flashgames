// Lookup from entity id (with generation) to its index in the latest snapshot, rebuilt once per snapshot, so selection,
// groups and queue points can ask "is this unit alive and where is it" without scanning.
import { FP, BANDEIRA } from '../sim/contratos.js';

export function criarIndice() {
  const porId = new Map();
  let retrato = null;

  return {
    atualizar(novo) {
      retrato = novo;
      porId.clear();
      for (let k = 0; k < novo.n; k++) porId.set(novo.id[k], k);
    },
    existe: id => porId.has(id),
    /** Index of the entity in the latest snapshot, or -1. */
    k: id => porId.get(id) ?? -1,
    /** Owner of the entity, or -1 when it is gone. */
    dono(id) {
      const k = porId.get(id);
      return k === undefined ? -1 : retrato.dono[k];
    },
    /** Kind of the entity, or -1 when it is gone. */
    tipo(id) {
      const k = porId.get(id);
      return k === undefined ? -1 : retrato.tipo[k];
    },
    /** Cell position of the unit, written to saida; false when it is gone. */
    posicao(id, saida) {
      const k = porId.get(id);
      if (k === undefined) return false;
      saida.x = retrato.x[k] / FP;
      saida.y = retrato.y[k] / FP;
      return true;
    },
    parada(id) {
      const k = porId.get(id);
      return k !== undefined && (retrato.bandeiras[k] & BANDEIRA.PARADA) !== 0;
    },
    /** Mean cell position of the ids that are alive, or null. */
    centro(ids) {
      let x = 0;
      let y = 0;
      let n = 0;
      for (const id of ids) {
        const k = porId.get(id);
        if (k === undefined) continue;
        x += retrato.x[k];
        y += retrato.y[k];
        n += 1;
      }
      return n ? { x: x / n / FP, y: y / n / FP } : null;
    },
  };
}
