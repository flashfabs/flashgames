// Input rules of the RTS that do not need a browser: key bindings, selection, control groups and the queue points.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACAO, ATALHOS_PADRAO, RESERVADAS_DO_NAVEGADOR, acaoDaTecla, rotuloDoAtalho } from '../site/rts/js/entrada/teclas.js';
import { idsNaCaixa, entidadeNoPonto, mesmoTipoNaTela, aplicarSelecao, podarSelecao } from '../site/rts/js/entrada/selecao.js';
import { criarGrupos, INTERVALO_DUPLO_MS } from '../site/rts/js/entrada/grupos.js';
import { criarFilaVisual, TOLERANCIA_TICKS, MAXIMO_NA_FILA } from '../site/rts/js/entrada/fila.js';

const tecla = (code, mods = {}) => ({ code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });

test('no binding uses Ctrl or Cmd with a key the browser keeps, and those keys map to nothing', () => {
  for (const atalho of ATALHOS_PADRAO) {
    if (!/ctrl|meta/.test(atalho.mods)) continue;
    assert.ok(!RESERVADAS_DO_NAVEGADOR.includes(atalho.code), `${atalho.mods}+${atalho.code} is the browser's`);
  }
  for (const code of RESERVADAS_DO_NAVEGADOR) {
    assert.equal(acaoDaTecla(tecla(code, { ctrlKey: true })), null);
    assert.equal(acaoDaTecla(tecla(code, { metaKey: true })), null);
  }
  assert.equal(acaoDaTecla(tecla('Digit1', { metaKey: true })), null, 'Cmd and a digit switch tabs');
});

test('Esc only cancels and never opens the menu; F10 is the menu', () => {
  assert.deepEqual(acaoDaTecla(tecla('Escape')), { acao: ACAO.CANCELAR, grupo: undefined, fila: false });
  assert.equal(acaoDaTecla(tecla('F10')).acao, ACAO.MENU);
  assert.ok(ATALHOS_PADRAO.filter(atalho => atalho.code === 'Escape').every(atalho => atalho.acao === ACAO.CANCELAR));
});

test('B goes to the base, the period to the next idle harvester and V to the last alert', () => {
  assert.equal(acaoDaTecla(tecla('KeyB')).acao, ACAO.BASE);
  assert.equal(acaoDaTecla(tecla('Period')).acao, ACAO.COLETOR_OCIOSO);
  assert.equal(acaoDaTecla(tecla('NumpadDecimal')).acao, ACAO.COLETOR_OCIOSO);
  assert.equal(acaoDaTecla(tecla('KeyV')).acao, ACAO.ULTIMO_ALERTA);
  assert.equal(rotuloDoAtalho(ATALHOS_PADRAO.find(atalho => atalho.code === 'Period'), false), '.');
});

test('command keys follow the physical key and take Shift as the queue mark', () => {
  assert.deepEqual(acaoDaTecla(tecla('KeyA')), { acao: ACAO.ATACAR_MOVENDO, grupo: undefined, fila: false });
  assert.deepEqual(acaoDaTecla(tecla('KeyA', { shiftKey: true })), { acao: ACAO.ATACAR_MOVENDO, grupo: undefined, fila: true });
  assert.equal(acaoDaTecla(tecla('KeyA', { ctrlKey: true })).acao, ACAO.SELECIONAR_TUDO);
  assert.equal(acaoDaTecla(tecla('KeyS')).acao, ACAO.PARAR);
  assert.equal(acaoDaTecla(tecla('KeyH')).acao, ACAO.SEGURAR);
  assert.equal(acaoDaTecla(tecla('KeyR')).acao, ACAO.PATRULHAR);
  assert.equal(acaoDaTecla(tecla('KeyP')).acao, ACAO.PAUSAR, 'P pauses; patrol is R, so one key never does both');
  assert.equal(acaoDaTecla(tecla('KeyS', { shiftKey: true })), null);
});

