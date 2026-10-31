// Pure parts of the RTS renderer: projection contract, dynamic scale controller and sprite manifest reader.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { criarProjecao, validarProjecao, pxPorCelula, escolherNivel, mundoParaTela, telaParaMundo, areaVisivel } from '../site/rts/js/render/projecao.js';
import { criarControleDeEscala, DEGRAUS } from '../site/rts/js/render/escala.js';
import { lerManifesto, lerManifestoTerreno, direcaoDoAngulo, quadroDaAnimacao } from '../site/rts/js/ativos/manifesto.js';
import { existsSync } from 'node:fs';
import { pontoDeEncaixe } from '../site/rts/js/render/sprites.js';

const projecaoJson = JSON.parse(readFileSync(new URL('../site/rts/dados/projecao.json', import.meta.url), 'utf8'));
const copia = () => structuredClone(projecaoJson);

test('projecao.json is valid and internally consistent', () => {
  assert.doesNotThrow(() => validarProjecao(copia()));
});

test('projecao.json rejects a Blender camera that disagrees with the elevation', () => {
  const dados = copia();
  dados.camera.elevacaoGraus = 50;
  assert.throws(() => validarProjecao(dados), /blenderRotacaoGraus/);
});

test('projecao.json rejects a sun vector that disagrees with azimuth and elevation', () => {
  const dados = copia();
  dados.sol.azimuteTelaGraus = 120;
  assert.throws(() => validarProjecao(dados), /vetorParaOSol/);
});

test('the default view shows 30 columns at 16:9 and lands exactly on the art levels', () => {
  const p = criarProjecao(copia());
  assert.equal(pxPorCelula(p, 3840, 2160), 128);
  assert.equal(pxPorCelula(p, 1920, 1080), 64);
  assert.equal(3840 / pxPorCelula(p, 3840, 2160), 30);
});

test('the visible rows stay fixed across aspect ratios and the columns are clamped', () => {
  const p = criarProjecao(copia());
  const linhas = (l, a) => a / (pxPorCelula(p, l, a) * p.seno);
  assert.ok(Math.abs(linhas(3024, 1964) - linhas(3840, 2160)) < 1e-9, 'a 16:10 laptop sees the same depth');
  assert.ok(Math.abs(3024 / pxPorCelula(p, 3024, 1964) - 26) < 0.1);
  assert.equal(5120 / pxPorCelula(p, 5120, 1440), 40, 'a 32:9 screen is capped at 40 columns');
  assert.equal(1024 / pxPorCelula(p, 1024, 1024), 24, 'a square window keeps at least 24 columns');
  assert.equal(pxPorCelula(p, 3840, 2160, 1.25), 160);
});

test('hd is used up to a slight magnification, uhd above it', () => {
  const p = criarProjecao(copia());
  assert.equal(escolherNivel(p, 64), 'hd');
  assert.equal(escolherNivel(p, 72), 'hd');
  assert.equal(escolherNivel(p, 85), 'uhd');
  assert.equal(escolherNivel(p, 128), 'uhd');
});

test('screen and map conversions are inverse on the ground and foreshorten y by sin(elevation)', () => {
  const p = criarProjecao(copia());
  const camera = { x: 50, y: 40, zoom: 1 };
  const vista = { largura: 3840, altura: 2160, px: 128 };
  const tela = mundoParaTela(p, camera, vista, 53, 42, 0, [0, 0]);
  assert.equal(tela[0], 1920 + 3 * 128);
  assert.ok(Math.abs(tela[1] - (1080 + 2 * 128 * Math.sin((55 * Math.PI) / 180))) < 1e-9);
  const volta = telaParaMundo(p, camera, vista, tela[0], tela[1], [0, 0]);
  assert.ok(Math.abs(volta[0] - 53) < 1e-9 && Math.abs(volta[1] - 42) < 1e-9);
  const alto = mundoParaTela(p, camera, vista, 53, 42, 4, [0, 0]);
  assert.ok(Math.abs(tela[1] - alto[1] - 128 * Math.cos((55 * Math.PI) / 180)) < 1e-9, '4 m up rises one cell times cos(elevation)');
  const area = areaVisivel(p, camera, vista, 0, [0, 0, 0, 0]);
  assert.ok(Math.abs(area[2] - area[0] - 30) < 1e-9);
  assert.ok(Math.abs(area[3] - area[1] - 2160 / (128 * p.seno)) < 1e-9);
});

// Feeds the controller a constant frame interval for a while and returns the last scale.
function alimentar(controle, inicio, duracaoMs, intervaloMs) {
  let agora = inicio;
  let escala = controle.escala;
  while (agora < inicio + duracaoMs) {
    agora += intervaloMs;
    escala = controle.registrar(agora, intervaloMs);
  }
  return { agora, escala };
}

test('dynamic scale steps down after 2 s of blown frames, one step at a time', () => {
  const c = criarControleDeEscala();
  let r = alimentar(c, 0, 1900, 30);
  assert.equal(r.escala, 1, 'not before the window is full');
  r = alimentar(c, r.agora, 300, 30);
  assert.equal(r.escala, 0.85);
  r = alimentar(c, r.agora, 1500, 30);
  assert.equal(r.escala, 0.85, 'the next step needs another full window');
  r = alimentar(c, r.agora, 700, 30);
  assert.equal(r.escala, 0.75);
});

