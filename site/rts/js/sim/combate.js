// Combat: target acquisition from the spatial buckets on a staggered schedule (only enemies the team sees, inside the
// weapon's reach, which grows from high ground), reload, and damage through the rules of armas.js: damage kind against
// armour, cover for personal armour, height, veterancy and research. Direct fire hits at once; arcing shells fly to a
// point on the ground and hit everyone around it on landing. An ATACAR order forces its target whenever it can be hit.
import { EVENTO, FP, FP_BITS, PASSOS_POR_SEGUNDO, SEM_ENTIDADE, TIPO_COMANDO } from './contratos.js';
import { TAMANHO_BALDE_BITS } from './movimento.js';
import { slotVivo, emitirEvento, matar, idDoSlot } from './entidades.js';
import { raizInteira } from './matematica.js';
import { celulaVisivel } from './neblina.js';
import { combateDe, BLINDAGEM, NIVEIS_VETERANIA } from './armas.js';
import { ganharExperiencia, experienciaPorDano } from './veterania.js';
import { desligar } from './religar.js';

// retarget every few ticks per unit, staggered by slot, so the search cost spreads over time
const INTERVALO_BUSCA = 6;
// SOB_ATAQUE: at most one per team in this many ticks, or one a second when far from the previous one
const INTERVALO_ALERTA = 5 * PASSOS_POR_SEGUNDO;
const INTERVALO_ALERTA_LONGE = PASSOS_POR_SEGUNDO;
const DISTANCIA_ALERTA = 16 * FP;
// an arcing shell hits everyone within at least this distance of where it lands
const RAIO_MINIMO_ARCO = FP >> 1;
// splash damage falls from 100% at the centre to this percent at the edge
const BORDA_AREA = 50;
// height, resistance and splash never take a hit below this percent of its base
const PISO_PORCENTO = 10;
/** Shells in flight at once; a shot with the pool full lands at once. */
export const MAX_PROJETEIS = 512;

/**
 * Combat state outside the entity arrays: shells in flight (landing tick, point, weapon, damage, shooter id, team,
 * height it was fired from) and the last SOB_ATAQUE of each team. Only typed arrays, kept in sim.extras.combate.
 */
export function extrasCombate(sim) {
  sim.extras ??= {};
  if (!sim.extras.combate) {
    const alertaTick = new Int32Array(sim.times).fill(-INTERVALO_ALERTA);
    sim.extras.combate = {
      projetilPouso: new Int32Array(MAX_PROJETEIS), // landing tick, 0 when free
      projetilX: new Int32Array(MAX_PROJETEIS),
      projetilY: new Int32Array(MAX_PROJETEIS),
      projetilArma: new Int16Array(MAX_PROJETEIS),
      projetilDano: new Int32Array(MAX_PROJETEIS),
      projetilAutor: new Int32Array(MAX_PROJETEIS), // id with generation
      projetilTime: new Uint8Array(MAX_PROJETEIS),
      projetilNivel: new Uint8Array(MAX_PROJETEIS),
      alertaTick,
      alertaX: new Int32Array(sim.times),
      alertaY: new Int32Array(sim.times),
    };
  }
  return sim.extras.combate;
}

/** Event record at a point of the ground (contratos.js layout), for blasts and mission events; i may be -1. */
export function emitirEventoNoPonto(sim, tipo, i, x, y, arg) {
  sim.eventos.push(tipo, sim.tick, i >= 0 ? idDoSlot(sim, i) : SEM_ENTIDADE, SEM_ENTIDADE, x, y, x, y, arg);
}

const celulaDe = (sim, i) => (sim.y[i] >> FP_BITS) * sim.mapa.largura + (sim.x[i] >> FP_BITS);

// research bonus of one kind for one team, 0 without research state
function pesquisa(sim, campo, time, tipo) {
  const pq = sim.extras?.pesquisas;
  return pq ? pq[campo][time * sim.tipos.length + tipo] : 0;
}

