// Canvas painter for Pavio: draws one frame from a scene (grid, players, bombs, flames, effects).
// The static part of the arena (floor, walls, crates) is cached in an offscreen canvas and redrawn
// only when the grid changes, which keeps tablets and phones smooth. Particles are stateless: each
// effect derives its pieces from a seed and its age, so nothing is simulated between frames.

import { COLUNAS, LINHAS, PAREDE, CAIXA, ITEM, DIRECAO, AJUSTES, ehBlocoFixo } from './regras.js';

export const TAM = 48;
export const LARGURA = COLUNAS * TAM;
export const ALTURA = LINHAS * TAM;

export const CORES = [
  { base: '#ff6b6b', escura: '#a51d1d' },
  { base: '#4dabf7', escura: '#1559a0' },
  { base: '#94d82d', escura: '#4c7a0b' },
  { base: '#fcc419', escura: '#a8740a' },
  { base: '#b197fc', escura: '#5f3dc4' },
  { base: '#ff922b', escura: '#a8470b' },
  { base: '#20c997', escura: '#0b6e52' },
  { base: '#f783ac', escura: '#a61e4d' },
];

// Every color also has a shape (SVG path in a 24x24 box), so players can be told apart without color.
export const SIMBOLOS = [
  { nome: 'círculo', d: 'M12 5A7 7 0 1 1 11.99 5Z' },
  { nome: 'triângulo', d: 'M12 3L21.5 20H2.5Z' },
  { nome: 'quadrado', d: 'M4.5 4.5H19.5V19.5H4.5Z' },
  { nome: 'losango', d: 'M12 2L22 12L12 22L2 12Z' },
  { nome: 'estrela', d: 'M12 2.5L14.47 9.1L21.51 9.41L16 13.8L17.88 20.59L12 16.7L6.12 20.59L8 13.8L2.49 9.41L9.53 9.1Z' },
  { nome: 'cruz', d: 'M8.5 3H15.5V8.5H21V15.5H15.5V21H8.5V15.5H3V8.5H8.5Z' },
  { nome: 'hexágono', d: 'M12 2.5L20.23 7.25V16.75L12 21.5L3.77 16.75V7.25Z' },
  { nome: 'coração', d: 'M12 21C5 15.5 2.5 12.5 2.5 8.5A4.75 4.75 0 0 1 12 6.6A4.75 4.75 0 0 1 21.5 8.5C21.5 12.5 19 15.5 12 21Z' },
];

export const VISUAL_ITEM = {
  [ITEM.BOMBA]: { fundo: '#364fc7', emoji: '💣', nome: 'Mais bombas', rotulo: '+1 bomba' },
  [ITEM.FOGO]: { fundo: '#d9480f', emoji: '🔥', nome: 'Mais alcance', rotulo: '+1 fogo' },
  [ITEM.TENIS]: { fundo: '#2b8a3e', emoji: '👟', nome: 'Tênis', rotulo: '+velocidade' },
  [ITEM.ESCUDO]: { fundo: '#0b7285', emoji: '🛡️', nome: 'Escudo', rotulo: 'escudo' },
  [ITEM.PERFURANTE]: { fundo: '#a61e4d', emoji: '💥', nome: 'Fogo perfurante', rotulo: 'perfurante' },
  [ITEM.FANTASMA]: { fundo: '#5f3dc4', emoji: '👻', nome: 'Fantasma', rotulo: 'fantasma' },
  [ITEM.CHUTE]: { fundo: '#e67700', emoji: '🦶', nome: 'Chute', rotulo: 'chute' },
  [ITEM.DETONADOR]: { fundo: '#c92a2a', emoji: '🎯', nome: 'Detonador', rotulo: 'detonador' },
  [ITEM.IMA]: { fundo: '#1971c2', emoji: '🧲', nome: 'Ímã', rotulo: 'ímã' },
  [ITEM.GELO]: { fundo: '#0c8599', emoji: '❄️', nome: 'Gelo', rotulo: '+3 gelo' },
  [ITEM.ATALHO]: { fundo: '#862e9c', emoji: '🌀', nome: 'Atalho', rotulo: '+1 atalho' },
};

export const DESCRICAO_ITEM = {
  [ITEM.BOMBA]: 'solta mais bombas de uma vez',
  [ITEM.FOGO]: 'explosão vai mais longe',
  [ITEM.TENIS]: 'anda mais rápido',
  [ITEM.ESCUDO]: 'aguenta uma explosão',
  [ITEM.PERFURANTE]: 'o fogo atravessa caixas e quebra todas no caminho',
  [ITEM.FANTASMA]: 'atravessa caixas e bombas por 8 segundos',
  [ITEM.CHUTE]: 'ande contra uma bomba e ela sai deslizando até bater em algo',
  [ITEM.DETONADOR]: 'sem bomba sobrando, apertar de novo explode a mais antiga',
  [ITEM.IMA]: 'por 8 segundos, itens a até 3 casas voam até você',
  [ITEM.GELO]: 'jogue gelo (E, ou o botão ❄️) e a primeira bomba à frente congela por 3 segundos',
  [ITEM.ATALHO]: 'empurre uma caixa e apareça do outro lado; cada caixa gasta um atalho',
};

const PALETA = {
  chaoA: '#263544',
  chaoB: '#2a3a4a',
  sombraBloco: 'rgba(0, 0, 0, 0.22)',
  borda: ['#323e4b', '#222b35', '#161c23'],
  pilar: ['#8a99a8', '#62717e', '#434f5a'],
  muro: ['#7c8a6e', '#56634b', '#3a4433'],
  subita: ['#e8590c', '#a63c06', '#6b2604'],
  caixa: '#b9783b',
  caixaClara: '#d9995a',
  caixaEscura: '#7a4a1f',
  caixaQueimada: '#4a3426',
  bomba: '#1d2127',
  bombaAlerta: '#8f1d1d',
  pavio: '#c9a26b',
  chama: ['#ff6a1a', '#ffc53d', '#fff6dd'],
  gelo: 'rgba(165, 216, 255, 0.28)',
  geloBorda: 'rgba(235, 248, 255, 0.9)',
  faiscas: ['#ffd43b', '#ff922b', '#fff3bf'],
  fumaca: '#59636e',
  poeira: '#c8a27a',
  escudo: '#66d9e8',
  tinta: '#16161f',
};
const FONTE_EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const FONTE_TEXTO = 'Rubik, system-ui, sans-serif';
const FONTE_NOME = `700 12px ${FONTE_TEXTO}`;
const DURACAO_EFEITO = { explosao: 0.95, caixa: 0.75, bloco: 0.5, morte: 1.4, item: 0.9, escudo: 0.6, ponto: 0.8, largada: 0.9 };
// Ground effects are drawn under bombs and players; the rest on top of everything.
const EFEITOS_DO_CHAO = new Set(['explosao', 'caixa', 'bloco']);
const OLHAR = { [DIRECAO.ESQUERDA]: [-3.5, 0], [DIRECAO.DIREITA]: [3.5, 0], [DIRECAO.BAIXO]: [0, 2] };
const RETRATO = 72; // logical size of the small character portraits on the HTML screens
const caminhosSimbolos = [];

