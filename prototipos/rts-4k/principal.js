// Main thread of the 4K prototype: render resolution modes, camera and input, interpolation between
// simulation snapshots, effects, minimap, HUD and an automated benchmark (?bench=1).
import { criarRenderizador, FLOATS_UNIDADE, FLOATS_EFEITO, EFEITO } from './render.js';
import { FP, PASSOS_POR_SEGUNDO, TIPOS, NEBLINA_VISIVEL } from './simulacao.js';

const parametros = new URLSearchParams(location.search);
const opcoes = {
  unidades: Number(parametros.get('unidades') ?? 2000),
  resolucao: parametros.get('res') ?? 'nativa', // nativa | 4k | 1080p
  bench: parametros.has('bench'),
  segundos: Number(parametros.get('seg') ?? 12),
  semente: Number(parametros.get('semente') ?? 7),
  zoom: Number(parametros.get('zoom') ?? 46), // CSS pixels per cell
  atlas: parametros.get('atlas') !== '0',
  avancar: Number(parametros.get('avancar') ?? 0),
};

const canvas = document.getElementById('tela');
const palco = document.getElementById('palco');
const caixaSelecao = document.getElementById('caixa-selecao');
const minimapa = document.getElementById('minimapa');
const ctxMini = minimapa.getContext('2d');
const painel = document.getElementById('painel');
const render = criarRenderizador(canvas);

const PASSO_MS = 1000 / PASSOS_POR_SEGUNDO;
const camera = { x: 96, y: 96, zoom: 1, zoomCss: opcoes.zoom };
const estado = { mapa: null, anterior: null, atual: null, chegadaAtual: 0, tickMs: [], soma: 0, tick: 0 };
const selecionadas = new Set();
let anguloCorpo = null;
let anguloTorre = null;
let unidadesBuffer = new Float32Array(8192 * FLOATS_UNIDADE);
const efeitos = [];
const marcas = [];
const teclas = new Set();

// ---------- resolution ----------

function ajustarTamanho() {
  const cssL = palco.clientWidth;
  const cssA = palco.clientHeight;
  let largura;
  let altura;
  if (opcoes.resolucao === '4k' || opcoes.resolucao === '1080p') {
    [largura, altura] = opcoes.resolucao === '4k' ? [3840, 2160] : [1920, 1080];
    // letterbox the fixed 16:9 backing store inside the window
    const escala = Math.min(cssL / largura, cssA / altura);
    canvas.style.width = `${Math.floor(largura * escala)}px`;
    canvas.style.height = `${Math.floor(altura * escala)}px`;
  } else {
    const dpr = window.devicePixelRatio || 1;
    largura = Math.round(cssL * dpr);
    altura = Math.round(cssA * dpr);
    canvas.style.width = `${cssL}px`;
    canvas.style.height = `${cssA}px`;
  }
  canvas.width = largura;
  canvas.height = altura;
  // keep the same field of view whatever the backing resolution: zoom is defined in CSS pixels per cell
  camera.zoom = camera.zoomCss * (largura / canvas.clientWidth);
}
window.addEventListener('resize', ajustarTamanho);
ajustarTamanho();

// ---------- simulation worker ----------

const trabalhador = new Worker(new URL('./trabalhador.js', import.meta.url), { type: 'module' });
trabalhador.postMessage({ t: 'iniciar', opcoes: { semente: opcoes.semente, unidadesPorTime: opcoes.unidades >> 1, avancar: opcoes.avancar } });
trabalhador.onmessage = ({ data }) => {
  if (data.t === 'mapa') {
    estado.mapa = data;
    render.definirMapa(data.largura, data.altura, data.bloqueado, data.relevo);
    anguloCorpo = new Float32Array(data.time.length);
    anguloTorre = new Float32Array(data.time.length);
    for (let i = 0; i < data.time.length; i++) anguloCorpo[i] = anguloTorre[i] = data.time[i] === 0 ? -Math.PI / 4 : (3 * Math.PI) / 4;
    camera.x = data.bases[0].x + 14;
    camera.y = data.bases[0].y - 10;
    prepararMinimapa();
    return;
  }
  if (data.t === 'estado') {
    estado.anterior = estado.atual;
    estado.atual = data;
    estado.chegadaAtual = performance.now();
    estado.tickMs.push(data.ms);
    estado.soma = data.soma;
    estado.tick = data.tick;
    render.atualizarNeblina(data.neblina);
    registrarEventos(data);
  }
};

