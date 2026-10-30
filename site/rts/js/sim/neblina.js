// Fog of war per team, incremental: each team has a count of observers per cell; a unit adds its sight disc when it
// enters a cell and removes it when it leaves or dies, so only units that changed cell cost anything. A cell is visible
// while its count is above zero, and explored forever after. Height: a unit on level h sees a higher cell (the cliff
// edge) but nothing behind it, by walking each disc cell back to the centre along a precomputed ray.
import { VISAO, FP_BITS } from './contratos.js';

const MAX_RAIO = 15;

// Disc of each radius: offsets sorted by distance from the centre (the centre first) and, for each offset, the index
// of the previous cell on the ray towards the centre.
function montarDisco(raio) {
  const offsets = [];
  for (let dy = -raio; dy <= raio; dy++) for (let dx = -raio; dx <= raio; dx++) if (dx * dx + dy * dy <= raio * raio) offsets.push([dx, dy]);
  offsets.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]) || a[1] - b[1] || a[0] - b[0]);
  const indice = new Map(offsets.map(([dx, dy], k) => [`${dx},${dy}`, k]));
  const dx = Int32Array.from(offsets, o => o[0]);
  const dy = Int32Array.from(offsets, o => o[1]);
  const anterior = new Int32Array(offsets.length).fill(-1);
  for (let k = 1; k < offsets.length; k++) {
    // one step back along the line to the centre, rounded half away from zero, in integers
    const n = Math.max(Math.abs(dx[k]), Math.abs(dy[k]));
    const recuar = v => Math.sign(v) * Math.trunc((2 * Math.abs(v) * (n - 1) + n) / (2 * n));
    anterior[k] = indice.get(`${recuar(dx[k])},${recuar(dy[k])}`);
  }
  return { dx, dy, anterior, visivel: new Uint8Array(offsets.length) };
}

const DISCOS = Array.from({ length: MAX_RAIO + 1 }, (_, raio) => montarDisco(raio));

/** Fog state for `times` teams on a map. */
export function criarNeblina(mapa, times) {
  const celulas = mapa.largura * mapa.altura;
  return {
    times,
    contagem: Array.from({ length: times }, () => new Uint16Array(celulas)),
    explorado: Array.from({ length: times }, () => new Uint8Array(celulas)),
  };
}

// Adds (sinal = 1) or removes (sinal = -1) the sight of one unit standing on `celula` at height `nivelOrigem`.
function carimbar(neb, mapa, time, celula, raio, sinal) {
  const { largura, altura, nivel } = mapa;
  const disco = DISCOS[raio];
  const { dx, dy, anterior, visivel } = disco;
  const contagem = neb.contagem[time];
  const explorado = neb.explorado[time];
  const cy = Math.trunc(celula / largura);
  const cx = celula - cy * largura;
  const nivelOrigem = nivel[celula];
  for (let k = 0; k < dx.length; k++) {
    const x = cx + dx[k];
    const y = cy + dy[k];
    if (x < 0 || y < 0 || x >= largura || y >= altura) {
      visivel[k] = 0;
      continue;
    }
    if (k > 0) {
      const a = anterior[k];
      // seen only if the previous cell on the ray is seen and is not higher than the eye
      if (!visivel[a] || nivel[(cy + dy[a]) * largura + cx + dx[a]] > nivelOrigem) {
        visivel[k] = 0;
        continue;
      }
    }
    visivel[k] = 1;
    const c = y * largura + x;
    contagem[c] += sinal;
    explorado[c] = 1;
  }
}

/**
 * Brings every unit's sight up to date, in slot order: units that moved to another cell, died or appeared.
 * celulaVisao[i] holds the cell the unit's sight is stamped on (-1 none), raioVisao[i] its radius.
 */
export function atualizarNeblina(sim) {
  const { neblina, mapa, celulaVisao, raioVisao } = sim;
  const largura = mapa.largura;
  for (let i = 0; i < sim.capacidade; i++) {
    const vivo = sim.ativo[i] === 1;
    const celula = vivo ? (sim.y[i] >> FP_BITS) * largura + (sim.x[i] >> FP_BITS) : -1;
    if (celula === celulaVisao[i]) continue;
    const time = sim.time[i];
    if (celulaVisao[i] >= 0) carimbar(neblina, mapa, time, celulaVisao[i], raioVisao[i], -1);
    if (vivo) {
      const raio = sim.tipos[sim.tipo[i]].visao;
      carimbar(neblina, mapa, time, celula, raio, 1);
      raioVisao[i] = raio;
    }
    celulaVisao[i] = celula;
  }
}

/** VISAO.* grid of one team, in the snapshot format. */
export function visaoDoTime(sim, time, destino = new Uint8Array(sim.mapa.largura * sim.mapa.altura)) {
  const contagem = sim.neblina.contagem[time];
  const explorado = sim.neblina.explorado[time];
  for (let c = 0; c < destino.length; c++) destino[c] = contagem[c] > 0 ? VISAO.VISIVEL : explorado[c] ? VISAO.VISTA : VISAO.NUNCA;
  return destino;
}

/** Whether a cell is visible to a team right now. */
export const celulaVisivel = (sim, time, celula) => sim.neblina.contagem[time][celula] > 0;
