// Terrain height for the presentation: turns the static map's height levels (0..nivelMaximo per cell) and blocked
// cells into one continuous height field, shared by the terrain shader (as a texture), the unit and building heights,
// and the input layer (a click on a plateau lands on the plateau's cell, not on the ground behind it).
//
// Rules, from the map layers only:
// - between two open cells of different levels the ground slopes gently, over about two cells;
// - next to a blocked cell the level steps up or down as a cliff, a quarter of a cell wide;
// - a blocked region (rock, cliff rim) rises to the highest level among its cells and the open cells around it, so a
//   cliff rim drawn at the foot of a plateau and the generator's rock outcrops both stand at the plateau's top;
// - a cell with a blocking decoration (a ruined wall, a bus wreck) gets a block on top, so it does not read as an
//   invisible wall.
// Heights are sampled AMOSTRAS_POR_CELULA times per cell along each axis; the shader reads the same grid with bilinear
// filtering, and alturaEm() reproduces that filter on the CPU.

export const AMOSTRAS_POR_CELULA = 4;
// open slopes are smoothed by a tent this many samples wide on each side (one cell)
const RAIO_SUAVE = AMOSTRAS_POR_CELULA;
/** Height of the block a blocking decoration stands as, in metres. */
export const ALTURA_BLOCO_METROS = 2.5;
// the block covers the middle of its cell, leaving this much (in cells) at each side
const FOLGA_BLOCO = 0.12;
// cliff edges wander up to this much (in cells) so the rims do not follow the grid
const ONDULACAO_PENHASCO = 0.14;

const VIZINHOS_X = [1, -1, 0, 0, 1, 1, -1, -1];
const VIZINHOS_Y = [0, 0, 1, -1, 1, -1, 1, -1];

function hash(ix, iy) {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Smooth value noise in -1..1 with a lattice of one cell.
function ondulacao(x, y, semente) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix + semente, iy);
  const b = hash(ix + 1 + semente, iy);
  const c = hash(ix + semente, iy + 1);
  const d = hash(ix + 1 + semente, iy + 1);
  return (a + (b - a) * sx + (c - a + (a - b + d - c) * sx) * sy) * 2 - 1;
}

/**
 * Level each cell is drawn at: open cells keep their own; every 8-connected blocked region takes the highest level
 * among its cells and the open cells touching it. Cells marked in `fixos` (blocked water) keep their own level and
 * do not join a region.
 * @param {{ largura: number, altura: number, bloqueado: Uint8Array, nivel?: Uint8Array }} mapa
 * @param {number} nivelMaximo
 * @param {Uint8Array | null} [fixos]
 */
export function niveisDeDesenho(mapa, nivelMaximo, fixos = null) {
  const { largura, altura, bloqueado } = mapa;
  const total = largura * altura;
  const nivel = mapa.nivel ?? new Uint8Array(total);
  const saida = new Uint8Array(total);
  const regiao = new Int32Array(total).fill(-1);
  const fila = new Int32Array(total);
  for (let i = 0; i < total; i++) saida[i] = Math.min(nivelMaximo, nivel[i]);
  for (let inicio = 0; inicio < total; inicio++) {
    if (!bloqueado[inicio] || regiao[inicio] >= 0 || (fixos && fixos[inicio])) continue;
    // flood the region, tracking the highest level seen in it and around it
    let n = 0;
    let maior = 0;
    regiao[inicio] = inicio;
    fila[n++] = inicio;
    for (let k = 0; k < n; k++) {
      const u = fila[k];
      maior = Math.max(maior, saida[u]);
      const ux = u % largura;
      const uy = (u - ux) / largura;
      for (let v = 0; v < 8; v++) {
        const x = ux + VIZINHOS_X[v];
        const y = uy + VIZINHOS_Y[v];
        if (x < 0 || y < 0 || x >= largura || y >= altura) continue;
        const w = y * largura + x;
        if (!bloqueado[w]) maior = Math.max(maior, saida[w]);
        else if (regiao[w] < 0 && !(fixos && fixos[w])) {
          regiao[w] = inicio;
          fila[n++] = w;
        }
      }
    }
    for (let k = 0; k < n; k++) saida[fila[k]] = maior;
  }
  return saida;
}