const limitar = (valor, min, max) => Math.min(max, Math.max(min, valor));
const suavizarSaida = k => 1 - (1 - k) * (1 - k);
const voltaPorCima = k => 1 + 2.70158 * (k - 1) ** 3 + 1.70158 * (k - 1) ** 2;

export function indiceCor(cor) {
  const n = Number(cor);
  return Number.isInteger(n) && n >= 0 ? n % CORES.length : 0;
}

// Colored badge with the player's shape, for the HTML lists (room members, lobby, scoreboard).
export function marcaJogador(cor) {
  const n = indiceCor(cor);
  const marca = document.createElement('span');
  marca.className = 'marca-jogador';
  marca.title = SIMBOLOS[n].nome;
  marca.setAttribute('aria-hidden', 'true');
  marca.style.setProperty('--cor', CORES[n].base);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  const caminho = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  caminho.setAttribute('d', SIMBOLOS[n].d);
  svg.append(caminho);
  marca.append(svg);
  return marca;
}

function retangulo(ctx, x, y, largura, altura, raio) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, largura, altura, raio);
  else ctx.rect(x, y, largura, altura);
}

function circulo(ctx, x, y, raio) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, raio), 0, Math.PI * 2);
}

function elipse(ctx, x, y, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), 0, 0, Math.PI * 2);
}

// A rotated rectangle without save/restore, used for wood shards and confetti.
function lasca(ctx, x, y, largura, altura, angulo) {
  const cos = Math.cos(angulo);
  const sen = Math.sin(angulo);
  const lx = largura / 2;
  const ly = altura / 2;
  ctx.beginPath();
  ctx.moveTo(x - lx * cos + ly * sen, y - lx * sen - ly * cos);
  ctx.lineTo(x + lx * cos + ly * sen, y + lx * sen - ly * cos);
  ctx.lineTo(x + lx * cos - ly * sen, y + lx * sen + ly * cos);
  ctx.lineTo(x - lx * cos - ly * sen, y - lx * sen + ly * cos);
  ctx.closePath();
  ctx.fill();
}

// Four-pointed sparkle.
function brilho(ctx, x, y, raio) {
  const r = raio * 0.28;
  ctx.beginPath();
  ctx.moveTo(x, y - raio);
  ctx.lineTo(x + r, y - r);
  ctx.lineTo(x + raio, y);
  ctx.lineTo(x + r, y + r);
  ctx.lineTo(x, y + raio);
  ctx.lineTo(x - r, y + r);
  ctx.lineTo(x - raio, y);
  ctx.lineTo(x - r, y - r);
  ctx.closePath();
  ctx.fill();
}

function desenharSimbolo(ctx, cor, x, y, tamanho, preenchimento) {
  const n = indiceCor(cor);
  caminhosSimbolos[n] ??= new Path2D(SIMBOLOS[n].d);
  ctx.save();
  ctx.translate(x - tamanho / 2, y - tamanho / 2);
  ctx.scale(tamanho / 24, tamanho / 24);
  ctx.fillStyle = preenchimento;
  ctx.fill(caminhosSimbolos[n]);
  ctx.restore();
}

