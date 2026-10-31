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
  // depots keep this many cells between their footprint and any pile (MOTIVO.PERTO_DO_RECURSO in the motor)
  const distanciaMinima = economia.distanciaMinimaPilha;
  assert.ok(distanciaMinima >= 3, 'sem distância mínima o depósito cola nas pilhas e o cemitério esvazia na metade do tempo');
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

// ---------- "Morro Aceso", the first mission's map (128 x 96, not symmetric) ----------

import { gerarFonte as gerarFonteMorro, BASCULANTE, aguaDoRio } from '../ferramentas/mapas/gerar-morro-aceso.mjs';

const morro = (() => {
  const fonteMorro = lerFonte(`${raiz}arte/mapas-fonte/morro-aceso.tmj`);
  return { fonte: fonteMorro, ...converterTiled(fonteMorro.tmj, fonteMorro.tsj) };
})();
const pastaMorro = `${raiz}site/rts/dados/mapas/morro-aceso/`;
const celulaDe = (m, [x, y]) => y * m.mapa.largura + x;
const bloqueioMorro = (...retangulos) => {
  const b = bloqueio(morro.mapa, morro.camadas);
  for (const [x0, y0, w, h] of retangulos) for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) b[y * morro.mapa.largura + x] = 1;
  return b;
};
const passosAte = (b, de, para) => distancias(morro.mapa, b, de)[celulaDe(morro, para)];
const BASE_MORRO = morro.mapa.jogadores[0].base;
const SUBESTACAO = morro.entidades.pontos.subestacao;
// what stands in the way while it is neutral, and the three ways across the river or the ridge east of the camp
const PONTE_FECHADA = [BASCULANTE.x, BASCULANTE.y, BASCULANTE.largura, BASCULANTE.altura];
const SEM_VAU = [112, 40, 5, 20];
const SEM_DESFILADEIRO = [79, 15, 5, 3];

test('morro-aceso: the generated source and the converted files are the committed ones', () => {
  for (const [nome, conteudo] of Object.entries(gerarFonteMorro())) {
    assert.ok(Buffer.from(conteudo).equals(readFileSync(`${raiz}arte/mapas-fonte/${nome}`)), `${nome} difere do gerador; rode node ferramentas/mapas/gerar-morro-aceso.mjs`);
  }
  for (const [nome, conteudo] of Object.entries(saidas(morro))) {
    assert.ok(Buffer.from(conteudo).equals(readFileSync(pastaMorro + nome)), `${nome} difere; rode node ferramentas/mapas/converter.mjs arte/mapas-fonte/morro-aceso.tmj`);
  }
});

test('morro-aceso: 128 x 96, two players, and every format rule passes', () => {
  assert.deepEqual(validarMapa(morro, dados), []);
  assert.deepEqual([morro.mapa.largura, morro.mapa.altura], [128, 96]);
  assert.equal(morro.mapa.simetria, 'nenhuma');
  assert.deepEqual(morro.mapa.jogadores.map(j => j.faccao), ['religadores', 'desligados']);
});

test('morro-aceso: two ways reach the Hill, the narrow one by the gorge and the open one by the ford, and nothing else', () => {
  const pelaGarganta = passosAte(bloqueioMorro(PONTE_FECHADA, SEM_VAU), BASE_MORRO, SUBESTACAO);
  const peloVau = passosAte(bloqueioMorro(PONTE_FECHADA, SEM_DESFILADEIRO), BASE_MORRO, SUBESTACAO);
  assert.ok(pelaGarganta > 0 && peloVau > 0, `garganta ${pelaGarganta}, vau ${peloVau}`);
  // close enough that the choice is about the guards and the patrols, not the walk
  assert.ok(Math.abs(pelaGarganta - peloVau) * 5 <= Math.min(pelaGarganta, peloVau), `garganta ${pelaGarganta}, vau ${peloVau}`);
  assert.equal(passosAte(bloqueioMorro(PONTE_FECHADA, SEM_VAU, SEM_DESFILADEIRO), BASE_MORRO, SUBESTACAO), -1, 'com o vau, a garganta e a ponte basculante fechados, o Morro fica isolado');
  // the bascule bridge, once re-powered, is a real shortcut for the open way
  const pelaBasculante = passosAte(bloqueioMorro(SEM_VAU, SEM_DESFILADEIRO), BASE_MORRO, SUBESTACAO);
  assert.ok(pelaBasculante > 0 && pelaBasculante * 10 <= peloVau * 92, `basculante ${pelaBasculante} contra vau ${peloVau}`);
});

test('morro-aceso: the Old Bridge is the way north to the North Yard and the camp', () => {
  const cemiterio = morro.entidades.nos.find(n => n.id === 'cemiterio-norte');
  const alvo = [cemiterio.x - 7, cemiterio.y + 6];
  const comPonte = passosAte(bloqueioMorro(PONTE_FECHADA), BASE_MORRO, alvo);
  const semPonte = passosAte(bloqueioMorro(PONTE_FECHADA, [33, 44, 3, 6]), BASE_MORRO, alvo);
  assert.ok(comPonte > 0 && semPonte > 2 * comPonte, `com a Ponte Velha ${comPonte}, sem ela ${semPonte}`);
});

