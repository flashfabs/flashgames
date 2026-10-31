// Mission objectives in a corner: the mission (C7) lists them, OBJETIVO events (C3) say when one shows, is done or
// failed (arg = objective index * 4 + state, as the trigger evaluator sends them), and the list keeps main objectives
// before optional ones (whose C11 text already says so). Hidden objectives stay off the list until the mission
// activates them.
import { EVENTO, TAMANHO_EVENTO, E_TIPO, E_ARG } from '../sim/contratos.js';

/** Objective states as the evaluator counts them. */
export const ESTADO_DO_OBJETIVO = Object.freeze({ OCULTO: 0, ATIVO: 1, CUMPRIDO: 2, FALHOU: 3 });
const MARCAS = { [ESTADO_DO_OBJETIVO.ATIVO]: '○', [ESTADO_DO_OBJETIVO.CUMPRIDO]: '✓', [ESTADO_DO_OBJETIVO.FALHOU]: '✗' };

/** Objective states after this snapshot's OBJETIVO events; returns whether any changed. */
export function aplicarObjetivos(estados, eventos) {
  let mudou = false;
  for (let o = 0; o + TAMANHO_EVENTO <= eventos.length; o += TAMANHO_EVENTO) {
    if (eventos[o + E_TIPO] !== EVENTO.OBJETIVO) continue;
    const arg = eventos[o + E_ARG];
    const indice = arg >> 2;
    if (indice >= estados.length) continue;
    estados[indice] = arg & 3;
    mudou = true;
  }
  return mudou;
}

/**
 * @param {object} opcoes
 * @param {HTMLElement} opcoes.raiz
 * @param {{id: string, texto: string, tipo: string}[]} opcoes.objetivos the mission's list, or [] without a mission
 */
export function criarObjetivos({ raiz, objetivos, texto }) {
  const estados = new Array(objetivos.length).fill(ESTADO_DO_OBJETIVO.OCULTO);

  function desenhar() {
    const visiveis = objetivos
      .map((o, i) => ({ ...o, estado: estados[i] }))
      .filter(o => o.estado !== ESTADO_DO_OBJETIVO.OCULTO)
      .sort((a, b) => (a.tipo === 'opcional') - (b.tipo === 'opcional'));
    raiz.hidden = visiveis.length === 0;
    raiz.innerHTML = `<b>${texto('hud.objetivos')}</b><ul>${visiveis
      .map(o => `<li data-estado="${o.estado}" data-tipo="${o.tipo}"><span aria-hidden="true">${MARCAS[o.estado]}</span> ${texto(o.texto)}</li>`)
      .join('')}</ul>`;
  }

  return {
    /** Reads one snapshot's events. */
    registrar(eventos) {
      if (aplicarObjetivos(estados, eventos)) desenhar();
    },
    get estados() {
      return estados.slice();
    },
  };
}
