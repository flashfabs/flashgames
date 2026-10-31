// Combat abilities of the kinds (the `habilidade` block of unidades.json, compiled into ticks and world units here):
//   erguer    raised by HABILIDADE ERGUER and lowered by it or by a move order: still while raised, more reach and sight,
//             no penalty for shooting uphill;
//   armar     artillery that must set up before firing: it arms by itself when stopped with a target and packs up when
//             it has to move;
//   pressao   a shot after standing still for a while hits harder;
//   abalroar  a ram that stuns an enemy unit close by, on its own when ready;
//   estrepes  caltrops dropped by itself near enemy vehicles, slowing wheels that cross them;
//   tocaia    standing still for a while hides the unit from enemies farther than a cell and a half, until it fires;
//   leitura   HABILIDADE LEITURA on an enemy building in reach shows its production queue to the team for a while.
// Movement reads fatorVelocidade() (combate.js), which is 0 while set up or stunned; the presentation reads
// bandeirasDeCombate() and, for the reading, predioLido().
import { FP, FP_BITS, DONO_NEUTRO, TIPO_COMANDO } from './contratos.js';
import * as estado from './estado.js';
import { slotVivo } from './entidades.js';
import { limparOrdens } from './ordens.js';
import { celulaVisivel } from './neblina.js';
import { msParaPassos, decimosParaMundo } from './armas.js';
import { ordenarReligar } from './religar.js';
import { faseDe, FASE } from './empacotar.js';

/** Ability codes of the HABILIDADE command's `arg`. */
export const HABILIDADE = Object.freeze({ RELIGAR: 1, ERGUER: 2, LEITURA: 3 });
/**
 * Snapshot flag bits the combat module owns (contratos.js BANDEIRA reserves 512 and up). EMPACOTANDO: a building packing
 * up or a packed one setting up again; EMPACOTADO: a building packed into a unit (empacotar.js), also while it sets up.
 */
export const BANDEIRA_COMBATE = Object.freeze({ IMPLANTADO: 512, ATORDOADO: 1024, OCULTO: 2048, LENTO: 4096, EMPACOTANDO: 8192, EMPACOTADO: 16384 });
/** How far set up a unit is (sim.extras.habilidades.estado). */
export const ESTADO = Object.freeze({ NORMAL: 0, SUBINDO: 1, IMPLANTADO: 2, DESCENDO: 3 });

const TIPOS_HABILIDADE = ['erguer', 'armar', 'pressao', 'abalroar', 'estrepes', 'tocaia', 'leitura'];
// a hidden unit is still seen from this close
const ALCANCE_REVELA = (3 * FP) >> 1;
// caltrops are dropped when an enemy vehicle is this close
const ALCANCE_ESTREPES = 4 * FP;
// the automatic abilities look for a target every few ticks per unit, staggered by slot
const INTERVALO_AUTOMATICA = 6;

/** The ability of each kind in simulation units, or null; derived from the kinds, rebuilt after a load. */
export function habilidadesDe(sim) {
  if (sim.habilidadesCompiladas) return sim.habilidadesCompiladas;
  const erros = [];
  const ms = (h, campo, padrao = 0) => {
    const v = h[campo] ?? padrao;
    if (!Number.isInteger(v) || v < 0 || v > 600000) erros.push(`${h.nome}.habilidade.${campo}: ${v}`);
    return msParaPassos(v);
  };
  const decimos = (h, campo) => {
    const v = h[campo] ?? 0;
    if (!Number.isInteger(v) || v < 0 || v > 320) erros.push(`${h.nome}.habilidade.${campo}: ${v}`);
    return decimosParaMundo(v);
  };
  const porTipo = sim.tipos.map(tipo => {
    const h = tipo.extras?.habilidade;
    if (!h) return null;
    const nomeado = { ...h, nome: tipo.nome };
    if (!TIPOS_HABILIDADE.includes(h.tipo)) {
      erros.push(`${tipo.nome}.habilidade.tipo: ${h.tipo}`);
      return null;
    }
    return Object.freeze({
      tipo: h.tipo,
      alcance: decimos(nomeado, 'alcance'),
      alcanceExtra: decimos(nomeado, 'alcanceExtra'),
      visaoExtra: h.visaoExtra ?? 0,
      raio: decimos(nomeado, 'raio'),
      subir: ms(nomeado, h.tipo === 'erguer' ? 'erguerMs' : 'armarMs'),
      descer: ms(nomeado, h.tipo === 'erguer' ? 'baixarMs' : 'desarmarMs'),
      parado: ms(nomeado, 'paradoMs'),
      duracao: ms(nomeado, h.tipo === 'abalroar' ? 'atordoaMs' : 'duracaoMs'),
      vida: ms(nomeado, 'vidaMs'),
      recarga: ms(nomeado, 'recargaMs'),
      porcento: h.danoPorcento ?? h.lentidaoPorcento ?? 100,
      ignoraElevacao: h.ignoraElevacao === 1 ? 1 : 0,
    });
  });
  if (erros.length > 0) throw new Error(`habilidades inválidas:\n${erros.join('\n')}`);
  sim.habilidadesCompiladas = Object.freeze(porTipo);
  return sim.habilidadesCompiladas;
}

