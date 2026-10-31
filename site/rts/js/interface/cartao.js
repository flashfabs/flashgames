// The command card: what the Q W E R / A S D F grid offers for the current selection. Units get the orders in fixed
// places (Q move, R patrol, A attack-move, S stop, D hold) and, when they raise buildings on site, those buildings in
// the free places; a building gets what it trains and researches, and the headquarters what it builds, in the order
// of the game data. Pure: the caller renders and runs it.
import { ACAO } from '../entrada/teclas.js';
import { MAX_FILA, ITEM_PESQUISA } from '../sim/contratos.js';

/** Physical keys of the grid, slot by slot, row by row. */
export const TECLAS_DA_GRADE = Object.freeze(['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyA', 'KeyS', 'KeyD', 'KeyF']);
export const LETRAS_DA_GRADE = Object.freeze(['Q', 'W', 'E', 'R', 'A', 'S', 'D', 'F']);
/** Items a building lane holds; the simulation refuses the rest. */
export const MAXIMO_DA_FILA = MAX_FILA;

const ORDENS_DE_UNIDADE = Object.freeze([
  { slot: 0, acao: ACAO.MOVER, texto: 'comando.mover' },
  { slot: 3, acao: ACAO.PATRULHAR, texto: 'comando.patrulhar' },
  { slot: 4, acao: ACAO.ATACAR_MOVENDO, texto: 'comando.atacar_mover' },
  { slot: 5, acao: ACAO.PARAR, texto: 'comando.parar' },
  { slot: 6, acao: ACAO.SEGURAR, texto: 'comando.segurar' },
]);
/** Places of the unit card left for buildings raised on site: W, E and F. */
const LIVRES_NA_UNIDADE = Object.freeze([1, 2, 7]);

/**
 * @typedef {object} SlotDoCartao
 * @property {number} slot          0..7
 * @property {string} [acao]        ACAO.* for unit orders
 * @property {string} [texto]       text id of the label (unit orders)
 * @property {'produzir'|'pesquisar'|'construir'|'posicionar'|'erguer'} [modo]
 * @property {number} [tipo]        kind to train, build or raise (-1 for research)
 * @property {number} [pesquisa]    research index (modo 'pesquisar')
 * @property {number} [custo]
 * @property {number} [quantidade]  items of this kind queued in the selected buildings
 * @property {number} [progresso]   0..1 of the item being made, -1 when none of this kind is in progress
 * @property {string|null} [falta]  'carga', 'lotacao' or 'fila' when the simulation would refuse it now
 */

/**
 * Card for the selection.
 * @param {object} entrada
 * @param {{id: number, tipo: number}[]} entrada.selecao  own entities in the selection
 * @param {ReturnType<typeof import('./catalogo.js').criarCatalogo>} entrada.catalogo
 * @param {(id: number) => import('./leitura.js').ProducaoDoPredio | null} entrada.producao
 * @param {number} entrada.carga
 * @param {{usada: number, teto: number}} entrada.lotacao
 * @returns {{tipo: 'vazio'|'unidades'|'predio', slots: (SlotDoCartao|null)[], predios: number[], construtores: number[], tipoDoPredio: number}}
 */
export function montarCartao({ selecao, catalogo, producao, carga, lotacao }) {
  const slots = new Array(TECLAS_DA_GRADE.length).fill(null);
  const unidades = selecao.filter(e => catalogo.ehUnidade(e.tipo));
  if (unidades.length) {
    for (const ordem of ORDENS_DE_UNIDADE) slots[ordem.slot] = { ...ordem };
    // Buildings the selected units can raise on site; the first unit able to raise it goes.
    const ergue = [...new Set(unidades.flatMap(e => catalogo.info(e.tipo).ergue))];
    ergue.slice(0, LIVRES_NA_UNIDADE.length).forEach((tipo, i) => {
      const custo = catalogo.info(tipo).custo;
      slots[LIVRES_NA_UNIDADE[i]] = { slot: LIVRES_NA_UNIDADE[i], modo: 'erguer', tipo, custo, quantidade: 0, progresso: -1, falta: carga < custo ? 'carga' : null };
    });
    const construtores = unidades.filter(e => catalogo.info(e.tipo).ergue.length > 0).map(e => e.id);
    return { tipo: 'unidades', slots, predios: [], construtores, tipoDoPredio: -1 };
  }
  const primeiro = selecao.find(e => catalogo.ehPredio(e.tipo));
  if (!primeiro) return { tipo: 'vazio', slots, predios: [], construtores: [], tipoDoPredio: -1 };
  // Several buildings of the first one's kind work as one: the card counts their queues together.
  const predios = selecao.filter(e => e.tipo === primeiro.tipo).map(e => e.id);
  const info = catalogo.info(primeiro.tipo);
  const filas = predios.map(id => producao(id) ?? { fila: [], obras: [], obra: null, pronto: -1 });
  const cheias = filas.every(p => p.fila.length >= MAXIMO_DA_FILA);

  /** Count and head progress of `item` (a kind, or research as ITEM_PESQUISA + index) in the given lane of every building. */
  function naFila(faixa, item) {
    let quantidade = 0;
    let progresso = -1;
    for (const p of filas) {
      p[faixa].forEach((entrada, posicao) => {
        if (entrada.item !== item) return;
        quantidade += 1;
        if (posicao === 0) progresso = Math.max(progresso, entrada.progresso);
      });
    }
    return { quantidade, progresso };
  }

  let slot = 0;
  for (const tipo of info.produz) {
    if (slot >= slots.length) break;
    const dados = catalogo.info(tipo);
    const falta = carga < dados.custo ? 'carga' : lotacao.usada + dados.lotacao > lotacao.teto ? 'lotacao' : cheias ? 'fila' : null;
    slots[slot] = { slot, tipo, modo: 'produzir', custo: dados.custo, ...naFila('fila', tipo), falta };
    slot += 1;
  }
  for (const pesquisa of catalogo.pesquisasDe(primeiro.tipo)) {
    if (slot >= slots.length) break;
    const falta = carga < pesquisa.custo ? 'carga' : cheias ? 'fila' : null;
    slots[slot] = { slot, tipo: -1, pesquisa: pesquisa.indice, modo: 'pesquisar', custo: pesquisa.custo, ...naFila('fila', ITEM_PESQUISA + pesquisa.indice), falta };
    slot += 1;
  }
  // The headquarters queues buildings in its construction lane; the head waits to be placed once ready.
  if (info.constroi.length > 0) {
    const sede = filas[0];
    const obrasCheias = sede.obras.length >= MAXIMO_DA_FILA;
    for (const tipo of info.constroi) {
      if (slot >= slots.length) break;
      const custo = catalogo.info(tipo).custo;
      if (sede.pronto === tipo) {
        slots[slot] = { slot, tipo, modo: 'posicionar', custo, quantidade: naFila('obras', tipo).quantidade, progresso: 1, falta: null };
      } else {
        const fila = naFila('obras', tipo);
        slots[slot] = { slot, tipo, modo: 'construir', custo, ...fila, falta: carga < custo ? 'carga' : obrasCheias ? 'fila' : null };
      }
      slot += 1;
    }
  }
  return { tipo: 'predio', slots, predios, construtores: [], tipoDoPredio: primeiro.tipo };
}
