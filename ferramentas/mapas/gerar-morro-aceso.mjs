// Writes the Tiled source of the first mission's map, "Morro Aceso" (arte/mapas-fonte/morro-aceso.tmj), by script,
// while no map editor is installed (decision D16). It uses the tileset the sandbox generator writes (terreno.tsj).
// 128 x 96 cells, not symmetric: the player's low plateau in the south-west with one ramp, the rubble yard by it, the
// ruined block to the east and the old road from the south edge; a river from west to east crossed by the Old Bridge
// (stone, always open), a bascule bridge (closed until re-powered) and a slow ford; north of the river, a ridge splits
// the valley: on the west the North Yard with an enemy post, the hill with the Old Tower and the camp; on the east the
// open floodplain and the Hill with the substation. Two ways reach the Hill: the narrow one through the camp and the
// gorge, the open one by the scrap yard, the ford (or the bascule bridge) and the floodplain.
// Usage: node ferramentas/mapas/gerar-morro-aceso.mjs [pasta de saída, padrão arte/mapas-fonte]

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SOLOS, DECORACOES } from './formato.mjs';
import { montarTmj } from './tiled.mjs';

const L = 128;
const A = 96;
const SOLO = Object.fromEntries(SOLOS.map((s, i) => [s.nome, i]));
const DECOR = Object.fromEntries(DECORACOES.map((d, i) => [d.nome, i + 1]));

// ---------- river ----------

// centre row of the river by column, from control points; consecutive columns move one row at most, so the water of
// neighbouring columns always overlaps and nothing slips across diagonally
const CURSO_DO_RIO = [[0, 45], [14, 44], [30, 47], [44, 48], [60, 47], [76, 45], [88, 47], [98, 50], [110, 52], [127, 50]];
export function centroDoRio(x) {
  for (let k = 1; k < CURSO_DO_RIO.length; k++) {
    const [x0, y0] = CURSO_DO_RIO[k - 1];
    const [x1, y1] = CURSO_DO_RIO[k];
    if (x <= x1) return y0 + Math.trunc(((y1 - y0) * (x - x0)) / (x1 - x0));
  }
  return CURSO_DO_RIO.at(-1)[1];
}
/** Deep water rows of column x: three, five around the bascule bridge. */
export function aguaDoRio(x) {
  const meia = x >= 85 && x <= 92 ? 2 : 1;
  const c = centroDoRio(x);
  return [c - meia, c + meia];
}

// crossings, in cells
export const PONTE_VELHA = { x0: 33, x1: 35 };
export const BASCULANTE = { x: 88, y: 44, largura: 2, altura: 7 };
export const VAU = { x0: 112, x1: 116 };
// the ridge between the west and the east of the valley north of the river, with the gorge through it
export const SERRA = { x0: 79, x1: 83, desfiladeiro: [15, 17] };

// ---------- terrain ----------

