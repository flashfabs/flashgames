// Economy: Carga per player, harvesters that walk to a node of battery piles, wait their turn when it is full
// (saturation), load, carry to the nearest depot and unload; piles that run dry; the load of a dead harvester spilled
// as sparks any harvester may pick up for a while; and the announced wind gusts that pay every windmill standing on a
// windy cell. Everything in slot order, timed in ticks.
import { FP, FP_BITS, CATEGORIA, EVENTO, MOTIVO, SEM_ENTIDADE, TIPO_COMANDO, PASSOS_POR_SEGUNDO } from './contratos.js';
import { seno, cosseno } from './matematica.js';
import { TAREFA, registrarExtras } from './estado.js';
import { cantoDaPegada } from './pegadas.js';
import { criarEntidade, emitirEvento, emitirEventoGlobal, idDoSlot, slotVivo, removerEntidade } from './entidades.js';
import { atribuirOrdem, ordemCompartilhada, limparOrdens, classesDe } from './ordens.js';
import { registrarViagem } from './veterania.js';

// a harvester loads, unloads or picks up within this many cells (Chebyshev) of the pile, depot or spark
const ALCANCE_COLETA = 2;
// a harvester that filled up looks for more sparks this far, in cells
const RAIO_FAISCAS = 4;
// a harvester short of its place without an order asks again every this many ticks (staggered by slot)
const INTERVALO_REPEDIR = 8;
// sparks of one spill spread on a ring this far from where the harvester died, world units
const RAIO_DERRAME = 400;

registrarExtras('economia', (sim, opcoes) => {
  const carga = new Int32Array(sim.times);
  carga.fill(opcoes.cargaInicial ?? sim.economia.cargaInicial);
  // [tick of the next announcement, tick of the next gust]; zeros when the map has no windy cell
  const rajada = new Int32Array(2);
  if (sim.mapa.ventosa?.some(v => v === 1)) {
    rajada[1] = Math.max(1, sim.economia.primeiraRajada);
    rajada[0] = Math.max(1, rajada[1] - sim.economia.avisoRajada);
  }
  return { carga, ultimoComando: new Int32Array(sim.times), rajada };
});

// ---------- Carga ----------

/** Carga of a player. */
export const cargaDe = (sim, jogador) => sim.extras.economia.carga[jogador];

/** Gives (or, with a negative value, takes) Carga; never below zero. */
export function darCarga(sim, jogador, valor) {
  const carga = sim.extras.economia.carga;
  carga[jogador] = Math.max(0, carga[jogador] + valor);
}

/** Pays `valor` if the player has it; false otherwise. */
export function pagar(sim, jogador, valor) {
  const carga = sim.extras.economia.carga;
  if (carga[jogador] < valor) return false;
  carga[jogador] -= valor;
  return true;
}

export const reembolsar = (sim, jogador, valor) => darCarga(sim, jogador, valor);

/** Harvesters of a player working (going to a node, loading, carrying or unloading). */
export function coletoresEntregando(sim, jogador) {
  let n = 0;
  for (let i = 0; i < sim.capacidade; i++) if (sim.ativo[i] && sim.time[i] === jogador && sim.coletorPorTipo[sim.tipo[i]] && sim.tarefa[i] !== TAREFA.NENHUMA) n++;
  return n;
}

/** Raises COMANDO_RECUSADO for command c (contratos.js, C3); `i` is the producer or first unit, -1 none. */
export function recusar(sim, c, i, motivo) {
  sim.eventos.push(EVENTO.COMANDO_RECUSADO, sim.tick, i >= 0 ? idDoSlot(sim, i) : SEM_ENTIDADE, SEM_ENTIDADE, c.x, c.y, c.jogador, c.tipo, motivo);
}

// ---------- walking to a place ----------