test('dynamic scale ignores a few isolated slow frames', () => {
  const c = criarControleDeEscala();
  let agora = 0;
  for (let k = 0; k < 600; k++) {
    const intervalo = k % 20 === 0 ? 40 : 1000 / 60;
    agora += intervalo;
    c.registrar(agora, intervalo);
  }
  assert.equal(c.escala, 1);
});

test('dynamic scale probes up after 5 s of calm and backs off when the probe fails', () => {
  const c = criarControleDeEscala();
  let r = alimentar(c, 0, 2100, 30);
  assert.equal(r.escala, 0.85);
  r = alimentar(c, r.agora, 4800, 1000 / 60);
  assert.equal(r.escala, 0.85, 'still calming down');
  r = alimentar(c, r.agora, 400, 1000 / 60);
  assert.equal(r.escala, 1, 'probe after 5 s');
  r = alimentar(c, r.agora, 400, 30);
  assert.equal(r.escala, 0.85, 'a failing probe steps back quickly');
  assert.equal(c.estado.calmaMs, 10000);
  r = alimentar(c, r.agora, 9000, 1000 / 60);
  assert.equal(r.escala, 0.85, 'waits longer before the next probe');
  r = alimentar(c, r.agora, 1500, 1000 / 60);
  assert.equal(r.escala, 1);
  r = alimentar(c, r.agora, 2500, 1000 / 60);
  assert.equal(c.estado.calmaMs, 5000, 'a probe that survives resets the wait');
});

test('dynamic scale starting low waits a calm stretch before the first probe', () => {
  const c = criarControleDeEscala({ degrauInicial: DEGRAUS.length - 1 });
  let r = alimentar(c, 0, 4800, 1000 / 60);
  assert.equal(r.escala, 0.5);
  r = alimentar(c, r.agora, 400, 1000 / 60);
  assert.equal(r.escala, 0.67);
});

test('dynamic scale can be pinned and released', () => {
  const c = criarControleDeEscala();
  c.fixar(0.5);
  assert.equal(alimentar(c, 0, 10000, 1000 / 60).escala, 0.5);
  assert.throws(() => c.fixar(0.6), /degraus/);
  c.fixar(null);
  assert.deepEqual([...DEGRAUS], [1, 0.85, 0.75, 0.67, 0.5]);
});

function manifestoExemplo() {
  const quadros = [];
  const pontos = [];
  // parado: 4 directions x 1 frame; andando: 4 x 2; morrendo: 2 directions x 3
  for (let i = 0; i < 4 + 8 + 6; i++) {
    quadros.push([0, (i % 8) * 64, Math.floor(i / 8) * 64, 60, 50, -30, -40]);
    pontos.push(i < 12 ? [i, -20] : null);
  }
  return {
    versao: 1,
    asset: 'teste-veiculo',
    tipo: 'unidade',
    direcoes: 4,
    camadas: ['corpo'],
    animacoes: {
      parado: { quadros: 1, fps: 0 },
      andando: { quadros: 2, fps: 10, laco: true },
      morrendo: { quadros: 3, fps: 10, laco: false, direcoes: 2 },
    },
    paginas: { uhd: [{ cor: 'p0.cor.webp', time: 'p0.time.webp', largura: 512, altura: 256 }] },
    quadros: { uhd: quadros },
    pontos: { uhd: { topo: pontos } },
  };
}

test('the manifest reader lays out animations, directions and frames in order', () => {
  const m = lerManifesto(manifestoExemplo(), 'https://exemplo.test/sprites/teste.json');
  assert.equal(m.totalQuadros, 18);
  assert.equal(m.animacao('andando').base, 4);
  assert.equal(m.animacao('morrendo').base, 12);
  assert.equal(m.niveis.uhd.paginas[0].cor, 'https://exemplo.test/sprites/p0.cor.webp');
  assert.equal(quadroDaAnimacao(m.animacao('andando'), 3, 0.15), 4 + 3 * 2 + 1);
  assert.equal(quadroDaAnimacao(m.animacao('andando'), 3, 0.25), 4 + 3 * 2 + 0, 'loops');
  assert.equal(quadroDaAnimacao(m.animacao('morrendo'), 1, 5), 12 + 1 * 3 + 2, 'holds the last frame');
  assert.equal(quadroDaAnimacao(m.animacao('andando'), 2, -0.2), 4 + 2 * 2, 'a negative time holds the first frame');
  assert.equal(m.niveis.uhd.pontos.topo[5 * 2], 5);
  assert.ok(Number.isNaN(m.niveis.uhd.pontos.topo[13 * 2]), 'missing point is NaN');
  assert.equal(m.niveis.hd, undefined);
});

test('the manifest reader refuses frames that leave the page or miscount', () => {
  const fora = manifestoExemplo();
  fora.quadros.uhd[3] = [0, 480, 0, 60, 50, 0, 0];
  assert.throws(() => lerManifesto(fora), /sai da página/);
  const curto = manifestoExemplo();
  curto.quadros.uhd.pop();
  assert.throws(() => lerManifesto(curto), /esperava 18 quadros/);
  const pontosCurtos = manifestoExemplo();
  pontosCurtos.pontos.uhd.topo.pop();
  assert.throws(() => lerManifesto(pontosCurtos), /um par por quadro/);
});

