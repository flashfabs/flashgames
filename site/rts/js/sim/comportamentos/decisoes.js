// Decisions of one computer player's mission teams (equipes.js), made only from what its team sees (VistaDoTime: own
// entities, enemies on cells it sees now, ghosts of buildings it saw, its own Carga and queues), its own units' mission
// labels and the static game data. Nothing here reads the simulation: the decisions come out as commands of the
// player, events and labels for the step to apply, so moving, hurting, adding or removing enemy units the team cannot
// see changes nothing (the "no cheating" test). Integer math only; lists are walked in slot order.
import {
  FP, FP_BITS, PASSOS_POR_SEGUNDO, TIPO_COMANDO, EVENTO, CATEGORIA, DONO_NEUTRO, SEM_ENTIDADE, BANDEIRA, FAIXA, FAIXA_ESTADO,
  FL_PRODUTOR, FL_FAIXAS, FX_ESTADO, FX_ITENS, TAMANHO_FAIXA, TAMANHO_REGISTRO_FILA,
} from '../contratos.js';
import { raizInteira } from '../matematica.js';
import { cantoDaPegada } from '../pegadas.js';

/** What a team does (the mission's "faz"). */
export const COMPORTAMENTO = Object.freeze({ GUARDAR: 1, PATRULHAR: 2, ATACAR: 3, RECUAR: 4, RECONSTRUIR: 5 });
/** Where a team is in its behaviour (estado.fase). */
export const FASE = Object.freeze({
  PARADA: 0, // not started, or no member left: starts over when members appear
  GUARDA: 1, // holding its zone (or the fallback place)
  COMBATE: 2, // engaging what it saw near its zone or route
  AVISO: 3, // warned of the attack, waiting to leave
  ROTA: 4, // walking the route, point by point
  DESTINO: 5, // at the destination, hunting what it sees
  RECUO: 6, // falling back
  PATRULHA: 7, // walking its route back and forth
  RECONSTRUINDO: 8, // watching its buildings
});
/** State of a remembered building of a rebuilding team. */
export const PREDIO = Object.freeze({ VIVO: 1, CAIDO: 2, NA_FILA: 3, POSTO: 4, DESISTIU: 5 });
/** Buildings a rebuilding team remembers. */
export const MAX_PREDIOS_EQUIPE = 16;
// fields of a remembered building: kind, top-left cell, id while it stands, PREDIO.*, tick of the last change, tries
export const CAMPOS_PREDIO = 7;
const PR_TIPO = 0;
const PR_CX = 1;
const PR_CY = 2;
const PR_ID = 3;
const PR_ESTADO = 4;
const PR_MARCA = 5;
const PR_TENTATIVAS = 6;

const SEGUNDO = PASSOS_POR_SEGUNDO;
/** Idle members get the team's order again at most this often. */
const RENOVAR = 2 * SEGUNDO;
/** A team that saw no enemy for this long goes back to its zone or route. */
const ESQUECER = 5 * SEGUNDO;
/** A route leg (or a patrol leg) that takes longer than this is given up for the next point. */
const MAX_TRECHO = 90 * SEGUNDO;
/** Harvesters a wave on its route turns to, and enemy strength that counts against a fallback, within these cells. */
const PERTO_COLETORES = 12;
const PERTO_PODER = 10;
/** A placed building that does not show up in this long was refused; after this many tries the team gives up. */
const ESPERA_POSTO = 3 * SEGUNDO;
const MAX_TENTATIVAS = 3;

// Distances in 1/16 cell, squared: a 256-cell map stays far below 2^31.
const DIV = FP_BITS - 4;
const distancia2 = (ax, ay, bx, by) => {
  const dx = (ax >> DIV) - (bx >> DIV);
  const dy = (ay >> DIV) - (by >> DIV);
  return dx * dx + dy * dy;
};
const celulas2 = c => c * c * 256;
const centroDaCelula = c => c * FP + (FP >> 1);

/** Strength of one unit: its cost scaled by its health (vida is 1..255 of its maximum). */
const poderDe = (tipos, tipo, vida) => (tipos[tipo].custo * vida) >> 8;
const armado = (tipos, tipo) => tipos[tipo].categoria === CATEGORIA.UNIDADE && tipos[tipo].arma >= 0;

