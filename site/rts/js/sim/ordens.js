// Orders: a fixed table of group orders shared by the units that received them, each holding one flow field, and the
// formation every unit of a group heads for on arrival. Units keep the order they follow, an optional patrol partner
// and a short queue (Shift); an order lives while any unit refers to it.
import { FP, FP_BITS, TIPO_COMANDO } from './contratos.js';
import { anguloDe, seno, cosseno, raizInteira } from './matematica.js';
import { celulaLivreMaisProxima } from './mapa.js';
import { pedirCampo, prenderCampo, soltarCampo, CLASSE_CAMPO } from './caminhos.js';
import { CLASSE } from './dados.js';

export const MAX_ORDENS = 32;
/** Field class a unit's movement class walks by: infantry anywhere, every vehicle out of one-cell gaps. */
export const classeDoCampo = classe => (classe === CLASSE.INFANTARIA ? CLASSE_CAMPO.INFANTARIA : CLASSE_CAMPO.VEICULO);
/** Bit mask of the field classes the given units walk by. */
export function classesDe(sim, unidades) {
  let mascara = 0;
  for (const i of unidades) mascara |= 1 << classeDoCampo(sim.tipos[sim.tipo[i]].classe);
  return mascara;
}
/** Queued orders per unit (Shift). */
export const TAMANHO_FILA = 8;
const SEM_ORDEM = -1;
// gap between formation slots beyond the largest diameter in the group, world units
const FOLGA_FORMACAO = 160;
// field distance (10 per cell) added to a slot's distance from the target before a unit leaves the field and steers
// straight at its slot
const MARGEM_DIRETA = 30;

/** Order table and per-unit order state for `capacidade` entity slots. */
export function criarOrdens(capacidade) {
  return {
    ativa: new Uint8Array(MAX_ORDENS),
    fixa: new Uint8Array(MAX_ORDENS), // team default order of the prototype rules: never ends, never stops its units
    modo: new Uint8Array(MAX_ORDENS), // TIPO_COMANDO of the order
    campo: new Int16Array(MAX_ORDENS).fill(-1), // flow field cache entry for infantry
    campoVeiculo: new Int16Array(MAX_ORDENS).fill(-1), // and for vehicles; each made when a unit of its class needs it
    destino: new Int32Array(MAX_ORDENS), // destination cell
    tx: new Int32Array(MAX_ORDENS), // target point, world units
    ty: new Int32Array(MAX_ORDENS),
    raioChegada: new Int32Array(MAX_ORDENS), // fixed orders: field distance where units idle
    alvo: new Int32Array(MAX_ORDENS).fill(-1), // ATACAR: target id with generation
    criadaEm: new Int32Array(MAX_ORDENS),
    usos: new Int32Array(MAX_ORDENS), // references from units (current, patrol partner, queue)
    // per unit
    ordem: new Int16Array(capacidade).fill(SEM_ORDEM),
    par: new Int16Array(capacidade).fill(SEM_ORDEM), // the other leg of a patrol
    metaX: new Int32Array(capacidade), // this unit's formation slot for its order
    metaY: new Int32Array(capacidade),
    limiar: new Int32Array(capacidade), // field distance where the unit starts steering straight at its slot
    parMetaX: new Int32Array(capacidade),
    parMetaY: new Int32Array(capacidade),
    parLimiar: new Int32Array(capacidade),
    filaTamanho: new Uint8Array(capacidade),
    filaOrdem: new Int16Array(capacidade * TAMANHO_FILA),
    filaMetaX: new Int32Array(capacidade * TAMANHO_FILA),
    filaMetaY: new Int32Array(capacidade * TAMANHO_FILA),
    filaLimiar: new Int32Array(capacidade * TAMANHO_FILA),
  };
}

function usar(sim, o) {
  if (o >= 0) sim.ordens.usos[o]++;
}

function largar(sim, o) {
  if (o < 0) return;
  sim.ordens.usos[o]--;
  liberarSeVazia(sim, o);
}

// An order nobody refers to any more frees its slot and its flow field.
function liberarSeVazia(sim, o) {
  const ord = sim.ordens;
  if (ord.usos[o] > 0 || ord.fixa[o] || !ord.ativa[o]) return;
  ord.ativa[o] = 0;
  for (const campos of [ord.campo, ord.campoVeiculo]) {
    if (campos[o] >= 0) soltarCampo(sim.caminhos, campos[o]);
    campos[o] = -1;
  }
}

