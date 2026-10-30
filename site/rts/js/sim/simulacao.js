// Deterministic RTS simulation core (moved from the 4K prototype; wave 1 splits it into subsystems).
// Integer math only (Int32 arrays, Math.imul, truncating division, shifts), so every JS engine
// produces the same state bit for bit; floats live only in the renderer. Runs in a Worker, in Node and in JavaScriptCore.

export const FP_BITS = 10;
export const FP = 1 << FP_BITS; // one map cell in world units
export const PASSOS_POR_SEGUNDO = 30;

export const NEBLINA_NUNCA = 0;
export const NEBLINA_VISTA = 128;
export const NEBLINA_VISIVEL = 255;

const SEM_DIRECAO = 255;
const INFINITO = 0x7fffffff;
// 8 neighbours: dx, dy, cost (10 straight, 14 diagonal); diagonals come last
const VIZINHO_DX = Int32Array.from([1, -1, 0, 0, 1, 1, -1, -1]);
const VIZINHO_DY = Int32Array.from([0, 0, 1, -1, 1, -1, 1, -1]);
const VIZINHO_CUSTO = Int32Array.from([10, 10, 10, 10, 14, 14, 14, 14]);
// unit vectors of the 8 directions in FP (724 = 1024 / sqrt 2)
const DIRECAO_X = Int32Array.from([1024, -1024, 0, 0, 724, 724, -724, -724]);
const DIRECAO_Y = Int32Array.from([0, 0, 1024, -1024, 724, -724, 724, -724]);

export const TIPOS = [
  // 0, buggy: fast and fragile, short range
  { velocidade: 88, vida: 60, alcance: 4 * FP, dano: 9, recarga: 18, raio: 330 },
  // 1, tank: slow and tough, longer range
  { velocidade: 52, vida: 160, alcance: 6 * FP, dano: 26, recarga: 42, raio: 440 },
];

const TAMANHO_BALDE_BITS = FP_BITS + 1; // spatial hash buckets of 2x2 cells
const RAIO_VISAO = 7; // cells
const ESPERA_RENASCER = 4 * PASSOS_POR_SEGUNDO;
const TROCA_ONDA = 40 * PASSOS_POR_SEGUNDO;
const MAX_ORDENS = 32;

export function criarSorteio(semente) {
  let s = (semente | 0) || 0x2545f491;
  return function sortear(limite) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) % limite;
  };
}

function hash2(ix, iy, semente) {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ semente;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) & 255;
}

// Value noise in 0..255 on a lattice of `passo` cells, with integer smoothstep weights.
function ruido(x, y, passo, semente) {
  const ix = (x / passo) | 0;
  const iy = (y / passo) | 0;
  const fx = (((x - ix * passo) * 256) / passo) | 0;
  const fy = (((y - iy * passo) * 256) / passo) | 0;
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

export function raizInteira(n) {
  if (n <= 0) return 0;
  let x = n;
  let y = (x + 1) >> 1;
  while (y < x) {
    x = y;
    y = (x + ((n / x) | 0)) >> 1;
  }
  return x;
}

function gerarMapa(largura, altura, semente) {
  const total = largura * altura;
  const bloqueado = new Uint8Array(total);
  const relevo = new Uint8Array(total);
  const histograma = new Int32Array(256);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const v = ((ruido(x, y, 28, semente) * 4 + ruido(x, y, 13, semente ^ 0x51) * 2 + ruido(x, y, 6, semente ^ 0x9e)) / 7) | 0;
      relevo[y * largura + x] = v;
      histograma[v]++;
    }
  }
  // the top ~21% of the relief becomes rock plateaus
  let limiar = 255;
  for (let acumulado = 0; limiar > 0; limiar--) {
    acumulado += histograma[limiar];
    if (acumulado * 100 >= total * 21) break;
  }
  for (let i = 0; i < total; i++) bloqueado[i] = relevo[i] > limiar ? 1 : 0;
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
  const passos = largura;
  for (let k = 0; k <= passos; k++) {
    const x = bases[0].x + (((bases[1].x - bases[0].x) * k) / passos) | 0;
    const y = bases[0].y + (((bases[1].y - bases[0].y) * k) / passos) | 0;
    limpar(x, y, 2);
  }

  // open cells that cannot be reached from base 0 become rock, so nobody spawns or paths into a pocket
  const alcancavel = new Uint8Array(total);
  const fila = new Int32Array(total);
  let inicio = 0;
  let fim = 0;
  const origem = bases[0].y * largura + bases[0].x;
  alcancavel[origem] = 1;
  fila[fim++] = origem;
  while (inicio < fim) {
    const u = fila[inicio++];
    const ux = u % largura;
    const uy = (u / largura) | 0;
    for (let k = 0; k < 4; k++) {
      const vx = ux + VIZINHO_DX[k];
      const vy = uy + VIZINHO_DY[k];
      const v = vy * largura + vx;
      if (!bloqueado[v] && !alcancavel[v]) {
        alcancavel[v] = 1;
        fila[fim++] = v;
      }
    }
  }
  for (let i = 0; i < total; i++) if (!alcancavel[i]) bloqueado[i] = 1;
  return { bloqueado, relevo, bases };
}

