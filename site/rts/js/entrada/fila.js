// What the player sees of the order queue: the points each unit still has to visit, kept on this side because the
// snapshot does not carry queues. A new order without Shift replaces the points, with Shift it appends, and stop or
// hold clear them. A point goes away when the unit gets within CHEGADA cells of it, and the whole queue when the
// snapshot says the unit has no order left a few ticks after the last one was sent.

/** Cells from a point at which a unit counts as having reached it. */
export const CHEGADA = 1.5;
/** Ticks an order may take to show up in the snapshot before an idle unit's points are dropped. */
export const TOLERANCIA_TICKS = 4;
/** Orders the simulation keeps per unit; Shift orders beyond this are dropped there, so they are not drawn here. */
export const MAXIMO_NA_FILA = 8;

/** repetem: order kinds that never finish on arrival (patrol goes back and forth), so their point stays drawn. */
export function criarFilaVisual({ repetem = new Set() } = {}) {
  // id → { pontos: [{x, y, tipo}], tick }
  const filas = new Map();

  return {
    /** Records an order of the given kind to point {x, y} (cells) for the ids, appended when fila is true. */
    ordenar(ids, ponto, tipo, fila, tick) {
      for (const id of ids) {
        const atual = filas.get(id);
        const novo = { x: ponto.x, y: ponto.y, tipo };
        if (fila && atual) {
          if (atual.pontos.length >= MAXIMO_NA_FILA) continue;
          atual.pontos.push(novo);
          atual.tick = tick;
        } else {
          filas.set(id, { pontos: [novo], tick });
        }
      }
    },
    limpar(ids) {
      for (const id of ids) filas.delete(id);
    },
    /**
     * Follows the units: posicao(id, saida) fills saida with the unit's cell position and returns false when it is
     * gone; parada(id) tells whether the snapshot says it has no order.
     */
    atualizar(tick, posicao, parada) {
      const p = { x: 0, y: 0 };
      for (const [id, fila] of filas) {
        if (!posicao(id, p)) {
          filas.delete(id);
          continue;
        }
        while (fila.pontos.length > 0 && !repetem.has(fila.pontos[0].tipo) && Math.hypot(p.x - fila.pontos[0].x, p.y - fila.pontos[0].y) <= CHEGADA) fila.pontos.shift();
        if (fila.pontos.length === 0 || (parada(id) && tick > fila.tick + TOLERANCIA_TICKS)) filas.delete(id);
      }
    },
    pontosDe(id) {
      return filas.get(id)?.pontos ?? [];
    },
    /**
     * The distinct queues of the given ids, for drawing: units ordered together share one list of points.
     * @returns {{x: number, y: number, tipo: number}[][]}
     */
    rotas(ids) {
      const vistas = new Map();
      for (const id of ids) {
        const pontos = filas.get(id)?.pontos;
        if (!pontos?.length) continue;
        const chave = pontos.map(ponto => `${ponto.x.toFixed(1)},${ponto.y.toFixed(1)},${ponto.tipo}`).join(';');
        if (!vistas.has(chave)) vistas.set(chave, pontos);
      }
      return [...vistas.values()];
    },
  };
}