test('map angles in 0..255 pick the nearest rendered direction', () => {
  assert.equal(direcaoDoAngulo(0, 16), 0);
  assert.equal(direcaoDoAngulo(8, 16), 1, 'halfway rounds up');
  assert.equal(direcaoDoAngulo(64, 16), 4, 'south (clockwise on screen) is a quarter turn');
  assert.equal(direcaoDoAngulo(255, 16), 0, 'wraps around');
  assert.equal(direcaoDoAngulo(128, 32), 16);
});

// ---------- unit instances: interpolation by id with generation, culling, ordering ----------

import { criarMontagemUnidades } from '../site/rts/js/render/unidades.js';
import { criarOrdenacao } from '../site/rts/js/render/ordenacao.js';
import { idDe, FP } from '../site/rts/js/sim/contratos.js';

// A stand-in for the sprite sheets: one body sheet per kind, 16 directions, no turret.
function folhasFalsas() {
  const parado = { nome: 'parado', camada: 'corpo', quadros: 1, fps: 0, laco: true, direcoes: 16, base: 0 };
  const folha = asset => ({ asset, primeiroQuadro: asset === 'ficha-tanque' ? 100 : 0, direcoes: 16, pxNivel: 96, nivel: 'uhd', animacoes: new Map([['parado', parado]]), pontos: {}, alturaBarraMetros: 2 });
  const lista = new Map([['ficha-veiculo-leve', folha('ficha-veiculo-leve')], ['ficha-tanque', folha('ficha-tanque')]]);
  return { folha: nome => lista.get(nome) ?? null, totalQuadros: 116 };
}

const LADO_MAPA = 100;

function retrato(tick, entidades, visivel = () => true) {
  const n = entidades.length;
  const visao = new Uint8Array(LADO_MAPA * LADO_MAPA);
  for (let i = 0; i < visao.length; i++) visao[i] = visivel(i % LADO_MAPA, Math.floor(i / LADO_MAPA)) ? 255 : 128;
  const r = { tick, n, visao, id: new Int32Array(n), tipo: new Uint16Array(n), dono: new Uint8Array(n), x: new Int32Array(n), y: new Int32Array(n), dirCorpo: new Uint8Array(n), dirTorre: new Uint8Array(n), inicioAnim: new Int32Array(n), vida: new Uint8Array(n) };
  entidades.forEach((e, k) => {
    r.id[k] = e.id;
    r.tipo[k] = e.tipo ?? 0;
    r.dono[k] = e.dono ?? 0;
    r.x[k] = Math.round(e.x * FP);
    r.y[k] = Math.round(e.y * FP);
    r.dirCorpo[k] = e.dir ?? 0;
    r.vida[k] = e.vida ?? 255;
  });
  return r;
}

function montarCom(estado, opcoes = {}) {
  const projecao = criarProjecao(copia());
  const m = criarMontagemUnidades({ projecao, folhas: folhasFalsas() });
  const mapa = { largura: LADO_MAPA, altura: LADO_MAPA };
  m.montar({ estado: { mapa, ...estado }, area: opcoes.area ?? [0, 0, 100, 100], selecionadas: opcoes.selecionadas ?? new Set(), agora: opcoes.agora ?? 0 });
  return m;
}

const posicoes = m => Array.from({ length: m.sprites.n }, (_, i) => [m.sprites.dados[i * 8], m.sprites.dados[i * 8 + 1]]);

test('units are interpolated between snapshots only when id and generation match', () => {
  const anterior = retrato(10, [{ id: idDe(1, 1), x: 10, y: 10 }, { id: idDe(2, 1), x: 20, y: 20 }]);
  // slot 2 was freed and taken by a new entity (generation 2) far away: it must not slide from the old one
  const atual = retrato(11, [{ id: idDe(1, 1), x: 11, y: 10 }, { id: idDe(2, 2), x: 21, y: 20.5 }]);
  const m = montarCom({ anterior, atual, chegadaAtual: 0, jogadorLocal: 0 }, { agora: 1000 / 60 });
  const [a, b] = posicoes(m).sort((p, q) => p[0] - q[0]);
  assert.ok(Math.abs(a[0] - 10.5) < 1e-3, `same entity halfway: ${a[0]}`);
  assert.deepEqual(b.map(v => +v.toFixed(3)), [21, 20.5], 'new generation starts where it is');
});

test('facings are interpolated along the shortest turn', () => {
  const anterior = retrato(1, [{ id: idDe(5, 1), x: 5, y: 5, dir: 250 }]);
  const atual = retrato(2, [{ id: idDe(5, 1), x: 5, y: 5, dir: 6 }]);
  const projecao = criarProjecao(copia());
  const folhas = folhasFalsas();
  const m = criarMontagemUnidades({ projecao, folhas });
  m.montar({ estado: { mapa: { largura: LADO_MAPA, altura: LADO_MAPA }, anterior, atual, chegadaAtual: 0, jogadorLocal: 0 }, area: [0, 0, 10, 10], selecionadas: new Set(), agora: 1000 / 60 });
  // halfway between 250 and 6 the short way is 0 (east), the first direction
  assert.equal(m.sprites.dados[4], 0);
});

test('units outside the visible ground or in enemy fog are culled', () => {
  const atual = retrato(1, [
    { id: idDe(1, 1), x: 5, y: 5 },
    { id: idDe(2, 1), x: 50, y: 5 },
    { id: idDe(3, 1), x: 6, y: 6, dono: 1 },
    { id: idDe(4, 1), x: 7, y: 7, dono: 1 },
    { id: idDe(5, 1), x: 8, y: 8, dono: 0 },
  ], cx => cx <= 6);
  const m = montarCom({ anterior: null, atual, chegadaAtual: 0, jogadorLocal: 0 }, { area: [0, 0, 20, 20] });
  assert.deepEqual(posicoes(m).map(p => p[0]).sort((a, b) => a - b), [5, 6, 8], 'own units show even in fog');
});

