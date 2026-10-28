// Pavio rules: a pure simulation of a grid arena bomb game. Runs on the host; no DOM, no network.
// Movement is shared with the members, who move their own character locally and report the position.

export const COLUNAS = 40;
export const LINHAS = 30;
export const MAX_JOGADORES = 8;

export const PAREDE = '#';
export const CAIXA = '+';
export const CAIXA_MISTERIO = '?';
export const ehCaixa = celula => celula === CAIXA || celula === CAIXA_MISTERIO;
export const CHAO = '.';
export const ITEM = Object.freeze({ BOMBA: 'b', BOMBA2: 'B', FOGO: 'f', FOGO2: '2', FOGO3: '3', FOGO5: '5', TENIS: 't', ESCUDO: 'e', ESCUDO2: 'E', PERFURANTE: 'p', FANTASMA: 'g', CHUTE: 'k', DETONADOR: 'r', IMA: 'm', GELO: 'i', ATALHO: 'a', BANANA: 'n', MOLOTOV: 'o' });
const ITENS = new Set(Object.values(ITEM));

export const DIRECAO = Object.freeze({ NENHUMA: 0, CIMA: 1, BAIXO: 2, ESQUERDA: 3, DIREITA: 4 });
const VETOR = [[0, 0], [0, -1], [0, 1], [-1, 0], [1, 0]];
// Explosion arms: [dx, dy, middle piece, end piece].
const BRACOS = [[0, -1, 'v', 'u'], [0, 1, 'v', 'd'], [-1, 0, 'h', 'l'], [1, 0, 'h', 'r']];
const HORIZONTAIS = new Set(['h', 'l', 'r']);
const VERTICAIS = new Set(['v', 'u', 'd']);

export const AJUSTES = Object.freeze({
  pavioS: 2.4,
  chamaS: 0.55,
  // Flames only hurt after this long, which absorbs the delay of positions reported over the network.
  gracaChamaS: 0.12,
  velocidadeBase: 3.0,
  velocidadePorTenis: 0.45,
  maxBombas: 8,
  maxAlcance: 8,
  maxTenis: 4,
  alcanceInicial: 1,
  fogoS: 35,
  bombaS: 35,
  perfuranteS: 35,
  bananaS: 2.4,
  pavioMolotovS: 2.6,
  fogoMolotovS: 3,
  chanceItem: 0.32,
  densidadeCaixas: 0.82,
  morteSubitaS: 240,
  morteSubitaPassoS: 0.25,
  invulneravelEscudoS: 1.5,
  fantasmaS: 8,
  folgaFimS: 1.2,
  // Tiles per second of a kicked bomb.
  velocidadeChute: 7,
  chuteS: 50,
  // A remote bomb waits for its owner, but blows by itself after this long so the map never jams.
  detonadorS: 10,
  // A remote bomb cannot be set off right after being dropped, so a double press is not suicide.
  armarDetonadorS: 0.35,
  // A bomb press that cannot be honored right away (standing on the last bomb, none left) waits this long.
  bufferBombaS: 0.25,
  // Off its lane by more than this, a blocked player slides to the neighbor lane when that one is open.
  assistenciaEsquina: 0.1,
  imaS: 8,
  // The magnet pulls items whose cell center is this close (in tiles) to the player's cell.
  raioIma: 3,
  // Tiles per second of an item flying to a magnet.
  velocidadeIma: 8,
  // Each ice pickup gives this many shots, up to maxGelo; a shot flies alcanceGelo tiles.
  cargasGelo: 3,
  maxGelo: 6,
  alcanceGelo: 6,
  velocidadeGelo: 12,
  // A frozen bomb's fuse stops for this long (fire from another bomb still sets it off).
  congelarS: 3,
  // Shortcut charges: each one crosses one crate after pushing against it this long (a bump is not enough).
  maxAtalhos: 5,
  empurrarAtalhoS: 0.2,
});
const PESOS_ITENS = {
  [ITEM.BOMBA]: 10, [ITEM.BOMBA2]: 1, [ITEM.FOGO]: 18, [ITEM.FOGO2]: 8, [ITEM.FOGO3]: 3, [ITEM.FOGO5]: 0.1, [ITEM.TENIS]: 16, [ITEM.PERFURANTE]: 8, [ITEM.FANTASMA]: 8,
  [ITEM.CHUTE]: 10, [ITEM.DETONADOR]: 7, [ITEM.IMA]: 8, [ITEM.GELO]: 9, [ITEM.ATALHO]: 10, [ITEM.BANANA]: 8, [ITEM.MOLOTOV]: 6,
};
const PASSO_MAX = 0.1;
const EPS = 1e-4;
const FOLGA_VELOCIDADE = 1.35;
const FOLGA_DISTANCIA = 0.35;
// How far from the edge of its cell a remote player may report itself and still kick or cross a crate.
const FOLGA_EMPURRAO = 0.3;

// Spawn order keeps the first two players in opposite corners.
export const SPAWNS = [[1, 1], [COLUNAS - 2, LINHAS - 2], [COLUNAS - 2, 1], [1, LINHAS - 2], [Math.floor(COLUNAS / 2), 1], [Math.floor(COLUNAS / 2), LINHAS - 2], [1, Math.floor(LINHAS / 2)], [COLUNAS - 2, Math.floor(LINHAS / 2)]];

// A round is a series of matches; each one is a tighter map and unlocks new powers (novos).
// Map layouts are drawn as the top-left quarter (columns 0 to 10, rows 0 to 7) and mirrored to the other
// three, so every spawn has the same surroundings. '#' wall (a pillar where x and y are even), '.' floor
// that may get crates, '_' floor that never does, '+' a crate always. Each map has a few variants and a
// match picks one by its number, so a round never repeats a layout.
const LAYOUTS = {
  patio: [
    // A square in the middle, with no pillars and no crates.
    ['###########', '#..........', '#.#.#.#.#.#', '#..........', '#.#.#.#.#.#', '#......____', '#.#.#.#____', '#......____'],
    // Two avenues crossing the arena.
    ['###########', '#........._', '#.#.#.#.#.#', '#........._', '#.#.#.#.#.#', '#........._', '#.#.#.#.#.#', '#__________'],
  ],
  deposito: [
    // Two aisles from top to bottom.
    ['###########', '#...._.....', '#.#.#_#.#.#', '#...._.....', '#.#.#_#.#.#', '#...._.....', '#.#.#_#.#.#', '#...._.....'],
    // Two aisles from side to side, and stacks of crates between them.
    ['###########', '#..........', '#.#.#.#.#.#', '#__________', '#.#.#+#.#+#', '#....+...+.', '#.#.#+#.#+#', '#..........'],
  ],
  muralhas: [
    // A cross of walls makes four yards, with gates.
    ['###########', '#..........', '#.#.#.#.#.#', '#..........', '#.#.###.#.#', '#.........#', '#.#.#.#.#.#', '#...###.###'],
    ['###########', '#..........', '#.#.#.#.#.#', '#..........', '#.#.#.###.#', '#.........#', '#.#.#.#.#.#', '#...#.#####'],
  ],
  labirinto: [
    ['###########', '#..........', '#.#.###.#.#', '#.#...#.#..', '#.#.#.#.###', '#...#......', '#.###.#.#.#', '#.....#...#'],
    ['###########', '#..........', '#.###.#.#.#', '#...#.#....', '###.#.###.#', '#.....#....', '#.#.###.#.#', '#.........#'],
  ],
  fornalha: [
    // A furnace in the middle, with two doors on each side.
    ['###########', '#..........', '#.#.#.#.#.#', '#.....#....', '#.#.#.#.##_', '#.......#__', '#.###.#.#__', '#.....#..__'],
    ['###########', '#..........', '#.###.#.#.#', '#.#........', '#.#.#.###._', '#.......#__', '#.#.###.#__', '#.......#__'],
  ],
};

// A third layout per theme opens a different set of lanes through the pillars.
for (const [n, tema] of Object.keys(LAYOUTS).entries()) {
  const quarto = Array.from({ length: 8 }, (_, y) => Array.from({ length: 11 }, (_, x) => {
    if (x === 0 || y === 0) return '#';
    if (x % 2 === 0 && y % 2 === 0) return (x + y + n * 2) % 8 === 0 ? '_' : '#';
    if ((x * 2 + y + n * 3) % 9 === 0) return '+';
    return (x + y * 2 + n) % 5 === 0 ? '_' : '.';
  }).join(''));
  LAYOUTS[tema].push(quarto);
}

// A fourth layout places sparse cover around open lanes leading to the center.
for (const [n, tema] of Object.keys(LAYOUTS).entries()) {
  const quarto = Array.from({ length: 8 }, (_, y) => Array.from({ length: 11 }, (_, x) => {
    if (x === 0 || y === 0) return '#';
    if (x % 2 === 0 && y % 2 === 0) return (x + y + n * 2) % 8 === 0 ? '_' : '#';
    if (x === 5 && y === (n % 2 ? 3 : 5)) return '#';
    if (x === 9 || y === 7 || (x + y + n) % 7 === 0) return '_';
    return '.';
  }).join(''));
  LAYOUTS[tema].push(quarto);
}

