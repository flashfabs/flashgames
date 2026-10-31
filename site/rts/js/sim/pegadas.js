// Footprints: buildings, building sites, piles and map structures block the cells under them in the grid that flow
// fields, movement and orders read (sim.grade), on top of the terrain. A footprint is a rectangle of cells whose centre
// is the entity's position, so its top-left cell follows from the position and the kind's size.
import { FP, FP_BITS, CATEGORIA } from './contratos.js';
import { atualizarPedagio, invalidarCampos } from './caminhos.js';

/** Work units a tick of full speed adds to a building site or a production lane. */
export const RITMO_OBRA = 100;

/** Work units a building site of kind `tipo` needs. */
export const trabalhoDaObra = tipo => Math.max(1, tipo.tempo) * RITMO_OBRA;

/** Whether entities of this category stand on a footprint that blocks the ground. */
export const temPegada = categoria => categoria === CATEGORIA.PREDIO || categoria === CATEGORIA.RECURSO || categoria === CATEGORIA.ESTRUTURA;

/** World coordinate of the centre of a footprint `tamanho` cells wide starting at cell `celula`. */
export const centroDaPegada = (celula, tamanho) => celula * FP + ((tamanho * FP) >> 1);

/** Top-left cell of a footprint `tamanho` cells wide centred on world coordinate `centro`. */
export const cantoDaPegada = (centro, tamanho) => (centro >> FP_BITS) - (tamanho >> 1);

/** Adds (sinal = 1) or removes (sinal = -1) the footprint of slot i from the grid. */
export function carimbarPegada(sim, i, sinal) {
  const [largura, altura] = sim.tipos[sim.tipo[i]].pegada;
  const x0 = cantoDaPegada(sim.x[i], largura);
  const y0 = cantoDaPegada(sim.y[i], altura);
  const { grade, pegadas } = sim;
  const terreno = sim.mapa.bloqueado;
  for (let y = y0; y < y0 + altura; y++) {
    for (let x = x0; x < x0 + largura; x++) {
      const c = y * grade.largura + x;
      pegadas[c] += sinal;
      grade.bloqueado[c] = terreno[c] || pegadas[c] > 0 ? 1 : 0;
    }
  }
  atualizarPedagio(sim.caminhos, x0, y0, x0 + largura - 1, y0 + altura - 1);
  sim.gradeMudou = 1;
}

/** Rebuilds the grid from the terrain and every live footprint (after loading a saved state). */
export function reconstruirGrade(sim) {
  sim.pegadas.fill(0);
  sim.grade.bloqueado.set(sim.mapa.bloqueado);
  for (let i = 0; i < sim.capacidade; i++) if (sim.ativo[i] && temPegada(sim.categoriaPorTipo[sim.tipo[i]])) carimbarPegada(sim, i, 1);
  atualizarPedagio(sim.caminhos, 0, 0, sim.grade.largura - 1, sim.grade.altura - 1);
  sim.gradeMudou = 0;
}

/** End of tick: when footprints changed, the flow fields start over on the new grid. */
export function aplicarMudancasDaGrade(sim) {
  if (!sim.gradeMudou) return;
  invalidarCampos(sim.caminhos);
  sim.gradeMudou = 0;
}
