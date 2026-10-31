// Construction: where a building may stand (one pure rule the page also calls for the placement ghost), the
// Religadores' power network (posts and nodes linked from a root, recomputed every tick: a fallen post cuts everything
// past it), buildings placed from the headquarters' construction lane, building sites raised on the spot by a unit,
// and recycling.
import { FP, FP_BITS, CATEGORIA, MOTIVO, BANDEIRA, FAIXA, EVENTO, TIPO_COMANDO } from './contratos.js';
import { CONSTRUIDO_POR } from './dados.js';
import { TAREFA } from './estado.js';
import { centroDaPegada, cantoDaPegada, temPegada, trabalhoDaObra, RITMO_OBRA } from './pegadas.js';
import { criarEntidade, emitirEvento, idDoSlot, slotVivo, removerEntidade } from './entidades.js';
import { bandeirasDe } from './bandeiras.js';
import { ordenarGrupo, limparOrdens } from './ordens.js';
import { pagar, reembolsar, recusar } from './economia.js';
import { cabecaDaFaixa, retirarDaFaixa, enfileirar } from './producao.js';

// A builder works on a site once its cell is this many cells (Chebyshev) from the footprint.
const ALCANCE_OBRA = 1;
// Work units a site gains per tick of a builder: the production lanes' full speed.
const OBRA_POR_PASSO = RITMO_OBRA;

// ---------- the placement rule ----------

/**
 * Why kind `tipo` cannot stand with its top-left cell at (cx, cy) for `jogador`, or 0 when it can. Pure: it reads
 * only the static map (bloqueado is the terrain, nivel, ventosa, tipos, economia) and the entity arrays of a snapshot (n, tipo,
 * dono, x, y, bandeiras), so the page calls it for the ghost every frame and the simulation calls it on CONSTRUIR with
 * the same arrays built from its state.
 * @param {{largura: number, altura: number, bloqueado: Uint8Array, nivel: Uint8Array, ventosa: Uint8Array, tipos: object[], economia?: object}} mapa
 * @param {{n: number, tipo: ArrayLike<number>, dono: ArrayLike<number>, x: ArrayLike<number>, y: ArrayLike<number>, bandeiras: ArrayLike<number>}} entidades
 */
export function motivoPosicao(mapa, entidades, jogador, tipo, cx, cy) {
  const { largura, altura, bloqueado, nivel, ventosa, tipos } = mapa;
  const t = tipos[tipo];
  if (!t || t.categoria !== CATEGORIA.PREDIO) return MOTIVO.NAO_PRODUZ;
  const [pl, pa] = t.pegada;
  if (cx < 1 || cy < 1 || cx + pl > largura - 1 || cy + pa > altura - 1) return MOTIVO.FORA_DO_MAPA;
  // open ground on one height level
  const nivel0 = nivel[cy * largura + cx];
  let ventosaSob = 0;
  for (let y = cy; y < cy + pa; y++) {
    for (let x = cx; x < cx + pl; x++) {
      const c = y * largura + x;
      if (bloqueado[c] || nivel[c] !== nivel0) return MOTIVO.TERRENO_IMPROPRIO;
      if (ventosa[c]) ventosaSob = 1;
    }
  }
  if (t.exigeVentosa && !ventosaSob) return MOTIVO.CELULA_NAO_VENTOSA;
  // nothing standing on the footprint: other footprints, or a unit's centre
  const x0 = cx * FP;
  const y0 = cy * FP;
  const x1 = (cx + pl) * FP;
  const y1 = (cy + pa) * FP;
  for (let k = 0; k < entidades.n; k++) {
    const outro = tipos[entidades.tipo[k]];
    if (outro.categoria === CATEGORIA.FAISCA) continue;
    if (outro.categoria === CATEGORIA.UNIDADE) {
      if (entidades.x[k] >= x0 && entidades.x[k] < x1 && entidades.y[k] >= y0 && entidades.y[k] < y1) return MOTIVO.TERRENO_OCUPADO;
      continue;
    }
    const [ol, oa] = outro.pegada;
    const ox = cantoDaPegada(entidades.x[k], ol);
    const oy = cantoDaPegada(entidades.y[k], oa);
    if (ox < cx + pl && cx < ox + ol && oy < cy + pa && cy < oy + oa) return MOTIVO.TERRENO_OCUPADO;
  }
  // a depot keeps its distance from the battery piles, so harvesting takes the walk the economy is balanced on
  const distancia = mapa.economia?.distanciaMinimaPilha ?? 0;
  if (t.deposito && distancia > 0) {
    for (let k = 0; k < entidades.n; k++) {
      const outro = tipos[entidades.tipo[k]];
      if (outro.categoria !== CATEGORIA.RECURSO) continue;
      const [ol, oa] = outro.pegada;
      const ox = cantoDaPegada(entidades.x[k], ol);
      const oy = cantoDaPegada(entidades.y[k], oa);
      const dx = ox >= cx + pl ? ox - (cx + pl - 1) : cx >= ox + ol ? cx - (ox + ol - 1) : 0;
      const dy = oy >= cy + pa ? oy - (cy + pa - 1) : cy >= oy + oa ? cy - (oy + oa - 1) : 0;
      if (Math.max(dx, dy) < distancia) return MOTIVO.PERTO_DO_RECURSO;
    }
  }
  // the building area: every cell of the footprint inside the disc of one of the player's powered network nodes, or
  // of one of its buildings that opens an area without a network
  for (let y = cy; y < cy + pa; y++) {
    for (let x = cx; x < cx + pl; x++) {
      const px = x * FP + (FP >> 1);
      const py = y * FP + (FP >> 1);
      let coberta = false;
      for (let k = 0; k < entidades.n && !coberta; k++) {
        if (entidades.dono[k] !== jogador) continue;
        const outro = tipos[entidades.tipo[k]];
        if (outro.categoria !== CATEGORIA.PREDIO || entidades.bandeiras[k] & BANDEIRA.EM_OBRA) continue;
        const raio = Math.max(entidades.bandeiras[k] & BANDEIRA.ENERGIZADO ? outro.raioRede : 0, outro.raioConstrucao);
        if (raio === 0) continue;
        const dx = px - entidades.x[k];
        const dy = py - entidades.y[k];
        if (dx * dx + dy * dy <= raio * raio * FP * FP) coberta = true;
      }
      if (!coberta) return MOTIVO.FORA_DA_AREA;
    }
  }
  return 0;
}

