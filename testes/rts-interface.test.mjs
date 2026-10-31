// HUD rules of the RTS that do not need a browser: the command card, alerts from events, texts by id (C11), the
// catalog of kinds, what the HUD reads from a snapshot, building placement, the end of the match and sound distance.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { ACAO } from '../site/rts/js/entrada/teclas.js';
import { montarCartao, TECLAS_DA_GRADE, MAXIMO_DA_FILA } from '../site/rts/js/interface/cartao.js';
import { criarCatalogo, catalogoDoMapa, nomeDoId, habilidadeDoC5, HABILIDADE, BANDEIRA_CESTO_ERGUIDO } from '../site/rts/js/interface/catalogo.js';
import { criarAlertas, ALERTA, RAIO_DO_ATAQUE, SILENCIO_DO_ATAQUE_MS } from '../site/rts/js/interface/alertas.js';
import { criarTextos, PROVISORIOS, achatar } from '../site/rts/js/interface/textos.js';
import { criarLeitura, lerFilas, TETO_PADRAO } from '../site/rts/js/interface/leitura.js';
import { cantoDaPegada, criarColocacao, areaDaRede } from '../site/rts/js/entrada/colocacao.js';
import { MOTIVOS, RAZAO_DO_MOTIVO } from '../site/rts/js/interface/comandos.js';
import { resultadoDosEventos, nomeDoArquivo } from '../site/rts/js/interface/fim.js';
import { volumePelaDistancia, ALCANCE_DO_SOM } from '../site/rts/js/interface/som-da-partida.js';
import { relogio } from '../site/rts/js/interface/hud.js';
import { criarIndice } from '../site/rts/js/entrada/indice.js';
import { aplicarObjetivos, ESTADO_DO_OBJETIVO } from '../site/rts/js/interface/objetivos.js';
import { criarOrdens, MAXIMO_POR_COMANDO } from '../site/rts/js/entrada/ordens.js';
import {
  EVENTO, TAMANHO_EVENTO, FP, BANDEIRA, CATEGORIA, MOTIVO, FAIXA, FAIXA_ESTADO, ITEM_PESQUISA, SEM_ENTIDADE,
  FL_PRODUTOR, FL_ENCONTRO_X, FL_ENCONTRO_Y, FL_ENCONTRO_ALVO, FL_FAIXAS, FX_ESTADO, FX_PROGRESSO, FX_N, FX_ITENS, TAMANHO_FAIXA, TAMANHO_REGISTRO_FILA,
} from '../site/rts/js/sim/contratos.js';

// Kinds of a small sandbox as the worker sends them (MapaEstatico.tipos): 0 harvester, 1 rifleman, 2 support that
// raises the forward post, 3 headquarters, 4 barracks, 5 pole, 6 forward post, 7 windmill, 8 battery pile.
const tipoEstatico = t => ({ categoria: CATEGORIA.UNIDADE, pegada: [1, 1], custo: 0, tempo: 0, lotacao: 0, produz: [], constroi: [], ergue: [], raioRede: 0, raizRede: 0, precisaRede: 0, exigeVentosa: 0, filaConstrucao: 0, coletor: 0, ...t });
const MAPA = {
  tipos: [
    tipoEstatico({ nome: 'guincho', custo: 300, lotacao: 2, coletor: 1 }),
    tipoEstatico({ nome: 'turma-de-linha', custo: 100, lotacao: 1 }),
    tipoEstatico({ nome: 'equipe-de-manutencao', custo: 350, lotacao: 2, ergue: [6] }),
    tipoEstatico({ nome: 'escritorio-regional', categoria: CATEGORIA.PREDIO, pegada: [3, 3], produz: [0, 2], constroi: [4, 5, 7], filaConstrucao: 1, raioRede: 8, raizRede: 1 }),
    tipoEstatico({ nome: 'quartel', categoria: CATEGORIA.PREDIO, custo: 500, pegada: [2, 2], produz: [1], precisaRede: 1 }),
    tipoEstatico({ nome: 'poste', categoria: CATEGORIA.PREDIO, custo: 50, raioRede: 6 }),
    tipoEstatico({ nome: 'poste-avancado', categoria: CATEGORIA.PREDIO, custo: 1000, pegada: [2, 2], raioRede: 6, raizRede: 1 }),
    tipoEstatico({ nome: 'cata-vento', categoria: CATEGORIA.PREDIO, custo: 400, pegada: [1, 1], exigeVentosa: 1 }),
    tipoEstatico({ nome: 'pilha', categoria: CATEGORIA.RECURSO, pegada: [2, 2] }),
  ],
  pesquisas: [{ nome: 'isolamento', predio: 4, custo: 600, tempo: 900 }],
};
const textoComNomes = criarTextos({ textos: { 'unidade.turma-de-linha.nome': 'Turma de Linha', 'predio.quartel.nome': 'Quartel', 'pesquisa.isolamento.nome': 'Isolamento' } });
const catalogo = catalogoDoMapa(MAPA, textoComNomes);