/**
 * Ability state, only typed arrays: per entity how far set up it is and until when, when
 * its ability is ready again, since when it stands still, until when it is stunned, and the generation all of that
 * belongs to; per team the building it reads and until when.
 */
export function criarExtrasHabilidades(sim) {
  const n = sim.capacidade;
  return {
    estado: new Uint8Array(n),
    ate: new Int32Array(n),
    pronta: new Int32Array(n),
    paradoDesde: new Int32Array(n),
    atordoadoAte: new Int32Array(n),
    geracao: new Uint16Array(n),
    leituraAlvo: new Int32Array(sim.times),
    leituraAte: new Int32Array(sim.times),
  };
}
// saved, loaded and hashed with the state once the core keeps registered extras (estado.js)
estado.registrarExtras?.('habilidades', criarExtrasHabilidades);

/** The ability state in sim.extras.habilidades, made on first use when the core did not make it. */
export function extrasHabilidades(sim) {
  sim.extras ??= {};
  sim.extras.habilidades ??= criarExtrasHabilidades(sim);
  return sim.extras.habilidades;
}

// the entity's record, cleared when the slot holds a different entity than the one it was written for
function registro(sim, ex, i) {
  if (ex.geracao[i] === sim.geracao[i]) return;
  ex.geracao[i] = sim.geracao[i];
  ex.estado[i] = ESTADO.NORMAL;
  ex.ate[i] = 0;
  ex.pronta[i] = 0;
  ex.paradoDesde[i] = sim.tick;
  ex.atordoadoAte[i] = 0;
}

const habilidadeDe = (sim, i) => habilidadesDe(sim)[sim.tipo[i]];

/** Whether entity i is set up (raised or armed). */
export function implantado(sim, i) {
  const ex = sim.extras?.habilidades;
  return !!ex && ex.geracao[i] === sim.geracao[i] && ex.estado[i] === ESTADO.IMPLANTADO;
}

/** Whether entity i may move: not set up nor setting up, and not stunned. */
export function podeMover(sim, i) {
  const ex = sim.extras?.habilidades;
  if (!ex || ex.geracao[i] !== sim.geracao[i]) return true;
  return ex.estado[i] === ESTADO.NORMAL && ex.atordoadoAte[i] <= sim.tick;
}

/** Whether entity i may fire now: not stunned, and set up if its kind must arm. */
export function podeDisparar(sim, i) {
  const h = habilidadeDe(sim, i);
  const ex = sim.extras?.habilidades;
  if (ex && ex.geracao[i] === sim.geracao[i] && ex.atordoadoAte[i] > sim.tick) return false;
  return !h || h.tipo !== 'armar' || implantado(sim, i);
}

/** Extra reach of entity i now (a raised basket), world units. */
export function alcanceExtraDe(sim, i) {
  const h = habilidadeDe(sim, i);
  return h && h.tipo === 'erguer' && implantado(sim, i) ? h.alcanceExtra : 0;
}

/** Extra sight of entity i now, cells (the fog reads it). */
export function visaoExtraDe(sim, i) {
  const h = habilidadeDe(sim, i);
  return h && h.tipo === 'erguer' && implantado(sim, i) ? h.visaoExtra : 0;
}

/** Whether entity i, shooting now, ignores the height difference (a raised basket). */
export function ignoraElevacao(sim, i) {
  const h = habilidadeDe(sim, i);
  return !!h && h.ignoraElevacao === 1 && implantado(sim, i);
}

/** Damage percent of entity i's next shot (a charged pressure shot); 100 otherwise. */
export function porcentoDoDisparo(sim, i) {
  const h = habilidadeDe(sim, i);
  const ex = sim.extras?.habilidades;
  if (!h || h.tipo !== 'pressao' || !ex || ex.geracao[i] !== sim.geracao[i]) return 100;
  return sim.tick - ex.paradoDesde[i] >= h.parado ? h.porcento : 100;
}

