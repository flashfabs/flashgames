// Writes the Tiled source of the sandbox map (arte/mapas-fonte/caixa-de-areia.tmj) and the shared tileset
// (terreno.tsj and terreno.png), by script, while no map editor is installed (decision D16).
// The terrain is symmetric by 180° rotation: every paint operation also paints the mirrored cell, so the map is fair
// for the skirmish later. The start entities are not symmetric: the player starts in the south-west and the scripted
// camp of the other side sits on the mirrored plateau in the north-east.
// Usage: node ferramentas/mapas/gerar-caixa-de-areia.mjs [pasta de saída, padrão arte/mapas-fonte]

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deflateSync, crc32 } from 'node:zlib';
import { SOLOS, DECORACOES, PIXELS_POR_CELULA, tilesDoTileset } from './formato.mjs';

const N = 96;
const PX = PIXELS_POR_CELULA;
const SOLO = Object.fromEntries(SOLOS.map((s, i) => [s.nome, i]));
const DECOR = Object.fromEntries(DECORACOES.map((d, i) => [d.nome, i + 1]));

// ---------- terrain ----------

function gerarTerreno() {
  const solo = new Uint8Array(N * N);
  const altura = new Uint8Array(N * N);
  const decoracao = new Uint8Array(N * N);
  const dentro = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
  // every write goes to the cell and to its 180° mirror
  const pintar = (camada, x, y, valor) => {
    if (!dentro(x, y)) return;
    camada[y * N + x] = valor;
    camada[(N - 1 - y) * N + (N - 1 - x)] = valor;
  };
  const ler = (camada, x, y) => camada[y * N + x];
  // deterministic pattern from the canonical cell of each mirrored pair, so it stays symmetric
  const padrao = (x, y, sal) => {
    const i = Math.min(y * N + x, (N - 1 - y) * N + (N - 1 - x));
    let h = Math.imul(i ^ sal, 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    return (h ^ (h >>> 16)) & 255;
  };
  const retangulo = (camada, x0, y0, x1, y1, valor) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) pintar(camada, x, y, valor);
  };
  const disco = (camada, cx, cy, r2, valor) => {
    for (let y = cy - 8; y <= cy + 8; y++) for (let x = cx - 8; x <= cx + 8; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) pintar(camada, x, y, valor);
  };
  // thick line by integer steps along the longer axis
  const estrada = (pontos, largura, valor) => {
    for (let k = 1; k < pontos.length; k++) {
      const [x0, y0] = pontos[k - 1];
      const [x1, y1] = pontos[k];
      const passos = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let s = 0; s <= passos; s++) {
        const x = x0 + Math.trunc(((x1 - x0) * s) / passos);
        const y = y0 + Math.trunc(((y1 - y0) * s) / passos);
        retangulo(solo, x, y, x + largura - 1, y + largura - 1, valor);
        retangulo(decoracao, x, y, x + largura - 1, y + largura - 1, 0);
      }
    }
  };

  // ground: red earth with grass patches
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) pintar(solo, x, y, padrao(x, y, 11) < 70 ? SOLO.capim : SOLO['terra-batida']);

  // plateau of the player's base (south-west), level 1, cliffs on the open sides, ramps north and east
  retangulo(altura, 1, 66, 29, 94, 1);
  for (let y = 66; y <= 94; y++) for (let x = 1; x <= 29; x++) if (padrao(x, y, 23) < 40) pintar(solo, x, y, SOLO.cascalho);
  const rampa = (x, y) => (y === 66 && x >= 12 && x <= 16) || (x === 29 && y >= 76 && y <= 80);
  for (let y = 66; y <= 94; y++) {
    for (let x = 1; x <= 29; x++) {
      if ((y === 66 || x === 29) && !rampa(x, y)) pintar(solo, x, y, SOLO.rocha);
    }
  }

  // river across the middle, west to east, with a wider bend; deep water blocks
  for (let x = 0; x < N; x++) {
    retangulo(solo, x, 48, x, 49, SOLO['agua-funda']);
    if (x >= 18 && x <= 27) pintar(solo, x, 50, SOLO['agua-funda']);
  }
  // muddy banks on the outer side of the bend
  for (let x = 17; x <= 28; x++) if (padrao(x, 51, 31) < 160) pintar(solo, x, 51, SOLO.lama);
  // fords, slow: one near each base (the mirror paints the other)
  retangulo(solo, 9, 46, 13, 50, SOLO['agua-rasa']);
  retangulo(solo, 9, 51, 13, 51, SOLO.lama);
  // the old bridge in the centre, two cells wide
  retangulo(solo, 47, 46, 48, 49, SOLO['asfalto-velho']);
  retangulo(decoracao, 47, 46, 48, 49, DECOR['ponte-de-concreto']);

  // road from the base's east ramp to the bridge
  estrada([[30, 78], [38, 72], [45, 62], [47, 52], [47, 50]], 2, SOLO['asfalto-velho']);

  // ruined block south-west of the bridge: rubble cover and broken walls
  for (let y = 55; y <= 64; y++) {
    for (let x = 33; x <= 44; x++) {
      if (padrao(x, y, 41) < 150) pintar(solo, x, y, SOLO.entulho);
    }
  }
  for (const [x0, y0, x1, y1] of [[34, 56, 35, 56], [38, 57, 40, 57], [43, 58, 43, 60], [35, 61, 35, 62], [39, 62, 41, 62], [37, 59, 37, 59]]) retangulo(decoracao, x0, y0, x1, y1, DECOR['muro-em-ruina']);

  // tall grass for ambushes: west flank by the ford, and east of the ruins
  for (const [x0, y0, x1, y1] of [[3, 53, 8, 60], [51, 61, 56, 66], [24, 56, 29, 60]]) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (padrao(x, y, 53) < 190) pintar(solo, x, y, SOLO['capim-alto']);
  }

  // windy hill east of the ruins: level 2 top, level 1 shoulder; every step is a gentle slope
  disco(altura, 64, 74, 30, 1);
  disco(altura, 64, 74, 6, 2);

  // scrap yard (expansion) in the south-east: gravel and dead buses
  disco(solo, 74, 60, 26, SOLO.cascalho);
  for (const [x, y] of [[69, 63], [79, 56], [72, 55]]) pintar(decoracao, x, y, DECOR['carcaca-de-onibus']);
  for (const [x, y] of [[70, 57], [78, 62], [76, 64]]) pintar(decoracao, x, y, DECOR.pneus);
  // scrap pile by the bridge
  disco(solo, 40, 53, 6, SOLO.cascalho);
  // gravel under the base node
  disco(solo, 23, 72, 14, SOLO.cascalho);

  // scattered props on open ground
  for (let y = 2; y < N - 2; y++) {
    for (let x = 2; x < N - 2; x++) {
      if (ler(solo, x, y) !== SOLO['terra-batida'] && ler(solo, x, y) !== SOLO.capim) continue;
      if (ler(decoracao, x, y)) continue;
      const v = padrao(x, y, 67);
      if (v < 3) pintar(decoracao, x, y, DECOR.pedra);
      else if (v < 5) pintar(decoracao, x, y, DECOR['arvore-seca']);
      else if (v < 6) pintar(decoracao, x, y, DECOR['poste-caido']);
    }
  }

  // the map border is rock
  for (let k = 0; k < N; k++) {
    pintar(solo, k, 0, SOLO.rocha);
    pintar(solo, 0, k, SOLO.rocha);
    pintar(decoracao, k, 0, 0);
    pintar(decoracao, 0, k, 0);
  }
  // nothing decorates rock or water
  for (let i = 0; i < N * N; i++) if (solo[i] === SOLO.rocha || solo[i] === SOLO['agua-funda']) decoracao[i] = 0;
  return { solo, altura, decoracao };
}

