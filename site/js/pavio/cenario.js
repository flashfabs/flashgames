// Map scenery for Pavio: the static layer of the arena (floor, walls, crates, cast shadows and vignette),
// drawn per map theme into an offscreen canvas. The themed floor is rendered once per map; afterwards only
// the cells whose content changed (a crate burnt, a sudden death block) and their neighbors are redrawn.

import { COLUNAS, LINHAS, PAREDE, CAIXA, ehBlocoFixo } from './regras.js';

export const TAM = 48;
export const LARGURA = COLUNAS * TAM;
export const ALTURA = LINHAS * TAM;

// Fallback while the maps do not carry a theme: the round order of the five maps.
const TEMA_POR_ORDEM = ['patio', 'deposito', 'muralhas', 'labirinto', 'fornalha'];

export function retangulo(ctx, x, y, largura, altura, raio) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, largura, altura, raio);
  else ctx.rect(x, y, largura, altura);
}

export function circulo(ctx, x, y, raio) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, raio), 0, Math.PI * 2);
}

export function elipse(ctx, x, y, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), 0, 0, Math.PI * 2);
}

// Deterministic 0..1 noise: the same seed always gives the same texture and particles.
export function aleatorio(semente, k) {
  let t = (semente + Math.imul(k + 1, 0x6d2b79f5)) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const sementeCelula = (i, sal) => Math.imul(i + 1, 2654435761) ^ sal;

// ---- Floors: one tile at (px, py); r(k) is the tile's own noise ----

function pisoLiso(ctx, tema, px, py, r) {
  if (r(0) < 0.5) return;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
  ctx.fillRect(px + 4 + r(1) * 30, py + 4 + r(2) * 30, 8, 8);
}

// Courtyard flagstones with grout, pebbles and grass growing in the joints.
function pisoLajota(ctx, tema, px, py, r) {
  ctx.fillStyle = `rgba(255, 255, 255, ${(r(0) * 0.05).toFixed(3)})`;
  retangulo(ctx, px + 2, py + 2, TAM - 4, TAM - 4, 5);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
  for (let k = 0; k < 3; k++) {
    elipse(ctx, px + 8 + r(k + 3) * 32, py + 8 + r(k + 6) * 32, 2 + r(k + 9) * 2, 1.5 + r(k + 12));
    ctx.fill();
  }
  if (r(15) < 0.45) {
    ctx.strokeStyle = 'rgba(120, 190, 90, 0.55)';
    ctx.lineWidth = 1.6;
    const gx = px + 3 + r(16) * (TAM - 10);
    const gy = r(17) < 0.5 ? py + 3 : py + TAM - 3;
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      ctx.moveTo(gx + k * 2.2, gy);
      ctx.lineTo(gx + k * 2.2 + (r(18 + k) - 0.5) * 3, gy - (gy > py + 10 ? 5 : -5) * (0.6 + r(22 + k) * 0.6));
    }
    ctx.stroke();
  }
}

// Warehouse concrete: speckles, panel seams, the odd crack and oil stain.
function pisoConcreto(ctx, tema, px, py, r, x, y) {
  for (let k = 0; k < 14; k++) {
    ctx.fillStyle = k % 2 ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.12)';
    ctx.fillRect(px + r(k) * TAM, py + r(k + 20) * TAM, 1.5, 1.5);
  }
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  if (x % 3 === 0) ctx.fillRect(px, py, 1.5, TAM);
  if (y % 3 === 0) ctx.fillRect(px, py, TAM, 1.5);
  if (r(40) < 0.12) {
    ctx.fillStyle = 'rgba(10, 12, 16, 0.3)';
    elipse(ctx, px + 14 + r(41) * 20, py + 14 + r(42) * 20, 7 + r(43) * 6, 4 + r(44) * 3);
    ctx.fill();
  }
  if (r(45) < 0.15) {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    let cx = px + r(46) * TAM;
    let cy = py + 2;
    ctx.moveTo(cx, cy);
    for (let k = 0; k < 4; k++) {
      cx += (r(47 + k) - 0.5) * 14;
      cy += 8 + r(51 + k) * 6;
      ctx.lineTo(cx, Math.min(cy, py + TAM));
    }
    ctx.stroke();
  }
}