function gerarTerreno() {
  const solo = new Uint8Array(L * A);
  const alturaNiveis = new Uint8Array(L * A);
  const decoracao = new Uint8Array(L * A);
  const dentro = (x, y) => x >= 0 && y >= 0 && x < L && y < A;
  const pintar = (camada, x, y, valor) => {
    if (dentro(x, y)) camada[y * L + x] = valor;
  };
  const ler = (camada, x, y) => camada[y * L + x];
  // deterministic pattern per cell
  const padrao = (x, y, sal) => {
    let h = Math.imul((y * L + x) ^ sal, 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    return (h ^ (h >>> 16)) & 255;
  };
  const retangulo = (camada, x0, y0, x1, y1, valor) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) pintar(camada, x, y, valor);
  };
  // ellipse by integer test: (x - cx)² ry² + (y - cy)² rx² <= rx² ry²
  const naElipse = (x, y, cx, cy, rx, ry) => (x - cx) ** 2 * ry * ry + (y - cy) ** 2 * rx * rx <= rx * rx * ry * ry;
  const elipse = (camada, cx, cy, rx, ry, valor) => {
    for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) if (naElipse(x, y, cx, cy, rx, ry)) pintar(camada, x, y, valor);
  };
  const disco = (camada, cx, cy, r2, valor) => {
    for (let y = cy - 8; y <= cy + 8; y++) for (let x = cx - 8; x <= cx + 8; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) pintar(camada, x, y, valor);
  };
  // thick line by integer steps along the longer axis, clearing props
  const estrada = (pontos, largura = 2, valor = SOLO['asfalto-velho']) => {
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
  // patches of another ground over the plain ground only, never over rock, water, roads or what was painted before
  const chao = (x, y) => ler(solo, x, y) === SOLO['terra-batida'] || ler(solo, x, y) === SOLO.capim;
  const manchas = (x0, y0, x1, y1, sal, limite, valor) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (dentro(x, y) && chao(x, y) && padrao(x, y, sal) < limite) pintar(solo, x, y, valor);
  };

  // ground: red earth with grass patches
  for (let y = 0; y < A; y++) for (let x = 0; x < L; x++) pintar(solo, x, y, padrao(x, y, 11) < 80 ? SOLO.capim : SOLO['terra-batida']);

  // the player's low plateau, level 1, with a cliff on the north and the east and one ramp facing east
  retangulo(alturaNiveis, 1, 69, 32, 94, 1);
  manchas(1, 70, 31, 94, 23, 40, SOLO.cascalho);
  for (let x = 1; x <= 32; x++) pintar(solo, x, 69, SOLO.rocha);
  for (let y = 69; y <= 94; y++) if (y < 77 || y > 81) pintar(solo, 32, y, SOLO.rocha);

  // the river; muddy banks here and there
  for (let x = 0; x < L; x++) {
    const [y0, y1] = aguaDoRio(x);
    retangulo(solo, x, y0, x, y1, SOLO['agua-funda']);
    if (padrao(x, y1 + 1, 31) < 70) pintar(solo, x, y1 + 1, SOLO.lama);
    if (padrao(x, y0 - 1, 37) < 50) pintar(solo, x, y0 - 1, SOLO.lama);
  }
  // the slow ford: shallow water across, mud on both banks
  for (let x = VAU.x0; x <= VAU.x1; x++) {
    const [y0, y1] = aguaDoRio(x);
    retangulo(solo, x, y0, x, y1, SOLO['agua-rasa']);
    pintar(solo, x, y0 - 1, SOLO.lama);
    pintar(solo, x, y1 + 1, SOLO.lama);
  }

  // roads: from the south edge to the ramp, east to the scrap yard, north over the Old Bridge to the North Yard and
  // the camp, and to both heads of the bascule bridge
  estrada([[61, 94], [61, 88], [48, 88], [37, 84], [33, 79]]);
  estrada([[62, 88], [80, 87], [96, 84], [103, 80]]);
  estrada([[33, 76], [34, 66], [34, 50]]);
  estrada([[34, 44], [31, 36], [26, 28]]);
  estrada([[31, 36], [42, 30], [50, 26]]);
  estrada([[88, 51], [88, 60], [90, 72], [92, 84]]);
  estrada([[88, 42], [92, 37]]);
  // the Old Bridge: stone deck over the water, three cells wide
  for (let x = PONTE_VELHA.x0; x <= PONTE_VELHA.x1; x++) {
    const [y0, y1] = aguaDoRio(x);
    retangulo(solo, x, y0 - 1, x, y1 + 1, SOLO['asfalto-velho']);
    retangulo(decoracao, x, y0, x, y1, DECOR['ponte-de-concreto']);
  }

  // rubble yard by the ramp (the first node)
  disco(solo, 40, 77, 20, SOLO.cascalho);

  // the ruined block east of the base: rubble cover, broken walls and tall grass for ambushes
  manchas(47, 68, 76, 90, 41, 150, SOLO.entulho);
  for (const [x0, y0, x1, y1] of [[49, 70, 51, 70], [55, 72, 55, 74], [58, 69, 60, 69], [69, 71, 69, 73], [72, 76, 74, 76], [50, 80, 50, 82], [56, 82, 58, 82], [67, 81, 67, 83], [71, 85, 73, 85], [53, 76, 53, 77]]) retangulo(decoracao, x0, y0, x1, y1, DECOR['muro-em-ruina']);
  for (const [x0, y0, x1, y1] of [[59, 76, 66, 80], [47, 84, 52, 87]]) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (padrao(x, y, 53) < 170) pintar(solo, x, y, SOLO['capim-alto']);
  for (const [x, y] of [[64, 70], [52, 89]]) pintar(decoracao, x, y, DECOR['carcaca-de-onibus']);

  // scrap yard in the south-east: gravel, dead buses and tyres; a small windy rise beside it
  disco(solo, 106, 79, 40, SOLO.cascalho);
  for (const [x, y] of [[100, 83], [112, 74], [101, 74], [111, 84]]) pintar(decoracao, x, y, DECOR['carcaca-de-onibus']);
  for (const [x, y] of [[110, 82], [103, 84], [113, 79]]) pintar(decoracao, x, y, DECOR.pneus);
  disco(alturaNiveis, 118, 68, 12, 1);

  // the overturned truck's corner, north of the plateau: tall grass where two of the other side wait in ambush
  for (let y = 51; y <= 61; y++) for (let x = 5; x <= 20; x++) if (padrao(x, y, 59) < 160) pintar(solo, x, y, SOLO['capim-alto']);

  // the hill with the Old Tower, north-east of the Old Bridge, level 1 with gentle slopes
  elipse(alturaNiveis, 41, 38, 7, 5, 1);

  // the North Yard: gravel around the piles
  disco(solo, 19, 16, 49, SOLO.cascalho);

  // the camp's ground, beaten and bare
  manchas(48, 5, 74, 27, 61, 120, SOLO['terra-batida']);

  // the ridge, rock from the top down to the river, open only at the gorge
  for (let x = SERRA.x0; x <= SERRA.x1; x++) {
    const [topoDoRio] = aguaDoRio(x);
    for (let y = 1; y < topoDoRio; y++) if (y < SERRA.desfiladeiro[0] || y > SERRA.desfiladeiro[1]) pintar(solo, x, y, SOLO.rocha);
  }

  // the Hill: a level 1 shoulder ringed by cliffs, open at a west ramp (out of the gorge) and a south ramp (from the
  // floodplain), and a level 2 top with the substation
  const OMBRO = [110, 16, 15, 12];
  const TOPO = [110, 13, 7, 6];
  elipse(alturaNiveis, ...OMBRO, 1);
  elipse(alturaNiveis, ...TOPO, 2);
  const noOmbro = (x, y) => naElipse(x, y, ...OMBRO);
  const rampa = (x, y) => (y >= 15 && y <= 17 && x < 100) || (x >= 99 && x <= 103 && y > 20);
  for (let y = OMBRO[1] - OMBRO[3]; y <= OMBRO[1] + OMBRO[3]; y++) {
    for (let x = OMBRO[0] - OMBRO[2]; x <= OMBRO[0] + OMBRO[2]; x++) {
      if (!noOmbro(x, y) || rampa(x, y)) continue;
      // any of the 8 neighbours outside: the ring leaves no diagonal gap
      let borda = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!noOmbro(x + dx, y + dy)) borda = true;
      if (borda) pintar(solo, x, y, SOLO.rocha);
    }
  }
  manchas(96, 5, 124, 27, 67, 60, SOLO.cascalho);

  // the open floodplain north of the river, east of the ridge: grass
  manchas(84, 29, 126, 46, 71, 150, SOLO.capim);

  // scattered props on open ground, away from the roads
  for (let y = 2; y < A - 2; y++) {
    for (let x = 2; x < L - 2; x++) {
      if (ler(solo, x, y) !== SOLO['terra-batida'] && ler(solo, x, y) !== SOLO.capim) continue;
      if (ler(decoracao, x, y)) continue;
      const v = padrao(x, y, 67);
      if (v < 3) pintar(decoracao, x, y, DECOR.pedra);
      else if (v < 5) pintar(decoracao, x, y, DECOR['arvore-seca']);
      else if (v < 6) pintar(decoracao, x, y, DECOR['poste-caido']);
    }
  }

  // the map border is rock
  for (let x = 0; x < L; x++) {
    pintar(solo, x, 0, SOLO.rocha);
    pintar(solo, x, A - 1, SOLO.rocha);
  }
  for (let y = 0; y < A; y++) {
    pintar(solo, 0, y, SOLO.rocha);
    pintar(solo, L - 1, y, SOLO.rocha);
  }
  // nothing decorates rock or deep water, except the Old Bridge's deck
  for (let i = 0; i < L * A; i++) if (solo[i] === SOLO.rocha || (solo[i] === SOLO['agua-funda'] && decoracao[i] !== DECOR['ponte-de-concreto'])) decoracao[i] = 0;
  // no prop under the bascule bridge
  for (let y = BASCULANTE.y; y < BASCULANTE.y + BASCULANTE.altura; y++) for (let x = BASCULANTE.x; x < BASCULANTE.x + BASCULANTE.largura; x++) decoracao[y * L + x] = 0;
  return { largura: L, altura: A, solo, alturaNiveis, decoracao };
}