/**
 * Decides one tick for the teams of `jogador`.
 * @param {object} entrada
 * @param {number} entrada.tick
 * @param {number} entrada.jogador
 * @param {object} entrada.vista       the team's view (VistaDoTime)
 * @param {Int32Array} entrada.rotulos mission label index of each own entity of the vista, -1 none
 * @param {Uint8Array} entrada.ativas  1 for each team whose start trigger fired and whose stop trigger did not
 * @param {object[]} entrada.equipes   compiled teams (equipes.js), all players'
 * @param {object} entrada.estado      the teams' state (formato.js), changed in place
 * @param {object[]} entrada.tipos     the static kinds (MapaEstatico.tipos)
 * @returns {{ comandos: object[], eventos: object[], rotulos: object[] }} commands of the player (no tick, player or
 *   seq), events { tipo, x, y, arg } and labels { id, rotulo } for the step to apply, in order
 */
export function decidirJogador({ tick, jogador, vista, rotulos, ativas, equipes, estado, tipos }) {
  const saida = { comandos: [], eventos: [], rotulos: [] };
  const ctx = { tick, jogador, vista, tipos, estado, saida, inimigos: inimigosVistos(vista, jogador, tipos) };
  atualizarExercito(ctx);
  const proprias = vista.proprias;
  const minhas = [];
  for (let e = 0; e < equipes.length; e++) if (equipes[e].jogador === jogador) minhas.push(e);
  const membros = new Map(minhas.map(e => [e, []]));
  for (let k = 0; k < proprias.n; k++) {
    const r = rotulos[k];
    if (r < 0) continue;
    for (const e of minhas) {
      if (ativas[e] && equipes[e].grupo[r]) {
        membros.get(e).push(k);
        break;
      }
    }
  }
  for (const e of minhas) {
    if (!ativas[e]) {
      // stopped by its trigger: units keep their last order
      estado.fase[e] = FASE.PARADA;
      continue;
    }
    decidirEquipe(ctx, e, equipes[e], membros.get(e), rotulos);
  }
  return saida;
}

// Enemy entities in sight: another player's units, buildings and re-powered structures (no piles, sparks or neutral).
function inimigosVistos(vista, jogador, tipos) {
  const v = vista.inimigas;
  const lista = [];
  for (let k = 0; k < v.n; k++) {
    const dono = v.dono[k];
    if (dono === jogador || dono === DONO_NEUTRO) continue;
    const categoria = tipos[v.tipo[k]].categoria;
    if (categoria === CATEGORIA.UNIDADE || categoria === CATEGORIA.PREDIO || categoria === CATEGORIA.ESTRUTURA) lista.push(k);
  }
  return lista;
}

// The player's army as the team has seen it: the armed enemy strength in sight now, or the remembered figure fading
// by 1/512 per decision (about half in two minutes), whichever is bigger.
function atualizarExercito(ctx) {
  const { vista, tipos, estado, jogador } = ctx;
  const v = vista.inimigas;
  let agora = 0;
  for (const k of ctx.inimigos) if (armado(tipos, v.tipo[k])) agora += poderDe(tipos, v.tipo[k], v.vida[k]);
  const antes = estado.exercito[jogador];
  estado.exercito[jogador] = Math.max(agora, antes - (antes >> 9));
}

function decidirEquipe(ctx, e, eq, ks, rotulos) {
  const { tipos, vista } = ctx;
  const p = vista.proprias;
  if (eq.faz === COMPORTAMENTO.RECONSTRUIR) return reconstruir(ctx, e, eq, ks.filter(k => tipos[p.tipo[k]].categoria === CATEGORIA.PREDIO));
  const unidades = ks.filter(k => armado(tipos, p.tipo[k]));
  if (unidades.length === 0) {
    ctx.estado.fase[e] = FASE.PARADA;
    return;
  }
  switch (eq.faz) {
    case COMPORTAMENTO.GUARDAR:
      return guardar(ctx, e, eq, unidades);
    case COMPORTAMENTO.PATRULHAR:
      return patrulhar(ctx, e, eq, unidades);
    case COMPORTAMENTO.ATACAR:
      return atacar(ctx, e, eq, unidades, rotulos);
    case COMPORTAMENTO.RECUAR:
      if (!ctx.estado.recuado[e]) comecarRecuo(ctx, e);
      return guardar(ctx, e, eq, unidades);
    default:
      return undefined;
  }
}