test('morro-aceso: the bascule bridge spans the river, deck over the water and land at both ends', () => {
  const ponte = morro.entidades.entidades.find(e => e.tipo === 'ponte-basculante');
  assert.deepEqual([ponte.x, ponte.y, ponte.dono, ponte.etiqueta], [BASCULANTE.x, BASCULANTE.y, -1, 'ponte-basculante']);
  const solo = camada(morro.mapa, morro.camadas, 'solo');
  const passagem = camada(morro.mapa, morro.camadas, 'passagem');
  const agua = morro.mapa.solos.findIndex(s => s.nome === 'agua-funda');
  for (let x = ponte.x; x < ponte.x + BASCULANTE.largura; x++) {
    const [y0, y1] = aguaDoRio(x);
    assert.ok(y0 > ponte.y && y1 < ponte.y + BASCULANTE.altura - 1, `a coluna ${x} da ponte cobre o rio inteiro`);
    for (let y = ponte.y; y < ponte.y + BASCULANTE.altura; y++) assert.equal(passagem[y * morro.mapa.largura + x], PASSAGEM.LIVRE, `tabuleiro em ${x},${y}`);
    for (let y = y0; y <= y1; y++) assert.equal(solo[y * morro.mapa.largura + x], agua, `água sob o tabuleiro em ${x},${y}`);
  }
});

test('morro-aceso: nodes, structures and the camp are where the mission needs them', () => {
  const cargaDoNo = id => {
    const k = morro.entidades.nos.findIndex(n => n.id === id);
    return morro.entidades.entidades.filter(e => e.tipo === 'pilha' && e.no === k).reduce((s, e) => s + e.carga, 0);
  };
  assert.deepEqual(['entulho', 'cemiterio-norte', 'ferro-velho'].map(cargaDoNo), [2500, 9000, 6000]);
  const livre = bloqueio(morro.mapa, morro.camadas);
  for (const e of morro.entidades.entidades.filter(e => e.tipo === 'pilha')) {
    const lados = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => !livre[celulaDe(morro, [e.x + dx, e.y + dy])]).length;
    assert.ok(lados >= 3, `pilha em ${e.x},${e.y} com ${lados} lados livres`);
  }
  const alt = camada(morro.mapa, morro.camadas, 'altura');
  const subestacao = morro.entidades.entidades.find(e => e.tipo === 'subestacao');
  assert.equal(alt[celulaDe(morro, [subestacao.x, subestacao.y])], 2, 'a Subestação fica no alto do Morro');
  const dentro = (e, nome) => {
    const a = morro.entidades.areas[nome];
    return e.x >= a.x && e.y >= a.y && e.x < a.x + a.largura && e.y < a.y + a.altura;
  };
  const daEtiqueta = etiqueta => morro.entidades.entidades.find(e => e.etiqueta === etiqueta);
  assert.ok(dentro(daEtiqueta('qg-jogador'), 'base-jogador'));
  for (const etiqueta of ['catraca-carrocao-mae', 'catraca-paiol', 'catraca-barracao', 'catraca-ferraria']) assert.ok(dentro(daEtiqueta(etiqueta), 'acampamento'), etiqueta);
  assert.ok(dentro(daEtiqueta('posto-torre'), 'cemiterio-norte'));
  assert.ok(dentro(daEtiqueta('caminhao-tombado'), 'resgate'));
  assert.ok(dentro(daEtiqueta('torre-antiga-colina'), 'colina'));
  // the camp's flight ends in its refuge, and each wave route ends where its team looks for targets
  const fim = rota => morro.entidades.rotas[rota].at(-1);
  const naArea = ([x, y], nome) => dentro({ x, y }, nome);
  assert.ok(naArea(fim('rota-fuga'), 'refugio-grota'));
  for (const rota of ['rota-ponte-velha', 'rota-sul', 'rota-comboio']) assert.ok(naArea(fim(rota), 'base-jogador'), rota);
  for (const rota of ['rota-final-varzea', 'rota-final-desfiladeiro']) assert.ok(naArea(fim(rota), 'subestacao-entorno'), rota);
});

// Same trip model as the sandbox's: the rubble by the ramp is a starter yard, dry within a few minutes, so the North
// Yard is the next step (stage M2).
test('morro-aceso: the rubble yard runs dry in 3 to 7 minutes with saturated harvesters', () => {
  const economia = JSON.parse(readFileSync(`${raiz}site/rts/dados/economia.json`, 'utf8'));
  const guincho = dados.unidades.find(u => u.nome === 'guincho-de-celulas');
  const bloqueado = bloqueio(morro.mapa, morro.camadas);
  const k = morro.entidades.nos.findIndex(n => n.id === 'entulho');
  const pilhas = morro.entidades.entidades.filter(e => e.tipo === 'pilha' && e.no === k);
  const longe = (x, y) => pilhas.every(p => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) >= economia.distanciaMinimaPilha);
  // the depot stands on the plateau, inside the base
  const base = morro.entidades.areas['base-jogador'];
  let soma = 0;
  for (const pilha of pilhas) {
    const dist = distancias(morro.mapa, bloqueado, [pilha.x + 1, pilha.y]);
    let menor = Infinity;
    for (let i = 0; i < dist.length; i++) {
      const x = i % morro.mapa.largura;
      const y = Math.trunc(i / morro.mapa.largura);
      if (dist[i] >= 0 && x >= base.x && y >= base.y && x < base.x + base.largura && y < base.y + base.altura && longe(x, y)) menor = Math.min(menor, dist[i]);
    }
    soma += Math.trunc((2 * menor * 100 * 1000) / guincho.velocidade) + guincho.coleta.carregarMs + guincho.coleta.descarregarMs;
  }
  const total = pilhas.reduce((s, p) => s + p.carga, 0);
  const minutos = ((total / guincho.coleta.carga) * (soma / pilhas.length)) / economia.saturacao / 60000;
  assert.ok(minutos >= 3 && minutos <= 7, `entulho esgota em ${minutos.toFixed(1)} min`);
});