/** The order's flow field for a field class (CLASSE_CAMPO), requested the first time a unit of that class needs it. */
export function campoDaOrdem(sim, o, classe) {
  const ord = sim.ordens;
  const campos = classe === CLASSE_CAMPO.VEICULO ? ord.campoVeiculo : ord.campo;
  if (campos[o] < 0) {
    campos[o] = pedirCampo(sim.caminhos, ord.destino[o], sim.tick, classe);
    prenderCampo(sim.caminhos, campos[o]);
  }
  return campos[o];
}

/** Drops every order of a unit: current, patrol partner and queue. */
export function limparOrdens(sim, i) {
  const ord = sim.ordens;
  largar(sim, ord.ordem[i]);
  largar(sim, ord.par[i]);
  for (let k = 0; k < ord.filaTamanho[i]; k++) largar(sim, ord.filaOrdem[i * TAMANHO_FILA + k]);
  ord.ordem[i] = SEM_ORDEM;
  ord.par[i] = SEM_ORDEM;
  ord.filaTamanho[i] = 0;
}

/** Makes `o` the unit's current order, heading for (metaX, metaY). */
export function atribuirOrdem(sim, i, o, metaX, metaY, limiar) {
  const ord = sim.ordens;
  usar(sim, o);
  largar(sim, ord.ordem[i]);
  ord.ordem[i] = o;
  ord.metaX[i] = metaX;
  ord.metaY[i] = metaY;
  ord.limiar[i] = limiar;
  sim.parada[i] = 0;
  sim.melhorDist[i] = 0x7fffffff;
  sim.semProgresso[i] = 0;
  sim.visada[i] = 0;
  sim.fase[i] = 0;
}

function enfileirar(sim, i, o, metaX, metaY, limiar) {
  const ord = sim.ordens;
  const n = ord.filaTamanho[i];
  if (n >= TAMANHO_FILA) return false;
  usar(sim, o);
  const k = i * TAMANHO_FILA + n;
  ord.filaOrdem[k] = o;
  ord.filaMetaX[k] = metaX;
  ord.filaMetaY[k] = metaY;
  ord.filaLimiar[k] = limiar;
  ord.filaTamanho[i] = n + 1;
  return true;
}

/**
 * Called when a unit reaches the end of its current order: a patrol turns around, a queue moves on, otherwise the unit
 * stops and keeps the order (so it can return to its slot if pushed away).
 */
export function concluirOrdem(sim, i) {
  const ord = sim.ordens;
  if (ord.par[i] >= 0) {
    const proxima = ord.par[i];
    const [mx, my, lim] = [ord.parMetaX[i], ord.parMetaY[i], ord.parLimiar[i]];
    ord.par[i] = ord.ordem[i];
    ord.parMetaX[i] = ord.metaX[i];
    ord.parMetaY[i] = ord.metaY[i];
    ord.parLimiar[i] = ord.limiar[i];
    usar(sim, ord.par[i]);
    atribuirOrdem(sim, i, proxima, mx, my, lim);
    largar(sim, proxima);
    return;
  }
  if (ord.filaTamanho[i] > 0) {
    const base = i * TAMANHO_FILA;
    const [o, mx, my, lim] = [ord.filaOrdem[base], ord.filaMetaX[base], ord.filaMetaY[base], ord.filaLimiar[base]];
    const n = ord.filaTamanho[i] - 1;
    ord.filaOrdem.copyWithin(base, base + 1, base + 1 + n);
    ord.filaMetaX.copyWithin(base, base + 1, base + 1 + n);
    ord.filaMetaY.copyWithin(base, base + 1, base + 1 + n);
    ord.filaLimiar.copyWithin(base, base + 1, base + 1 + n);
    ord.filaTamanho[i] = n;
    atribuirOrdem(sim, i, o, mx, my, lim);
    largar(sim, o);
    return;
  }
  sim.parada[i] = 1;
}

// A free order slot; when all are taken, the oldest non-fixed order is withdrawn from every unit holding it.
function slotDeOrdem(sim) {
  const ord = sim.ordens;
  for (let o = 0; o < MAX_ORDENS; o++) if (!ord.ativa[o]) return o;
  let escolhida = -1;
  for (let o = 0; o < MAX_ORDENS; o++) {
    if (ord.fixa[o]) continue;
    if (escolhida < 0 || ord.criadaEm[o] < ord.criadaEm[escolhida]) escolhida = o;
  }
  for (let i = 0; i < sim.capacidade; i++) {
    if (ord.ordem[i] !== escolhida && ord.par[i] !== escolhida && !filaTem(ord, i, escolhida)) continue;
    limparOrdens(sim, i);
    sim.parada[i] = 1;
    if (sim.regras.ordensPadrao) atribuirOrdem(sim, i, sim.time[i], 0, 0, 0);
  }
  return escolhida;
}

