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