// The open cell next to the footprint of j (one cell out) nearest to (x, y); ties in row order. -1 when boxed in.
function celulaJuntoA(sim, j, x, y) {
  const [pl, pa] = sim.tipos[sim.tipo[j]].pegada;
  const ox = cantoDaPegada(sim.x[j], pl);
  const oy = cantoDaPegada(sim.y[j], pa);
  const { largura, bloqueado } = sim.grade;
  let melhor = -1;
  let melhorD = 0;
  for (let cy = oy - 1; cy <= oy + pa; cy++) {
    for (let cx = ox - 1; cx <= ox + pl; cx++) {
      if (cx > ox - 1 && cx < ox + pl && cy > oy - 1 && cy < oy + pa) continue;
      const c = cy * largura + cx;
      if (bloqueado[c]) continue;
      const dx = cx * FP + (FP >> 1) - x;
      const dy = cy * FP + (FP >> 1) - y;
      const d = dx * dx + dy * dy;
      if (melhor < 0 || d < melhorD) {
        melhor = c;
        melhorD = d;
      }
    }
  }
  return melhor;
}

// Sends harvester i to the cell next to entity j: every harvester heading for the same cell shares one order.
function irJuntoA(sim, i, j) {
  const celula = sim.categoriaPorTipo[sim.tipo[j]] === CATEGORIA.FAISCA ? (sim.y[j] >> FP_BITS) * sim.grade.largura + (sim.x[j] >> FP_BITS) : celulaJuntoA(sim, j, sim.x[i], sim.y[i]);
  if (celula < 0) return;
  const { largura } = sim.grade;
  const tx = (celula % largura) * FP + (FP >> 1);
  const ty = Math.trunc(celula / largura) * FP + (FP >> 1);
  // drop the old orders first: an order nobody holds any more is freed, so the lookup never returns a freed one
  limparOrdens(sim, i);
  atribuirOrdem(sim, i, ordemCompartilhada(sim, TIPO_COMANDO.COLETAR, tx, ty, classesDe(sim, [i])), tx, ty, 0);
}

// Chebyshev distance in cells from unit i to the footprint of j (to the cell of j when it has none).
function distanciaCelulas(sim, i, j) {
  const [pl, pa] = sim.tipos[sim.tipo[j]].pegada;
  const ox = cantoDaPegada(sim.x[j], pl);
  const oy = cantoDaPegada(sim.y[j], pa);
  const cx = sim.x[i] >> FP_BITS;
  const cy = sim.y[i] >> FP_BITS;
  const dx = cx < ox ? ox - cx : cx >= ox + pl ? cx - (ox + pl - 1) : 0;
  const dy = cy < oy ? oy - cy : cy >= oy + pa ? cy - (oy + pa - 1) : 0;
  return Math.max(dx, dy);
}

// Stops a harvester that reached the place of its task.
function parar(sim, i) {
  if (sim.ordens.ordem[i] >= 0) limparOrdens(sim, i);
  sim.parada[i] = 1;
}

// ---------- choosing nodes, piles, depots and sparks ----------

// Carga left per node, from the piles (the tick's lists: called inside a step only).
function restantePorNo(sim) {
  const restante = new Int32Array(sim.mapa.nos.length);
  const { itens, n } = sim.listas.recursos;
  for (let k = 0; k < n; k++) {
    const j = itens[k];
    if (sim.ativo[j] && sim.categoriaPorTipo[sim.tipo[j]] === CATEGORIA.RECURSO && sim.no[j] >= 0) restante[sim.no[j]] += sim.carga[j];
  }
  return restante;
}

// The node with Carga left that the harvester's team has explored, nearest to (x, y); -1 none.
function noMaisProximo(sim, i, x, y, restante) {
  const { nos, largura } = sim.mapa;
  const explorado = sim.neblina.explorado[sim.time[i]];
  let melhor = -1;
  let melhorD = 0;
  for (let k = 0; k < nos.length; k++) {
    if (restante[k] === 0 || !explorado[nos[k].y * largura + nos[k].x]) continue;
    const dx = nos[k].x * FP + (FP >> 1) - x;
    const dy = nos[k].y * FP + (FP >> 1) - y;
    const d = dx * dx + dy * dy;
    if (melhor < 0 || d < melhorD) {
      melhor = k;
      melhorD = d;
    }
  }
  return melhor;
}