// ---------- helpers over the team's units (indices into vista.proprias) ----------

function idsDe(ctx, ks) {
  const p = ctx.vista.proprias;
  return ks.map(k => p.id[k]);
}

function centroDe(ctx, ks) {
  const p = ctx.vista.proprias;
  let sx = 0;
  let sy = 0;
  for (const k of ks) {
    sx += p.x[k];
    sy += p.y[k];
  }
  return { x: Math.trunc(sx / ks.length), y: Math.trunc(sy / ks.length) };
}

function poderDosMeus(ctx, ks) {
  const p = ctx.vista.proprias;
  let total = 0;
  for (const k of ks) total += poderDe(ctx.tipos, p.tipo[k], p.vida[k]);
  return total;
}

// armed enemy strength in sight within `celulas` of (x, y)
function poderInimigoPerto(ctx, x, y, celulas) {
  const v = ctx.vista.inimigas;
  const raio = celulas2(celulas);
  let total = 0;
  for (const k of ctx.inimigos) if (armado(ctx.tipos, v.tipo[k]) && distancia2(v.x[k], v.y[k], x, y) <= raio) total += poderDe(ctx.tipos, v.tipo[k], v.vida[k]);
  return total;
}

// Two thirds of the units are within 4 cells plus the square root of their number of (x, y).
function chegou(ctx, ks, x, y) {
  const p = ctx.vista.proprias;
  const raio = celulas2(4 + raizInteira(ks.length));
  let dentro = 0;
  for (const k of ks) if (distancia2(p.x[k], p.y[k], x, y) <= raio) dentro++;
  return dentro * 3 >= ks.length * 2;
}

// the enemy in sight nearest to (x, y) for which aceitar(k) holds, or -1
function maisPerto(ctx, x, y, aceitar = () => true) {
  const v = ctx.vista.inimigas;
  let melhor = -1;
  let melhorD = 0;
  for (const k of ctx.inimigos) {
    if (!aceitar(k)) continue;
    const d = distancia2(v.x[k], v.y[k], x, y);
    if (melhor < 0 || d < melhorD) {
      melhor = k;
      melhorD = d;
    }
  }
  return melhor;
}

const dentroDoLugar = (lugar, folga, x, y) => {
  const cx = x >> FP_BITS;
  const cy = y >> FP_BITS;
  return cx >= lugar.cx0 - folga && cx < lugar.cx1 + folga && cy >= lugar.cy0 - folga && cy < lugar.cy1 + folga;
};

function comandar(ctx, tipo, ids, { x = 0, y = 0, alvo = SEM_ENTIDADE, arg = 0, fila = 0 } = {}) {
  if (ids.length > 0) ctx.saida.comandos.push({ tipo, unidades: ids, alvo, x, y, arg, fila });
}

/**
 * Keeps the team on one order: the whole team gets it when it changes (another kind, or a target over 2 cells away);
 * otherwise, every RENOVAR ticks, the members standing idle away from the target (new ones included) get it again.
 */
function manter(ctx, e, ks, tipo, x, y) {
  const s = ctx.estado;
  const p = ctx.vista.proprias;
  if (s.ordemTipo[e] !== tipo || distancia2(s.ordemX[e], s.ordemY[e], x, y) > celulas2(2)) {
    s.ordemTipo[e] = tipo;
    s.ordemX[e] = x;
    s.ordemY[e] = y;
    s.ordemTick[e] = ctx.tick;
    comandar(ctx, tipo, idsDe(ctx, ks), { x, y });
    return;
  }
  if (ctx.tick - s.ordemTick[e] < RENOVAR) return;
  s.ordemTick[e] = ctx.tick;
  const folga = celulas2(4 + raizInteira(ks.length));
  const ociosos = ks.filter(k => (p.bandeiras[k] & BANDEIRA.PARADA) !== 0 && distancia2(p.x[k], p.y[k], x, y) > folga);
  comandar(ctx, tipo, idsDe(ctx, ociosos), { x, y });
}