/**
 * Height field of a static map.
 * @param {{ largura: number, altura: number, bloqueado: Uint8Array, nivel?: Uint8Array }} mapa
 * @param {ReturnType<typeof import('./projecao.js').criarProjecao>} projecao
 * @param {Uint8Array | null} [fixos] cells that keep their own level although blocked (water)
 * @param {Uint8Array | null} [blocos] cells with a blocking decoration (1), raised by ALTURA_BLOCO_METROS
 */
export function criarRelevo(mapa, projecao, fixos = null, blocos = null) {
  const { largura, altura, bloqueado } = mapa;
  const { nivelMaximo, metrosPorNivel } = projecao;
  const niveis = niveisDeDesenho(mapa, nivelMaximo, fixos);
  const alturaMaxima = nivelMaximo * metrosPorNivel;
  const S = AMOSTRAS_POR_CELULA;
  const celula = (x, y) => Math.min(altura - 1, Math.max(0, y)) * largura + Math.min(largura - 1, Math.max(0, x));
  const larguraFina = largura * S;
  const alturaFina = altura * S;
  const fina = new Uint8Array(larguraFina * alturaFina);
  const bruta = new Float32Array(larguraFina * alturaFina);
  // cells next to a cliff keep the sharp step; everything else gets the gentle slopes
  const perto = new Uint8Array(largura * altura);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const i = y * largura + x;
      for (let v = 0; v < 8 && !perto[i]; v++) {
        const w = celula(x + VIZINHOS_X[v], y + VIZINHOS_Y[v]);
        if ((bloqueado[i] || bloqueado[w]) && niveis[w] !== niveis[i]) perto[i] = 1;
      }
    }
  }

  const suave = t => t * t * (3 - 2 * t);

  for (let j = 0; j < alturaFina; j++) {
    const py = (j + 0.5) / S;
    for (let i = 0; i < larguraFina; i++) {
      const px = (i + 0.5) / S;
      // the cell this sample belongs to, with a wavy border so cliff rims do not follow the grid
      const casa = celula(Math.floor(px + ondulacao(px * 1.7, py * 1.7, 11) * ONDULACAO_PENHASCO), Math.floor(py + ondulacao(px * 1.7, py * 1.7, 37) * ONDULACAO_PENHASCO));
      const nivelCasa = niveis[casa];
      const casaAberta = !bloqueado[casa];
      // bilinear over the four nearest cell centres; a centre across a cliff counts as the home level
      const cx = Math.floor(px - 0.5);
      const cy = Math.floor(py - 0.5);
      const tx = suave(px - 0.5 - cx);
      const ty = suave(py - 0.5 - cy);
      let h = 0;
      for (let b = 0; b < 2; b++) {
        for (let a = 0; a < 2; a++) {
          const c = celula(cx + a, cy + b);
          const ligada = c === casa || (casaAberta && !bloqueado[c]);
          const peso = (a ? tx : 1 - tx) * (b ? ty : 1 - ty);
          h += (ligada ? niveis[c] : nivelCasa) * peso;
        }
      }
      bruta[j * larguraFina + i] = h;
    }
  }
  suavizarEncostas(bruta, larguraFina, alturaFina, perto, largura);
  if (blocos) {
    const bloco = ALTURA_BLOCO_METROS / metrosPorNivel;
    for (let j = 0; j < alturaFina; j++) {
      const py = (j + 0.5) / S;
      const fy = py - Math.floor(py);
      if (fy < FOLGA_BLOCO || fy > 1 - FOLGA_BLOCO) continue;
      for (let i = 0; i < larguraFina; i++) {
        const px = (i + 0.5) / S;
        const fx = px - Math.floor(px);
        if (fx >= FOLGA_BLOCO && fx <= 1 - FOLGA_BLOCO && blocos[Math.floor(py) * largura + Math.floor(px)]) bruta[j * larguraFina + i] += bloco;
      }
    }
  }
  for (let i = 0; i < fina.length; i++) fina[i] = Math.min(255, Math.round((bruta[i] / nivelMaximo) * 255));

  // the levels the shader's bounds must cover: a block reaches into the next level
  const topos = blocos ? Uint8Array.from(niveis, (n, i) => Math.min(nivelMaximo, n + (blocos[i] ? 1 : 0))) : niveis;
  return {
    largura,
    altura,
    topos,
    larguraFina,
    alturaFina,
    /** heights, 255 = alturaMaxima, AMOSTRAS_POR_CELULA samples per cell along each axis, row-major */
    fina,
    niveis,
    alturaMaxima,
    /** Terrain height in metres at a map point (cells), the bilinear filter the GPU applies to `fina`. */
    alturaEm(x, y) {
      const u = Math.min(larguraFina - 1, Math.max(0, x * S - 0.5));
      const v = Math.min(alturaFina - 1, Math.max(0, y * S - 0.5));
      const i0 = Math.floor(u);
      const j0 = Math.floor(v);
      const i1 = Math.min(larguraFina - 1, i0 + 1);
      const j1 = Math.min(alturaFina - 1, j0 + 1);
      const fu = u - i0;
      const fv = v - j0;
      const l0 = j0 * larguraFina;
      const l1 = j1 * larguraFina;
      const topo = fina[l0 + i0] + (fina[l0 + i1] - fina[l0 + i0]) * fu;
      const baixo = fina[l1 + i0] + (fina[l1 + i1] - fina[l1 + i0]) * fu;
      return ((topo + (baixo - topo) * fv) / 255) * alturaMaxima;
    },
  };
}