// Castle cobblestones: rounded stones in staggered rows.
function pisoParalelepipedo(ctx, tema, px, py, r, x, y) {
  const linhas = 3;
  const altura = TAM / linhas;
  for (let l = 0; l < linhas; l++) {
    const deslocamento = (l + y) % 2 ? 8 : 0;
    for (let c = -1; c < 3; c++) {
      const sx = px + c * 16 + deslocamento;
      const k = l * 4 + c + 1;
      ctx.fillStyle = `rgba(255, 255, 255, ${(0.02 + r(k) * 0.06).toFixed(3)})`;
      retangulo(ctx, Math.max(px, sx + 1.5), py + l * altura + 1.5, Math.min(sx + 14.5, px + TAM) - Math.max(px, sx + 1.5), altura - 3, 4);
      ctx.fill();
    }
  }
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  for (let l = 1; l < linhas; l++) ctx.fillRect(px, py + l * altura - 0.75, TAM, 1.5);
}

// Ruins: worn flagstone with moss patches and cracks.
function pisoMusgo(ctx, tema, px, py, r) {
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(px + 1, py + 1, TAM - 2, TAM - 2);
  const manchas = Math.floor(r(0) * 4);
  for (let k = 0; k < manchas; k++) {
    ctx.fillStyle = `rgba(90, 160, 80, ${(0.1 + r(k + 1) * 0.12).toFixed(3)})`;
    circulo(ctx, px + r(k + 5) * TAM, py + r(k + 9) * TAM, 4 + r(k + 13) * 8);
    ctx.fill();
  }
  if (r(20) < 0.3) {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(px + r(21) * TAM, py + r(22) * TAM);
    ctx.lineTo(px + r(23) * TAM, py + r(24) * TAM);
    ctx.lineTo(px + r(25) * TAM, py + r(26) * TAM);
    ctx.stroke();
  }
}

// Forge: dark basalt with glowing magma veins.
function pisoBasalto(ctx, tema, px, py, r) {
  for (let k = 0; k < 8; k++) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.fillRect(px + r(k) * TAM, py + r(k + 10) * TAM, 2, 2);
  }
  if (r(30) < 0.16) {
    const pontos = [[px + r(31) * TAM, py + r(32) * 8]];
    for (let k = 0; k < 4; k++) pontos.push([pontos[k][0] + (r(33 + k) - 0.5) * 18, pontos[k][1] + 8 + r(37 + k) * 6]);
    for (const [largura, cor] of [[5, 'rgba(255, 90, 20, 0.18)'], [1.6, 'rgba(255, 150, 60, 0.75)']]) {
      ctx.strokeStyle = cor;
      ctx.lineWidth = largura;
      ctx.lineCap = 'round';
      ctx.beginPath();
      pontos.forEach(([vx, vy], k) => (k ? ctx.lineTo(vx, Math.min(vy, py + TAM)) : ctx.moveTo(vx, vy)));
      ctx.stroke();
    }
  }
}

// ---- Blocks with volume: a top face, a darker front face and an outline ----

function blocoComVolume(ctx, px, py, [topo, frente, escura]) {
  ctx.fillStyle = escura;
  retangulo(ctx, px + 1, py + 1, TAM - 2, TAM - 2, 7);
  ctx.fill();
  ctx.fillStyle = frente;
  retangulo(ctx, px + 2, py + 2, TAM - 4, TAM - 5, 7);
  ctx.fill();
  ctx.fillStyle = topo;
  retangulo(ctx, px + 4, py + 3, TAM - 8, TAM - 16, 6);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.fillRect(px + 9, py + 5, TAM - 18, 2);
}

function rebites(ctx, px, py) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  for (const [rx, ry] of [[9, 8], [TAM - 9, 8], [9, TAM - 18], [TAM - 9, TAM - 18]]) {
    circulo(ctx, px + rx, py + ry, 1.8);
    ctx.fill();
  }
}

function tijolos(ctx, px, py, cores) {
  blocoComVolume(ctx, px, py, cores);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
  const fileiras = [[py + 4, 8], [py + 12, 8], [py + 20, 8], [py + 33, 7], [py + 40, 6]];
  fileiras.forEach(([ly], n) => {
    if (n) ctx.fillRect(px + 4, ly - 0.75, TAM - 8, 1.5);
    const passo = 13;
    for (let bx = px + 4 + (n % 2 ? passo / 2 : 0); bx < px + TAM - 6; bx += passo) ctx.fillRect(bx, ly, 1.5, fileiras[n][1] - 1);
  });
}

