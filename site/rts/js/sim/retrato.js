// Builds the per-tick snapshot (contratos.js, C2) and the static map message from the simulation state.
// Runs in the worker after each step; everything it returns is freshly allocated, so it can be transferred.
import { VERSAO_SIMULACAO, SEM_ENTIDADE, FP_BITS, CATEGORIA, MAX_FILA, TAMANHO_REGISTRO_FILA, TAMANHO_FAIXA, FL_PRODUTOR, FL_ENCONTRO_X, FL_ENCONTRO_Y, FL_ENCONTRO_ALVO, FL_FAIXAS, FX_ESTADO, FX_PROGRESSO, FX_N, FX_ITENS, alocarCamposRetrato, idDe } from './contratos.js';
import { visaoDoTime } from './neblina.js';
import { tipoEstatico } from './dados.js';
import { bandeirasDe } from './bandeiras.js';
import { trabalhoDaObra } from './pegadas.js';
import { ocupacaoDosNos } from './economia.js';
import { lotacaoUsada, registrosDeFila } from './producao.js';
import { fantasmasDoTime } from './fantasmas.js';

const vazia = n => new Uint8Array(n);

/** Static part of the match: terrain, bases, players and kinds. Sent once. */
export function montarMapaEstatico(sim, jogadorLocal) {
  const { mapa } = sim;
  const celulas = mapa.largura * mapa.altura;
  return {
    t: 'pronto',
    versao: VERSAO_SIMULACAO,
    largura: mapa.largura,
    altura: mapa.altura,
    bloqueado: mapa.bloqueado.slice(),
    relevo: mapa.relevo.slice(),
    nivel: mapa.nivel.slice(),
    ventosa: mapa.ventosa ? mapa.ventosa.slice() : vazia(celulas),
    cobertura: mapa.cobertura ? mapa.cobertura.slice() : vazia(celulas),
    solo: mapa.solo ? mapa.solo.slice() : vazia(celulas),
    decoracao: mapa.decoracao ? mapa.decoracao.slice() : vazia(celulas),
    bases: mapa.bases.map(base => ({ ...base })),
    jogadorLocal,
    jogadores: Array.from({ length: sim.times }, (_, jogador) => ({ jogador, time: jogador, faccao: sim.faccoes?.[jogador] ?? '' })),
    tipos: sim.tipos.map(tipoEstatico),
    pesquisas: (sim.pesquisas ?? []).map(p => ({ nome: p.nome, predio: p.predio, custo: p.custo, tempo: p.tempo })),
    nos: (mapa.nos ?? []).map(no => ({ x: no.x, y: no.y })),
    solos: (mapa.solos ?? []).slice(),
    decoracoes: (mapa.decoracoes ?? []).slice(),
    economia: {
      lotacaoMaxima: sim.regras.tetoLotacao,
      saturacao: sim.economia.saturacao,
      distanciaMinimaPilha: sim.economia.distanciaMinimaPilha,
      faiscaCarga: sim.economia.faiscaCarga,
      duracaoFaisca: sim.economia.duracaoFaisca,
      intervaloRajada: sim.economia.intervaloRajada,
      avisoRajada: sim.economia.avisoRajada,
      loteRajada: sim.economia.loteRajada,
      reciclarPorcento: sim.economia.reciclarPorcento,
    },
  };
}

/** Fills slot i's entry k of per-entity snapshot arrays (CAMPOS_RETRATO); `ocupacao` per node, from ocupacaoDosNos. */
export function copiarEntidade(sim, i, r, k, ocupacao = null) {
  const { largura, nivel } = sim.mapa;
  const maximo = sim.tipos[sim.tipo[i]].vida;
  const alvo = sim.alvo[i];
  r.id[k] = idDe(i, sim.geracao[i]);
  r.tipo[k] = sim.tipo[i];
  r.dono[k] = sim.time[i];
  r.x[k] = sim.x[i];
  r.y[k] = sim.y[i];
  r.nivel[k] = nivel[(sim.y[i] >> FP_BITS) * largura + (sim.x[i] >> FP_BITS)];
  r.dirCorpo[k] = sim.dirCorpo[i];
  r.dirTorre[k] = sim.dirTorre[i];
  r.vida[k] = Math.max(1, Math.min(255, Math.trunc((sim.vida[i] * 255) / maximo)));
  r.bandeiras[k] = bandeirasDe(sim, i);
  r.alvo[k] = alvo >= 0 ? idDe(alvo, sim.geracao[alvo]) : SEM_ENTIDADE;
  const tipo = sim.tipos[sim.tipo[i]];
  r.progresso[k] = sim.obra[i] > 0 ? Math.min(254, Math.trunc(((trabalhoDaObra(tipo) - sim.obra[i]) * 255) / trabalhoDaObra(tipo))) : 255;
  r.carga[k] = fracaoDeCarga(sim, i, tipo);
  r.ocupacao[k] = ocupacao && tipo.categoria === CATEGORIA.RECURSO && sim.no[i] >= 0 ? Math.min(255, ocupacao[sim.no[i]]) : 0;
  r.ligacao[k] = sim.ligacao[i] >= 0 ? idDe(sim.ligacao[i], sim.geracao[sim.ligacao[i]]) : SEM_ENTIDADE;
  r.veterania[k] = sim.veterania[i];
}

