// Production: every producer building has two lanes of up to MAX_FILA items (units and research; and, in the
// headquarters, buildings), paid when queued and refunded in full when cancelled. Only the head advances: at full
// speed when the producer has power or needs none, slower without it; a unit's head waits while the player's
// population is at the cap, and a finished building waits in the lane until it is placed. New units leave by the
// bottom of the footprint and head for the rally point; new harvesters go harvesting.
import { FP, CATEGORIA, EVENTO, MOTIVO, FAIXA, FAIXA_ESTADO, MAX_FILA, ITEM_PESQUISA, TIPO_COMANDO } from './contratos.js';
import { registrarExtras } from './estado.js';
import { celulaLivreMaisProxima } from './mapa.js';
import { cantoDaPegada, RITMO_OBRA } from './pegadas.js';
import { criarEntidade, emitirEvento, slotVivo } from './entidades.js';
import { atribuirOrdem, ordemCompartilhada, classesDe } from './ordens.js';
import { pagar, reembolsar, recusar, iniciarColeta } from './economia.js';
import { predioPronto, predioFuncionando } from './construcao.js';
import { tipoLiberado, pesquisaDisponivel, concluirPesquisa } from './pesquisas.js';

// work units per tick at full speed; an item needs its time in ticks times this
const RITMO = RITMO_OBRA;

registrarExtras('producao', sim => {
  const faixas = 2 * sim.capacidade;
  return {
    itens: new Int16Array(faixas * MAX_FILA).fill(-1),
    n: new Uint8Array(faixas),
    feito: new Int32Array(faixas),
    estado: new Uint8Array(faixas),
    avisado: new Uint8Array(faixas), // the population refusal was raised for this head already
  };
});

const ehPesquisa = item => item >= ITEM_PESQUISA;

// Cost, time and population points of a queue item.
function custoDe(sim, item) {
  return ehPesquisa(item) ? sim.pesquisas[item - ITEM_PESQUISA].custo : sim.tipos[item].custo;
}
function tempoDe(sim, item) {
  return Math.max(1, ehPesquisa(item) ? sim.pesquisas[item - ITEM_PESQUISA].tempo : sim.tipos[item].tempo);
}
function requisitosDe(sim, item) {
  return ehPesquisa(item) ? sim.pesquisas[item - ITEM_PESQUISA].requer : sim.tipos[item].requer;
}

/** The head of a lane: its item (-1 when empty) and whether it is a building ready to place. */
export function cabecaDaFaixa(sim, i, faixa) {
  const f = sim.extras.producao;
  const b = 2 * i + faixa;
  if (f.n[b] === 0) return { item: -1, pronta: false };
  return { item: f.itens[b * MAX_FILA], pronta: f.estado[b] === FAIXA_ESTADO.PRONTO };
}

/** Removes the item at `posicao` of a lane and returns it; the head's progress resets when the head goes. */
export function retirarDaFaixa(sim, i, faixa, posicao) {
  const f = sim.extras.producao;
  const b = 2 * i + faixa;
  const base = b * MAX_FILA;
  const item = f.itens[base + posicao];
  f.itens.copyWithin(base + posicao, base + posicao + 1, base + MAX_FILA);
  f.itens[base + MAX_FILA - 1] = -1;
  f.n[b]--;
  if (posicao === 0) {
    f.feito[b] = 0;
    f.avisado[b] = 0;
    f.estado[b] = f.n[b] > 0 ? FAIXA_ESTADO.PRODUZINDO : FAIXA_ESTADO.VAZIA;
  }
  return item;
}

// Whether every building `item` requires stands finished for the player (the tick's lists: inside a step only).
function requisitosAtendidos(sim, jogador, item) {
  const requer = requisitosDe(sim, item);
  const { itens, n } = sim.listas.predios;
  for (const tipo of requer) {
    let tem = false;
    for (let k = 0; k < n && !tem; k++) {
      const j = itens[k];
      if (sim.time[j] === jogador && sim.tipo[j] === tipo && predioPronto(sim, j)) tem = true;
    }
    if (!tem) return false;
  }
  return true;
}

// Units of a kind the player has, alive or queued anywhere.
function quantosDoTipo(sim, jogador, tipo) {
  const f = sim.extras.producao;
  let n = 0;
  for (let j = 0; j < sim.capacidade; j++) {
    if (!sim.ativo[j] || sim.time[j] !== jogador) continue;
    if (sim.tipo[j] === tipo && sim.categoriaPorTipo[tipo] === CATEGORIA.UNIDADE) n++;
    for (let faixa = 0; faixa < 2; faixa++) {
      const b = 2 * j + faixa;
      for (let k = 0; k < f.n[b]; k++) if (f.itens[b * MAX_FILA + k] === tipo) n++;
    }
  }
  return n;
}