function sebe(ctx, px, py, [clara, media, escura], r) {
  ctx.fillStyle = escura;
  retangulo(ctx, px + 1, py + 3, TAM - 2, TAM - 4, 12);
  ctx.fill();
  for (let k = 0; k < 9; k++) {
    ctx.fillStyle = k < 5 ? media : clara;
    circulo(ctx, px + 9 + r(k) * (TAM - 18), py + 9 + r(k + 10) * (TAM - 24) - (k < 5 ? 0 : 3), 7 + r(k + 20) * 5);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
  for (let k = 0; k < 6; k++) {
    circulo(ctx, px + 8 + r(k + 30) * (TAM - 16), py + 6 + r(k + 40) * (TAM - 22), 1.6);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.fillRect(px + 3, py + TAM - 9, TAM - 6, 6);
}

function costuraDeLava(ctx, px, py, r) {
  const pontos = [[px + 6 + r(0) * 10, py + TAM - 12]];
  for (let k = 0; k < 3; k++) pontos.push([pontos[k][0] + 8 + r(k + 1) * 6, py + TAM - 14 + (r(k + 4) - 0.5) * 16]);
  for (const [largura, cor] of [[5, 'rgba(255, 90, 20, 0.25)'], [1.8, '#ffb057']]) {
    ctx.strokeStyle = cor;
    ctx.lineWidth = largura;
    ctx.lineCap = 'round';
    ctx.beginPath();
    pontos.forEach(([vx, vy], k) => (k ? ctx.lineTo(vx, vy) : ctx.moveTo(vx, vy)));
    ctx.stroke();
  }
}

function listrasDePerigo(ctx, px, py) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(px + 4, py + TAM - 13, TAM - 8, 8);
  ctx.clip();
  ctx.fillStyle = '#f2c94c';
  ctx.fillRect(px + 4, py + TAM - 13, TAM - 8, 8);
  ctx.fillStyle = '#1c1d20';
  for (let k = -1; k < 6; k++) {
    ctx.beginPath();
    ctx.moveTo(px + k * 10, py + TAM - 5);
    ctx.lineTo(px + k * 10 + 5, py + TAM - 5);
    ctx.lineTo(px + k * 10 + 13, py + TAM - 13);
    ctx.lineTo(px + k * 10 + 8, py + TAM - 13);
    ctx.fill();
  }
  ctx.restore();
}

function ameias(ctx, px, py, [, frente]) {
  ctx.fillStyle = frente;
  for (let k = 0; k < 3; k++) if (k !== 1) ctx.fillRect(px + 5 + k * 13, py + 4, 11, 7);
}

// ---- Crates: planks, frame, nails, with a few variants and theme accents ----

function desenharCaixa(ctx, px, py, tema, r) {
  const [clara, base, escura] = tema.caixa;
  const m = 4;
  ctx.fillStyle = escura;
  retangulo(ctx, px + m, py + m, TAM - m * 2, TAM - m * 2, 6);
  ctx.fill();
  ctx.fillStyle = base;
  retangulo(ctx, px + m + 3, py + m + 3, TAM - m * 2 - 6, TAM - m * 2 - 9, 4);
  ctx.fill();
  // Plank gaps.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  for (let k = 1; k < 3; k++) ctx.fillRect(px + m + 4, py + m + 3 + k * 9.5, TAM - m * 2 - 8, 1.4);
  ctx.strokeStyle = escura;
  ctx.lineWidth = 3;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  const variante = Math.floor(r(0) * 3);
  if (variante === 0 || variante === 2) {
    ctx.moveTo(px + m + 6, py + TAM - m - 10);
    ctx.lineTo(px + TAM - m - 6, py + m + 6);
  }
  if (variante === 2) {
    ctx.moveTo(px + m + 6, py + m + 6);
    ctx.lineTo(px + TAM - m - 6, py + TAM - m - 10);
  }
  if (variante === 1) {
    ctx.moveTo(px + TAM / 2, py + m + 5);
    ctx.lineTo(px + TAM / 2, py + TAM - m - 9);
  }
  ctx.stroke();
  ctx.fillStyle = clara;
  ctx.fillRect(px + m + 5, py + m + 4, TAM - m * 2 - 10, 3);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(px + m + 2, py + TAM - m - 6, TAM - m * 2 - 4, 3);
  ctx.fillStyle = 'rgba(30, 20, 10, 0.55)';
  for (const [nx, ny] of [[m + 7, m + 8], [TAM - m - 7, m + 8], [m + 7, TAM - m - 12], [TAM - m - 7, TAM - m - 12]]) {
    circulo(ctx, px + nx, py + ny, 1.3);
    ctx.fill();
  }
  if (tema.detalheCaixa === 'cantoneira' || tema.detalheCaixa === 'ferro') {
    ctx.fillStyle = tema.detalheCaixa === 'ferro' ? '#3b3534' : '#9aa6b2';
    for (const [cx, cy] of [[m, m], [TAM - m - 9, m], [m, TAM - m - 9], [TAM - m - 9, TAM - m - 9]]) ctx.fillRect(px + cx, py + cy, 9, 9);
  } else if (tema.detalheCaixa === 'musgo' && r(5) < 0.6) {
    ctx.fillStyle = 'rgba(80, 150, 70, 0.55)';
    circulo(ctx, px + m + 6 + r(6) * 26, py + m + 4, 4 + r(7) * 3);
    ctx.fill();
  }
}

const TEMAS = {
  padrao: {
    chao: ['#263544', '#2a3a4a'],
    piso: pisoLiso,
    borda: ['#323e4b', '#222b35', '#161c23'],
    pilar: ['#8a99a8', '#62717e', '#434f5a'],
    muro: ['#7c8a6e', '#56634b', '#3a4433'],
    subita: ['#e8590c', '#a63c06', '#6b2604'],
    caixa: ['#d9995a', '#b9783b', '#7a4a1f'],
    sombra: 'rgba(0, 0, 0, 0.14)',
    vinheta: 'rgba(4, 7, 11, 0.5)',
    luz: [255, 170, 80],
  },
  patio: {
    chao: ['#2f4535', '#334a39'],
    piso: pisoLajota,
    borda: ['#6a705c', '#4a4f40', '#2b2f25'],
    pilar: ['#cdb98f', '#a08b63', '#6f5f42'],
    muro: ['#cdb98f', '#a08b63', '#6f5f42'],
    subita: ['#e8590c', '#a63c06', '#6b2604'],
    caixa: ['#dea263', '#be8143', '#7d4f22'],
    sombra: 'rgba(8, 20, 8, 0.16)',
    vinheta: 'rgba(6, 14, 8, 0.45)',
    luz: [255, 180, 90],
    ambiente: 'folhas',
  },
  deposito: {
    chao: ['#393d43', '#363a40'],
    piso: pisoConcreto,
    borda: ['#4a4f57', '#30343a', '#1e2125'],
    decoBorda: 'listras',
    pilar: ['#9aa6b2', '#6c7783', '#48515b'],
    decoPilar: 'rebites',
    muro: ['#9aa6b2', '#6c7783', '#48515b'],
    subita: ['#e8590c', '#a63c06', '#6b2604'],
    caixa: ['#d9a560', '#b8833f', '#7c5524'],
    detalheCaixa: 'cantoneira',
    sombra: 'rgba(0, 0, 0, 0.16)',
    vinheta: 'rgba(6, 7, 9, 0.5)',
    luz: [255, 175, 85],
    ambiente: 'poeira',
  },
  muralhas: {
    chao: ['#3a3440', '#36303c'],
    piso: pisoParalelepipedo,
    borda: ['#7a7486', '#55505e', '#38343f'],
    decoBorda: 'ameias',
    pilar: ['#9a94a3', '#6f6a78', '#4b4753'],
    muro: ['#c0705a', '#8f4a39', '#5c2c22'],
    decoMuro: 'tijolos',
    subita: ['#e8590c', '#a63c06', '#6b2604'],
    caixa: ['#d9995a', '#b9783b', '#7a4a1f'],
    sombra: 'rgba(10, 4, 14, 0.17)',
    vinheta: 'rgba(10, 6, 14, 0.5)',
    luz: [255, 170, 80],
  },
  labirinto: {
    chao: ['#213d39', '#24423e'],
    piso: pisoMusgo,
    borda: ['#3f9a4c', '#2b7536', '#173f1e'],
    decoBorda: 'sebe',
    pilar: ['#8a9a84', '#647360', '#424d3f'],
    muro: ['#4cae59', '#2f8a3d', '#1a4d22'],
    decoMuro: 'sebe',
    subita: ['#e8590c', '#a63c06', '#6b2604'],
    caixa: ['#c99558', '#a87338', '#6e4a1f'],
    detalheCaixa: 'musgo',
    sombra: 'rgba(0, 16, 8, 0.18)',
    vinheta: 'rgba(2, 14, 10, 0.55)',
    luz: [255, 190, 110],
    ambiente: 'vagalumes',
  },
  fornalha: {
    chao: ['#2a2121', '#2e2424'],
    piso: pisoBasalto,
    borda: ['#4a3a36', '#2e2321', '#1a1210'],
    pilar: ['#625955', '#453e3b', '#2c2726'],
    decoPilar: 'lava',
    muro: ['#54435a', '#352a3a', '#1f1823'],
    decoMuro: 'lava',
    subita: ['#ff7a1a', '#c2410c', '#7c2d12'],
    caixa: ['#b07a46', '#8e5a2c', '#553317'],
    detalheCaixa: 'ferro',
    sombra: 'rgba(0, 0, 0, 0.2)',
    vinheta: 'rgba(40, 8, 0, 0.55)',
    luz: [255, 140, 60],
    ambiente: 'brasas',
  },
};

// Theme key of a map: its own, or by the round order while the maps do not carry one.
export function chaveDoTema(chave, ordem) {
  return TEMAS[chave] ? chave : TEMA_POR_ORDEM[ordem] ?? 'padrao';
}

export function temaDe(chave, ordem) {
  if (chave === undefined) return TEMAS[TEMA_POR_ORDEM[ordem]] ?? TEMAS.padrao;
  return TEMAS[chave] ?? TEMAS.padrao;
}

function classe(celula) {
  if (celula === PAREDE) return PAREDE;
  return celula === CAIXA ? CAIXA : '.';
}

export function criarCenario() {
  const base = document.createElement('canvas');
  const camada = document.createElement('canvas');
  const vinheta = document.createElement('canvas');
  const ctxBase = base.getContext('2d');
  const ctxCamada = camada.getContext('2d');
  let temaDaBase = null;
  let escalaDaBase = 0;
  let chaveCamada = null;
  let ultimaGrade = null;
  let fixa = null;
  let escala = 1;
  let tema = TEMAS.padrao;
  let muros = new Set();

  const solido = (x, y) => x < 0 || y < 0 || x >= COLUNAS || y >= LINHAS || fixa[y * COLUNAS + x] !== '.';

  const desenharBase = () => {
    for (const quadro of [base, vinheta]) {
      quadro.width = Math.round(LARGURA * escala);
      quadro.height = Math.round(ALTURA * escala);
    }
    ctxBase.setTransform(escala, 0, 0, escala, 0, 0);
    for (let y = 0; y < LINHAS; y++) {
      for (let x = 0; x < COLUNAS; x++) {
        const i = y * COLUNAS + x;
        const px = x * TAM;
        const py = y * TAM;
        const semente = sementeCelula(i, 0x5eed);
        ctxBase.fillStyle = tema.chao[(x + y) % 2];
        ctxBase.fillRect(px, py, TAM, TAM);
        tema.piso(ctxBase, tema, px, py, k => aleatorio(semente, k), x, y);
      }
    }
    const ctxVinheta = vinheta.getContext('2d');
    ctxVinheta.setTransform(escala, 0, 0, escala, 0, 0);
    const gradiente = ctxVinheta.createRadialGradient(LARGURA / 2, ALTURA / 2, ALTURA * 0.35, LARGURA / 2, ALTURA / 2, LARGURA * 0.62);
    gradiente.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradiente.addColorStop(1, tema.vinheta);
    ctxVinheta.fillStyle = gradiente;
    ctxVinheta.fillRect(0, 0, LARGURA, ALTURA);
  };

  const desenharBloco = (ctx, x, y, px, py, r) => {
    const borda = x === 0 || y === 0 || x === COLUNAS - 1 || y === LINHAS - 1;
    if (borda) {
      if (tema.decoBorda === 'sebe') return sebe(ctx, px, py, tema.borda, r);
      blocoComVolume(ctx, px, py, tema.borda);
      if (tema.decoBorda === 'listras') listrasDePerigo(ctx, px, py);
      else if (tema.decoBorda === 'ameias') ameias(ctx, px, py, tema.borda);
      return;
    }
    if (ehBlocoFixo(x, y)) {
      blocoComVolume(ctx, px, py, tema.pilar);
      if (tema.decoPilar === 'rebites') rebites(ctx, px, py);
      else if (tema.decoPilar === 'lava' && r(9) < 0.22) costuraDeLava(ctx, px, py, r);
      return;
    }
    if (muros.has(y * COLUNAS + x)) {
      if (tema.decoMuro === 'sebe') return sebe(ctx, px, py, tema.muro, r);
      if (tema.decoMuro === 'tijolos') return tijolos(ctx, px, py, tema.muro);
      blocoComVolume(ctx, px, py, tema.muro);
      if (tema.decoMuro === 'lava') costuraDeLava(ctx, px, py, r);
      return;
    }
    // Sudden death block: hot metal with warning chevrons.
    blocoComVolume(ctx, px, py, tema.subita);
    ctx.strokeStyle = 'rgba(40, 10, 0, 0.45)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(px + 12, py + 12);
    ctx.lineTo(px + TAM / 2, py + 20);
    ctx.lineTo(px + TAM - 12, py + 12);
    ctx.stroke();
  };

  // Light comes from the top left, so solid neighbors on the left and above cast shadows on this cell.
  const desenharSombras = (ctx, x, y, px, py) => {
    const esquerda = solido(x - 1, y);
    const acima = solido(x, y - 1);
    // Two passes give the shadow a soft outer edge.
    ctx.fillStyle = tema.sombra;
    for (const [largura, altura] of [[11, 12], [7, 8]]) {
      if (esquerda) ctx.fillRect(px, py + (acima ? 0 : 7), largura, TAM - (acima ? 0 : 7));
      if (acima) ctx.fillRect(px + (esquerda ? largura : 7), py, TAM - (esquerda ? largura : 7), altura);
      if (!esquerda && !acima && solido(x - 1, y - 1)) ctx.fillRect(px, py, largura - 1, altura - 1);
    }
  };

  const desenharCelula = (x, y) => {
    const i = y * COLUNAS + x;
    const px = x * TAM;
    const py = y * TAM;
    const lado = Math.round(TAM * escala);
    const dx = Math.round(px * escala);
    const dy = Math.round(py * escala);
    ctxCamada.setTransform(1, 0, 0, 1, 0, 0);
    ctxCamada.drawImage(base, dx, dy, lado, lado, dx, dy, lado, lado);
    ctxCamada.save();
    ctxCamada.beginPath();
    ctxCamada.rect(dx, dy, lado, lado);
    ctxCamada.clip();
    ctxCamada.setTransform(escala, 0, 0, escala, 0, 0);
    const semente = sementeCelula(i, 0xb10c);
    const r = k => aleatorio(semente, k);
    if (fixa[i] === PAREDE) {
      desenharBloco(ctxCamada, x, y, px, py, r);
    } else {
      desenharSombras(ctxCamada, x, y, px, py);
      if (fixa[i] === CAIXA) desenharCaixa(ctxCamada, px, py, tema, r);
    }
    ctxCamada.setTransform(1, 0, 0, 1, 0, 0);
    ctxCamada.drawImage(vinheta, dx, dy, lado, lado, dx, dy, lado, lado);
    ctxCamada.restore();
  };

  // Returns the canvas with the static layer of this grid, redrawing only what changed.
  const atualizar = ({ g, muros: novosMuros, chaveMuros, tema: chaveTema }, novaEscala) => {
    const chave = `${novaEscala}|${chaveMuros}|${chaveTema}`;
    if (chave === chaveCamada && g === ultimaGrade) return camada;
    ultimaGrade = g;
    const novaFixa = Array.from(g, classe).join('');
    if (chave !== chaveCamada) {
      escala = novaEscala;
      tema = temaDe(chaveTema, chaveMuros);
      muros = novosMuros ?? new Set();
      if (tema !== temaDaBase || escala !== escalaDaBase) {
        desenharBase();
        temaDaBase = tema;
        escalaDaBase = escala;
      }
      camada.width = base.width;
      camada.height = base.height;
      fixa = novaFixa;
      for (let y = 0; y < LINHAS; y++) for (let x = 0; x < COLUNAS; x++) desenharCelula(x, y);
      chaveCamada = chave;
      return camada;
    }
    if (novaFixa === fixa) return camada;
    const sujas = new Set();
    for (let i = 0; i < novaFixa.length; i++) {
      if (novaFixa[i] === fixa[i]) continue;
      const x = i % COLUNAS;
      const y = Math.floor(i / COLUNAS);
      for (const [vx, vy] of [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]) {
        if (vx < COLUNAS && vy < LINHAS) sujas.add(vy * COLUNAS + vx);
      }
    }
    fixa = novaFixa;
    for (const i of sujas) desenharCelula(i % COLUNAS, Math.floor(i / COLUNAS));
    return camada;
  };

  return { atualizar, get tema() { return tema; } };
}
