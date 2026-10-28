// Canvas painter for Pavio: draws one frame from a scene (grid, players, bombs, flames, effects).
// The static part of the arena (floor, walls, crates) is cached in an offscreen canvas and redrawn
// only when the grid changes, which keeps tablets and phones smooth.

import { COLUNAS, LINHAS, PAREDE, CAIXA, ITEM, DIRECAO, ehBlocoFixo } from './regras.js';

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
};
const FONTE_EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const FONTE_TEXTO = 'Rubik, system-ui, sans-serif';
const DURACAO_EFEITO = { morte: 0.9, item: 0.8, escudo: 0.5, ponto: 0.7 };

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

function desenharBomba(ctx, [x, y, restante, , remota, congelada], agora) {
  const cx = (x + 0.5) * TAM;
  const cy = (y + 0.5) * TAM + 3;
  const ritmo = restante < 0.7 ? 24 : restante < 1.4 ? 13 : 7;
  const pulso = Math.sin(agora * ritmo);
  const raio = TAM * 0.3 * (1 + pulso * 0.06);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  elipse(ctx, cx, (y + 0.5) * TAM + TAM * 0.32, raio * 0.95, raio * 0.3);
  ctx.fill();
  ctx.fillStyle = restante < 0.7 && pulso > 0 ? PALETA.bombaAlerta : PALETA.bomba;
  circulo(ctx, cx, cy, raio);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  circulo(ctx, cx - raio * 0.35, cy - raio * 0.38, raio * 0.28);
  ctx.fill();
  const pontaX = cx + raio * 0.95;
  const pontaY = cy - raio * 1.25;
  ctx.strokeStyle = PALETA.pavio;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx + raio * 0.45, cy - raio * 0.8);
  ctx.quadraticCurveTo(cx + raio * 0.6, cy - raio * 1.35, pontaX, pontaY);
  ctx.stroke();
  if (remota) {
    // A remote bomb has no lit fuse: a blinking red light waits for the detonator.
    ctx.fillStyle = Math.sin(agora * 9) > 0 ? '#ff3b3b' : '#7a1010';
    circulo(ctx, pontaX, pontaY, 4);
    ctx.fill();
  } else if (!congelada) {
    faisca(ctx, pontaX, pontaY, agora);
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

function desenharJogador(ctx, jogador, agora, larguraNome) {
  const cor = CORES[jogador.cor] ?? CORES[0];
  const cx = (jogador.x + 0.5) * TAM;
  const chao = (jogador.y + 0.5) * TAM + TAM * 0.36;
  const balanco = jogador.a ? Math.sin(agora * 15) : 0;
  const pulo = Math.abs(balanco) * 3;
  const largura = TAM * 0.62;
  const altura = TAM * 0.64;
  const topo = chao - altura - 6 - pulo;

  ctx.save();
  if (jogador.g) ctx.globalAlpha = 0.55 + Math.sin(agora * 8) * 0.15;
  if (jogador.i && Math.floor(agora * 12) % 2) ctx.globalAlpha = 0.4;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  elipse(ctx, cx, chao, TAM * 0.28, TAM * 0.09);
  ctx.fill();

  ctx.fillStyle = cor.escura;
  elipse(ctx, cx - 8 + balanco * 3, chao - 3, 6, 4);
  ctx.fill();
  elipse(ctx, cx + 8 - balanco * 3, chao - 3, 6, 4);
  ctx.fill();

  ctx.fillStyle = cor.base;
  retangulo(ctx, cx - largura / 2, topo, largura, altura, largura * 0.46);
  ctx.fill();
  ctx.strokeStyle = jogador.p ? '#ff8787' : cor.escura;
  ctx.lineWidth = jogador.p ? 3.5 : 2.5;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  elipse(ctx, cx - largura * 0.2, topo + altura * 0.25, largura * 0.14, altura * 0.1);
  ctx.fill();

  // Every character carries a little lit fuse on its head.
  ctx.strokeStyle = '#3b2f2f';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx + 3, topo + 1);
  ctx.quadraticCurveTo(cx + 11, topo - 6, cx + 7, topo - 12);
  ctx.stroke();
  faisca(ctx, cx + 7, topo - 12, agora, 3);

  if (jogador.o !== DIRECAO.CIMA) {
    const olhar = { [DIRECAO.ESQUERDA]: [-3.5, 0], [DIRECAO.DIREITA]: [3.5, 0], [DIRECAO.BAIXO]: [0, 2] }[jogador.o] ?? [0, 2];
    const olhoY = topo + altura * 0.47;
    for (const lado of [-1, 1]) {
      const olhoX = cx + lado * 7.5 + olhar[0] * 0.7;
      ctx.fillStyle = '#ffffff';
      elipse(ctx, olhoX, olhoY, 5.5, 6.5);
      ctx.fill();
      ctx.fillStyle = '#16161f';
      circulo(ctx, olhoX + olhar[0] * 0.6, olhoY + olhar[1], 3);
      ctx.fill();
    }
  }
  ctx.restore();

  if (jogador.e) {
    ctx.strokeStyle = 'rgba(102, 217, 232, 0.95)';
    ctx.fillStyle = 'rgba(102, 217, 232, 0.14)';
    ctx.lineWidth = 3;
    circulo(ctx, cx, topo + altura / 2, TAM * 0.47 + Math.sin(agora * 6) * 1.5);
    ctx.fill();
    ctx.stroke();
  }

  ctx.font = `700 12px ${FONTE_TEXTO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(10, 14, 20, 0.7)';
  retangulo(ctx, cx - larguraNome / 2 - 6, topo - 34, larguraNome + 12, 18, 9);
  ctx.fill();
  ctx.fillStyle = jogador.eu ? '#ffe066' : '#ffffff';
  ctx.fillText(jogador.nome, cx, topo - 25);
}

function desenharEfeito(ctx, efeito, agora) {
  const idade = agora - efeito.inicio;
  const progresso = idade / DURACAO_EFEITO[efeito.tipo];
  const cx = (efeito.x + 0.5) * TAM;
  const cy = (efeito.y + 0.5) * TAM;
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - progresso);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (efeito.tipo === 'morte') {
    const cor = CORES[efeito.cor] ?? CORES[0];
    ctx.strokeStyle = cor.base;
    ctx.lineWidth = 4;
    circulo(ctx, cx, cy, TAM * (0.3 + progresso * 0.7));
    ctx.stroke();
    ctx.fillStyle = cor.base;
    for (let k = 0; k < 8; k++) {
      const angulo = (k / 8) * Math.PI * 2;
      circulo(ctx, cx + Math.cos(angulo) * TAM * progresso * 0.9, cy + Math.sin(angulo) * TAM * progresso * 0.9, 4);
      ctx.fill();
    }
    ctx.font = `700 ${Math.round(TAM * 0.42)}px ${FONTE_TEXTO}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('x_x', cx, cy - progresso * TAM * 0.8);
  } else if (efeito.tipo === 'item' || efeito.tipo === 'ponto') {
    const texto = efeito.tipo === 'ponto' ? efeito.texto : VISUAL_ITEM[efeito.item]?.rotulo ?? '';
    ctx.font = `800 ${efeito.tipo === 'ponto' ? 15 : 14}px ${FONTE_TEXTO}`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    const ty = cy - TAM * 0.3 - progresso * TAM * 0.8;
    ctx.strokeText(texto, cx, ty);
    ctx.fillStyle = efeito.tipo === 'ponto' ? '#ffd43b' : '#ffe066';
    ctx.fillText(texto, cx, ty);
  } else if (efeito.tipo === 'escudo') {
    ctx.strokeStyle = '#66d9e8';
    ctx.lineWidth = 5;
    circulo(ctx, cx, cy, TAM * (0.4 + progresso * 0.8));
    ctx.stroke();
  }
  ctx.restore();
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
      ctx.font = `700 12px ${FONTE_TEXTO}`;
      larguras.set(nome, ctx.measureText(nome).width);
    }
    return larguras.get(nome);
  };

  // cena: { g, muros: Set, j: [{ x, y, v, o, a, e, i, g, p, cor, nome, eu }], b, c, iv, gl, agora, efeitos, tremor }
  const desenhar = cena => {
    ajustarResolucao();
    const chave = `${cena.g}|${cena.chaveMuros}`;
    if (arenaDesenhada !== chave) {
      ctxArena.setTransform(escala, 0, 0, escala, 0, 0);
      desenharArenaFixa(ctxArena, cena.g, cena.muros);
      arenaDesenhada = chave;
    }
    let tx = 0;
    let ty = 0;
    if (cena.tremor > 0.2) {
      tx = (Math.random() - 0.5) * cena.tremor;
      ty = (Math.random() - 0.5) * cena.tremor;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETA.borda[2];
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(escala, 0, 0, escala, tx * escala, ty * escala);
    ctx.drawImage(arena, 0, 0, LARGURA, ALTURA);
    for (let i = 0; i < cena.g.length; i++) {
      if (!VISUAL_ITEM[cena.g[i]]) continue;
      const px = (i % COLUNAS) * TAM;
      const py = Math.floor(i / COLUNAS) * TAM;
      ctx.drawImage(sprite(cena.g[i]), px, py + Math.sin(cena.agora * 4 + i) * 2, TAM, TAM);
    }
    for (const chama of cena.c) desenharChama(ctx, chama, cena.agora);
    for (const bomba of cena.b) desenharBomba(ctx, bomba, cena.agora);
    for (const tiro of cena.gl ?? []) desenharTiroGelo(ctx, tiro, cena.agora);
    // Items flying to a magnet are drawn a bit smaller, above walls and crates.
    for (const [x, y, item] of cena.iv ?? []) {
      if (!VISUAL_ITEM[item]) continue;
      ctx.drawImage(sprite(item), (x + 0.15) * TAM, (y + 0.15) * TAM, TAM * 0.7, TAM * 0.7);
    }
    const vivos = cena.j.filter(j => j.v).sort((a, b) => a.y - b.y);
    for (const jogador of vivos) desenharJogador(ctx, jogador, cena.agora, larguraNome(jogador.nome));
    for (const efeito of cena.efeitos) desenharEfeito(ctx, efeito, cena.agora);
  };

  return { desenhar };
}