// ---------- optional Blender atlas ----------

async function carregarAtlas() {
  if (!opcoes.atlas) return;
  try {
    const resposta = await fetch('sprites/manifesto.json');
    if (!resposta.ok) return;
    const manifesto = await resposta.json();
    const carregar = src => new Promise((ok, erro) => {
      const imagem = new Image();
      imagem.onload = () => ok(imagem);
      imagem.onerror = () => erro(new Error(`falhou ${src}`));
      imagem.src = `sprites/${src}`;
    });
    const [cor, time] = await Promise.all([carregar(manifesto.cor), carregar(manifesto.time)]);
    render.definirAtlas(cor, time, manifesto);
    painel.dataset.atlas = `${manifesto.direcoes} direções, ${manifesto.quadro}px, Blender`;
  } catch (erro) {
    console.warn('atlas do Blender indisponível, usando formas procedurais', erro);
  }
}
carregarAtlas();

// ---------- effects ----------

function visivel(x, y) {
  const m = estado.mapa;
  const atual = estado.atual;
  if (!m || !atual) return false;
  const cx = x | 0;
  const cy = y | 0;
  if (cx < 0 || cy < 0 || cx >= m.largura || cy >= m.altura) return false;
  return atual.neblina[cy * m.largura + cx] === NEBLINA_VISIVEL;
}

function adicionarEfeito(tipo, ax, ay, bx, by, duracao, tamanho) {
  efeitos.push({ tipo, ax, ay, bx, by, inicio: performance.now(), duracao, tamanho, semente: Math.random() });
}

function registrarEventos({ eventos, x, y }) {
  for (let k = 0; k < eventos.length; k += 3) {
    const tipo = eventos[k];
    const a = eventos[k + 1];
    const b = eventos[k + 2];
    const ax = x[a] / FP;
    const ay = y[a] / FP;
    if (tipo === 1) {
      const bx = x[b] / FP;
      const by = y[b] / FP;
      if (!visivel(ax, ay) && !visivel(bx, by)) continue;
      const grande = estado.mapa.tipo[a] === 1;
      adicionarEfeito(EFEITO.TRACADO, ax, ay, bx, by, grande ? 160 : 90, 0);
      adicionarEfeito(EFEITO.CLARAO, ax, ay, 0, 0, 80, grande ? 0.32 : 0.18);
    } else if (tipo === 2) {
      if (!visivel(ax, ay)) continue;
      adicionarEfeito(EFEITO.EXPLOSAO, ax, ay, 0, 0, 650, estado.mapa.tipo[a] === 1 ? 1.1 : 0.8);
      for (let s = 0; s < 3; s++) {
        adicionarEfeito(EFEITO.FUMACA, ax + (Math.random() - 0.5) * 0.4, ay + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.6, -0.5 - Math.random() * 0.6, 1800 + Math.random() * 900, 0.6 + Math.random() * 0.5);
      }
      marcas.push({ x: ax, y: ay, inicio: performance.now(), semente: Math.random(), tamanho: 0.7 + Math.random() * 0.4 });
      if (marcas.length > 600) marcas.shift();
    }
  }
}

const decalques = new Float32Array(1024 * FLOATS_EFEITO);
let fumaca = new Float32Array(4096 * FLOATS_EFEITO);
let brilho = new Float32Array(4096 * FLOATS_EFEITO);

