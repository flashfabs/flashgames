// Flow fields: one field per destination cell and movement class, computed by Dijkstra from the destination over the
// 8-connected grid without corner cutting (costs 10 and 14, plus a small toll next to rock so paths keep off the walls,
// and, for vehicles, a large toll on gaps one cell wide, so they go round them when there is a way). Each field keeps
// the distance to the destination and, per cell, the step towards it. Fields live in an LRU cache shared by every
// order and are computed in slices of a fixed number of heap pops per tick, so no tick pays for a whole map; the
// budget is a count, not a clock, so the slicing is the same on every machine.

export const INFINITO = 0x7fffffff;
export const SEM_PASSO = 255;
/** Heap pops per tick, shared by all fields being computed; about 1 ms on an M5 Pro. */
export const EXPANSOES_POR_PASSO = 12000;
/** Cached fields; above the order limit (one field per order and class in use), so a field in use is never evicted. */
export const CAPACIDADE_CAMPOS = 72;

// 8 neighbours: dx, dy, cost (10 straight, 14 diagonal); diagonals come last
export const VIZINHO_DX = Int32Array.from([1, -1, 0, 0, 1, 1, -1, -1]);
export const VIZINHO_DY = Int32Array.from([0, 0, 1, -1, 1, -1, 1, -1]);
const VIZINHO_CUSTO = Int32Array.from([10, 10, 10, 10, 14, 14, 14, 14]);
// index of the opposite neighbour
const OPOSTO = Int32Array.from([1, 0, 3, 2, 7, 6, 5, 4]);
// extra cost to enter a cell that touches rock, and one that is two cells from it: paths keep off the walls, so groups
// go round a spur in a wide arc instead of queueing on its tip
const PEDAGIO_PAREDE = 24;
const PEDAGIO_PERTO = 6;
// extra cost for a vehicle to cross a cell squeezed between rock on two opposite sides: worth a detour of four cells
const PEDAGIO_FRESTA = 40;
/** Movement classes of the fields: infantry fits anywhere, vehicles keep out of one-cell gaps. */
export const CLASSE_CAMPO = Object.freeze({ INFANTARIA: 0, VEICULO: 1 });

/**
 * Path finding state for one grid ({ largura, altura, bloqueado }). The grid's array is shared, not copied: when a
 * footprint changes it, atualizarPedagio() fixes the tolls around it and invalidarCampos() recomputes the fields.
 */
export function criarCaminhos(grade, capacidade = CAPACIDADE_CAMPOS) {
  const { largura, altura, bloqueado } = grade;
  const celulas = largura * altura;
  const cam = {
    largura,
    altura,
    bloqueado,
    // toll on each cell by its distance to rock (1 or 2 cells, 8-neighbourhood)
    custoEntrada: new Int32Array(celulas),
    custoVeiculo: new Int32Array(celulas), // custoEntrada plus the gap toll
    encostada: new Uint8Array(celulas), // 1 next to a blocked cell
    fresta: new Uint8Array(celulas), // 1 on an open cell between rock on two opposite sides (a gap one cell wide)
    capacidade,
    destino: new Int32Array(capacidade).fill(-1), // destination cell, -1 when the entry is free
    classe: new Uint8Array(capacidade), // CLASSE_CAMPO of the entry
    pronto: new Uint8Array(capacidade),
    expansoes: new Int32Array(capacidade), // heap pops done so far for this entry
    usos: new Int32Array(capacidade), // orders using the entry
    ultimoUso: new Int32Array(capacidade), // tick of the last request, for LRU
    dist: new Array(capacidade).fill(null), // Int32Array per entry, allocated on first use
    passo: new Array(capacidade).fill(null), // Uint8Array per entry: neighbour index towards the destination
    fila: [], // entries waiting to be computed, in request order; the head is in progress
    heapCelula: new Int32Array(celulas * 8),
    heapDist: new Int32Array(celulas * 8),
    tamanhoHeap: 0,
    iniciado: -1, // entry whose heap is loaded
  };
  atualizarPedagio(cam, 0, 0, largura - 1, altura - 1);
  return cam;
}

/**
 * Recomputes the wall tolls after the blocked cells in [x0..x1] x [y0..y1] changed: cells touching rock change within
 * one cell of the area, and their tolls within two.
 */
