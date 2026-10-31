// Veterancy: experience from damage dealt (in proportion to the victim's cost, so a kill is worth about what the
// victim cost), three levels at thresholds in percent of the unit's own cost, each with damage, resistance and reload
// bonuses from the combat rules (armas.js). Harvesters count trips instead (two levels, faster), and support units
// count health repaired (two levels). Experience and level live in the entity arrays `experiencia` and `veterania`,
// reset when a slot takes a new entity.
import { EVENTO } from './contratos.js';
import { combateDe, NIVEIS_VETERANIA, NIVEIS_VETERANIA_ESPECIAL } from './armas.js';
import { emitirEvento } from './entidades.js';

const MAX_EXPERIENCIA = 0x3fffffff;

/** Experience worth `quantidade` health of entity j (damage dealt to it or repaired on it). */
export function experienciaPorDano(sim, j, quantidade) {
  if (quantidade <= 0) return 0;
  const c = combateDe(sim);
  const t = sim.tipo[j];
  return Math.trunc((quantidade * c.custoDoTipo[t]) / c.vidaDoTipo[t]);
}

// Experience entity i needs for each level above 0: trips for a harvester, health repaired for a support unit,
// percent of its cost for everyone else.
function limiar(c, sim, i, nivel) {
  const tipo = sim.tipo[i];
  if (c.coletorDoTipo[tipo]) return c.viagensColetor[nivel - 1];
  if (c.suporteDoTipo[tipo]) return c.vidaReparadaSuporte[nivel - 1];
  return Math.trunc((c.custoDoTipo[tipo] * c.limiares[nivel - 1] + 99) / 100);
}

/** Highest level entity i can reach: two for harvesters and support units, three for the rest. */
export function nivelMaximo(sim, i) {
  const c = combateDe(sim);
  return c.coletorDoTipo[sim.tipo[i]] || c.suporteDoTipo[sim.tipo[i]] ? NIVEIS_VETERANIA_ESPECIAL : NIVEIS_VETERANIA;
}

/** Adds experience to live entity i and promotes it through every threshold it reached. */
export function ganharExperiencia(sim, i, pontos) {
  if (pontos <= 0 || !sim.ativo[i]) return;
  const xp = Math.min(MAX_EXPERIENCIA, sim.experiencia[i] + pontos);
  sim.experiencia[i] = xp;
  const c = combateDe(sim);
  const maximo = nivelMaximo(sim, i);
  let nivel = sim.veterania[i];
  while (nivel < maximo && xp >= limiar(c, sim, i, nivel + 1)) nivel++;
  if (nivel === sim.veterania[i]) return;
  sim.veterania[i] = nivel;
  emitirEvento(sim, EVENTO.PROMOCAO, i, -1, nivel);
}

/** A harvester delivered a load (economy): one trip of experience. */
export function registrarViagem(sim, i) {
  if (combateDe(sim).coletorDoTipo[sim.tipo[i]]) ganharExperiencia(sim, i, 1);
}

/** Support unit i repaired `vida` health on someone (repair): that much experience. */
export function registrarReparo(sim, i, vida) {
  if (combateDe(sim).suporteDoTipo[sim.tipo[i]]) ganharExperiencia(sim, i, vida);
}

/** Puts live entity i straight at a level (mission rewards), with the experience of that level's threshold. */
export function definirVeterania(sim, i, nivel) {
  if (!sim.ativo[i]) return;
  const n = Math.max(0, Math.min(nivelMaximo(sim, i), nivel | 0));
  sim.veterania[i] = n;
  sim.experiencia[i] = n === 0 ? 0 : limiar(combateDe(sim), sim, i, n);
}
