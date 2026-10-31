// What the HUD reads from each snapshot (C2) for the local player: Carga, population against its ceiling, the queues
// and rally points of the player's buildings, and the idle harvesters. Rebuilt once per snapshot, so the DOM code
// only asks.
import {
  BANDEIRA, FAIXA, FAIXA_ESTADO, ITEM_PESQUISA, SEM_ENTIDADE, FP,
  FL_PRODUTOR, FL_ENCONTRO_X, FL_ENCONTRO_Y, FL_ENCONTRO_ALVO, FL_FAIXAS, FX_ESTADO, FX_PROGRESSO, FX_N, FX_ITENS, TAMANHO_FAIXA, TAMANHO_REGISTRO_FILA,
} from '../sim/contratos.js';

/** Population ceiling of the first phase when the snapshot carries none. */
export const TETO_PADRAO = 60;
const ESCALA_PROGRESSO = 1000;

/**
 * @typedef {object} ItemDaFila
 * @property {number} item       kind, or ITEM_PESQUISA + research index
 * @property {number} tipo       kind, -1 for research
 * @property {number} pesquisa   research index, -1 for a kind
 * @property {number} progresso  0..1 for the head, 0 for the rest
 */

/**
 * @typedef {object} ProducaoDoPredio
 * @property {ItemDaFila[]} fila      unit lane (units and research), head first
 * @property {number} estadoFila      FAIXA_ESTADO of the unit lane's head
 * @property {ItemDaFila[]} obras     construction lane of the headquarters, head first
 * @property {{tipo: number, progresso: number} | null} obra  building being built (the construction lane's head)
 * @property {number} pronto          building kind waiting to be placed, -1 when none
 * @property {{x: number, y: number, alvo: number} | null} encontro rally point in cells
 */

function lerFaixa(filas, base) {
  const estado = filas[base + FX_ESTADO];
  const n = filas[base + FX_N];
  const progresso = filas[base + FX_PROGRESSO] / ESCALA_PROGRESSO;
  const itens = [];
  for (let k = 0; k < n; k++) {
    const item = filas[base + FX_ITENS + k];
    if (item < 0) continue;
    const pesquisa = item >= ITEM_PESQUISA ? item - ITEM_PESQUISA : -1;
    itens.push({ item, tipo: pesquisa < 0 ? item : -1, pesquisa, progresso: k === 0 ? progresso : 0 });
  }
  return { estado, itens };
}

/** Queue records of Retrato.filas by producer id. */
export function lerFilas(filas, saida = new Map()) {
  saida.clear();
  for (let o = 0; o + TAMANHO_REGISTRO_FILA <= filas.length; o += TAMANHO_REGISTRO_FILA) {
    const unidades = lerFaixa(filas, o + FL_FAIXAS + FAIXA.UNIDADES * TAMANHO_FAIXA);
    const construcao = lerFaixa(filas, o + FL_FAIXAS + FAIXA.CONSTRUCAO * TAMANHO_FAIXA);
    const cabeca = construcao.itens[0] ?? null;
    const pronto = construcao.estado === FAIXA_ESTADO.PRONTO && cabeca ? cabeca.tipo : -1;
    const ex = filas[o + FL_ENCONTRO_X];
    const alvo = filas[o + FL_ENCONTRO_ALVO];
    saida.set(filas[o + FL_PRODUTOR], {
      fila: unidades.itens,
      estadoFila: unidades.estado,
      obras: construcao.itens,
      obra: cabeca && pronto < 0 ? { tipo: cabeca.tipo, progresso: cabeca.progresso } : null,
      pronto,
      encontro: ex < 0 && alvo === SEM_ENTIDADE ? null : { x: ex / FP, y: filas[o + FL_ENCONTRO_Y] / FP, alvo },
    });
  }
  return saida;
}

export function criarLeitura({ catalogo }) {
  const producoes = new Map();
  const ociosos = [];
  const lotacao = { usada: 0, teto: TETO_PADRAO };
  let carga = 0;
  let qg = -1;

  /** Reads one snapshot; jogador is the local player. */
  function atualizar(retrato, jogador) {
    const cat = catalogo();
    carga = retrato.recursos?.[jogador] ?? 0;
    ociosos.length = 0;
    qg = -1;
    for (let k = 0; k < retrato.n; k++) {
      if (retrato.dono[k] !== jogador) continue;
      const tipo = retrato.tipo[k];
      if (qg < 0 && cat.ehQG(tipo) && !(retrato.bandeiras[k] & BANDEIRA.EM_OBRA)) qg = retrato.id[k];
      if (cat.ehColetor(tipo) && retrato.bandeiras[k] & BANDEIRA.OCIOSA) ociosos.push(retrato.id[k]);
    }
    if (retrato.lotacao && retrato.lotacao.length >= 2 * (jogador + 1) && retrato.lotacao[2 * jogador + 1] > 0) {
      lotacao.usada = retrato.lotacao[2 * jogador];
      lotacao.teto = retrato.lotacao[2 * jogador + 1];
    } else {
      lotacao.usada = 0;
      lotacao.teto = TETO_PADRAO;
    }
    lerFilas(retrato.filas ?? [], producoes);
  }

  return {
    atualizar,
    get carga() {
      return carga;
    },
    get lotacao() {
      return lotacao;
    },
    /** Queue of a building, or null when it is not a producer of the local player. */
    producao: id => producoes.get(id) ?? null,
    /** Every producer of the local player and its queue. */
    get producoes() {
      return producoes;
    },
    /** Idle harvesters of the local player, in slot order. */
    get ociosos() {
      return ociosos;
    },
    /** The local player's finished headquarters, or -1. */
    get qg() {
      return qg;
    },
  };
}