// The whole map, mirrored from the quarter: a list of rows of COLUNAS characters.
function espelharLayout(quarto, desenho = 0) {
  const meiaLargura = Math.ceil(COLUNAS / 2);
  const meiaAltura = Math.ceil(LINHAS / 2);
  const ampliado = quarto.map((linha, y) => {
    while (linha.length < meiaLargura) {
      const x = linha.length;
      const cobertura = x === 11 && y === (desenho % 2 ? 3 : 5);
      linha += y === 0 || cobertura || (x % 2 === 0 && y % 2 === 0) ? '#' : '.';
    }
    return linha;
  });
  while (ampliado.length < meiaAltura) {
    const y = ampliado.length;
    ampliado.push(Array.from({ length: meiaLargura }, (_, x) => x === 0 ? '#' : y === meiaAltura - 1 ? '_' : (x % 2 === 0 && y % 2 === 0 ? '#' : '.')).join(''));
  }
  const metade = ampliado.map(linha => linha + [...linha.slice(0, COLUNAS % 2 ? -1 : undefined)].reverse().join(''));
  return [...metade, ...metade.slice(0, LINHAS % 2 ? -1 : undefined).reverse()];
}

// Walls, removed pillars and crate rules of one map variant (any integer picks one).
export function layoutDoMapa(mapa, variante = 0) {
  const opcoes = LAYOUTS[mapa?.tema];
  const muros = [];
  const semPilares = [];
  const livres = new Set();
  const caixas = new Set();
  if (!opcoes) return { muros, semPilares, livres, caixas };
  const escolha = ((variante % opcoes.length) + opcoes.length) % opcoes.length;
  const estilo = Object.keys(LAYOUTS).indexOf(mapa.tema);
  const linhas = espelharLayout(opcoes[escolha], escolha + estilo);
  for (let y = 1; y < LINHAS - 1; y++) {
    for (let x = 1; x < COLUNAS - 1; x++) {
      let marca = linhas[y][x];
      const mx = Math.min(x, COLUNAS - 1 - x), my = Math.min(y, LINHAS - 1 - y);
      if (ehBlocoFixo(x, y) && marca === '#' && mx >= 4 && my >= 4 && (mx / 2 + 2 * my / 2 + estilo + escolha) % 4 === 0) marca = '_';
      if (marca === '#' && !ehBlocoFixo(x, y)) muros.push([x, y]);
      if (marca !== '#' && ehBlocoFixo(x, y)) semPilares.push([x, y]);
      if (marca === '_') livres.add(indice(x, y));
      if (marca === '+') caixas.add(indice(x, y));
    }
  }
  return { muros, semPilares, livres, caixas };
}
// Powers unlocked by each match; a match drops everything unlocked so far.
const NOVOS = [
  [ITEM.BOMBA, ITEM.BOMBA2, ITEM.FOGO, ITEM.FOGO2, ITEM.FOGO3, ITEM.FOGO5, ITEM.ATALHO, ITEM.BANANA, ITEM.MOLOTOV],
  [ITEM.TENIS, ITEM.CHUTE],
  [ITEM.DETONADOR],
  [ITEM.PERFURANTE, ITEM.IMA],
  [ITEM.FANTASMA, ITEM.GELO],
];
const ITENS_ATE = NOVOS.map((_, n) => NOVOS.slice(0, n + 1).flat());
// tema is a stable key the painter uses for each map's art: patio, deposito, muralhas, labirinto, fornalha.
export const MAPAS = Object.freeze([
  { nome: 'Pátio', tema: 'patio', descricao: 'Mapa aberto, com uma praça ou duas avenidas sem caixas.', densidade: 0.68, itens: ITENS_ATE[0], novos: [ITEM.ATALHO] },
  { nome: 'Depósito', tema: 'deposito', descricao: 'Caixas por todo lado, cortadas por corredores.', densidade: 0.92, itens: ITENS_ATE[1], novos: NOVOS[1], morteSubitaS: 240 },
  { nome: 'Muralhas', tema: 'muralhas', descricao: 'Muros dividem a arena em quatro pátios com portões.', densidade: 0.8, itens: ITENS_ATE[2], novos: NOVOS[2], morteSubitaS: 240 },
  { nome: 'Labirinto', tema: 'labirinto', descricao: 'Corredores apertados e curvas fechadas.', densidade: 0.76, itens: ITENS_ATE[3], novos: NOVOS[3], morteSubitaS: 240 },
  { nome: 'Fornalha', tema: 'fornalha', descricao: 'Uma fornalha no meio da arena.', densidade: 0.8, itens: ITENS_ATE[4], novos: NOVOS[4], morteSubitaS: 240 },
]);

export const indice = (x, y) => y * COLUNAS + x;
const arredondar = valor => Math.round(valor * 100) / 100;
const valida = direcao => (Number.isInteger(direcao) && direcao >= 0 && direcao < VETOR.length ? direcao : DIRECAO.NENHUMA);

export function velocidade(tenis) {
  return AJUSTES.velocidadeBase + tenis * AJUSTES.velocidadePorTenis;
}

export function ehBlocoFixo(x, y) {
  return x <= 0 || y <= 0 || x >= COLUNAS - 1 || y >= LINHAS - 1 || (Math.min(x, COLUNAS - 1 - x) % 2 === 0 && Math.min(y, LINHAS - 1 - y) % 2 === 0);
}

export function sobrepoe(jogador, x, y) {
  return Math.abs(jogador.x - x) < 0.99 && Math.abs(jogador.y - y) < 0.99;
}

// Collision as a member predicts it on its own screen, from the newest snapshot: g is the grid string and
// bombas the snapshot bombs ([x, y, ...], a sliding one sits between two cells and blocks both). A bomb the
// player still overlaps never blocks, which matches the host letting players walk off a fresh bomb.
export function bloqueiaPrevisto(g, bombas, jogador, x, y) {
  if (x < 0 || y < 0 || x >= COLUNAS || y >= LINHAS) return true;
  const celula = g[indice(x, y)];
  if (celula === PAREDE) return true;
  if (jogador.fantasma) return false;
  if (ehCaixa(celula)) return true;
  return bombas.some(([bx, by]) => Math.abs(bx - x) < 1 && Math.abs(by - y) < 1 && !sobrepoe(jogador, bx, by));
}

// The cell a player is pushing against: aligned on its lane, at the center of its cell (where walking
// into a bomb or crate stops it), facing the next cell. Returns [x, y] when procurada(x, y) is true there.
export function celulaAFrente(jogador, direcao, procurada, folga = EPS) {
  const [dx, dy] = VETOR[valida(direcao)];
  if (!dx && !dy) return null;
  const x = Math.round(jogador.x);
  const y = Math.round(jogador.y);
  const desvio = dx ? Math.abs(jogador.y - y) : Math.abs(jogador.x - x);
  const avanco = dx ? (jogador.x - x) * dx : (jogador.y - y) * dy;
  if (desvio > folga || avanco < -folga) return null;
  return procurada(x + dx, y + dy) ? [x + dx, y + dy] : null;
}

// A shortcut crosses consecutive obstacles, spending one charge per cell, or wraps at the arena edge.
export function destinoAtalho(jogador, direcao, cargas, ehCaixa, livre, folga = EPS, ehParede = () => false) {
  const obstaculo = (x, y) => ehCaixa(x, y) || ehParede(x, y);
  const primeira = celulaAFrente(jogador, direcao, obstaculo, folga);
  if (!primeira) return null;
  const [dx, dy] = VETOR[valida(direcao)];
  let [x, y] = primeira;
  let caixas = 0;
  while (obstaculo(x, y)) {
    if (++caixas > cargas) return null;
    if (x === 0 || x === COLUNAS - 1 || y === 0 || y === LINHAS - 1) {
      x = dx ? (dx < 0 ? COLUNAS - 2 : 1) : x;
      y = dy ? (dy < 0 ? LINHAS - 2 : 1) : y;
      break;
    }
    x += dx;
    y += dy;
  }
  const origemX = Math.round(jogador.x), origemY = Math.round(jogador.y);
  for (let distancia = 0; distancia < COLUNAS + LINHAS; distancia++) {
    for (let cy = 1; cy < LINHAS - 1; cy++) for (let cx = 1; cx < COLUNAS - 1; cx++) {
      if (Math.abs(cx - x) + Math.abs(cy - y) === distancia && (cx !== origemX || cy !== origemY) && livre(cx, cy)) return { x: cx, y: cy, caixas };
    }
  }
  return null;
}

// Moves a point toward a target by up to distancia; chegou is true once it is there.
function aproximar(de, para, distancia) {
  const dx = para.x - de.x;
  const dy = para.y - de.y;
  const falta = Math.hypot(dx, dy);
  if (falta <= distancia) return { x: para.x, y: para.y, chegou: true };
  return { x: de.x + (dx / falta) * distancia, y: de.y + (dy / falta) * distancia, chegou: false };
}