function evento(tipo, entidade, { alvo = -1, x = 0, y = 0, alvoX = x, alvoY = y, arg = 0 } = {}) {
  return [tipo, 0, entidade, alvo, x * FP, y * FP, alvoX * FP, alvoY * FP, arg];
}
const eventos = (...lista) => Int32Array.from(lista.flat());

test('the catalog reads the worker\'s kinds, names them from C11 or the id, and tells units, buildings and resources apart', () => {
  assert.equal(catalogo.nome(1), 'Turma de Linha');
  assert.equal(catalogo.nome(4), 'Quartel');
  assert.equal(catalogo.nome(0), 'Guincho');
  assert.equal(nomeDoId('escritorio-regional'), 'Escritorio regional');
  assert.ok(catalogo.ehUnidade(0) && catalogo.ehColetor(0) && catalogo.ehUnidade(1) && !catalogo.ehColetor(1));
  assert.ok(catalogo.ehPredio(3) && catalogo.ehQG(3) && !catalogo.ehQG(4));
  assert.ok(catalogo.ehRecurso(8) && !catalogo.ehUnidade(8));
  assert.deepEqual(catalogo.pesquisasDe(4).map(p => p.indice), [0]);
  assert.equal(catalogo.nomeDoItem(ITEM_PESQUISA + 0), 'Isolamento');
  assert.equal(catalogo.nomeDoItem(1), 'Turma de Linha');
  assert.equal(criarCatalogo([]).nome(3), '?');
});

test('units get the orders in fixed places of the grid, and nothing selected gets an empty card', () => {
  const cartao = montarCartao({ selecao: [{ id: 10, tipo: 1 }, { id: 11, tipo: 4 }], catalogo, producao: () => null, carga: 0, lotacao: { usada: 0, teto: 60 } });
  assert.equal(cartao.tipo, 'unidades');
  const porTecla = Object.fromEntries(cartao.slots.map((s, i) => [TECLAS_DA_GRADE[i], s?.acao ?? null]));
  assert.deepEqual(porTecla, { KeyQ: ACAO.MOVER, KeyW: null, KeyE: null, KeyR: ACAO.PATRULHAR, KeyA: ACAO.ATACAR_MOVENDO, KeyS: ACAO.PARAR, KeyD: ACAO.SEGURAR, KeyF: null });
  // A unit that raises buildings on site offers them in the free places, and is who the command goes to.
  const comSuporte = montarCartao({ selecao: [{ id: 10, tipo: 1 }, { id: 12, tipo: 2 }], catalogo, producao: () => null, carga: 2000, lotacao: { usada: 0, teto: 60 } });
  assert.deepEqual([comSuporte.slots[1].modo, comSuporte.slots[1].tipo, comSuporte.slots[1].custo], ['erguer', 6, 1000]);
  assert.deepEqual(comSuporte.construtores, [12]);
  assert.equal(montarCartao({ selecao: [], catalogo, producao: () => null, carga: 0, lotacao: { usada: 0, teto: 60 } }).slots.filter(Boolean).length, 0);
});

const item = (valor, progresso = 0) => ({ item: valor, tipo: valor >= ITEM_PESQUISA ? -1 : valor, pesquisa: valor >= ITEM_PESQUISA ? valor - ITEM_PESQUISA : -1, progresso });
const semFila = { fila: [], obras: [], obra: null, pronto: -1 };