// Whether i can shoot j now: a live enemy (never the neutral side) on a cell i's team sees, within the weapon's reach
// from i's height.
function podeAcertar(sim, c, i, j, alcance, arma, nivelI) {
  if (!sim.ativo[j] || sim.time[j] === sim.time[i] || sim.time[j] === c.neutro) return false;
  const cj = celulaDe(sim, j);
  if (!celulaVisivel(sim, sim.time[i], cj)) return false;
  const acima = nivelI - sim.mapa.nivel[cj];
  const a = (acima > 0 ? alcance + acima * c.alcanceAcima : alcance) >> 4;
  const dx = (sim.x[j] - sim.x[i]) >> 4;
  const dy = (sim.y[j] - sim.y[i]) >> 4;
  const d2 = dx * dx + dy * dy;
  if (d2 > a * a) return false;
  const m = c.alcanceMinimo[arma] >> 4;
  return m === 0 || d2 >= m * m;
}

// Closest enemy i can hit (ties to the lowest slot), or -1. Distances in 1/16 world units keep the squares small.
function procurarAlvo(sim, c, i, alcance, arma, nivelI, linhas) {
  const { baldeCabeca, baldeProximo, baldeLargura, x, y } = sim;
  const r = ((alcance + NIVEIS_VETERANIA * c.alcanceAcima) >> TAMANHO_BALDE_BITS) + 1;
  const bx = x[i] >> TAMANHO_BALDE_BITS;
  const by = y[i] >> TAMANHO_BALDE_BITS;
  const y1 = Math.min(linhas - 1, by + r);
  const x0 = Math.max(0, bx - r);
  const x1 = Math.min(baldeLargura - 1, bx + r);
  let melhor = -1;
  let melhorD = 0;
  for (let yb = Math.max(0, by - r); yb <= y1; yb++) {
    for (let xb = x0; xb <= x1; xb++) {
      for (let j = baldeCabeca[yb * baldeLargura + xb]; j >= 0; j = baldeProximo[j]) {
        if (!podeAcertar(sim, c, i, j, alcance, arma, nivelI)) continue;
        const dx = (x[j] - x[i]) >> 4;
        const dy = (y[j] - y[i]) >> 4;
        const d = dx * dx + dy * dy;
        if (melhor < 0 || d < melhorD || (d === melhorD && j < melhor)) {
          melhorD = d;
          melhor = j;
        }
      }
    }
  }
  return melhor;
}

/**
 * Damage of one hit on j, in health points: the shot's base damage (shooter's weapon with its veterancy and research)
 * times the matrix entry for the weapon's damage kind against j's armour, j's cover (personal armour only), the height
 * difference, j's resistance (veterancy and research) and `fator` (splash falloff), all in percent with truncation.
 * Never below 1 for a weapon that does damage.
 */
export function calcularDano(sim, arma, danoBase, nivelOrigem, j, fator = 100) {
  if (danoBase <= 0) return 0;
  const c = combateDe(sim);
  const td = c.tipoDano[arma];
  const tipoJ = sim.tipo[j];
  const blindagem = c.blindagemDoTipo[tipoJ];
  const cj = celulaDe(sim, j);
  let pct = c.matriz[td * 4 + blindagem];
  const cobertura = sim.mapa.cobertura;
  if (blindagem === BLINDAGEM.PESSOAL && cobertura) pct = Math.trunc((pct * c.cobertura[cobertura[cj] * 4 + td]) / 100);
  const acima = nivelOrigem - sim.mapa.nivel[cj];
  if (acima > 0) pct = Math.trunc((pct * (100 + acima * c.danoAcima)) / 100);
  else if (acima < 0) pct = Math.trunc((pct * Math.max(PISO_PORCENTO, 100 + acima * c.danoAbaixo)) / 100);
  const resistencia = c.resistencia[sim.veterania[j]] + pesquisa(sim, 'resistencia', sim.time[j], tipoJ);
  if (resistencia !== 0) pct = Math.trunc((pct * Math.max(PISO_PORCENTO, 100 - resistencia)) / 100);
  if (fator !== 100) pct = Math.trunc((pct * fator) / 100);
  return Math.max(1, Math.trunc((danoBase * pct) / 100));
}

// SOB_ATAQUE for j's team, unless one came recently (or recently and nearby).
function alertar(sim, ex, j, autor) {
  const time = sim.time[j];
  const passou = sim.tick - ex.alertaTick[time];
  if (passou < INTERVALO_ALERTA_LONGE) return;
  if (passou < INTERVALO_ALERTA) {
    const dx = sim.x[j] - ex.alertaX[time];
    const dy = sim.y[j] - ex.alertaY[time];
    if (dx < DISTANCIA_ALERTA && dx > -DISTANCIA_ALERTA && dy < DISTANCIA_ALERTA && dy > -DISTANCIA_ALERTA) return;
  }
  ex.alertaTick[time] = sim.tick;
  ex.alertaX[time] = sim.x[j];
  ex.alertaY[time] = sim.y[j];
  emitirEvento(sim, EVENTO.SOB_ATAQUE, j, autor, sim.tipo[j]);
}