/** motivoPosicao() on the simulation's own state. */
export function motivoPosicaoNaSimulacao(sim, jogador, tipo, cx, cy) {
  let n = 0;
  for (let i = 0; i < sim.capacidade; i++) if (sim.ativo[i]) n++;
  const entidades = { n, tipo: new Int32Array(n), dono: new Int32Array(n), x: new Int32Array(n), y: new Int32Array(n), bandeiras: new Int32Array(n) };
  let k = 0;
  for (let i = 0; i < sim.capacidade; i++) {
    if (!sim.ativo[i]) continue;
    entidades.tipo[k] = sim.tipo[i];
    entidades.dono[k] = sim.time[i];
    entidades.x[k] = sim.x[i];
    entidades.y[k] = sim.y[i];
    entidades.bandeiras[k] = bandeirasDe(sim, i);
    k++;
  }
  const { mapa } = sim;
  return motivoPosicao({ largura: mapa.largura, altura: mapa.altura, bloqueado: mapa.bloqueado, nivel: mapa.nivel, ventosa: mapa.ventosa, tipos: sim.tipos, economia: sim.economia }, entidades, jogador, tipo, cx, cy);
}

// ---------- buildings on the map ----------

/** A building of `tipo` for `dono` with its top-left cell at (cx, cy); `obra` 1 starts it as a building site. Returns the slot or -1. */
export function colocarPredio(sim, tipo, dono, cx, cy, obra = 0) {
  const [pl, pa] = sim.tipos[tipo].pegada;
  const i = criarEntidade(sim, tipo, dono, centroDaPegada(cx, pl), centroDaPegada(cy, pa), 64);
  if (i < 0) return -1;
  if (obra) {
    sim.obra[i] = trabalhoDaObra(sim.tipos[tipo]);
    // a site rises from a tenth of its health
    sim.vida[i] = Math.max(1, Math.trunc(sim.tipos[tipo].vida / 10));
  } else {
    emitirEvento(sim, EVENTO.CONSTRUCAO_CONCLUIDA, i, -1, tipo);
  }
  return i;
}

/** Whether the building in slot i stands finished. */
export const predioPronto = (sim, i) => sim.ativo[i] && sim.obra[i] === 0 && sim.categoriaPorTipo[sim.tipo[i]] === CATEGORIA.PREDIO;

/** Whether the building works at full speed: finished and powered, or not needing power. */
export const predioFuncionando = (sim, i) => predioPronto(sim, i) && (sim.energizado[i] === 1 || !sim.tipos[sim.tipo[i]].precisaRede);

// ---------- the power network ----------

