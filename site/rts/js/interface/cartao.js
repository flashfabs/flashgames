// The command card: what the Q W E R / A S D F grid offers for the current selection. Units get the orders in fixed
// places (Q move, R patrol, A attack-move, S stop, D hold), so the hand learns them once; a building gets what it
// trains, and the headquarters what it builds, in the order of the game data. Pure: the caller renders and runs it.
import { ACAO } from '../entrada/teclas.js';

/** Physical keys of the grid, slot by slot, row by row. */
export const TECLAS_DA_GRADE = Object.freeze(['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyA', 'KeyS', 'KeyD', 'KeyF']);
export const LETRAS_DA_GRADE = Object.freeze(['Q', 'W', 'E', 'R', 'A', 'S', 'D', 'F']);
/** Items a building queue holds; the simulation drops the rest. */
export const MAXIMO_DA_FILA = 5;

const ORDENS_DE_UNIDADE = Object.freeze([
  { slot: 0, acao: ACAO.MOVER, texto: 'comando.mover' },
  { slot: 3, acao: ACAO.PATRULHAR, texto: 'comando.patrulhar' },
  { slot: 4, acao: ACAO.ATACAR_MOVENDO, texto: 'comando.atacar_mover' },
  { slot: 5, acao: ACAO.PARAR, texto: 'comando.parar' },
  { slot: 6, acao: ACAO.SEGURAR, texto: 'comando.segurar' },
]);

/**
 * @typedef {object} SlotDoCartao
 * @property {number} slot          0..7
 * @property {string} [acao]        ACAO.* for unit orders
 * @property {string} [texto]       text id of the label (unit orders)
 * @property {number} [tipo]        kind to train or build
 * @property {'produzir'|'construir'|'posicionar'} [modo]
 * @property {number} [custo]
 * @property {number} [quantidade]  items of this kind queued in the selected buildings
 * @property {number} [progresso]   0..1 of the item being made, -1 when none of this kind is in progress
 * @property {string|null} [falta]  'carga', 'lotacao' or 'fila' when the simulation would refuse it now
 * @property {boolean} [ocupado]    another building is in progress at the headquarters
 */

/**
 * @typedef {object} ProducaoDoPredio
 * @property {{tipo: number, progresso: number}[]} fila  units being trained, head first; progresso 0..1 for the head
 * @property {{tipo: number, progresso: number} | null} obra  building being built by the headquarters
 * @property {number} pronto  building kind finished and waiting to be placed, -1 when none
 */

/**
 * Card for the selection.
 * @param {object} entrada
 * @param {{id: number, tipo: number}[]} entrada.selecao  own entities in the selection
 * @param {ReturnType<typeof import('./catalogo.js').criarCatalogo>} entrada.catalogo
 * @param {(id: number) => ProducaoDoPredio | null} entrada.producao
 * @param {number} entrada.carga
 * @param {{usada: number, teto: number}} entrada.lotacao
 * @returns {{tipo: 'vazio'|'unidades'|'predio', slots: (SlotDoCartao|null)[], predios: number[], tipoDoPredio: number}}
 */
export function montarCartao({ selecao, catalogo, producao, carga, lotacao }) {
  const slots = new Array(TECLAS_DA_GRADE.length).fill(null);
  if (selecao.some(e => catalogo.ehUnidade(e.tipo))) {
    for (const ordem of ORDENS_DE_UNIDADE) slots[ordem.slot] = { ...ordem };
    return { tipo: 'unidades', slots, predios: [], tipoDoPredio: -1 };
  }
  const primeiro = selecao.find(e => catalogo.ehPredio(e.tipo));
  if (!primeiro) return { tipo: 'vazio', slots, predios: [], tipoDoPredio: -1 };
  // Several buildings of the first one's kind work as one: the card counts their queues together.
  const predios = selecao.filter(e => e.tipo === primeiro.tipo).map(e => e.id);
  const info = catalogo.info(primeiro.tipo);
  const filas = predios.map(id => producao(id) ?? { fila: [], obra: null, pronto: -1 });
  const cheias = filas.every(p => p.fila.length >= MAXIMO_DA_FILA);

  info.produz.slice(0, slots.length).forEach((tipo, slot) => {
    const dados = catalogo.info(tipo);
    let quantidade = 0;
    let progresso = -1;
    for (const p of filas) {
      p.fila.forEach((item, posicao) => {
        if (item.tipo !== tipo) return;
        quantidade += 1;
        if (posicao === 0) progresso = Math.max(progresso, item.progresso);
      });
    }
    const falta = carga < dados.custo ? 'carga' : lotacao.usada + dados.lotacao > lotacao.teto ? 'lotacao' : cheias ? 'fila' : null;
    slots[slot] = { slot, tipo, modo: 'produzir', custo: dados.custo, quantidade, progresso, falta };
  });

  // The headquarters builds one building at a time and then waits for it to be placed.
  if (info.constroi.length > 0) {
    const fila = filas[0];
    const emObra = fila.obra?.tipo ?? -1;
    const deslocamento = info.produz.length;
    info.constroi.slice(0, slots.length - deslocamento).forEach((tipo, i) => {
      const slot = deslocamento + i;
      const dados = catalogo.info(tipo);
      if (fila.pronto === tipo) {
        slots[slot] = { slot, tipo, modo: 'posicionar', custo: dados.custo, quantidade: 1, progresso: 1, falta: null };
        return;
      }
      const ocupado = fila.pronto !== -1 || (emObra !== -1 && emObra !== tipo);
      const progresso = emObra === tipo ? fila.obra.progresso : -1;
      const falta = progresso < 0 && carga < dados.custo ? 'carga' : null;
      slots[slot] = { slot, tipo, modo: 'construir', custo: dados.custo, quantidade: progresso < 0 ? 0 : 1, progresso, falta, ocupado };
    });
  }
  return { tipo: 'predio', slots, predios, tipoDoPredio: primeiro.tipo };
}

/** The building among `predios` with the shortest queue, the one that should take the next item. */
export function predioComMenorFila(predios, producao) {
  let melhor = predios[0] ?? -1;
  let menor = Infinity;
  for (const id of predios) {
    const tamanho = producao(id)?.fila.length ?? 0;
    if (tamanho < menor) {
      menor = tamanho;
      melhor = id;
    }
  }
  return melhor;
}