// One hit on live entity j from `autor` (a live slot, or -1 when the shooter is gone).
function acertar(sim, ex, j, arma, danoBase, autor, nivelOrigem, fator) {
  const dano = calcularDano(sim, arma, danoBase, nivelOrigem, j, fator);
  const antes = sim.vida[j];
  sim.vida[j] = antes - dano;
  emitirEvento(sim, EVENTO.IMPACTO, j, autor, arma);
  alertar(sim, ex, j, autor);
  if (autor >= 0) ganharExperiencia(sim, autor, experienciaPorDano(sim, j, Math.min(dano, antes)));
  // a re-powered structure goes dead again instead of dying
  if (sim.vida[j] <= 0 && !desligar(sim, j)) matar(sim, j, autor);
}

// victims of one blast, sorted by slot before the damage is applied
let vitimas = new Int32Array(64);

// Splash at (px, py) on every live enemy of `time` within the weapon's radius of its body, falling off to the edge.
function explodir(sim, c, ex, px, py, arma, danoBase, autor, time, nivelOrigem) {
  emitirEventoNoPonto(sim, EVENTO.EXPLOSAO, autor, px, py, arma);
  const raio = Math.max(c.raioArea[arma], c.velocidade[arma] > 0 ? RAIO_MINIMO_ARCO : 0) >> 4;
  const { baldeCabeca, baldeProximo, baldeLargura, x, y, ativo, raioPorTipo, tipo } = sim;
  const linhas = Math.trunc(baldeCabeca.length / baldeLargura);
  const r = ((raio << 4) >> TAMANHO_BALDE_BITS) + 2;
  const bx = px >> TAMANHO_BALDE_BITS;
  const by = py >> TAMANHO_BALDE_BITS;
  let n = 0;
  for (let yb = Math.max(0, by - r); yb <= Math.min(linhas - 1, by + r); yb++) {
    for (let xb = Math.max(0, bx - r); xb <= Math.min(baldeLargura - 1, bx + r); xb++) {
      for (let j = baldeCabeca[yb * baldeLargura + xb]; j >= 0; j = baldeProximo[j]) {
        if (!ativo[j] || sim.time[j] === time || sim.time[j] === c.neutro) continue;
        const dx = (x[j] - px) >> 4;
        const dy = (y[j] - py) >> 4;
        const alcance = raio + (raioPorTipo[tipo[j]] >> 4);
        if (dx * dx + dy * dy > alcance * alcance) continue;
        if (n === vitimas.length) {
          const maior = new Int32Array(n * 2);
          maior.set(vitimas);
          vitimas = maior;
        }
        vitimas[n++] = j;
      }
    }
  }
  const lista = vitimas.subarray(0, n).sort();
  for (let k = 0; k < n; k++) {
    const j = lista[k];
    if (!ativo[j]) continue;
    const dx = (x[j] - px) >> 4;
    const dy = (y[j] - py) >> 4;
    const d = Math.max(0, raizInteira(dx * dx + dy * dy) - (raioPorTipo[tipo[j]] >> 4));
    const fator = raio > 0 ? Math.max(PISO_PORCENTO, 100 - Math.trunc(((100 - BORDA_AREA) * Math.min(d, raio)) / raio)) : 100;
    acertar(sim, ex, j, arma, danoBase, autor, nivelOrigem, fator);
  }
}

// An arcing shell towards (px, py); lands after its flight time, or at once with the pool full.
function lancar(sim, c, ex, i, px, py, arma, danoBase, nivelOrigem) {
  let k = 0;
  while (k < MAX_PROJETEIS && ex.projetilPouso[k] !== 0) k++;
  if (k === MAX_PROJETEIS) {
    explodir(sim, c, ex, px, py, arma, danoBase, i, sim.time[i], nivelOrigem);
    return;
  }
  const dx = (px - sim.x[i]) >> 4;
  const dy = (py - sim.y[i]) >> 4;
  const distancia = raizInteira(dx * dx + dy * dy) << 4;
  ex.projetilPouso[k] = sim.tick + Math.max(1, Math.trunc(distancia / c.velocidade[arma]));
  ex.projetilX[k] = px;
  ex.projetilY[k] = py;
  ex.projetilArma[k] = arma;
  ex.projetilDano[k] = danoBase;
  ex.projetilAutor[k] = idDoSlot(sim, i);
  ex.projetilTime[k] = sim.time[i];
  ex.projetilNivel[k] = nivelOrigem;
}

