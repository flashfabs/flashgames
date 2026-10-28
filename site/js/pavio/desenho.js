// Canvas painter for Pavio: draws one frame from a scene (grid, players, bombs, flames, effects).
// The static part of the arena (themed floor, walls, crates) comes cached from cenario.js. Particles are
// stateless: each effect derives its pieces from a seed and its age, so nothing is simulated between
// frames. The resolution adapts to the device: up to 3x while frames keep their pace, lower when not.

import { COLUNAS, ITEM, DIRECAO, AJUSTES } from './regras.js';
import { TAM, LARGURA, ALTURA, retangulo, circulo, elipse, aleatorio, criarCenario, chaveDoTema } from './cenario.js';

export { TAM, LARGURA, ALTURA, chaveDoTema };

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
const DURACAO_EFEITO = { explosao: 2.4, caixa: 1.3, bloco: 0.75, morte: 1.5, item: 0.9, escudo: 0.6, ponto: 0.8, largada: 0.9 };
// Ground effects are drawn under bombs and players; the rest on top of everything.
const EFEITOS_DO_CHAO = new Set(['explosao', 'caixa', 'bloco']);
const OLHAR = { [DIRECAO.ESQUERDA]: [-3.5, 0], [DIRECAO.DIREITA]: [3.5, 0], [DIRECAO.BAIXO]: [0, 2] };
const RETRATO = 72; // logical size of the small character portraits on the HTML screens
const ESCALA_MAX = 3;
const QUADRO_ATRASADO_MS = 19.5; // a frame interval above this missed its 60 Hz slot
const JANELA_QUADROS = 90; // the decision looks at the last 1.5 s of frames, so a single hiccup never counts
const PIXELS_LUZ = 8; // light map resolution, per tile
const ABERTURA_S = 1.1; // the map sweeps in and the players drop onto their spots when the countdown starts
const FINAL_S = 1.3; // slow motion and zoom on the winner after the last elimination
const QUEDA_BLOCO_S = 0.22; // a sudden death block falls this long before it lands
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
  // A thin light rim keeps the bomb visible on dark floors.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
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
    if (!reduzido) {
      // Tiny sparks jumping off the burning fuse.
      ctx.fillStyle = '#ffd43b';
      for (let k = 0; k < 3; k++) {
        const t = (agora * 2.6 + k / 3 + x * 0.37 + y * 0.61) % 1;
        const angulo = -Math.PI / 2 + Math.sin(k * 2.1 + x + y) * 1.1;
        ctx.globalAlpha = 1 - t;
        ctx.fillRect(pontaX + Math.cos(angulo) * t * 12 - 1, pontaY + Math.sin(angulo) * t * 12 + t * t * 10 - 1, 2, 2);
      }
      ctx.globalAlpha = 1;
    }
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
  if (forma === 'x') {
    // The crate is already gone from the grid: a charred husk burns where it stood.
    ctx.fillStyle = PALETA.caixaQueimada;
    retangulo(ctx, px + 4, py + 4, TAM - 8, TAM - 8, 6);
    ctx.fill();
  }
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