test('sprites come out back to front and selection adds a ring and a bar', () => {
  const atual = retrato(1, [
    { id: idDe(1, 1), x: 5, y: 9, tipo: 1 },
    { id: idDe(2, 1), x: 6, y: 3 },
    { id: idDe(3, 1), x: 7, y: 6, vida: 128 },
  ]);
  const m = montarCom({ anterior: null, atual, chegadaAtual: 0, jogadorLocal: 0 }, { selecionadas: new Set([idDe(2, 1)]) });
  assert.deepEqual(posicoes(m).map(p => p[1]), [3, 6, 9]);
  assert.equal(m.sprites.dados[2 * 8 + 4], 100, 'kind 1 uses the tank placeholder sheet');
  assert.equal(m.aneis.n, 1);
  assert.equal(m.barras.n, 2, 'selected and damaged units get a bar');
  assert.equal(m.sombras.n, 3);
});

test('the radix ordering is stable for equal keys', () => {
  const o = criarOrdenacao(4);
  const chaves = [300, 5, 300, 5, 4464, 0, 65535];
  o.garantir(chaves.length);
  chaves.forEach((c, i) => (o.chaves[i] = c));
  const indices = Array.from(o.ordenar(chaves.length).subarray(0, chaves.length));
  assert.deepEqual(indices, [5, 1, 3, 0, 2, 4, 6]);
});

// ---------- canvas size ----------

import { tamanhoNativo, TETO_PIXELS } from '../site/rts/js/render/resolucao.js';

test('the canvas follows CSS size times DPR, capped at the pixel count of 4K keeping the aspect', () => {
  assert.deepEqual(tamanhoNativo(1920, 1080, 2), [3840, 2160]);
  assert.deepEqual(tamanhoNativo(1512, 982, 2), [3024, 1964], 'a MacBook screen is under the cap');
  const [l, a] = tamanhoNativo(2560, 1440, 2);
  assert.ok(l * a <= TETO_PIXELS && Math.abs(l / a - 16 / 9) < 0.002, `5K is brought down to 4K: ${l}x${a}`);
  const [lu, au] = tamanhoNativo(2560, 1080, 2);
  assert.ok(lu * au <= TETO_PIXELS && lu > 3840, `an ultrawide keeps more width than 3840: ${lu}x${au}`);
  assert.deepEqual(tamanhoNativo(800, 600, 1), [800, 600]);
});

test('the manifest reader keeps every point name, halves uhd points for hd and reads the shadow page', () => {
  const m = manifestoExemplo();
  m.paginas.uhd[0].sombra = 'p0.sombra.webp';
  m.paginas.hd = [{ cor: 'h0.cor.webp', time: 'h0.time.webp', largura: 256, altura: 128 }];
  m.quadros.hd = m.quadros.uhd.map(([p, x, y, l, a, dx, dy]) => [p, x / 2, y / 2, l / 2, a / 2, dx / 2, dy / 2]);
  m.pontos.uhd.giroflex = m.pontos.uhd.topo.map(p => (p ? [p[0] + 1, p[1] - 10] : null));
  const lido = lerManifesto(m, 'https://exemplo.test/s/m.json');
  assert.equal(lido.niveis.uhd.paginas[0].sombra, 'https://exemplo.test/s/p0.sombra.webp');
  assert.equal(lido.niveis.hd.paginas[0].sombra, null);
  assert.deepEqual(Object.keys(lido.niveis.hd.pontos).sort(), ['giroflex', 'topo']);
  assert.equal(lido.niveis.hd.pontos.giroflex[3 * 2], 2, 'hd point is half of the uhd one');
});

test('the turret anchor is a ground point; other points are heights over the anchor', () => {
  const projecao = criarProjecao(copia());
  const folha = { pxNivel: 128, pontos: { encaixe_torre: Float32Array.from([-64, -26.2]), topo: Float32Array.from([0, -73.4]) } };
  const saida = new Float64Array(3);
  assert.ok(pontoDeEncaixe(folha, 'encaixe_torre', 0, projecao, saida));
  assert.equal(saida[0], -0.5);
  assert.ok(Math.abs(saida[1] - -26.2 / (128 * projecao.seno)) < 1e-6 && saida[2] === 0, 'north of the anchor on the ground');
  assert.ok(pontoDeEncaixe(folha, 'topo', 0, projecao, saida));
  assert.ok(saida[1] === 0 && Math.abs(saida[2] - (73.4 / 128) * (4 / projecao.cosseno)) < 1e-6, 'a height in metres');
  assert.equal(pontoDeEncaixe(folha, 'boca', 0, projecao, saida), false);
});

