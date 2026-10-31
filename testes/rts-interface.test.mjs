// HUD rules of the RTS that do not need a browser: the command card, alerts from events, texts by id (C11), the
// catalog of kinds, what the HUD reads from a snapshot, building placement, the end of the match and sound distance.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { ACAO } from '../site/rts/js/entrada/teclas.js';
import { montarCartao, predioComMenorFila, TECLAS_DA_GRADE, MAXIMO_DA_FILA } from '../site/rts/js/interface/cartao.js';
import { criarCatalogo, nomeDoId } from '../site/rts/js/interface/catalogo.js';
import { criarAlertas, ALERTA, RAIO_DO_ATAQUE, SILENCIO_DO_ATAQUE_MS } from '../site/rts/js/interface/alertas.js';
import { criarTextos, PROVISORIOS, achatar } from '../site/rts/js/interface/textos.js';
import { criarLeitura, TETO_PADRAO } from '../site/rts/js/interface/leitura.js';
import { cantoDaPegada, criarColocacao, validarPeloMapa } from '../site/rts/js/entrada/colocacao.js';
import { resultadoDosEventos, nomeDoArquivo } from '../site/rts/js/interface/fim.js';
import { volumePelaDistancia, ALCANCE_DO_SOM } from '../site/rts/js/interface/som-da-partida.js';
import { EVENTO, TAMANHO_EVENTO, FP, BANDEIRA } from '../site/rts/js/sim/contratos.js';

// Kinds of a small sandbox: 0 harvester, 1 rifleman, 2 headquarters, 3 barracks, 4 pole, 5 resource node.
const TIPOS = [
  { id: 'guincho', categoria: 'coletor', custo: 300, lotacao: 2 },
  { id: 'turma-de-linha', categoria: 'unidade', custo: 100, lotacao: 1 },
  { id: 'escritorio-regional', categoria: 'predio', pegada: [3, 3], produz: [0], constroi: [3, 4], qg: true },
  { id: 'quartel', categoria: 'predio', custo: 500, pegada: [2, 2], produz: [1] },
  { id: 'poste', categoria: 'predio', custo: 50, pegada: [1, 1] },
  { id: 'cemiterio', categoria: 'recurso', pegada: [2, 2] },
];
const textoComNomes = criarTextos({ textos: { 'unidade.turma-de-linha.nome': 'Turma de Linha', 'predio.quartel.nome': 'Quartel' } });
const catalogo = criarCatalogo(TIPOS, textoComNomes);

function evento(tipo, entidade, { alvo = -1, x = 0, y = 0, alvoX = x, alvoY = y, arg = 0 } = {}) {
  return [tipo, 0, entidade, alvo, x * FP, y * FP, alvoX * FP, alvoY * FP, arg];
}
const eventos = (...lista) => Int32Array.from(lista.flat());

test('the catalog names kinds from C11 and falls back to the id, and tells units, buildings and resources apart', () => {
  assert.equal(catalogo.nome(1), 'Turma de Linha');
  assert.equal(catalogo.nome(3), 'Quartel');
  assert.equal(catalogo.nome(0), 'Guincho');
  assert.equal(nomeDoId('escritorio-regional'), 'Escritorio regional');
  assert.ok(catalogo.ehUnidade(0) && catalogo.ehColetor(0) && catalogo.ehUnidade(1));
  assert.ok(catalogo.ehPredio(2) && catalogo.ehQG(2) && !catalogo.ehQG(3));
  assert.ok(catalogo.ehRecurso(5) && !catalogo.ehUnidade(5));
});

test('units get the orders in fixed places of the grid, and nothing selected gets an empty card', () => {
  const cartao = montarCartao({ selecao: [{ id: 10, tipo: 1 }, { id: 11, tipo: 3 }], catalogo, producao: () => null, carga: 0, lotacao: { usada: 0, teto: 60 } });
  assert.equal(cartao.tipo, 'unidades');
  const porTecla = Object.fromEntries(cartao.slots.map((s, i) => [TECLAS_DA_GRADE[i], s?.acao ?? null]));
  assert.deepEqual(porTecla, { KeyQ: ACAO.MOVER, KeyW: null, KeyE: null, KeyR: ACAO.PATRULHAR, KeyA: ACAO.ATACAR_MOVENDO, KeyS: ACAO.PARAR, KeyD: ACAO.SEGURAR, KeyF: null });
  assert.equal(montarCartao({ selecao: [], catalogo, producao: () => null, carga: 0, lotacao: { usada: 0, teto: 60 } }).slots.filter(Boolean).length, 0);
});

test('a building card trains in data order, counts its queues and says when Carga or population is short', () => {
  const filas = { 20: { fila: [{ tipo: 1, progresso: 0.5 }, { tipo: 1, progresso: 0 }], obra: null, pronto: -1 }, 21: { fila: [], obra: null, pronto: -1 } };
  const producao = id => filas[id] ?? null;
  const entrada = { selecao: [{ id: 20, tipo: 3 }, { id: 21, tipo: 3 }], catalogo, producao, carga: 1000, lotacao: { usada: 10, teto: 60 } };
  const cartao = montarCartao(entrada);
  assert.equal(cartao.tipo, 'predio');
  assert.deepEqual(cartao.predios, [20, 21]);
  assert.deepEqual({ ...cartao.slots[0] }, { slot: 0, tipo: 1, modo: 'produzir', custo: 100, quantidade: 2, progresso: 0.5, falta: null });
  assert.equal(predioComMenorFila(cartao.predios, producao), 21, 'the next item goes to the shortest queue');
  assert.equal(montarCartao({ ...entrada, carga: 50 }).slots[0].falta, 'carga');
  assert.equal(montarCartao({ ...entrada, lotacao: { usada: 60, teto: 60 } }).slots[0].falta, 'lotacao');
  const cheias = { fila: new Array(MAXIMO_DA_FILA).fill({ tipo: 1, progresso: 0 }), obra: null, pronto: -1 };
  assert.equal(montarCartao({ ...entrada, producao: () => cheias }).slots[0].falta, 'fila');
});