// The lane an item goes to in producer i, or -1 when i cannot make it.
function faixaPara(sim, i, item) {
  const produtor = sim.tipos[sim.tipo[i]];
  if (ehPesquisa(item)) return sim.pesquisas[item - ITEM_PESQUISA].predio === sim.tipo[i] ? FAIXA.UNIDADES : -1;
  if (produtor.produz.includes(item)) return FAIXA.UNIDADES;
  if (produtor.filaConstrucao && produtor.constroi.includes(item)) return FAIXA.CONSTRUCAO;
  return -1;
}

/**
 * Pays and queues `item` in lane `faixa` of producer i for the player of command c; raises COMANDO_RECUSADO and
 * returns false when it cannot.
 */
export function enfileirar(sim, c, i, faixa, item) {
  const f = sim.extras.producao;
  const b = 2 * i + faixa;
  if (f.n[b] >= MAX_FILA) return recusar(sim, c, i, MOTIVO.FILA_CHEIA), false;
  if (!pagar(sim, c.jogador, custoDe(sim, item))) return recusar(sim, c, i, MOTIVO.SEM_CARGA), false;
  f.itens[b * MAX_FILA + f.n[b]] = item;
  f.n[b]++;
  if (f.estado[b] === FAIXA_ESTADO.VAZIA) f.estado[b] = FAIXA_ESTADO.PRODUZINDO;
  return true;
}

// Why the player may not queue `item` at all right now (0 when it may).
function motivoItem(sim, jogador, item) {
  if (ehPesquisa(item)) {
    const k = item - ITEM_PESQUISA;
    if (k >= sim.pesquisas.length || !pesquisaDisponivel(sim, jogador, k)) return MOTIVO.BLOQUEADO;
    // one of each research in the queues at a time
    const f = sim.extras.producao;
    for (let j = 0; j < f.n.length; j++) {
      if (sim.time[j >> 1] !== jogador || !sim.ativo[j >> 1]) continue;
      for (let p = 0; p < f.n[j]; p++) if (f.itens[j * MAX_FILA + p] === item) return MOTIVO.LIMITE;
    }
  } else {
    if (!tipoLiberado(sim, jogador, item)) return MOTIVO.BLOQUEADO;
    const limite = sim.tipos[item].limite;
    if (limite > 0 && quantosDoTipo(sim, jogador, item) >= limite) return MOTIVO.LIMITE;
  }
  if (!requisitosAtendidos(sim, jogador, item)) return MOTIVO.BLOQUEADO;
  return 0;
}

// Queues an item in the listed producer that can make it with the shortest lane (all the player's when none listed).
function produzirItem(sim, c, unidades, item) {
  let candidatos = unidades;
  if (candidatos.length === 0) {
    candidatos = [];
    for (let j = 0; j < sim.capacidade; j++) if (sim.ativo[j] && sim.time[j] === c.jogador) candidatos.push(j);
  }
  const f = sim.extras.producao;
  let melhor = -1;
  let melhorFaixa = -1;
  for (const i of candidatos) {
    if (!predioPronto(sim, i)) continue;
    const faixa = faixaPara(sim, i, item);
    if (faixa < 0) continue;
    if (melhor < 0 || f.n[2 * i + faixa] < f.n[2 * melhor + melhorFaixa]) {
      melhor = i;
      melhorFaixa = faixa;
    }
  }
  if (melhor < 0) return recusar(sim, c, unidades[0] ?? -1, MOTIVO.NAO_PRODUZ);
  const motivo = motivoItem(sim, c.jogador, item);
  if (motivo) return recusar(sim, c, melhor, motivo);
  enfileirar(sim, c, melhor, melhorFaixa, item);
}

/** PRODUZIR (contratos.js, C1). */
export function comandoProduzir(sim, c, unidades) {
  if (c.arg < 0 || c.arg >= sim.tipos.length) return;
  const categoria = sim.categoriaPorTipo[c.arg];
  if (categoria !== CATEGORIA.UNIDADE && categoria !== CATEGORIA.PREDIO) return;
  produzirItem(sim, c, unidades, c.arg);
}

/** PESQUISAR (contratos.js, C1). */
export function comandoPesquisar(sim, c, unidades) {
  if (c.arg < 0 || c.arg >= sim.pesquisas.length) return;
  produzirItem(sim, c, unidades, ITEM_PESQUISA + c.arg);
}