test('abilities come from the C5 entry and take the free places of the unit card, the toggle showing its state', () => {
  assert.equal(habilidadeDoC5({ religa: 1 }).codigo, HABILIDADE.RELIGAR);
  assert.equal(habilidadeDoC5({ habilidade: { tipo: 'erguer' } }).codigo, HABILIDADE.CESTO);
  assert.equal(habilidadeDoC5({ habilidade: { tipo: 'leitura' } }).alvo, 'predio');
  assert.equal(habilidadeDoC5({ habilidade: { tipo: 'tocaia' } }), null, 'the enemy\'s abilities are not the player\'s');
  const mapa = { tipos: [tipoEstatico({ nome: 'cesto-blindado' }), tipoEstatico({ nome: 'religador' }), tipoEstatico({ nome: 'equipe-de-manutencao', ergue: [3] }), tipoEstatico({ nome: 'poste-avancado', categoria: CATEGORIA.PREDIO, custo: 1000 })] };
  const comHabilidades = catalogoDoMapa(mapa, textoComNomes, [{ nome: 'cesto-blindado', habilidade: { tipo: 'erguer' } }, { nome: 'religador', religa: 1 }]);
  const selecao = [{ id: 1, tipo: 0, bandeiras: BANDEIRA_CESTO_ERGUIDO }, { id: 2, tipo: 0 }, { id: 3, tipo: 1 }, { id: 4, tipo: 2 }];
  const cartao = montarCartao({ selecao, catalogo: comHabilidades, producao: () => null, carga: 2000, lotacao: { usada: 0, teto: 60 } });
  assert.deepEqual([1, 2, 7].map(i => cartao.slots[i] && [cartao.slots[i].modo, cartao.slots[i].habilidade?.codigo ?? cartao.slots[i].tipo]), [['erguer', 3], ['habilidade', HABILIDADE.CESTO], ['habilidade', HABILIDADE.RELIGAR]]);
  assert.deepEqual(cartao.slots[2].unidades, [1, 2]);
  assert.equal(cartao.slots[2].texto, 'comando.baixar_cesto', 'the first basket is raised: the button lowers');
  assert.equal(cartao.slots[7].texto, 'comando.religar');
});

test('a building card trains and researches in data order, counts its queues and says when Carga or population is short', () => {
  const filas = { 20: { ...semFila, fila: [item(1, 0.5), item(1), item(ITEM_PESQUISA)] }, 21: semFila };
  const producao = id => filas[id] ?? null;
  const entrada = { selecao: [{ id: 20, tipo: 4 }, { id: 21, tipo: 4 }], catalogo, producao, carga: 1000, lotacao: { usada: 10, teto: 60 } };
  const cartao = montarCartao(entrada);
  assert.equal(cartao.tipo, 'predio');
  assert.deepEqual(cartao.predios, [20, 21]);
  assert.deepEqual({ ...cartao.slots[0] }, { slot: 0, tipo: 1, modo: 'produzir', custo: 100, quantidade: 2, progresso: 0.5, falta: null });
  assert.deepEqual([cartao.slots[1].modo, cartao.slots[1].pesquisa, cartao.slots[1].quantidade], ['pesquisar', 0, 1]);
  assert.equal(montarCartao({ ...entrada, carga: 50 }).slots[0].falta, 'carga');
  assert.equal(montarCartao({ ...entrada, lotacao: { usada: 60, teto: 60 } }).slots[0].falta, 'lotacao');
  const cheias = { ...semFila, fila: new Array(MAXIMO_DA_FILA).fill(item(1)) };
  assert.equal(montarCartao({ ...entrada, producao: () => cheias }).slots[0].falta, 'fila');
});

