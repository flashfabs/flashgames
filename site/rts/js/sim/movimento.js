// Movement: each unit steers at a point a few cells ahead on its order's flow field, then straight at its formation
// slot once close; integer separation from neighbours in spatial buckets with priorities (a unit standing still gives
// way to one moving, a unit holding position gives way to nobody, harvesters of one kind pass through each other);
// stuck detection by lack of progress, with a side step far from the goal and acceptance near it; terrain collision
// one axis at a time so units slide along rock; body and turret turn at their own rates.
import { FP, FP_BITS, TIPO_COMANDO } from './contratos.js';
import { anguloDe, seno, cosseno, girarAngulo, raizInteira } from './matematica.js';
import { INFINITO, celulaAdiante, linhaLivre } from './caminhos.js';
import { concluirOrdem, limparOrdens } from './ordens.js';
import { slotVivo } from './entidades.js';

export const TAMANHO_BALDE_BITS = FP_BITS + 1; // spatial hash buckets of 2x2 cells
// world units around the slot where a unit counts as arrived
const RAIO_CHEGADA = 200;
// cells ahead on the field a unit steers at
const ALCANCE_ADIANTE = 3;
// ticks without progress before a unit is treated as stuck
export const LIMITE_SEM_PROGRESSO = 45;
// field distance units (10 per cell) of progress that reset the stuck counter
const PROGRESSO_MINIMO = 3;
// a stuck unit counts as arrived within this field distance (10 per cell) beyond its slot's distance from the target
const TOLERANCIA_CHEGADA = 40;
// or within this distance of its own slot, steering straight (10 per cell, Manhattan)
const TOLERANCIA_SLOT = 30;
const DURACAO_DESVIO = 24;
// a unit this many ticks without progress passes through moving units of other orders instead of pushing them
const ESPERA_ATRAVESSAR = 20;
// a unit that stood at its slot and got pushed this far away walks back
const DESLOCAMENTO_RETORNO = (3 * FP) >> 1;
// straight-line check: how often per unit (a power of two) and how far, world units
const INTERVALO_VISADA = 8;
// how a unit's progress is measured: no field yet (straight distance to its slot), along the field, or within the
// formation's reach (straight distance to its slot again); a unit only moves forward through these
const FASE_SEM_CAMPO = 0;
const FASE_CAMPO = 1;
const FASE_ZONA = 2;
const ALCANCE_VISADA = 32 * FP;

/** Rebuilds the bucket lists from the live units, in slot order. */
export function montarBaldes(sim) {
  const { baldeCabeca, baldeProximo, baldeLargura } = sim;
  baldeCabeca.fill(-1);
  for (let i = 0; i < sim.capacidade; i++) {
    if (!sim.ativo[i]) continue;
    const b = (sim.y[i] >> TAMANHO_BALDE_BITS) * baldeLargura + (sim.x[i] >> TAMANHO_BALDE_BITS);
    baldeProximo[i] = baldeCabeca[b];
    baldeCabeca[b] = i;
  }
}

// desired velocity of the unit being moved, written by desejar()
let desejoX = 0;
let desejoY = 0;