/** CANCELAR (contratos.js, C1): x is the lane, arg the position; the cost comes back in full. */
export function comandoCancelar(sim, c, unidades) {
  const i = unidades[0];
  if (i === undefined || (c.x !== FAIXA.UNIDADES && c.x !== FAIXA.CONSTRUCAO)) return;
  const f = sim.extras.producao;
  if (c.arg < 0 || c.arg >= f.n[2 * i + c.x]) return;
  reembolsar(sim, c.jogador, custoDe(sim, retirarDaFaixa(sim, i, c.x, c.arg)));
}

/** PONTO_DE_ENCONTRO (contratos.js, C1). */
export function comandoPontoDeEncontro(sim, c, unidades) {
  const { largura, altura } = sim.mapa;
  const alvo = slotVivo(sim, c.alvo);
  const limpar = c.x === -1 && c.y === -1 && alvo < 0;
  if (!limpar && alvo < 0 && (c.x < 0 || c.y < 0 || c.x >= largura * FP || c.y >= altura * FP)) return;
  for (const i of unidades) {
    if (sim.categoriaPorTipo[sim.tipo[i]] !== CATEGORIA.PREDIO) continue;
    sim.encontroX[i] = limpar ? -1 : alvo >= 0 ? sim.x[alvo] : c.x;
    sim.encontroY[i] = limpar ? -1 : alvo >= 0 ? sim.y[alvo] : c.y;
    sim.encontroAlvo[i] = alvo >= 0 ? c.alvo : -1;
  }
}

// ---------- each tick ----------

/** Population per player: live units plus unit heads already in production. */
export function lotacaoUsada(sim) {
  const usada = new Int32Array(sim.times);
  const f = sim.extras.producao;
  for (let i = 0; i < sim.capacidade; i++) {
    if (!sim.ativo[i] || sim.time[i] >= sim.times) continue;
    if (sim.categoriaPorTipo[sim.tipo[i]] === CATEGORIA.UNIDADE) usada[sim.time[i]] += sim.tipos[sim.tipo[i]].lotacao;
    const b = 2 * i + FAIXA.UNIDADES;
    const item = f.itens[b * MAX_FILA];
    if (f.n[b] > 0 && f.feito[b] > 0 && !ehPesquisa(item)) usada[sim.time[i]] += sim.tipos[item].lotacao;
  }
  return usada;
}

// lotacaoUsada() from the tick's lists: the units' sum made by classificarEntidades plus the heads in production.
function lotacaoNoPasso(sim) {
  const usada = sim.listas.lotacaoUnidades.slice();
  const f = sim.extras.producao;
  const { itens, n } = sim.listas.predios;
  for (let k = 0; k < n; k++) {
    const i = itens[k];
    if (!sim.ativo[i] || sim.time[i] >= sim.times) continue;
    const b = 2 * i + FAIXA.UNIDADES;
    const item = f.itens[b * MAX_FILA];
    if (f.n[b] > 0 && f.feito[b] > 0 && !ehPesquisa(item)) usada[sim.time[i]] += sim.tipos[item].lotacao;
  }
  return usada;
}

/** Every producer's heads advance, in slot order; finished items come out. */
export function avancarProducao(sim) {
  const f = sim.extras.producao;
  const { itens, n } = sim.listas.predios;
  if (n === 0) return;
  const usada = lotacaoNoPasso(sim);
  const teto = sim.regras.tetoLotacao;
  const lento = sim.economia.producaoForaDaRede;
  for (let k = 0; k < n; k++) {
    const i = itens[k];
    if (!sim.ativo[i] || (f.n[2 * i] === 0 && f.n[2 * i + 1] === 0) || !predioPronto(sim, i)) continue;
    const jogador = sim.time[i];
    const ritmo = predioFuncionando(sim, i) ? RITMO : Math.trunc((RITMO * lento) / 100);
    for (let faixa = 0; faixa < 2; faixa++) {
      const b = 2 * i + faixa;
      if (f.n[b] === 0) {
        f.estado[b] = FAIXA_ESTADO.VAZIA;
        continue;
      }
      if (f.estado[b] === FAIXA_ESTADO.PRONTO) continue;
      const item = f.itens[b * MAX_FILA];
      if (!requisitosAtendidos(sim, jogador, item)) {
        f.estado[b] = FAIXA_ESTADO.ESPERA_REQUISITO;
        continue;
      }
      const unidade = !ehPesquisa(item) && sim.categoriaPorTipo[item] === CATEGORIA.UNIDADE;
      if (unidade && f.feito[b] === 0) {
        const pontos = sim.tipos[item].lotacao;
        if (usada[jogador] + pontos > teto) {
          f.estado[b] = FAIXA_ESTADO.ESPERA_LOTACAO;
          if (!f.avisado[b]) recusar(sim, { x: sim.x[i], y: sim.y[i], jogador, tipo: TIPO_COMANDO.PRODUZIR }, i, MOTIVO.LOTACAO_CHEIA);
          f.avisado[b] = 1;
          continue;
        }
        usada[jogador] += pontos;
      }
      f.avisado[b] = 0;
      f.estado[b] = FAIXA_ESTADO.PRODUZINDO;
      const total = tempoDe(sim, item) * RITMO;
      f.feito[b] = Math.min(total, f.feito[b] + Math.max(1, ritmo));
      if (f.feito[b] < total) continue;
      concluirItem(sim, i, faixa, item);
    }
  }
}