// ---------- entities, nodes, wind, areas, points, routes ----------

function gerarObjetos() {
  const nos = [];
  const entidades = [];
  const no = (id, centro, pilhas) => {
    nos.push({ id, x: centro[0], y: centro[1] });
    for (const [x, y, carga] of pilhas) entidades.push({ tipo: 'pilha', x, y, w: 1, h: 1, props: { carga, no: id } });
  };
  // the rubble by the ramp (2,500 C), the North Yard (9,000 C) and the scrap yard (6,000 C)
  no('entulho', [40, 77], [[38, 74, 900], [42, 76, 800], [39, 79, 800]]);
  no('cemiterio-norte', [19, 16], [[15, 13, 1500], [19, 12, 1500], [23, 14, 1500], [24, 18, 1500], [20, 20, 1500], [15, 18, 1500]]);
  no('ferro-velho', [106, 79], [[103, 77, 1500], [106, 76, 1500], [109, 78, 1500], [106, 81, 1500]]);

  const entidade = (tipo, x, y, pegada, props) => entidades.push({ tipo, x, y, w: pegada[0], h: pegada[1], props });
  // neutral structures
  entidade('subestacao', 108, 11, [5, 4], { dono: -1, etiqueta: 'subestacao-do-morro' });
  entidade('torre-antiga', 39, 39, [2, 2], { dono: -1, etiqueta: 'torre-antiga-colina' });
  entidade('ponte-basculante', BASCULANTE.x, BASCULANTE.y, [BASCULANTE.largura, BASCULANTE.altura], { dono: -1, etiqueta: 'ponte-basculante' });
  entidade('holofote-de-estrada', 31, 52, [1, 1], { dono: -1, etiqueta: 'holofote-ponte-velha' });
  entidade('caminhao-tombado', 12, 56, [3, 2], { dono: -1, etiqueta: 'caminhao-tombado' });

  // player 0, Religadores: the regional office on the plateau and the convoy on the old road
  entidade('escritorio-regional', 19, 77, [4, 3], { dono: 0, etiqueta: 'qg-jogador' });
  const comboio = [['guincho-de-celulas', 60, 91], ['guincho-de-celulas', 62, 91], ['equipe-de-manutencao', 61, 93], ['turma-de-linha', 59, 89], ['turma-de-linha', 63, 89]];
  comboio.forEach(([tipo, x, y], k) => entidade(tipo, x, y, [1, 1], { dono: 0, etiqueta: `comboio-${k + 1}` }));

  // player 1, Desligados (the Catraca's crew)
  // the post at the North Yard
  entidade('torre-de-vigia', 27, 22, [2, 2], { dono: 1, etiqueta: 'posto-torre' });
  for (const [k, [x, y]] of [[25, 21], [28, 19], [29, 25]].entries()) entidade('chapa', x, y, [1, 1], { dono: 1, etiqueta: `posto-chapa-${k + 1}` });
  // the camp
  entidade('carrocao-mae', 60, 11, [4, 3], { dono: 1, etiqueta: 'catraca-carrocao-mae' });
  entidade('paiol', 53, 9, [3, 2], { dono: 1, etiqueta: 'catraca-paiol' });
  entidade('barracao', 53, 16, [3, 3], { dono: 1, etiqueta: 'catraca-barracao' });
  entidade('ferraria-a-vapor', 65, 17, [4, 3], { dono: 1, etiqueta: 'catraca-ferraria' });
  entidade('torre-de-vigia', 49, 22, [2, 2], { dono: 1, etiqueta: 'catraca-torre-oeste' });
  entidade('torre-de-vigia', 70, 24, [2, 2], { dono: 1, etiqueta: 'catraca-torre-sul' });
  for (const x of [56, 57, 58, 64, 65, 66]) entidade('palicada', x, 27, [1, 1], { dono: 1 });
  entidade('canhao-de-caldeira', 62, 22, [1, 1], { dono: 1, etiqueta: 'catraca-canhao' });
  for (const [k, [x, y]] of [[57, 21], [59, 23], [68, 21], [51, 13]].entries()) entidade('chapa', x, y, [1, 1], { dono: 1, etiqueta: `catraca-chapa-${k + 1}` });
  for (const [k, [x, y]] of [[63, 25], [55, 24]].entries()) entidade('arpoador', x, y, [1, 1], { dono: 1, etiqueta: `catraca-arpoador-${k + 1}` });
  // the gorge's fixed guard
  entidade('torre-de-vigia', 76, 12, [2, 2], { dono: 1, etiqueta: 'desfiladeiro-torre' });
  for (const [k, [x, y]] of [[77, 15], [77, 17]].entries()) entidade('chapa', x, y, [1, 1], { dono: 1, etiqueta: `desfiladeiro-chapa-${k + 1}` });
  entidade('arpoador', 76, 16, [1, 1], { dono: 1, etiqueta: 'desfiladeiro-arpoador-1' });
  // sail-carts on the floodplain, and two in ambush by the overturned truck
  for (const [k, [x, y]] of [[100, 40], [104, 41]].entries()) entidade('carro-vela', x, y, [1, 1], { dono: 1, etiqueta: `patrulha-cv-${k + 1}` });
  for (const [k, [x, y]] of [[9, 54], [17, 59]].entries()) entidade('chapa', x, y, [1, 1], { dono: 1, etiqueta: `tocaia-chapa-${k + 1}` });

  // windy spots (2 x 2, top-left cell): the plateau, the Old Tower's hill, the rise by the scrap yard, the Hill's top
  const ventosas = [[11, 73], [42, 35], [117, 67], [112, 8]];
  // the bascule bridge's deck (open ground under the raised deck, see formato.mjs)
  const passagens = [[BASCULANTE.x, BASCULANTE.y, BASCULANTE.largura, BASCULANTE.altura]];

  // areas as [x, y, width, height]
  const areas = {
    'base-jogador': [1, 69, 33, 26],
    entulho: [34, 70, 13, 15],
    'estrada-sul': [56, 88, 12, 7],
    ruinas: [47, 68, 30, 23],
    'nascedouro-ruinas': [62, 73, 6, 4],
    'chegada-sul': [40, 82, 17, 11],
    'ponte-velha': [29, 42, 11, 12],
    'chegada-ponte': [28, 53, 13, 12],
    colina: [33, 32, 17, 12],
    resgate: [5, 51, 16, 11],
    'cemiterio-norte': [7, 4, 27, 26],
    acampamento: [47, 4, 28, 24],
    'nascedouro-acampamento': [57, 2, 10, 3],
    'saida-acampamento': [56, 28, 13, 4],
    desfiladeiro: [75, 11, 12, 11],
    'refugio-grota': [84, 2, 13, 13],
    varzea: [84, 29, 42, 15],
    'nascedouro-leste': [121, 31, 6, 10],
    basculante: [85, 40, 8, 15],
    vau: [108, 46, 13, 13],
    'ferro-velho': [97, 70, 18, 19],
    morro: [95, 3, 31, 27],
    'subestacao-entorno': [102, 6, 18, 16],
    'flanco-morro-oeste': [84, 12, 13, 9],
    'flanco-morro-sul': [95, 25, 16, 8],
    'reforco-morro': [94, 30, 14, 4],
  };
  const pontos = {
    'alvo-base': [24, 82],
    subestacao: [110, 13],
    'posto-canhao': [35, 34],
  };
  const rotas = {
    // every enemy route ends where its behaviour (comportamentos/) looks for targets
    'rota-comboio': [[61, 90], [61, 88], [48, 88], [37, 84], [33, 79], [26, 82]],
    'rota-ruinas': [[64, 75], [54, 78], [44, 77]],
    'rota-ponte-velha': [[62, 30], [48, 31], [35, 40], [34, 47], [34, 56], [34, 70], [33, 79], [24, 82]],
    'rota-sul': [[123, 36], [116, 42], [114, 49], [114, 57], [108, 66], [98, 73], [88, 84], [64, 88], [48, 88], [37, 84], [33, 79], [24, 82]],
    'rota-final-desfiladeiro': [[62, 4], [70, 9], [77, 16], [83, 16], [92, 16], [97, 16], [104, 14]],
    'rota-final-varzea': [[123, 36], [112, 34], [104, 30], [101, 26], [104, 18]],
    'rota-patrulha-varzea': [[92, 40], [108, 38], [122, 42]],
    'rota-fuga': [[62, 15], [72, 15], [80, 16], [88, 9]],
    'rota-canhao': [[62, 26], [48, 31], [35, 34]],
    // the player's two ways to the Hill, for the radio and the reveal: narrow through the camp and the gorge, open by
    // the scrap yard and the ford
    'rota-estreita': [[33, 79], [34, 60], [34, 47], [31, 36], [26, 28], [38, 25], [50, 25], [61, 26], [70, 16], [78, 16], [83, 16], [90, 16], [97, 16], [104, 15]],
    'rota-aberta': [[33, 79], [48, 88], [64, 88], [88, 84], [98, 73], [108, 66], [114, 57], [114, 49], [110, 40], [104, 32], [101, 26], [104, 18]],
  };
  return { nos, entidades, ventosas, passagens, areas, pontos, rotas };
}

/** The source as file name to contents, so the test can rebuild it in memory. */
export function gerarFonte() {
  const tmj = montarTmj(gerarTerreno(), gerarObjetos(), {
    id: 'morro-aceso',
    simetria: 'nenhuma',
    geradoPor: 'ferramentas/mapas/gerar-morro-aceso.mjs',
    jogadores: JSON.stringify([{ time: 0, faccao: 'religadores', base: [21, 82] }, { time: 1, faccao: 'desligados', base: [61, 15] }]),
  });
  return { 'morro-aceso.tmj': JSON.stringify(tmj) + '\n' };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const saida = process.argv[2] ?? fileURLToPath(new URL('../../arte/mapas-fonte/', import.meta.url));
  mkdirSync(saida, { recursive: true });
  for (const [nome, conteudo] of Object.entries(gerarFonte())) writeFileSync(`${saida.replace(/\/?$/, '/')}${nome}`, conteudo);
  console.log(`fonte escrita em ${saida}`);
}
