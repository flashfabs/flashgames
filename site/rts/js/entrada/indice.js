// Lookup from entity id (with generation) to its index in the latest snapshot, rebuilt once per snapshot, so selection,
// groups and queue points can ask "is this unit alive and where is it" without scanning. Owner and kind of an entity
// that died in this snapshot's ticks still answer from the previous one, so its events (hit, harvester lost) can be
// told apart.
import { FP, BANDEIRA } from '../sim/contratos.js';

export function criarIndice() {
  let porId = new Map();
  let anteriores = new Map();
  let retrato = null;
  let anterior = null;

  // [owner, kind] of an entity in the latest snapshot or, gone since, in the one before; null when neither has it
  function donoETipo(id) {
    const k = porId.get(id);
    if (k !== undefined) return [retrato.dono[k], retrato.tipo[k]];
    const j = anteriores.get(id);
    return j === undefined ? null : [anterior.dono[j], anterior.tipo[j]];
  }

  return {
    atualizar(novo) {
      [anteriores, porId] = [porId, anteriores];
      anterior = retrato;
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
    /** Owner of the entity, also when it died since the previous snapshot; -1 when unknown. */
    donoRecente: id => donoETipo(id)?.[0] ?? -1,
    /** Kind of the entity, also when it died since the previous snapshot; -1 when unknown. */
    tipoRecente: id => donoETipo(id)?.[1] ?? -1,
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