// Consumer side of contract C9: every asset the art index lists must be readable by the renderer, with its pages on disk.
test('every manifest in the art index is readable by the renderer', () => {
  const caminhoIndice = new URL('../site/rts/assets/indice.json', import.meta.url);
  if (!existsSync(caminhoIndice)) return;
  const indice = JSON.parse(readFileSync(caminhoIndice, 'utf8'));
  const entradas = Object.entries(indice.assets ?? {});
  assert.ok(entradas.length > 0, 'the index lists assets');
  for (const [nome, entrada] of entradas) {
    const url = new URL(entrada.manifesto, caminhoIndice);
    const json = JSON.parse(readFileSync(url, 'utf8'));
    if (json.tipo === 'terreno') {
      const terreno = lerManifestoTerreno(json, url);
      for (const nivel of Object.values(terreno.niveis)) assert.ok(existsSync(new URL(nivel.cor)), `${nome}: ${nivel.cor}`);
      continue;
    }
    const m = lerManifesto(json, url);
    assert.equal(m.asset, nome);
    for (const nivel of Object.values(m.niveis)) {
      for (const pagina of nivel.paginas) {
        for (const arquivo of [pagina.cor, pagina.time, pagina.sombra].filter(Boolean)) assert.ok(existsSync(new URL(arquivo)), `${nome}: ${arquivo}`);
      }
    }
    for (const [animacao, a] of Object.entries(json.animacoes)) {
      if (a.base !== undefined) assert.equal(m.animacao(animacao).base, a.base, `${nome}: base of ${animacao}`);
    }
  }
});

test('a terrain manifest needs square tiles and a tile size in cells', () => {
  const base = { versao: 1, asset: 'terreno-teste', tipo: 'terreno', celulasPorLadrilho: 8, paginas: { uhd: [{ cor: 't.webp', largura: 1024, altura: 1024 }] } };
  assert.equal(lerManifestoTerreno(base, 'https://exemplo.test/t/m.json').niveis.uhd.cor, 'https://exemplo.test/t/t.webp');
  assert.throws(() => lerManifestoTerreno({ ...base, celulasPorLadrilho: 0 }), /celulasPorLadrilho/);
  assert.throws(() => lerManifestoTerreno({ ...base, paginas: { uhd: [{ cor: 't.webp', largura: 1024, altura: 512 }] } }), /quadrada/);
});

// ---------- terrain height: levels, slopes, cliffs and the view ray ----------

import { criarRelevo, niveisDeDesenho, limitesPorCelula, AMOSTRAS_POR_CELULA } from '../site/rts/js/render/relevo.js';
import { seguirRaio } from '../site/rts/js/render/projecao.js';

// 24 x 24 cells: level 0 to the west, a level-2 plateau from column 12 whose west rim (column 11) is blocked, and an
// open ramp at rows 18..20 where column 11 is a level-1 open cell joining both sides.
function mapaDeDegraus() {
  const largura = 24;
  const altura = 24;
  const bloqueado = new Uint8Array(largura * altura);
  const nivel = new Uint8Array(largura * altura);
  for (let y = 0; y < altura; y++) {
    for (let x = 12; x < largura; x++) nivel[y * largura + x] = 2;
    const rampa = y >= 18 && y <= 20;
    bloqueado[y * largura + 11] = rampa ? 0 : 1;
    nivel[y * largura + 11] = rampa ? 1 : 0;
  }
  return { largura, altura, bloqueado, nivel };
}

test('projecao.json gives metres per level and the view ray constant', () => {
  const p = criarProjecao(copia());
  assert.equal(p.metrosPorNivel, 4);
  assert.equal(p.nivelMaximo, 3);
  assert.ok(Math.abs(p.celulasPorMetroDeAltura - Math.cos((55 * Math.PI) / 180) / (4 * Math.sin((55 * Math.PI) / 180))) < 1e-12);
  const sem = copia();
  delete sem.metrosPorNivel;
  assert.throws(() => validarProjecao(sem), /metrosPorNivel/);
});

test('a blocked region rises to the highest level it touches; open cells keep theirs', () => {
  const mapa = mapaDeDegraus();
  const niveis = niveisDeDesenho(mapa, 3);
  assert.equal(niveis[5 * 24 + 11], 2, 'the blocked rim at the foot of the plateau stands at the plateau level');
  assert.equal(niveis[5 * 24 + 10], 0);
  assert.equal(niveis[19 * 24 + 11], 1, 'the open ramp cell keeps its level');
  // an isolated rock on flat ground stays flat
  const plano = { largura: 8, altura: 8, bloqueado: new Uint8Array(64), nivel: new Uint8Array(64) };
  plano.bloqueado[3 * 8 + 3] = 1;
  assert.equal(niveisDeDesenho(plano, 3)[3 * 8 + 3], 0);
});

test('cliffs step within a quarter cell and open ramps slope from centre to centre', () => {
  const p = criarProjecao(copia());
  const r = criarRelevo(mapaDeDegraus(), p);
  assert.equal(r.larguraFina, 24 * AMOSTRAS_POR_CELULA);
  assert.equal(r.alturaMaxima, 12);
  assert.ok(Math.abs(r.alturaEm(14.5, 5.5) - 8) < 0.05, 'plateau top at two levels');
  assert.ok(Math.abs(r.alturaEm(11.5, 5.5) - 8) < 0.05, 'the rim is part of the plateau');
  assert.ok(r.alturaEm(9.5, 5.5) < 0.05, 'low ground west of the cliff stays flat');
  // across the cliff (column 11's west edge) the height goes from 0 to 8 m within about half a cell
  assert.ok(r.alturaEm(10.6, 5.5) < 0.5 && r.alturaEm(11.4, 5.5) > 7.5);
  // the ramp row climbs smoothly from level 0 through 1 to 2
  const subida = [9.5, 10.5, 11, 11.5, 12, 12.5].map(x => r.alturaEm(x, 19.5));
  for (let i = 1; i < subida.length; i++) assert.ok(subida[i] >= subida[i - 1] - 1e-9, `ramp not monotonic at ${i}: ${subida}`);
  assert.ok(Math.abs(r.alturaEm(11.5, 19.5) - 4) < 0.1, 'ramp cell centre at one level');
  assert.ok(Math.abs(r.alturaEm(11, 19.5) - 2) < 0.4, 'halfway up between the centres');
});

