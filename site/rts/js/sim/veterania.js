// Veterancy: experience from damage dealt (in proportion to the victim's cost, so a kill is worth about what the
// victim cost), from harvester trips and from health repaired; three levels at thresholds in percent of the unit's own
// cost, each with damage, resistance and reload bonuses from the combat rules (armas.js). Experience and level live in
// the entity arrays `experiencia` and `veterania`, reset when a slot takes a new entity.
import { EVENTO } from './contratos.js';
import { combateDe, NIVEIS_VETERANIA } from './armas.js';
import { emitirEvento } from './entidades.js';

const MAX_EXPERIENCIA = 0x3fffffff;

/** Experience worth `quantidade` health of entity j (damage dealt to it or repaired on it). */
export function experienciaPorDano(sim, j, quantidade) {
  if (quantidade <= 0) return 0;
  const c = combateDe(sim);
  const t = sim.tipo[j];
  return Math.trunc((quantidade * c.custoDoTipo[t]) / c.vidaDoTipo[t]);
}

/** Adds experience to live entity i and promotes it through every threshold it reached. */
export function ganharExperiencia(sim, i, pontos) {
  if (pontos <= 0 || !sim.ativo[i]) return;
  const xp = Math.min(MAX_EXPERIENCIA, sim.experiencia[i] + pontos);
  sim.experiencia[i] = xp;
  const c = combateDe(sim);
  const custo = c.custoDoTipo[sim.tipo[i]];
  let nivel = sim.veterania[i];
  while (nivel < NIVEIS_VETERANIA && xp * 100 >= custo * c.limiares[nivel]) nivel++;
  if (nivel === sim.veterania[i]) return;
  sim.veterania[i] = nivel;
  if (EVENTO.PROMOCAO) emitirEvento(sim, EVENTO.PROMOCAO, i, -1, nivel);
}

/** Puts live entity i straight at a level (mission rewards), with the experience of that level's threshold. */
export function definirVeterania(sim, i, nivel) {
  if (!sim.ativo[i]) return;
  const n = Math.max(0, Math.min(NIVEIS_VETERANIA, nivel | 0));
  const c = combateDe(sim);
  sim.veterania[i] = n;
  sim.experiencia[i] = n === 0 ? 0 : Math.trunc((c.custoDoTipo[sim.tipo[i]] * c.limiares[n - 1] + 99) / 100);
}