// A head that reached its time: a unit comes out, a building waits to be placed, a research takes effect.
function concluirItem(sim, i, faixa, item) {
  const f = sim.extras.producao;
  const b = 2 * i + faixa;
  const jogador = sim.time[i];
  if (ehPesquisa(item)) {
    concluirPesquisa(sim, jogador, item - ITEM_PESQUISA);
    emitirEvento(sim, EVENTO.PRODUCAO_CONCLUIDA, i, -1, item);
    retirarDaFaixa(sim, i, faixa, 0);
    return;
  }
  if (sim.categoriaPorTipo[item] === CATEGORIA.PREDIO) {
    f.estado[b] = FAIXA_ESTADO.PRONTO;
    emitirEvento(sim, EVENTO.PREDIO_PRONTO, i, -1, item);
    return;
  }
  const nova = sairDoPredio(sim, i, item);
  // no free cell or slot: the head stays done and tries again next tick
  if (nova < 0) return;
  retirarDaFaixa(sim, i, faixa, 0);
  emitirEvento(sim, EVENTO.PRODUCAO_CONCLUIDA, nova, i, item);
  irAoEncontro(sim, i, nova);
}

// A new unit at the free cell nearest to the middle of the row under the producer's footprint, facing south.
function sairDoPredio(sim, i, item) {
  const [pl, pa] = sim.tipos[sim.tipo[i]].pegada;
  const cx = cantoDaPegada(sim.x[i], pl) + (pl >> 1);
  const cy = cantoDaPegada(sim.y[i], pa) + pa;
  const celula = celulaLivreMaisProxima(sim.grade, cx, cy);
  if (celula < 0) return -1;
  const { largura } = sim.grade;
  return criarEntidade(sim, item, sim.time[i], (celula % largura) * FP + (FP >> 1), Math.trunc(celula / largura) * FP + (FP >> 1), 64);
}

// A new unit heads for its producer's rally point; a harvester goes harvesting (at the rally pile's node, if any).
function irAoEncontro(sim, produtor, i) {
  const alvo = slotVivo(sim, sim.encontroAlvo[produtor]);
  if (sim.coletorPorTipo[sim.tipo[i]]) {
    iniciarColeta(sim, i, alvo >= 0 && sim.categoriaPorTipo[sim.tipo[alvo]] === CATEGORIA.RECURSO ? sim.no[alvo] : -1);
    return;
  }
  const x = alvo >= 0 ? sim.x[alvo] : sim.encontroX[produtor];
  const y = alvo >= 0 ? sim.y[alvo] : sim.encontroY[produtor];
  if (x < 0 || y < 0) return;
  atribuirOrdem(sim, i, ordemCompartilhada(sim, TIPO_COMANDO.MOVER, x, y, classesDe(sim, [i])), x, y, 0);
}

/** Records of the local player's producers for the snapshot (contratos.js, Retrato.filas), plus `lido`'s (a building
 * the player is reading with an ability). */
export function registrosDeFila(sim, jogador, montar, lido = -1) {
  const f = sim.extras.producao;
  for (let i = 0; i < sim.capacidade; i++) {
    if (!sim.ativo[i] || (sim.time[i] !== jogador && i !== lido) || sim.categoriaPorTipo[sim.tipo[i]] !== CATEGORIA.PREDIO) continue;
    const t = sim.tipos[sim.tipo[i]];
    if (t.produz.length === 0 && t.constroi.length === 0 && !sim.pesquisas.some(p => p.predio === sim.tipo[i])) continue;
    const faixas = [0, 1].map(faixa => {
      const b = 2 * i + faixa;
      const item = f.itens[b * MAX_FILA];
      const total = f.n[b] > 0 ? tempoDe(sim, item) * RITMO : 1;
      return { estado: f.estado[b], progresso: f.n[b] > 0 ? Math.trunc((f.feito[b] * 1000) / total) : 0, n: f.n[b], itens: f.itens.subarray(b * MAX_FILA, (b + 1) * MAX_FILA) };
    });
    montar(i, faixas);
  }
}