test('the headquarters queues buildings in its construction lane, trains, and offers to place the one that is ready', () => {
  const base = { selecao: [{ id: 30, tipo: 3 }], catalogo, carga: 1000, lotacao: { usada: 0, teto: 60 } };
  const livre = montarCartao({ ...base, producao: () => semFila });
  assert.deepEqual(livre.slots.slice(0, 6).map(s => s && [s.tipo, s.modo]), [[4, 'construir'], [5, 'construir'], [7, 'construir'], [0, 'produzir'], [2, 'produzir'], null]);
  assert.equal(livre.paginas, 1);
  const emObra = montarCartao({ ...base, producao: () => ({ ...semFila, obras: [item(4, 0.25), item(5)], obra: { tipo: 4, progresso: 0.25 } }) });
  assert.deepEqual([emObra.slots[0].progresso, emObra.slots[0].quantidade, emObra.slots[1].quantidade, emObra.slots[1].progresso], [0.25, 1, 1, -1]);
  const pronto = montarCartao({ ...base, producao: () => ({ ...semFila, obras: [item(5, 1)], pronto: 5 }) });
  assert.equal(pronto.slots[1].modo, 'posicionar');
  assert.equal(pronto.slots[0].modo, 'construir');
  const cheia = montarCartao({ ...base, producao: () => ({ ...semFila, obras: new Array(MAXIMO_DA_FILA).fill(item(5)) }) });
  assert.equal(cheia.slots[0].falta, 'fila');
});

test('more items than the grid holds go in pages turned by F, which lights up when a building waits on another page', () => {
  const tipos = MAPA.tipos.map((t, k) => (k === 3 ? { ...t, constroi: [4, 5, 6, 7, 8, 4, 5], produz: [0, 2] } : t));
  const cat = catalogoDoMapa({ ...MAPA, tipos }, textoComNomes);
  const base = { selecao: [{ id: 30, tipo: 3 }], catalogo: cat, carga: 5000, lotacao: { usada: 0, teto: 60 } };
  const um = montarCartao({ ...base, producao: () => semFila });
  assert.equal(um.paginas, 2);
  assert.deepEqual([um.slots[7].modo, um.slots[7].pagina], ['pagina', 0]);
  assert.equal(um.slots.slice(0, 7).filter(Boolean).length, 7);
  const dois = montarCartao({ ...base, producao: () => semFila, pagina: 1 });
  assert.deepEqual(dois.slots.slice(0, 3).map(s => s && s.tipo), [0, 2, null], 'the units on the second page');
  assert.equal(montarCartao({ ...base, producao: () => semFila, pagina: 2 }).pagina, 0, 'turning past the last page comes back to the first');
  const prontoNaOutra = montarCartao({ ...base, producao: () => ({ ...semFila, obras: [item(4, 1)], pronto: 4 }), pagina: 1 });
  assert.equal(prontoNaOutra.slots[7].pronto, true);
});

test('attacks on the player raise one alert per place while the fight goes on, by what was hit', () => {
  const dono = { 1: 0, 2: 0, 3: 0, 9: 1 };
  // 1 a rifleman, 2 the headquarters, 3 a harvester, 9 an enemy rifleman
  const tipo = { 1: 1, 2: 3, 3: 0, 9: 1 };
  const alertas = criarAlertas({ jogador: 0, donoDe: id => dono[id] ?? -1, tipoDe: id => tipo[id] ?? -1, categoria: catalogo.categoria });
  // Before the simulation sends SOB_ATAQUE, an enemy shot at the player's unit stands in for it.
  let novos = alertas.registrar(eventos(evento(EVENTO.TIRO, 9, { alvo: 1, x: 50, y: 50, alvoX: 40, alvoY: 40 })), 0);
  assert.deepEqual(novos.map(a => a.tipo), [ALERTA.SOB_ATAQUE]);
  novos = alertas.registrar(eventos(evento(EVENTO.TIRO, 9, { alvo: 1, x: 50, y: 50, alvoX: 41, alvoY: 40 })), 1000);
  assert.equal(novos.length, 0, 'the same fight does not alert again');
  novos = alertas.registrar(eventos(evento(EVENTO.SOB_ATAQUE, 2, { x: 40 + RAIO_DO_ATAQUE + 5, y: 40 })), 2000);
  assert.deepEqual(novos.map(a => a.tipo), [ALERTA.BASE_SOB_ATAQUE]);
  // Once SOB_ATAQUE exists, shots no longer count.
  assert.equal(alertas.registrar(eventos(evento(EVENTO.TIRO, 9, { alvo: 3, x: 0, y: 0, alvoX: 100, alvoY: 100 })), 2500).length, 0);
  assert.deepEqual(alertas.registrar(eventos(evento(EVENTO.SOB_ATAQUE, 3, { x: 100, y: 100 })), 3000).map(a => a.tipo), [ALERTA.COLETOR_SOB_ATAQUE]);
  assert.equal(alertas.ultimo.x, 100);
  assert.equal(alertas.ataquesAtivos(3000).length, 3);
  assert.equal(alertas.registrar(eventos(evento(EVENTO.SOB_ATAQUE, 1, { x: 40, y: 40 })), 1000 + SILENCIO_DO_ATAQUE_MS + 1).length, 1, 'after the silence the same place alerts again');
  assert.equal(alertas.registrar(eventos(evento(EVENTO.SOB_ATAQUE, 9, { x: 5, y: 5 })), 30000).length, 0, 'enemy losses are not the player\'s alerts');
});