// The pile of node k with Carga left nearest to harvester i; -1 none.
function pilhaDoNo(sim, i, k) {
  let melhor = -1;
  let melhorD = 0;
  const { itens, n } = sim.listas.recursos;
  for (let p = 0; p < n; p++) {
    const j = itens[p];
    if (!sim.ativo[j] || sim.categoriaPorTipo[sim.tipo[j]] !== CATEGORIA.RECURSO || sim.no[j] !== k || sim.carga[j] === 0) continue;
    const dx = sim.x[j] - sim.x[i];
    const dy = sim.y[j] - sim.y[i];
    const d = dx * dx + dy * dy;
    if (melhor < 0 || d < melhorD) {
      melhor = j;
      melhorD = d;
    }
  }
  return melhor;
}

// The player's finished depot nearest to harvester i; -1 none.
function depositoMaisProximo(sim, i) {
  let melhor = -1;
  let melhorD = 0;
  const { itens, n } = sim.listas.predios;
  for (let p = 0; p < n; p++) {
    const j = itens[p];
    if (!sim.ativo[j] || sim.time[j] !== sim.time[i] || sim.obra[j] > 0 || sim.categoriaPorTipo[sim.tipo[j]] !== CATEGORIA.PREDIO || !sim.tipos[sim.tipo[j]].deposito) continue;
    const dx = sim.x[j] - sim.x[i];
    const dy = sim.y[j] - sim.y[i];
    const d = dx * dx + dy * dy;
    if (melhor < 0 || d < melhorD) {
      melhor = j;
      melhorD = d;
    }
  }
  return melhor;
}

// The spark nearest to harvester i within `raio` cells; -1 none.
function faiscaPerto(sim, i, raio) {
  let melhor = -1;
  let melhorD = (raio * FP) * (raio * FP) + 1;
  const { itens, n } = sim.listas.faiscas;
  for (let p = 0; p < n; p++) {
    const j = itens[p];
    if (!sim.ativo[j] || sim.categoriaPorTipo[sim.tipo[j]] !== CATEGORIA.FAISCA) continue;
    const dx = sim.x[j] - sim.x[i];
    const dy = sim.y[j] - sim.y[i];
    const d = dx * dx + dy * dy;
    if (d < melhorD) {
      melhor = j;
      melhorD = d;
    }
  }
  return melhor;
}

// ---------- task changes ----------

function tarefa(sim, i, nova, alvo) {
  sim.tarefa[i] = nova;
  sim.tarefaAlvo[i] = alvo >= 0 ? idDoSlot(sim, alvo) : -1;
}

// Back to its node, or to the nearest other one; idle when nothing is left that the team knows of.
function voltarAoNo(sim, i, restante) {
  let k = sim.no[i];
  if (k < 0 || restante[k] === 0) k = noMaisProximo(sim, i, sim.x[i], sim.y[i], restante);
  sim.no[i] = k;
  const pilha = k >= 0 ? pilhaDoNo(sim, i, k) : -1;
  if (pilha < 0) {
    tarefa(sim, i, TAREFA.NENHUMA, -1);
    parar(sim, i);
    return;
  }
  tarefa(sim, i, TAREFA.IR_NO, pilha);
  irJuntoA(sim, i, pilha);
}

// To a depot (the given one, or the nearest); idle with the load when the player has none.
function irAoDeposito(sim, i, deposito = -1) {
  const j = deposito >= 0 ? deposito : depositoMaisProximo(sim, i);
  if (j < 0) {
    // no depot to go to: it waits loaded where it stands and looks again now and then, so the first depot built (or
    // the next one, when its depot fell) puts it back to work
    tarefa(sim, i, TAREFA.IR_DEPOSITO, -1);
    parar(sim, i);
    return;
  }
  tarefa(sim, i, TAREFA.IR_DEPOSITO, j);
  irJuntoA(sim, i, j);
}

function irAFaisca(sim, i, j) {
  tarefa(sim, i, TAREFA.IR_FAISCA, j);
  irJuntoA(sim, i, j);
}

