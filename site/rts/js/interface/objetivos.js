// Mission objectives in a corner: the mission (C7) lists them, OBJETIVO events (C3) say when one shows, is done or
// failed (arg = objective index * 4 + state, as the trigger evaluator sends them), and the list keeps main objectives
// before optional ones (whose C11 text already says so). Hidden objectives stay off the list until the mission
// activates them; one that just changed is marked for a few seconds, so the eye finds it.
import { EVENTO, TAMANHO_EVENTO, E_TIPO, E_ARG } from '../sim/contratos.js';

/** Objective states as the evaluator counts them. */
export const ESTADO_DO_OBJETIVO = Object.freeze({ OCULTO: 0, ATIVO: 1, CUMPRIDO: 2, FALHOU: 3 });
const MARCAS = { [ESTADO_DO_OBJETIVO.ATIVO]: '○', [ESTADO_DO_OBJETIVO.CUMPRIDO]: '✓', [ESTADO_DO_OBJETIVO.FALHOU]: '✗' };
/** How long an objective that just changed stays marked (ms). */
const DESTAQUE_MS = 5000;

/** Objective states after this snapshot's OBJETIVO events; returns the indices that changed (empty when none). */
export function aplicarObjetivos(estados, eventos) {
  const mudaram = [];
  for (let o = 0; o + TAMANHO_EVENTO <= eventos.length; o += TAMANHO_EVENTO) {
    if (eventos[o + E_TIPO] !== EVENTO.OBJETIVO) continue;
    const arg = eventos[o + E_ARG];
    const indice = arg >> 2;
    if (indice >= estados.length) continue;
    estados[indice] = arg & 3;
    mudaram.push(indice);
  }
  return mudaram;
}

/** Done and total of main and optional objectives, for the end screen (hidden optional ones count in the total). */
export function contarObjetivos(objetivos, estados) {
  const conta = { principais: { feitos: 0, total: 0 }, opcionais: { feitos: 0, total: 0 } };
  objetivos.forEach((o, i) => {
    const grupo = o.tipo === 'opcional' ? conta.opcionais : conta.principais;
    grupo.total += 1;
    if (estados[i] === ESTADO_DO_OBJETIVO.CUMPRIDO) grupo.feitos += 1;
  });
  return conta;
}

/**
 * @param {object} opcoes
 * @param {HTMLElement} opcoes.raiz
 * @param {{id: string, texto: string, tipo: string}[]} opcoes.objetivos the mission's list, or [] without a mission
 */
export function criarObjetivos({ raiz, objetivos, texto, agora = () => performance.now() }) {
  const estados = new Array(objetivos.length).fill(ESTADO_DO_OBJETIVO.OCULTO);
  // index -> until when it is marked as just changed
  const destaques = new Map();
  let proximoDesenho = Infinity;

  function desenhar() {
    const instante = agora();
    for (const [i, ate] of destaques) if (ate <= instante) destaques.delete(i);
    proximoDesenho = destaques.size ? Math.min(...destaques.values()) : Infinity;
    const visiveis = objetivos
      .map((o, i) => ({ ...o, estado: estados[i], novo: destaques.has(i) }))
      .filter(o => o.estado !== ESTADO_DO_OBJETIVO.OCULTO)
      .sort((a, b) => (a.tipo === 'opcional') - (b.tipo === 'opcional'));
    raiz.hidden = visiveis.length === 0;
    raiz.innerHTML = `<b>${texto('hud.objetivos')}</b><ul>${visiveis
      .map(o => `<li data-estado="${o.estado}" data-tipo="${o.tipo}" data-novo="${o.novo}"><span aria-hidden="true">${MARCAS[o.estado]}</span> ${texto(o.texto)}</li>`)
      .join('')}</ul>`;
  }

  return {
    /** Reads one snapshot's events. */
    registrar(eventos) {
      const mudaram = aplicarObjetivos(estados, eventos);
      if (mudaram.length === 0) {
        if (agora() >= proximoDesenho) desenhar();
        return;
      }
      for (const i of mudaram) destaques.set(i, agora() + DESTAQUE_MS);
      desenhar();
    },
    /** Back to nothing shown (a restarted match). */
    reiniciar() {
      estados.fill(ESTADO_DO_OBJETIVO.OCULTO);
      destaques.clear();
      desenhar();
    },
    /** Done and total of main and optional objectives. */
    contar: () => contarObjetivos(objetivos, estados),
    get estados() {
      return estados.slice();
    },
  };
}