test('refusals, ready buildings, power loss, gusts and attack warnings become alerts for the player', () => {
  const alertas = criarAlertas({ jogador: 0, donoDe: id => (id === 5 ? 0 : 1), tipoDe: () => 3, categoria: catalogo.categoria });
  const novos = alertas.registrar(eventos(
    evento(EVENTO.COMANDO_RECUSADO, 5, { alvoX: 0, alvoY: 8, arg: MOTIVO.SEM_CARGA }),
    evento(EVENTO.COMANDO_RECUSADO, 9, { alvoX: 1, alvoY: 8, arg: MOTIVO.SEM_CARGA }),
    evento(EVENTO.PREDIO_PRONTO, 5, { arg: 5 }),
    evento(EVENTO.REDE_CORTADA, 5, { arg: 4 }),
    evento(EVENTO.RAJADA_ANUNCIADA, -1, { arg: 300 }),
    evento(EVENTO.AVISO_ATAQUE, -1, { x: 60, y: 20 }),
  ), 0);
  assert.deepEqual(novos.map(a => [a.tipo, a.arg]), [[ALERTA.RECUSA, MOTIVO.SEM_CARGA], [ALERTA.PREDIO_PRONTO, 5], [ALERTA.SEM_ENERGIA, 4], [ALERTA.RAJADA, 300], [ALERTA.AVISO_ATAQUE, 0]]);
  assert.deepEqual([alertas.ultimo.tipo, alertas.ultimo.x], [ALERTA.AVISO_ATAQUE, 60], 'a gust has no place to go to');
});

test('a lost harvester, a paid gust and one alert for a cut pole, and owners of the just-dead come from the snapshot before', () => {
  const indice = criarIndice();
  const retrato = ids => ({ n: ids.length, id: Int32Array.from(ids), dono: Uint8Array.from(ids.map(id => (id === 9 ? 1 : 0))), tipo: Uint16Array.from(ids.map(id => (id === 3 ? 0 : 4))), x: new Int32Array(ids.length), y: new Int32Array(ids.length), bandeiras: new Uint16Array(ids.length) });
  indice.atualizar(retrato([3, 5, 6, 9]));
  indice.atualizar(retrato([5, 6, 9]));
  assert.equal(indice.dono(3), -1);
  assert.equal(indice.donoRecente(3), 0, 'the harvester died in these ticks');
  assert.equal(indice.tipoRecente(3), 0);
  const alertas = criarAlertas({ jogador: 0, donoDe: indice.donoRecente, tipoDe: indice.tipoRecente, categoria: catalogo.categoria });
  const novos = alertas.registrar(eventos(
    evento(EVENTO.CARGA_DERRAMADA, 3, { x: 30, y: 30, arg: 100 }),
    evento(EVENTO.RAJADA, 5, { arg: 40 }),
    evento(EVENTO.RAJADA, 9, { arg: 40 }),
    evento(EVENTO.REDE_CORTADA, 5, { arg: 4 }),
    evento(EVENTO.REDE_CORTADA, 6, { arg: 4 }),
  ), 0);
  assert.deepEqual(novos.map(a => a.tipo), [ALERTA.COLETOR_PERDIDO, ALERTA.RAJADA_PAGA, ALERTA.SEM_ENERGIA]);
  assert.equal(alertas.registrar(eventos(evento(EVENTO.REDE_CORTADA, 6, { arg: 4 })), 9000).length, 1, 'after the silence it alerts again');
});