function filaTem(ord, i, o) {
  for (let k = 0; k < ord.filaTamanho[i]; k++) if (ord.filaOrdem[i * TAMANHO_FILA + k] === o) return true;
  return false;
}

/**
 * Creates an order towards world point (tx, ty); the target cell moves to the nearest open one. `classes` is the bit
 * mask of field classes to start computing now (classesDe). Returns its index.
 */
export function criarOrdem(sim, modo, tx, ty, { fixa = 0, raioChegada = 0, alvo = -1, classes = 1 << CLASSE_CAMPO.VEICULO } = {}) {
  const { grade: mapa, ordens: ord } = sim;
  const cx = Math.max(0, Math.min(mapa.largura - 1, tx >> FP_BITS));
  const cy = Math.max(0, Math.min(mapa.altura - 1, ty >> FP_BITS));
  let destino = celulaLivreMaisProxima(mapa, cx, cy);
  if (destino < 0) destino = sim.mapa.bases[0].y * mapa.largura + sim.mapa.bases[0].x;
  if (destino !== cy * mapa.largura + cx) {
    tx = (destino % mapa.largura) * FP + (FP >> 1);
    ty = Math.trunc(destino / mapa.largura) * FP + (FP >> 1);
  }
  const o = slotDeOrdem(sim);
  ord.ativa[o] = 1;
  ord.fixa[o] = fixa;
  ord.modo[o] = modo;
  ord.campo[o] = -1;
  ord.campoVeiculo[o] = -1;
  ord.destino[o] = destino;
  ord.tx[o] = tx;
  ord.ty[o] = ty;
  ord.raioChegada[o] = raioChegada;
  ord.alvo[o] = alvo;
  ord.criadaEm[o] = sim.tick;
  ord.usos[o] = 0;
  for (const classe of [CLASSE_CAMPO.INFANTARIA, CLASSE_CAMPO.VEICULO]) if (classes & (1 << classe)) campoDaOrdem(sim, o, classe);
  return o;
}

/**
 * An order of `modo` to (tx, ty) shared by every unit sent to the same cell (harvesters, new units to a rally point),
 * so a busy economy does not fill the order table: an active order of the same kind to the same cell is reused.
 */
export function ordemCompartilhada(sim, modo, tx, ty, classes) {
  const { grade, ordens: ord } = sim;
  const cx = Math.max(0, Math.min(grade.largura - 1, tx >> FP_BITS));
  const cy = Math.max(0, Math.min(grade.altura - 1, ty >> FP_BITS));
  let destino = cy * grade.largura + cx;
  if (grade.bloqueado[destino]) destino = celulaLivreMaisProxima(grade, cx, cy);
  for (let o = 0; o < MAX_ORDENS; o++) {
    if (ord.ativa[o] && !ord.fixa[o] && ord.modo[o] === modo && ord.destino[o] === destino && ord.alvo[o] < 0) return o;
  }
  return criarOrdem(sim, modo, tx, ty, { classes });
}

/** Points a fixed order at a new target (the prototype's computer waves). */
export function redirecionarOrdem(sim, o, tx, ty) {
  const { grade: mapa, ordens: ord } = sim;
  let destino = celulaLivreMaisProxima(mapa, tx >> FP_BITS, ty >> FP_BITS);
  if (destino < 0) destino = ord.destino[o];
  for (const [campos, classe] of [[ord.campo, CLASSE_CAMPO.INFANTARIA], [ord.campoVeiculo, CLASSE_CAMPO.VEICULO]]) {
    if (campos[o] < 0) continue;
    const campo = pedirCampo(sim.caminhos, destino, sim.tick, classe);
    prenderCampo(sim.caminhos, campo);
    soltarCampo(sim.caminhos, campos[o]);
    campos[o] = campo;
  }
  ord.destino[o] = destino;
  ord.tx[o] = tx;
  ord.ty[o] = ty;
}

/**
 * Formation slots for a group heading to (tx, ty): rows perpendicular to the way the group travels, wider than deep
 * (about sqrt(2n) columns), centred on the target; the most advanced units take the front row and every row keeps the
 * units' left-to-right order, so nobody crosses the group on arrival. Calls `destino(i, metaX, metaY, limiar)`.
 */