/** Entity i fired: a pressure shot is spent and a hidden unit shows itself. */
export function disparou(sim, i) {
  const ex = sim.extras?.habilidades;
  if (!ex || !habilidadeDe(sim, i)) return;
  registro(sim, ex, i);
  ex.paradoDesde[i] = sim.tick;
}

/** Whether entity i is hidden from team `time` (an ambush unit standing still, farther than a cell and a half). */
export function ocultoPara(sim, i, time, x, y) {
  const h = habilidadeDe(sim, i);
  const ex = sim.extras?.habilidades;
  if (!h || h.tipo !== 'tocaia' || !ex || ex.geracao[i] !== sim.geracao[i] || sim.time[i] === time) return false;
  if (sim.tick - ex.paradoDesde[i] < h.parado) return false;
  if (x === undefined) return true;
  const dx = sim.x[i] - x;
  const dy = sim.y[i] - y;
  return dx > ALCANCE_REVELA || dx < -ALCANCE_REVELA || dy > ALCANCE_REVELA || dy < -ALCANCE_REVELA;
}

/** Bits of BANDEIRA_COMBATE for entity i, for the snapshot. */
export function bandeirasDeCombate(sim, i) {
  const ex = sim.extras?.habilidades;
  let b = 0;
  if (ex && ex.geracao[i] === sim.geracao[i]) {
    if (ex.estado[i] === ESTADO.IMPLANTADO) b |= BANDEIRA_COMBATE.IMPLANTADO;
    if (ex.atordoadoAte[i] > sim.tick) b |= BANDEIRA_COMBATE.ATORDOADO;
    if (ocultoPara(sim, i, -1)) b |= BANDEIRA_COMBATE.OCULTO;
  }
  if (sim.extras?.combate?.lentoAte[i] > sim.tick) b |= BANDEIRA_COMBATE.LENTO;
  const fase = faseDe(sim, i);
  if (fase === FASE.EMPACOTANDO || fase === FASE.DESEMPACOTANDO) b |= BANDEIRA_COMBATE.EMPACOTANDO;
  if (fase === FASE.EMPACOTADO || fase === FASE.DESEMPACOTANDO) b |= BANDEIRA_COMBATE.EMPACOTADO;
  return b;
}

/** Slot of the enemy building team `time` is reading now, or -1. */
export function predioLido(sim, time) {
  const ex = sim.extras?.habilidades;
  if (!ex || time >= sim.times || ex.leituraAte[time] <= sim.tick) return -1;
  return slotVivo(sim, ex.leituraAlvo[time]);
}

/** Stuns live entity j until `ate` (a ram). */
export function atordoar(sim, j, ate) {
  const ex = extrasHabilidades(sim);
  registro(sim, ex, j);
  if (ate > ex.atordoadoAte[j]) ex.atordoadoAte[j] = ate;
}

function comecar(sim, ex, i, h, estado) {
  ex.estado[i] = estado;
  ex.ate[i] = sim.tick + (estado === ESTADO.SUBINDO ? h.subir : h.descer);
}

/** The HABILIDADE command (C1): `arg` is a HABILIDADE code, `alvo` the target entity when the ability needs one. */
export function comandoHabilidade(sim, unidades, codigo, alvoId) {
  if (codigo === HABILIDADE.RELIGAR) ordenarReligar(sim, unidades, alvoId);
  else usarHabilidade(sim, unidades, codigo, alvoId);
}

/**
 * HABILIDADE command: ERGUER toggles the basket of the units that have one (raising stops them); LEITURA sends the
 * first able unit's reading at the enemy building `alvoId` if it is in reach, seen and the ability is ready.
 */
export function usarHabilidade(sim, unidades, codigo, alvoId) {
  const ex = extrasHabilidades(sim);
  if (codigo === HABILIDADE.ERGUER) {
    for (const i of unidades) {
      const h = habilidadeDe(sim, i);
      if (!h || h.tipo !== 'erguer') continue;
      registro(sim, ex, i);
      if (ex.estado[i] === ESTADO.NORMAL) {
        limparOrdens(sim, i);
        sim.parada[i] = 1;
        comecar(sim, ex, i, h, ESTADO.SUBINDO);
      } else if (ex.estado[i] === ESTADO.IMPLANTADO) {
        comecar(sim, ex, i, h, ESTADO.DESCENDO);
      }
    }
    return;
  }
  if (codigo !== HABILIDADE.LEITURA) return;
  const j = slotVivo(sim, alvoId);
  if (j < 0) return;
  for (const i of unidades) {
    const h = habilidadeDe(sim, i);
    if (!h || h.tipo !== 'leitura' || sim.time[j] === sim.time[i] || sim.time[j] === DONO_NEUTRO) continue;
    registro(sim, ex, i);
    if (ex.pronta[i] > sim.tick) continue;
    const dx = sim.x[j] - sim.x[i];
    const dy = sim.y[j] - sim.y[i];
    const alcance = h.alcance + sim.raioPorTipo[sim.tipo[j]];
    if (dx * dx + dy * dy > alcance * alcance) continue;
    if (!celulaVisivel(sim, sim.time[i], (sim.y[j] >> FP_BITS) * sim.mapa.largura + (sim.x[j] >> FP_BITS))) continue;
    ex.leituraAlvo[sim.time[i]] = alvoId;
    ex.leituraAte[sim.time[i]] = sim.tick + h.duracao;
    ex.pronta[i] = sim.tick + h.recarga;
    return;
  }
}