test('finished production and construction alert only for the player, with the kind made', () => {
  const alertas = criarAlertas({ jogador: 0, donoDe: id => (id === 5 ? 0 : 1), tipoDe: () => 4, categoria: catalogo.categoria });
  const novos = alertas.registrar(eventos(evento(EVENTO.PRODUCAO_CONCLUIDA, 5, { arg: 1, x: 10, y: 12 }), evento(EVENTO.CONSTRUCAO_CONCLUIDA, 6, { arg: 3 }), evento(EVENTO.RECURSO_ESGOTADO, 7, { x: 3, y: 4 })), 0);
  assert.deepEqual(novos.map(a => [a.tipo, a.arg]), [[ALERTA.PRODUCAO, 1], [ALERTA.RECURSO_ESGOTADO, 0]]);
  assert.deepEqual([novos[0].x, novos[0].y], [10, 12]);
});

test('texts come from the C11 file by id, nested or flat, with values, and a gap shows the id', () => {
  const texto = criarTextos({ versao: 1, idioma: 'pt-BR', textos: { 'hud.carga': 'Energia', alerta: { producao_concluida: '{nome} saiu' } } });
  assert.equal(texto('hud.carga'), 'Energia');
  assert.equal(texto('alerta.producao_concluida', { nome: 'Guincho' }), 'Guincho saiu');
  assert.equal(texto('hud.lotacao'), PROVISORIOS['hud.lotacao'], 'a missing id falls back to the provisional copy');
  assert.equal(texto('nao.existe'), 'nao.existe');
  assert.ok(texto.tem('hud.carga') && !texto.tem('nao.existe'));
  assert.deepEqual(achatar({ a: { b: 'x', c: 1 }, d: 'y' }), { 'a.b': 'x', d: 'y' });
});

test('every text id the interface asked for is in the C11 file once it exists', { skip: !existsSync(new URL('../site/rts/dados/textos/pt-BR.json', import.meta.url)) && 'C11 file not there yet' }, () => {
  const arquivo = JSON.parse(readFileSync(new URL('../site/rts/dados/textos/pt-BR.json', import.meta.url), 'utf8'));
  const ids = achatar(arquivo.textos ?? arquivo);
  const faltam = Object.keys(PROVISORIOS).filter(id => !(id in ids));
  assert.deepEqual(faltam, [], 'ask the design front for these ids');
});

// One Retrato.filas record: producer, rally point and the two lanes.
function registroDeFila(produtor, { encontro = [-1, -1, SEM_ENTIDADE], unidades = [FAIXA_ESTADO.VAZIA, 0, []], construcao = [FAIXA_ESTADO.VAZIA, 0, []] } = {}) {
  const r = new Array(TAMANHO_REGISTRO_FILA).fill(-1);
  r[FL_PRODUTOR] = produtor;
  [r[FL_ENCONTRO_X], r[FL_ENCONTRO_Y], r[FL_ENCONTRO_ALVO]] = encontro;
  for (const [faixa, [estado, progresso, itens]] of [[FAIXA.UNIDADES, unidades], [FAIXA.CONSTRUCAO, construcao]]) {
    const base = FL_FAIXAS + faixa * TAMANHO_FAIXA;
    r[base + FX_ESTADO] = estado;
    r[base + FX_PROGRESSO] = progresso;
    r[base + FX_N] = itens.length;
    itens.forEach((valor, k) => (r[base + FX_ITENS + k] = valor));
  }
  return r;
}