// Where an item flying to a magnet ([x, y, item, player index]) is after some seconds, given where its
// target is drawn now. Members use it between snapshots; the host decides when it is picked up.
export function preverItemVoando(voo, alvo, segundos) {
  const [x, y, item, n] = voo;
  if (!alvo) return voo;
  const { x: nx, y: ny } = aproximar({ x, y }, alvo, AJUSTES.velocidadeIma * Math.max(0, segundos));
  return [arredondar(nx), arredondar(ny), item, n];
}

// Moves a point along one direction by distancia, stopping at the center of the last cell before anything
// bloqueia(x, y) reports. Returns the new [x, y].
function deslizar(x, y, direcao, distancia, bloqueia) {
  const [dx, dy] = VETOR[direcao];
  const sentido = dx || dy;
  const celula = ao => (dx ? [ao, y] : [x, ao]);
  let pos = dx ? x : y;
  let resta = distancia;
  while (resta > EPS) {
    const proximo = sentido > 0 ? Math.floor(pos + EPS) + 1 : Math.ceil(pos - EPS) - 1;
    if (bloqueia(...celula(proximo))) {
      const centro = proximo - sentido;
      if ((centro - pos) * sentido > 0) pos += sentido * Math.min(resta, Math.abs(centro - pos));
      break;
    }
    const anda = Math.min(resta, Math.abs(proximo - pos));
    pos += sentido * anda;
    resta -= anda;
  }
  return dx ? [arredondar(pos), y] : [x, arredondar(pos)];
}

// Where a sliding bomb from a snapshot ([x, y, restante, direcao, ...]) is after some seconds. Members use it
// to draw kicked bombs between snapshots; the host stays the authority.
export function preverBomba(bomba, segundos, bloqueia) {
  const [x, y, , direcao] = bomba;
  const d = valida(direcao);
  if (!d) return bomba;
  const previsto = bomba.slice();
  [previsto[0], previsto[1]] = deslizar(x, y, d, AJUSTES.velocidadeChute * Math.max(0, segundos), bloqueia);
  return previsto;
}

// Same for an ice shot in flight ([x, y, direcao]); the host decides what it hits.
export function preverGelo(tiro, segundos, bloqueia) {
  const [x, y, direcao] = tiro;
  const d = valida(direcao);
  if (!d) return tiro;
  return [...deslizar(x, y, d, AJUSTES.velocidadeGelo * Math.max(0, segundos), bloqueia), d];
}

function celulasSeguras() {
  const seguras = new Set();
  for (const [sx, sy] of SPAWNS) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > 2 || ehBlocoFixo(sx + dx, sy + dy)) continue;
        seguras.add(indice(sx + dx, sy + dy));
      }
    }
  }
  return seguras;
}

// True when every open cell can be reached from the first spawn (crates count as open: they can be blown up).
function conectada(grade) {
  const aberto = i => grade[i] !== PAREDE;
  const total = grade.filter((_, i) => aberto(i)).length;
  const vistos = new Set([indice(...SPAWNS[0])]);
  const fila = [indice(...SPAWNS[0])];
  while (fila.length) {
    const i = fila.pop();
    for (const vizinho of [i - 1, i + 1, i - COLUNAS, i + COLUNAS]) {
      if (vizinho < 0 || vizinho >= grade.length || vistos.has(vizinho) || !aberto(vizinho)) continue;
      vistos.add(vizinho);
      fila.push(vizinho);
    }
  }
  return vistos.size === total;
}

// semPilares opens pillar cells, livres never get crates and caixas always do (spawn areas stay clear).
export function gerarGrade(sorteio = Math.random, densidade = AJUSTES.densidadeCaixas, muros = [], { semPilares = [], livres = new Set(), caixas = new Set(), minSurpresas = 0 } = {}) {
  const seguras = celulasSeguras();
  const grade = [];
  for (let y = 0; y < LINHAS; y++) {
    for (let x = 0; x < COLUNAS; x++) grade.push(ehBlocoFixo(x, y) ? PAREDE : CHAO);
  }
  for (const [x, y] of semPilares) {
    if (x > 0 && y > 0 && x < COLUNAS - 1 && y < LINHAS - 1) grade[indice(x, y)] = CHAO;
  }
  // Extra walls never close a spawn area nor cut the arena in two.
  for (const [x, y] of muros) {
    const i = indice(x, y);
    if (seguras.has(i) || grade[i] === PAREDE) continue;
    grade[i] = PAREDE;
    if (!conectada(grade)) grade[i] = CHAO;
  }
  for (let i = 0; i < grade.length; i++) {
    if (grade[i] !== CHAO || seguras.has(i) || livres.has(i)) continue;
    if (caixas.has(i) || sorteio() < densidade) grade[i] = sorteio() < 0.24 ? CAIXA_MISTERIO : CAIXA;
  }
  // Mystery crates need at least two useful blast corridors, each three cells long.
  const quantidadeCaixas = grade.filter(ehCaixa).length;
  const corredores = new Set();
  for (let i = 0; i < grade.length; i++) {
    if (grade[i] !== CAIXA_MISTERIO) continue;
    const x = i % COLUNAS, y = Math.floor(i / COLUNAS);
    const caminhos = BRACOS.map(([dx, dy]) => [1, 2, 3].map(passo => [x + dx * passo, y + dy * passo]))
      .filter(caminho => caminho.every(([cx, cy]) => cx > 0 && cy > 0 && cx < COLUNAS - 1 && cy < LINHAS - 1 && grade[indice(cx, cy)] !== PAREDE && grade[indice(cx, cy)] !== CAIXA_MISTERIO));
    if (caminhos.length < 2) { grade[i] = CAIXA; continue; }
    for (const caminho of caminhos.slice(0, 2)) for (const [cx, cy] of caminho) {
      const posicao = indice(cx, cy);
      corredores.add(posicao);
      if (grade[posicao] === CAIXA) grade[posicao] = CHAO;
    }
  }
  // Generated matches always have enough surprise crates to hide their guaranteed shields.
  let quantidadeSurpresas = grade.filter(celula => celula === CAIXA_MISTERIO).length;
  while (quantidadeSurpresas < minSurpresas) {
    const opcoes = [];
    for (let i = 0; i < grade.length; i++) {
      if (grade[i] === PAREDE || grade[i] === CAIXA_MISTERIO || seguras.has(i) || livres.has(i) || corredores.has(i)) continue;
      const x = i % COLUNAS, y = Math.floor(i / COLUNAS);
      const caminhos = BRACOS.map(([dx, dy]) => [1, 2, 3].map(passo => [x + dx * passo, y + dy * passo]))
        .filter(caminho => caminho.every(([cx, cy]) => cx > 0 && cy > 0 && cx < COLUNAS - 1 && cy < LINHAS - 1 && grade[indice(cx, cy)] !== PAREDE && grade[indice(cx, cy)] !== CAIXA_MISTERIO));
      if (caminhos.length >= 2) opcoes.push({ i, caminhos });
    }
    if (!opcoes.length) break;
    const { i, caminhos } = opcoes[Math.floor(sorteio() * opcoes.length)];
    grade[i] = CAIXA_MISTERIO;
    quantidadeSurpresas++;
    for (const caminho of caminhos.slice(0, 2)) for (const [cx, cy] of caminho) {
      const posicao = indice(cx, cy);
      corredores.add(posicao);
      if (grade[posicao] === CAIXA) grade[posicao] = CHAO;
    }
  }
  // Replace crates displaced by those corridors in other eligible cells.
  let faltam = quantidadeCaixas - grade.filter(ehCaixa).length;
  const candidatos = grade.flatMap((celula, i) => celula === CHAO && !seguras.has(i) && !livres.has(i) && !corredores.has(i) ? [i] : []);
  while (faltam > 0 && candidatos.length) {
    const [i] = candidatos.splice(Math.floor(sorteio() * candidatos.length), 1);
    grade[i] = CAIXA;
    faltam--;
  }
  return grade;
}

// The grid of one match of a map variant.
export function gradeDoMapa(mapa, variante = 0, sorteio = Math.random) {
  const { muros, ...regras } = layoutDoMapa(mapa, variante);
  return gerarGrade(sorteio, mapa.densidade ?? AJUSTES.densidadeCaixas, muros, { ...regras, minSurpresas: 2 });
}

export function gradeVazia(muros = []) {
  return gerarGrade(Math.random, 0, muros);
}

// Sudden death fills the arena ring by ring, from the border inward, every cell that is not a wall yet.
function gerarEspiral(grade) {
  const ordem = [];
  const vistos = new Set();
  const incluir = (x, y) => {
    const i = indice(x, y);
    if (vistos.has(i) || grade[i] === PAREDE) return;
    vistos.add(i);
    ordem.push([x, y]);
  };
  const aneis = Math.floor((Math.min(COLUNAS, LINHAS) - 1) / 2);
  for (let anel = 1; anel <= aneis; anel++) {
    const x0 = anel;
    const y0 = anel;
    const x1 = COLUNAS - 1 - anel;
    const y1 = LINHAS - 1 - anel;
    for (let x = x0; x <= x1; x++) incluir(x, y0);
    for (let y = y0; y <= y1; y++) incluir(x1, y);
    for (let x = x1; x >= x0; x--) incluir(x, y1);
    for (let y = y1; y >= y0; y--) incluir(x0, y);
  }
  return ordem;
}