test('the view ray lands on the plateau top, the cliff face or the ground in front', () => {
  const p = criarProjecao(copia());
  const r = criarRelevo(mapaDeDegraus(), p);
  const k = p.celulasPorMetroDeAltura;
  const saida = [0, 0, 0];
  // ground point well inside the plateau: the ray meets the top 8 m up, 8k cells south of the ground point
  seguirRaio(p, r, 16.5, 6, saida);
  assert.ok(Math.abs(saida[2] - 8) < 0.05 && Math.abs(saida[1] - (6 + 8 * k)) < 0.02);
  // flat ground far west: the ray reaches the ground plane where it started
  seguirRaio(p, r, 4.5, 6, saida);
  assert.deepEqual([saida[0], saida[1], saida[2]], [4.5, 6, 0]);
  // ground point on the low side, just in front of a plateau to the south? there is none: still the ground
  seguirRaio(p, r, 9.5, 6, saida);
  assert.ok(saida[2] < 0.05);
});

test('screen to map follows the terrain, and map to screen lifts points by it', () => {
  const p = criarProjecao(copia());
  const relevo = criarRelevo(mapaDeDegraus(), p);
  const camera = { x: 14, y: 8, zoom: 1, relevo };
  const vista = { largura: 3840, altura: 2160, px: 128 };
  for (const [x, y] of [[16.5, 6.5], [9.5, 6.5], [11.5, 19.5], [13.2, 12.7]]) {
    const tela = mundoParaTela(p, camera, vista, x, y, 0, [0, 0]);
    const volta = telaParaMundo(p, camera, vista, tela[0], tela[1], [0, 0]);
    assert.ok(Math.abs(volta[0] - x) < 1e-9, `x at ${x},${y}`);
    assert.ok(Math.abs(volta[1] - y) < 0.03, `y at ${x},${y}: ${volta[1]}`);
  }
  const plano = mundoParaTela(p, { ...camera, relevo: undefined }, vista, 16.5, 6.5, 0, [0, 0]);
  const alto = mundoParaTela(p, camera, vista, 16.5, 6.5, 0, [0, 0]);
  assert.ok(Math.abs(plano[1] - alto[1] - 2 * 128 * p.cosseno) < 0.5, 'two levels (8 m) up rise two cells times cos(elevation)');
});

test('per-cell bounds cover the cells a view ray or a sun ray can meet', () => {
  const mapa = mapaDeDegraus();
  const niveis = niveisDeDesenho(mapa, 3);
  const { coluna, sol } = limitesPorCelula(mapa, niveis, 3, 3);
  assert.equal(coluna[5 * 24 + 4], 0, 'far from the plateau the ground is flat');
  assert.equal(coluna[5 * 24 + 10], 2, 'next to the rim the ray may meet the plateau');
  assert.equal(sol[5 * 24 + 9], 0, 'the sun comes from the north-west, the plateau is to the east');
  assert.equal(sol[5 * 24 + 14], 2);
});

// ---------- buildings: footprint order, construction, ghosts, cables, fog memory ----------

import { aparenciasDosTipos, CATEGORIA } from '../site/rts/js/render/unidades.js';
import { empacotar, formaDoPredio } from '../site/rts/js/render/sprites.js';
import { FLAGS_SPRITE, FORMA_PREDIO } from '../site/rts/js/render/shaders.js';

const TIPOS_TESTE = [
  { nome: 'turma', categoria: CATEGORIA.UNIDADE, asset: 'religadores-infantaria-turma-de-linha', pegada: [1, 1], lotacao: 1 },
  { nome: 'escritorio', categoria: CATEGORIA.PREDIO, asset: '', pegada: [4, 3] },
  { nome: 'poste', categoria: CATEGORIA.PREDIO, asset: '', pegada: [1, 1] },
  { nome: 'pilha', categoria: CATEGORIA.RECURSO, asset: '', pegada: [2, 2] },
];

function folhasDePredios() {
  const parado = direcoes => ({ nome: 'parado', camada: 'corpo', quadros: 1, fps: 0, laco: true, direcoes, base: 0 });
  const lista = new Map();
  const add = (asset, primeiroQuadro, direcoes, pontos = {}) => lista.set(asset, { asset, primeiroQuadro, direcoes, pxNivel: 96, nivel: 'uhd', animacoes: new Map([['parado', parado(direcoes)]]), pontos, alturaBarraMetros: 3, temSombra: false });
  add('ficha-infantaria', 0, 16);
  add('ficha-escritorio', 20, 1, { cabo: Float32Array.of(0, -50) });
  add('ficha-poste', 21, 1, { cabo: Float32Array.of(0, -100) });
  add('ficha-pilha', 22, 1);
  return { folha: nome => lista.get(nome) ?? null, totalQuadros: 23 };
}