test('the HUD reads Carga, population, idle harvesters, queues by lane and rally points from a snapshot', () => {
  const leitura = criarLeitura({ catalogo: () => catalogo });
  const retrato = {
    n: 4,
    id: Int32Array.from([101, 102, 103, 104]),
    tipo: Uint16Array.from([0, 0, 3, 1]),
    dono: Uint8Array.from([0, 0, 0, 1]),
    bandeiras: Uint16Array.from([BANDEIRA.OCIOSA, BANDEIRA.COLETANDO, 0, BANDEIRA.OCIOSA]),
    recursos: Int32Array.from([1500, 900]),
    lotacao: Int32Array.from([7, 60, 3, 60]),
    filas: Int32Array.from([
      ...registroDeFila(103, { encontro: [20 * FP, 30 * FP, SEM_ENTIDADE], unidades: [FAIXA_ESTADO.ESPERA_LOTACAO, 250, [0, 0]], construcao: [FAIXA_ESTADO.PRONTO, 1000, [5, 4]] }),
    ]),
  };
  leitura.atualizar(retrato, 0);
  assert.equal(leitura.carga, 1500);
  assert.deepEqual({ ...leitura.lotacao }, { usada: 7, teto: 60 });
  assert.deepEqual([...leitura.ociosos], [101]);
  assert.equal(leitura.qg, 103);
  const p = leitura.producao(103);
  assert.deepEqual(p.fila.map(i => [i.tipo, i.progresso]), [[0, 0.25], [0, 0]]);
  assert.equal(p.estadoFila, FAIXA_ESTADO.ESPERA_LOTACAO);
  assert.deepEqual([p.pronto, p.obra, p.obras.length], [5, null, 2], 'the head waits to be placed');
  assert.deepEqual(p.encontro, { x: 20, y: 30, alvo: SEM_ENTIDADE });
  assert.equal(leitura.producao(104), null);
  const emObra = lerFilas(Int32Array.from(registroDeFila(7, { construcao: [FAIXA_ESTADO.PRODUZINDO, 500, [4, ITEM_PESQUISA]] }))).get(7);
  assert.deepEqual([emObra.obra, emObra.pronto, emObra.encontro], [{ tipo: 4, progresso: 0.5 }, -1, null]);
  assert.equal(emObra.obras[1].pesquisa, 0);
  leitura.atualizar({ ...retrato, lotacao: new Int32Array(0), filas: new Int32Array(0) }, 0);
  assert.deepEqual({ ...leitura.lotacao }, { usada: 0, teto: TETO_PADRAO });
});

test('placing follows the pointer cell by cell, redraws only on change, and the map rule refuses rock and units', () => {
  assert.deepEqual(cantoDaPegada(10.2, 10.9, 3, 3), { cx: 9, cy: 9 });
  assert.deepEqual(cantoDaPegada(10.6, 10.4, 2, 2), { cx: 10, cy: 9 });
  const desenhos = [];
  const colocacao = criarColocacao({ validar: (tipo, cx) => cx < 20, desenhar: f => desenhos.push(f) });
  colocacao.comecar(3, 30, 2, 2);
  assert.ok(colocacao.apontar(10.5, 10.5));
  assert.ok(!colocacao.apontar(10.6, 10.6), 'same cell, same answer: nothing to redraw');
  assert.ok(colocacao.apontar(25, 10));
  assert.equal(desenhos.at(-1).valido, false);
  colocacao.terminar();
  assert.equal(desenhos.at(-1), null);
  assert.ok(!colocacao.ativa);

});

test('the shaded building area is the powered network\'s reach, and every refusal reason has a text', () => {
  const largura = 24;
  const mapa = { largura, altura: 24 };
  // the headquarters (network root, radius 8) at (6, 6)
  const retrato = { n: 1, id: Int32Array.from([1]), tipo: Uint16Array.from([3]), dono: Uint8Array.from([0]), bandeiras: Uint16Array.from([BANDEIRA.ENERGIZADO]), x: Int32Array.from([6 * FP]), y: Int32Array.from([6 * FP]) };
  const area = areaDaRede(mapa, retrato, catalogo, 0);
  assert.equal(area[6 * largura + 13], 1);
  assert.equal(area[6 * largura + 15], 0, 'beyond the radius');
  assert.equal(areaDaRede(mapa, retrato, catalogo, 1), null, 'no network of that player');
  for (const codigo of Object.values(MOTIVO)) {
    const razao = RAZAO_DO_MOTIVO[codigo];
    assert.ok(razao && MOTIVOS[razao], `MOTIVO ${codigo} has no reason with a text`);
    assert.ok(PROVISORIOS[MOTIVOS[razao]], `${MOTIVOS[razao]} is not among the texts the interface asked for`);
  }
});