// Separable tent blur of the fine heights, written back only on samples whose cell is away from cliffs.
function suavizarEncostas(h, larguraFina, alturaFina, perto, largura) {
  const R = RAIO_SUAVE;
  const pesos = new Float32Array(2 * R + 1);
  let total = 0;
  for (let k = -R; k <= R; k++) total += pesos[k + R] = R + 1 - Math.abs(k);
  for (let k = 0; k < pesos.length; k++) pesos[k] /= total;
  const linha = new Float32Array(larguraFina * alturaFina);
  for (let j = 0; j < alturaFina; j++) {
    for (let i = 0; i < larguraFina; i++) {
      let soma = 0;
      for (let k = -R; k <= R; k++) soma += h[j * larguraFina + Math.min(larguraFina - 1, Math.max(0, i + k))] * pesos[k + R];
      linha[j * larguraFina + i] = soma;
    }
  }
  const S = AMOSTRAS_POR_CELULA;
  for (let j = 0; j < alturaFina; j++) {
    for (let i = 0; i < larguraFina; i++) {
      if (perto[Math.floor(j / S) * largura + Math.floor(i / S)]) continue;
      let soma = 0;
      for (let k = -R; k <= R; k++) soma += linha[Math.min(alturaFina - 1, Math.max(0, j + k)) * larguraFina + i] * pesos[k + R];
      h[j * larguraFina + i] = soma;
    }
  }
}

/**
 * Per-cell bounds the terrain shader uses to skip work on flat ground, as levels 0..nivelMaximo:
 * `coluna` is the highest level the view ray of a ground point in this cell can meet (the cells up to `linhas` rows
 * to the south, one column to each side), `sol` the highest level that can shade it (up to `alcanceSol` cells
 * towards the sun, which comes from the north-west).
 * @param {{ largura: number, altura: number }} mapa
 * @param {Uint8Array} niveis
 * @param {number} linhas
 * @param {number} alcanceSol
 */
export function limitesPorCelula(mapa, niveis, linhas, alcanceSol) {
  const { largura, altura } = mapa;
  const coluna = new Uint8Array(largura * altura);
  const sol = new Uint8Array(largura * altura);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      let maiorColuna = 0;
      for (let yy = y - 1; yy <= y + linhas; yy++) {
        for (let xx = x - 1; xx <= x + 1; xx++) {
          if (xx < 0 || yy < 0 || xx >= largura || yy >= altura) continue;
          maiorColuna = Math.max(maiorColuna, niveis[yy * largura + xx]);
        }
      }
      let maiorSol = 0;
      for (let yy = y - alcanceSol; yy <= y + 1; yy++) {
        for (let xx = x - alcanceSol; xx <= x + 1; xx++) {
          if (xx < 0 || yy < 0 || xx >= largura || yy >= altura) continue;
          maiorSol = Math.max(maiorSol, niveis[yy * largura + xx]);
        }
      }
      coluna[y * largura + x] = maiorColuna;
      sol[y * largura + x] = maiorSol;
    }
  }
  return { coluna, sol };
}