test('the headquarters builds one building at a time and offers to place the one that is ready', () => {
  const base = { selecao: [{ id: 30, tipo: 2 }], catalogo, carga: 1000, lotacao: { usada: 0, teto: 60 } };
  const livre = montarCartao({ ...base, producao: () => ({ fila: [], obra: null, pronto: -1 }) });
  assert.deepEqual(livre.slots.slice(0, 3).map(s => s && [s.tipo, s.modo]), [[0, 'produzir'], [3, 'construir'], [4, 'construir']]);
  const emObra = montarCartao({ ...base, producao: () => ({ fila: [], obra: { tipo: 3, progresso: 0.25 }, pronto: -1 }) });
  assert.equal(emObra.slots[1].progresso, 0.25);
  assert.equal(emObra.slots[2].ocupado, true, 'another building waits for the one in progress');
  const pronto = montarCartao({ ...base, producao: () => ({ fila: [], obra: null, pronto: 4 }) });
  assert.equal(pronto.slots[2].modo, 'posicionar');
  assert.equal(pronto.slots[1].ocupado, true);
});

test('attacks on the player raise one alert per place while the fight goes on, by what was hit', () => {
  const dono = { 1: 0, 2: 0, 3: 0, 9: 1 };
  const tipo = { 1: 1, 2: 2, 3: 0, 9: 1 };
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

test('finished production and construction alert only for the player, with the kind made', () => {
  const alertas = criarAlertas({ jogador: 0, donoDe: id => (id === 5 ? 0 : 1), tipoDe: () => 3, categoria: catalogo.categoria });
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

test('the HUD reads Carga, population and idle harvesters from a snapshot, and queues when it carries them', () => {
  const leitura = criarLeitura({ catalogo: () => catalogo });
  const retrato = {
    n: 4,
    id: Int32Array.from([101, 102, 103, 104]),
    tipo: Uint16Array.from([0, 0, 2, 1]),
    dono: Uint8Array.from([0, 0, 0, 1]),
    bandeiras: Uint16Array.from([BANDEIRA.OCIOSA ?? BANDEIRA.PARADA, 0, 0, 0]),
    recursos: Int32Array.from([1500, 900]),
  };
  leitura.atualizar(retrato, 0);
  assert.equal(leitura.carga, 1500);
  assert.deepEqual({ ...leitura.lotacao }, { usada: 4, teto: TETO_PADRAO });
  assert.deepEqual([...leitura.ociosos], [101]);
  assert.equal(leitura.qg, 103);
  assert.equal(leitura.producao(103), null);
  leitura.atualizar({ ...retrato, lotacao: Int32Array.from([7, 60, 0, 60]), filas: Int32Array.from([103, 0, 250, 0, 103, 0, 0, 0, 103, 3, 500, 1]) }, 0);
  assert.deepEqual({ ...leitura.lotacao }, { usada: 7, teto: 60 });
  assert.deepEqual(leitura.producao(103), { fila: [{ tipo: 0, progresso: 0.25 }, { tipo: 0, progresso: 0 }], obra: { tipo: 3, progresso: 0.5 }, pronto: -1 });
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

  const mapa = { largura: 8, altura: 8, bloqueado: new Uint8Array(64) };
  mapa.bloqueado[3 * 8 + 3] = 1;
  const retrato = { n: 1, x: Int32Array.from([6 * FP + 512]), y: Int32Array.from([6 * FP + 512]) };
  assert.ok(validarPeloMapa(mapa, retrato, 0, 0, 2, 2));
  assert.ok(!validarPeloMapa(mapa, retrato, 2, 2, 2, 2), 'rock');
  assert.ok(!validarPeloMapa(mapa, retrato, 5, 5, 2, 2), 'a unit stands there');
  assert.ok(!validarPeloMapa(mapa, retrato, 7, 0, 2, 2), 'off the map');
});

test('victory or defeat of the local player ends the match; the saved log has a dated name', () => {
  assert.equal(resultadoDosEventos(eventos(evento(EVENTO.TIRO, 1)), 0), null);
  assert.equal(resultadoDosEventos(eventos(evento(EVENTO.VITORIA, 0)), 0), 'vitoria');
  assert.equal(resultadoDosEventos(eventos(evento(EVENTO.DERROTA, -1)), 0), 'derrota');
  assert.equal(resultadoDosEventos(eventos(evento(EVENTO.VITORIA, 1)), 0), null, 'another player\'s victory');
  assert.equal(nomeDoArquivo(new Date(2026, 9, 31, 15, 7)), 'registro-rts-2026-10-31-1507.json');
});

test('sounds of the match fade with distance from the camera', () => {
  assert.equal(volumePelaDistancia(10, 10, 12, 12), 1);
  assert.equal(volumePelaDistancia(10 + ALCANCE_DO_SOM, 10, 10, 10), 0);
  const meio = volumePelaDistancia(10 + 24, 10, 10, 10);
  assert.ok(meio > 0 && meio < 1);
});

test('each record of the event fixture has the C3 size', () => {
  assert.equal(evento(EVENTO.TIRO, 1).length, TAMANHO_EVENTO);
});