function sortearItem(sorteio, itens) {
  if (!itens.length || sorteio() >= AJUSTES.chanceItem) return null;
  const total = itens.reduce((soma, item) => soma + PESOS_ITENS[item], 0);
  let resto = sorteio() * total;
  for (const item of itens) {
    resto -= PESOS_ITENS[item];
    if (resto < 0) return item;
  }
  return itens[0];
}

// One step along one direction. A player is always aligned on at least one axis:
// lanes are entered only after snapping to them. Returns the distance actually moved.
function moverPasso(jogador, direcao, distancia, bloqueia) {
  const [dx, dy] = VETOR[direcao];
  const horizontal = dx !== 0;
  const sentido = horizontal ? dx : dy;
  const eixo = horizontal ? 'x' : 'y';
  const cruzado = horizontal ? 'y' : 'x';
  const celula = (ao, atravessado) => (horizontal ? [ao, atravessado] : [atravessado, ao]);
  const base = Math.round(jogador[eixo]);
  const faixa = Math.round(jogador[cruzado]);
  const desvio = jogador[cruzado] - faixa;

  if (Math.abs(desvio) > EPS) {
    // Off-lane: slide toward a lane whose next cell is open (corner assist).
    let alvo = null;
    if (!bloqueia(...celula(base + sentido, faixa))) {
      alvo = faixa;
    } else {
      const vizinha = faixa + Math.sign(desvio);
      const livre = !bloqueia(...celula(base, vizinha)) && !bloqueia(...celula(base + sentido, vizinha));
      if (Math.abs(desvio) > AJUSTES.assistenciaEsquina && livre) alvo = vizinha;
    }
    if (alvo === null) return 0;
    const falta = alvo - jogador[cruzado];
    const desliza = Math.min(distancia, Math.abs(falta));
    jogador[cruzado] = Math.abs(falta) - desliza <= EPS ? alvo : jogador[cruzado] + Math.sign(falta) * desliza;
    return desliza;
  }

  jogador[cruzado] = faixa;
  let destino = jogador[eixo] + sentido * distancia;
  if (bloqueia(...celula(base + sentido, faixa))) {
    destino = sentido > 0
      ? Math.min(destino, Math.max(jogador[eixo], base))
      : Math.max(destino, Math.min(jogador[eixo], base));
  }
  const andou = Math.abs(destino - jogador[eixo]);
  jogador[eixo] = destino;
  return andou;
}

// Moves a player ({ x, y, tenis, olhar, andando }) for dt seconds. The secondary direction is used
// when the primary one is blocked, so a held diagonal keeps going and turns at the next opening.
export function moverComColisao(jogador, entrada, dt, bloqueia) {
  jogador.andando = false;
  const principal = valida(entrada?.d);
  const secundaria = valida(entrada?.d2);
  if (!principal) return;
  jogador.olhar = principal;
  let restante = velocidade(jogador.tenis) * dt;
  for (let tentativa = 0; restante > EPS && tentativa < 8; tentativa++) {
    const passo = Math.min(restante, PASSO_MAX);
    let usada = principal;
    let andou = moverPasso(jogador, principal, passo, bloqueia);
    if (andou <= EPS && secundaria && secundaria !== principal) {
      usada = secundaria;
      andou = moverPasso(jogador, secundaria, passo, bloqueia);
    }
    if (andou <= EPS) break;
    jogador.olhar = usada;
    jogador.andando = true;
    restante -= andou;
  }
}

function novoJogador({ id, slot, remoto = false }, n) {
  const [x, y] = SPAWNS[slot];
  return {
    id, n, x, y, remoto,
    vivo: true,
    entrada: { d: DIRECAO.NENHUMA, d2: DIRECAO.NENHUMA },
    olhar: DIRECAO.BAIXO,
    andando: false,
    bombasMax: 1,
    bombasBonus: [],
    alcance: AJUSTES.alcanceInicial,
    fogosBonus: [],
    atordoado: 0,
    tenis: 0,
    escudo: 0,
    perfurante: false,
    perfurantesBonus: [],
    chute: false,
    chuteTempo: 0,
    detonador: false,
    ima: 0,
    gelo: 0,
    molotov: 0,
    pedidosGelo: 0,
    atalhos: 0,
    empurrao: 0, // seconds spent pushing against crates that a shortcut can cross
    fantasma: 0,
    fantasmaFolga: 0,
    invulneravel: 0,
    pedidosBomba: 0,
    validadeBomba: 0,
    relogioRemoto: null,
    caixas: 0,
    eliminacoes: 0,
    // Match statistics (see estatisticas()).
    bombasSoltas: 0,
    itensPegos: {},
    morte: null,
    distancia: 0,
    maiorCadeia: 0,
    ultimaPosicao: { x, y },
  };
}

// Adds one match's statistics (Partida.estatisticas()) to the round totals, by player id.
export function somarEstatisticasRodada(rodada = {}, partida = []) {
  const soma = { ...rodada };
  for (const linha of partida) {
    const atual = soma[linha.id] ?? { partidas: 0, caixas: 0, eliminacoes: 0, bombas: 0, itens: {}, mortes: 0, tempoVivo: 0, distancia: 0, maiorCadeia: 0 };
    const itens = { ...atual.itens };
    for (const [item, quantidade] of Object.entries(linha.itens ?? {})) itens[item] = (itens[item] ?? 0) + quantidade;
    soma[linha.id] = {
      partidas: atual.partidas + 1,
      caixas: atual.caixas + (linha.caixas ?? 0),
      eliminacoes: atual.eliminacoes + (linha.eliminacoes ?? 0),
      bombas: atual.bombas + (linha.bombas ?? 0),
      itens,
      mortes: atual.mortes + (linha.morte ? 1 : 0),
      tempoVivo: arredondar(atual.tempoVivo + (linha.tempoVivo ?? 0)),
      distancia: Math.round((atual.distancia + (linha.distancia ?? 0)) * 10) / 10,
      maiorCadeia: Math.max(atual.maiorCadeia, linha.maiorCadeia ?? 0),
    };
  }
  return soma;
}

// Score of one player: crates are the steady income, eliminations and match wins weigh more.
export const PONTOS = Object.freeze({ caixa: 1, eliminacao: 5, vitoria: 15 });

export class Partida {
  constructor(participantes, { mapa = MAPAS[0], variante = 0, grade = null, sorteio = Math.random } = {}) {
    this.sorteio = sorteio;
    this.mapa = mapa;
    this.itens = mapa.itens ?? Object.values(ITEM);
    this.morteSubitaS = mapa.morteSubitaS ?? AJUSTES.morteSubitaS;
    this.grade = grade ? [...grade] : gradeDoMapa(mapa, variante, sorteio);
    this.escudosNasCaixas = new Set();
    if (!grade) {
      const candidatas = this.grade.flatMap((celula, i) => celula === CAIXA_MISTERIO ? [i] : []);
      while (this.escudosNasCaixas.size < 2 && candidatas.length) {
        const [i] = candidatas.splice(Math.floor(this.sorteio() * candidatas.length), 1);
        this.escudosNasCaixas.add(i);
      }
    }
    this.versaoGrade = 0;
    this.jogadores = participantes.map((participante, n) => novoJogador(participante, n));
    this.bombas = [];
    this.molotovs = [];
    this.chamas = new Map(); // cell index -> { restante, idade, forma, item }
    this.bananasDeslizando = [];
    this.voando = []; // items flying to a magnet: { x, y, item, alvo }
    this.gelos = []; // ice shots in flight: { x, y, d, andou, dono }, x and y being where it was thrown from
    this.eventos = [];
    this.tempo = 0;
    this.espiral = gerarEspiral(this.grade);
    this.posEspiral = 0;
    this.acumuladoSubita = 0;
    this.folgaFim = null;
    this.resultado = null;
    this.varios = participantes.length > 1;
  }

  definirEntrada(id, d, d2 = DIRECAO.NENHUMA) {
    const jogador = this.#jogador(id);
    if (jogador) jogador.entrada = { d: valida(d), d2: valida(d2) };
  }