/**
 * Powers every player's buildings from their network roots: a node (raioRede > 0) joins when it is within the larger
 * of the two radii of a powered node, and any finished building is powered when its centre is within the radius of a
 * powered node. Recomputed from scratch every tick, in slot order, so a fallen post cuts everything past it at once.
 */
export function atualizarRede(sim) {
  const { tipos } = sim;
  const lista = [];
  const { itens, n } = sim.listas.predios;
  for (let k = 0; k < n; k++) if (sim.ativo[itens[k]] && sim.categoriaPorTipo[sim.tipo[itens[k]]] === CATEGORIA.PREDIO) lista.push(itens[k]);
  if (lista.length === 0) return;
  const antes = lista.map(i => sim.energizado[i]);
  for (const i of lista) {
    sim.energizado[i] = 0;
    sim.ligacao[i] = -1;
  }
  const fila = [];
  for (const i of lista) {
    if (sim.obra[i] === 0 && tipos[sim.tipo[i]].raizRede) {
      sim.energizado[i] = 1;
      fila.push(i);
    }
  }
  const alcance = (a, b, raio) => {
    const dx = sim.x[a] - sim.x[b];
    const dy = sim.y[a] - sim.y[b];
    return dx * dx + dy * dy <= raio * raio * FP * FP;
  };
  for (let k = 0; k < fila.length; k++) {
    const u = fila[k];
    const ru = tipos[sim.tipo[u]].raioRede;
    for (const v of lista) {
      if (sim.energizado[v] || sim.time[v] !== sim.time[u] || sim.obra[v] > 0) continue;
      const rv = tipos[sim.tipo[v]].raioRede;
      if (rv === 0 || !alcance(u, v, Math.max(ru, rv))) continue;
      sim.energizado[v] = 1;
      sim.ligacao[v] = u;
      fila.push(v);
    }
  }
  // the other buildings take power from the nearest powered node that reaches them
  for (const i of lista) {
    if (sim.energizado[i] || sim.obra[i] > 0) continue;
    let melhor = -1;
    let melhorD = 0;
    for (const u of fila) {
      if (sim.time[u] !== sim.time[i] || !alcance(u, i, tipos[sim.tipo[u]].raioRede)) continue;
      const dx = sim.x[u] - sim.x[i];
      const dy = sim.y[u] - sim.y[i];
      const d = dx * dx + dy * dy;
      if (melhor < 0 || d < melhorD) {
        melhor = u;
        melhorD = d;
      }
    }
    if (melhor >= 0) {
      sim.energizado[i] = 1;
      sim.ligacao[i] = melhor;
    }
  }
  lista.forEach((i, k) => {
    if (antes[k] && !sim.energizado[i] && tipos[sim.tipo[i]].precisaRede) emitirEvento(sim, EVENTO.REDE_CORTADA, i, -1, sim.tipo[i]);
  });
}

// ---------- commands ----------

/**
 * CONSTRUIR: places the building ready in a headquarters' construction lane, or sends builder units to raise one on
 * site (contratos.js, C1). `unidades` are the player's live slots from the command.
 */