function mudarFase(ctx, e, fase) {
  const s = ctx.estado;
  s.fase[e] = fase;
  s.inicio[e] = ctx.tick;
  // the next order goes to the whole team
  s.ordemTipo[e] = 0;
}

// Falls back when the team is under `recuar`% of its strength and sees more armed enemy strength near it than it has.
function deveRecuar(ctx, e, eq, ks) {
  if (eq.recuar <= 0 || !eq.recuo || ctx.estado.recuado[e]) return false;
  const poder = poderDosMeus(ctx, ks);
  if (poder * 100 >= ctx.estado.poder0[e] * eq.recuar) return false;
  const c = centroDe(ctx, ks);
  return poderInimigoPerto(ctx, c.x, c.y, PERTO_PODER) > poder;
}

function comecarRecuo(ctx, e) {
  ctx.estado.recuado[e] = 1;
  mudarFase(ctx, e, FASE.RECUO);
}

// ---------- behaviours ----------

// Holds the zone (the fallback place once the team fell back); attacks-moves at the enemy seen in the zone or within `alcance` cells of it nearest to its centre,
// and goes back once nothing was seen for ESQUECER ticks.
function guardar(ctx, e, eq, ks) {
  const s = ctx.estado;
  const zona = s.recuado[e] ? eq.recuo : eq.lugar;
  if (s.fase[e] === FASE.PARADA) mudarFase(ctx, e, FASE.GUARDA);
  if (s.fase[e] === FASE.RECUO) {
    // falling back by plain move, then guarding the place
    if (!chegou(ctx, ks, zona.x, zona.y) && ctx.tick - s.inicio[e] < MAX_TRECHO) return manter(ctx, e, ks, TIPO_COMANDO.MOVER, zona.x, zona.y);
    mudarFase(ctx, e, FASE.GUARDA);
  }
  s.poder0[e] = Math.max(s.poder0[e], poderDosMeus(ctx, ks));
  if (deveRecuar(ctx, e, eq, ks)) return comecarRecuo(ctx, e);
  const v = ctx.vista.inimigas;
  const alvo = maisPerto(ctx, zona.x, zona.y, k => dentroDoLugar(zona, eq.alcance, v.x[k], v.y[k]));
  if (alvo >= 0) {
    if (s.fase[e] !== FASE.COMBATE) mudarFase(ctx, e, FASE.COMBATE);
    s.contato[e] = ctx.tick;
    return manter(ctx, e, ks, TIPO_COMANDO.ATACAR_MOVENDO, v.x[alvo], v.y[alvo]);
  }
  if (s.fase[e] === FASE.COMBATE && ctx.tick - s.contato[e] < ESQUECER) return undefined;
  if (s.fase[e] !== FASE.GUARDA) mudarFase(ctx, e, FASE.GUARDA);
  return manter(ctx, e, ks, TIPO_COMANDO.ATACAR_MOVENDO, zona.x, zona.y);
}

// Walks the route back and forth by attack-move; turns on what it sees within `alcance` cells of the team's centre.
function patrulhar(ctx, e, eq, ks) {
  const s = ctx.estado;
  if (s.recuado[e]) return guardar(ctx, e, eq, ks);
  if (s.fase[e] === FASE.PARADA) {
    mudarFase(ctx, e, FASE.PATRULHA);
    s.ponto[e] = 0;
    s.sentido[e] = 1;
  }
  s.poder0[e] = Math.max(s.poder0[e], poderDosMeus(ctx, ks));
  if (deveRecuar(ctx, e, eq, ks)) return comecarRecuo(ctx, e);
  if (combaterPerto(ctx, e, eq.alcance, ks)) return undefined;
  if (s.fase[e] !== FASE.PATRULHA) mudarFase(ctx, e, FASE.PATRULHA);
  const rota = eq.rota;
  let ponto = rota[s.ponto[e]];
  if (rota.length > 1 && (chegou(ctx, ks, ponto.x, ponto.y) || ctx.tick - s.inicio[e] > MAX_TRECHO)) {
    if (s.ponto[e] + s.sentido[e] < 0 || s.ponto[e] + s.sentido[e] >= rota.length) s.sentido[e] = -s.sentido[e];
    s.ponto[e] += s.sentido[e];
    s.inicio[e] = ctx.tick;
    ponto = rota[s.ponto[e]];
  }
  return manter(ctx, e, ks, TIPO_COMANDO.ATACAR_MOVENDO, ponto.x, ponto.y);
}