// ---------- entities, nodes, wind, areas, points, routes ----------

const espelho = ([x, y], [w, h] = [1, 1]) => [N - x - w, N - y - h];

function gerarObjetos() {
  const nos = [];
  const entidades = [];
  const ventosas = [];
  const no = (id, centro, pilhas, carga) => {
    nos.push({ id, x: centro[0], y: centro[1] });
    for (const [x, y] of pilhas) entidades.push({ tipo: 'pilha', x, y, w: 1, h: 1, props: { carga, no: id } });
  };
  // each node and its mirror: the base nodes, the scrap yards and the scrap by the bridge
  const parDeNos = (sul, norte, centro, pilhas, carga) => {
    no(sul, centro, pilhas, carga);
    no(norte, espelho(centro), pilhas.map(p => espelho(p)), carga);
  };
  parDeNos('cemiterio-sudoeste', 'cemiterio-nordeste', [23, 72], [[20, 69], [23, 69], [26, 70], [27, 73], [26, 76]], 1500);
  parDeNos('ferro-velho-sudeste', 'ferro-velho-noroeste', [74, 60], [[71, 58], [74, 57], [77, 59], [75, 62]], 1500);
  parDeNos('sucata-do-meio-sul', 'sucata-do-meio-norte', [40, 53], [[38, 53], [41, 52], [42, 55]], 1500);

  // windy spots (2 × 2 top-left cells) and their mirrors
  for (const v of [[3, 68], [64, 74]]) ventosas.push(v, espelho(v, [2, 2]));

  const entidade = (tipo, x, y, pegada, props) => entidades.push({ tipo, x, y, w: pegada[0], h: pegada[1], props });
  // neutral structures the Religador can bring back, mirrored
  for (const [tipo, pos, pegada] of [['torre-antiga', [52, 53], [2, 2]], ['holofote-de-estrada', [15, 53], [1, 1]]]) {
    entidade(tipo, pos[0], pos[1], pegada, { dono: -1, etiqueta: `${tipo}-sul` });
    const [mx, my] = espelho(pos, pegada);
    entidade(tipo, mx, my, pegada, { dono: -1, etiqueta: `${tipo}-norte` });
  }

  // player 0, Religadores, south-west plateau
  entidade('escritorio-regional', 5, 82, [4, 3], { dono: 0, etiqueta: 'qg-jogador' });
  for (const [x, y] of [[11, 79], [11, 84]]) entidade('guincho-de-celulas', x, y, [1, 1], { dono: 0 });
  entidade('equipe-de-manutencao', 10, 87, [1, 1], { dono: 0 });
  for (const [x, y] of [[14, 76], [16, 76], [14, 78], [16, 78]]) entidade('turma-de-linha', x, y, [1, 1], { dono: 0 });

  // player 1, Desligados: the scripted camp on the mirrored plateau
  entidade('carrocao-mae', 87, 11, [4, 3], { dono: 1, etiqueta: 'acampamento' });
  entidade('barracao', 80, 5, [3, 3], { dono: 1, etiqueta: 'acampamento' });
  entidade('ferraria-a-vapor', 84, 16, [4, 3], { dono: 1, etiqueta: 'acampamento' });
  entidade('paiol', 76, 10, [3, 2], { dono: 1 });
  entidade('torre-de-vigia', 80, 25, [2, 2], { dono: 1, etiqueta: 'guarnicao' });
  entidade('torre-de-vigia', 67, 13, [2, 2], { dono: 1, etiqueta: 'guarnicao' });
  for (const x of [76, 77, 78, 84, 85, 86]) entidade('palicada', x, 27, [1, 1], { dono: 1 });
  entidade('canhao-de-caldeira', 85, 22, [1, 1], { dono: 1, etiqueta: 'canhao-fixo' });
  for (const [x, y] of [[79, 23], [82, 23], [70, 15], [70, 21]]) entidade('chapa', x, y, [1, 1], { dono: 1, etiqueta: 'guarnicao' });

  const areas = {
    'base-jogador': [1, 66, 29, 29],
    acampamento: [66, 1, 29, 29],
    'ponte-central': [44, 44, 8, 8],
    'vau-oeste': [7, 44, 9, 9],
    'vau-leste': [80, 43, 9, 9],
    'ruinas-sul': [33, 55, 12, 10],
    'ferro-velho-sudeste': [69, 55, 11, 10],
    'cemiterio-sudoeste': [18, 67, 11, 11],
    'chegada-norte': [10, 60, 9, 6],
    'chegada-leste': [30, 74, 6, 9],
    'nascedouro-sul': [77, 30, 8, 4],
    'nascedouro-oeste': [60, 14, 4, 6],
  };
  const pontos = {
    'saida-acampamento': [81, 31],
    'saida-acampamento-oeste': [63, 17],
    'alvo-base': [14, 70],
    'alvo-coletores': [22, 68],
    'alvo-rampa-leste': [32, 78],
  };
  const rotas = {
    'rota-ponte': [[81, 31], [60, 38], [48, 44], [48, 52], [40, 66], [28, 64], [14, 64]],
    'rota-vau-leste': [[81, 31], [84, 40], [85, 52], [72, 66], [48, 76], [32, 78]],
    'rota-vau-oeste': [[63, 17], [40, 22], [16, 32], [11, 44], [11, 53], [14, 64]],
  };
  return { nos, entidades, ventosas, areas, pontos, rotas };
}

