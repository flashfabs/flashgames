// Combat: target acquisition from the spatial buckets on a staggered schedule, reload, damage and death.
// An ATACAR order forces its target whenever it is in range.
import { EVENTO, TIPO_COMANDO } from './contratos.js';
import { TAMANHO_BALDE_BITS } from './movimento.js';
import { slotVivo, emitirEvento, matar } from './entidades.js';

// retarget every few ticks per unit, staggered by slot, so the search cost spreads over time
const INTERVALO_BUSCA = 6;

// Closest enemy in range (ties to the lowest slot), or -1. Distances in 1/16 world units keep the squares small.
function procurarAlvo(sim, i, alcance, linhas) {
  const { baldeCabeca, baldeProximo, baldeLargura, ativo, time, x, y } = sim;
  const alcance2 = alcance * alcance;
  const r = (alcance >> TAMANHO_BALDE_BITS) + 1;
  const xi = x[i];
  const yi = y[i];
  const meuTime = time[i];
  const bx = xi >> TAMANHO_BALDE_BITS;
  const by = yi >> TAMANHO_BALDE_BITS;
  const y1 = Math.min(linhas - 1, by + r);
  const x0 = Math.max(0, bx - r);
  const x1 = Math.min(baldeLargura - 1, bx + r);
  let melhor = -1;
  let melhorD = alcance2 + 1;
  for (let yb = Math.max(0, by - r); yb <= y1; yb++) {
    for (let xb = x0; xb <= x1; xb++) {
      for (let j = baldeCabeca[yb * baldeLargura + xb]; j >= 0; j = baldeProximo[j]) {
        if (time[j] === meuTime || !ativo[j]) continue;
        const dx = (x[j] - xi) >> 4;
        const dy = (y[j] - yi) >> 4;
        const d = dx * dx + dy * dy;
        if (d < melhorD || (d === melhorD && j < melhor)) {
          melhorD = d;
          melhor = j;
        }
      }
    }
  }
  return melhorD <= alcance2 >> 8 ? melhor : -1;
}

function noAlcance(sim, i, j, alcance) {
  const dx = (sim.x[j] - sim.x[i]) >> 4;
  const dy = (sim.y[j] - sim.y[i]) >> 4;
  return dx * dx + dy * dy <= (alcance * alcance) >> 8;
}

/** Aims, reloads and fires for every live unit, in slot order. */
export function combater(sim) {
  const ord = sim.ordens;
  const linhas = Math.trunc(sim.baldeCabeca.length / sim.baldeLargura);
  for (let i = 0; i < sim.capacidade; i++) {
    if (!sim.ativo[i]) continue;
    if (sim.recarga[i] > 0) sim.recarga[i]--;
    const tipo = sim.tipos[sim.tipo[i]];
    let alvo = sim.alvo[i];
    if (alvo >= 0 && (!sim.ativo[alvo] || !noAlcance(sim, i, alvo, tipo.alcance))) alvo = -1;
    const o = ord.ordem[i];
    if (o >= 0 && ord.modo[o] === TIPO_COMANDO.ATACAR) {
      const ordenado = slotVivo(sim, ord.alvo[o]);
      if (ordenado >= 0 && noAlcance(sim, i, ordenado, tipo.alcance)) alvo = ordenado;
    }
    if (alvo < 0 && (sim.tick + i) % INTERVALO_BUSCA === 0) alvo = procurarAlvo(sim, i, tipo.alcance, linhas);
    sim.alvo[i] = alvo;
    if (alvo < 0 || sim.recarga[i] > 0) continue;
    sim.recarga[i] = tipo.recarga;
    sim.vida[alvo] -= tipo.dano;
    emitirEvento(sim, EVENTO.TIRO, i, alvo, sim.tipo[i]);
    if (sim.vida[alvo] <= 0) matar(sim, alvo, i);
  }
}