function montarEfeitos(agora) {
  let nD = 0;
  for (const m of marcas) {
    const idade = (agora - m.inicio) / 45000;
    if (idade >= 1 || nD >= 1000) continue;
    decalques.set([m.x, m.y, 0, 0, EFEITO.MARCA, idade, m.tamanho, m.semente], nD++ * FLOATS_EFEITO);
  }
  for (const e of efeitos) {
    if (e.tipo !== EFEITO.ORDEM) continue;
    const idade = (agora - e.inicio) / e.duracao;
    if (idade < 1) decalques.set([e.ax, e.ay, 0, 0, e.tipo, idade, e.tamanho, e.semente], nD++ * FLOATS_EFEITO);
  }
  let nF = 0;
  let nB = 0;
  let escrita = 0;
  for (const e of efeitos) {
    const idade = (agora - e.inicio) / e.duracao;
    if (idade >= 1) continue;
    efeitos[escrita++] = e;
    if (e.tipo === EFEITO.ORDEM) continue;
    const linha = [e.ax, e.ay, e.bx, e.by, e.tipo, idade, e.tamanho * (e.tipo === EFEITO.EXPLOSAO ? 0.6 + idade * 0.8 : e.tipo === EFEITO.FUMACA ? 0.7 + idade : 1), e.semente];
    if (e.tipo === EFEITO.FUMACA) {
      if ((nF + 1) * FLOATS_EFEITO > fumaca.length) fumaca = Float32Array.from({ length: fumaca.length * 2 }, (_, i) => fumaca[i] ?? 0);
      fumaca.set(linha, nF++ * FLOATS_EFEITO);
    } else {
      if ((nB + 1) * FLOATS_EFEITO > brilho.length) brilho = Float32Array.from({ length: brilho.length * 2 }, (_, i) => brilho[i] ?? 0);
      brilho.set(linha, nB++ * FLOATS_EFEITO);
    }
  }
  efeitos.length = escrita;
  return { nD, nF, nB };
}

// ---------- units: interpolation and instance data ----------

function suavizarAngulo(atual, alvo, maximo) {
  let d = alvo - atual;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return atual + Math.max(-maximo, Math.min(maximo, d));
}

function montarUnidades(agora, dt) {
  const { anterior, atual, mapa } = estado;
  if (!atual || !mapa) return 0;
  const alfa = Math.min(1, (agora - estado.chegadaAtual) / PASSO_MS);
  const total = mapa.time.length;
  if (unidadesBuffer.length < total * FLOATS_UNIDADE) unidadesBuffer = new Float32Array(total * FLOATS_UNIDADE);
  const giro = dt * 0.006;
  const margem = 2;
  const meiaL = canvas.width / camera.zoom / 2 + margem;
  const meiaA = canvas.height / camera.zoom / 2 + margem;
  let n = 0;
  for (let i = 0; i < total; i++) {
    if (atual.vida[i] <= 0) continue;
    let x = atual.x[i] / FP;
    let y = atual.y[i] / FP;
    if (anterior && anterior.vida[i] > 0) {
      const px = anterior.x[i] / FP;
      const py = anterior.y[i] / FP;
      if (Math.abs(x - px) < 3 && Math.abs(y - py) < 3) {
        const dx = x - px;
        const dy = y - py;
        if (dx * dx + dy * dy > 0.0004) anguloCorpo[i] = suavizarAngulo(anguloCorpo[i], Math.atan2(dy, dx), giro);
        x = px + dx * alfa;
        y = py + dy * alfa;
      }
    }
    const alvo = atual.alvo[i];
    const alvoTorre = alvo >= 0 ? Math.atan2(atual.y[alvo] - atual.y[i], atual.x[alvo] - atual.x[i]) : anguloCorpo[i];
    anguloTorre[i] = suavizarAngulo(anguloTorre[i], alvoTorre, giro * 1.6);
    if (Math.abs(x - camera.x) > meiaL || Math.abs(y - camera.y) > meiaA) continue;
    if (mapa.time[i] !== 0 && !visivel(x, y)) continue;
    const o = n * FLOATS_UNIDADE;
    unidadesBuffer[o] = x;
    unidadesBuffer[o + 1] = y;
    unidadesBuffer[o + 2] = anguloCorpo[i];
    unidadesBuffer[o + 3] = anguloTorre[i];
    unidadesBuffer[o + 4] = mapa.time[i];
    unidadesBuffer[o + 5] = mapa.tipo[i];
    unidadesBuffer[o + 6] = atual.vida[i] / TIPOS[mapa.tipo[i]].vida;
    unidadesBuffer[o + 7] = selecionadas.has(i) ? 1 : 0;
    n++;
  }
  return n;
}

// ---------- input ----------

function paraMundo(clienteX, clienteY) {
  const r = canvas.getBoundingClientRect();
  const escala = canvas.width / r.width;
  const px = (clienteX - r.left) * escala - canvas.width / 2;
  const py = (clienteY - r.top) * escala - canvas.height / 2;
  return { x: camera.x + px / camera.zoom, y: camera.y + py / camera.zoom };
}

