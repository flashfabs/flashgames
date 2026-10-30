// Terrain of a match: blocked cells, visual relief, height levels 0..3 and start bases.
// Either generated from a seed (the prototype's noise map, now with hills) or built from given layers (tests, and the
// design front's map format later). Everything is integer and depends only on its inputs.

const MAX_NIVEL = 3;
// 4-neighbour steps for the reachability flood
const PASSO_X = [1, -1, 0, 0];
const PASSO_Y = [0, 0, 1, -1];

function hash2(ix, iy, semente) {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ semente;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) & 255;
}

// Value noise in 0..255 on a lattice of `passo` cells, with integer smoothstep weights.
function ruido(x, y, passo, semente) {
  const ix = Math.trunc(x / passo);
  const iy = Math.trunc(y / passo);
  const fx = Math.trunc(((x - ix * passo) * 256) / passo);
  const fy = Math.trunc(((y - iy * passo) * 256) / passo);
  const sx = (fx * fx * (768 - 2 * fx)) >> 16;
  const sy = (fy * fy * (768 - 2 * fy)) >> 16;
  const a = hash2(ix, iy, semente);
  const b = hash2(ix + 1, iy, semente);
  const c = hash2(ix, iy + 1, semente);
  const d = hash2(ix + 1, iy + 1, semente);
  const ab = a + (((b - a) * sx) >> 8);
  const cd = c + (((d - c) * sx) >> 8);
  return ab + (((cd - ab) * sy) >> 8);
}

/** Relief value that leaves `percentual` percent of the cells strictly above it. */
function limiarDoTopo(histograma, total, percentual) {
  let limiar = 255;
  for (let acumulado = 0; limiar > 0; limiar--) {
    acumulado += histograma[limiar];
    if (acumulado * 100 >= total * percentual) break;
  }
  return limiar;
}

/**
 * Seeded map: rock plateaus on the top 21% of the relief, open hills in levels 0..2 below them, two bases in opposite
 * corners joined by a guaranteed corridor, and every pocket unreachable from base 0 turned to rock.
 */
export function gerarMapa(largura, altura, semente) {
  const total = largura * altura;
  const bloqueado = new Uint8Array(total);
  const relevo = new Uint8Array(total);
  const nivel = new Uint8Array(total);
  const histograma = new Int32Array(256);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const v = Math.trunc((ruido(x, y, 28, semente) * 4 + ruido(x, y, 13, semente ^ 0x51) * 2 + ruido(x, y, 6, semente ^ 0x9e)) / 7);
      relevo[y * largura + x] = v;
      histograma[v]++;
    }
  }
  const limiarRocha = limiarDoTopo(histograma, total, 21);
  for (let i = 0; i < total; i++) bloqueado[i] = relevo[i] > limiarRocha ? 1 : 0;
  for (let x = 0; x < largura; x++) bloqueado[x] = bloqueado[(altura - 1) * largura + x] = 1;
  for (let y = 0; y < altura; y++) bloqueado[y * largura] = bloqueado[y * largura + largura - 1] = 1;

  const bases = [
    { x: 24, y: altura - 24 },
    { x: largura - 24, y: 24 },
  ];
  const limpar = (cx, cy, raio) => {
    for (let y = cy - raio; y <= cy + raio; y++) {
      for (let x = cx - raio; x <= cx + raio; x++) {
        if (x < 1 || y < 1 || x >= largura - 1 || y >= altura - 1) continue;
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= raio * raio) bloqueado[y * largura + x] = 0;
      }
    }
  };
  for (const base of bases) limpar(base.x, base.y, 16);
  limpar(largura >> 1, altura >> 1, 12);
  // a guaranteed corridor between the bases through the centre
  for (let k = 0; k <= largura; k++) {
    const x = bases[0].x + Math.trunc(((bases[1].x - bases[0].x) * k) / largura);
    const y = bases[0].y + Math.trunc(((bases[1].y - bases[0].y) * k) / largura);
    limpar(x, y, 2);
  }
  manterAlcancavel(largura, altura, bloqueado, bases[0]);

  // hills: the open ground splits by relief into level 0 (lower half), 1 and 2 (top fifth)
  const histogramaAberto = new Int32Array(256);
  let abertas = 0;
  for (let i = 0; i < total; i++) {
    if (bloqueado[i]) continue;
    histogramaAberto[relevo[i]]++;
    abertas++;
  }
  const limiar2 = limiarDoTopo(histogramaAberto, abertas, 20);
  const limiar1 = limiarDoTopo(histogramaAberto, abertas, 50);
  for (let i = 0; i < total; i++) nivel[i] = bloqueado[i] ? 0 : relevo[i] > limiar2 ? 2 : relevo[i] > limiar1 ? 1 : 0;
  return { largura, altura, bloqueado, relevo, nivel, bases };
}