// Retrato.carga: a harvester's load of its capacity, a pile's Carga of its start, a spark's life left; 0..255.
function fracaoDeCarga(sim, i, tipo) {
  if (tipo.coletor) return tipo.capacidade > 0 ? Math.min(255, Math.trunc((sim.carga[i] * 255) / tipo.capacidade)) : 0;
  if (tipo.categoria === CATEGORIA.RECURSO) return sim.cargaMaxima[i] > 0 ? Math.min(255, Math.trunc((sim.carga[i] * 255) / sim.cargaMaxima[i])) : 0;
  if (tipo.categoria === CATEGORIA.FAISCA) return Math.max(0, Math.min(255, Math.trunc(((sim.expiraEm[i] - sim.tick) * 255) / Math.max(1, sim.economia.duracaoFaisca))));
  return 0;
}

/** Retrato.lotacao or VistaDoTime.lotacao: [used, cap] per player, only the players `incluir` accepts filled. */
export function montarLotacao(sim, incluir = () => true) {
  const usada = lotacaoUsada(sim);
  const lotacao = new Int32Array(2 * sim.times);
  for (let j = 0; j < sim.times; j++) {
    if (!incluir(j)) continue;
    lotacao[2 * j] = usada[j];
    lotacao[2 * j + 1] = sim.regras.tetoLotacao;
  }
  return lotacao;
}

/** Retrato.filas of one player's producers (contratos.js, FL_* and FX_* offsets). */
export function montarFilas(sim, jogador) {
  const registros = [];
  registrosDeFila(sim, jogador, (i, faixas) => {
    const r = new Int32Array(TAMANHO_REGISTRO_FILA).fill(-1);
    r[FL_PRODUTOR] = idDe(i, sim.geracao[i]);
    r[FL_ENCONTRO_X] = sim.encontroX[i];
    r[FL_ENCONTRO_Y] = sim.encontroY[i];
    r[FL_ENCONTRO_ALVO] = sim.encontroAlvo[i];
    faixas.forEach((f, faixa) => {
      const base = FL_FAIXAS + faixa * TAMANHO_FAIXA;
      r[base + FX_ESTADO] = f.estado;
      r[base + FX_PROGRESSO] = f.progresso;
      r[base + FX_N] = f.n;
      for (let k = 0; k < MAX_FILA; k++) r[base + FX_ITENS + k] = f.itens[k];
    });
    registros.push(r);
  });
  const filas = new Int32Array(registros.length * TAMANHO_REGISTRO_FILA);
  registros.forEach((r, k) => filas.set(r, k * TAMANHO_REGISTRO_FILA));
  return filas;
}

/** Snapshot of every live entity in slot order, the local team's fog and ghosts, the economy and this tick's events. */
export function montarRetrato(sim, { msPasso = 0, soma = 0, tickSoma = 0, jogadorLocal = 0 } = {}) {
  let n = 0;
  for (let i = 0; i < sim.capacidade; i++) if (sim.ativo[i]) n++;
  const r = alocarCamposRetrato(n);
  const ocupacao = ocupacaoDosNos(sim);
  let k = 0;
  for (let i = 0; i < sim.capacidade; i++) {
    if (!sim.ativo[i]) continue;
    copiarEntidade(sim, i, r, k, ocupacao);
    k++;
  }
  return {
    t: 'retrato',
    versao: VERSAO_SIMULACAO,
    tick: sim.tick,
    msPasso,
    soma,
    tickSoma,
    n,
    ...r,
    visao: visaoDoTime(sim, jogadorLocal),
    recursos: sim.extras.economia.carga.slice(),
    lotacao: montarLotacao(sim),
    filas: montarFilas(sim, jogadorLocal),
    fantasmas: fantasmasDoTime(sim, jogadorLocal),
    proximaRajada: sim.extras.economia.rajada[1],
    eventos: Int32Array.from(sim.eventos),
  };
}
