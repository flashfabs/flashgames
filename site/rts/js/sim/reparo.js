// Repair by support units (kinds with a `reparo` block in their data: health per second and reach in tenths of a cell):
// the REPARAR command sends them to a damaged unit or finished building of their own team; they stop in reach and heal
// it, paying `reparoCustoPorcento` (economia.json) of the target's cost in proportion to the health they give back,
// until it is whole, the Carga runs out or the player gives them another order. A REPARAR on a dead structure the
// mission made repairable (religavel por reparo) is re-powering by repair instead (religar.js).
import * as estado from './estado.js';
import { PASSOS_POR_SEGUNDO, TIPO_COMANDO } from './contratos.js';
import { slotVivo } from './entidades.js';
import { ordenarGrupo, limparOrdens } from './ordens.js';
import { pagar } from './economia.js';
import { registrarReparo } from './veterania.js';
import { combateDe, decimosParaMundo } from './armas.js';
import { ordenarReligar, religavelPorReparo } from './religar.js';

/**
 * Repair state, only typed arrays, per unit slot: the id of what it repairs (0 none), the health and the Carga it owes
 * as fractions carried to the next tick, and the order that took it there (slot + 1 and the tick it was made; 0 once
 * it stopped in reach), so another order of the player calls the work off.
 */
export function criarExtrasReparo(sim) {
  const n = sim.capacidade;
  return {
    alvo: new Int32Array(n),
    resto: new Int32Array(n),
    devido: new Int32Array(n),
    ordem: new Int16Array(n),
    ordemCriadaEm: new Int32Array(n),
  };
}
// saved, loaded and hashed with the state (estado.js)
estado.registrarExtras?.('reparo', criarExtrasReparo);

/** The repair state in sim.extras.reparo, made on first use when the core did not make it. */
export function extrasReparo(sim) {
  sim.extras ??= {};
  sim.extras.reparo ??= criarExtrasReparo(sim);
  return sim.extras.reparo;
}

// the kind's repair block, or null
const reparoDe = (sim, i) => sim.tipos[sim.tipo[i]].extras?.reparo ?? null;

// Whether support unit i reaches j: to the edge of a building's footprint, or to a unit's body.
function noAlcance(sim, i, j, alcance) {
  const c = combateDe(sim);
  const t = sim.tipo[j];
  let ax = sim.x[j] - sim.x[i];
  let ay = sim.y[j] - sim.y[i];
  ax = ax < 0 ? -ax : ax;
  ay = ay < 0 ? -ay : ay;
  let a = alcance;
  if (c.meiaLargura[t] > 0) {
    ax = Math.max(0, ax - c.meiaLargura[t]);
    ay = Math.max(0, ay - c.meiaAltura[t]);
  } else {
    a += sim.raioPorTipo[t];
  }
  return ax * ax + ay * ay <= a * a;
}

const inteiro = (sim, j) => sim.vida[j] >= combateDe(sim).vidaDoTipo[sim.tipo[j]];

/** REPARAR (C1): `unidades` the support units, `alvoId` what they repair. */
export function comandoReparar(sim, unidades, alvoId) {
  const j = slotVivo(sim, alvoId);
  if (j < 0) return;
  if (religavelPorReparo(sim, j)) {
    ordenarReligar(sim, unidades, alvoId);
    return;
  }
  if (inteiro(sim, j) || (sim.obra?.[j] ?? 0) > 0) return;
  const capazes = unidades.filter(i => i !== j && reparoDe(sim, i) && sim.time[i] === sim.time[j]);
  if (capazes.length === 0) return;
  const ex = extrasReparo(sim);
  for (const i of capazes) sim.segurando[i] = 0;
  const o = ordenarGrupo(sim, capazes, TIPO_COMANDO.MOVER, sim.x[j], sim.y[j]);
  for (const i of capazes) {
    ex.alvo[i] = alvoId;
    ex.resto[i] = 0;
    ex.ordem[i] = sim.ordens.ordem[i] === o ? o + 1 : 0;
    ex.ordemCriadaEm[i] = sim.ordens.criadaEm[o];
  }
}

// whether unit i got another order since it was sent to repair
function outraOrdem(sim, ex, i) {
  const o = sim.ordens.ordem[i];
  if (o < 0) return false;
  return ex.ordem[i] !== o + 1 || sim.ordens.criadaEm[o] !== ex.ordemCriadaEm[i];
}

/** One tick of repair, in slot order of the support units. */
export function avancarReparo(sim) {
  const ex = sim.extras?.reparo;
  if (!ex) return;
  const c = combateDe(sim);
  const porcento = sim.economia?.reparoCustoPorcento ?? 0;
  for (let i = 0; i < sim.capacidade; i++) {
    if (ex.alvo[i] === 0) continue;
    const j = slotVivo(sim, ex.alvo[i]);
    const r = sim.ativo[i] ? reparoDe(sim, i) : null;
    if (!r || j < 0 || sim.time[j] !== sim.time[i] || inteiro(sim, j) || outraOrdem(sim, ex, i)) {
      ex.alvo[i] = 0;
      ex.devido[i] = 0;
      continue;
    }
    if (!noAlcance(sim, i, j, decimosParaMundo(r.alcance ?? 10))) continue;
    // in reach: it stops here and works
    if (sim.ordens.ordem[i] >= 0) {
      limparOrdens(sim, i);
      sim.parada[i] = 1;
      ex.ordem[i] = 0;
    }
    ex.resto[i] += r.vidaPorSegundo ?? 0;
    const t = sim.tipo[j];
    const maximo = c.vidaDoTipo[t];
    const cura = Math.min(Math.trunc(ex.resto[i] / PASSOS_POR_SEGUNDO), maximo - sim.vida[j]);
    ex.resto[i] -= Math.trunc(ex.resto[i] / PASSOS_POR_SEGUNDO) * PASSOS_POR_SEGUNDO;
    if (cura <= 0) continue;
    ex.devido[i] += c.custoDoTipo[t] * cura * porcento;
    const conta = Math.trunc(ex.devido[i] / (maximo * 100));
    if (conta > 0) {
      if (!pagar(sim, sim.time[i], conta)) {
        ex.alvo[i] = 0;
        ex.devido[i] = 0;
        continue;
      }
      ex.devido[i] -= conta * maximo * 100;
    }
    sim.vida[j] += cura;
    registrarReparo(sim, i, cura);
    if (sim.vida[j] >= maximo) ex.alvo[i] = 0;
  }
}

/** Id with generation of what unit i was sent to repair, or 0. */
export const reparandoQual = (sim, i) => sim.extras?.reparo?.alvo[i] ?? 0;