// Deterministic 0..1 noise: the same effect gets the same particles on every frame.
function aleatorio(semente, k) {
  let t = (semente + Math.imul(k + 1, 0x6d2b79f5)) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function sementeDe(efeito) {
  const x = Math.round((Number(efeito.x) || 0) * 97);
  const y = Math.round((Number(efeito.y) || 0) * 89);
  return Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.round(efeito.inicio * 1000);
}

function faisca(ctx, x, y, agora, tamanho = 3.5) {
  const tremula = tamanho + Math.sin(agora * 47 + x) * 1.2;
  ctx.fillStyle = '#ff922b';
  circulo(ctx, x, y, tremula + 1.5);
  ctx.fill();
  ctx.fillStyle = '#fff3bf';
  circulo(ctx, x, y, tremula * 0.55);
  ctx.fill();
}

function desenharBloco(ctx, x, y, muros) {
  const px = x * TAM;
  const py = y * TAM;
  const borda = x === 0 || y === 0 || x === COLUNAS - 1 || y === LINHAS - 1;
  let cores = PALETA.subita;
  if (borda) cores = PALETA.borda;
  else if (ehBlocoFixo(x, y)) cores = PALETA.pilar;
  else if (muros.has(y * COLUNAS + x)) cores = PALETA.muro;
  const [topo, corpo, sombra] = cores;
  ctx.fillStyle = sombra;
  ctx.fillRect(px, py, TAM, TAM);
  if (borda) return;
  ctx.fillStyle = corpo;
  retangulo(ctx, px + 2, py + 2, TAM - 4, TAM - 7, 7);
  ctx.fill();
  ctx.fillStyle = topo;
  retangulo(ctx, px + 6, py + 5, TAM - 12, TAM - 19, 6);
  ctx.fill();
}

function desenharCaixa(ctx, px, py, queimando = false) {
  const m = 4;
  ctx.fillStyle = queimando ? PALETA.caixaQueimada : PALETA.caixaEscura;
  retangulo(ctx, px + m, py + m, TAM - m * 2, TAM - m * 2, 6);
  ctx.fill();
  if (queimando) return;
  ctx.fillStyle = PALETA.caixa;
  retangulo(ctx, px + m + 3, py + m + 3, TAM - m * 2 - 6, TAM - m * 2 - 9, 4);
  ctx.fill();
  ctx.strokeStyle = PALETA.caixaEscura;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(px + m + 6, py + TAM - m - 10);
  ctx.lineTo(px + TAM - m - 6, py + m + 6);
  ctx.stroke();
  ctx.fillStyle = PALETA.caixaClara;
  ctx.fillRect(px + m + 5, py + m + 4, TAM - m * 2 - 10, 3);
}

function desenharArenaFixa(ctx, grade, muros) {
  ctx.fillStyle = PALETA.borda[2];
  ctx.fillRect(0, 0, LARGURA, ALTURA);
  for (let y = 0; y < LINHAS; y++) {
    for (let x = 0; x < COLUNAS; x++) {
      const celula = grade[y * COLUNAS + x];
      if (celula === PAREDE) {
        desenharBloco(ctx, x, y, muros);
        continue;
      }
      const px = x * TAM;
      const py = y * TAM;
      ctx.fillStyle = (x + y) % 2 ? PALETA.chaoA : PALETA.chaoB;
      ctx.fillRect(px, py, TAM, TAM);
      const acima = grade[(y - 1) * COLUNAS + x];
      if (acima === PAREDE || acima === CAIXA) {
        ctx.fillStyle = PALETA.sombraBloco;
        ctx.fillRect(px, py, TAM, 7);
      }
      if (celula === CAIXA) desenharCaixa(ctx, px, py);
    }
  }
}

function desenharSpriteItem(ctx, item) {
  const visual = VISUAL_ITEM[item];
  ctx.fillStyle = visual.fundo;
  retangulo(ctx, 7, 7, TAM - 14, TAM - 14, 9);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.font = `${Math.round(TAM * 0.42)}px ${FONTE_EMOJI}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(visual.emoji, TAM / 2, TAM / 2 + 1);
}

// A frozen bomb sits inside a block of ice.
function desenharBlocoGelo(ctx, x, y) {
  ctx.fillStyle = PALETA.gelo;
  retangulo(ctx, x * TAM + 5, y * TAM + 4, TAM - 10, TAM - 8, 8);
  ctx.fill();
  ctx.strokeStyle = PALETA.geloBorda;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.fillRect(x * TAM + 11, y * TAM + 9, 10, 3);
}

function desenharTiroGelo(ctx, [x, y], agora) {
  const cx = (x + 0.5) * TAM;
  const cy = (y + 0.5) * TAM;
  ctx.fillStyle = 'rgba(165, 216, 255, 0.35)';
  circulo(ctx, cx, cy, TAM * 0.26);
  ctx.fill();
  ctx.font = `${Math.round(TAM * 0.4)}px ${FONTE_EMOJI}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(agora * 9);
  ctx.fillText('❄️', 0, 1);
  ctx.restore();
}

// Items on the floor glow and twinkle so they read as "pick me up".
function desenharItem(ctx, quadro, i, item, agora, reduzido) {
  const px = (i % COLUNAS) * TAM;
  const py = Math.floor(i / COLUNAS) * TAM;
  const fase = agora * 4 + i;
  if (!reduzido) {
    ctx.globalAlpha = 0.2 + Math.sin(fase) * 0.12;
    ctx.fillStyle = VISUAL_ITEM[item].fundo;
    circulo(ctx, px + TAM / 2, py + TAM / 2, TAM * 0.46);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.drawImage(quadro, px, py + (reduzido ? 0 : Math.sin(fase) * 2), TAM, TAM);
  const cintilar = (agora * 0.7 + i * 0.37) % 1;
  if (!reduzido && cintilar < 0.2) {
    ctx.fillStyle = '#fffbe6';
    brilho(ctx, px + TAM * 0.74, py + TAM * 0.26, 6 * Math.sin((cintilar / 0.2) * Math.PI));
  }
}

function desenharBomba(ctx, [x, y, restante, , remota, congelada], agora, reduzido) {
  const cx = (x + 0.5) * TAM;
  const cy = (y + 0.5) * TAM + 3;
  const idade = AJUSTES.pavioS - restante;
  const entrada = reduzido ? 1 : limitar(idade / 0.18, 0, 1);
  const ritmo = restante < 0.7 ? 24 : restante < 1.4 ? 13 : 7;
  const pulso = reduzido ? 0 : Math.sin(agora * ritmo);
  const raio = TAM * 0.3 * (1 + pulso * 0.06) * (0.35 + 0.65 * voltaPorCima(entrada));
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  elipse(ctx, cx, (y + 0.5) * TAM + TAM * 0.32, raio * 0.95, raio * 0.3);
  ctx.fill();
  if (restante < 0.7) {
    ctx.strokeStyle = `rgba(255, 107, 107, ${reduzido ? 0.6 : 0.35 + pulso * 0.3})`;
    ctx.lineWidth = 3;
    circulo(ctx, cx, cy, raio * 1.45);
    ctx.stroke();
  }
  ctx.fillStyle = restante < 0.7 && pulso > 0 ? PALETA.bombaAlerta : PALETA.bomba;
  circulo(ctx, cx, cy, raio);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  circulo(ctx, cx - raio * 0.35, cy - raio * 0.38, raio * 0.28);
  ctx.fill();
  // The fuse burns down with the timer: the remaining length is the time left.
  const t = 0.18 + 0.82 * limitar(restante / AJUSTES.pavioS, 0, 1);
  const x0 = cx + raio * 0.45;
  const y0 = cy - raio * 0.8;
  const x1 = cx + raio * 0.75;
  const y1 = cy - raio * 1.75;
  const x2 = cx + raio * 1.3;
  const y2 = cy - raio * 1.6;
  const pontaX = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * x1 + t * t * x2;
  const pontaY = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * y1 + t * t * y2;
  ctx.strokeStyle = PALETA.pavio;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, pontaX, pontaY);
  ctx.stroke();
  if (remota) {
    // A remote bomb has no lit fuse: a blinking red light waits for the detonator.
    ctx.fillStyle = Math.sin(agora * 9) > 0 ? '#ff3b3b' : '#7a1010';
    circulo(ctx, pontaX, pontaY, 4);
    ctx.fill();
  } else if (!congelada) {
    faisca(ctx, pontaX, pontaY, agora, restante < 0.7 ? 4.5 : 3.5);
  }
  if (congelada) desenharBlocoGelo(ctx, x, y);
}

function desenharChama(ctx, [i, forma], agora) {
  const x = i % COLUNAS;
  const y = Math.floor(i / COLUNAS);
  const px = x * TAM;
  const py = y * TAM;
  const cx = px + TAM / 2;
  const cy = py + TAM / 2;
  if (forma === 'x') desenharCaixa(ctx, px, py, true);
  const pulso = 0.9 + Math.sin(agora * 38 + i) * 0.08;
  PALETA.chama.forEach((cor, camada) => {
    const largura = TAM * [0.82, 0.56, 0.28][camada] * pulso;
    const meia = largura / 2;
    ctx.fillStyle = cor;
    switch (forma) {
      case 'h':
        ctx.fillRect(px, cy - meia, TAM, largura);
        break;
      case 'v':
        ctx.fillRect(cx - meia, py, largura, TAM);
        break;
      case 'l':
        ctx.fillRect(cx, cy - meia, TAM / 2, largura);
        retangulo(ctx, px + TAM * 0.08, cy - meia, TAM * 0.92, largura, meia);
        ctx.fill();
        break;
      case 'r':
        ctx.fillRect(px, cy - meia, TAM / 2, largura);
        retangulo(ctx, px, cy - meia, TAM * 0.92, largura, meia);
        ctx.fill();
        break;
      case 'u':
        ctx.fillRect(cx - meia, cy, largura, TAM / 2);
        retangulo(ctx, cx - meia, py + TAM * 0.08, largura, TAM * 0.92, meia);
        ctx.fill();
        break;
      case 'd':
        ctx.fillRect(cx - meia, py, largura, TAM / 2);
        retangulo(ctx, cx - meia, py, largura, TAM * 0.92, meia);
        ctx.fill();
        break;
      case 'x':
        circulo(ctx, cx, cy, meia * 1.1);
        ctx.fill();
        break;
      default:
        ctx.fillRect(px, cy - meia, TAM, largura);
        ctx.fillRect(cx - meia, py, largura, TAM);
        circulo(ctx, cx, cy, meia * 1.25);
        ctx.fill();
    }
  });
}

// One character with its feet at (cx, chao). Poses: 'jogo' (walks and blinks), 'festa' (jumps with
// the arms up), 'pronto' (happy little hop) and 'morto' (x_x). Returns the y of the top of the body.
function desenharBoneco(ctx, cx, chao, b, pose, agora, reduzido, extra = {}) {
  const n = indiceCor(b.cor);
  const cor = CORES[n];
  const semente = n * 1.37;
  const andando = pose === 'jogo' && Boolean(b.a) && !reduzido;
  const passo = andando ? Math.sin(agora * 14 + semente) : 0;
  const feliz = pose === 'festa' || pose === 'pronto';
  let salto = 0;
  if (!reduzido && pose === 'festa') salto = Math.abs(Math.sin(agora * 6 + semente)) * 11;
  else if (!reduzido && pose === 'pronto') salto = Math.max(0, Math.sin(agora * 4 + semente)) ** 6 * 7;
  const respiro = reduzido || andando ? 0 : Math.sin(agora * 3 + semente) * 0.03;
  let [sx, sy] = extra.esmagar ?? [1 - respiro, 1 + respiro];
  if (andando) {
    const pisada = 1 - Math.abs(passo);
    sx += pisada * 0.05;
    sy -= pisada * 0.05;
  }
  const largura = TAM * 0.62 * sx;
  const altura = TAM * 0.64 * sy;
  const topo = -6 - Math.abs(passo) * 3 - altura;
  let inclinacao = 0;
  if (andando && b.o === DIRECAO.ESQUERDA) inclinacao = -0.08;
  else if (andando && b.o === DIRECAO.DIREITA) inclinacao = 0.08;
  const pele = extra.branco ? '#ffffff' : cor.base;

  const sombra = 1 - salto / 40;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  elipse(ctx, cx, chao, TAM * 0.28 * sombra * sx, TAM * 0.09 * sombra);
  ctx.fill();

  ctx.save();
  ctx.translate(cx, chao - salto);
  if (inclinacao) ctx.rotate(inclinacao);

  ctx.fillStyle = cor.escura;
  elipse(ctx, -8 + passo * 3, -3 - Math.max(0, passo) * 2.5, 6, 4);
  ctx.fill();
  elipse(ctx, 8 - passo * 3, -3 - Math.max(0, -passo) * 2.5, 6, 4);
  ctx.fill();

  ctx.fillStyle = pele;
  retangulo(ctx, -largura / 2, topo, largura, altura, largura * 0.46);
  ctx.fill();
  ctx.strokeStyle = b.p ? '#ff8787' : cor.escura;
  ctx.lineWidth = b.p ? 3.5 : 2.5;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  elipse(ctx, -largura * 0.2, topo + altura * 0.25, largura * 0.14, altura * 0.1);
  ctx.fill();

  // Little round hands: they swing while walking and go up when celebrating.
  const festa = pose === 'festa';
  const maoX = largura / 2 + (festa ? 4 : 0.5);
  const maoY = festa ? topo + 3 + (reduzido ? 0 : Math.sin(agora * 14) * 2.5) : topo + altura * 0.64;
  ctx.fillStyle = pele;
  ctx.strokeStyle = cor.escura;
  ctx.lineWidth = 2;
  for (const lado of [-1, 1]) {
    circulo(ctx, lado * maoX, maoY + passo * lado * 2, 4.2);
    ctx.fill();
    ctx.stroke();
  }

  // Every character carries a little lit fuse on its head.
  ctx.strokeStyle = '#3b2f2f';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(3, topo + 1);
  ctx.quadraticCurveTo(11, topo - 6, 7, topo - 12);
  ctx.stroke();
  if (pose !== 'morto') faisca(ctx, 7, topo - 12, agora, festa ? 4.5 : 3);

  const olhoY = topo + altura * 0.47;
  ctx.strokeStyle = PALETA.tinta;
  if (pose === 'morto') {
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (const lado of [-1, 1]) {
      const ox = lado * 7.5;
      ctx.moveTo(ox - 3.5, olhoY - 3.5);
      ctx.lineTo(ox + 3.5, olhoY + 3.5);
      ctx.moveTo(ox + 3.5, olhoY - 3.5);
      ctx.lineTo(ox - 3.5, olhoY + 3.5);
    }
    ctx.stroke();
  } else if (feliz) {
    ctx.lineWidth = 2.8;
    for (const lado of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(lado * 7.5, olhoY + 2, 4, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, olhoY + 5, 4.5, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  } else if (b.o !== DIRECAO.CIMA) {
    const olhar = OLHAR[b.o] ?? OLHAR[DIRECAO.BAIXO];
    const piscando = (agora + semente * 2.3) % 3.6 < 0.12;
    for (const lado of [-1, 1]) {
      const olhoX = lado * 7.5 + olhar[0] * 0.7;
      if (piscando) {
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(olhoX - 4, olhoY + 1);
        ctx.lineTo(olhoX + 4, olhoY + 1);
        ctx.stroke();
        continue;
      }
      ctx.fillStyle = '#ffffff';
      elipse(ctx, olhoX, olhoY, 5.5, 6.5);
      ctx.fill();
      ctx.fillStyle = PALETA.tinta;
      circulo(ctx, olhoX + olhar[0] * 0.6, olhoY + olhar[1], 3);
      ctx.fill();
    }
  }
  ctx.restore();
  return chao - salto + topo;
}

function desenharJogador(ctx, jogador, agora, reduzido) {
  const cx = (jogador.x + 0.5) * TAM;
  const chao = (jogador.y + 0.5) * TAM + TAM * 0.36;
  ctx.save();
  if (jogador.g) ctx.globalAlpha = 0.55 + (reduzido ? 0 : Math.sin(agora * 8) * 0.15);
  if (jogador.i && (reduzido || Math.floor(agora * 12) % 2)) ctx.globalAlpha = reduzido ? 0.6 : 0.4;
  const pose = jogador.festa ? 'festa' : jogador.pronto ? 'pronto' : 'jogo';
  const topo = desenharBoneco(ctx, cx, chao, jogador, pose, agora, reduzido);
  ctx.restore();
  if (jogador.e) {
    ctx.strokeStyle = 'rgba(102, 217, 232, 0.95)';
    ctx.fillStyle = 'rgba(102, 217, 232, 0.14)';
    ctx.lineWidth = 3;
    circulo(ctx, cx, topo + TAM * 0.32, TAM * 0.47 + (reduzido ? 0 : Math.sin(agora * 6) * 1.5));
    ctx.fill();
    ctx.stroke();
  }
  return topo;
}

// Name tag over the head: a badge with the player's color and shape, then the name. On small screens
// the tag grows so the shape stays readable, and the name is left out (the side list has it).
function desenharRotulo(ctx, cx, topo, chao, jogador, larguraNome, escala, comNome, voce, agora, reduzido) {
  const raio = 7;
  const largura = comNome ? raio * 2 + 13 + larguraNome : raio * 2 + 4;
  const esquerda = -largura / 2;
  const y = topo - 18 - 9 * escala;
  ctx.save();
  ctx.translate(cx, y);
  ctx.scale(escala, escala);
  ctx.fillStyle = 'rgba(10, 14, 20, 0.8)';
  retangulo(ctx, esquerda, -9, largura, 18, 9);
  ctx.fill();
  if (jogador.eu) {
    ctx.strokeStyle = '#ffe066';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  const marcaX = esquerda + 2 + raio;
  ctx.fillStyle = CORES[indiceCor(jogador.cor)].base;
  circulo(ctx, marcaX, 0, raio);
  ctx.fill();
  desenharSimbolo(ctx, jogador.cor, marcaX, 0.3, 10, '#10151c');
  if (comNome) {
    ctx.font = FONTE_NOME;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = jogador.eu ? '#ffe066' : '#ffffff';
    ctx.fillText(jogador.nome, marcaX + raio + 5, 0.5);
  }
  if (voce) {
    // "This one is you" during the countdown, so nobody hunts for their own character. Above the tag,
    // or under the feet when the character is on the top row and there is no room above.
    const salto = reduzido ? 0 : Math.abs(Math.sin(agora * 5)) * 4;
    const embaixo = y - 32 * escala < 0;
    const sentido = embaixo ? -1 : 1;
    const base = embaixo ? (chao - y) / escala + 6 + salto : -10 - salto;
    ctx.fillStyle = '#ffe066';
    ctx.beginPath();
    ctx.moveTo(-6, base - 5 * sentido);
    ctx.lineTo(6, base - 5 * sentido);
    ctx.lineTo(0, base);
    ctx.closePath();
    ctx.fill();
    ctx.font = `800 11px ${FONTE_TEXTO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = embaixo ? 'top' : 'alphabetic';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(10, 14, 20, 0.85)';
    ctx.strokeText('VOCÊ', 0, base - 9 * sentido);
    ctx.fillText('VOCÊ', 0, base - 9 * sentido);
  }
  ctx.restore();
}

function efeitoExplosao(ctx, cx, cy, idade, semente, reduzido) {
  if (!reduzido && idade < 0.16) {
    // A quick additive flash: an orange halo with a hot core.
    const k = idade / 0.16;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (1 - k) * 0.55;
    ctx.fillStyle = '#ff6a1a';
    circulo(ctx, cx, cy, TAM * (0.55 + k * 0.85));
    ctx.fill();
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = '#fff3bf';
    circulo(ctx, cx, cy, TAM * (0.3 + k * 0.4));
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.fillStyle = PALETA.fumaca;
  for (let k = 0; k < 5; k++) {
    const t = idade - 0.12 - aleatorio(semente, k) * 0.15;
    const vida = 0.55 + aleatorio(semente, k + 10) * 0.25;
    if (t < 0 || t > vida) continue;
    const p = t / vida;
    const angulo = aleatorio(semente, k + 20) * Math.PI * 2;
    const distancia = TAM * 0.35 * aleatorio(semente, k + 30) * (reduzido ? 1 : 1 + p);
    ctx.globalAlpha = 0.34 * (1 - p);
    circulo(ctx, cx + Math.cos(angulo) * distancia, cy + Math.sin(angulo) * distancia - (reduzido ? 0 : p * TAM * 0.6), TAM * (0.16 + p * 0.22));
    ctx.fill();
  }
  if (reduzido) return;
  ctx.globalAlpha = 1;
  for (let k = 0; k < 12; k++) {
    const vida = 0.3 + aleatorio(semente, k + 40) * 0.3;
    if (idade > vida) continue;
    const p = idade / vida;
    const angulo = aleatorio(semente, k + 50) * Math.PI * 2;
    const distancia = TAM * (1.2 + aleatorio(semente, k + 60) * 1.4) * suavizarSaida(p);
    const tamanho = 3.4 * (1 - p) + 0.8;
    ctx.fillStyle = PALETA.faiscas[k % 3];
    ctx.fillRect(cx + Math.cos(angulo) * distancia - tamanho / 2, cy + Math.sin(angulo) * distancia + p * p * TAM * 0.4 - tamanho / 2, tamanho, tamanho);
  }
}

function efeitoCaixa(ctx, cx, cy, idade, semente, reduzido) {
  const poeira = idade / 0.45;
  if (poeira < 1) {
    ctx.globalAlpha = 0.32 * (1 - poeira);
    ctx.fillStyle = PALETA.poeira;
    circulo(ctx, cx, cy, TAM * (0.3 + poeira * 0.35));
    ctx.fill();
  }
  if (reduzido) return;
  const cores = [PALETA.caixaClara, PALETA.caixa, PALETA.caixaEscura];
  for (let k = 0; k < 7; k++) {
    const vida = 0.45 + aleatorio(semente, k) * 0.28;
    if (idade > vida) continue;
    const p = idade / vida;
    const angulo = -Math.PI / 2 + (aleatorio(semente, k + 10) - 0.5) * Math.PI * 1.6;
    const velocidade = TAM * (1.6 + aleatorio(semente, k + 20) * 1.8);
    const x = cx + Math.cos(angulo) * velocidade * idade;
    const y = cy + Math.sin(angulo) * velocidade * idade + TAM * 4.5 * idade * idade;
    ctx.globalAlpha = p > 0.7 ? (1 - p) / 0.3 : 1;
    ctx.fillStyle = cores[k % 3];
    lasca(ctx, x, y, 5 + aleatorio(semente, k + 40) * 5, 3.2, angulo + (aleatorio(semente, k + 30) - 0.5) * 14 * idade);
  }
}

function efeitoBloco(ctx, cx, cy, idade, semente, reduzido) {
  const p = idade / DURACAO_EFEITO.bloco;
  ctx.globalAlpha = 0.4 * (1 - p);
  ctx.fillStyle = PALETA.poeira;
  for (let k = 0; k < (reduzido ? 1 : 4); k++) {
    const angulo = (k / 4) * Math.PI * 2 + aleatorio(semente, k);
    const distancia = reduzido ? 0 : TAM * 0.45 * suavizarSaida(p);
    circulo(ctx, cx + Math.cos(angulo) * distancia, cy + Math.sin(angulo) * distancia + TAM * 0.2, TAM * (0.18 + p * 0.15));
    ctx.fill();
  }
}

function efeitoMorte(ctx, efeito, cx, cy, idade, semente, agora, reduzido) {
  const cor = CORES[indiceCor(efeito.cor)];
  const chao = cy + TAM * 0.36;
  const ESTOURO = 0.28;
  if (idade < ESTOURO) {
    // Squash, flash and then pop.
    const k = idade / ESTOURO;
    const branco = !reduzido && Math.floor(idade / 0.05) % 2 === 0;
    desenharBoneco(ctx, cx, chao, { cor: efeito.cor, o: DIRECAO.BAIXO }, 'morto', agora, reduzido, { esmagar: [1 + k * 0.35, 1 - k * 0.4], branco });
    return;
  }
  const t = idade - ESTOURO;
  const p = t / (DURACAO_EFEITO.morte - ESTOURO);
  if (t < 0.4) {
    ctx.globalAlpha = 1 - t / 0.4;
    ctx.strokeStyle = cor.base;
    ctx.lineWidth = 4;
    circulo(ctx, cx, cy, TAM * (0.3 + (t / 0.4) * 0.6));
    ctx.stroke();
  }
  if (!reduzido && t < 0.5) {
    for (let k = 0; k < 12; k++) {
      const q = t / 0.5;
      const angulo = (k / 12) * Math.PI * 2 + aleatorio(semente, k) * 0.5;
      const distancia = TAM * (0.6 + aleatorio(semente, k + 10) * 0.5) * suavizarSaida(q);
      const tamanho = 5 * (1 - q) + 1;
      ctx.globalAlpha = 1 - q * 0.6;
      ctx.fillStyle = k % 3 === 0 ? '#ffffff' : cor.base;
      ctx.fillRect(cx + Math.cos(angulo) * distancia - tamanho / 2, cy + Math.sin(angulo) * distancia - tamanho / 2, tamanho, tamanho);
    }
  }
  // A little ghost floats away.
  const gx = cx + (reduzido ? 0 : Math.sin(t * 6) * 4);
  const gy = cy - (reduzido ? 0 : p * TAM * 1.1);
  ctx.globalAlpha = 0.8 * (1 - p);
  ctx.fillStyle = '#f1f5f9';
  ctx.beginPath();
  ctx.arc(gx, gy - 2, 10, Math.PI, 0);
  ctx.lineTo(gx + 10, gy + 9);
  ctx.quadraticCurveTo(gx + 6.7, gy + 5, gx + 3.3, gy + 9);
  ctx.quadraticCurveTo(gx, gy + 5, gx - 3.3, gy + 9);
  ctx.quadraticCurveTo(gx - 6.7, gy + 5, gx - 10, gy + 9);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = PALETA.tinta;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  for (const lado of [-1, 1]) {
    const ox = gx + lado * 4;
    ctx.moveTo(ox - 2, gy - 4);
    ctx.lineTo(ox + 2, gy);
    ctx.moveTo(ox + 2, gy - 4);
    ctx.lineTo(ox - 2, gy);
  }
  ctx.stroke();
}

function efeitoItem(ctx, efeito, cx, cy, idade, reduzido) {
  const p = idade / DURACAO_EFEITO.item;
  const visual = VISUAL_ITEM[efeito.item];
  ctx.globalAlpha = 1 - p;
  ctx.strokeStyle = visual?.fundo ?? '#ffe066';
  ctx.lineWidth = 5 * (1 - p) + 1;
  circulo(ctx, cx, cy, TAM * (0.3 + suavizarSaida(p) * 0.6));
  ctx.stroke();
  if (!reduzido) {
    ctx.fillStyle = '#fff3bf';
    for (let k = 0; k < 6; k++) {
      const angulo = (k / 6) * Math.PI * 2 + idade * 3;
      const distancia = TAM * (0.35 + p * 0.35);
      brilho(ctx, cx + Math.cos(angulo) * distancia, cy + Math.sin(angulo) * distancia - p * TAM * 0.5, 5 * (1 - p) + 1);
    }
  }
  textoSubindo(ctx, visual?.rotulo ?? '', cx, cy, p, 14, '#ffe066');
}

function textoSubindo(ctx, texto, cx, cy, p, tamanho, cor) {
  ctx.globalAlpha = Math.max(0, 1 - p);
  ctx.font = `800 ${tamanho}px ${FONTE_TEXTO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
  const ty = cy - TAM * 0.3 - p * TAM * 0.8;
  ctx.strokeText(texto, cx, ty);
  ctx.fillStyle = cor;
  ctx.fillText(texto, cx, ty);
}

function efeitoEscudo(ctx, cx, cy, idade, reduzido) {
  const p = idade / DURACAO_EFEITO.escudo;
  ctx.globalAlpha = 1 - p;
  ctx.strokeStyle = PALETA.escudo;
  ctx.lineWidth = 5;
  circulo(ctx, cx, cy, TAM * (0.4 + p * 0.8));
  ctx.stroke();
  if (reduzido) return;
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let k = 0; k < 8; k++) {
    const angulo = (k / 8) * Math.PI * 2;
    const de = TAM * (0.5 + p * 0.9);
    ctx.moveTo(cx + Math.cos(angulo) * de, cy + Math.sin(angulo) * de);
    ctx.lineTo(cx + Math.cos(angulo) * (de + 8), cy + Math.sin(angulo) * (de + 8));
  }
  ctx.stroke();
}

// "JÁ!" in the middle of the arena when the match starts.
function efeitoLargada(ctx, idade, reduzido) {
  const k = limitar(idade / 0.2, 0, 1);
  const escala = reduzido ? 1 : 1.7 - 0.7 * voltaPorCima(k);
  ctx.globalAlpha = idade > 0.55 ? Math.max(0, 1 - (idade - 0.55) / 0.35) : 1;
  ctx.translate(LARGURA / 2, ALTURA / 2);
  ctx.scale(escala, escala);
  ctx.font = `900 ${TAM * 2.4}px ${FONTE_TEXTO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 14;
  ctx.strokeStyle = 'rgba(10, 14, 20, 0.75)';
  ctx.strokeText('JÁ!', 0, 0);
  ctx.fillStyle = '#ffd43b';
  ctx.fillText('JÁ!', 0, 0);
}

function desenharEfeito(ctx, efeito, agora, reduzido) {
  const idade = agora - efeito.inicio;
  if (idade < 0 || idade >= (DURACAO_EFEITO[efeito.tipo] ?? 0)) return;
  const cx = (efeito.x + 0.5) * TAM;
  const cy = (efeito.y + 0.5) * TAM;
  const semente = sementeDe(efeito);
  ctx.save();
  switch (efeito.tipo) {
    case 'explosao':
      efeitoExplosao(ctx, cx, cy, idade, semente, reduzido);
      break;
    case 'caixa':
      efeitoCaixa(ctx, cx, cy, idade, semente, reduzido);
      break;
    case 'bloco':
      efeitoBloco(ctx, cx, cy, idade, semente, reduzido);
      break;
    case 'morte':
      efeitoMorte(ctx, efeito, cx, cy, idade, semente, agora, reduzido);
      break;
    case 'item':
      efeitoItem(ctx, efeito, cx, cy, idade, reduzido);
      break;
    case 'ponto':
      textoSubindo(ctx, efeito.texto, cx, cy, idade / DURACAO_EFEITO.ponto, 15, '#ffd43b');
      break;
    case 'escudo':
      efeitoEscudo(ctx, cx, cy, idade, reduzido);
      break;
    case 'largada':
      efeitoLargada(ctx, idade, reduzido);
      break;
    default:
      break;
  }
  ctx.restore();
}

function confete(ctx, agora) {
  for (let k = 0; k < 12; k++) {
    const velocidade = 26 + aleatorio(7, k) * 30;
    const x = aleatorio(11, k) * RETRATO + Math.sin(agora * 2 + k) * 4;
    const y = ((agora * velocidade + aleatorio(13, k) * 90) % 90) - 12;
    ctx.fillStyle = CORES[k % CORES.length].base;
    lasca(ctx, x, y, 6, 3, agora * (2 + aleatorio(17, k) * 4) + k);
  }
}

export function efeitoAtivo(efeito, agora) {
  return agora - efeito.inicio < (DURACAO_EFEITO[efeito.tipo] ?? 0);
}

export function criarPintor(canvas) {
  const ctx = canvas.getContext('2d');
  const arena = document.createElement('canvas');
  const ctxArena = arena.getContext('2d');
  const sprites = new Map();
  const larguras = new Map();
  const retratos = new Map(); // canvas -> { ctx, cor, pose }
  const movimentoReduzido = matchMedia('(prefers-reduced-motion: reduce)');
  let gradientesSubita = null;
  let escala = 0;
  let arenaDesenhada = null;

  // Backing store sized to what is actually on screen (capped at 2x), not to the device maximum.
  const ajustarResolucao = () => {
    const pixels = (canvas.clientWidth || LARGURA) * (window.devicePixelRatio || 1);
    const nova = Math.min(2, Math.max(0.5, Math.ceil((pixels / LARGURA) * 4) / 4));
    if (nova === escala) return;
    escala = nova;
    canvas.width = arena.width = Math.round(LARGURA * escala);
    canvas.height = arena.height = Math.round(ALTURA * escala);
    arenaDesenhada = null;
    sprites.clear();
  };

  const sprite = item => {
    if (!sprites.has(item)) {
      const quadro = document.createElement('canvas');
      quadro.width = quadro.height = Math.round(TAM * escala);
      const ctxQuadro = quadro.getContext('2d');
      ctxQuadro.setTransform(escala, 0, 0, escala, 0, 0);
      desenharSpriteItem(ctxQuadro, item);
      sprites.set(item, quadro);
    }
    return sprites.get(item);
  };

  const larguraNome = nome => {
    if (!larguras.has(nome)) {
      ctx.font = FONTE_NOME;
      larguras.set(nome, ctx.measureText(nome).width);
    }
    return larguras.get(nome);
  };

  // Red glow on the edges while the arena closes in. Gradients are made once and reused.
  const desenharAlertaSubita = (agora, reduzido) => {
    const m = TAM * 1.4;
    if (!gradientesSubita) {
      const faixa = (x0, y0, x1, y1) => {
        const gradiente = ctx.createLinearGradient(x0, y0, x1, y1);
        gradiente.addColorStop(0, 'rgba(240, 62, 62, 0.55)');
        gradiente.addColorStop(1, 'rgba(240, 62, 62, 0)');
        return gradiente;
      };
      gradientesSubita = [
        [faixa(0, 0, 0, m), 0, 0, LARGURA, m],
        [faixa(0, ALTURA, 0, ALTURA - m), 0, ALTURA - m, LARGURA, m],
        [faixa(0, 0, m, 0), 0, 0, m, ALTURA],
        [faixa(LARGURA, 0, LARGURA - m, 0), LARGURA - m, 0, m, ALTURA],
      ];
    }
    ctx.globalAlpha = reduzido ? 0.6 : 0.55 + Math.sin(agora * 5) * 0.3;
    for (const [gradiente, x, y, largura, altura] of gradientesSubita) {
      ctx.fillStyle = gradiente;
      ctx.fillRect(x, y, largura, altura);
    }
    ctx.globalAlpha = 1;
  };

  const desenharRetratos = (agora, reduzido) => {
    for (const [quadro, retrato] of retratos) {
      if (!quadro.isConnected) {
        retratos.delete(quadro);
        continue;
      }
      const lado = quadro.clientWidth;
      if (!lado) continue;
      const pixels = Math.round(lado * Math.min(2, window.devicePixelRatio || 1));
      if (quadro.width !== pixels) quadro.width = quadro.height = pixels;
      const k = pixels / RETRATO;
      retrato.ctx.setTransform(1, 0, 0, 1, 0, 0);
      retrato.ctx.clearRect(0, 0, pixels, pixels);
      retrato.ctx.setTransform(k, 0, 0, k, 0, 0);
      if (retrato.pose === 'festa' && !reduzido) confete(retrato.ctx, agora);
      desenharBoneco(retrato.ctx, RETRATO / 2, RETRATO - 8, { cor: retrato.cor, o: DIRECAO.BAIXO }, retrato.pose, agora, reduzido);
    }
  };

  // cena: { g, muros: Set, chaveMuros, j: [{ x, y, v, o, a, e, i, g, p, cor, nome, eu, festa, pronto }],
  //         b, c, iv, gl, agora, efeitos, tremor, contagem, subita }
  const desenhar = cena => {
    ajustarResolucao();
    const reduzido = movimentoReduzido.matches;
    const agora = cena.agora;
    const chave = `${cena.g}|${cena.chaveMuros}`;
    if (arenaDesenhada !== chave) {
      ctxArena.setTransform(escala, 0, 0, escala, 0, 0);
      desenharArenaFixa(ctxArena, cena.g, cena.muros);
      arenaDesenhada = chave;
    }
    let tx = 0;
    let ty = 0;
    if (!reduzido && cena.tremor > 0.2) {
      tx = (Math.random() - 0.5) * cena.tremor;
      ty = (Math.random() - 0.5) * cena.tremor;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETA.borda[2];
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(escala, 0, 0, escala, tx * escala, ty * escala);
    ctx.drawImage(arena, 0, 0, LARGURA, ALTURA);
    for (let i = 0; i < cena.g.length; i++) {
      if (VISUAL_ITEM[cena.g[i]]) desenharItem(ctx, sprite(cena.g[i]), i, cena.g[i], agora, reduzido);
    }
    for (const chama of cena.c) desenharChama(ctx, chama, agora);
    for (const efeito of cena.efeitos) if (EFEITOS_DO_CHAO.has(efeito.tipo)) desenharEfeito(ctx, efeito, agora, reduzido);
    for (const bomba of cena.b) desenharBomba(ctx, bomba, agora, reduzido);
    for (const tiro of cena.gl ?? []) desenharTiroGelo(ctx, tiro, agora);
    // Items flying to a magnet are drawn a bit smaller, above walls and crates.
    for (const [x, y, item] of cena.iv ?? []) {
      if (!VISUAL_ITEM[item]) continue;
      ctx.drawImage(sprite(item), (x + 0.15) * TAM, (y + 0.15) * TAM, TAM * 0.7, TAM * 0.7);
    }
    const vivos = cena.j.filter(j => j.v).sort((a, b) => a.y - b.y);
    const topos = vivos.map(jogador => desenharJogador(ctx, jogador, agora, reduzido));
    // Tags go after every body, so a character walking below never covers someone's name.
    const escalaTela = (canvas.clientWidth || LARGURA) / LARGURA;
    const escalaRotulo = limitar(0.6 / escalaTela, 1, 2);
    const comNome = escalaTela >= 0.45;
    vivos.forEach((jogador, n) => {
      const cx = (jogador.x + 0.5) * TAM;
      const chao = (jogador.y + 0.5) * TAM + TAM * 0.36;
      desenharRotulo(ctx, cx, topos[n], chao, jogador, larguraNome(jogador.nome), escalaRotulo, comNome, cena.contagem && jogador.eu, agora, reduzido);
    });
    for (const efeito of cena.efeitos) if (!EFEITOS_DO_CHAO.has(efeito.tipo)) desenharEfeito(ctx, efeito, agora, reduzido);
    if (cena.subita) desenharAlertaSubita(agora, reduzido);
    desenharRetratos(agora, reduzido);
  };

  // Small animated character drawn on an HTML screen (lobby, results, podium); it stops being drawn
  // once the canvas leaves the page.
  const retrato = (quadro, { cor, pose = 'jogo' }) => {
    retratos.set(quadro, { ctx: quadro.getContext('2d'), cor, pose });
    return quadro;
  };

  return { desenhar, retrato };
}