// ---------- Tiled JSON ----------

const propriedade = (name, value) => ({ name, type: Number.isInteger(value) ? 'int' : 'string', value });

function montarTmj(terreno, objetos) {
  const tiles = tilesDoTileset();
  const gidDe = (camada, codigo) => 1 + tiles.findIndex(t => t.camada === camada && t.codigo === codigo);
  let proximoId = 1;
  const objeto = (campos, props = {}) => ({
    id: proximoId++,
    name: '',
    type: '',
    rotation: 0,
    visible: true,
    ...campos,
    properties: Object.entries(props).filter(([, v]) => v !== undefined).map(([k, v]) => propriedade(k, v)),
  });
  const camadaTiles = (id, name, dados, camada, vazio) => ({
    id, name, type: 'tilelayer', x: 0, y: 0, width: N, height: N, opacity: 1, visible: true,
    data: Array.from(dados, v => (vazio && v === 0 ? 0 : gidDe(camada, v))),
  });
  const grupo = (id, name, objects) => ({ id, name, type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects });
  const camadas = [
    camadaTiles(1, 'solo', terreno.solo, 'solo', false),
    camadaTiles(2, 'altura', terreno.altura, 'altura', false),
    camadaTiles(3, 'decoracao', terreno.decoracao, 'decoracao', true),
    grupo(4, 'entidades', objetos.entidades.map(e => objeto({ type: e.tipo, x: e.x * PX, y: e.y * PX, width: e.w * PX, height: e.h * PX }, e.props))),
    grupo(5, 'nos', objetos.nos.map(n => objeto({ name: n.id, type: 'no', x: n.x * PX, y: n.y * PX, width: 0, height: 0, point: true }))),
    grupo(6, 'ventosas', objetos.ventosas.map(([x, y]) => objeto({ type: 'ventosa', x: x * PX, y: y * PX, width: 2 * PX, height: 2 * PX }))),
    grupo(7, 'areas', Object.entries(objetos.areas).map(([nome, [x, y, w, h]]) => objeto({ name: nome, type: 'area', x: x * PX, y: y * PX, width: w * PX, height: h * PX }))),
    grupo(8, 'pontos', Object.entries(objetos.pontos).map(([nome, [x, y]]) => objeto({ name: nome, type: 'ponto', x: x * PX, y: y * PX, width: 0, height: 0, point: true }))),
    grupo(9, 'rotas', Object.entries(objetos.rotas).map(([nome, pts]) => objeto({ name: nome, type: 'rota', x: pts[0][0] * PX, y: pts[0][1] * PX, width: 0, height: 0, polyline: pts.map(([x, y]) => ({ x: (x - pts[0][0]) * PX, y: (y - pts[0][1]) * PX })) }))),
  ];
  return {
    type: 'map',
    version: '1.10',
    tiledversion: '1.11.0',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    width: N,
    height: N,
    tilewidth: PX,
    tileheight: PX,
    infinite: false,
    compressionlevel: -1,
    nextlayerid: camadas.length + 1,
    nextobjectid: proximoId,
    properties: [
      propriedade('id', 'caixa-de-areia'),
      propriedade('simetria', 'rotacao-180'),
      propriedade('geradoPor', 'ferramentas/mapas/gerar-caixa-de-areia.mjs'),
      propriedade('jogadores', JSON.stringify([{ time: 0, faccao: 'religadores', base: [7, 80] }, { time: 1, faccao: 'desligados', base: [88, 15] }])),
    ],
    tilesets: [{ firstgid: 1, source: 'terreno.tsj' }],
    layers: camadas,
  };
}