test('digits recall, Shift adds, and both Ctrl and Option/Alt store a group', () => {
  assert.deepEqual(acaoDaTecla(tecla('Digit3')), { acao: ACAO.CHAMAR_GRUPO, grupo: 3, fila: false });
  assert.equal(acaoDaTecla(tecla('Digit3', { shiftKey: true })).acao, ACAO.SOMAR_GRUPO);
  assert.equal(acaoDaTecla(tecla('Digit3', { ctrlKey: true })).acao, ACAO.GUARDAR_GRUPO);
  // Option+3 on the Mac gives key "£"; the binding reads code, so it still stores group 3.
  assert.deepEqual(acaoDaTecla({ ...tecla('Digit3', { altKey: true }), key: '£' }), { acao: ACAO.GUARDAR_GRUPO, grupo: 3, fila: false });
  assert.equal(acaoDaTecla(tecla('Numpad3')), null);
});

test('labels speak the system\'s names', () => {
  const guardarComAlt = ATALHOS_PADRAO.find(atalho => atalho.acao === ACAO.GUARDAR_GRUPO && atalho.mods === 'alt' && atalho.grupo === 1);
  assert.equal(rotuloDoAtalho(guardarComAlt, true), 'Option + 1');
  assert.equal(rotuloDoAtalho(guardarComAlt, false), 'Alt + 1');
  assert.equal(rotuloDoAtalho(ATALHOS_PADRAO.find(atalho => atalho.code === 'Equal'), false), '+');
});

// A tiny snapshot: three units of player 0 (two of kind 1, one of kind 2) and one of player 1, projected 10 px per cell.
const retrato = {
  n: 4,
  id: Int32Array.from([65537, 65538, 65539, 65540]),
  dono: Uint8Array.from([0, 0, 0, 1]),
  tipo: Uint16Array.from([1, 1, 2, 1]),
  x: Int32Array.from([10, 20, 30, 12]),
  y: Int32Array.from([10, 10, 40, 10]),
};
const projetar = (r, k, saida) => {
  saida.x = r.x[k] * 10;
  saida.y = r.y[k] * 10;
};

test('a box picks only the player\'s units inside it, whichever way it was dragged', () => {
  assert.deepEqual(idsNaCaixa(retrato, 0, projetar, { x0: 250, y0: 50, x1: 50, y1: 150 }), [65537, 65538]);
  assert.deepEqual(idsNaCaixa(retrato, 1, projetar, { x0: 0, y0: 0, x1: 500, y1: 500 }), [65540]);
});

test('a click picks the nearest unit within reach, filtered by the caller', () => {
  assert.equal(entidadeNoPonto(retrato, projetar, 105, 103), 0);
  assert.equal(entidadeNoPonto(retrato, projetar, 118, 100), 3, 'the enemy is nearer');
  assert.equal(entidadeNoPonto(retrato, projetar, 118, 100, k => retrato.dono[k] === 0), 0);
  assert.equal(entidadeNoPonto(retrato, projetar, 160, 160), -1);
});

test('double click takes every unit of the same kind on screen, and nothing off screen', () => {
  assert.deepEqual(mesmoTipoNaTela(retrato, 0, 1, projetar, { x0: 0, y0: 0, x1: 500, y1: 500 }), [65537, 65538]);
  assert.deepEqual(mesmoTipoNaTela(retrato, 0, 1, projetar, { x0: 0, y0: 0, x1: 150, y1: 500 }), [65537]);
});

test('Shift and box adds, Shift and click toggles, and dead ids are pruned', () => {
  const selecionadas = new Set([1, 2]);
  aplicarSelecao(selecionadas, [3], 'somar');
  assert.deepEqual([...selecionadas], [1, 2, 3]);
  aplicarSelecao(selecionadas, [2], 'alternar');
  assert.deepEqual([...selecionadas], [1, 3]);
  aplicarSelecao(selecionadas, [2], 'alternar');
  assert.deepEqual([...selecionadas], [1, 3, 2]);
  aplicarSelecao(selecionadas, [9], 'trocar');
  assert.deepEqual([...selecionadas], [9]);
  assert.equal(podarSelecao(new Set([4, 5, 6]), id => id !== 5), 1);
});