// Desired velocity of unit i this tick.
function desejar(sim, i, tipo) {
  desejoX = 0;
  desejoY = 0;
  const ord = sim.ordens;
  const o = ord.ordem[i];
  if (o < 0) return;
  const modo = ord.modo[o];
  // attack-move, patrol and the team defaults stop to shoot; a plain move keeps going and shoots on the way
  if (sim.alvo[i] >= 0 && modo !== TIPO_COMANDO.MOVER) return;
  if (sim.parada[i]) {
    if (ord.fixa[o]) return;
    const dx = ord.metaX[i] - sim.x[i];
    const dy = ord.metaY[i] - sim.y[i];
    if (dx > DESLOCAMENTO_RETORNO || dx < -DESLOCAMENTO_RETORNO || dy > DESLOCAMENTO_RETORNO || dy < -DESLOCAMENTO_RETORNO) {
      sim.parada[i] = 0;
      sim.melhorDist[i] = INFINITO;
      sim.semProgresso[i] = 0;
    } else {
      return;
    }
  }
  if (modo === TIPO_COMANDO.ATACAR) {
    if (!seguirAlvo(sim, i, o)) return;
  }
  const { largura } = sim.mapa;
  const cam = sim.caminhos;
  const e = ord.campo[o];
  const celula = (sim.y[i] >> FP_BITS) * largura + (sim.x[i] >> FP_BITS);
  const fixa = ord.fixa[o];
  let alvoX = fixa ? ord.tx[o] : ord.metaX[i];
  let alvoY = fixa ? ord.ty[o] : ord.metaY[i];
  let dCampo = INFINITO;
  let direto = true;
  if (((sim.tick + i) & (INTERVALO_VISADA - 1)) === 0) {
    const vx = alvoX - sim.x[i];
    const vy = alvoY - sim.y[i];
    const perto = vx < ALCANCE_VISADA && vx > -ALCANCE_VISADA && vy < ALCANCE_VISADA && vy > -ALCANCE_VISADA;
    sim.visada[i] = perto && linhaLivre(cam, sim.x[i], sim.y[i], alvoX, alvoY) ? 1 : 0;
  }
  if (cam.pronto[e]) {
    const d = cam.dist[e][celula];
    if (d !== INFINITO) {
      dCampo = d;
      if (fixa && d <= ord.raioChegada[o]) return; // the team default idles around its target
      if (!sim.visada[i] && (fixa || d > ord.limiar[i])) {
        direto = false;
        // the farthest of the next cells on the field that a straight line reaches without clipping rock
        for (let alcance = ALCANCE_ADIANTE; alcance >= 1; alcance--) {
          const adiante = celulaAdiante(cam, e, celula, alcance);
          alvoX = (adiante % largura) * FP + (FP >> 1);
          alvoY = Math.trunc(adiante / largura) * FP + (FP >> 1);
          if (alcance === 1 || linhaLivre(cam, sim.x[i], sim.y[i], alvoX, alvoY)) break;
        }
      }
    }
  }
  const dx = alvoX - sim.x[i];
  const dy = alvoY - sim.y[i];
  if (direto && dx * dx + dy * dy <= RAIO_CHEGADA * RAIO_CHEGADA) {
    // a team default never ends: its units just idle at the target
    if (!fixa) concluirOrdem(sim, i);
    return;
  }
  let angulo = anguloDe(dx, dy);
  if (!fixa) {
    // the phase only moves forward, or a unit on the edge of the reach would flip measures and never look stuck
    let fase = sim.fase[i];
    if (dCampo !== INFINITO) fase = Math.max(fase, dCampo <= ord.limiar[i] ? FASE_ZONA : FASE_CAMPO);
    let medida = dCampo;
    if (fase !== FASE_CAMPO) {
      const sx = ord.metaX[i] - sim.x[i];
      const sy = ord.metaY[i] - sim.y[i];
      medida = Math.trunc((((sx < 0 ? -sx : sx) + (sy < 0 ? -sy : sy)) * 10) / FP);
    }
    if (vigiarProgresso(sim, i, medida, fase, angulo, dCampo)) return;
  }
  if (sim.tick < sim.desvioAte[i]) angulo = sim.desvioDirecao[i];
  desejoX = (cosseno(angulo) * tipo.velocidade) >> FP_BITS;
  desejoY = (seno(angulo) * tipo.velocidade) >> FP_BITS;
}

// ATACAR: walk to the target until it is in range; false when the unit should not move.
function seguirAlvo(sim, i, o) {
  const ord = sim.ordens;
  const alvo = slotVivo(sim, ord.alvo[o]);
  if (alvo < 0) {
    // target gone: the queue or patrol goes on, otherwise the unit stops with no order
    concluirOrdem(sim, i);
    if (ord.ordem[i] === o) limparOrdens(sim, i);
    return false;
  }
  ord.metaX[i] = sim.x[alvo];
  ord.metaY[i] = sim.y[alvo];
  return sim.alvo[i] !== alvo;
}