/** The shared tileset: one flat-colour 16 px tile per ground kind, height and prop, each tagged with layer and code. */
export function montarTileset() {
  const tiles = tilesDoTileset();
  const colunas = 8;
  return {
    type: 'tileset',
    version: '1.10',
    tiledversion: '1.11.0',
    name: 'terreno',
    tilewidth: PX,
    tileheight: PX,
    tilecount: tiles.length,
    columns: colunas,
    margin: 0,
    spacing: 0,
    image: 'terreno.png',
    imagewidth: colunas * PX,
    imageheight: Math.ceil(tiles.length / colunas) * PX,
    tiles: tiles.map((t, id) => ({ id, properties: [propriedade('camada', t.camada), propriedade('codigo', t.codigo), propriedade('nome', t.nome)] })),
  };
}

// Minimal RGB PNG for the tileset image, so the source opens in the editor once it is approved.
function pngDoTileset() {
  const tiles = tilesDoTileset();
  const colunas = 8;
  const largura = colunas * PX;
  const altura = Math.ceil(tiles.length / colunas) * PX;
  const linhas = Buffer.alloc((largura * 3 + 1) * altura);
  for (let y = 0; y < altura; y++) {
    linhas[y * (largura * 3 + 1)] = 0;
    for (let x = 0; x < largura; x++) {
      const tile = tiles[Math.trunc(y / PX) * colunas + Math.trunc(x / PX)];
      const borda = x % PX === 0 || y % PX === 0;
      const cor = tile ? tile.cor.map(c => (borda ? c >> 1 : c)) : [0, 0, 0];
      linhas.set(cor, y * (largura * 3 + 1) + 1 + x * 3);
    }
  }
  const pedaco = (tipo, dados) => {
    const cabeca = Buffer.alloc(8);
    cabeca.writeUInt32BE(dados.length, 0);
    cabeca.write(tipo, 4, 'ascii');
    const soma = Buffer.alloc(4);
    soma.writeUInt32BE(crc32(Buffer.concat([Buffer.from(tipo, 'ascii'), dados])) >>> 0, 0);
    return Buffer.concat([cabeca, dados, soma]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pedaco('IHDR', ihdr), pedaco('IDAT', deflateSync(linhas, { level: 9 })), pedaco('IEND', Buffer.alloc(0))]);
}

/** The whole source as file name to contents, so the test can rebuild it in memory. */
export function gerarFonte() {
  return {
    'caixa-de-areia.tmj': JSON.stringify(montarTmj(gerarTerreno(), gerarObjetos())) + '\n',
    'terreno.tsj': JSON.stringify(montarTileset(), null, 1) + '\n',
    'terreno.png': pngDoTileset(),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const saida = process.argv[2] ?? fileURLToPath(new URL('../../arte/mapas-fonte/', import.meta.url));
  mkdirSync(saida, { recursive: true });
  for (const [nome, conteudo] of Object.entries(gerarFonte())) writeFileSync(`${saida.replace(/\/?$/, '/')}${nome}`, conteudo);
  console.log(`fonte escrita em ${saida}`);
}