test('groups store, add, recall the living ids, and a quick second recall centres the camera', () => {
  const grupos = criarGrupos();
  const vivos = new Set([1, 2, 3, 4]);
  const existe = id => vivos.has(id);
  grupos.guardar(1, [1, 2]);
  grupos.somar(1, [3]);
  assert.deepEqual(grupos.chamar(1, 1000, existe), { ids: [1, 2, 3], centralizar: false });
  assert.deepEqual(grupos.chamar(1, 1000 + INTERVALO_DUPLO_MS - 1, existe), { ids: [1, 2, 3], centralizar: true });
  assert.equal(grupos.chamar(1, 1000 + INTERVALO_DUPLO_MS, existe).centralizar, false, 'a third press starts over');
  vivos.delete(2);
  assert.deepEqual(grupos.chamar(1, 5000, existe).ids, [1, 3]);
  grupos.guardar(2, [4]);
  assert.equal(grupos.chamar(2, 5100, existe).centralizar, false, 'another group never centres');
  grupos.guardar(2, []);
  assert.deepEqual(grupos.ocupados(), [1]);
});

test('queue points append with Shift, go away as units reach them, and vanish when the unit idles', () => {
  const fila = criarFilaVisual();
  fila.ordenar([7, 8], { x: 10, y: 0 }, 1, false, 100);
  fila.ordenar([7, 8], { x: 20, y: 0 }, 3, true, 101);
  fila.ordenar([8], { x: 5, y: 5 }, 1, false, 102);
  assert.equal(fila.rotas([7, 8]).length, 2);
  assert.deepEqual(fila.rotas([7]), [[{ x: 10, y: 0, tipo: 1 }, { x: 20, y: 0, tipo: 3 }]]);

  const posicoes = new Map([[7, { x: 9.5, y: 0 }], [8, { x: 0, y: 0 }]]);
  const posicao = (id, saida) => {
    const p = posicoes.get(id);
    if (!p) return false;
    Object.assign(saida, p);
    return true;
  };
  fila.atualizar(103, posicao, () => false);
  assert.deepEqual(fila.pontosDe(7), [{ x: 20, y: 0, tipo: 3 }]);
  fila.atualizar(102 + TOLERANCIA_TICKS, posicao, () => true);
  assert.equal(fila.pontosDe(8).length, 1, 'an order just sent survives the idle flag of the snapshot before it');
  fila.atualizar(103 + TOLERANCIA_TICKS, posicao, id => id === 8);
  assert.equal(fila.pontosDe(8).length, 0);
  posicoes.delete(7);
  fila.atualizar(200, posicao, () => false);
  assert.equal(fila.pontosDe(7).length, 0, 'a dead unit leaves no points');
});

test('click latency closes every pending input at the end of the frame that draws it', async () => {
  const { criarMedidorDeLatencia, META_LATENCIA_MS } = await import('../site/rts/js/entrada/latencia.js');
  const medidor = criarMedidorDeLatencia(3);
  medidor.anotar(1000, 'ordem');
  medidor.anotar(1010, 'selecao');
  medidor.aoDesenhar(1030);
  medidor.anotar(2000, 'ordem');
  medidor.aoDesenhar(2000 + META_LATENCIA_MS + 20);
  medidor.aoDesenhar(5000);
  assert.deepEqual(medidor.amostras().map(amostra => amostra.ms), [30, 20, META_LATENCIA_MS + 20]);
  assert.deepEqual(medidor.resumo(), { n: 3, p50: 30, p95: META_LATENCIA_MS + 20, maximo: META_LATENCIA_MS + 20, acimaDaMeta: 1 });
});

test('the queue keeps as many points as the simulation keeps orders, and a patrol point stays while patrolling', () => {
  const PATRULHAR = 6;
  const fila = criarFilaVisual({ repetem: new Set([PATRULHAR]) });
  fila.ordenar([1], { x: 0, y: 0 }, 1, false, 0);
  for (let i = 1; i < MAXIMO_NA_FILA + 3; i++) fila.ordenar([1], { x: i * 10, y: 0 }, 1, true, 0);
  assert.equal(fila.pontosDe(1).length, MAXIMO_NA_FILA);

  fila.ordenar([2], { x: 5, y: 5 }, PATRULHAR, false, 0);
  const naPatrulha = (id, saida) => Object.assign(saida, { x: 5, y: 5 }) && true;
  fila.atualizar(1, naPatrulha, () => false);
  assert.deepEqual(fila.pontosDe(2), [{ x: 5, y: 5, tipo: PATRULHAR }]);
});