// After loading or picking up: more sparks nearby while there is room, else unload, else back to work.
function seguirComCarga(sim, i, restante) {
  const tipo = sim.tipos[sim.tipo[i]];
  if (sim.carga[i] < tipo.capacidade) {
    const faisca = faiscaPerto(sim, i, RAIO_FAISCAS);
    if (faisca >= 0 && sim.tarefa[i] === TAREFA.RECOLHER) return irAFaisca(sim, i, faisca);
  }
  if (sim.carga[i] > 0) return irAoDeposito(sim, i);
  voltarAoNo(sim, i, restante);
}

/** A unit given a movement order drops its harvesting or building task. */
export function cancelarTarefa(sim, i) {
  sim.tarefa[i] = TAREFA.NENHUMA;
  sim.tarefaAlvo[i] = -1;
}

/** A new harvester starts on the node nearest to it (or the rally node `no`). */
export function iniciarColeta(sim, i, no = -1) {
  if (!sim.coletorPorTipo[sim.tipo[i]]) return;
  sim.no[i] = no;
  voltarAoNo(sim, i, restantePorNo(sim));
}

// ---------- the command ----------

/** COLETAR (contratos.js, C1): harvesters to a pile's node, a spark, one of the player's depots, or the node nearest a point. */
export function comandoColetar(sim, c, unidades) {
  const coletores = unidades.filter(i => sim.coletorPorTipo[sim.tipo[i]]);
  if (coletores.length === 0) return;
  const alvo = slotVivo(sim, c.alvo);
  const restante = restantePorNo(sim);
  const categoria = alvo >= 0 ? sim.categoriaPorTipo[sim.tipo[alvo]] : -1;
  for (const i of coletores) {
    if (categoria === CATEGORIA.FAISCA) {
      irAFaisca(sim, i, alvo);
    } else if (categoria === CATEGORIA.RECURSO) {
      sim.no[i] = sim.no[alvo];
      if (sim.carga[i] >= sim.tipos[sim.tipo[i]].capacidade) irAoDeposito(sim, i);
      else if (sim.carga[alvo] > 0) {
        tarefa(sim, i, TAREFA.IR_NO, alvo);
        irJuntoA(sim, i, alvo);
      } else voltarAoNo(sim, i, restante);
    } else if (alvo >= 0 && sim.time[alvo] === c.jogador && sim.tipos[sim.tipo[alvo]].deposito && sim.obra[alvo] === 0) {
      if (sim.carga[i] > 0) irAoDeposito(sim, i, alvo);
    } else if (alvo < 0) {
      sim.no[i] = noMaisProximo(sim, i, c.x, c.y, restante);
      voltarAoNo(sim, i, restante);
    }
  }
}

// ---------- each tick ----------

/** Sparks fade, harvesters work their tasks, full nodes admit waiting harvesters in arrival order, gusts blow. */
export function avancarEconomia(sim) {
  const { tick } = sim;
  const { faiscas, coletores } = sim.listas;
  for (let k = 0; k < faiscas.n; k++) {
    const j = faiscas.itens[k];
    if (sim.ativo[j] && sim.categoriaPorTipo[sim.tipo[j]] === CATEGORIA.FAISCA && tick >= sim.expiraEm[j]) removerEntidade(sim, j);
  }
  soprar(sim);
  if (coletores.n === 0) return;
  const restante = restantePorNo(sim);
  const ocupacao = new Int32Array(sim.mapa.nos.length);
  for (let k = 0; k < coletores.n; k++) {
    const i = coletores.itens[k];
    if (sim.ativo[i] && sim.tarefa[i] === TAREFA.CARREGAR && sim.no[i] >= 0) ocupacao[sim.no[i]]++;
  }
  const esperando = [];
  for (let k = 0; k < coletores.n; k++) {
    const i = coletores.itens[k];
    if (!sim.ativo[i] || !sim.coletorPorTipo[sim.tipo[i]] || sim.tarefa[i] === TAREFA.NENHUMA) continue;
    trabalhar(sim, i, restante, ocupacao, esperando);
  }
  // first come, first served at a full node
  esperando.sort((a, b) => sim.esperaDesde[a] - sim.esperaDesde[b] || a - b);
  for (const i of esperando) {
    const k = sim.no[i];
    if (ocupacao[k] >= sim.economia.saturacao) continue;
    const pilha = pilhaDoNo(sim, i, k);
    if (pilha < 0) {
      voltarAoNo(sim, i, restante);
      continue;
    }
    ocupacao[k]++;
    tarefa(sim, i, TAREFA.CARREGAR, pilha);
    sim.tempoTarefa[i] = tick + sim.tipos[sim.tipo[i]].carregar;
  }
}