let arrasto = null;
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  if (e.button === 0) {
    arrasto = { x: e.clientX, y: e.clientY, mundo: paraMundo(e.clientX, e.clientY) };
  } else if (e.button === 1) {
    arrasto = { pan: true, x: e.clientX, y: e.clientY };
  } else if (e.button === 2) {
    ordenarMovimento(paraMundo(e.clientX, e.clientY));
  }
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (!arrasto) return;
  if (arrasto.pan) {
    const escala = canvas.width / canvas.getBoundingClientRect().width;
    camera.x -= ((e.clientX - arrasto.x) * escala) / camera.zoom;
    camera.y -= ((e.clientY - arrasto.y) * escala) / camera.zoom;
    arrasto.x = e.clientX;
    arrasto.y = e.clientY;
    return;
  }
  const r = palco.getBoundingClientRect();
  Object.assign(caixaSelecao.style, {
    left: `${Math.min(arrasto.x, e.clientX) - r.left}px`,
    top: `${Math.min(arrasto.y, e.clientY) - r.top}px`,
    width: `${Math.abs(e.clientX - arrasto.x)}px`,
    height: `${Math.abs(e.clientY - arrasto.y)}px`,
  });
  caixaSelecao.hidden = Math.abs(e.clientX - arrasto.x) + Math.abs(e.clientY - arrasto.y) < 6;
});
canvas.addEventListener('pointerup', e => {
  if (!arrasto || arrasto.pan) {
    arrasto = null;
    return;
  }
  const fim = paraMundo(e.clientX, e.clientY);
  if (!e.shiftKey) selecionadas.clear();
  const { atual, mapa } = estado;
  if (atual && mapa) {
    const x0 = Math.min(arrasto.mundo.x, fim.x);
    const x1 = Math.max(arrasto.mundo.x, fim.x);
    const y0 = Math.min(arrasto.mundo.y, fim.y);
    const y1 = Math.max(arrasto.mundo.y, fim.y);
    const clique = x1 - x0 < 0.3 && y1 - y0 < 0.3;
    let melhor = -1;
    let melhorD = 0.5;
    for (let i = 0; i < mapa.time.length; i++) {
      if (mapa.time[i] !== 0 || atual.vida[i] <= 0) continue;
      const x = atual.x[i] / FP;
      const y = atual.y[i] / FP;
      if (clique) {
        const d = Math.hypot(x - fim.x, y - fim.y);
        if (d < melhorD) {
          melhorD = d;
          melhor = i;
        }
      } else if (x >= x0 && x <= x1 && y >= y0 && y <= y1) {
        selecionadas.add(i);
      }
    }
    if (melhor >= 0) selecionadas.add(melhor);
  }
  caixaSelecao.hidden = true;
  arrasto = null;
});
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const antes = paraMundo(e.clientX, e.clientY);
  camera.zoomCss = Math.max(14, Math.min(140, camera.zoomCss * Math.exp(-e.deltaY * 0.0015)));
  ajustarTamanho();
  const depois = paraMundo(e.clientX, e.clientY);
  camera.x += antes.x - depois.x;
  camera.y += antes.y - depois.y;
}, { passive: false });
window.addEventListener('keydown', e => {
  teclas.add(e.key.toLowerCase());
  if (e.key === 'f') palco.requestFullscreen?.();
  if (e.key === 'h') painel.hidden = !painel.hidden;
  if (e.key === 'p') {
    pausado = !pausado;
    trabalhador.postMessage({ t: 'pausa', valor: pausado });
  }
  if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    estado.mapa?.time.forEach((t, i) => t === 0 && estado.atual?.vida[i] > 0 && selecionadas.add(i));
  }
});
window.addEventListener('keyup', e => teclas.delete(e.key.toLowerCase()));
let pausado = false;

function ordenarMovimento(destino) {
  if (selecionadas.size === 0) return;
  trabalhador.postMessage({ t: 'comando', comando: { tipo: 'mover', time: 0, unidades: [...selecionadas], cx: destino.x | 0, cy: destino.y | 0 } });
  adicionarEfeito(EFEITO.ORDEM, destino.x, destino.y, 0, 0, 600, 0.9);
}