// the closest live enemy unit of entity i within `alcance` world units (ties to the lowest slot), vehicles only if
// asked; -1 when none
function inimigoProximo(sim, i, alcance, soVeiculos) {
  let melhor = -1;
  let melhorD = 0;
  const a = alcance >> 4;
  for (let j = 0; j < sim.capacidade; j++) {
    if (!sim.ativo[j] || sim.time[j] === sim.time[i] || sim.time[j] === DONO_NEUTRO) continue;
    const t = sim.tipos[sim.tipo[j]];
    if ((t.categoria ?? 0) !== 0 || (soVeiculos && t.classe === 0)) continue;
    const dx = (sim.x[j] - sim.x[i]) >> 4;
    const dy = (sim.y[j] - sim.y[i]) >> 4;
    const d = dx * dx + dy * dy;
    if (d <= a * a && (melhor < 0 || d < melhorD)) {
      melhor = j;
      melhorD = d;
    }
  }
  return melhor;
}

/**
 * One tick of abilities, in slot order, for the kinds that have one: stillness, setting up and packing, and the
 * automatic ones (arming, ram, caltrops). `deixarEstrepes(sim, i, x, y, h)` drops a patch (combat module).
 */
export function avancarHabilidades(sim, deixarEstrepes) {
  const habilidades = habilidadesDe(sim);
  if (!habilidades.some(Boolean)) return;
  const ex = extrasHabilidades(sim);
  const ord = sim.ordens;
  for (let i = 0; i < sim.capacidade; i++) {
    if (!sim.ativo[i]) continue;
    const h = habilidades[sim.tipo[i]];
    if (!h) continue;
    registro(sim, ex, i);
    if (sim.vx[i] !== 0 || sim.vy[i] !== 0) ex.paradoDesde[i] = sim.tick;
    // a move order packs a set-up unit up first; an attack-move or patrol only once nothing is left to shoot
    const modo = ord.ordem[i] >= 0 ? ord.modo[ord.ordem[i]] : 0;
    const mandadoAndar = ord.ordem[i] >= 0 && !sim.parada[i] && (modo === TIPO_COMANDO.MOVER || (sim.alvo[i] < 0 && modo !== TIPO_COMANDO.ATACAR));
    switch (ex.estado[i]) {
      case ESTADO.SUBINDO:
        if (sim.tick >= ex.ate[i]) ex.estado[i] = ESTADO.IMPLANTADO;
        break;
      case ESTADO.DESCENDO:
        if (sim.tick >= ex.ate[i]) ex.estado[i] = ESTADO.NORMAL;
        break;
      case ESTADO.IMPLANTADO:
        if (mandadoAndar || (h.tipo === 'armar' && sim.alvo[i] < 0 && !sim.parada[i])) comecar(sim, ex, i, h, ESTADO.DESCENDO);
        break;
      default:
        if (h.tipo === 'armar' && sim.alvo[i] >= 0) comecar(sim, ex, i, h, ESTADO.SUBINDO);
    }
    if (ex.pronta[i] > sim.tick || (sim.tick + i) % INTERVALO_AUTOMATICA !== 0) continue;
    if (h.tipo === 'abalroar') {
      const j = inimigoProximo(sim, i, h.alcance, false);
      if (j >= 0) {
        atordoar(sim, j, sim.tick + h.duracao);
        ex.pronta[i] = sim.tick + h.recarga;
      }
    } else if (h.tipo === 'estrepes' && inimigoProximo(sim, i, ALCANCE_ESTREPES, true) >= 0) {
      deixarEstrepes(sim, i, sim.x[i], sim.y[i], h);
      ex.pronta[i] = sim.tick + h.recarga;
    }
  }
}