export function formar(sim, unidades, tx, ty, destino) {
  const mapa = sim.grade;
  const n = unidades.length;
  let somaX = 0;
  let somaY = 0;
  let raio = 0;
  for (const i of unidades) {
    somaX += sim.x[i];
    somaY += sim.y[i];
    raio = Math.max(raio, sim.tipos[sim.tipo[i]].raio);
  }
  const cx = Math.trunc(somaX / n);
  const cy = Math.trunc(somaY / n);
  const angulo = tx === cx && ty === cy ? 0 : anguloDe(tx - cx, ty - cy);
  const fx = cosseno(angulo);
  const fy = seno(angulo);
  const lx = -fy;
  const ly = fx;
  const espaco = 2 * raio + FOLGA_FORMACAO;
  const colunas = Math.max(1, raizInteira(2 * n));
  const linhas = Math.trunc((n + colunas - 1) / colunas);
  const profundidade = i => (sim.x[i] - cx) * fx + (sim.y[i] - cy) * fy;
  const lateral = i => (sim.x[i] - cx) * lx + (sim.y[i] - cy) * ly;
  const ordenadas = unidades.slice().sort((a, b) => profundidade(b) - profundidade(a) || a - b);
  const minimo = FP;
  const maximoX = (mapa.largura - 1) * FP - 1;
  const maximoY = (mapa.altura - 1) * FP - 1;
  for (let linha = 0; linha < linhas; linha++) {
    const fileira = ordenadas.slice(linha * colunas, (linha + 1) * colunas).sort((a, b) => lateral(a) - lateral(b) || a - b);
    const m = fileira.length;
    const recuo = Math.trunc(((linhas - 1 - 2 * linha) * espaco) / 2);
    for (let coluna = 0; coluna < m; coluna++) {
      const desvio = Math.trunc(((2 * coluna - (m - 1)) * espaco) / 2);
      let mx = Math.max(minimo, Math.min(maximoX, tx + ((fx * recuo + lx * desvio) >> FP_BITS)));
      let my = Math.max(minimo, Math.min(maximoY, ty + ((fy * recuo + ly * desvio) >> FP_BITS)));
      const celula = (my >> FP_BITS) * mapa.largura + (mx >> FP_BITS);
      if (mapa.bloqueado[celula]) {
        const livre = celulaLivreMaisProxima(mapa, mx >> FP_BITS, my >> FP_BITS);
        if (livre >= 0) {
          mx = (livre % mapa.largura) * FP + (FP >> 1);
          my = Math.trunc(livre / mapa.largura) * FP + (FP >> 1);
        }
      }
      const dx = mx - tx;
      const dy = my - ty;
      const limiar = Math.trunc((raizInteira(dx * dx + dy * dy) * 10) / FP) + MARGEM_DIRETA;
      destino(fileira[coluna], mx, my, limiar);
    }
  }
}

/** Gives a group order to units (slots of the ordering player), honouring the queue flag. */
export function ordenarGrupo(sim, unidades, modo, tx, ty, { fila = 0, alvo = -1 } = {}) {
  const o = criarOrdem(sim, modo, tx, ty, { alvo, classes: classesDe(sim, unidades) });
  const destino = sim.ordens;
  formar(sim, unidades, destino.tx[o], destino.ty[o], (i, mx, my, limiar) => {
    if (fila && (destino.ordem[i] >= 0 && !sim.parada[i])) {
      if (enfileirar(sim, i, o, mx, my, limiar)) return;
    }
    limparOrdens(sim, i);
    atribuirOrdem(sim, i, o, mx, my, limiar);
  });
  liberarSeVazia(sim, o);
  return o;
}

/** Patrol: the group goes to (tx, ty) in formation and back to where it stands now, forever. */
export function ordenarPatrulha(sim, unidades, tx, ty) {
  let somaX = 0;
  let somaY = 0;
  for (const i of unidades) {
    somaX += sim.x[i];
    somaY += sim.y[i];
  }
  const classes = classesDe(sim, unidades);
  const volta = criarOrdem(sim, TIPO_COMANDO.PATRULHAR, Math.trunc(somaX / unidades.length), Math.trunc(somaY / unidades.length), { classes });
  const ida = criarOrdem(sim, TIPO_COMANDO.PATRULHAR, tx, ty, { classes });
  const ord = sim.ordens;
  const metasVolta = new Map();
  formar(sim, unidades, ord.tx[volta], ord.ty[volta], (i, mx, my, limiar) => metasVolta.set(i, [mx, my, limiar]));
  formar(sim, unidades, ord.tx[ida], ord.ty[ida], (i, mx, my, limiar) => {
    limparOrdens(sim, i);
    atribuirOrdem(sim, i, ida, mx, my, limiar);
    const [vx, vy, vl] = metasVolta.get(i);
    usar(sim, volta);
    ord.par[i] = volta;
    ord.parMetaX[i] = vx;
    ord.parMetaY[i] = vy;
    ord.parLimiar[i] = vl;
  });
}