function moverCamera(dt) {
  const v = (dt / 1000) * 28 * (46 / camera.zoomCss);
  if (teclas.has('w') || teclas.has('arrowup')) camera.y -= v;
  if (teclas.has('s') || teclas.has('arrowdown')) camera.y += v;
  if (teclas.has('a') || teclas.has('arrowleft')) camera.x -= v;
  if (teclas.has('d') || teclas.has('arrowright')) camera.x += v;
}

// ---------- minimap ----------

const fundoMini = document.createElement('canvas');
const neblinaMini = document.createElement('canvas');
function prepararMinimapa() {
  const { largura, altura, bloqueado, relevo } = estado.mapa;
  for (const c of [fundoMini, neblinaMini]) {
    c.width = largura;
    c.height = altura;
  }
  const imagem = fundoMini.getContext('2d').createImageData(largura, altura);
  for (let i = 0; i < largura * altura; i++) {
    const v = relevo[i] / 255;
    const [r, g, b] = bloqueado[i] ? [92 + v * 40, 80 + v * 34, 70 + v * 28] : [150 + v * 40, 124 + v * 30, 88 + v * 20];
    imagem.data.set([r, g, b, 255], i * 4);
  }
  fundoMini.getContext('2d').putImageData(imagem, 0, 0);
}

let ultimoMini = 0;
function desenharMinimapa(agora) {
  if (!estado.mapa || !estado.atual || agora - ultimoMini < 150) return;
  ultimoMini = agora;
  const { largura, altura, time } = estado.mapa;
  const { neblina, x, y, vida } = estado.atual;
  const ctxN = neblinaMini.getContext('2d');
  const imagem = ctxN.createImageData(largura, altura);
  for (let i = 0; i < neblina.length; i++) imagem.data[i * 4 + 3] = neblina[i] === 255 ? 0 : neblina[i] === 128 ? 130 : 245;
  ctxN.putImageData(imagem, 0, 0);
  const escala = minimapa.width / largura;
  ctxMini.imageSmoothingEnabled = true;
  ctxMini.drawImage(fundoMini, 0, 0, minimapa.width, minimapa.height);
  ctxMini.drawImage(neblinaMini, 0, 0, minimapa.width, minimapa.height);
  for (let i = 0; i < time.length; i++) {
    if (vida[i] <= 0) continue;
    const ux = x[i] / FP;
    const uy = y[i] / FP;
    if (time[i] !== 0 && neblina[(uy | 0) * largura + (ux | 0)] !== 255) continue;
    ctxMini.fillStyle = time[i] === 0 ? '#3fd6e0' : '#f0662a';
    ctxMini.fillRect(ux * escala - 1, uy * escala - 1, 2, 2);
  }
  const meiaL = canvas.width / camera.zoom / 2;
  const meiaA = canvas.height / camera.zoom / 2;
  ctxMini.strokeStyle = '#fff';
  ctxMini.lineWidth = 1;
  ctxMini.strokeRect((camera.x - meiaL) * escala, (camera.y - meiaA) * escala, meiaL * 2 * escala, meiaA * 2 * escala);
}
minimapa.addEventListener('pointerdown', e => {
  if (!estado.mapa) return;
  const r = minimapa.getBoundingClientRect();
  camera.x = ((e.clientX - r.left) / r.width) * estado.mapa.largura;
  camera.y = ((e.clientY - r.top) / r.height) * estado.mapa.altura;
});

// ---------- measurement and HUD ----------

const medidas = { quadros: [], cpu: [], inicioBench: 0, fimBench: 0, coletando: false };

function percentil(lista, p) {
  if (lista.length === 0) return 0;
  const ordenada = [...lista].sort((a, b) => a - b);
  return ordenada[Math.min(ordenada.length - 1, Math.floor((p / 100) * ordenada.length))];
}