// One tick of harvester i's task.
function trabalhar(sim, i, restante, ocupacao, esperando) {
  const tipo = sim.tipos[sim.tipo[i]];
  const alvo = slotVivo(sim, sim.tarefaAlvo[i]);
  // short of the place with no order to follow, or stopped short by the stuck detection: ask again now and then
  const repedir = (sim.ordens.ordem[i] < 0 || sim.parada[i] === 1) && ((sim.tick + i) & (INTERVALO_REPEDIR - 1)) === 0;
  switch (sim.tarefa[i]) {
    case TAREFA.IR_NO: {
      if (alvo < 0 || sim.carga[alvo] === 0) return voltarAoNo(sim, i, restante);
      if (distanciaCelulas(sim, i, alvo) > ALCANCE_COLETA) {
        if (repedir) irJuntoA(sim, i, alvo);
        return;
      }
      parar(sim, i);
      sim.no[i] = sim.no[alvo];
      sim.tarefa[i] = TAREFA.ESPERAR;
      sim.esperaDesde[i] = sim.tick;
      esperando.push(i);
      return;
    }
    case TAREFA.ESPERAR:
      if (sim.no[i] < 0 || restante[sim.no[i]] === 0) return voltarAoNo(sim, i, restante);
      esperando.push(i);
      return;
    case TAREFA.CARREGAR: {
      if (sim.tick < sim.tempoTarefa[i]) return;
      ocupacao[sim.no[i]]--;
      if (alvo >= 0) {
        const tomar = Math.min(tipo.capacidade - sim.carga[i], sim.carga[alvo]);
        sim.carga[i] += tomar;
        sim.carga[alvo] -= tomar;
        restante[sim.no[alvo]] -= tomar;
        if (tomar > 0 && sim.carga[alvo] === 0) emitirEvento(sim, EVENTO.RECURSO_ESGOTADO, alvo, -1, sim.no[alvo]);
      }
      return seguirComCarga(sim, i, restante);
    }
    case TAREFA.IR_DEPOSITO: {
      if (alvo < 0 || sim.obra[alvo] > 0) {
        // waiting for a depot: look once a second, staggered by slot
        if (sim.tarefaAlvo[i] < 0 && (sim.tick + i) % PASSOS_POR_SEGUNDO !== 0) return;
        return irAoDeposito(sim, i);
      }
      if (distanciaCelulas(sim, i, alvo) > ALCANCE_COLETA) {
        if (repedir) irJuntoA(sim, i, alvo);
        return;
      }
      parar(sim, i);
      sim.tarefa[i] = TAREFA.DESCARREGAR;
      sim.tempoTarefa[i] = sim.tick + tipo.descarregar;
      return;
    }
    case TAREFA.DESCARREGAR: {
      if (alvo < 0) return irAoDeposito(sim, i);
      if (sim.tick < sim.tempoTarefa[i]) return;
      const entregue = sim.carga[i];
      darCarga(sim, sim.time[i], entregue);
      emitirEvento(sim, EVENTO.DESCARGA, i, alvo, entregue);
      sim.carga[i] = 0;
      if (sim.viagens[i] < 0xffff) sim.viagens[i]++;
      registrarViagem(sim, i);
      return voltarAoNo(sim, i, restante);
    }
    case TAREFA.IR_FAISCA: {
      if (alvo < 0) return seguirComCarga(sim, i, restante);
      if (distanciaCelulas(sim, i, alvo) > 1) {
        if (repedir) irJuntoA(sim, i, alvo);
        return;
      }
      parar(sim, i);
      sim.tarefa[i] = TAREFA.RECOLHER;
      sim.tempoTarefa[i] = sim.tick + tipo.recolher;
      return;
    }
    case TAREFA.RECOLHER: {
      if (sim.tick < sim.tempoTarefa[i]) return;
      if (alvo >= 0) {
        const tomar = Math.min(tipo.capacidade - sim.carga[i], sim.carga[alvo]);
        sim.carga[i] += tomar;
        sim.carga[alvo] -= tomar;
        if (sim.carga[alvo] === 0) removerEntidade(sim, alvo);
      }
      return seguirComCarga(sim, i, restante);
    }
    default:
      return;
  }
}