test('victory or defeat of the local player ends the match; the saved log has a dated name', () => {
  assert.equal(resultadoDosEventos(eventos(evento(EVENTO.TIRO, 1)), 0), null);
  assert.equal(resultadoDosEventos(eventos(evento(EVENTO.VITORIA, -1, { arg: 0 })), 0), 'vitoria');
  assert.equal(resultadoDosEventos(eventos(evento(EVENTO.DERROTA, -1, { arg: 0 })), 0), 'derrota');
  assert.equal(resultadoDosEventos(eventos(evento(EVENTO.VITORIA, -1, { arg: 1 })), 0), null, 'another player\'s victory');
  assert.equal(nomeDoArquivo(new Date(2026, 9, 31, 15, 7)), 'registro-rts-2026-10-31-1507.json');
});

test('sounds of the match fade with distance from the camera', () => {
  assert.equal(volumePelaDistancia(10, 10, 12, 12), 1);
  assert.equal(volumePelaDistancia(10 + ALCANCE_DO_SOM, 10, 10, 10), 0);
  const meio = volumePelaDistancia(10 + 24, 10, 10, 10);
  assert.ok(meio > 0 && meio < 1);
});

test('objectives follow OBJETIVO events: index times four plus the state', () => {
  const estados = [0, 0, 0];
  assert.ok(aplicarObjetivos(estados, eventos(evento(EVENTO.OBJETIVO, -1, { arg: 0 * 4 + ESTADO_DO_OBJETIVO.ATIVO }), evento(EVENTO.OBJETIVO, -1, { arg: 2 * 4 + ESTADO_DO_OBJETIVO.ATIVO }))));
  assert.deepEqual(estados, [1, 0, 1]);
  aplicarObjetivos(estados, eventos(evento(EVENTO.OBJETIVO, -1, { arg: 0 * 4 + ESTADO_DO_OBJETIVO.CUMPRIDO }), evento(EVENTO.OBJETIVO, -1, { arg: 9 * 4 + 1 })));
  assert.deepEqual(estados, [2, 0, 1], 'an index beyond the list is ignored');
  assert.ok(!aplicarObjetivos(estados, eventos(evento(EVENTO.TIRO, 1))));
});

test('a selection bigger than one command allows goes in parts, and building commands carry their fields', () => {
  const enviados = [];
  const nada = () => {};
  const ordens = criarOrdens({
    simulacao: { enviarComando: c => enviados.push(c) },
    estado: { mapa: { largura: 64, altura: 64 }, tick: 0 },
    efeitos: { adicionar: nada },
    fila: { ordenar: nada, limpar: nada },
    som: { tocar: nada },
    latencia: { anotar: nada },
  });
  const ids = Array.from({ length: MAXIMO_POR_COMANDO * 2 + 5 }, (_, k) => k + 1);
  ordens.deContexto(ids, { x: 10, y: 10 }, SEM_ENTIDADE, false, 0);
  assert.deepEqual(enviados.map(c => c.unidades.length), [MAXIMO_POR_COMANDO, MAXIMO_POR_COMANDO, 5]);
  enviados.length = 0;
  ordens.construir([7], 5, 3, 4, true, 0);
  ordens.cancelar(7, FAIXA.CONSTRUCAO, 2, 0);
  ordens.produzir([7, 8], 1, 2, 0);
  assert.deepEqual(enviados.map(c => [c.tipo, c.unidades, c.arg, c.x, c.y, c.fila]), [
    [7, [7], 5, 3 * FP + FP / 2, 4 * FP + FP / 2, 1],
    [9, [7], 2, FAIXA.CONSTRUCAO, 0, 0],
    [8, [7, 8], 1, 0, 0, 0],
    [8, [7, 8], 1, 0, 0, 0],
  ]);
});

test('the match clock reads game time from the tick', () => {
  assert.equal(relogio(0), '0:00');
  assert.equal(relogio(30 * 75), '1:15');
  assert.equal(relogio(30 * 3725), '1:02:05');
});

test('each record of the event fixture has the C3 size', () => {
  assert.equal(evento(EVENTO.TIRO, 1).length, TAMANHO_EVENTO);
});
