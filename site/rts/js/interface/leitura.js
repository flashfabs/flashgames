// What the HUD reads from each snapshot (C2) for the local player: Carga, population against its ceiling, the queues
// of the player's buildings and the idle harvesters. Rebuilt once per snapshot, so the DOM code only asks.
// Fields the simulation does not send yet fall back to what can be derived (population from the kinds' data, idle
// harvesters from the "no order" flag), and the fallback goes away with the field.
import { BANDEIRA } from '../sim/contratos.js';

/** Population ceiling of the first phase when the snapshot does not say it. */
export const TETO_PADRAO = 60;
/** Values in queue records: progress is sent in thousandths. */
const ESCALA_PROGRESSO = 1000;

export function criarLeitura({ catalogo }) {
  const producoes = new Map(); // building id → ProducaoDoPredio
  const ociosos = [];
  const lotacao = { usada: 0, teto: TETO_PADRAO };
  let carga = 0;
  let qg = -1;

  /** Reads one snapshot; jogador is the local player. */
  function atualizar(retrato, jogador) {
    const cat = catalogo();
    carga = retrato.recursos?.[jogador] ?? 0;
    producoes.clear();
    ociosos.length = 0;
    qg = -1;
    let usada = 0;
    const flagOciosa = BANDEIRA.OCIOSA ?? BANDEIRA.PARADA;
    for (let k = 0; k < retrato.n; k++) {
      if (retrato.dono[k] !== jogador) continue;
      const tipo = retrato.tipo[k];
      usada += cat.info(tipo).lotacao;
      if (qg < 0 && cat.ehQG(tipo)) qg = retrato.id[k];
      if (cat.ehColetor(tipo) && retrato.bandeiras[k] & flagOciosa) ociosos.push(retrato.id[k]);
    }
    if (retrato.lotacao) {
      lotacao.usada = retrato.lotacao[jogador * 2];
      lotacao.teto = retrato.lotacao[jogador * 2 + 1];
    } else {
      lotacao.usada = usada;
      lotacao.teto = TETO_PADRAO;
    }
    lerFilas(retrato);
  }

  // Queue records of the local player's buildings: [building id, kind, progress in thousandths, slot], slot 0 for the
  // units being trained (in order), 1 for the building under construction and 2 for a building ready to be placed.
  function lerFilas(retrato) {
    const filas = retrato.filas;
    if (!filas) return;
    for (let o = 0; o + 4 <= filas.length; o += 4) {
      const id = filas[o];
      let p = producoes.get(id);
      if (!p) producoes.set(id, (p = { fila: [], obra: null, pronto: -1 }));
      const item = { tipo: filas[o + 1], progresso: filas[o + 2] / ESCALA_PROGRESSO };
      if (filas[o + 3] === 0) p.fila.push(item);
      else if (filas[o + 3] === 1) p.obra = item;
      else p.pronto = item.tipo;
    }
  }

  return {
    atualizar,
    get carga() {
      return carga;
    },
    get lotacao() {
      return lotacao;
    },
    /** Queue of a building, or null when it has none (or the snapshot carries no queues). */
    producao: id => producoes.get(id) ?? null,
    /** Idle harvesters of the local player, in slot order. */
    get ociosos() {
      return ociosos;
    },
    /** The local player's headquarters, or -1. */
    get qg() {
      return qg;
    },
  };
}
