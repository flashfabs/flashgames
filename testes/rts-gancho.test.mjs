// The end-to-end test hook (site/rts/js/teste/gancho.js) against a fake worker bridge: snapshot and event decoding,
// events kept across snapshots, waiting for a tick, fast-forward and commands, all without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ligarGancho, decodificarRetrato, decodificarEventos, decodificarFilas } from '../site/rts/js/teste/gancho.js';
import { CAMPOS_RETRATO, EVENTO, TAMANHO_EVENTO, TIPO_COMANDO, FP, alocarCamposRetrato } from '../site/rts/js/sim/contratos.js';
import { FAIXA, FAIXA_ESTADO, ITEM_PESQUISA, TAMANHO_REGISTRO_FILA, TAMANHO_FAIXA, FL_FAIXAS, FX_ESTADO, FX_PROGRESSO, FX_N, FX_ITENS, MAX_FILA } from '../site/rts/js/sim/contratos.js';
import { criarSimulacao, passo, REGRAS_LIVRES } from '../site/rts/js/sim/simulacao.js';
import { montarRetrato } from '../site/rts/js/sim/retrato.js';

function retratoFalso(tick, eventos = []) {
  const campos = alocarCamposRetrato(2);
  campos.id.set([1 | (1 << 16), 2 | (1 << 16)]);
  campos.dono.set([0, 1]);
  campos.x.set([5 * FP, 9 * FP]);
  const registros = new Int32Array(eventos.length * TAMANHO_EVENTO);
  eventos.forEach((tipo, k) => registros.set([tipo, tick, 1, -1, 0, 0, 0, 0, 0], k * TAMANHO_EVENTO));
  return { t: 'retrato', versao: 2, tick, msPasso: 1, soma: 7, tickSoma: tick, n: 2, ...campos, visao: new Uint8Array(4), recursos: Int32Array.from([300, 250]), eventos: registros };
}

function ponteFalsa() {
  const estado = { atual: null, anterior: null };
  const enviados = [];
  const pausas = [];
  const ponte = {
    estado,
    enviarComando: c => enviados.push(c),
    pausar: (valor, motivo) => pausas.push([valor, motivo]),
    avancar(passos) {
      const tick = (estado.atual?.tick ?? 0) + passos;
      queueMicrotask(() => {
        estado.anterior = estado.atual;
        estado.atual = retratoFalso(tick, [EVENTO.VITORIA]);
      });
    },
  };
  return { ponte, estado, enviados, pausas };
}

test('decodes every per-entity field of the snapshot and the per-player arrays', () => {
  const r = decodificarRetrato(retratoFalso(10));
  assert.equal(r.n, 2);
  assert.equal(r.entidades.length, 2);
  for (const [nome] of CAMPOS_RETRATO) assert.ok(nome in r.entidades[0], `campo ${nome}`);
  assert.equal(r.entidades[1].x, 9 * FP);
  assert.deepEqual(r.recursos, [300, 250]);
  assert.equal(r.visao, undefined);
  assert.equal(r.eventos, undefined);
  assert.doesNotThrow(() => structuredClone(r));
});

test('decodes the snapshot the real simulation builds', () => {
  const sim = criarSimulacao({ semente: 3, largura: 48, altura: 48, unidades: [{ tipo: 0, time: 0, x: 10 * FP, y: 10 * FP }, { tipo: 0, time: 1, x: 30 * FP, y: 30 * FP }], regras: REGRAS_LIVRES });
  passo(sim);
  const r = decodificarRetrato(montarRetrato(sim));
  assert.equal(r.tick, 1);
  assert.equal(r.entidades.length, 2);
  assert.deepEqual(r.entidades.map(e => e.dono), [0, 1]);
});

test('names the events and keeps unknown kinds', () => {
  const eventos = Int32Array.from([EVENTO.TIRO, 5, 1, 2, 3, 4, 5, 6, 7, 99, 6, 1, -1, 0, 0, 0, 0, 0]);
  const lista = decodificarEventos(eventos);
  assert.deepEqual(lista.map(e => e.nome), ['TIRO', 'EVENTO_99']);
  assert.equal(lista[0].alvoY, 6);
  assert.equal(lista[0].arg, 7);
});