// Attack-moves at the enemy in sight within `alcance` cells of the team's centre; true while engaged or still
// remembering one (ESQUECER).
function combaterPerto(ctx, e, alcance, ks) {
  const s = ctx.estado;
  const v = ctx.vista.inimigas;
  const c = centroDe(ctx, ks);
  const raio = celulas2(alcance);
  const alvo = maisPerto(ctx, c.x, c.y, k => distancia2(v.x[k], v.y[k], c.x, c.y) <= raio);
  if (alvo >= 0) {
    if (s.fase[e] !== FASE.COMBATE) mudarFase(ctx, e, FASE.COMBATE);
    s.contato[e] = ctx.tick;
    manter(ctx, e, ks, TIPO_COMANDO.ATACAR_MOVENDO, v.x[alvo], v.y[alvo]);
    return true;
  }
  return s.fase[e] === FASE.COMBATE && ctx.tick - s.contato[e] < ESQUECER;
}

/**
 * Attack along a route: warns (AVISO_ATAQUE) and waits `aviso` ticks when it has a warning, leaves (ONDA), walks the
 * route point by point regrouping at each one, and at the destination hunts the enemy it sees, then the buildings it
 * remembers, then sweeps the destination. Part of the team goes for harvesters in sight, by difficulty.
 */
function atacar(ctx, e, eq, ks, rotulos) {
  const s = ctx.estado;
  if (s.recuado[e]) return guardar(ctx, e, eq, ks);
  if (s.fase[e] === FASE.PARADA) {
    const enviados = eq.escala ? escalar(ctx, eq, ks, rotulos) : ks;
    s.ponto[e] = 0;
    s.poder0[e] = poderDosMeus(ctx, enviados);
    if (eq.aviso > 0) {
      mudarFase(ctx, e, FASE.AVISO);
      ctx.saida.eventos.push({ tipo: EVENTO.AVISO_ATAQUE, x: eq.lugar.x, y: eq.lugar.y, arg: eq.rotulo });
      return undefined;
    }
    mudarFase(ctx, e, FASE.ROTA);
    ks = enviados;
  }
  if (s.fase[e] === FASE.AVISO) {
    s.poder0[e] = Math.max(s.poder0[e], poderDosMeus(ctx, ks));
    if (ctx.tick - s.inicio[e] < eq.aviso) return undefined;
    const c = centroDe(ctx, ks);
    ctx.saida.eventos.push({ tipo: EVENTO.ONDA, x: c.x, y: c.y, arg: eq.rotulo });
    mudarFase(ctx, e, FASE.ROTA);
  }
  if (deveRecuar(ctx, e, eq, ks)) return comecarRecuo(ctx, e);
  const restantes = cacarColetores(ctx, e, eq, ks, s.fase[e] === FASE.DESTINO ? 0 : PERTO_COLETORES);
  if (restantes.length === 0) return undefined;
  if (s.fase[e] === FASE.ROTA) {
    const rota = eq.rota;
    while (s.ponto[e] < rota.length) {
      const ponto = rota[s.ponto[e]];
      if (!chegou(ctx, restantes, ponto.x, ponto.y) && ctx.tick - s.inicio[e] < MAX_TRECHO) return manter(ctx, e, restantes, TIPO_COMANDO.ATACAR_MOVENDO, ponto.x, ponto.y);
      s.ponto[e]++;
      s.inicio[e] = ctx.tick;
    }
    mudarFase(ctx, e, FASE.DESTINO);
    s.ponto[e] = 0;
  }
  const alvo = alvoNoDestino(ctx, e, eq, restantes);
  return manter(ctx, e, restantes, TIPO_COMANDO.ATACAR_MOVENDO, alvo.x, alvo.y);
}