// Open cells that cannot be reached from the origin become rock, so nobody spawns or paths into a pocket.
function manterAlcancavel(largura, altura, bloqueado, origem) {
  const total = largura * altura;
  const alcancavel = new Uint8Array(total);
  const fila = new Int32Array(total);
  let inicio = 0;
  let fim = 0;
  const primeira = origem.y * largura + origem.x;
  alcancavel[primeira] = 1;
  fila[fim++] = primeira;
  while (inicio < fim) {
    const u = fila[inicio++];
    const ux = u % largura;
    const uy = Math.trunc(u / largura);
    for (let k = 0; k < 4; k++) {
      const vx = ux + PASSO_X[k];
      const vy = uy + PASSO_Y[k];
      if (vx < 0 || vy < 0 || vx >= largura || vy >= altura) continue;
      const v = vy * largura + vx;
      if (!bloqueado[v] && !alcancavel[v]) {
        alcancavel[v] = 1;
        fila[fim++] = v;
      }
    }
  }
  for (let i = 0; i < total; i++) if (!alcancavel[i]) bloqueado[i] = 1;
}

/**
 * Map from explicit layers, validated: integer sizes, layers of the right length, levels 0..3, bases inside open
 * ground. The border is always rock.
 */
export function montarMapa({ largura, altura, bloqueado, relevo, nivel, bases }) {
  if (!Number.isInteger(largura) || !Number.isInteger(altura) || largura < 8 || altura < 8 || largura > 1024 || altura > 1024) {
    throw new Error(`mapa: tamanho inválido ${largura}x${altura}`);
  }
  const total = largura * altura;
  const camada = (dados, nome) => {
    if (dados === undefined) return new Uint8Array(total);
    if (dados.length !== total) throw new Error(`mapa: a camada ${nome} tem ${dados.length} células, esperava ${total}`);
    return Uint8Array.from(dados);
  };
  const mapa = { largura, altura, bloqueado: camada(bloqueado, 'bloqueado'), relevo: camada(relevo, 'relevo'), nivel: camada(nivel, 'nivel'), bases: [] };
  for (let i = 0; i < total; i++) if (mapa.nivel[i] > MAX_NIVEL) throw new Error(`mapa: nível ${mapa.nivel[i]} acima de ${MAX_NIVEL}`);
  for (let x = 0; x < largura; x++) mapa.bloqueado[x] = mapa.bloqueado[(altura - 1) * largura + x] = 1;
  for (let y = 0; y < altura; y++) mapa.bloqueado[y * largura] = mapa.bloqueado[y * largura + largura - 1] = 1;
  for (const base of bases ?? []) {
    if (!Number.isInteger(base.x) || !Number.isInteger(base.y) || mapa.bloqueado[base.y * largura + base.x]) throw new Error(`mapa: base fora do chão aberto (${base.x}, ${base.y})`);
    mapa.bases.push({ x: base.x, y: base.y });
  }
  return mapa;
}

/** Nearest open cell to (cx, cy) by growing square rings, scanned in row order; -1 when none within 24 cells. */
export function celulaLivreMaisProxima(mapa, cx, cy) {
  const { largura, altura, bloqueado } = mapa;
  cx = Math.max(1, Math.min(largura - 2, cx));
  cy = Math.max(1, Math.min(altura - 2, cy));
  for (let r = 0; r < 24; r++) {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (x < 1 || y < 1 || x >= largura - 1 || y >= altura - 1) continue;
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
        if (!bloqueado[y * largura + x]) return y * largura + x;
      }
    }
  }
  return -1;
}