export function atualizarPedagio(cam, x0, y0, x1, y1) {
  const { largura, altura, bloqueado, encostada, custoEntrada, custoVeiculo, fresta } = cam;
  const limitar = (v, max) => (v < 1 ? 1 : v > max ? max : v);
  const ex0 = limitar(x0 - 1, largura - 2);
  const ey0 = limitar(y0 - 1, altura - 2);
  const ex1 = limitar(x1 + 1, largura - 2);
  const ey1 = limitar(y1 + 1, altura - 2);
  for (let y = ey0; y <= ey1; y++) {
    for (let x = ex0; x <= ex1; x++) {
      let toca = 0;
      for (let k = 0; k < 8; k++) if (bloqueado[(y + VIZINHO_DY[k]) * largura + x + VIZINHO_DX[k]]) toca = 1;
      const c = y * largura + x;
      encostada[c] = toca;
      // squeezed: rock west and east, or north and south (a one-cell diagonal corridor has both); a diagonal band two
      // cells wide is not a gap, so the diagonals do not count
      fresta[c] = !bloqueado[c] && ((bloqueado[c - 1] && bloqueado[c + 1]) || (bloqueado[c - largura] && bloqueado[c + largura])) ? 1 : 0;
    }
  }
  const cx0 = limitar(x0 - 2, largura - 2);
  const cy0 = limitar(y0 - 2, altura - 2);
  const cx1 = limitar(x1 + 2, largura - 2);
  const cy1 = limitar(y1 + 2, altura - 2);
  for (let y = cy0; y <= cy1; y++) {
    for (let x = cx0; x <= cx1; x++) {
      const c = y * largura + x;
      let custo = 0;
      if (!bloqueado[c]) {
        if (encostada[c]) custo = PEDAGIO_PAREDE;
        else for (let k = 0; k < 8; k++) if (encostada[(y + VIZINHO_DY[k]) * largura + x + VIZINHO_DX[k]]) custo = PEDAGIO_PERTO;
      }
      custoEntrada[c] = custo;
      custoVeiculo[c] = custo + (fresta[c] ? PEDAGIO_FRESTA : 0);
    }
  }
}

/**
 * The grid changed: fields no order holds are dropped, the others start over (their units steer straight at their
 * goal until the new field is ready, as with any field still being computed).
 */
export function invalidarCampos(cam) {
  for (let e = 0; e < cam.capacidade; e++) {
    if (cam.destino[e] < 0) continue;
    if (cam.usos[e] > 0) {
      reiniciarEntrada(cam, e, cam.destino[e], cam.ultimoUso[e], cam.classe[e]);
      continue;
    }
    const naFila = cam.fila.indexOf(e);
    if (naFila >= 0) cam.fila.splice(naFila, 1);
    if (cam.iniciado === e) cam.iniciado = -1;
    cam.destino[e] = -1;
    cam.pronto[e] = 0;
    cam.expansoes[e] = 0;
  }
}

/**
 * Field for a destination cell: reuses a cached one or starts a new computation.
 * Returns the entry index; the field is usable once cam.pronto[entrada] is 1.
 */
export function pedirCampo(cam, destino, tick, classe = CLASSE_CAMPO.INFANTARIA) {
  for (let e = 0; e < cam.capacidade; e++) {
    if (cam.destino[e] === destino && cam.classe[e] === classe) {
      cam.ultimoUso[e] = tick;
      return e;
    }
  }
  // a free entry, else the least recently used one no order holds (lowest index on ties)
  let escolhida = -1;
  for (let e = 0; e < cam.capacidade; e++) {
    if (cam.usos[e] > 0) continue;
    if (cam.destino[e] < 0) {
      escolhida = e;
      break;
    }
    if (escolhida < 0 || cam.ultimoUso[e] < cam.ultimoUso[escolhida]) escolhida = e;
  }
  if (escolhida < 0) throw new Error('caminhos: todos os campos estão em uso');
  reiniciarEntrada(cam, escolhida, destino, tick, classe);
  return escolhida;
}

function reiniciarEntrada(cam, e, destino, tick, classe) {
  const celulas = cam.largura * cam.altura;
  if (!cam.dist[e]) {
    cam.dist[e] = new Int32Array(celulas);
    cam.passo[e] = new Uint8Array(celulas);
  }
  cam.dist[e].fill(INFINITO);
  cam.passo[e].fill(SEM_PASSO);
  const naFila = cam.fila.indexOf(e);
  if (naFila >= 0) cam.fila.splice(naFila, 1);
  if (cam.iniciado === e) cam.iniciado = -1;
  cam.destino[e] = destino;
  cam.classe[e] = classe;
  cam.pronto[e] = 0;
  cam.expansoes[e] = 0;
  cam.ultimoUso[e] = tick;
  cam.fila.push(e);
}

export const prenderCampo = (cam, e) => cam.usos[e]++;
export const soltarCampo = (cam, e) => cam.usos[e]--;

/** Runs up to `orcamento` heap pops over the queued fields, oldest request first. */
export function avancarCaminhos(cam, orcamento = EXPANSOES_POR_PASSO) {
  while (orcamento > 0 && cam.fila.length > 0) {
    const e = cam.fila[0];
    if (cam.iniciado !== e) iniciarHeap(cam, e);
    const feitas = expandir(cam, e, orcamento);
    orcamento -= feitas;
    cam.expansoes[e] += feitas;
    if (cam.tamanhoHeap === 0) {
      cam.pronto[e] = 1;
      cam.fila.shift();
      cam.iniciado = -1;
    }
  }
}

function iniciarHeap(cam, e) {
  cam.dist[e][cam.destino[e]] = 0;
  cam.heapCelula[0] = cam.destino[e];
  cam.heapDist[0] = 0;
  cam.tamanhoHeap = 1;
  cam.iniciado = e;
}