export function comandoConstruir(sim, c, unidades) {
  const tipo = c.arg;
  const t = sim.tipos[tipo];
  const recusa = (motivo, i = unidades[0] ?? -1) => recusar(sim, c, i, motivo);
  if (!t || t.categoria !== CATEGORIA.PREDIO) return recusa(MOTIVO.NAO_PRODUZ);
  const cx = c.x >> FP_BITS;
  const cy = c.y >> FP_BITS;
  const qg = unidades.find(i => sim.categoriaPorTipo[sim.tipo[i]] === CATEGORIA.PREDIO);
  if (qg !== undefined) {
    const cabeca = cabecaDaFaixa(sim, qg, FAIXA.CONSTRUCAO);
    if (!cabeca.pronta || cabeca.item !== tipo) return recusa(MOTIVO.NADA_PRONTO, qg);
    const motivo = motivoPosicaoNaSimulacao(sim, c.jogador, tipo, cx, cy);
    if (motivo) return recusa(motivo, qg);
    if (colocarPredio(sim, tipo, c.jogador, cx, cy) < 0) return recusa(MOTIVO.LIMITE, qg);
    retirarDaFaixa(sim, qg, FAIXA.CONSTRUCAO, 0);
    // Shift: the same kind goes back in the lane, for posts in a row
    if (c.fila) enfileirar(sim, c, qg, FAIXA.CONSTRUCAO, tipo);
    return;
  }
  // builder units: an existing site of the player resumes; otherwise a new site, paid now
  const construtores = unidades.filter(i => sim.tipos[sim.tipo[i]].ergue.includes(tipo));
  if (construtores.length === 0) return recusa(MOTIVO.NAO_PRODUZ);
  if (t.construidoPor !== CONSTRUIDO_POR.UNIDADE) return recusa(MOTIVO.NAO_PRODUZ);
  let obra = slotVivo(sim, c.alvo);
  if (obra >= 0 && (sim.time[obra] !== c.jogador || sim.obra[obra] === 0 || sim.tipo[obra] !== tipo)) obra = -1;
  if (obra < 0) {
    const motivo = motivoPosicaoNaSimulacao(sim, c.jogador, tipo, cx, cy);
    if (motivo) return recusa(motivo, construtores[0]);
    if (!pagar(sim, c.jogador, t.custo)) return recusa(MOTIVO.SEM_CARGA, construtores[0]);
    obra = colocarPredio(sim, tipo, c.jogador, cx, cy, 1);
    if (obra < 0) {
      reembolsar(sim, c.jogador, t.custo);
      return recusa(MOTIVO.LIMITE, construtores[0]);
    }
  }
  for (const i of construtores) {
    limparOrdens(sim, i);
    sim.tarefa[i] = TAREFA.CONSTRUIR;
    sim.tarefaAlvo[i] = idDoSlot(sim, obra);
  }
  ordenarGrupo(sim, construtores, TIPO_COMANDO.MOVER, sim.x[obra], sim.y[obra]);
}

/** RECICLAR: the player's buildings come down and return part of their cost (economy data). */
export function comandoReciclar(sim, c, unidades) {
  for (const i of unidades) {
    if (sim.categoriaPorTipo[sim.tipo[i]] !== CATEGORIA.PREDIO) continue;
    const t = sim.tipos[sim.tipo[i]];
    reembolsar(sim, c.jogador, Math.trunc((t.custo * sim.economia.reciclarPorcento) / 100));
    emitirEvento(sim, EVENTO.MORTE, i, -1, sim.tipo[i]);
    removerEntidade(sim, i);
  }
}

// ---------- building sites ----------

// Chebyshev distance in cells from the cell under (x, y) to the footprint of slot j.
function distanciaAPegada(sim, x, y, j) {
  const [pl, pa] = sim.tipos[sim.tipo[j]].pegada;
  const ox = cantoDaPegada(sim.x[j], pl);
  const oy = cantoDaPegada(sim.y[j], pa);
  const cx = x >> FP_BITS;
  const cy = y >> FP_BITS;
  const dx = cx < ox ? ox - cx : cx >= ox + pl ? cx - (ox + pl - 1) : 0;
  const dy = cy < oy ? oy - cy : cy >= oy + pa ? cy - (oy + pa - 1) : 0;
  return Math.max(dx, dy);
}

/** Whether unit i stands next to the footprint of j (to work on it, unload at it, load from it). */
export const juntoDaPegada = (sim, i, j, alcance = ALCANCE_OBRA) => distanciaAPegada(sim, sim.x[i], sim.y[i], j) <= alcance;

/** Builders next to their site raise it; a finished site becomes a building. */
export function avancarObras(sim) {
  const { itens, n } = sim.listas.construtores;
  for (let k = 0; k < n; k++) {
    const i = itens[k];
    if (!sim.ativo[i] || sim.tarefa[i] !== TAREFA.CONSTRUIR) continue;
    const obra = slotVivo(sim, sim.tarefaAlvo[i]);
    if (obra < 0 || sim.obra[obra] === 0) {
      sim.tarefa[i] = TAREFA.NENHUMA;
      sim.tarefaAlvo[i] = -1;
      continue;
    }
    if (!juntoDaPegada(sim, i, obra)) continue;
    if (sim.ordens.ordem[i] >= 0) {
      limparOrdens(sim, i);
      sim.parada[i] = 1;
    }
    const t = sim.tipos[sim.tipo[obra]];
    const total = trabalhoDaObra(t);
    sim.obra[obra] = Math.max(0, sim.obra[obra] - OBRA_POR_PASSO);
    // health grows with the work, from a tenth to the whole
    sim.vida[obra] = Math.max(sim.vida[obra], Math.trunc((t.vida * (total - sim.obra[obra])) / total));
    if (sim.obra[obra] === 0) emitirEvento(sim, EVENTO.CONSTRUCAO_CONCLUIDA, obra, -1, sim.tipo[obra]);
  }
}

export { temPegada };