// At the destination: the enemy in sight nearest to the team, else the remembered enemy building nearest to it, else
// the corners and the centre of the destination in turn.
function alvoNoDestino(ctx, e, eq, ks) {
  const s = ctx.estado;
  const v = ctx.vista.inimigas;
  const c = centroDe(ctx, ks);
  const k = maisPerto(ctx, c.x, c.y);
  if (k >= 0) return { x: v.x[k], y: v.y[k] };
  const f = ctx.vista.fantasmas;
  let melhor = -1;
  let melhorD = 0;
  for (let j = 0; j < f.n; j++) {
    if (f.dono[j] === ctx.jogador || f.dono[j] === DONO_NEUTRO || ctx.tipos[f.tipo[j]].categoria !== CATEGORIA.PREDIO) continue;
    const d = distancia2(f.x[j], f.y[j], c.x, c.y);
    if (melhor < 0 || d < melhorD) {
      melhor = j;
      melhorD = d;
    }
  }
  if (melhor >= 0) return { x: f.x[melhor], y: f.y[melhor] };
  const lugar = eq.lugar;
  const cantos = [
    { x: lugar.x, y: lugar.y },
    { x: centroDaCelula(lugar.cx0), y: centroDaCelula(lugar.cy0) },
    { x: centroDaCelula(lugar.cx1 - 1), y: centroDaCelula(lugar.cy0) },
    { x: centroDaCelula(lugar.cx1 - 1), y: centroDaCelula(lugar.cy1 - 1) },
    { x: centroDaCelula(lugar.cx0), y: centroDaCelula(lugar.cy1 - 1) },
  ];
  let alvo = cantos[s.ponto[e] % cantos.length];
  if (chegou(ctx, ks, alvo.x, alvo.y)) {
    s.ponto[e]++;
    alvo = cantos[s.ponto[e] % cantos.length];
  }
  return alvo;
}

/**
 * Sends `coletores`% of the team (rounded up) at the enemy harvester in sight nearest to its centre (within `perto`
 * cells, or anywhere in sight with 0), the members nearest to it first; returns the rest of the team.
 */
function cacarColetores(ctx, e, eq, ks, perto) {
  if (eq.coletores <= 0) return ks;
  const s = ctx.estado;
  const v = ctx.vista.inimigas;
  const p = ctx.vista.proprias;
  const c = centroDe(ctx, ks);
  const raio = celulas2(perto);
  const ehColetor = k => ctx.tipos[v.tipo[k]].coletor === 1;
  // the harvester already hunted while it is in sight, else the one nearest to the team
  let alvo = ctx.inimigos.find(k => v.id[k] === s.presa[e] && ehColetor(k)) ?? -1;
  if (alvo < 0) alvo = maisPerto(ctx, c.x, c.y, k => ehColetor(k) && (perto === 0 || distancia2(v.x[k], v.y[k], c.x, c.y) <= raio));
  if (alvo < 0) {
    s.presa[e] = SEM_ENTIDADE;
    return ks;
  }
  const quantos = Math.min(ks.length, Math.trunc((ks.length * eq.coletores + 99) / 100));
  const porDistancia = ks.slice().sort((a, b) => distancia2(p.x[a], p.y[a], v.x[alvo], v.y[alvo]) - distancia2(p.x[b], p.y[b], v.x[alvo], v.y[alvo]) || a - b);
  const cacadores = porDistancia.slice(0, quantos);
  // a new prey goes to all hunters; the same prey, every RENOVAR ticks, to the hunters standing idle
  if (v.id[alvo] !== s.presa[e]) {
    s.presa[e] = v.id[alvo];
    s.presaTick[e] = ctx.tick;
    comandar(ctx, TIPO_COMANDO.ATACAR, idsDe(ctx, cacadores), { alvo: v.id[alvo] });
  } else if (ctx.tick - s.presaTick[e] >= RENOVAR) {
    s.presaTick[e] = ctx.tick;
    comandar(ctx, TIPO_COMANDO.ATACAR, idsDe(ctx, cacadores.filter(k => (p.bandeiras[k] & BANDEIRA.PARADA) !== 0)), { alvo: v.id[alvo] });
  }
  const fora = new Set(cacadores);
  return ks.filter(k => !fora.has(k));
}

