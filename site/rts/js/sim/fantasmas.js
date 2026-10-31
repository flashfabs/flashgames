// Building ghosts (C4): each team remembers the buildings, piles and map structures of others it has seen, as it last
// saw them, so the team view and the snapshot show them under the fog. A ghost is refreshed while its cell is
// visible, and dropped when the team sees its cell again and the entity is gone (destroyed, or another in its slot).
import { FP_BITS, CATEGORIA, alocarFantasmas, idDe } from './contratos.js';
import { registrarExtras } from './estado.js';
import { celulaVisivel } from './neblina.js';
import { slotVivo } from './entidades.js';

/** Ghosts a team keeps; beyond this, new sightings are not remembered. */
export const MAX_FANTASMAS = 512;
const CAMPOS = ['id', 'tipo', 'dono', 'x', 'y', 'vida', 'carga'];

registrarExtras('fantasmas', sim => {
  const total = sim.times * MAX_FANTASMAS;
  const grupo = { n: new Int32Array(sim.times) };
  for (const campo of CAMPOS) grupo[campo] = new Int32Array(total);
  return grupo;
});

const lembravel = categoria => categoria === CATEGORIA.PREDIO || categoria === CATEGORIA.RECURSO || categoria === CATEGORIA.ESTRUTURA;
const celulaDe = (sim, x, y) => (y >> FP_BITS) * sim.mapa.largura + (x >> FP_BITS);

// Snapshot fractions 0..255 of health and of Carga left.
function fracaoVida(sim, i) {
  return Math.max(1, Math.min(255, Math.trunc((sim.vida[i] * 255) / sim.tipos[sim.tipo[i]].vida)));
}
function fracaoCarga(sim, i) {
  return sim.cargaMaxima[i] > 0 ? Math.min(255, Math.trunc((sim.carga[i] * 255) / sim.cargaMaxima[i])) : 0;
}

/** Every team updates its ghosts, in team order then slot order. */
export function atualizarFantasmas(sim) {
  const g = sim.extras.fantasmas;
  const listas = [sim.listas.predios, sim.listas.recursos, sim.listas.estruturas];
  let algo = listas[0].n + listas[1].n + listas[2].n;
  for (let t = 0; t < sim.times; t++) algo += g.n[t];
  if (algo === 0) return;
  for (let t = 0; t < sim.times; t++) {
    const base = t * MAX_FANTASMAS;
    // forget what is seen to be gone
    for (let k = 0; k < g.n[t]; ) {
      const p = base + k;
      if (celulaVisivel(sim, t, celulaDe(sim, g.x[p], g.y[p])) && slotVivo(sim, g.id[p]) < 0) {
        const ultimo = base + g.n[t] - 1;
        for (const campo of CAMPOS) g[campo][p] = g[campo][ultimo];
        g.n[t]--;
        continue;
      }
      k++;
    }
    // remember what is seen now: buildings, piles and map structures, from the tick's lists
    for (const { itens, n } of listas) for (let k = 0; k < n; k++) {
      const i = itens[k];
      if (!sim.ativo[i] || sim.time[i] === t || !lembravel(sim.categoriaPorTipo[sim.tipo[i]])) continue;
      if (!celulaVisivel(sim, t, celulaDe(sim, sim.x[i], sim.y[i]))) continue;
      const id = idDe(i, sim.geracao[i]);
      let p = -1;
      for (let q = 0; q < g.n[t]; q++) {
        if (g.id[base + q] === id) {
          p = base + q;
          break;
        }
      }
      if (p < 0) {
        if (g.n[t] >= MAX_FANTASMAS) continue;
        p = base + g.n[t]++;
      }
      g.id[p] = id;
      g.tipo[p] = sim.tipo[i];
      g.dono[p] = sim.time[i];
      g.x[p] = sim.x[i];
      g.y[p] = sim.y[i];
      g.vida[p] = fracaoVida(sim, i);
      g.carga[p] = fracaoCarga(sim, i);
    }
  }
}

/** The ghosts of team `time` on cells it does not see now, in the CAMPOS_FANTASMA layout. */
export function fantasmasDoTime(sim, time) {
  const g = sim.extras.fantasmas;
  if (time < 0 || time >= sim.times) return alocarFantasmas(0);
  const base = time * MAX_FANTASMAS;
  const lista = [];
  for (let k = 0; k < g.n[time]; k++) if (!celulaVisivel(sim, time, celulaDe(sim, g.x[base + k], g.y[base + k]))) lista.push(base + k);
  const r = alocarFantasmas(lista.length);
  lista.forEach((p, k) => {
    for (const campo of CAMPOS) r[campo][k] = g[campo][p];
  });
  return r;
}

export { fracaoCarga };
