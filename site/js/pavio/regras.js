// Pavio rules: a pure simulation of a grid arena bomb game. Runs on the host; no DOM, no network.
// Movement is shared with the members, who move their own character locally and report the position.

export const COLUNAS = 21;
export const LINHAS = 15;
export const MAX_JOGADORES = 8;

export const PAREDE = '#';
export const CAIXA = '+';
export const CHAO = '.';
export const ITEM = Object.freeze({ BOMBA: 'b', FOGO: 'f', TENIS: 't', ESCUDO: 'e', PERFURANTE: 'p', FANTASMA: 'g', CHUTE: 'k', DETONADOR: 'r', IMA: 'm', GELO: 'i' });
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
  alcanceInicial: 2,
  chanceItem: 0.32,
  densidadeCaixas: 0.72,
  morteSubitaS: 120,
  morteSubitaPassoS: 0.25,
  invulneravelEscudoS: 1.5,
  fantasmaS: 8,
  folgaFimS: 1.2,
  // Tiles per second of a kicked bomb.
  velocidadeChute: 7,
  // A remote bomb waits for its owner, but blows by itself after this long so the map never jams.
  detonadorS: 10,
  // A remote bomb cannot be set off right after being dropped, so a double press is not suicide.
  armarDetonadorS: 0.35,
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
});
const PESOS_ITENS = {
  [ITEM.BOMBA]: 30, [ITEM.FOGO]: 30, [ITEM.TENIS]: 16, [ITEM.ESCUDO]: 10, [ITEM.PERFURANTE]: 8, [ITEM.FANTASMA]: 8,
  [ITEM.CHUTE]: 10, [ITEM.DETONADOR]: 7, [ITEM.IMA]: 8, [ITEM.GELO]: 9,
};
const PASSO_MAX = 0.1;
const EPS = 1e-4;
const FOLGA_VELOCIDADE = 1.35;
const FOLGA_DISTANCIA = 0.35;
// How far from the edge of its cell a remote player may report itself and still kick.
const FOLGA_CHUTE = 0.3;

// Spawn order keeps the first two players in opposite corners.
export const SPAWNS = [[1, 1], [19, 13], [19, 1], [1, 13], [10, 1], [10, 13], [1, 7], [19, 7]];

// A round is a series of matches; each one is a tighter map and unlocks new powers (novos).
const MUROS_MURALHAS = [[5, 4], [15, 4], [5, 10], [15, 10], [10, 5], [10, 9]];
const MUROS_LABIRINTO = [...MUROS_MURALHAS, [7, 2], [13, 2], [7, 12], [13, 12], [3, 6], [17, 6], [3, 8], [17, 8], [8, 7], [12, 7]];
const MUROS_FORNALHA = [...MUROS_LABIRINTO, [9, 4], [11, 4], [9, 10], [11, 10], [6, 5], [14, 5], [6, 9], [14, 9]];
// Powers unlocked by each match; a match drops everything unlocked so far.
const NOVOS = [
  [ITEM.BOMBA, ITEM.FOGO],
  [ITEM.TENIS, ITEM.CHUTE],
  [ITEM.ESCUDO, ITEM.DETONADOR],
  [ITEM.PERFURANTE, ITEM.IMA],
  [ITEM.FANTASMA, ITEM.GELO],
];
const ITENS_ATE = NOVOS.map((_, n) => NOVOS.slice(0, n + 1).flat());
export const MAPAS = Object.freeze([
  { nome: 'Pátio', descricao: 'Mapa aberto e poucas caixas.', densidade: 0.5, muros: [], itens: ITENS_ATE[0], novos: [] },
  { nome: 'Depósito', descricao: 'Caixas por todo lado.', densidade: 0.74, muros: [], itens: ITENS_ATE[1], novos: NOVOS[1] },
  { nome: 'Muralhas', descricao: 'Muros fecham alguns caminhos.', densidade: 0.68, muros: MUROS_MURALHAS, itens: ITENS_ATE[2], novos: NOVOS[2] },
  { nome: 'Labirinto', descricao: 'Corredores apertados.', densidade: 0.66, muros: MUROS_LABIRINTO, itens: ITENS_ATE[3], novos: NOVOS[3] },
  { nome: 'Fornalha', descricao: 'O mais fechado, e a morte súbita chega mais cedo.', densidade: 0.72, muros: MUROS_FORNALHA, itens: ITENS_ATE[4], novos: NOVOS[4], morteSubitaS: 90 },
]);