  // Remote players move on their own device; the host accepts plausible positions only.
  aplicarPosicao(id, { x, y, o, a, c } = {}) {
    const jogador = this.#jogador(id);
    if (!jogador?.vivo || !jogador.remoto || jogador.atordoado > 0) return false;
    if (![x, y, c].every(Number.isFinite)) return false;
    if (jogador.relogioRemoto !== null && c <= jogador.relogioRemoto) return false;
    const segundos = jogador.relogioRemoto === null ? 1 : Math.min((c - jogador.relogioRemoto) / 1000, 1);
    const permitido = velocidade(jogador.tenis) * segundos * FOLGA_VELOCIDADE + FOLGA_DISTANCIA;
    if (Math.abs(x - jogador.x) + Math.abs(y - jogador.y) > permitido) return false;
    const fantasma = jogador.fantasma > 0 || jogador.fantasmaFolga > 0;
    if (!this.#posicaoLivre(x, y, fantasma)) return false;
    // Nor through a crate on the way: a report after a long silence could otherwise jump one for free.
    if (!fantasma && this.#cruzaCaixa(jogador.x, jogador.y, x, y)) return false;
    jogador.relogioRemoto = c;
    jogador.x = x;
    jogador.y = y;
    jogador.olhar = valida(o) || jogador.olhar;
    jogador.andando = Boolean(a);
    return true;
  }

  // espera: how long a press that cannot be honored right away keeps trying (0 for robots, which plan their
  // way out from the cell where they decide).
  pedirBomba(id, { espera = AJUSTES.bufferBombaS } = {}) {
    const jogador = this.#jogador(id);
    if (!jogador?.vivo || jogador.atordoado > 0) return;
    jogador.pedidosBomba = Math.min(jogador.pedidosBomba + 1, 2);
    jogador.validadeBomba = espera;
  }

  // Place one collected Molotov on the player's cell; its fuse is decided by the host.
  usarMolotov(id) {
    const jogador = this.#jogador(id);
    if (!jogador?.vivo || jogador.atordoado > 0 || jogador.molotov <= 0) return false;
    const x = Math.round(jogador.x), y = Math.round(jogador.y);
    if (this.#bombaEm(x, y) || this.chamas.has(indice(x, y)) || this.molotovs.some(m => m.x === x && m.y === y)) return false;
    jogador.molotov--;
    this.molotovs.push({ x, y, dono: id, restante: AJUSTES.pavioMolotovS });
    return true;
  }

  // A directed portal request crosses the obstacle ahead when the host validates it.
  // With posicao (the member's report sent with the request), it hops only from where the member was then.
  atravessar(id, direcao, posicao = null) {
    const jogador = this.#jogador(id);
    if (!jogador?.vivo || jogador.atordoado > 0 || jogador.atalhos <= 0) return false;
    if (posicao && !this.aplicarPosicao(id, posicao)) return false;
    const destino = this.#destinoAtalho(jogador, direcao, jogador.remoto ? FOLGA_EMPURRAO : EPS);
    if (!destino) return false;
    this.#saltar(jogador, destino);
    return true;
  }

  // Throws an ice shot where the player is facing, if it has any left.
  jogarGelo(id) {
    const jogador = this.#jogador(id);
    if (jogador?.vivo && jogador.atordoado <= 0) jogador.pedidosGelo = Math.min(jogador.pedidosGelo + 1, 2);
  }

  // A player with the kick power pushing against a still bomb sends it sliding until it hits something.
  // Local players kick by walking; remote ones ask for it (their position is checked with some slack).
  chutar(id, direcao) {
    const jogador = this.#jogador(id);
    if (!jogador?.vivo || jogador.atordoado > 0 || !jogador.chute) return false;
    const d = valida(direcao);
    const alvo = celulaAFrente(jogador, d, (x, y) => Boolean(this.#bombaEm(x, y)) || this.grade[indice(x, y)] === ITEM.BANANA, jogador.remoto ? FOLGA_EMPURRAO : EPS);
    if (!alvo) return false;
    const bomba = this.#bombaEm(...alvo);
    const [dx, dy] = VETOR[d];
    if (!bomba) {
      const [x, y] = alvo;
      if (this.#bloqueiaBomba(x + dx, y + dy)) return false;
      this.#mudarCelula(indice(x, y), CHAO);
      this.bananasDeslizando.push({ x, y, deslize: d, avanco: 0 });
      this.eventos.push({ e: 'chute', j: jogador.n, x, y });
      return true;
    }
    if (bomba.deslize || this.#bloqueiaBomba(bomba.x + dx, bomba.y + dy, bomba)) return false;
    bomba.deslize = d;
    // Whoever kicks a bomb answers for what it hits.
    bomba.autor = jogador.id;
    bomba.avanco = 0;
    this.eventos.push({ e: 'chute', j: jogador.n, x: bomba.x, y: bomba.y });
    return true;
  }

  removerJogador(id) {
    const jogador = this.#jogador(id);
    if (jogador?.vivo) this.#matar(jogador, 'saiu');
  }

  passo(dt) {
    if (this.resultado) return;
    this.tempo += dt;
    for (const jogador of this.jogadores) {
      jogador.invulneravel = Math.max(0, jogador.invulneravel - dt);
      jogador.atordoado = Math.max(0, jogador.atordoado - dt);
      jogador.ima = Math.max(0, jogador.ima - dt);
      if (jogador.chuteTempo > 0) {
        jogador.chuteTempo = Math.max(0, jogador.chuteTempo - dt);
        if (jogador.chuteTempo === 0) jogador.chute = false;
      }
      for (const [campo, atributo, inicial, limite] of [['bombasBonus', 'bombasMax', 1, AJUSTES.maxBombas], ['fogosBonus', 'alcance', AJUSTES.alcanceInicial, AJUSTES.maxAlcance]]) {
        const bonus = jogador[campo];
        if (!bonus.length) continue;
        for (const efeito of bonus) efeito.restante -= dt;
        jogador[campo] = bonus.filter(efeito => efeito.restante > 0);
        jogador[atributo] = Math.min(limite, inicial + jogador[campo].reduce((soma, efeito) => soma + efeito.valor, 0));
      }
      if (jogador.perfurantesBonus.length) {
        jogador.perfurantesBonus = jogador.perfurantesBonus.map(restante => restante - dt).filter(restante => restante > 0);
        jogador.perfurante = jogador.perfurantesBonus.length > 0;
      }
      if (jogador.fantasma > 0) {
        jogador.fantasma = Math.max(0, jogador.fantasma - dt);
        // A ghost that wears off inside crates stays one until it is out of them, so it is never trapped.
        if (jogador.fantasma === 0 && jogador.vivo && this.#sobreCaixa(jogador)) jogador.fantasma = EPS;
        // A short leftover still accepts reported positions inside crates, which arrive late.
        if (jogador.fantasma === 0) jogador.fantasmaFolga = 1;
      } else {
        jogador.fantasmaFolga = Math.max(0, jogador.fantasmaFolga - dt);
      }
      if (!jogador.vivo || jogador.remoto || jogador.atordoado > 0) continue;
      if (jogador.chute && jogador.entrada.d) this.chutar(jogador.id, jogador.entrada.d);
      moverComColisao(jogador, jogador.entrada, dt, (x, y) => this.#bloqueia(x, y, jogador));
      if (jogador.chute && jogador.entrada.d) this.chutar(jogador.id, jogador.entrada.d);
    }
    this.#medirDistancias();
    for (const jogador of this.jogadores) {
      if (!jogador.vivo) continue;
      this.#soltarBombas(jogador, dt);
      this.#lancarGelo(jogador);
    }
    this.#atualizarPassantes();
    this.#deslizarBombas(dt);
    this.#deslizarBananas(dt);
    this.#moverGelos(dt);
    this.#atualizarBombas(dt);
    this.#atualizarChamas(dt);
    this.#atualizarMolotovs(dt);
    this.#aplicarChamasEItens();
    this.#atrairItens(dt);
    this.#morteSubita(dt);
    this.#verificarFim(dt);
  }

  vista() {
    return {
      gv: this.versaoGrade,
      g: this.grade.join(''),
      j: this.jogadores.map(j => ({
        x: arredondar(j.x),
        y: arredondar(j.y),
        v: j.vivo ? 1 : 0,
        o: j.olhar,
        a: j.andando ? 1 : 0,
        e: j.escudo ? 1 : 0,
        i: j.invulneravel > 0 ? 1 : 0,
        g: j.fantasma > 0 ? 1 : 0,
        p: j.perfurante ? 1 : 0,
        k: j.chute ? 1 : 0,
        kt: Math.ceil(j.chuteTempo),
        r: j.detonador ? 1 : 0,
        m: j.ima > 0 ? 1 : 0,
        gl: j.gelo,
        mo: j.molotov,
        at: j.atalhos,
        es: j.escudo,
        st: Math.ceil(j.atordoado * 10) / 10,
        bt: j.bombasBonus.map(efeito => [efeito.valor, Math.ceil(efeito.restante)]),
        ft: j.fogosBonus.map(efeito => [efeito.valor, Math.ceil(efeito.restante)]),
        pt: j.perfurantesBonus.map(restante => Math.ceil(restante)),
        gt: Math.ceil(j.fantasma),
        mt: Math.ceil(j.ima),
        b: j.bombasMax,
        f: j.alcance,
        t: j.tenis,
        cx: j.caixas,
        el: j.eliminacoes,
      })),
      // [x, y, seconds left, sliding direction, remote, frozen]; a sliding bomb is drawn between cells.
      b: this.bombas.map(b => {
        const [dx, dy] = VETOR[b.deslize];
        const pos = [arredondar(b.x + dx * b.avanco), arredondar(b.y + dy * b.avanco)];
        return [...pos, arredondar(b.restante), b.deslize, b.remota ? 1 : 0, b.congelada > 0 ? 1 : 0];
      }),
      ml: this.molotovs.map(m => [m.x, m.y, arredondar(AJUSTES.pavioMolotovS - m.restante)]),
      gl: this.gelos.map(t => {
        const [dx, dy] = VETOR[t.d];
        return [arredondar(t.x + dx * t.andou), arredondar(t.y + dy * t.andou), t.d];
      }),
      c: [...this.chamas].map(([i, chama]) => [i, chama.forma]),
      iv: [...this.voando.map(v => [arredondar(v.x), arredondar(v.y), v.item, v.alvo.n]), ...this.bananasDeslizando.map(v => { const [dx, dy] = VETOR[v.deslize]; return [arredondar(v.x + dx * v.avanco), arredondar(v.y + dy * v.avanco), ITEM.BANANA, -1]; })],
      tm: arredondar(this.tempo),
      ms: this.morteSubitaS,
    };
  }

  // Per-player tally of this match, for the round score and the match summary. morte.causa is 'bomba'
  // (someone else's, por is its owner), 'propria', 'subita' (sudden death) or 'saiu' (left the room).
  estatisticas() {
    return this.jogadores.map(j => ({
      id: j.id,
      caixas: j.caixas,
      eliminacoes: j.eliminacoes,
      bombas: j.bombasSoltas,
      itens: { ...j.itensPegos },
      morte: j.morte ? { ...j.morte } : null,
      tempoVivo: arredondar(j.morte ? j.morte.tempo : this.tempo),
      distancia: Math.round(j.distancia * 10) / 10,
      maiorCadeia: j.maiorCadeia,
    }));
  }

  tirarEventos() {
    const eventos = this.eventos;
    this.eventos = [];
    return eventos;
  }

  #jogador(id) {
    return this.jogadores.find(j => j.id === id);
  }

  #mudarCelula(i, valor) {
    this.grade[i] = valor;
    this.versaoGrade++;
  }

  #bloqueia(x, y, jogador) {
    if (x < 0 || y < 0 || x >= COLUNAS || y >= LINHAS) return true;
    const celula = this.grade[indice(x, y)];
    if (celula === PAREDE) return true;
    // A ghost walks through crates and bombs.
    if (jogador.fantasma > 0) return false;
    if (ehCaixa(celula)) return true;
    const bomba = this.#bombaEm(x, y);
    return Boolean(bomba && !bomba.passantes.has(jogador.id));
  }

  // Whether the straight way between two positions passes over a crate, sampled every quarter tile.
  #cruzaCaixa(x0, y0, x1, y1) {
    const passos = Math.ceil((Math.abs(x1 - x0) + Math.abs(y1 - y0)) / 0.25);
    for (let k = 1; k <= passos; k++) {
      const px = x0 + ((x1 - x0) * k) / passos;
      const py = y0 + ((y1 - y0) * k) / passos;
      if (ehCaixa(this.grade[indice(Math.round(px), Math.round(py))])) return true;
    }
    return false;
  }

  #sobreCaixa(jogador) {
    for (let cy = Math.round(jogador.y - 0.49); cy <= Math.round(jogador.y + 0.49); cy++) {
      for (let cx = Math.round(jogador.x - 0.49); cx <= Math.round(jogador.x + 0.49); cx++) {
        if (ehCaixa(this.grade[indice(cx, cy)])) return true;
      }
    }
    return false;
  }

  #posicaoLivre(x, y, ignorarCaixas = false) {
    if (x < 0.5 || y < 0.5 || x > COLUNAS - 1.5 || y > LINHAS - 1.5) return false;
    for (let cy = Math.round(y - 0.49); cy <= Math.round(y + 0.49); cy++) {
      for (let cx = Math.round(x - 0.49); cx <= Math.round(x + 0.49); cx++) {
        const celula = this.grade[indice(cx, cy)];
        if (celula === PAREDE || (ehCaixa(celula) && !ignorarCaixas)) return false;
      }
    }
    return true;
  }

  #bombaEm(x, y) {
    return this.bombas.find(b => b.x === x && b.y === y);
  }

  // A sliding bomb stops before walls, crates, items, players and other bombs (or the cell one is sliding into).
  #bloqueiaBomba(x, y, propria = null) {
    if (x < 0 || y < 0 || x >= COLUNAS || y >= LINHAS) return true;
    const celula = this.grade[indice(x, y)];
    if (celula === PAREDE || ehCaixa(celula) || ITENS.has(celula)) return true;
    if (this.jogadores.some(j => j.vivo && sobrepoe(j, x, y))) return true;
    return this.bombas.some(b => {
      if (b === propria) return false;
      if (b.x === x && b.y === y) return true;
      const [dx, dy] = VETOR[b.deslize];
      return b.avanco > 0 && b.x + dx === x && b.y + dy === y;
    });
  }

  #deslizarBananas(dt) {
    this.bananasDeslizando = this.bananasDeslizando.filter(banana => {
      const [dx, dy] = VETOR[banana.deslize];
      banana.avanco += Math.min(AJUSTES.velocidadeChute * dt, 0.5);
      if (banana.avanco >= 0 && this.#bloqueiaBomba(banana.x + dx, banana.y + dy)) {
        if (this.grade[indice(banana.x, banana.y)] === CHAO && !this.chamas.has(indice(banana.x, banana.y))) this.#mudarCelula(indice(banana.x, banana.y), ITEM.BANANA);
        return false;
      }
      if (banana.avanco >= 0.5) {
        banana.x += dx;
        banana.y += dy;
        banana.avanco -= 1;
        if (this.chamas.has(indice(banana.x, banana.y))) return false;
      }
      return true;
    });
  }