let ultimoHud = 0;
let quadrosHud = [];
function atualizarHud(agora, dt, cpu, nVisiveis) {
  quadrosHud.push(dt);
  if (agora - ultimoHud < 400) return;
  ultimoHud = agora;
  const media = quadrosHud.reduce((a, b) => a + b, 0) / quadrosHud.length;
  const ticks = estado.tickMs.slice(-60);
  const vivos = estado.atual ? [0, 1].map(t => estado.mapa.time.reduce((s, tt, i) => s + (tt === t && estado.atual.vida[i] > 0 ? 1 : 0), 0)) : [0, 0];
  painel.querySelector('[data-campo=fps]').textContent = `${(1000 / media).toFixed(0)} qps · ${media.toFixed(1)} ms (p95 ${percentil(quadrosHud, 95).toFixed(1)})`;
  painel.querySelector('[data-campo=cpu]').textContent = `${cpu.toFixed(2)} ms CPU no quadro`;
  painel.querySelector('[data-campo=sim]').textContent = `${percentil(ticks, 50).toFixed(2)} ms por passo (p95 ${percentil(ticks, 95).toFixed(2)}) · 30 passos/s`;
  painel.querySelector('[data-campo=res]').textContent = `${canvas.width}×${canvas.height} (${opcoes.resolucao}, dpr ${window.devicePixelRatio})`;
  painel.querySelector('[data-campo=unidades]').textContent = `${vivos[0]} × ${vivos[1]} vivas · ${nVisiveis} na tela`;
  painel.querySelector('[data-campo=soma]').textContent = `passo ${estado.tick} · soma ${estado.soma.toString(16).padStart(8, '0')}`;
  painel.querySelector('[data-campo=placa]').textContent = `${render.info.placa}${painel.dataset.atlas ? ` · atlas: ${painel.dataset.atlas}` : ''}`;
  quadrosHud = [];
}

function conduzirBench(agora) {
  if (!opcoes.bench || !estado.mapa) return;
  if (!medidas.inicioBench) {
    medidas.inicioBench = agora + 4000; // warm-up: armies reach the centre and the JIT settles
    medidas.fimBench = medidas.inicioBench + opcoes.segundos * 1000;
  }
  const t = (agora - medidas.inicioBench) / 1000;
  const centroX = estado.mapa.largura / 2;
  const centroY = estado.mapa.altura / 2;
  camera.x = centroX + Math.cos(t * 0.5) * 10;
  camera.y = centroY + Math.sin(t * 0.5) * 7;
  medidas.coletando = agora >= medidas.inicioBench && agora < medidas.fimBench;
  if (agora >= medidas.fimBench && !window.__bench) {
    const q = medidas.quadros;
    const ticks = estado.tickMs.slice(-Math.round(opcoes.segundos * PASSOS_POR_SEGUNDO));
    window.__bench = {
      resolucao: `${canvas.width}x${canvas.height}`,
      unidades: estado.mapa.time.length,
      placa: render.info.placa,
      quadros: q.length,
      qpsMedio: +(1000 / (q.reduce((a, b) => a + b, 0) / q.length)).toFixed(1),
      quadroP50: +percentil(q, 50).toFixed(2),
      quadroP95: +percentil(q, 95).toFixed(2),
      quadroP99: +percentil(q, 99).toFixed(2),
      quadrosAcimaDe20ms: q.filter(v => v > 20).length,
      cpuQuadroP50: +percentil(medidas.cpu, 50).toFixed(2),
      cpuQuadroP95: +percentil(medidas.cpu, 95).toFixed(2),
      passoSimP50: +percentil(ticks, 50).toFixed(2),
      passoSimP95: +percentil(ticks, 95).toFixed(2),
      atlas: Boolean(painel.dataset.atlas),
    };
    const saida = document.getElementById('resultado');
    saida.hidden = false;
    saida.textContent = JSON.stringify(window.__bench, null, 2);
  }
}

// ---------- frame loop ----------

let ultimo = performance.now();
function quadro(agora) {
  const dt = Math.min(100, agora - ultimo);
  ultimo = agora;
  const inicio = performance.now();
  moverCamera(dt);
  conduzirBench(agora);
  const nUnidades = montarUnidades(agora, dt);
  const { nD, nF, nB } = montarEfeitos(agora);
  render.desenhar({
    camera,
    unidades: unidadesBuffer,
    nUnidades,
    decalques,
    nDecalques: nD,
    fumaca,
    nFumaca: nF,
    brilho,
    nBrilho: nB,
    tempo: agora / 1000,
  });
  desenharMinimapa(agora);
  const cpu = performance.now() - inicio;
  if (medidas.coletando) {
    medidas.quadros.push(dt);
    medidas.cpu.push(cpu);
  }
  atualizarHud(agora, dt, cpu, nUnidades);
  requestAnimationFrame(quadro);
}
requestAnimationFrame(quadro);

window.__prototipo = { camera, estado, opcoes, info: render.info };