// Stuck detection; returns true when the unit just counted as arrived. `medida` is the distance being reduced in
// the unit's phase, `dCampo` the field distance to the target (INFINITO while the field is not ready).
function vigiarProgresso(sim, i, medida, fase, angulo, dCampo) {
  if (sim.fase[i] !== fase) {
    sim.fase[i] = fase;
    sim.melhorDist[i] = INFINITO;
  }
  if (medida + PROGRESSO_MINIMO <= sim.melhorDist[i]) {
    sim.melhorDist[i] = medida;
    sim.semProgresso[i] = 0;
    return false;
  }
  sim.semProgresso[i]++;
  if (sim.semProgresso[i] < LIMITE_SEM_PROGRESSO) return false;
  sim.semProgresso[i] = 0;
  sim.melhorDist[i] = medida;
  // close enough counts as arrived: a few cells from its own slot, inside the formation's reach on the field, or
  // pressed against units of its own group that already stopped (the group already holds the destination); the spot
  // where it stopped becomes its slot, so it does not walk back into the crowd
  const pertoDaVaga = fase !== FASE_CAMPO && medida <= TOLERANCIA_SLOT;
  if (pertoDaVaga || dCampo <= sim.ordens.limiar[i] + TOLERANCIA_CHEGADA || encostaNoGrupoParado(sim, i)) {
    sim.ordens.metaX[i] = sim.x[i];
    sim.ordens.metaY[i] = sim.y[i];
    concluirOrdem(sim, i);
    return true;
  }
  // far from the goal: step sideways for a moment, to the right first (as everyone keeps right), then alternating,
  // never into rock
  sim.desvios[i]++;
  const primeiro = (sim.desvios[i] & 1) === 1 ? 64 : 192;
  for (const lado of [primeiro, 256 - primeiro]) {
    const direcao = (angulo + lado) & 255;
    const px = sim.x[i] + cosseno(direcao);
    const py = sim.y[i] + seno(direcao);
    if (sim.mapa.bloqueado[(py >> FP_BITS) * sim.mapa.largura + (px >> FP_BITS)]) continue;
    sim.desvioDirecao[i] = direcao;
    sim.desvioAte[i] = sim.tick + DURACAO_DESVIO;
    break;
  }
  return false;
}

// Whether a stopped unit of the same order is within reach of unit i (diameters plus half a cell).
function encostaNoGrupoParado(sim, i) {
  const { baldeCabeca, baldeProximo, baldeLargura, ativo, parada, x, y, raioPorTipo, tipo } = sim;
  const ordem = sim.ordens.ordem;
  const linhas = Math.trunc(baldeCabeca.length / baldeLargura);
  const bx = x[i] >> TAMANHO_BALDE_BITS;
  const by = y[i] >> TAMANHO_BALDE_BITS;
  for (let yb = Math.max(0, by - 1); yb <= Math.min(linhas - 1, by + 1); yb++) {
    for (let xb = Math.max(0, bx - 1); xb <= Math.min(baldeLargura - 1, bx + 1); xb++) {
      for (let j = baldeCabeca[yb * baldeLargura + xb]; j >= 0; j = baldeProximo[j]) {
        if (j === i || !ativo[j] || !parada[j] || ordem[j] !== ordem[i]) continue;
        const alcance = raioPorTipo[tipo[i]] + raioPorTipo[tipo[j]] + (FP >> 1);
        const dx = x[j] - x[i];
        const dy = y[j] - y[i];
        if (dx * dx + dy * dy <= alcance * alcance) return true;
      }
    }
  }
  return false;
}