  #deslizarBombas(dt) {
    for (const bomba of this.bombas) {
      if (!bomba.deslize) continue;
      const [dx, dy] = VETOR[bomba.deslize];
      bomba.avanco += Math.min(AJUSTES.velocidadeChute * dt, 0.5);
      // Past the center of its cell the bomb needs the next one free; otherwise it settles where it is.
      if (bomba.avanco >= 0 && this.#bloqueiaBomba(bomba.x + dx, bomba.y + dy, bomba)) {
        bomba.deslize = DIRECAO.NENHUMA;
        bomba.avanco = 0;
        continue;
      }
      if (bomba.avanco < 0.5) continue;
      bomba.x += dx;
      bomba.y += dy;
      bomba.avanco -= 1;
      // Sliding into fire sets it off, frozen or not.
      if (this.chamas.has(indice(bomba.x, bomba.y))) {
        bomba.restante = 0;
        bomba.congelada = 0;
      }
    }
  }

  // With the detonator, a press that cannot drop a bomb sets off the oldest armed remote one instead.
  // Returns whether a bomb was set off.
  #detonar(jogador) {
    const bomba = this.bombas.find(b => b.dono === jogador.id && b.remota && !b.congelada && AJUSTES.detonadorS - b.restante >= AJUSTES.armarDetonadorS);
    if (bomba) bomba.restante = 0;
    return Boolean(bomba);
  }

  #soltarBombas(jogador, dt) {
    while (jogador.pedidosBomba > 0) {
      const x = Math.round(jogador.x);
      const y = Math.round(jogador.y);
      const ativas = this.bombas.filter(b => b.dono === jogador.id).length;
      if (this.#bombaEm(x, y) || this.molotovs.some(m => m.x === x && m.y === y) || this.chamas.has(indice(x, y)) || ativas >= jogador.bombasMax) {
        // The detonator uses such a press; otherwise it waits a moment (stepping off the last bomb, or one
        // blowing up, lets it through) so a press made a little early is not lost.
        if (!this.#detonar(jogador)) break;
        jogador.pedidosBomba--;
        continue;
      }
      jogador.pedidosBomba--;
      const bomba = {
        x, y,
        dono: jogador.id,
        alcance: jogador.alcance,
        perfurante: jogador.perfurante,
        remota: jogador.detonador,
        restante: jogador.detonador ? AJUSTES.detonadorS : AJUSTES.pavioS,
        deslize: DIRECAO.NENHUMA,
        avanco: 0,
        congelada: 0,
        passantes: new Set(),
      };
      // Everyone standing on the cell may walk off the new bomb.
      for (const outro of this.jogadores) if (outro.vivo && sobrepoe(outro, x, y)) bomba.passantes.add(outro.id);
      this.bombas.push(bomba);
      jogador.bombasSoltas++;
      this.eventos.push({ e: 'bomba', x, y });
    }
    if (jogador.pedidosBomba === 0) return;
    jogador.validadeBomba -= dt;
    if (jogador.validadeBomba <= 0) jogador.pedidosBomba = 0;
  }

  #atualizarPassantes() {
    for (const bomba of this.bombas) {
      for (const id of bomba.passantes) {
        const jogador = this.#jogador(id);
        if (!jogador?.vivo || !sobrepoe(jogador, bomba.x, bomba.y)) bomba.passantes.delete(id);
      }
    }
  }

  #destinoAtalho(jogador, direcao, folga) {
    if (jogador.fantasma > 0) return null;
    const caixaNoMapa = (x, y) => x >= 0 && y >= 0 && x < COLUNAS && y < LINHAS && ehCaixa(this.grade[indice(x, y)]);
    const livre = (x, y) => {
      const celula = this.grade[indice(x, y)];
      return celula !== PAREDE && !ehCaixa(celula) && !this.#bombaEm(x, y);
    };
    const ehParede = (x, y) => x >= 0 && y >= 0 && x < COLUNAS && y < LINHAS && this.grade[indice(x, y)] === PAREDE;
    return destinoAtalho(jogador, valida(direcao), jogador.atalhos, caixaNoMapa, livre, folga, ehParede);
  }

  #saltar(jogador, destino) {
    const x = Math.round(jogador.x);
    const y = Math.round(jogador.y);
    jogador.x = destino.x;
    jogador.y = destino.y;
    jogador.atalhos -= destino.caixas;
    jogador.empurrao = 0;
    this.eventos.push({ e: 'atalho', j: jogador.n, x, y, x2: destino.x, y2: destino.y });
  }

  #lancarGelo(jogador) {
    while (jogador.pedidosGelo > 0) {
      jogador.pedidosGelo--;
      if (jogador.gelo <= 0) continue;
      jogador.gelo--;
      const x = Math.round(jogador.x);
      const y = Math.round(jogador.y);
      this.gelos.push({ x, y, d: jogador.olhar || DIRECAO.BAIXO, andou: 0, dono: jogador.id });
      this.eventos.push({ e: 'gelo', j: jogador.n, x, y });
    }
  }

  // An ice shot freezes the first bomb it reaches; walls, crates and other players stop it.
  #moverGelos(dt) {
    this.gelos = this.gelos.filter(tiro => {
      const [dx, dy] = VETOR[tiro.d];
      const antes = tiro.andou;
      tiro.andou = Math.min(antes + AJUSTES.velocidadeGelo * dt, AJUSTES.alcanceGelo + 0.5);
      // The shot reaches cell k (counted from where it was thrown) once it has flown k - 0.5 tiles.
      for (let k = Math.floor(antes + 0.5) + 1; k <= Math.floor(tiro.andou + 0.5); k++) {
        if (k > AJUSTES.alcanceGelo) return false;
        const x = tiro.x + dx * k;
        const y = tiro.y + dy * k;
        const bomba = this.#bombaEm(x, y);
        if (bomba) {
          bomba.congelada = AJUSTES.congelarS;
          this.eventos.push({ e: 'congela', x, y });
          return false;
        }
        const celula = this.grade[indice(x, y)];
        if (celula === PAREDE || ehCaixa(celula)) return false;
        if (this.jogadores.some(j => j.vivo && j.id !== tiro.dono && sobrepoe(j, x, y))) return false;
      }
      return true;
    });
  }

  // Walked distance for the statistics; jumps (shortcuts, corrections) are left out.
  #medirDistancias() {
    for (const jogador of this.jogadores) {
      const passo = Math.abs(jogador.x - jogador.ultimaPosicao.x) + Math.abs(jogador.y - jogador.ultimaPosicao.y);
      if (jogador.vivo && passo <= 1) jogador.distancia += passo;
      jogador.ultimaPosicao = { x: jogador.x, y: jogador.y };
    }
  }

  #atualizarBombas(dt) {
    // A frozen bomb's fuse waits; only another bomb's fire (the chain below) sets it off meanwhile.
    for (const bomba of this.bombas) {
      if (bomba.congelada > 0) bomba.congelada = Math.max(0, bomba.congelada - dt);
      else bomba.restante -= dt;
    }
    // Each bomb whose time is up starts a chain; its owner is credited with the chain's length.
    for (const raiz of this.bombas.filter(b => b.restante <= 0 && !b.congelada)) {
      if (!this.bombas.includes(raiz)) continue;
      const fila = [raiz];
      let explodidas = 0;
      while (fila.length) {
        const bomba = fila.shift();
        if (!bomba.especial && !this.bombas.includes(bomba)) continue;
        this.#explodir(bomba, fila);
        if (!bomba.especial) explodidas++;
      }
      const dono = this.#jogador(raiz.dono);
      if (dono) dono.maiorCadeia = Math.max(dono.maiorCadeia, explodidas);
    }
  }

  #explodir(bomba, fila) {
    this.bombas = this.bombas.filter(b => b !== bomba);
    this.eventos.push({ e: 'bum', x: bomba.x, y: bomba.y });
    // Credit goes to whoever kicked the bomb last, otherwise to its owner.
    const autor = bomba.autor ?? bomba.dono;
    this.#acenderChama(bomba.x, bomba.y, 'c', autor);
    const dono = this.#jogador(autor);
    for (const [dx, dy, meio, ponta] of BRACOS) {
      for (let passo = 1; passo <= bomba.alcance; passo++) {
        const x = bomba.x + dx * passo;
        const y = bomba.y + dy * passo;
        const i = indice(x, y);
        const celula = this.grade[i];
        const forma = passo === bomba.alcance ? ponta : meio;
        if (celula === PAREDE) break;
        if (this.chamas.get(i)?.forma === 'x') {
          if (bomba.perfurante) continue;
          break;
        }
        if (ehCaixa(celula)) {
          this.#queimarCaixa(x, y, autor, fila);
          // A piercing blast keeps going through crates.
          if (bomba.perfurante) continue;
          break;
        }
        const outra = this.#bombaEm(x, y);
        if (outra) {
          // Chain reaction: the other bomb blows in this same tick and spreads its own flames.
          outra.restante = 0;
          fila.push(outra);
          this.#acenderChama(x, y, forma, autor);
          break;
        }
        if (ITENS.has(celula)) {
          this.#mudarCelula(i, CHAO);
          this.#acenderChama(x, y, ponta, autor);
          break;
        }
        this.#acenderChama(x, y, forma, autor);
      }
    }
  }

  #queimarCaixa(x, y, autor, fila, duracao = AJUSTES.chamaS) {
    const i = indice(x, y);
    const celula = this.grade[i];
    const dono = this.#jogador(autor);
    this.#mudarCelula(i, CHAO);
    let item = null;
    if (this.escudosNasCaixas.delete(i)) item = ITEM.ESCUDO;
    else if (celula === CAIXA_MISTERIO) {
      const resultado = this.sorteio();
      if (resultado < 0.275) fila.push({ x, y, alcance: 4, autor, especial: true });
      else if (resultado < 0.6375) {
        const melhores = [[ITEM.BOMBA2, 10], [ITEM.FOGO5, 10], [ITEM.PERFURANTE, 10], [ITEM.ATALHO, 10], [ITEM.ESCUDO, 4], [ITEM.ESCUDO2, 0.1]];
        let sorte = this.sorteio() * melhores.reduce((soma, [, peso]) => soma + peso, 0);
        for (const [premio, peso] of melhores) {
          sorte -= peso;
          if (sorte < 0) { item = premio; break; }
        }
      }
    } else item = sortearItem(this.sorteio, this.itens);
    this.#acenderChama(x, y, 'x', autor, item, duracao);
    if (dono) dono.caixas++;
    this.eventos.push({ e: 'caixa', j: dono?.n ?? -1, x, y });
  }

  #atualizarMolotovs(dt) {
    for (const molotov of this.molotovs) molotov.restante -= dt;
    const prontos = this.molotovs.filter(m => m.restante <= 0);
    this.molotovs = this.molotovs.filter(m => m.restante > 0);
    for (const molotov of prontos) {
      const fila = [];
      this.eventos.push({ e: 'bum', x: molotov.x, y: molotov.y });
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = molotov.x + dx, y = molotov.y + dy;
        if (x < 0 || y < 0 || x >= COLUNAS || y >= LINHAS) continue;
        const i = indice(x, y), celula = this.grade[i];
        if (celula === PAREDE || celula === undefined) continue;
        if (ehCaixa(celula)) this.#queimarCaixa(x, y, molotov.dono, fila, AJUSTES.fogoMolotovS);
        else {
          if (ITENS.has(celula)) this.#mudarCelula(i, CHAO);
          this.#acenderChama(x, y, 'c', molotov.dono, null, AJUSTES.fogoMolotovS);
        }
        const bomba = this.#bombaEm(x, y);
        if (bomba) { bomba.restante = 0; bomba.congelada = 0; fila.push(bomba); }
      }
      while (fila.length) {
        const bomba = fila.shift();
        if (!bomba.especial && !this.bombas.includes(bomba)) continue;
        this.#explodir(bomba, fila);
      }
    }
  }

  #acenderChama(x, y, forma, dono, item = null, duracao = AJUSTES.chamaS) {
    const i = indice(x, y);
    const atual = this.chamas.get(i);
    if (atual?.forma === 'x') {
      atual.restante = Math.max(atual.restante, duracao);
      return;
    }
    let nova = forma;
    if (atual && forma !== 'x' && atual.forma !== forma) {
      if (HORIZONTAIS.has(atual.forma) && HORIZONTAIS.has(forma)) nova = 'h';
      else if (VERTICAIS.has(atual.forma) && VERTICAIS.has(forma)) nova = 'v';
      else nova = 'c';
    }
    this.chamas.set(i, {
      restante: Math.max(atual?.restante ?? 0, duracao),
      idade: atual?.idade ?? 0,
      forma: nova,
      dono,
      item: item ?? atual?.item ?? null,
    });
  }

  #atualizarChamas(dt) {
    for (const [i, chama] of this.chamas) {
      chama.restante -= dt;
      chama.idade += dt;
      if (chama.restante > 0) continue;
      this.chamas.delete(i);
      // A burnt crate reveals its item only after the fire is out.
      if (chama.item && this.grade[i] === CHAO) this.#mudarCelula(i, chama.item);
    }
  }

  #aplicarChamasEItens() {
    for (const jogador of this.jogadores) {
      if (!jogador.vivo) continue;
      const x = Math.round(jogador.x);
      const y = Math.round(jogador.y);
      const i = indice(x, y);
      const chama = this.chamas.get(i);
      if (chama) {
        if (jogador.invulneravel > 0 || chama.idade < AJUSTES.gracaChamaS) continue;
        if (jogador.escudo) {
          jogador.escudo = Math.max(0, jogador.escudo - 1);
          jogador.invulneravel = AJUSTES.invulneravelEscudoS;
          this.eventos.push({ e: 'escudo', j: jogador.n, x: jogador.x, y: jogador.y });
        } else {
          const propria = chama.dono === jogador.id;
          this.#matar(jogador, propria ? 'propria' : 'bomba', propria ? null : chama.dono ?? null);
          const autor = this.#jogador(chama.dono);
          // Blowing yourself up scores nothing.
          if (autor && !propria) autor.eliminacoes++;
        }
        continue;
      }
      const item = this.grade[i];
      if (!ITENS.has(item)) continue;
      this.#mudarCelula(i, CHAO);
      this.#ganharItem(jogador, item);
    }
  }

  #ganharItem(jogador, item) {
    jogador.itensPegos[item] = (jogador.itensPegos[item] ?? 0) + 1;
    if (item === ITEM.BOMBA || item === ITEM.BOMBA2) {
      jogador.bombasBonus.push({ valor: item === ITEM.BOMBA2 ? 2 : 1, restante: AJUSTES.bombaS });
      jogador.bombasMax = Math.min(1 + jogador.bombasBonus.reduce((soma, efeito) => soma + efeito.valor, 0), AJUSTES.maxBombas);
    }
    else if ([ITEM.FOGO, ITEM.FOGO2, ITEM.FOGO3, ITEM.FOGO5].includes(item)) {
      jogador.fogosBonus.push({ valor: ({ [ITEM.FOGO]: 1, [ITEM.FOGO2]: 2, [ITEM.FOGO3]: 3, [ITEM.FOGO5]: 5 })[item], restante: AJUSTES.fogoS });
      jogador.alcance = Math.min(AJUSTES.alcanceInicial + jogador.fogosBonus.reduce((soma, efeito) => soma + efeito.valor, 0), AJUSTES.maxAlcance);
    }
    else if (item === ITEM.MOLOTOV) jogador.molotov++;
    else if (item === ITEM.BANANA) {
      jogador.atordoado = AJUSTES.bananaS;
      jogador.andando = false;
      jogador.pedidosBomba = 0;
      jogador.pedidosGelo = 0;
    }
    else if (item === ITEM.TENIS) jogador.tenis = Math.min(jogador.tenis + 1, AJUSTES.maxTenis);
    else if (item === ITEM.ESCUDO || item === ITEM.ESCUDO2) jogador.escudo += item === ITEM.ESCUDO2 ? 2 : 1;
    else if (item === ITEM.PERFURANTE) {
      jogador.perfurantesBonus.push(AJUSTES.perfuranteS);
      jogador.perfurante = true;
    }
    else if (item === ITEM.FANTASMA) jogador.fantasma = AJUSTES.fantasmaS;
    else if (item === ITEM.CHUTE) { jogador.chute = true; jogador.chuteTempo = AJUSTES.chuteS; }
    else if (item === ITEM.DETONADOR) jogador.detonador = true;
    else if (item === ITEM.IMA) jogador.ima = AJUSTES.imaS;
    else if (item === ITEM.GELO) jogador.gelo = Math.min(jogador.gelo + AJUSTES.cargasGelo, AJUSTES.maxGelo);
    else if (item === ITEM.ATALHO) jogador.atalhos = Math.min(jogador.atalhos + 1, AJUSTES.maxAtalhos);
    this.eventos.push({ e: 'item', j: jogador.n, x: Math.round(jogador.x), y: Math.round(jogador.y), item });
  }

  // A magnet lifts nearby items off the grid; they fly to their player (over walls) and are picked up on
  // arrival. If that player is gone, the item drops where it is when the cell is free.
  #atrairItens(dt) {
    const raio = AJUSTES.raioIma;
    for (const jogador of this.jogadores) {
      if (!jogador.vivo || jogador.ima <= 0) continue;
      const cx = Math.round(jogador.x);
      const cy = Math.round(jogador.y);
      for (let y = Math.max(0, cy - raio); y <= Math.min(LINHAS - 1, cy + raio); y++) {
        for (let x = Math.max(0, cx - raio); x <= Math.min(COLUNAS - 1, cx + raio); x++) {
          const i = indice(x, y);
          if (!ITENS.has(this.grade[i]) || this.grade[i] === ITEM.BANANA || (x - cx) ** 2 + (y - cy) ** 2 > raio * raio) continue;
          this.voando.push({ x, y, item: this.grade[i], alvo: jogador });
          this.#mudarCelula(i, CHAO);
        }
      }
    }
    this.voando = this.voando.filter(voo => {
      if (!voo.alvo.vivo) {
        const i = indice(Math.round(voo.x), Math.round(voo.y));
        if (this.grade[i] === CHAO && !this.chamas.has(i) && !this.#bombaEm(Math.round(voo.x), Math.round(voo.y))) this.#mudarCelula(i, voo.item);
        return false;
      }
      const passo = aproximar(voo, voo.alvo, AJUSTES.velocidadeIma * dt);
      voo.x = passo.x;
      voo.y = passo.y;
      if (passo.chegou) this.#ganharItem(voo.alvo, voo.item);
      return !passo.chegou;
    });
  }

  #matar(jogador, causa, por = null) {
    jogador.vivo = false;
    jogador.morte = { tempo: arredondar(this.tempo), por, causa };
    jogador.entrada = { d: DIRECAO.NENHUMA, d2: DIRECAO.NENHUMA };
    jogador.andando = false;
    // Nobody is left to press the detonator: remote bombs go back to a normal fuse.
    for (const bomba of this.bombas) {
      if (bomba.dono !== jogador.id || !bomba.remota) continue;
      bomba.remota = false;
      bomba.restante = Math.min(bomba.restante, AJUSTES.pavioS);
    }
    this.eventos.push({ e: 'morte', j: jogador.n, x: jogador.x, y: jogador.y });
  }

  #morteSubita(dt) {
    if (this.tempo < this.morteSubitaS || this.posEspiral >= this.espiral.length) return;
    if (this.acumuladoSubita === 0) this.eventos.push({ e: 'subita' });
    this.acumuladoSubita += dt;
    while (this.acumuladoSubita >= AJUSTES.morteSubitaPassoS && this.posEspiral < this.espiral.length) {
      this.acumuladoSubita -= AJUSTES.morteSubitaPassoS;
      const [x, y] = this.espiral[this.posEspiral++];
      const i = indice(x, y);
      this.#mudarCelula(i, PAREDE);
      this.chamas.delete(i);
      this.bombas = this.bombas.filter(b => b.x !== x || b.y !== y);
      this.molotovs = this.molotovs.filter(m => m.x !== x || m.y !== y);
      for (const jogador of this.jogadores) {
        if (jogador.vivo && Math.round(jogador.x) === x && Math.round(jogador.y) === y) this.#matar(jogador, 'subita');
      }
      this.eventos.push({ e: 'bloco', x, y });
    }
    // Keep the accumulator positive so the warning above fires only once.
    this.acumuladoSubita = Math.max(this.acumuladoSubita, EPS);
  }

  #verificarFim(dt) {
    const vivos = this.jogadores.filter(j => j.vivo);
    const acabou = this.varios ? vivos.length <= 1 : vivos.length === 0;
    if (!acabou) return;
    // A short grace period lets simultaneous deaths end in a draw.
    this.folgaFim = (this.folgaFim ?? AJUSTES.folgaFimS) - dt;
    if (this.folgaFim > 0) return;
    const sobrevivente = this.jogadores.find(j => j.vivo);
    this.resultado = { vencedor: this.varios && sobrevivente ? sobrevivente.id : null };
  }
}