// Dijkstra with lazy deletion over a binary heap; returns the number of pops done (stale pops count too).
function expandir(cam, e, orcamento) {
  const { largura, bloqueado, heapCelula, heapDist } = cam;
  const custoEntrada = cam.classe[e] === CLASSE_CAMPO.VEICULO ? cam.custoVeiculo : cam.custoEntrada;
  const dist = cam.dist[e];
  const passo = cam.passo[e];
  let tamanho = cam.tamanhoHeap;
  let feitas = 0;
  while (tamanho > 0 && feitas < orcamento) {
    feitas++;
    // pop the minimum
    const u = heapCelula[0];
    const d = heapDist[0];
    tamanho--;
    const ultimaCelula = heapCelula[tamanho];
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
    if (d > dist[u]) continue;

    const uy = Math.trunc(u / largura);
    const ux = u - uy * largura;
    for (let k = 0; k < 8; k++) {
      const vx = ux + VIZINHO_DX[k];
      const vy = uy + VIZINHO_DY[k];
      const v = vy * largura + vx;
      if (bloqueado[v]) continue;
      if (k >= 4 && (bloqueado[uy * largura + vx] || bloqueado[vy * largura + ux])) continue;
      const nd = d + VIZINHO_CUSTO[k] + custoEntrada[u];
      if (nd >= dist[v]) continue;
      dist[v] = nd;
      passo[v] = OPOSTO[k];
      // push
      let j = tamanho++;
      while (j > 0) {
        const pai = (j - 1) >> 1;
        if (heapDist[pai] <= nd) break;
        heapCelula[j] = heapCelula[pai];
        heapDist[j] = heapDist[pai];
        j = pai;
      }
      heapCelula[j] = v;
      heapDist[j] = nd;
    }
  }
  cam.tamanhoHeap = tamanho;
  return feitas;
}

/**
 * Cell `alcance` steps ahead of `celula` along the field (the destination if it comes first), or -1 when the cell has
 * no path. Units steer at that cell's centre, which smooths the 8 directions into any angle.
 */
export function celulaAdiante(cam, e, celula, alcance) {
  const passo = cam.passo[e];
  if (cam.dist[e][celula] === INFINITO) return -1;
  for (let n = 0; n < alcance; n++) {
    const k = passo[celula];
    if (k === SEM_PASSO) break;
    celula += VIZINHO_DY[k] * cam.largura + VIZINHO_DX[k];
  }
  return celula;
}

/**
 * Whether a straight walk from (x0, y0) to (x1, y1), world units, stays on open ground (out of gaps, for a vehicle),
 * sampled every quarter cell.
 * Lets units in the open head straight for their goal instead of the field's 8-direction staircase.
 */
export function linhaLivre(cam, x0, y0, x1, y1, classe = CLASSE_CAMPO.INFANTARIA) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const passos = Math.max(dx < 0 ? -dx : dx, dy < 0 ? -dy : dy) >> 8;
  const { largura, bloqueado, fresta } = cam;
  const veiculo = classe === CLASSE_CAMPO.VEICULO;
  for (let k = 1; k <= passos; k++) {
    const x = x0 + Math.trunc((dx * k) / passos);
    const y = y0 + Math.trunc((dy * k) / passos);
    const c = (y >> 10) * largura + (x >> 10);
    // a vehicle does not head straight through a one-cell gap: its field may know a wider way
    if (bloqueado[c] || (veiculo && fresta[c])) return false;
  }
  return true;
}

/** What a save keeps of the cache: fields are recomputed on load, so only their keys and progress are stored. */
export function resumoDosCaminhos(cam) {
  return {
    destino: Array.from(cam.destino),
    classe: Array.from(cam.classe),
    pronto: Array.from(cam.pronto),
    expansoes: Array.from(cam.expansoes),
    usos: Array.from(cam.usos),
    ultimoUso: Array.from(cam.ultimoUso),
    fila: [...cam.fila],
  };
}

/**
 * Rebuilds the cache from resumoDosCaminhos: finished fields in full, the one in progress up to the same pop count,
 * which leaves its heap exactly as it was, since slicing never changes the order of the pops.
 */
export function refazerCaminhos(cam, resumo) {
  const emCurso = resumo.fila.length > 0 && resumo.expansoes[resumo.fila[0]] > 0 ? resumo.fila[0] : -1;
  const calcular = (e, orcamento) => {
    reiniciarEntrada(cam, e, resumo.destino[e], resumo.ultimoUso[e], resumo.classe[e]);
    cam.fila = [e];
    avancarCaminhos(cam, orcamento);
  };
  for (let e = 0; e < cam.capacidade; e++) {
    if (resumo.destino[e] < 0 || e === emCurso) continue;
    if (resumo.pronto[e]) calcular(e, INFINITO);
    else reiniciarEntrada(cam, e, resumo.destino[e], resumo.ultimoUso[e], resumo.classe[e]);
  }
  if (emCurso >= 0) calcular(emCurso, resumo.expansoes[emCurso]);
  cam.fila = [...resumo.fila];
  cam.usos.set(resumo.usos);
  cam.ultimoUso.set(resumo.ultimoUso);
  cam.expansoes.set(resumo.expansoes);
}