export const indice = (x, y) => y * COLUNAS + x;
const arredondar = valor => Math.round(valor * 100) / 100;
const valida = direcao => (Number.isInteger(direcao) && direcao >= 0 && direcao < VETOR.length ? direcao : DIRECAO.NENHUMA);

export function velocidade(tenis) {
  return AJUSTES.velocidadeBase + tenis * AJUSTES.velocidadePorTenis;
}

export function ehBlocoFixo(x, y) {
  return x <= 0 || y <= 0 || x >= COLUNAS - 1 || y >= LINHAS - 1 || (x % 2 === 0 && y % 2 === 0);
}

export function sobrepoe(jogador, x, y) {
  return Math.abs(jogador.x - x) < 0.99 && Math.abs(jogador.y - y) < 0.99;
}

// The cell a player is pushing against: aligned on its lane, at the center of its cell (where walking
// into a bomb stops it), facing the next cell. Returns [x, y] when temBomba says there is a bomb there.
export function bombaAFrente(jogador, direcao, temBomba, folga = EPS) {
  const [dx, dy] = VETOR[valida(direcao)];
  if (!dx && !dy) return null;
  const x = Math.round(jogador.x);
  const y = Math.round(jogador.y);
  const desvio = dx ? Math.abs(jogador.y - y) : Math.abs(jogador.x - x);
  const avanco = dx ? (jogador.x - x) * dx : (jogador.y - y) * dy;
  if (desvio > folga || avanco < -folga) return null;
  return temBomba(x + dx, y + dy) ? [x + dx, y + dy] : null;
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

export function gerarGrade(sorteio = Math.random, densidade = AJUSTES.densidadeCaixas, muros = []) {
  const seguras = celulasSeguras();
  const grade = [];
  for (let y = 0; y < LINHAS; y++) {
    for (let x = 0; x < COLUNAS; x++) grade.push(ehBlocoFixo(x, y) ? PAREDE : CHAO);
  }
  // Extra walls never close a spawn area nor cut the arena in two.
  for (const [x, y] of muros) {
    const i = indice(x, y);
    if (seguras.has(i) || grade[i] === PAREDE) continue;
    grade[i] = PAREDE;
    if (!conectada(grade)) grade[i] = CHAO;
  }
  for (let i = 0; i < grade.length; i++) {
    if (grade[i] === CHAO && !seguras.has(i) && sorteio() < densidade) grade[i] = CAIXA;
  }
  return grade;
}

export function gradeVazia(muros = []) {
  return gerarGrade(Math.random, 0, muros);
}

// Sudden death fills the arena ring by ring, from the border inward.
function gerarEspiral() {
  const ordem = [];
  const vistos = new Set();
  const incluir = (x, y) => {
    const i = indice(x, y);
    if (vistos.has(i) || ehBlocoFixo(x, y)) return;
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
      if (Math.abs(desvio) > 0.2 && livre) alvo = vizinha;
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
    alcance: AJUSTES.alcanceInicial,
    tenis: 0,
    escudo: false,
    perfurante: false,
    chute: false,
    detonador: false,
    ima: 0,
    gelo: 0,
    pedidosGelo: 0,
    fantasma: 0,
    fantasmaFolga: 0,
    invulneravel: 0,
    pedidosBomba: 0,
    relogioRemoto: null,
    caixas: 0,
    eliminacoes: 0,
  };
}

// Score of one player: crates are the steady income, eliminations and match wins weigh more.
export const PONTOS = Object.freeze({ caixa: 1, eliminacao: 5, vitoria: 15 });

export class Partida {
  constructor(participantes, { mapa = MAPAS[0], grade = null, sorteio = Math.random } = {}) {
    this.sorteio = sorteio;
    this.mapa = mapa;
    this.itens = mapa.itens ?? Object.values(ITEM);
    this.morteSubitaS = mapa.morteSubitaS ?? AJUSTES.morteSubitaS;
    this.grade = grade ? [...grade] : gerarGrade(sorteio, mapa.densidade ?? AJUSTES.densidadeCaixas, mapa.muros ?? []);
    this.versaoGrade = 0;
    this.jogadores = participantes.map((participante, n) => novoJogador(participante, n));
    this.bombas = [];
    this.chamas = new Map(); // cell index -> { restante, idade, forma, item }
    this.voando = []; // items flying to a magnet: { x, y, item, alvo }
    this.gelos = []; // ice shots in flight: { x, y, d, andou, dono }, x and y being where it was thrown from
    this.eventos = [];
    this.tempo = 0;
    this.espiral = gerarEspiral();
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
    if (!jogador?.vivo || !jogador.remoto) return false;
    if (![x, y, c].every(Number.isFinite)) return false;
    if (jogador.relogioRemoto !== null && c <= jogador.relogioRemoto) return false;
    const segundos = jogador.relogioRemoto === null ? 1 : Math.min((c - jogador.relogioRemoto) / 1000, 1);
    const permitido = velocidade(jogador.tenis) * segundos * FOLGA_VELOCIDADE + FOLGA_DISTANCIA;
    if (Math.abs(x - jogador.x) + Math.abs(y - jogador.y) > permitido) return false;
    if (!this.#posicaoLivre(x, y, jogador.fantasma > 0 || jogador.fantasmaFolga > 0)) return false;
    jogador.relogioRemoto = c;
    jogador.x = x;
    jogador.y = y;
    jogador.olhar = valida(o) || jogador.olhar;
    jogador.andando = Boolean(a);
    return true;
  }

  pedirBomba(id) {
    const jogador = this.#jogador(id);
    if (jogador?.vivo) jogador.pedidosBomba = Math.min(jogador.pedidosBomba + 1, 2);
  }

  // Throws an ice shot where the player is facing, if it has any left.
  jogarGelo(id) {
    const jogador = this.#jogador(id);
    if (jogador?.vivo) jogador.pedidosGelo = Math.min(jogador.pedidosGelo + 1, 2);
  }

  // A player with the kick power pushing against a still bomb sends it sliding until it hits something.
  // Local players kick by walking; remote ones ask for it (their position is checked with some slack).
  chutar(id, direcao) {
    const jogador = this.#jogador(id);
    if (!jogador?.vivo || !jogador.chute) return false;
    const d = valida(direcao);
    const alvo = bombaAFrente(jogador, d, (x, y) => Boolean(this.#bombaEm(x, y)), jogador.remoto ? FOLGA_CHUTE : EPS);
    if (!alvo) return false;
    const bomba = this.#bombaEm(...alvo);
    const [dx, dy] = VETOR[d];
    if (bomba.deslize || this.#bloqueiaBomba(bomba.x + dx, bomba.y + dy, bomba)) return false;
    bomba.deslize = d;
    bomba.avanco = 0;
    this.eventos.push({ e: 'chute', j: jogador.n, x: bomba.x, y: bomba.y });
    return true;
  }

  removerJogador(id) {
    const jogador = this.#jogador(id);
    if (jogador?.vivo) this.#matar(jogador);
  }

  passo(dt) {
    if (this.resultado) return;
    this.tempo += dt;
    for (const jogador of this.jogadores) {
      jogador.invulneravel = Math.max(0, jogador.invulneravel - dt);
      jogador.ima = Math.max(0, jogador.ima - dt);
      if (jogador.fantasma > 0) {
        jogador.fantasma = Math.max(0, jogador.fantasma - dt);
        // A short leftover lets a ghost that ends inside a crate still walk out of it.
        if (jogador.fantasma === 0) jogador.fantasmaFolga = 1;
      } else {
        jogador.fantasmaFolga = Math.max(0, jogador.fantasmaFolga - dt);
      }
      if (!jogador.vivo || jogador.remoto) continue;
      moverComColisao(jogador, jogador.entrada, dt, (x, y) => this.#bloqueia(x, y, jogador));
      if (jogador.chute && jogador.entrada.d) this.chutar(jogador.id, jogador.entrada.d);
    }
    for (const jogador of this.jogadores) {
      if (!jogador.vivo) continue;
      this.#soltarBombas(jogador);
      this.#lancarGelo(jogador);
    }
    this.#atualizarPassantes();
    this.#deslizarBombas(dt);
    this.#moverGelos(dt);
    this.#atualizarBombas(dt);
    this.#atualizarChamas(dt);
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
        r: j.detonador ? 1 : 0,
        m: j.ima > 0 ? 1 : 0,
        gl: j.gelo,
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
      gl: this.gelos.map(t => {
        const [dx, dy] = VETOR[t.d];
        return [arredondar(t.x + dx * t.andou), arredondar(t.y + dy * t.andou), t.d];
      }),
      c: [...this.chamas].map(([i, chama]) => [i, chama.forma]),
      iv: this.voando.map(v => [arredondar(v.x), arredondar(v.y), v.item, v.alvo.n]),
      tm: arredondar(this.tempo),
      ms: this.morteSubitaS,
    };
  }

  // Per-player tally of this match, used for the round score.
  estatisticas() {
    return this.jogadores.map(j => ({ id: j.id, caixas: j.caixas, eliminacoes: j.eliminacoes }));
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
    if (celula === CAIXA) return true;
    const bomba = this.#bombaEm(x, y);
    return Boolean(bomba && !bomba.passantes.has(jogador.id));
  }

  #posicaoLivre(x, y, ignorarCaixas = false) {
    if (x < 0.5 || y < 0.5 || x > COLUNAS - 1.5 || y > LINHAS - 1.5) return false;
    for (let cy = Math.round(y - 0.49); cy <= Math.round(y + 0.49); cy++) {
      for (let cx = Math.round(x - 0.49); cx <= Math.round(x + 0.49); cx++) {
        const celula = this.grade[indice(cx, cy)];
        if (celula === PAREDE || (celula === CAIXA && !ignorarCaixas)) return false;
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
    if (celula === PAREDE || celula === CAIXA || ITENS.has(celula)) return true;
    if (this.jogadores.some(j => j.vivo && sobrepoe(j, x, y))) return true;
    return this.bombas.some(b => {
      if (b === propria) return false;
      if (b.x === x && b.y === y) return true;
      const [dx, dy] = VETOR[b.deslize];
      return b.avanco > 0 && b.x + dx === x && b.y + dy === y;
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
  #detonar(jogador) {
    const bomba = this.bombas.find(b => b.dono === jogador.id && b.remota && !b.congelada && AJUSTES.detonadorS - b.restante >= AJUSTES.armarDetonadorS);
    if (bomba) bomba.restante = 0;
  }

  #soltarBombas(jogador) {
    while (jogador.pedidosBomba > 0) {
      jogador.pedidosBomba--;
      const x = Math.round(jogador.x);
      const y = Math.round(jogador.y);
      const ativas = this.bombas.filter(b => b.dono === jogador.id).length;
      if (this.#bombaEm(x, y) || this.chamas.has(indice(x, y)) || ativas >= jogador.bombasMax) {
        this.#detonar(jogador);
        continue;
      }
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
      this.eventos.push({ e: 'bomba', x, y });
    }
  }

  #atualizarPassantes() {
    for (const bomba of this.bombas) {
      for (const id of bomba.passantes) {
        const jogador = this.#jogador(id);
        if (!jogador?.vivo || !sobrepoe(jogador, bomba.x, bomba.y)) bomba.passantes.delete(id);
      }
    }
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
        if (celula === PAREDE || celula === CAIXA) return false;
        if (this.jogadores.some(j => j.vivo && j.id !== tiro.dono && sobrepoe(j, x, y))) return false;
      }
      return true;
    });
  }

  #atualizarBombas(dt) {
    // A frozen bomb's fuse waits; only another bomb's fire (the chain below) sets it off meanwhile.
    for (const bomba of this.bombas) {
      if (bomba.congelada > 0) bomba.congelada = Math.max(0, bomba.congelada - dt);
      else bomba.restante -= dt;
    }
    const fila = this.bombas.filter(b => b.restante <= 0 && !b.congelada);
    while (fila.length) {
      const bomba = fila.shift();
      if (this.bombas.includes(bomba)) this.#explodir(bomba, fila);
    }
  }

  #explodir(bomba, fila) {
    this.bombas = this.bombas.filter(b => b !== bomba);
    this.eventos.push({ e: 'bum', x: bomba.x, y: bomba.y });
    this.#acenderChama(bomba.x, bomba.y, 'c', bomba.dono);
    const dono = this.#jogador(bomba.dono);
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
        if (celula === CAIXA) {
          this.#mudarCelula(i, CHAO);
          this.#acenderChama(x, y, 'x', bomba.dono, sortearItem(this.sorteio, this.itens));
          if (dono) dono.caixas++;
          this.eventos.push({ e: 'caixa', j: dono?.n ?? -1, x, y });
          // A piercing blast keeps going through crates.
          if (bomba.perfurante) continue;
          break;
        }
        const outra = this.#bombaEm(x, y);
        if (outra) {
          // Chain reaction: the other bomb blows in this same tick and spreads its own flames.
          outra.restante = 0;
          fila.push(outra);
          this.#acenderChama(x, y, forma, bomba.dono);
          break;
        }
        if (ITENS.has(celula)) {
          this.#mudarCelula(i, CHAO);
          this.#acenderChama(x, y, ponta, bomba.dono);
          break;
        }
        this.#acenderChama(x, y, forma, bomba.dono);
      }
    }
  }

  #acenderChama(x, y, forma, dono, item = null) {
    const i = indice(x, y);
    const atual = this.chamas.get(i);
    if (atual?.forma === 'x') {
      atual.restante = AJUSTES.chamaS;
      return;
    }
    let nova = forma;
    if (atual && forma !== 'x' && atual.forma !== forma) {
      if (HORIZONTAIS.has(atual.forma) && HORIZONTAIS.has(forma)) nova = 'h';
      else if (VERTICAIS.has(atual.forma) && VERTICAIS.has(forma)) nova = 'v';
      else nova = 'c';
    }
    this.chamas.set(i, {
      restante: AJUSTES.chamaS,
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
          jogador.escudo = false;
          jogador.invulneravel = AJUSTES.invulneravelEscudoS;
          this.eventos.push({ e: 'escudo', j: jogador.n, x: jogador.x, y: jogador.y });
        } else {
          this.#matar(jogador);
          const autor = this.#jogador(chama.dono);
          // Blowing yourself up scores nothing.
          if (autor && autor !== jogador) autor.eliminacoes++;
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
    if (item === ITEM.BOMBA) jogador.bombasMax = Math.min(jogador.bombasMax + 1, AJUSTES.maxBombas);
    else if (item === ITEM.FOGO) jogador.alcance = Math.min(jogador.alcance + 1, AJUSTES.maxAlcance);
    else if (item === ITEM.TENIS) jogador.tenis = Math.min(jogador.tenis + 1, AJUSTES.maxTenis);
    else if (item === ITEM.ESCUDO) jogador.escudo = true;
    else if (item === ITEM.PERFURANTE) jogador.perfurante = true;
    else if (item === ITEM.FANTASMA) jogador.fantasma = AJUSTES.fantasmaS;
    else if (item === ITEM.CHUTE) jogador.chute = true;
    else if (item === ITEM.DETONADOR) jogador.detonador = true;
    else if (item === ITEM.IMA) jogador.ima = AJUSTES.imaS;
    else if (item === ITEM.GELO) jogador.gelo = Math.min(jogador.gelo + AJUSTES.cargasGelo, AJUSTES.maxGelo);
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
          if (!ITENS.has(this.grade[i]) || (x - cx) ** 2 + (y - cy) ** 2 > raio * raio) continue;
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

  #matar(jogador) {
    jogador.vivo = false;
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
      for (const jogador of this.jogadores) {
        if (jogador.vivo && Math.round(jogador.x) === x && Math.round(jogador.y) === y) this.#matar(jogador);
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