function celulaLivreMaisProxima(sim, cx, cy) {
  const { largura, altura, bloqueado } = sim;
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
  return sim.bases[0].y * largura + sim.bases[0].x;
}

// Dijkstra from the target over the 8-connected grid (no corner cutting), then each cell points to its best neighbour.
function calcularCampo(sim, cx, cy) {
  const { largura, bloqueado } = sim;
  const total = largura * sim.altura;
  const alvo = celulaLivreMaisProxima(sim, cx, cy);
  const dist = new Int32Array(total).fill(INFINITO);
  const campo = new Uint8Array(total).fill(SEM_DIRECAO);
  const heapCelula = sim.heapCelula;
  const heapDist = sim.heapDist;
  let tamanho = 0;

  const empurrar = (celula, d) => {
    let i = tamanho++;
    while (i > 0) {
      const pai = (i - 1) >> 1;
      if (heapDist[pai] <= d) break;
      heapCelula[i] = heapCelula[pai];
      heapDist[i] = heapDist[pai];
      i = pai;
    }
    heapCelula[i] = celula;
    heapDist[i] = d;
  };
  const tirar = () => {
    const celula = heapCelula[0];
    const ultimaCelula = heapCelula[--tamanho];
    const ultimaDist = heapDist[tamanho];
    let i = 0;
    for (;;) {
      let filho = 2 * i + 1;
      if (filho >= tamanho) break;
      if (filho + 1 < tamanho && heapDist[filho + 1] < heapDist[filho]) filho++;
      if (heapDist[filho] >= ultimaDist) break;
      heapCelula[i] = heapCelula[filho];
      heapDist[i] = heapDist[filho];
      i = filho;
    }
    heapCelula[i] = ultimaCelula;
    heapDist[i] = ultimaDist;
    return celula;
  };
  const passavel = (ux, uy, k) => {
    const vx = ux + VIZINHO_DX[k];
    const vy = uy + VIZINHO_DY[k];
    if (bloqueado[vy * largura + vx]) return false;
    if (k >= 4 && (bloqueado[uy * largura + vx] || bloqueado[vy * largura + ux])) return false;
    return true;
  };

  dist[alvo] = 0;
  empurrar(alvo, 0);
  while (tamanho > 0) {
    const d = heapDist[0];
    const u = tirar();
    if (d > dist[u]) continue;
    const ux = u % largura;
    const uy = (u / largura) | 0;
    for (let k = 0; k < 8; k++) {
      if (!passavel(ux, uy, k)) continue;
      const v = u + VIZINHO_DY[k] * largura + VIZINHO_DX[k];
      const nd = d + VIZINHO_CUSTO[k];
      if (nd < dist[v]) {
        dist[v] = nd;
        empurrar(v, nd);
      }
    }
  }
  for (let u = 0; u < total; u++) {
    if (u === alvo || dist[u] === INFINITO) continue;
    const ux = u % largura;
    const uy = (u / largura) | 0;
    let melhor = INFINITO;
    let melhorK = SEM_DIRECAO;
    for (let k = 0; k < 8; k++) {
      if (!passavel(ux, uy, k)) continue;
      const v = u + VIZINHO_DY[k] * largura + VIZINHO_DX[k];
      const custo = dist[v] + VIZINHO_CUSTO[k];
      if (custo < melhor) {
        melhor = custo;
        melhorK = k;
      }
    }
    campo[u] = melhorK;
  }
  return { campo, dist, alvo };
}