/** Moves every live unit one tick, in slot order. */
export function mover(sim) {
  // hot loop: everything it touches in locals
  const { baldeCabeca, baldeProximo, baldeLargura, tipos, capacidade, ativo, tipo: tipoDe, x, y, vx, vy, parada, segurando } = sim;
  const ordem = sim.ordens.ordem;
  const { largura, bloqueado } = sim.mapa;
  const linhas = Math.trunc(baldeCabeca.length / baldeLargura);
  const raioDe = sim.raioPorTipo;
  const coletorDe = sim.coletorPorTipo;
  for (let i = 0; i < capacidade; i++) {
    if (!ativo[i]) continue;
    const tipo = tipos[tipoDe[i]];
    const velocidade = tipo.velocidade;
    desejar(sim, i, tipo);
    const andando = desejoX !== 0 || desejoY !== 0;
    // steering inertia smooths the turns
    vx[i] = (vx[i] * 3 + desejoX) >> 2;
    vy[i] = (vy[i] * 3 + desejoY) >> 2;
    const x0 = x[i];
    const y0 = y[i];
    let nx = x0 + vx[i];
    let ny = y0 + vy[i];

    if (!segurando[i]) {
      // separation against neighbours in the surrounding buckets
      const meuTipo = tipoDe[i];
      const meuRaio = raioDe[meuTipo];
      const passaColetor = coletorDe[meuTipo] === 1 && andando;
      const atravessa = andando && sim.semProgresso[i] > ESPERA_ATRAVESSAR;
      const bx = nx >> TAMANHO_BALDE_BITS;
      const by = ny >> TAMANHO_BALDE_BITS;
      const y0b = by > 0 ? by - 1 : 0;
      const y1b = by < linhas - 1 ? by + 1 : linhas - 1;
      const x0b = bx > 0 ? bx - 1 : 0;
      const x1b = bx < baldeLargura - 1 ? bx + 1 : baldeLargura - 1;
      let empurraX = 0;
      let empurraY = 0;
      for (let by2 = y0b; by2 <= y1b; by2++) {
        for (let bx2 = x0b; bx2 <= x1b; bx2++) {
          for (let j = baldeCabeca[by2 * baldeLargura + bx2]; j >= 0; j = baldeProximo[j]) {
            if (j === i || !ativo[j]) continue;
            const outroTipo = tipoDe[j];
            const minimo = meuRaio + raioDe[outroTipo];
            const dx = nx - x[j];
            if (dx >= minimo || dx <= -minimo) continue;
            const dy = ny - y[j];
            if (dy >= minimo || dy <= -minimo) continue;
            const d2 = dx * dx + dy * dy;
            if (d2 >= minimo * minimo) continue;
            const outroParado = parada[j] === 1 || ordem[j] < 0;
            // harvesters of the same kind, both on their way, pass through each other
            if (passaColetor && outroTipo === meuTipo && !outroParado) continue;
            if (d2 === 0) {
              empurraX += i < j ? 24 : -24;
              continue;
            }
            const d = raizInteira(d2);
            const sobreposicao = minimo - d;
            // two groups on the move cross with little pushing, and keep to their right when they meet head on, so they
            // pass in lanes instead of jamming
            const outroGrupo = andando && !outroParado && ordem[j] !== ordem[i];
            if (outroGrupo && atravessa) continue;
            const contraFluxo = outroGrupo && desejoX * vx[j] + desejoY * vy[j] < 0;
            // who gives way: standing still yields to moving, nobody pushes a unit that holds position
            const divisor = segurando[j] ? 1 : outroGrupo || (andando && outroParado) ? 6 : !andando && !outroParado ? 2 : 3;
            const q = d * divisor;
            empurraX += ((dx * sobreposicao) / q) | 0;
            empurraY += ((dy * sobreposicao) / q) | 0;
            if (contraFluxo) {
              const lateral = (sobreposicao / (2 * velocidade)) | 0;
              empurraX -= desejoY * lateral;
              empurraY += desejoX * lateral;
            }
          }
        }
      }
      const limite = velocidade;
      nx += empurraX > limite ? limite : empurraX < -limite ? -limite : empurraX;
      ny += empurraY > limite ? limite : empurraY < -limite ? -limite : empurraY;
    }

    // terrain collision, one axis at a time so units slide along rock
    if (bloqueado[(y0 >> FP_BITS) * largura + (nx >> FP_BITS)]) nx = x0;
    if (bloqueado[(ny >> FP_BITS) * largura + (nx >> FP_BITS)]) ny = y0;
    orientar(sim, i, tipo, nx - x0, ny - y0);
    x[i] = nx;
    y[i] = ny;
  }
}

// Body faces the direction of travel; the turret faces the target, or follows the body.
function orientar(sim, i, tipo, dx, dy) {
  if (dx * dx + dy * dy > 400) sim.dirCorpo[i] = girarAngulo(sim.dirCorpo[i], anguloDe(dx, dy), tipo.giroCorpo);
  const alvo = sim.alvo[i];
  const desejada = alvo >= 0 ? anguloDe(sim.x[alvo] - sim.x[i], sim.y[alvo] - sim.y[i]) : sim.dirCorpo[i];
  sim.dirTorre[i] = girarAngulo(sim.dirTorre[i], desejada, tipo.giroTorre);
}
