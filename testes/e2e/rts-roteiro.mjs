// A scripted player for the grey slice end-to-end tests: given a decoded snapshot (window.__rts.retrato(), or
// decodificarRetrato in Node), it returns the commands a plain defensive player would give now. The same function
// drives the browser test and a Node run of the real simulation, so a plan tuned in Node is the plan the test plays.
// Plan: an accumulator (the depot) and two barracks from the headquarters, harvesters on the nearest pile once the
// depot stands, lost harvesters replaced before anything else, every barracks always training a squad, and the
// squads held next to that pile, which is what the waves go for, so the income survives them; enemies that come
// near the headquarters or the pile are chased down by every squad standing idle.

import { BANDEIRA, CATEGORIA } from '../../site/rts/js/sim/contratos.js';

/** Seconds of game between two decisions. */
export const DECISAO_SEGUNDOS = 5;
const PLANO = ['acumulador', 'alojamento-da-turma', 'alojamento-da-turma'];
// spots for a new building around the headquarters, in cells, tried in turn until one is accepted
const LUGARES = [[4, -6], [5, -1], [-2, -7], [5, 3], [-6, -6], [1, -10], [8, -5], [8, 0], [-4, 3], [3, 6], [9, -9], [-1, 7]];
// the guard point sits on the line from the harvested pile to the headquarters, this share of the way
const GUARDA_PARA_O_QG = 0.25;
// enemies this close to the headquarters or to the harvested pile are chased
const RAIO_AMEACA = 16 * 1024;
const CELULA = 1024;
const { PARADA, OCIOSA } = BANDEIRA;

/** New state for one match. */
export function criarRoteiro() {
  return { proximo: 0, lugar: 0, decisoes: 0 };
}

const custoDe = (tipos, nome) => tipos.find(t => t.nome === nome)?.custo ?? 0;

/**
 * Commands for this moment of the match: [{ tipo: name of TIPO_COMANDO, unidades, alvo, x, y, arg }].
 * @param {object} r decoded snapshot with kind names (entidades[].nome) and queues (filas)
 * @param {object} roteiro state from criarRoteiro, updated in place
 * @param {{tipos: {nome: string, custo: number}[]}} mapa the static map (kinds by index)
 */
export function decidir(r, roteiro, mapa) {
  const comandos = [];
  const tipoDe = nome => mapa.tipos.findIndex(t => t.nome === nome);
  const minhas = nome => r.entidades.filter(e => e.dono === 0 && e.nome === nome);
  const qg = minhas('escritorio-regional')[0];
  if (!qg) return comandos;
  let carga = r.recursos[0];
  const fila = id => r.filas.find(f => f.produtor === id);
  const filaQg = fila(qg.id);
  roteiro.decisoes++;

  // the headquarters' construction lane: place what is ready, else queue the next building of the plan
  const construcao = filaQg?.faixas.CONSTRUCAO;
  if (construcao?.estado === 'PRONTO') {
    const [dx, dy] = LUGARES[roteiro.lugar++ % LUGARES.length];
    comandos.push({ tipo: 'CONSTRUIR', unidades: [qg.id], arg: tipoDe(construcao.itens[0]), x: qg.x + dx * CELULA, y: qg.y + dy * CELULA });
  } else if (construcao && construcao.itens.length === 0 && roteiro.proximo < PLANO.length && carga >= custoDe(mapa.tipos, PLANO[roteiro.proximo])) {
    const nome = PLANO[roteiro.proximo++];
    carga -= custoDe(mapa.tipos, nome);
    comandos.push({ tipo: 'PRODUZIR', unidades: [qg.id], arg: tipoDe(nome) });
  }

  // harvesters work once a depot stands
  const pilha = r.entidades.filter(e => e.nome === 'pilha' && e.carga > 0).sort((a, b) => Math.hypot(a.x - qg.x, a.y - qg.y) - Math.hypot(b.x - qg.x, b.y - qg.y))[0];
  if (minhas('acumulador').some(a => a.progresso === 255)) {
    const ociosos = r.entidades.filter(e => e.dono === 0 && e.nome === 'guincho-de-celulas' && (e.bandeiras & OCIOSA)).map(e => e.id);
    if (ociosos.length > 0 && pilha) comandos.push({ tipo: 'COLETAR', unidades: ociosos, alvo: pilha.id });
  }

  // three harvesters before anything else: without them there is no army either
  const custoGuincho = custoDe(mapa.tipos, 'guincho-de-celulas');
  const faltamGuinchos = minhas('guincho-de-celulas').length < 3;
  if (faltamGuinchos && filaQg?.faixas.UNIDADES.itens.length === 0 && carga >= custoGuincho) {
    carga -= custoGuincho;
    comandos.push({ tipo: 'PRODUZIR', unidades: [qg.id], arg: tipoDe('guincho-de-celulas') });
  }
  // every finished barracks always trains a squad, keeping the price of a harvester while one is missing
  const turma = tipoDe('turma-de-linha');
  const reserva = faltamGuinchos ? custoGuincho : 0;
  for (const alojamento of minhas('alojamento-da-turma')) {
    const faixa = fila(alojamento.id)?.faixas.UNIDADES;
    if (alojamento.progresso === 255 && faixa && faixa.itens.length === 0 && carga - reserva >= custoDe(mapa.tipos, 'turma-de-linha')) {
      carga -= custoDe(mapa.tipos, 'turma-de-linha');
      comandos.push({ tipo: 'PRODUZIR', unidades: [alojamento.id], arg: turma });
    }
  }

  // idle squads chase the nearest enemy near the base or the pile, else go back to the guard point
  const base = pilha ?? qg;
  const guarda = { x: Math.round(base.x + (qg.x - base.x) * GUARDA_PARA_O_QG), y: Math.round(base.y + (qg.y - base.y) * GUARDA_PARA_O_QG) };
  const perto = (e, alvo) => Math.hypot(e.x - alvo.x, e.y - alvo.y) <= RAIO_AMEACA;
  const ameaca = r.entidades
    .filter(e => e.dono === 1 && mapa.tipos[e.tipo]?.categoria === CATEGORIA.UNIDADE && (perto(e, qg) || perto(e, guarda)))
    .sort((a, b) => Math.hypot(a.x - qg.x, a.y - qg.y) - Math.hypot(b.x - qg.x, b.y - qg.y))[0];
  const paradas = minhas('turma-de-linha').filter(e => e.bandeiras & PARADA);
  if (ameaca && paradas.length > 0) {
    comandos.push({ tipo: 'ATACAR_MOVENDO', unidades: paradas.map(e => e.id), x: ameaca.x, y: ameaca.y });
  } else if (roteiro.decisoes % 2 === 0) {
    const longe = paradas.filter(e => Math.hypot(e.x - guarda.x, e.y - guarda.y) > 4 * CELULA).map(e => e.id);
    if (longe.length > 0) comandos.push({ tipo: 'ATACAR_MOVENDO', unidades: longe, x: guarda.x, y: guarda.y });
  }
  return comandos;
}