// One character with its feet at (cx, chao). Poses: 'jogo' (walks, blinks, looks around), 'festa' (jumps
// with the arms up, with a flip now and then), 'pronto' (happy little hop) and 'morto' (x_x). extra.anim is
// the painter's memory of this player (step phase, speed, and when it turned, picked an item or dropped a
// bomb), which drives the reactions. Returns the y of the top of the body.
function desenharBoneco(ctx, cx, chao, b, pose, agora, reduzido, extra = {}) {
  const anim = extra.anim;
  const n = indiceCor(b.cor);
  const cor = CORES[n];
  const semente = n * 1.37;
  const movendo = pose === 'jogo' && !reduzido;
  // The step cycle follows the distance walked when the painter tracks it, so faster shoes take faster steps.
  const amplitude = movendo ? (anim ? anim.amplitude : b.a ? 1 : 0) : 0;
  const passo = amplitude * Math.sin(anim ? anim.fase : agora * 14 + semente);
  const andando = amplitude > 0.05;
  const feliz = pose === 'festa' || pose === 'pronto';
  const festa = pose === 'festa';
  let salto = 0;
  let giro = 0;
  if (!reduzido && festa) {
    const ciclo = (agora * 6 + semente) / Math.PI;
    salto = Math.abs(Math.sin(agora * 6 + semente)) * 11;
    if (Math.floor(ciclo) % 3 === 2) giro = (ciclo % 1) * Math.PI * 2;
  } else if (!reduzido && pose === 'pronto') {
    salto = Math.max(0, Math.sin(agora * 4 + semente)) ** 6 * 7;
  }
  const respiro = reduzido || andando ? 0 : Math.sin(agora * 3 + semente) * 0.03;
  let [sx, sy] = extra.esmagar ?? [1 - respiro, 1 + respiro];
  const idadePegou = anim && !reduzido ? agora - anim.pegouEm : 9;
  const idadeBomba = anim && !reduzido ? agora - anim.bombaEm : 9;
  const idadeGiro = anim && !reduzido ? agora - anim.giroEm : 9;
  const surpreso = idadePegou < 0.45;
  if (surpreso) {
    // Picking an item: stretch up, hop, settle.
    const k = idadePegou / 0.45;
    const onda = Math.sin(k * Math.PI) * (1 - k * 0.5);
    sy += 0.22 * onda;
    sx -= 0.14 * onda;
    salto += 7 * Math.sin(k * Math.PI);
  }
  if (idadeBomba < 0.25) {
    // Dropping a bomb: a quick squat.
    const onda = Math.sin((idadeBomba / 0.25) * Math.PI);
    sy -= 0.14 * onda;
    sx += 0.12 * onda;
  }
  if (idadeGiro < 0.16) sx -= 0.12 * Math.sin((idadeGiro / 0.16) * Math.PI);
  if (andando) {
    const pisada = amplitude * (1 - Math.abs(Math.sin(anim ? anim.fase : agora * 14 + semente)));
    sx += pisada * 0.05;
    sy -= pisada * 0.05;
  }
  const largura = TAM * 0.62 * sx;
  const altura = TAM * 0.64 * sy;
  const topo = -6 - Math.abs(passo) * 3 - altura;
  let inclinacao = 0;
  if (andando && b.o === DIRECAO.ESQUERDA) inclinacao = -0.08 * amplitude;
  else if (andando && b.o === DIRECAO.DIREITA) inclinacao = 0.08 * amplitude;
  let pele = cor.base;
  let contorno = b.p ? '#ff8787' : cor.escura;
  if (extra.branco) pele = '#ffffff';
  if (extra.carvao) {
    pele = '#3b3735';
    contorno = '#1d1b1a';
  }

  const sombra = 1 - salto / 40;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  elipse(ctx, cx, chao, TAM * 0.28 * sombra * sx, TAM * 0.09 * sombra);
  ctx.fill();

  ctx.save();
  ctx.translate(cx, chao - salto);
  if (inclinacao) ctx.rotate(inclinacao);
  if (giro) {
    ctx.translate(0, topo + altura / 2);
    ctx.rotate(giro);
    ctx.translate(0, -(topo + altura / 2));
  }

  ctx.fillStyle = extra.carvao ? contorno : cor.escura;
  elipse(ctx, -8 + passo * 3, -3 - Math.max(0, passo) * 2.5, 6, 4);
  ctx.fill();
  elipse(ctx, 8 - passo * 3, -3 - Math.max(0, -passo) * 2.5, 6, 4);
  ctx.fill();

  ctx.fillStyle = pele;
  retangulo(ctx, -largura / 2, topo, largura, altura, largura * 0.46);
  ctx.fill();
  ctx.strokeStyle = contorno;
  ctx.lineWidth = b.p ? 3.5 : 2.5;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  elipse(ctx, -largura * 0.2, topo + altura * 0.25, largura * 0.14, altura * 0.1);
  ctx.fill();

  // Little round hands: they swing while walking, go up when celebrating and when picking an item.
  const bracosAcima = festa || surpreso;
  const maoX = largura / 2 + (bracosAcima ? 4 : 0.5);
  const maoY = bracosAcima ? topo + 3 + (reduzido ? 0 : Math.sin(agora * 14) * 2.5) : topo + altura * 0.64;
  ctx.fillStyle = pele;
  ctx.strokeStyle = contorno;
  ctx.lineWidth = 2;
  for (const lado of [-1, 1]) {
    circulo(ctx, lado * maoX, maoY + passo * lado * 2, 4.2);
    ctx.fill();
    ctx.stroke();
  }

  // Every character carries a little lit fuse on its head; it lags behind when running.
  const balanco = anim && !reduzido ? limitar(-anim.vx * 1.4, -6, 6) : 0;
  ctx.strokeStyle = '#3b2f2f';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(3, topo + 1);
  ctx.quadraticCurveTo(11 + balanco * 0.4, topo - 6, 7 + balanco, topo - 12);
  ctx.stroke();
  if (pose !== 'morto') faisca(ctx, 7 + balanco, topo - 12, agora, festa || surpreso ? 4.5 : 3);

  const olhoY = topo + altura * 0.47;
  ctx.strokeStyle = PALETA.tinta;
  if (pose === 'morto') {
    ctx.strokeStyle = extra.carvao ? '#d9d4cf' : PALETA.tinta;
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
  } else if (surpreso) {
    // Wide eyes and a little "o" mouth.
    for (const lado of [-1, 1]) {
      ctx.fillStyle = '#ffffff';
      elipse(ctx, lado * 7.5, olhoY - 1, 6.3, 7.4);
      ctx.fill();
      ctx.fillStyle = PALETA.tinta;
      circulo(ctx, lado * 7.5, olhoY - 2.5, 2.3);
      ctx.fill();
    }
    ctx.fillStyle = PALETA.tinta;
    elipse(ctx, 0, olhoY + 8, 2.4, 3);
    ctx.fill();
  } else if (b.o === DIRECAO.CIMA) {
    // Seen from behind: the player's shape on the back.
    desenharSimbolo(ctx, b.cor, 0, topo + altura * 0.55, 13, cor.escura);
  } else {
    let olhar = OLHAR[b.o] ?? OLHAR[DIRECAO.BAIXO];
    // Standing still and facing the camera, the character glances around now and then.
    if (!andando && pose === 'jogo' && !reduzido && (b.o === DIRECAO.BAIXO || b.o === undefined)) {
      const espiada = (agora + semente * 3) % 6;
      if (espiada > 4.2 && espiada < 4.8) olhar = OLHAR[DIRECAO.ESQUERDA];
      else if (espiada >= 4.8 && espiada < 5.4) olhar = OLHAR[DIRECAO.DIREITA];
    }
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
  if (surpreso) {
    // Sparkles circling the head.
    ctx.fillStyle = '#fff3bf';
    const k = idadePegou / 0.45;
    for (let s = 0; s < 4; s++) {
      const angulo = agora * 7 + (s * Math.PI) / 2;
      brilho(ctx, cx + Math.cos(angulo) * 20, chao - salto + topo - 4 + Math.sin(angulo) * 7, 4.5 * (1 - k) + 1);
    }
  }
  return chao - salto + topo;
}

function desenharJogador(ctx, jogador, agora, reduzido, anim) {
  const cx = (jogador.x + 0.5) * TAM;
  const chao = (jogador.y + 0.5) * TAM + TAM * 0.36;
  ctx.save();
  if (jogador.g) ctx.globalAlpha = 0.55 + (reduzido ? 0 : Math.sin(agora * 8) * 0.15);
  if (jogador.i && (reduzido || Math.floor(agora * 12) % 2)) ctx.globalAlpha = reduzido ? 0.6 : 0.4;
  const pose = jogador.festa ? 'festa' : jogador.pronto ? 'pronto' : 'jogo';
  const topo = desenharBoneco(ctx, cx, chao, jogador, pose, agora, reduzido, { anim });
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

// A soft dark stain left on the floor by an explosion (one small sprite, scaled).
let manchaDeQueimado = null;
function mancha() {
  if (manchaDeQueimado) return manchaDeQueimado;
  manchaDeQueimado = document.createElement('canvas');
  manchaDeQueimado.width = manchaDeQueimado.height = 64;
  const ctx = manchaDeQueimado.getContext('2d');
  const gradiente = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  gradiente.addColorStop(0, 'rgba(12, 9, 7, 0.85)');
  gradiente.addColorStop(0.55, 'rgba(18, 13, 10, 0.45)');
  gradiente.addColorStop(1, 'rgba(18, 13, 10, 0)');
  ctx.fillStyle = gradiente;
  ctx.fillRect(0, 0, 64, 64);
  return manchaDeQueimado;
}

function desenharMancha(ctx, efeito, agora) {
  const idade = agora - efeito.inicio;
  if (idade < 0 || idade >= DURACAO_EFEITO.explosao) return;
  const cx = (efeito.x + 0.5) * TAM;
  const cy = (efeito.y + 0.5) * TAM;
  ctx.globalAlpha = 0.55 * Math.min(1, idade / 0.1) * (1 - idade / DURACAO_EFEITO.explosao);
  ctx.drawImage(mancha(), cx - TAM * 0.62, cy - TAM * 0.55, TAM * 1.24, TAM * 1.1);
  ctx.globalAlpha = 1;
}

const FUMACA = ['#2f3338', '#454b52', '#5f666e'];

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
  if (!reduzido && idade < 0.3) {
    // Shock wave: a thin bright ring racing outwards.
    const k = idade / 0.3;
    ctx.globalAlpha = (1 - k) * 0.75;
    ctx.strokeStyle = '#fff4d6';
    ctx.lineWidth = 6 * (1 - k) + 0.8;
    circulo(ctx, cx, cy, TAM * (0.45 + suavizarSaida(k) * 1.7));
    ctx.stroke();
  }
  // Smoke in layers: darker and lower first, lighter and higher as it rises and spreads.
  for (let k = 0; k < 7; k++) {
    const t = idade - 0.08 - aleatorio(semente, k) * 0.2;
    const vida = 0.8 + aleatorio(semente, k + 10) * 0.5;
    if (t < 0 || t > vida) continue;
    const p = t / vida;
    const angulo = aleatorio(semente, k + 20) * Math.PI * 2;
    const distancia = TAM * 0.4 * aleatorio(semente, k + 30) * (reduzido ? 1 : 1 + p * 1.2);
    const deriva = reduzido ? 0 : Math.sin(t * 2 + k) * 6;
    ctx.globalAlpha = 0.42 * (1 - p) * Math.min(1, t / 0.08);
    ctx.fillStyle = FUMACA[k % 3];
    circulo(ctx, cx + Math.cos(angulo) * distancia + deriva, cy + Math.sin(angulo) * distancia - (reduzido ? 0 : p * TAM * 0.9), TAM * (0.15 + p * 0.28));
    ctx.fill();
  }
  if (reduzido) {
    ctx.globalAlpha = 1;
    return;
  }
  // Sparks: half of them leave a short streak behind.
  ctx.globalAlpha = 1;
  ctx.lineCap = 'round';
  for (let k = 0; k < 14; k++) {
    const vida = 0.3 + aleatorio(semente, k + 40) * 0.35;
    if (idade > vida) continue;
    const p = idade / vida;
    const angulo = aleatorio(semente, k + 50) * Math.PI * 2;
    const alcance = TAM * (1.2 + aleatorio(semente, k + 60) * 1.5);
    const ponto = q => [cx + Math.cos(angulo) * alcance * suavizarSaida(q), cy + Math.sin(angulo) * alcance * suavizarSaida(q) + q * q * TAM * 0.5];
    const [x, y] = ponto(p);
    const tamanho = 3.4 * (1 - p) + 0.8;
    const cor = PALETA.faiscas[k % 3];
    if (k % 2) {
      const [ax, ay] = ponto(Math.max(0, p - 0.12));
      ctx.strokeStyle = cor;
      ctx.lineWidth = tamanho * 0.8;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(x, y);
      ctx.stroke();
    } else {
      ctx.fillStyle = cor;
      ctx.fillRect(x - tamanho / 2, y - tamanho / 2, tamanho, tamanho);
    }
  }
  // Embers drifting up after the blast.
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = '#ffb057';
  for (let k = 0; k < 5; k++) {
    const t = idade - 0.25 - aleatorio(semente, k + 70) * 0.2;
    const vida = 0.8 + aleatorio(semente, k + 75) * 0.6;
    if (t < 0 || t > vida) continue;
    const p = t / vida;
    ctx.globalAlpha = (1 - p) * (0.6 + 0.4 * Math.sin(t * 17 + k * 2.1));
    circulo(ctx, cx + (aleatorio(semente, k + 80) - 0.5) * TAM * 1.2 + Math.sin(t * 3 + k) * 5, cy - p * TAM * 1.3, 1.6);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}


// Wood shards with simple physics: thrown up, fall, bounce once, slide a little and fade on the floor.
function efeitoCaixa(ctx, cx, cy, idade, semente, reduzido, tema) {
  const poeira = idade / 0.5;
  if (poeira < 1) {
    ctx.globalAlpha = 0.32 * (1 - poeira);
    ctx.fillStyle = PALETA.poeira;
    circulo(ctx, cx, cy, TAM * (0.3 + poeira * 0.4));
    ctx.fill();
  }
  if (reduzido) {
    ctx.globalAlpha = 1;
    return;
  }
  const gravidade = TAM * 16;
  for (let k = 0; k < 8; k++) {
    const vida = 0.9 + aleatorio(semente, k) * 0.4;
    if (idade > vida) continue;
    const angulo = -Math.PI / 2 + (aleatorio(semente, k + 10) - 0.5) * Math.PI * 1.5;
    const velocidade = TAM * (1.8 + aleatorio(semente, k + 20) * 2.2);
    const vx = Math.cos(angulo) * velocidade;
    const vy = Math.sin(angulo) * velocidade;
    const chao = cy + TAM * (0.12 + aleatorio(semente, k + 50) * 0.32);
    const queda = (-vy + Math.sqrt(vy * vy + 2 * gravidade * (chao - cy))) / gravidade;
    const giro = (aleatorio(semente, k + 30) - 0.5) * 24;
    let x;
    let y;
    let angulo2;
    if (idade < queda) {
      x = cx + vx * idade;
      y = cy + vy * idade + (gravidade * idade * idade) / 2;
      angulo2 = angulo + giro * idade;
    } else {
      const quique = -(vy + gravidade * queda) * 0.32;
      const tempoQuique = (-2 * quique) / gravidade;
      const t = Math.min(idade - queda, tempoQuique);
      x = cx + vx * queda + vx * 0.35 * t;
      y = Math.min(chao, chao + quique * t + (gravidade * t * t) / 2);
      angulo2 = angulo + giro * queda + giro * 0.3 * t;
    }
    ctx.globalAlpha = idade > vida - 0.3 ? (vida - idade) / 0.3 : 1;
    ctx.fillStyle = tema.caixa[k % 3];
    lasca(ctx, x, y, 5 + aleatorio(semente, k + 40) * 5, 3.2, angulo2);
  }
  ctx.globalAlpha = 1;
}

function efeitoBloco(ctx, cx, cy, idade, semente, reduzido) {
  // The dust rises when the block lands (the fall itself is drawn by the painter).
  const queda = reduzido ? 0 : QUEDA_BLOCO_S;
  if (idade < queda) return;
  const p = (idade - queda) / (DURACAO_EFEITO.bloco - queda);
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
  const ESTOURO = 0.34;
  if (idade < ESTOURO) {
    // In stages: hit (white flash and a jolt), charred, then the pop.
    const k = idade / ESTOURO;
    const atingido = idade < 0.1;
    const solavanco = reduzido ? 0 : (aleatorio(semente, Math.floor(idade * 60)) - 0.5) * 5 * (1 - k);
    desenharBoneco(ctx, cx + solavanco, chao, { cor: efeito.cor, o: DIRECAO.BAIXO }, 'morto', agora, reduzido, {
      esmagar: [1 + k * 0.32, 1 - k * 0.38],
      branco: atingido && !reduzido,
      carvao: !atingido,
    });
    if (!atingido && !reduzido) {
      ctx.fillStyle = FUMACA[1];
      for (let s = 0; s < 3; s++) {
        const t = (idade - 0.1 + s * 0.05) % 0.24;
        ctx.globalAlpha = 0.5 * (1 - t / 0.24);
        circulo(ctx, cx - 8 + s * 8, chao - TAM * 0.7 - t * 60, 4 + t * 20);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
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
    ctx.fillStyle = FUMACA[2];
    ctx.globalAlpha = 0.45 * (1 - t / 0.4);
    circulo(ctx, cx, cy - (reduzido ? 0 : t * 30), TAM * (0.3 + t));
    ctx.fill();
  }
  if (!reduzido && t < 0.55) {
    // Pieces of the body and soot fly out.
    for (let k = 0; k < 14; k++) {
      const q = t / 0.55;
      const angulo = (k / 14) * Math.PI * 2 + aleatorio(semente, k) * 0.5;
      const distancia = TAM * (0.6 + aleatorio(semente, k + 10) * 0.6) * suavizarSaida(q);
      const tamanho = 5 * (1 - q) + 1;
      ctx.globalAlpha = 1 - q * 0.6;
      ctx.fillStyle = k % 4 === 0 ? '#2a2725' : k % 3 === 0 ? '#ffffff' : cor.base;
      ctx.fillRect(cx + Math.cos(angulo) * distancia - tamanho / 2, cy + Math.sin(angulo) * distancia + q * q * 10 - tamanho / 2, tamanho, tamanho);
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

function desenharEfeito(ctx, efeito, agora, reduzido, tema) {
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
      efeitoCaixa(ctx, cx, cy, idade, semente, reduzido, tema);
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

// Cheap ambient life per map theme, computed from the clock (nothing is stored between frames).
function desenharAmbiente(ctx, tipo, agora) {
  if (tipo === 'brasas') {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#ffb057';
    for (let k = 0; k < 16; k++) {
      const velocidade = 18 + aleatorio(31, k) * 30;
      const x = aleatorio(37, k) * LARGURA + Math.sin(agora * 1.3 + k) * 14;
      const y = ALTURA + 20 - ((agora * velocidade + aleatorio(41, k) * (ALTURA + 40)) % (ALTURA + 40));
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(agora * 7 + k * 1.7);
      circulo(ctx, x, y, 1.4 + aleatorio(43, k) * 1.6);
      ctx.fill();
    }
  } else if (tipo === 'vagalumes') {
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 10; k++) {
      const x = (aleatorio(47, k) + 0.08 * Math.sin(agora * 0.4 * (1 + aleatorio(53, k)) + k)) * LARGURA;
      const y = (aleatorio(59, k) + 0.08 * Math.cos(agora * 0.5 * (1 + aleatorio(61, k)) + k * 2)) * ALTURA;
      const pulso = Math.max(0, Math.sin(agora * 2 * (0.6 + aleatorio(67, k)) + k * 3));
      ctx.globalAlpha = pulso * 0.25;
      ctx.fillStyle = '#c3fa6b';
      circulo(ctx, x, y, 6);
      ctx.fill();
      ctx.globalAlpha = pulso * 0.9;
      ctx.fillStyle = '#f4ffcf';
      circulo(ctx, x, y, 1.6);
      ctx.fill();
    }
  } else if (tipo === 'folhas') {
    for (let k = 0; k < 6; k++) {
      const x = ((aleatorio(71, k) * LARGURA + agora * (12 + aleatorio(73, k) * 10)) % (LARGURA + 40)) - 20;
      const y = ((aleatorio(79, k) * ALTURA + agora * (8 + aleatorio(83, k) * 8)) % (ALTURA + 40)) - 20;
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = k % 2 ? '#8fbf5a' : '#c9a24a';
      lasca(ctx, x, y, 7, 3.5, agora * (1 + aleatorio(89, k)) + k);
    }
  } else if (tipo === 'poeira') {
    ctx.fillStyle = '#ffffff';
    for (let k = 0; k < 14; k++) {
      const x = ((aleatorio(97, k) * LARGURA + agora * (4 + aleatorio(101, k) * 6)) % LARGURA);
      const y = aleatorio(103, k) * ALTURA + Math.sin(agora * 0.6 + k) * 10;
      ctx.globalAlpha = 0.08 + 0.1 * Math.sin(agora * 0.9 + k * 2) ** 2;
      ctx.fillRect(x, y, 1.6, 1.6);
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

export function criarPintor(canvas) {
  const ctx = canvas.getContext('2d');
  const cenario = criarCenario();
  const luz = document.createElement('canvas');
  luz.width = COLUNAS * PIXELS_LUZ;
  luz.height = Math.round((ALTURA / TAM) * PIXELS_LUZ);
  const ctxLuz = luz.getContext('2d');
  const sprites = new Map();
  const larguras = new Map();
  const retratos = new Map(); // canvas -> { ctx, cor, pose }
  const movimentoReduzido = matchMedia('(prefers-reduced-motion: reduce)');
  const maisContraste = matchMedia('(prefers-contrast: more)');
  let gradientesSubita = null;
  // Opening of a match and its finale: when they started and where the camera focuses.
  const transicao = { contagem: false, abertaEm: -9, vivos: 0, finalEm: -9, foco: null };
  // Per player (by color): step phase, speed and the moments it turned, picked an item or dropped a bomb.
  const animacoes = new Map();
  let bombasVistas = new Set();
  let efeitosDaCena = [];
  let agoraAnterior = 0;
  let brilhoLuz = null;
  let temaDoBrilho = null;
  // Adaptive resolution: the scale follows the screen up to ESCALA_MAX, under a ceiling that drops when
  // most recent frames miss their slot and climbs back slowly (never straight back to a level that failed).
  const qualidade = { escala: 0, teto: ESCALA_MAX, mediaMs: 1000 / 60, ultimoMs: 0, mudouEm: performance.now(), falhouEm: 0, escalaQueFalhou: Infinity };
  const atrasos = new Uint8Array(JANELA_QUADROS);
  let posicaoAtraso = 0;
  let atrasados = 0;
  let medidos = 0;

  const medirQuadro = () => {
    const agoraMs = performance.now();
    const intervalo = agoraMs - qualidade.ultimoMs;
    qualidade.ultimoMs = agoraMs;
    // The first frame, a hidden tab or a paused screen say nothing about the device.
    if (intervalo <= 0 || intervalo > 120) return;
    qualidade.mediaMs += (intervalo - qualidade.mediaMs) * 0.05;
    const atrasado = intervalo > QUADRO_ATRASADO_MS ? 1 : 0;
    atrasados += atrasado - atrasos[posicaoAtraso];
    atrasos[posicaoAtraso] = atrasado;
    posicaoAtraso = (posicaoAtraso + 1) % JANELA_QUADROS;
    medidos = Math.min(medidos + 1, JANELA_QUADROS);
    const desde = agoraMs - qualidade.mudouEm;
    if (medidos < JANELA_QUADROS) return;
    if (atrasados > JANELA_QUADROS * 0.5 && desde > 2500 && qualidade.escala > 1) {
      qualidade.escalaQueFalhou = qualidade.escala;
      qualidade.falhouEm = agoraMs;
      qualidade.teto = Math.max(1, qualidade.escala - 0.5);
      qualidade.mudouEm = agoraMs;
      atrasos.fill(0);
      atrasados = 0;
      medidos = 0;
    } else if (atrasados < JANELA_QUADROS * 0.05 && desde > 12000 && qualidade.teto < ESCALA_MAX) {
      const proximo = qualidade.teto + 0.25;
      if (proximo < qualidade.escalaQueFalhou || agoraMs - qualidade.falhouEm > 90000) {
        qualidade.teto = proximo;
        qualidade.mudouEm = agoraMs;
      }
    }
  };

  // Backing store sized to what is actually on screen, in steps of 0.25 so every tile has whole pixels.
  const ajustarResolucao = () => {
    const pixels = (canvas.clientWidth || LARGURA) * (window.devicePixelRatio || 1);
    const necessaria = Math.ceil((pixels / LARGURA) * 4) / 4;
    const nova = limitar(Math.min(necessaria, qualidade.teto), 0.5, ESCALA_MAX);
    if (nova === qualidade.escala) return;
    qualidade.escala = nova;
    canvas.width = Math.round(LARGURA * nova);
    canvas.height = Math.round(ALTURA * nova);
    sprites.clear();
  };

  const sprite = item => {
    if (!sprites.has(item)) {
      const escala = qualidade.escala;
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

  // A soft round glow tinted with the theme's light, drawn into the low resolution light map.
  const brilho = tema => {
    if (temaDoBrilho === tema) return brilhoLuz;
    brilhoLuz = document.createElement('canvas');
    brilhoLuz.width = brilhoLuz.height = 64;
    const ctxBrilho = brilhoLuz.getContext('2d');
    const [r, g, b] = tema.luz;
    const gradiente = ctxBrilho.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradiente.addColorStop(0, `rgba(${r}, ${g}, ${b}, 1)`);
    gradiente.addColorStop(0.45, `rgba(${r}, ${g}, ${b}, 0.4)`);
    gradiente.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    ctxBrilho.fillStyle = gradiente;
    ctxBrilho.fillRect(0, 0, 64, 64);
    temaDoBrilho = tema;
    return brilhoLuz;
  };

  // Flames and fresh explosions light up the floor and walls around them. The light is painted at 8 px
  // per tile and blended over the arena only inside the rectangle that has light, which keeps it cheap.
  const desenharLuz = (cena, tema, agora) => {
    const explosoes = cena.efeitos.filter(efeito => efeito.tipo === 'explosao' && agora - efeito.inicio < 0.6);
    if (!cena.c.length && !explosoes.length) return;
    const fonte = brilho(tema);
    ctxLuz.globalCompositeOperation = 'source-over';
    ctxLuz.globalAlpha = 1;
    ctxLuz.clearRect(0, 0, luz.width, luz.height);
    ctxLuz.globalCompositeOperation = 'lighter';
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    const lancar = (x, y, raioTiles, alfa) => {
      const raio = raioTiles * PIXELS_LUZ;
      const cx = (x + 0.5) * PIXELS_LUZ;
      const cy = (y + 0.5) * PIXELS_LUZ;
      ctxLuz.globalAlpha = alfa;
      ctxLuz.drawImage(fonte, cx - raio, cy - raio, raio * 2, raio * 2);
      x0 = Math.min(x0, cx - raio);
      y0 = Math.min(y0, cy - raio);
      x1 = Math.max(x1, cx + raio);
      y1 = Math.max(y1, cy + raio);
    };
    for (const [i] of cena.c) lancar(i % COLUNAS, Math.floor(i / COLUNAS), 1.7, 0.42 + Math.sin(agora * 31 + i) * 0.08);
    for (const efeito of explosoes) {
      const idade = agora - efeito.inicio;
      lancar(efeito.x, efeito.y, 2.6 + idade * 2.5, 1 - idade / 0.6);
    }
    x0 = Math.max(0, Math.floor(x0));
    y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(luz.width, Math.ceil(x1));
    y1 = Math.min(luz.height, Math.ceil(y1));
    if (x1 <= x0 || y1 <= y0) return;
    const k = TAM / PIXELS_LUZ;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.65;
    ctx.drawImage(luz, x0, y0, x1 - x0, y1 - y0, x0 * k, y0 * k, (x1 - x0) * k, (y1 - y0) * k);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  };

  // Everything the reactions need is read from the scene itself, so nothing new travels over the network.
  const atualizarAnimacoes = (cena, agora) => {
    const dt = limitar(agora - agoraAnterior, 0, 0.1);
    agoraAnterior = agora;
    const bombas = new Set(cena.b.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`));
    // Scenes without a phase (tests, tools) count as a match.
    const emJogo = cena.fase === undefined || cena.fase === 'jogo';
    for (const jogador of cena.j) {
      const chave = indiceCor(jogador.cor);
      let anim = animacoes.get(chave);
      if (!anim) {
        anim = { x: jogador.x, y: jogador.y, fase: 0, amplitude: 0, vx: 0, o: jogador.o, pegouEm: -9, bombaEm: -9, giroEm: -9, poderes: null };
        animacoes.set(chave, anim);
      }
      const dx = jogador.x - anim.x;
      const distancia = Math.abs(dx) + Math.abs(jogador.y - anim.y);
      if (distancia < 1.5) {
        anim.fase += distancia * Math.PI * 2.2;
        if (dt > 0) anim.vx += (dx / dt - anim.vx) * Math.min(1, dt * 12);
      } else {
        anim.vx = 0;
      }
      anim.x = jogador.x;
      anim.y = jogador.y;
      anim.amplitude += ((jogador.a ? 1 : 0) - anim.amplitude) * Math.min(1, dt * 14);
      if (jogador.o !== anim.o) {
        if (jogador.v) anim.giroEm = agora;
        anim.o = jogador.o;
      }
      // Reactions only count mid-match: the powers everyone starts with are not pickups.
      const poderes = [jogador.b, jogador.f, jogador.t, jogador.e, jogador.p, jogador.g, jogador.k, jogador.r, jogador.m, jogador.gl, jogador.at].map(valor => Number(valor) || 0);
      if (emJogo && anim.poderes && jogador.v && poderes.some((valor, k) => valor > anim.poderes[k])) anim.pegouEm = agora;
      anim.poderes = emJogo ? poderes : null;
      const celula = `${Math.round(jogador.x)},${Math.round(jogador.y)}`;
      if (emJogo && jogador.v && bombas.has(celula) && !bombasVistas.has(celula)) anim.bombaEm = agora;
    }
    bombasVistas = bombas;
  };

  const acompanharTransicoes = (cena, agora) => {
    if (cena.contagem && !transicao.contagem) transicao.abertaEm = agora;
    transicao.contagem = Boolean(cena.contagem);
    const vivos = cena.j.filter(jogador => jogador.v);
    if (cena.fase !== 'jogo') {
      if (cena.fase === 'contagem') transicao.finalEm = -9;
    } else if (vivos.length < transicao.vivos && vivos.length <= 1) {
      // The last elimination: focus on whoever is left, or on where the last one fell.
      const morte = cena.efeitos.filter(efeito => efeito.tipo === 'morte').at(-1);
      const alvo = vivos[0] ?? morte;
      if (alvo) {
        transicao.finalEm = agora;
        transicao.foco = { x: (alvo.x + 0.5) * TAM, y: (alvo.y + 0.5) * TAM };
      }
    }
    transicao.vivos = vivos.length;
  };

  // Where each player is in the opening drop: hidden before its turn, then falling with a bounce.
  const quedaDeAbertura = (n, agora) => {
    const t = agora - transicao.abertaEm - 0.25 - n * 0.07;
    if (t >= 0.4) return 0;
    if (t < 0) return null;
    const k = t / 0.4;
    return TAM * 2.2 * (1 - voltaPorCima(k));
  };

  // A dark curtain that sweeps off the arena to the right while the countdown starts.
  const desenharCortina = (agora, tema) => {
    const k = (agora - transicao.abertaEm) / (ABERTURA_S * 0.7);
    if (k >= 1) return;
    const borda = TAM * 2.5;
    const x = -borda + (LARGURA + borda * 2) * suavizarSaida(Math.max(0, k));
    const gradiente = ctx.createLinearGradient(x - borda, 0, x, 0);
    gradiente.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradiente.addColorStop(1, tema.borda[2]);
    ctx.fillStyle = gradiente;
    ctx.fillRect(x - borda, 0, borda, ALTURA);
    ctx.fillStyle = tema.borda[2];
    ctx.fillRect(x, 0, LARGURA - x + TAM, ALTURA);
  };

  // A sudden death block falling onto its cell, with its shadow growing below, until it lands.
  const desenharQuedasDeBloco = agora => {
    for (const efeito of efeitosDaCena) {
      if (efeito.tipo !== 'bloco') continue;
      const idade = agora - efeito.inicio;
      if (idade < 0 || idade >= QUEDA_BLOCO_S) continue;
      const k = idade / QUEDA_BLOCO_S;
      cenario.piso(ctx, efeito.x, efeito.y);
      ctx.fillStyle = `rgba(0, 0, 0, ${(0.15 + k * 0.35).toFixed(3)})`;
      elipse(ctx, (efeito.x + 0.5) * TAM, (efeito.y + 0.8) * TAM, TAM * (0.25 + k * 0.2), TAM * (0.08 + k * 0.06));
      ctx.fill();
      cenario.bloco(ctx, efeito.x, efeito.y, efeito.y * TAM - TAM * 1.8 * (1 - k * k));
    }
  };

  // Darkens everything but the focus of the finale.
  const desenharVinhetaFinal = noFinal => {
    const { x, y } = transicao.foco;
    const forca = Math.min(1, noFinal / 0.4) * (noFinal > FINAL_S - 0.3 ? (FINAL_S - noFinal) / 0.3 : 1);
    const gradiente = ctx.createRadialGradient(x, y, TAM * 1.2, x, y, TAM * 7);
    gradiente.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradiente.addColorStop(1, `rgba(0, 0, 0, ${(0.55 * forca).toFixed(3)})`);
    ctx.fillStyle = gradiente;
    ctx.fillRect(-LARGURA, -ALTURA, LARGURA * 3, ALTURA * 3);
  };

  // Explosions shake the screen more the closer they are to you, and gently while you watch.
  const tremorDosado = (cena, agora) => {
    const eu = cena.j.find(jogador => jogador.eu && jogador.v);
    let total = 0;
    for (const efeito of cena.efeitos) {
      if (efeito.tipo !== 'explosao') continue;
      const idade = agora - efeito.inicio;
      if (idade < 0 || idade > 0.35) continue;
      const perto = eu ? limitar(1.25 - (Math.abs(eu.x - efeito.x) + Math.abs(eu.y - efeito.y)) / 9, 0.3, 1.25) : 0.6;
      total += 5 * (1 - idade / 0.35) * perto;
    }
    return Math.min(total, 9);
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
      const pixels = Math.round(lado * Math.min(ESCALA_MAX, window.devicePixelRatio || 1));
      if (quadro.width !== pixels) quadro.width = quadro.height = pixels;
      const k = pixels / RETRATO;
      retrato.ctx.setTransform(1, 0, 0, 1, 0, 0);
      retrato.ctx.clearRect(0, 0, pixels, pixels);
      retrato.ctx.setTransform(k, 0, 0, k, 0, 0);
      if (retrato.pose === 'festa' && !reduzido) confete(retrato.ctx, agora);
      desenharBoneco(retrato.ctx, RETRATO / 2, RETRATO - 8, { cor: retrato.cor, o: DIRECAO.BAIXO }, retrato.pose, agora, reduzido);
    }
  };

  // cena: { g, muros: Set, chaveMuros, tema, j: [{ x, y, v, o, a, e, i, g, p, cor, nome, eu, festa, pronto, ... }],
  //         b, c, iv, gl, agora, efeitos, contagem, subita }. The shake is worked out here from the explosions.
  const desenhar = cena => {
    medirQuadro();
    ajustarResolucao();
    const escala = qualidade.escala;
    const reduzido = movimentoReduzido.matches;
    const fixa = cenario.atualizar(cena, escala, maisContraste.matches);
    const tema = cenario.tema;
    acompanharTransicoes(cena, cena.agora);
    // The finale slows the visual clock down; the game itself keeps its pace.
    const noFinal = cena.agora - transicao.finalEm;
    const lento = !reduzido && noFinal >= 0 && noFinal < FINAL_S;
    const agora = lento ? transicao.finalEm + noFinal * 0.35 : cena.agora;
    efeitosDaCena = cena.efeitos;
    atualizarAnimacoes(cena, agora);
    const tremor = reduzido ? 0 : tremorDosado(cena, agora);
    const tx = tremor > 0.2 ? Math.sin(agora * 57) * tremor * 0.5 : 0;
    const ty = tremor > 0.2 ? Math.cos(agora * 63) * tremor * 0.5 : 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = tema.borda[2];
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    let zoom = 1;
    if (lento && transicao.foco) zoom = 1 + 0.28 * suavizarSaida(Math.min(1, noFinal / 0.5));
    // Zooming around the focus point never shows anything outside the arena.
    const foco = transicao.foco ?? { x: 0, y: 0 };
    const k = escala * zoom;
    ctx.setTransform(k, 0, 0, k, (tx + foco.x * (1 - zoom)) * escala, (ty + foco.y * (1 - zoom)) * escala);
    ctx.drawImage(fixa, 0, 0, LARGURA, ALTURA);
    if (!reduzido) desenharQuedasDeBloco(agora);
    for (const efeito of cena.efeitos) if (efeito.tipo === 'explosao') desenharMancha(ctx, efeito, agora);
    desenharLuz(cena, tema, agora);
    for (let i = 0; i < cena.g.length; i++) {
      if (VISUAL_ITEM[cena.g[i]]) desenharItem(ctx, sprite(cena.g[i]), i, cena.g[i], agora, reduzido);
    }
    for (const chama of cena.c) desenharChama(ctx, chama, agora);
    for (const efeito of cena.efeitos) if (EFEITOS_DO_CHAO.has(efeito.tipo)) desenharEfeito(ctx, efeito, agora, reduzido, tema);
    for (const bomba of cena.b) desenharBomba(ctx, bomba, agora, reduzido);
    for (const tiro of cena.gl ?? []) desenharTiroGelo(ctx, tiro, agora);
    // Items flying to a magnet are drawn a bit smaller, above walls and crates.
    for (const [x, y, item] of cena.iv ?? []) {
      if (!VISUAL_ITEM[item]) continue;
      ctx.drawImage(sprite(item), (x + 0.15) * TAM, (y + 0.15) * TAM, TAM * 0.7, TAM * 0.7);
    }
    const abrindo = !reduzido && cena.contagem && agora - transicao.abertaEm < ABERTURA_S;
    const vivos = cena.j
      .map((jogador, n) => ({ jogador, queda: abrindo ? quedaDeAbertura(n, agora) : 0 }))
      .filter(({ jogador, queda }) => jogador.v && queda !== null)
      .sort((a, b) => a.jogador.y - b.jogador.y);
    const topos = vivos.map(({ jogador, queda }) => {
      if (queda) ctx.translate(0, -queda);
      const topo = desenharJogador(ctx, jogador, agora, reduzido, animacoes.get(indiceCor(jogador.cor)));
      if (queda) ctx.translate(0, queda);
      return topo - queda;
    });
    if (!reduzido && tema.ambiente) desenharAmbiente(ctx, tema.ambiente, agora);
    // Tags go after every body, so a character walking below never covers someone's name.
    const escalaTela = (canvas.clientWidth || LARGURA) / LARGURA;
    const escalaRotulo = limitar(0.6 / escalaTela, 1, 2);
    const comNome = escalaTela >= 0.45;
    vivos.forEach(({ jogador }, n) => {
      const cx = (jogador.x + 0.5) * TAM;
      const chao = (jogador.y + 0.5) * TAM + TAM * 0.36;
      desenharRotulo(ctx, cx, topos[n], chao, jogador, larguraNome(jogador.nome), escalaRotulo, comNome, cena.contagem && jogador.eu, agora, reduzido);
    });
    for (const efeito of cena.efeitos) if (!EFEITOS_DO_CHAO.has(efeito.tipo)) desenharEfeito(ctx, efeito, agora, reduzido, tema);
    if (cena.subita) desenharAlertaSubita(agora, reduzido);
    if (abrindo) desenharCortina(agora, tema);
    if (noFinal >= 0 && noFinal < FINAL_S && transicao.foco) desenharVinhetaFinal(noFinal);
    desenharRetratos(cena.agora, reduzido);
  };

  // Small animated character drawn on an HTML screen (lobby, results, podium); it stops being drawn
  // once the canvas leaves the page.
  const retrato = (quadro, { cor, pose = 'jogo' }) => {
    retratos.set(quadro, { ctx: quadro.getContext('2d'), cor, pose });
    return quadro;
  };

  return {
    desenhar,
    retrato,
    // For a frames-per-second display or a performance test: current scale, its ceiling and frame time.
    get qualidade() {
      return { escala: qualidade.escala, teto: qualidade.teto, quadroMs: Math.round(qualidade.mediaMs * 10) / 10 };
    },
  };
}