function novaOrdem(sim, cx, cy, quantidade, fixa) {
  const { campo, dist, alvo } = calcularCampo(sim, cx, cy);
  // groups spread out around the target instead of piling on one cell: arrival radius grows with the group
  const raioChegada = 10 * (2 + raizInteira(quantidade) / 2);
  const ordem = { campo, dist, alvo, raioChegada, fixa, criadaEm: sim.tick };
  if (sim.ordens.length < MAX_ORDENS) {
    sim.ordens.push(ordem);
    return sim.ordens.length - 1;
  }
  // reuse the oldest order that is not a team default; its units fall back to their team default
  let escolhida = -1;
  for (let k = 0; k < sim.ordens.length; k++) {
    if (sim.ordens[k].fixa) continue;
    if (escolhida < 0 || sim.ordens[k].criadaEm < sim.ordens[escolhida].criadaEm) escolhida = k;
  }
  for (let i = 0; i < sim.total; i++) if (sim.ordem[i] === escolhida) sim.ordem[i] = sim.time[i];
  sim.ordens[escolhida] = ordem;
  return escolhida;
}

function posicionarNaBase(sim, i) {
  const base = sim.bases[sim.time[i]];
  for (let tentativa = 0; tentativa < 40; tentativa++) {
    const cx = base.x - 14 + sim.sortear(29);
    const cy = base.y - 14 + sim.sortear(29);
    if (!sim.bloqueado[cy * sim.largura + cx]) {
      sim.x[i] = cx * FP + 128 + sim.sortear(768);
      sim.y[i] = cy * FP + 128 + sim.sortear(768);
      return;
    }
  }
  sim.x[i] = base.x * FP + 512;
  sim.y[i] = base.y * FP + 512;
}

export function criarSimulacao({ semente = 1, largura = 192, altura = 192, unidadesPorTime = 1000 } = {}) {
  const { bloqueado, relevo, bases } = gerarMapa(largura, altura, semente);
  const total = unidadesPorTime * 2;
  const celulas = largura * altura;
  const sim = {
    tick: 0,
    largura,
    altura,
    bloqueado,
    relevo,
    bases,
    total,
    sortear: criarSorteio(semente ^ 0x6a09e667),
    x: new Int32Array(total),
    y: new Int32Array(total),
    vx: new Int32Array(total),
    vy: new Int32Array(total),
    time: new Uint8Array(total),
    tipo: new Uint8Array(total),
    vida: new Int16Array(total),
    recarga: new Int16Array(total),
    morteEm: new Int32Array(total),
    ordem: new Int16Array(total),
    parada: new Uint8Array(total),
    alvo: new Int32Array(total).fill(-1),
    neblina: new Uint8Array(celulas),
    carimbo: new Int32Array(celulas),
    baldeLargura: (largura >> 1) + 1,
    baldeCabeca: null,
    baldeProximo: new Int32Array(total),
    heapCelula: new Int32Array(celulas * 8),
    heapDist: new Int32Array(celulas * 8),
    ordens: [],
    comandos: [],
    eventos: [],
    onda: 0,
  };
  sim.baldeCabeca = new Int32Array(sim.baldeLargura * ((altura >> 1) + 1));
  for (let i = 0; i < total; i++) {
    sim.time[i] = i < unidadesPorTime ? 0 : 1;
    sim.tipo[i] = i % 10 < 7 ? 0 : 1;
    sim.vida[i] = TIPOS[sim.tipo[i]].vida;
    sim.ordem[i] = sim.time[i];
    posicionarNaBase(sim, i);
  }
  // order 0 and 1 are the team defaults: both armies head for the centre
  novaOrdem(sim, largura >> 1, altura >> 1, unidadesPorTime, true);
  novaOrdem(sim, largura >> 1, altura >> 1, unidadesPorTime, true);
  return sim;
}

// Commands carry the tick they run on, as lockstep multiplayer will need.
export function agendarComando(sim, comando) {
  sim.comandos.push(comando);
}

function aplicarComandos(sim) {
  const restantes = [];
  for (const comando of sim.comandos) {
    if (comando.tick > sim.tick) {
      restantes.push(comando);
      continue;
    }
    if (comando.tipo === 'mover') {
      const unidades = comando.unidades.filter(i => i >= 0 && i < sim.total && sim.time[i] === comando.time && sim.vida[i] > 0);
      if (unidades.length === 0) continue;
      const indice = novaOrdem(sim, comando.cx, comando.cy, unidades.length, false);
      for (const i of unidades) {
        sim.ordem[i] = indice;
        sim.parada[i] = 0;
      }
    }
  }
  sim.comandos = restantes;
}

// The computer side alternates its default order between the centre and the player's base, in waves.
function conduzirComputador(sim) {
  if (sim.tick % TROCA_ONDA !== 0) return;
  sim.onda++;
  const destino = sim.onda % 2 === 1 ? sim.bases[0] : { x: sim.largura >> 1, y: sim.altura >> 1 };
  const { campo, dist, alvo } = calcularCampo(sim, destino.x, destino.y);
  Object.assign(sim.ordens[1], { campo, dist, alvo });
  for (let i = 0; i < sim.total; i++) if (sim.ordem[i] === 1) sim.parada[i] = 0;
}