/**
 * Wave size by the player's army the team has seen: from the wave's own units, then the reserve's, until their
 * strength reaches `porcento`% of that army, with at least `minimo` and at most `maximo` units. Wave units left out
 * go to the reserve, reserve units taken join the wave (labels, applied by the step). Returns the units sent.
 */
function escalar(ctx, eq, ks, rotulos) {
  const { tipos, estado, jogador } = ctx;
  const p = ctx.vista.proprias;
  const { reserva, porcento, minimo, maximo } = eq.escala;
  const meta = Math.trunc((estado.exercito[jogador] * porcento) / 100);
  const naOnda = new Set(ks);
  const daReserva = [];
  for (let k = 0; k < p.n; k++) if (!naOnda.has(k) && rotulos[k] >= 0 && reserva.grupo[rotulos[k]] && armado(tipos, p.tipo[k])) daReserva.push(k);
  const enviados = [];
  let poder = 0;
  for (const k of [...ks, ...daReserva]) {
    if (enviados.length >= maximo || (enviados.length >= minimo && poder >= meta)) break;
    enviados.push(k);
    poder += poderDe(tipos, p.tipo[k], p.vida[k]);
  }
  const vao = new Set(enviados);
  for (const k of ks) if (!vao.has(k)) ctx.saida.rotulos.push({ id: p.id[k], rotulo: reserva.rotulo });
  for (const k of daReserva) if (vao.has(k)) ctx.saida.rotulos.push({ id: p.id[k], rotulo: eq.rotulo });
  return enviados;
}

// ---------- rebuilding ----------

/**
 * Remembers the group's buildings (those it has when it starts and any that join later, up to MAX_PREDIOS_EQUIPE);
 * when one falls, waits `espera` ticks, queues the same kind at a headquarters of the group that builds it (with the
 * player's own Carga, when there is enough), places it on the same cell when it is ready, and gives the new building
 * the group's label. One building at a time, in the order they were remembered; a placement refused MAX_TENTATIVAS
 * times is cancelled (refunded) and given up.
 */
function reconstruir(ctx, e, eq, ks) {
  const s = ctx.estado;
  const p = ctx.vista.proprias;
  const base = e * MAX_PREDIOS_EQUIPE * CAMPOS_PREDIO;
  const registro = r => base + r * CAMPOS_PREDIO;
  if (s.fase[e] === FASE.PARADA) {
    if (ks.length === 0) return;
    mudarFase(ctx, e, FASE.RECONSTRUINDO);
    s.predios.fill(0, base, base + MAX_PREDIOS_EQUIPE * CAMPOS_PREDIO);
    // s.ponto counts the remembered buildings
    s.ponto[e] = 0;
  }
  const lembrados = new Set();
  for (let r = 0; r < s.ponto[e]; r++) if (s.predios[registro(r) + PR_ESTADO] === PREDIO.VIVO) lembrados.add(s.predios[registro(r) + PR_ID]);
  for (const k of ks) {
    if (lembrados.has(p.id[k]) || s.ponto[e] >= MAX_PREDIOS_EQUIPE) continue;
    const t = ctx.tipos[p.tipo[k]];
    const o = registro(s.ponto[e]++);
    s.predios[o + PR_TIPO] = p.tipo[k];
    s.predios[o + PR_CX] = cantoDaPegada(p.x[k], t.pegada[0]);
    s.predios[o + PR_CY] = cantoDaPegada(p.y[k], t.pegada[1]);
    s.predios[o + PR_ID] = p.id[k];
    s.predios[o + PR_ESTADO] = PREDIO.VIVO;
    s.predios[o + PR_MARCA] = ctx.tick;
  }
  const vivos = new Set(ks.map(k => p.id[k]));
  for (let r = 0; r < s.ponto[e]; r++) {
    const o = registro(r);
    if (s.predios[o + PR_ESTADO] === PREDIO.VIVO && !vivos.has(s.predios[o + PR_ID])) {
      s.predios[o + PR_ESTADO] = PREDIO.CAIDO;
      s.predios[o + PR_MARCA] = ctx.tick;
      s.predios[o + PR_TENTATIVAS] = 0;
    }
  }
  for (let r = 0; r < s.ponto[e]; r++) {
    const o = registro(r);
    const estado = s.predios[o + PR_ESTADO];
    if (estado === PREDIO.VIVO || estado === PREDIO.DESISTIU) continue;
    reerguer(ctx, eq, ks, o);
    return;
  }
}