// Shells landing this tick, in pool order; the shooter gets the experience if it is still alive.
function pousarProjeteis(sim, c, ex) {
  for (let k = 0; k < MAX_PROJETEIS; k++) {
    if (ex.projetilPouso[k] === 0 || ex.projetilPouso[k] > sim.tick) continue;
    ex.projetilPouso[k] = 0;
    const autor = slotVivo(sim, ex.projetilAutor[k]);
    explodir(sim, c, ex, ex.projetilX[k], ex.projetilY[k], ex.projetilArma[k], ex.projetilDano[k], autor, ex.projetilTime[k], ex.projetilNivel[k]);
  }
}

/** Damage of one shot of live entity i before the target's side: its weapon with its veterancy and research bonus. */
export function danoBaseDe(sim, i) {
  const c = combateDe(sim);
  const arma = c.armaDoTipo[sim.tipo[i]];
  if (arma < 0) return 0;
  return Math.trunc((c.dano[arma] * (100 + c.bonusDano[sim.veterania[i]] + pesquisa(sim, 'dano', sim.time[i], sim.tipo[i]))) / 100);
}

// i fires at j: reload, TIRO, then the hit, the blast or the shell.
function disparar(sim, c, ex, i, j, arma, nivelI) {
  const time = sim.time[i];
  const tipo = sim.tipo[i];
  const reducao = c.reducaoRecarga[sim.veterania[i]] + pesquisa(sim, 'recarga', time, tipo);
  sim.recarga[i] = Math.max(1, Math.trunc((c.recarga[arma] * (100 - Math.min(90, reducao))) / 100));
  emitirEvento(sim, EVENTO.TIRO, i, j, tipo);
  const danoBase = danoBaseDe(sim, i);
  if (c.velocidade[arma] > 0) lancar(sim, c, ex, i, sim.x[j], sim.y[j], arma, danoBase, nivelI);
  else if (c.raioArea[arma] > 0) explodir(sim, c, ex, sim.x[j], sim.y[j], arma, danoBase, i, time, nivelI);
  else acertar(sim, ex, j, arma, danoBase, i, nivelI, 100);
}

/** Lands the shells due, then aims, reloads and fires for every live armed unit, in slot order. */
export function combater(sim) {
  const c = combateDe(sim);
  const ex = extrasCombate(sim);
  pousarProjeteis(sim, c, ex);
  const ord = sim.ordens;
  const linhas = Math.trunc(sim.baldeCabeca.length / sim.baldeLargura);
  const nivel = sim.mapa.nivel;
  for (let i = 0; i < sim.capacidade; i++) {
    if (!sim.ativo[i]) continue;
    if (sim.recarga[i] > 0) sim.recarga[i]--;
    const arma = c.armaDoTipo[sim.tipo[i]];
    if (arma < 0 || sim.time[i] === c.neutro) continue;
    const alcance = c.alcance[arma] + pesquisa(sim, 'alcance', sim.time[i], sim.tipo[i]);
    const nivelI = nivel[celulaDe(sim, i)];
    let alvo = sim.alvo[i];
    if (alvo >= 0 && !podeAcertar(sim, c, i, alvo, alcance, arma, nivelI)) alvo = -1;
    const o = ord.ordem[i];
    if (o >= 0 && ord.modo[o] === TIPO_COMANDO.ATACAR) {
      const ordenado = slotVivo(sim, ord.alvo[o]);
      if (ordenado >= 0 && podeAcertar(sim, c, i, ordenado, alcance, arma, nivelI)) alvo = ordenado;
    }
    if (alvo < 0 && (sim.tick + i) % INTERVALO_BUSCA === 0) alvo = procurarAlvo(sim, c, i, alcance, arma, nivelI, linhas);
    sim.alvo[i] = alvo;
    if (alvo < 0 || sim.recarga[i] > 0) continue;
    disparar(sim, c, ex, i, alvo, arma, nivelI);
  }
}