function renascer(sim) {
  for (let i = 0; i < sim.total; i++) {
    if (sim.vida[i] > 0 || sim.tick - sim.morteEm[i] < ESPERA_RENASCER) continue;
    sim.vida[i] = TIPOS[sim.tipo[i]].vida;
    sim.recarga[i] = 0;
    sim.alvo[i] = -1;
    sim.vx[i] = sim.vy[i] = 0;
    sim.ordem[i] = sim.time[i];
    sim.parada[i] = 0;
    posicionarNaBase(sim, i);
    sim.eventos.push(3, i, 0);
  }
}

function montarBaldes(sim) {
  const { baldeCabeca, baldeProximo, baldeLargura } = sim;
  baldeCabeca.fill(-1);
  for (let i = 0; i < sim.total; i++) {
    if (sim.vida[i] <= 0) continue;
    const b = (sim.y[i] >> TAMANHO_BALDE_BITS) * baldeLargura + (sim.x[i] >> TAMANHO_BALDE_BITS);
    baldeProximo[i] = baldeCabeca[b];
    baldeCabeca[b] = i;
  }
}

function procurarAlvo(sim, i) {
  const tipo = TIPOS[sim.tipo[i]];
  const alcance2 = tipo.alcance * tipo.alcance;
  const r = (tipo.alcance >> TAMANHO_BALDE_BITS) + 1;
  const bx = sim.x[i] >> TAMANHO_BALDE_BITS;
  const by = sim.y[i] >> TAMANHO_BALDE_BITS;
  const linhas = sim.baldeCabeca.length / sim.baldeLargura;
  let melhor = -1;
  let melhorD = alcance2 + 1;
  for (let y = Math.max(0, by - r); y <= Math.min(linhas - 1, by + r); y++) {
    for (let x = Math.max(0, bx - r); x <= Math.min(sim.baldeLargura - 1, bx + r); x++) {
      for (let j = sim.baldeCabeca[y * sim.baldeLargura + x]; j >= 0; j = sim.baldeProximo[j]) {
        if (sim.time[j] === sim.time[i]) continue;
        const dx = (sim.x[j] - sim.x[i]) >> 4;
        const dy = (sim.y[j] - sim.y[i]) >> 4;
        const d = dx * dx + dy * dy;
        if (d < melhorD || (d === melhorD && j < melhor)) {
          melhorD = d;
          melhor = j;
        }
      }
    }
  }
  return melhorD <= alcance2 >> 8 ? melhor : -1;
}

function combater(sim) {
  for (let i = 0; i < sim.total; i++) {
    if (sim.vida[i] <= 0) continue;
    if (sim.recarga[i] > 0) sim.recarga[i]--;
    const tipo = TIPOS[sim.tipo[i]];
    let alvo = sim.alvo[i];
    if (alvo >= 0) {
      const dx = (sim.x[alvo] - sim.x[i]) >> 4;
      const dy = (sim.y[alvo] - sim.y[i]) >> 4;
      if (sim.vida[alvo] <= 0 || dx * dx + dy * dy > (tipo.alcance * tipo.alcance) >> 8) alvo = -1;
    }
    // retarget on a staggered schedule, every 6 ticks per unit
    if (alvo < 0 && (sim.tick + i) % 6 === 0) alvo = procurarAlvo(sim, i);
    sim.alvo[i] = alvo;
    if (alvo < 0 || sim.recarga[i] > 0) continue;
    sim.recarga[i] = tipo.recarga;
    sim.vida[alvo] -= tipo.dano;
    sim.eventos.push(1, i, alvo);
    if (sim.vida[alvo] <= 0) {
      sim.vida[alvo] = 0;
      sim.morteEm[alvo] = sim.tick;
      sim.alvo[alvo] = -1;
      sim.eventos.push(2, alvo, i);
    }
  }
}