function montarPredios(entidades, extras = {}, opcoes = {}) {
  const projecao = criarProjecao(copia());
  const m = criarMontagemUnidades({ projecao, folhas: folhasDePredios() });
  m.definirAparencias(aparenciasDosTipos(TIPOS_TESTE));
  if (opcoes.fantasma) m.definirFantasma(opcoes.fantasma);
  const r = retrato(10, entidades);
  const n = entidades.length;
  r.bandeiras = Uint16Array.from(entidades, e => e.bandeiras ?? 0);
  r.progresso = Uint8Array.from(entidades, e => e.progresso ?? 255);
  r.ligacao = Int32Array.from(entidades, e => e.ligacao ?? -1);
  Object.assign(r, extras);
  assert.equal(r.n, n);
  m.montar({ estado: { mapa: { largura: LADO_MAPA, altura: LADO_MAPA }, atual: r, anterior: null, chegadaAtual: 0, jogadorLocal: 0 }, area: [0, 0, 100, 100], selecionadas: opcoes.selecionadas ?? new Set(), agora: 0 });
  return m;
}

const quadrosEmOrdem = m => Array.from({ length: m.sprites.n }, (_, i) => m.sprites.dados[i * 8 + 4]);

test('kinds without art get a placeholder by category; buildings keep their footprint', () => {
  const a = aparenciasDosTipos(TIPOS_TESTE);
  assert.deepEqual(a[0].variantes.map(v => v.corpo), ['religadores-infantaria-turma-de-linha', 'ficha-infantaria']);
  assert.ok(a[1].predio && a[1].pegada[0] === 4 && a[1].variantes[0].corpo === 'ficha-escritorio');
  assert.equal(formaDoPredio(TIPOS_TESTE[2], CATEGORIA.RECURSO).forma, FORMA_PREDIO.POSTE);
  assert.equal(formaDoPredio(TIPOS_TESTE[3], CATEGORIA.RECURSO).forma, FORMA_PREDIO.PILHA);
});

test('a unit just north of a building front draws behind it, one just south in front of it', () => {
  // office centred at y = 50 with 3 rows: front edge at 51.5
  const m = montarPredios([
    { id: idDe(1, 1), tipo: 1, x: 50, y: 50 },
    { id: idDe(2, 1), tipo: 0, x: 50.5, y: 51.2 },
    { id: idDe(3, 1), tipo: 0, x: 50.5, y: 51.8 },
  ]);
  const quadros = quadrosEmOrdem(m);
  assert.equal(quadros.length, 3);
  assert.ok(quadros[0] < 20 && quadros[1] === 20 && quadros[2] < 20, `order ${quadros}`);
});

test('a building under construction packs its progress; a finished one packs none', () => {
  const m = montarPredios([
    { id: idDe(1, 1), tipo: 1, x: 40, y: 40, bandeiras: 8, progresso: 100 },
    { id: idDe(2, 1), tipo: 1, x: 60, y: 60, bandeiras: 0, progresso: 255 },
  ]);
  const empacotados = Array.from({ length: m.sprites.n }, (_, i) => m.sprites.dados[i * 8 + 5]);
  assert.equal((empacotados[0] >> 3) & 255, 100);
  assert.equal((empacotados[1] >> 3) & 255, 0);
  assert.equal(empacotados[0] >> 15, 6, 'a building reaches its front edge: three rows, half of it in quarter cells');
});

test('enemy buildings hide in the fog unless a footprint corner is visible; memories come grey', () => {
  const ve = (x, y) => x === 31 && y === 31;
  const r = retrato(10, [{ id: idDe(1, 1), tipo: 1, x: 30, y: 30, dono: 1 }, { id: idDe(2, 1), tipo: 1, x: 70, y: 70, dono: 1 }], ve);
  const m = criarMontagemUnidades({ projecao: criarProjecao(copia()), folhas: folhasDePredios() });
  m.definirAparencias(aparenciasDosTipos(TIPOS_TESTE));
  r.fantasmas = { n: 1, id: Int32Array.of(idDe(9, 1)), tipo: Uint16Array.of(1), dono: Uint8Array.of(1), x: Int32Array.of(20 * FP), y: Int32Array.of(20 * FP), vida: Uint8Array.of(255), carga: Uint8Array.of(0) };
  m.montar({ estado: { mapa: { largura: LADO_MAPA, altura: LADO_MAPA }, atual: r, anterior: null, chegadaAtual: 0, jogadorLocal: 0 }, area: [0, 0, 100, 100], selecionadas: new Set(), agora: 0 });
  assert.equal(m.sprites.n, 2, 'the one with a visible corner and the memory');
  const flags = Array.from({ length: m.sprites.n }, (_, i) => (m.sprites.dados[i * 8 + 5] >> 11) & 15);
  assert.deepEqual(flags.sort(), [0, FLAGS_SPRITE.MEMORIA]);
});

test('a cable runs from each connected building to its network node, live when powered', () => {
  const m = montarPredios([
    { id: idDe(1, 1), tipo: 1, x: 40, y: 40, bandeiras: 16 },
    { id: idDe(2, 1), tipo: 2, x: 46, y: 40, bandeiras: 16, ligacao: idDe(1, 1) },
    { id: idDe(3, 1), tipo: 2, x: 52, y: 40, bandeiras: 0, ligacao: idDe(2, 1) },
    { id: idDe(4, 1), tipo: 2, x: 58, y: 40, ligacao: idDe(77, 1) },
  ]);
  assert.equal(m.cabos.n, 2, 'a cable to a node that is gone is dropped');
  const c = m.cabos.dados;
  assert.deepEqual([c[0], c[1], c[2], c[3]], [46, 40, 40, 40]);
  assert.ok(c[4] > c[5], 'the pole hangs its cable higher than the office roof');
  assert.equal(c[6], 1);
  assert.equal(c[8 + 6], 0, 'a pole without power has a dead cable');
});