test('keeps the events of every snapshot and resolves waits by tick', async () => {
  const { ponte, estado } = ponteFalsa();
  const rts = ligarGancho({ ja: 1 }, { simulacao: ponte, estado });
  assert.equal(rts.ja, 1, 'extends the existing object');
  const espera = rts.esperarTick(3);
  estado.atual = retratoFalso(1, [EVENTO.TIRO]);
  estado.atual = retratoFalso(2, []);
  estado.atual = retratoFalso(3, [EVENTO.MORTE, EVENTO.SURGIMENTO]);
  const r = await espera;
  assert.equal(r.tick, 3);
  assert.deepEqual(rts.eventos.map(e => e.nome), ['TIRO', 'MORTE', 'SURGIMENTO']);
  assert.equal(rts.eventosDo('MORTE').length, 1);
  await rts.pronto;
  rts.limparEventos();
  assert.equal(rts.eventos.length, 0);
});

test('fast-forward, commands and pause go through the bridge', async () => {
  const { ponte, estado, enviados, pausas } = ponteFalsa();
  const rts = ligarGancho({}, { simulacao: ponte, estado });
  estado.atual = retratoFalso(100);
  const r = await rts.avancar(9000);
  assert.equal(r.tick, 9100);
  assert.equal(rts.eventosDo('VITORIA').length, 1);
  rts.comando({ tipo: TIPO_COMANDO.MOVER, unidades: [65537], x: rts.celula(4), y: rts.celula(5) });
  assert.deepEqual(enviados[0], { tipo: TIPO_COMANDO.MOVER, unidades: [65537], alvo: -1, x: 4 * FP + FP / 2, y: 5 * FP + FP / 2, arg: 0, fila: 0 });
  rts.pausar();
  rts.pausar(false);
  assert.deepEqual(pausas, [[true, 'teste'], [false, 'teste']]);
  assert.throws(() => rts.avancar(0));
  assert.equal(rts.registro(), null);
  const comRegistro = ligarGancho({}, { simulacao: ponte, estado, obterRegistro: () => ({ versao: 1, eventos: [{ passo: 3, tipo: 'tiro' }] }) });
  assert.deepEqual(comRegistro.registro().eventos, [{ passo: 3, tipo: 'tiro' }]);
  const instancia = { anotar() {}, exportar: () => ({ versao: 1, resultado: 'vitoria', eventos: [] }) };
  assert.equal(ligarGancho({}, { simulacao: ponte, estado, obterRegistro: () => instancia }).registro().resultado, 'vitoria');
  assert.throws(() => ligarGancho({}, { simulacao: { ...ponte, avancar: undefined }, estado }).avancar(1), /AVANCAR/);
});

test('a wait that never arrives rejects with the last tick', async () => {
  const { ponte, estado } = ponteFalsa();
  const rts = ligarGancho({}, { simulacao: ponte, estado });
  estado.atual = retratoFalso(4);
  await assert.rejects(rts.esperarTick(50, 20), /tick 50 não chegou.*último 4/);
});

test('decodes the production queues and names kinds from the static map', () => {
  const filas = new Int32Array(TAMANHO_REGISTRO_FILA).fill(-1);
  filas.set([65539, -1, -1, -1], 0);
  const unidades = FL_FAIXAS + FAIXA.UNIDADES * TAMANHO_FAIXA;
  const construcao = FL_FAIXAS + FAIXA.CONSTRUCAO * TAMANHO_FAIXA;
  filas[unidades + FX_ESTADO] = FAIXA_ESTADO.PRODUZINDO;
  filas[unidades + FX_PROGRESSO] = 400;
  filas[unidades + FX_N] = 2;
  filas.set([1, ITEM_PESQUISA], unidades + FX_ITENS);
  filas[construcao + FX_ESTADO] = FAIXA_ESTADO.PRONTO;
  filas[construcao + FX_PROGRESSO] = 1000;
  filas[construcao + FX_N] = 1;
  filas[construcao + FX_ITENS] = 2;
  const mapa = { tipos: [{ nome: 'escritorio-regional' }, { nome: 'guincho-de-celulas' }, { nome: 'poste' }], pesquisas: [{ nome: 'cabo-reforcado' }] };
  const [fila] = decodificarFilas(filas, mapa);
  assert.equal(fila.produtor, 65539);
  assert.deepEqual(fila.faixas.UNIDADES, { estado: 'PRODUZINDO', progresso: 400, itens: ['guincho-de-celulas', 'pesquisa:cabo-reforcado'] });
  assert.deepEqual(fila.faixas.CONSTRUCAO, { estado: 'PRONTO', progresso: 1000, itens: ['poste'] });
  assert.ok(MAX_FILA >= 2);
  const retrato = decodificarRetrato({ ...retratoFalso(1), filas }, mapa);
  assert.equal(retrato.entidades[0].nome, 'escritorio-regional');
  assert.equal(retrato.filas.length, 1);
  assert.equal(retrato.filas_, undefined);
});