function mover(sim) {
  const { largura, bloqueado, baldeCabeca, baldeProximo, baldeLargura } = sim;
  const linhas = baldeCabeca.length / baldeLargura;
  for (let i = 0; i < sim.total; i++) {
    if (sim.vida[i] <= 0) continue;
    const tipo = TIPOS[sim.tipo[i]];
    let desejadoX = 0;
    let desejadoY = 0;
    if (sim.alvo[i] < 0 && !sim.parada[i]) {
      const ordem = sim.ordens[sim.ordem[i]];
      const celula = (sim.y[i] >> FP_BITS) * largura + (sim.x[i] >> FP_BITS);
      const k = ordem.campo[celula];
      if (k === SEM_DIRECAO || ordem.dist[celula] <= ordem.raioChegada) {
        if (!ordem.fixa) sim.parada[i] = 1;
      } else {
        desejadoX = (DIRECAO_X[k] * tipo.velocidade) >> FP_BITS;
        desejadoY = (DIRECAO_Y[k] * tipo.velocidade) >> FP_BITS;
      }
    }
    // steering inertia smooths the 8-direction field into curves
    sim.vx[i] = (sim.vx[i] * 3 + desejadoX) >> 2;
    sim.vy[i] = (sim.vy[i] * 3 + desejadoY) >> 2;
    let nx = sim.x[i] + sim.vx[i];
    let ny = sim.y[i] + sim.vy[i];

    // separation against neighbours in the surrounding buckets
    const bx = nx >> TAMANHO_BALDE_BITS;
    const by = ny >> TAMANHO_BALDE_BITS;
    let empurraX = 0;
    let empurraY = 0;
    for (let y = Math.max(0, by - 1); y <= Math.min(linhas - 1, by + 1); y++) {
      for (let x = Math.max(0, bx - 1); x <= Math.min(baldeLargura - 1, bx + 1); x++) {
        for (let j = baldeCabeca[y * baldeLargura + x]; j >= 0; j = baldeProximo[j]) {
          if (j === i) continue;
          const minimo = tipo.raio + TIPOS[sim.tipo[j]].raio;
          const dx = nx - sim.x[j];
          const dy = ny - sim.y[j];
          if (dx >= minimo || dx <= -minimo || dy >= minimo || dy <= -minimo) continue;
          const d = raizInteira(dx * dx + dy * dy);
          if (d >= minimo) continue;
          if (d === 0) {
            empurraX += i < j ? 24 : -24;
            continue;
          }
          const sobreposicao = minimo - d;
          empurraX += ((dx * sobreposicao) / d / 3) | 0;
          empurraY += ((dy * sobreposicao) / d / 3) | 0;
        }
      }
    }
    const limite = tipo.velocidade;
    nx += Math.max(-limite, Math.min(limite, empurraX));
    ny += Math.max(-limite, Math.min(limite, empurraY));

    // terrain collision, one axis at a time so units slide along rock
    if (bloqueado[(sim.y[i] >> FP_BITS) * largura + (nx >> FP_BITS)]) nx = sim.x[i];
    if (bloqueado[(ny >> FP_BITS) * largura + (nx >> FP_BITS)]) ny = sim.y[i];
    sim.x[i] = nx;
    sim.y[i] = ny;
  }
}

// Fog of war for team 0: visible cells decay to "seen" and every unit stamps its sight circle again.
function atualizarNeblina(sim) {
  const { neblina, carimbo, largura, altura } = sim;
  for (let c = 0; c < neblina.length; c++) if (neblina[c] === NEBLINA_VISIVEL) neblina[c] = NEBLINA_VISTA;
  const r2 = RAIO_VISAO * RAIO_VISAO;
  for (let i = 0; i < sim.total; i++) {
    if (sim.time[i] !== 0 || sim.vida[i] <= 0) continue;
    const cx = sim.x[i] >> FP_BITS;
    const cy = sim.y[i] >> FP_BITS;
    const centro = cy * largura + cx;
    if (carimbo[centro] === sim.tick) continue; // another unit already stamped from this cell
    carimbo[centro] = sim.tick;
    for (let y = Math.max(0, cy - RAIO_VISAO); y <= Math.min(altura - 1, cy + RAIO_VISAO); y++) {
      const dy = y - cy;
      for (let x = Math.max(0, cx - RAIO_VISAO); x <= Math.min(largura - 1, cx + RAIO_VISAO); x++) {
        const dx = x - cx;
        if (dx * dx + dy * dy <= r2) neblina[y * largura + x] = NEBLINA_VISIVEL;
      }
    }
  }
}

export function passo(sim) {
  sim.tick++;
  sim.eventos.length = 0;
  aplicarComandos(sim);
  conduzirComputador(sim);
  renascer(sim);
  montarBaldes(sim);
  combater(sim);
  mover(sim);
  if (sim.tick % 2 === 0) atualizarNeblina(sim);
}

export function somaDeVerificacao(sim) {
  let h = 0x811c9dc5 ^ sim.tick;
  for (let i = 0; i < sim.total; i++) {
    h = Math.imul(h ^ sim.x[i], 16777619);
    h = Math.imul(h ^ sim.y[i], 16777619);
    h = Math.imul(h ^ sim.vida[i], 16777619);
  }
  return h >>> 0;
}