test('the placement ghost draws its footprint, red cells and a tinted sprite in the sorted draw', () => {
  const celulas = new Uint8Array(12);
  celulas[5] = 1;
  const m = montarPredios([], {}, { fantasma: { tipo: 1, cx: 10, cy: 10, largura: 4, altura: 3, valido: false, celulas } });
  assert.equal(m.pegadas.n, 2);
  assert.deepEqual(Array.from(m.pegadas.dados.subarray(8, 12)), [11, 11, 1, 1]);
  assert.equal(m.sprites.n, 1);
  assert.deepEqual([m.sprites.dados[0], m.sprites.dados[1]], [12, 11.5]);
  assert.equal((m.sprites.dados[5] >> 11) & 15, FLAGS_SPRITE.FANTASMA | FLAGS_SPRITE.INVALIDO);
});

test('selected buildings get a footprint outline instead of a ring', () => {
  const id = idDe(1, 1);
  const m = montarPredios([{ id, tipo: 1, x: 40, y: 40 }], {}, { selecionadas: new Set([id]) });
  assert.equal(m.aneis.n, 0);
  assert.equal(m.pegadas.n, 1);
  assert.deepEqual(Array.from(m.pegadas.dados.subarray(0, 4)), [38, 38.5, 4, 3]);
  assert.equal(m.barras.n, 1);
  assert.equal(empacotar(7, 255, 15, 63), 7 | (255 << 3) | (15 << 11) | (63 << 15));
});

// ---------- ground soils for the splatted terrain ----------

import { soloDoMapa, tabelaDeSolos, SOLOS_PADRAO } from '../site/rts/js/render/solos.js';

test('a map soil layer is kept; a generated map gets soils from its relief, rock where blocked', () => {
  const proprio = soloDoMapa({ largura: 2, altura: 1, bloqueado: new Uint8Array(2), relevo: new Uint8Array(2), solo: Uint8Array.of(1, 7), solos: ['terra-batida', 'lama'] });
  assert.deepEqual(Array.from(proprio.grade), [1, 1], 'indices past the table clamp to its last soil');
  assert.deepEqual(proprio.nomes, ['terra-batida', 'lama']);
  const gerado = soloDoMapa({ largura: 3, altura: 1, bloqueado: Uint8Array.of(1, 0, 0), relevo: Uint8Array.of(0, 120, 200) });
  assert.deepEqual(Array.from(gerado.grade, i => gerado.nomes[i]), ['rocha', 'capim', 'cascalho']);
});

test('soils with their own tile show it untinted; the rest tint the base tile', () => {
  const nomes = SOLOS_PADRAO.map(([nome]) => nome);
  const t = tabelaDeSolos(nomes, new Map([['terra-batida', 0], ['capim', 1]]));
  assert.deepEqual(Array.from(t.subarray(4, 8)), [1, 1, 1, 1], 'grass on its own layer');
  assert.equal(t[2 * 4 + 3], 0, 'gravel on the base tile');
  assert.ok(t[2 * 4] < 1, 'with its tint');
});

test('a blocking decoration stands as a block in the middle of its cell', () => {
  const p = criarProjecao(copia());
  const mapa = { largura: 8, altura: 8, bloqueado: new Uint8Array(64), nivel: new Uint8Array(64) };
  mapa.bloqueado[3 * 8 + 3] = 1;
  const blocos = new Uint8Array(64);
  blocos[3 * 8 + 3] = 1;
  const r = criarRelevo(mapa, p, null, blocos);
  assert.ok(Math.abs(r.alturaEm(3.5, 3.5) - 2.5) < 0.1, `top of the block: ${r.alturaEm(3.5, 3.5)}`);
  assert.ok(r.alturaEm(2.5, 3.5) < 0.05 && r.alturaEm(2.8, 3.5) < 0.05 && r.alturaEm(3.25, 3.5) > 2.4, 'ground beside it, steep sides');
  assert.equal(r.topos[3 * 8 + 3], 1, 'the shader bounds reach the block');
});

import { prediosDeBancada } from '../site/rts/js/render/medicao.js';
import { BANDEIRA } from '../site/rts/js/sim/contratos.js';

test('the benchmark rings the battle with buildings whose cables reach poles of the same ring', () => {
  const p = prediosDeBancada(60, 96, 96, 0);
  assert.equal(p.n, 60);
  assert.equal(new Set(p.id).size, 60);
  const ids = new Set(p.id);
  for (let k = 0; k < p.n; k++) if (p.ligacao[k] !== -1) assert.ok(ids.has(p.ligacao[k]), `cable of ${k} goes to a building of the ring`);
  const emObra = Array.from(p.bandeiras).filter(b => b & BANDEIRA.EM_OBRA).length;
  assert.equal(emObra, 12, 'one in five under construction');
  for (let k = 0; k < p.n; k++) assert.ok(Math.hypot(p.x[k] / 1024 - 96, p.y[k] / 1024 - 96) < 40);
});
