// Maps of the RTS (contract C6): the Tiled source in arte/mapas-fonte/ converts to exactly the files committed in
// site/rts/dados/mapas/, the result passes the format rules, the sandbox is fair by 180° rotation, and a simple trip
// model keeps the first battery yard running dry inside the pace target of stage E3.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { converterTiled, validarMapa, camada, bloqueio, distancias, PASSAGEM } from '../ferramentas/mapas/formato.mjs';
import { lerFonte, lerDados, saidas } from '../ferramentas/mapas/converter.mjs';
import { gerarFonte } from '../ferramentas/mapas/gerar-caixa-de-areia.mjs';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const fonte = `${raiz}arte/mapas-fonte/caixa-de-areia.tmj`;
const pasta = `${raiz}site/rts/dados/mapas/caixa-de-areia/`;
const dados = lerDados();
const { tmj, tsj } = lerFonte(fonte);
const convertido = converterTiled(tmj, tsj);
const { mapa, camadas, entidades } = convertido;

test('the generated source is the committed one, while the map is still written by script', () => {
  const geradoPor = tmj.properties.find(p => p.name === 'geradoPor');
  if (!geradoPor) return; // edited by hand in the map editor from then on
  for (const [nome, conteudo] of Object.entries(gerarFonte())) {
    assert.ok(Buffer.from(conteudo).equals(readFileSync(`${raiz}arte/mapas-fonte/${nome}`)), `${nome} difere do gerador; rode node ferramentas/mapas/gerar-caixa-de-areia.mjs`);
  }
});

test('converting the source gives exactly the committed C6 files', () => {
  for (const [nome, conteudo] of Object.entries(saidas(convertido))) {
    assert.ok(Buffer.from(conteudo).equals(readFileSync(pasta + nome)), `${nome} difere; rode node ferramentas/mapas/converter.mjs arte/mapas-fonte/caixa-de-areia.tmj`);
  }
});

test('the sandbox passes every format rule', () => {
  assert.deepEqual(validarMapa(convertido, dados), []);
  assert.equal(mapa.simetria, 'rotacao-180');
  assert.equal(mapa.jogadores.length, 2);
});

test('resources, neutral structures and windy spots come in mirrored pairs', () => {
  const N = mapa.largura;
  const chave = (x, y) => `${x},${y}`;
  const pilhas = new Set(entidades.entidades.filter(e => e.tipo === 'pilha').map(e => chave(e.x, e.y)));
  for (const p of pilhas) {
    const [x, y] = p.split(',').map(Number);
    assert.ok(pilhas.has(chave(N - 1 - x, N - 1 - y)), `pilha ${p} sem par`);
  }
  const cargas = new Map();
  for (const e of entidades.entidades.filter(e => e.tipo === 'pilha')) cargas.set(e.no, (cargas.get(e.no) ?? 0) + e.carga);
  assert.equal(new Set(cargas.values()).size <= 3, true);
  const neutras = entidades.entidades.filter(e => e.dono === -1 && e.tipo !== 'pilha');
  const pegada = nome => dados.predios.find(p => p.nome === nome).pegada;
  for (const e of neutras) {
    const [w, h] = pegada(e.tipo);
    assert.ok(neutras.some(o => o.tipo === e.tipo && o.x === N - e.x - w && o.y === N - e.y - h), `${e.tipo} em ${e.x},${e.y} sem par`);
  }
  for (const [x, y] of entidades.ventosas) assert.ok(entidades.ventosas.some(([a, b]) => a === N - 1 - x && b === N - 1 - y), `ventosa ${x},${y} sem par`);
});

test('every pile can be reached from at least three sides', () => {
  const bloqueado = bloqueio(mapa, camadas);
  for (const e of entidades.entidades.filter(e => e.tipo === 'pilha')) {
    const livres = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => !bloqueado[(e.y + dy) * mapa.largura + e.x + dx]).length;
    assert.ok(livres >= 3, `pilha em ${e.x},${e.y} com ${livres} lados livres`);
  }
});

test('the crossings are what the waves plan around: one bridge and two slow fords', () => {
  const passagem = camada(mapa, camadas, 'passagem');
  const linhaDoRio = 48;
  const abertas = [];
  for (let x = 0; x < mapa.largura; x++) if (passagem[linhaDoRio * mapa.largura + x] !== PASSAGEM.BLOQUEADA) abertas.push([x, passagem[linhaDoRio * mapa.largura + x]]);
  const pontes = abertas.filter(([, p]) => p === PASSAGEM.LIVRE).map(([x]) => x);
  const vaus = abertas.filter(([, p]) => p === PASSAGEM.LENTA).map(([x]) => x);
  assert.deepEqual(pontes, [47, 48]);
  assert.equal(vaus.length, 10);
});

// Trip model for the player's base yard: three harvesters (the saturation), each walking from the nearest cell where
// the economy rules let a depot stand to its pile and back, loading and unloading; the stage E3 target for the first
// yard running dry is 10 to 13 minutes, counted from a start-up of about a minute.
test('the base yard of the sandbox runs dry in about 10 to 13 minutes with saturated harvesters', () => {
  const economia = JSON.parse(readFileSync(`${raiz}site/rts/dados/economia.json`, 'utf8'));
  const guincho = dados.unidades.find(u => u.nome === 'guincho-de-celulas');
  const bloqueado = bloqueio(mapa, camadas);
  const alt = camada(mapa, camadas, 'altura');
  const pilhas = entidades.entidades.filter(e => e.tipo === 'pilha' && entidades.nos[e.no].id === 'cemiterio-sudoeste');
  // depots keep this many cells from any pile (rule asked of the motor; until economia.json carries it, the plan's 5)
  const distanciaMinima = economia.distanciaMinimaPilha ?? 5;
  const longe = (x, y) => pilhas.every(p => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) >= distanciaMinima);
  let somaViagensMs = 0;
  for (const pilha of pilhas) {
    const dist = distancias(mapa, bloqueado, [pilha.x + 1, pilha.y]);
    let menor = Infinity;
    for (let i = 0; i < dist.length; i++) {
      const x = i % mapa.largura;
      const y = Math.trunc(i / mapa.largura);
      if (dist[i] >= 0 && alt[i] === alt[pilha.y * mapa.largura + pilha.x] && longe(x, y)) menor = Math.min(menor, dist[i]);
    }
    somaViagensMs += Math.trunc((2 * menor * 100 * 1000) / guincho.velocidade) + guincho.coleta.carregarMs + guincho.coleta.descarregarMs;
  }
  const viagemMediaMs = somaViagensMs / pilhas.length;
  const total = pilhas.reduce((s, p) => s + p.carga, 0);
  const minutos = 1 + (total / guincho.coleta.carga) * viagemMediaMs / economia.saturacao / 60000;
  assert.ok(minutos >= 10 && minutos <= 13, `cemitério da base esgota em ${minutos.toFixed(1)} min (viagem média ${(viagemMediaMs / 1000).toFixed(1)} s)`);
});
