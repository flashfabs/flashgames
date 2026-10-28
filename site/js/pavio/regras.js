// Pavio rules: a pure simulation of a grid arena bomb game. Runs on the host; no DOM, no network.
// Movement is shared with the members, who move their own character locally and report the position.

export const COLUNAS = 21;
export const LINHAS = 15;
export const MAX_JOGADORES = 8;

export const PAREDE = '#';
export const CAIXA = '+';
export const CHAO = '.';
export const ITEM = Object.freeze({ BOMBA: 'b', FOGO: 'f', TENIS: 't', ESCUDO: 'e', PERFURANTE: 'p', FANTASMA: 'g' });
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
});
const PESOS_ITENS = { [ITEM.BOMBA]: 30, [ITEM.FOGO]: 30, [ITEM.TENIS]: 16, [ITEM.ESCUDO]: 10, [ITEM.PERFURANTE]: 8, [ITEM.FANTASMA]: 8 };
const PASSO_MAX = 0.1;
const EPS = 1e-4;
const FOLGA_VELOCIDADE = 1.35;
const FOLGA_DISTANCIA = 0.35;

// Spawn order keeps the first two players in opposite corners.
export const SPAWNS = [[1, 1], [19, 13], [19, 1], [1, 13], [10, 1], [10, 13], [1, 7], [19, 7]];

// A round is a series of matches; each one is a tighter map and unlocks one more power.
const MUROS_MURALHAS = [[5, 4], [15, 4], [5, 10], [15, 10], [10, 5], [10, 9]];
const MUROS_LABIRINTO = [...MUROS_MURALHAS, [7, 2], [13, 2], [7, 12], [13, 12], [3, 6], [17, 6], [3, 8], [17, 8], [8, 7], [12, 7]];
const MUROS_FORNALHA = [...MUROS_LABIRINTO, [9, 4], [11, 4], [9, 10], [11, 10], [6, 5], [14, 5], [6, 9], [14, 9]];
export const MAPAS = Object.freeze([
  { nome: 'Pátio', descricao: 'Mapa aberto e poucas caixas.', densidade: 0.5, muros: [], itens: [ITEM.BOMBA, ITEM.FOGO], novo: null },
  { nome: 'Depósito', descricao: 'Caixas por todo lado.', densidade: 0.74, muros: [], itens: [ITEM.BOMBA, ITEM.FOGO, ITEM.TENIS], novo: ITEM.TENIS },
  { nome: 'Muralhas', descricao: 'Muros fecham alguns caminhos.', densidade: 0.68, muros: MUROS_MURALHAS, itens: [ITEM.BOMBA, ITEM.FOGO, ITEM.TENIS, ITEM.ESCUDO], novo: ITEM.ESCUDO },
  { nome: 'Labirinto', descricao: 'Corredores apertados.', densidade: 0.66, muros: MUROS_LABIRINTO, itens: [ITEM.BOMBA, ITEM.FOGO, ITEM.TENIS, ITEM.ESCUDO, ITEM.PERFURANTE], novo: ITEM.PERFURANTE },
  { nome: 'Fornalha', descricao: 'O mais fechado, e a morte súbita chega mais cedo.', densidade: 0.72, muros: MUROS_FORNALHA, itens: Object.values(ITEM), novo: ITEM.FANTASMA, morteSubitaS: 90 },
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

  removerJogador(id) {
    const jogador = this.#jogador(id);
    if (jogador?.vivo) this.#matar(jogador);
  }

  passo(dt) {
    if (this.resultado) return;
    this.tempo += dt;
    for (const jogador of this.jogadores) {
      jogador.invulneravel = Math.max(0, jogador.invulneravel - dt);
      if (jogador.fantasma > 0) {
        jogador.fantasma = Math.max(0, jogador.fantasma - dt);
        // A short leftover lets a ghost that ends inside a crate still walk out of it.
        if (jogador.fantasma === 0) jogador.fantasmaFolga = 1;
      } else {
        jogador.fantasmaFolga = Math.max(0, jogador.fantasmaFolga - dt);
      }
      if (!jogador.vivo || jogador.remoto) continue;
      moverComColisao(jogador, jogador.entrada, dt, (x, y) => this.#bloqueia(x, y, jogador));
    }
    for (const jogador of this.jogadores) if (jogador.vivo) this.#soltarBombas(jogador);
    this.#atualizarPassantes();
    this.#atualizarBombas(dt);
    this.#atualizarChamas(dt);
    this.#aplicarChamasEItens();
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
        b: j.bombasMax,
        f: j.alcance,
        t: j.tenis,
        cx: j.caixas,
        el: j.eliminacoes,
      })),
      b: this.bombas.map(b => [b.x, b.y, arredondar(b.restante)]),
      c: [...this.chamas].map(([i, chama]) => [i, chama.forma]),
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

  #soltarBombas(jogador) {
    while (jogador.pedidosBomba > 0) {
      jogador.pedidosBomba--;
      const x = Math.round(jogador.x);
      const y = Math.round(jogador.y);
      if (this.#bombaEm(x, y) || this.chamas.has(indice(x, y))) continue;
      const ativas = this.bombas.filter(b => b.dono === jogador.id).length;
      if (ativas >= jogador.bombasMax) continue;
      const bomba = {
        x, y,
        dono: jogador.id,
        alcance: jogador.alcance,
        perfurante: jogador.perfurante,
        restante: AJUSTES.pavioS,
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

  #atualizarBombas(dt) {
    for (const bomba of this.bombas) bomba.restante -= dt;
    const fila = this.bombas.filter(b => b.restante <= 0);
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
      if (item === ITEM.BOMBA) jogador.bombasMax = Math.min(jogador.bombasMax + 1, AJUSTES.maxBombas);
      else if (item === ITEM.FOGO) jogador.alcance = Math.min(jogador.alcance + 1, AJUSTES.maxAlcance);
      else if (item === ITEM.TENIS) jogador.tenis = Math.min(jogador.tenis + 1, AJUSTES.maxTenis);
      else if (item === ITEM.ESCUDO) jogador.escudo = true;
      else if (item === ITEM.PERFURANTE) jogador.perfurante = true;
      else if (item === ITEM.FANTASMA) jogador.fantasma = AJUSTES.fantasmaS;
      this.eventos.push({ e: 'item', j: jogador.n, x, y, item });
    }
  }

  #matar(jogador) {
    jogador.vivo = false;
    jogador.entrada = { d: DIRECAO.NENHUMA, d2: DIRECAO.NENHUMA };
    jogador.andando = false;
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