// Moves one fallen building along CAIDO, NA_FILA, POSTO and back to VIVO.
function reerguer(ctx, eq, ks, o) {
  const p = ctx.vista.proprias;
  const d = ctx.estado.predios;
  const tipo = d[o + PR_TIPO];
  const desde = ctx.tick - d[o + PR_MARCA];
  const qg = ks.find(k => ctx.tipos[p.tipo[k]].constroi.includes(tipo));
  if (qg === undefined) return;
  const faixa = faixaDeConstrucao(ctx.vista.filas, p.id[qg]);
  const estado = d[o + PR_ESTADO];
  const marcar = novo => {
    d[o + PR_ESTADO] = novo;
    d[o + PR_MARCA] = ctx.tick;
  };
  if (estado === PREDIO.CAIDO) {
    if (desde < eq.espera || !faixa || faixa.estado !== FAIXA_ESTADO.VAZIA) return;
    if (ctx.vista.recursos[ctx.jogador] < ctx.tipos[tipo].custo) return;
    comandar(ctx, TIPO_COMANDO.PRODUZIR, [p.id[qg]], { arg: tipo });
    return marcar(PREDIO.NA_FILA);
  }
  if (estado === PREDIO.NA_FILA) {
    if (faixa && faixa.estado === FAIXA_ESTADO.PRONTO && faixa.cabeca === tipo) {
      comandar(ctx, TIPO_COMANDO.CONSTRUIR, [p.id[qg]], { arg: tipo, x: centroDaCelula(d[o + PR_CX]), y: centroDaCelula(d[o + PR_CY]) });
      return marcar(PREDIO.POSTO);
    }
    // the queue was emptied by something else: start over
    if (desde > 2 * SEGUNDO && (!faixa || faixa.estado === FAIXA_ESTADO.VAZIA)) marcar(PREDIO.CAIDO);
    return;
  }
  if (estado !== PREDIO.POSTO) return;
  const posto = predioNaCelula(ctx, tipo, d[o + PR_CX], d[o + PR_CY]);
  if (posto >= 0) {
    // placed: it carries the group's label from the next decision on
    ctx.saida.rotulos.push({ id: p.id[posto], rotulo: eq.rotulo });
    d[o + PR_ID] = p.id[posto];
    return marcar(PREDIO.VIVO);
  }
  if (desde < ESPERA_POSTO) return;
  d[o + PR_TENTATIVAS]++;
  if (d[o + PR_TENTATIVAS] < MAX_TENTATIVAS) return marcar(PREDIO.NA_FILA);
  comandar(ctx, TIPO_COMANDO.CANCELAR, [p.id[qg]], { x: FAIXA.CONSTRUCAO, arg: 0 });
  marcar(PREDIO.DESISTIU);
}

// an own building of that kind whose footprint starts on that cell, or -1
function predioNaCelula(ctx, tipo, cx, cy) {
  const p = ctx.vista.proprias;
  const t = ctx.tipos[tipo];
  for (let k = 0; k < p.n; k++) {
    if (p.tipo[k] === tipo && cantoDaPegada(p.x[k], t.pegada[0]) === cx && cantoDaPegada(p.y[k], t.pegada[1]) === cy) return k;
  }
  return -1;
}

// state and head of the construction lane of the producer with this id, from the team's queues, or null
function faixaDeConstrucao(filas, id) {
  for (let r = 0; r + TAMANHO_REGISTRO_FILA <= filas.length; r += TAMANHO_REGISTRO_FILA) {
    if (filas[r + FL_PRODUTOR] !== id) continue;
    const base = r + FL_FAIXAS + FAIXA.CONSTRUCAO * TAMANHO_FAIXA;
    return { estado: filas[base + FX_ESTADO], cabeca: filas[base + FX_ITENS] };
  }
  return null;
}