// The gust: announced `avisoRajada` ticks ahead, it pays every finished windmill of a player standing at that moment.
function soprar(sim) {
  const rajada = sim.extras.economia.rajada;
  if (rajada[1] === 0) return;
  if (sim.tick === rajada[0]) emitirEventoGlobal(sim, EVENTO.RAJADA_ANUNCIADA, 0, 0, rajada[1], 0, rajada[1] - sim.tick);
  if (sim.tick !== rajada[1]) return;
  const lote = sim.economia.loteRajada;
  const { itens, n } = sim.listas.predios;
  for (let k = 0; k < n; k++) {
    const i = itens[k];
    if (!sim.ativo[i] || sim.obra[i] > 0 || sim.time[i] >= sim.times || sim.categoriaPorTipo[sim.tipo[i]] !== CATEGORIA.PREDIO || !sim.tipos[sim.tipo[i]].exigeVentosa) continue;
    darCarga(sim, sim.time[i], lote);
    emitirEvento(sim, EVENTO.RAJADA, i, -1, lote);
  }
  rajada[1] += sim.economia.intervaloRajada;
  rajada[0] = Math.max(sim.tick + 1, rajada[1] - sim.economia.avisoRajada);
}

/** End of tick: the loads of harvesters that died this tick fall as sparks around where they died. */
export function processarDerrames(sim) {
  const lista = sim.derrames;
  if (lista.length === 0) return;
  const { economia } = sim;
  const tipoFaisca = sim.tipos.findIndex(t => t.categoria === CATEGORIA.FAISCA);
  for (let k = 0; k < lista.length; k += 4) {
    const [x, y, carga, id] = [lista[k], lista[k + 1], lista[k + 2], lista[k + 3]];
    const total = Math.trunc((carga * economia.derramadaPorcento) / 100);
    sim.eventos.push(EVENTO.CARGA_DERRAMADA, sim.tick, id, SEM_ENTIDADE, x, y, x, y, total);
    const n = Math.trunc((total + economia.faiscaCarga - 1) / economia.faiscaCarga);
    for (let f = 0; f < n; f++) {
      // the first spark where the harvester fell, the others on a ring around it, in open cells only
      const angulo = Math.trunc((f * 256) / Math.max(1, n - 1));
      let fx = f === 0 ? x : x + ((cosseno(angulo) * RAIO_DERRAME) >> FP_BITS);
      let fy = f === 0 ? y : y + ((seno(angulo) * RAIO_DERRAME) >> FP_BITS);
      if (sim.grade.bloqueado[(fy >> FP_BITS) * sim.grade.largura + (fx >> FP_BITS)]) {
        fx = x;
        fy = y;
      }
      const j = criarEntidade(sim, tipoFaisca, 255, fx, fy, 0);
      if (j < 0) break;
      const valor = Math.min(economia.faiscaCarga, total - f * economia.faiscaCarga);
      sim.carga[j] = valor;
      sim.cargaMaxima[j] = valor;
      sim.expiraEm[j] = sim.tick + economia.duracaoFaisca;
    }
  }
  lista.length = 0;
}

/** Harvesters loading at each node right now (the "2/3" the interface shows on a pile). */
export function ocupacaoDosNos(sim) {
  const ocupacao = new Int32Array(sim.mapa.nos.length);
  for (let i = 0; i < sim.capacidade; i++) if (sim.ativo[i] && sim.tarefa[i] === TAREFA.CARREGAR && sim.no[i] >= 0) ocupacao[sim.no[i]]++;
  return ocupacao;
}
