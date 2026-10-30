// Automated benchmark (?bench=1&seg=N): after a warm-up the camera orbits the local player's army (its centre is
// followed smoothly) while frame intervals, CPU time per frame, sprites on screen and simulation step times are
// collected into preallocated arrays; the result, with the screen, canvas, render scale and browser it was
// measured on, lands in window.__bench and on the page.
import { FP, PASSOS_POR_SEGUNDO } from '../sim/contratos.js';

export function percentil(lista, p) {
  if (lista.length === 0) return 0;
  const ordenada = Array.from(lista).sort((a, b) => a - b);
  return ordenada[Math.min(ordenada.length - 1, Math.floor((p / 100) * ordenada.length))];
}

const AQUECIMENTO_MS = 4000; // armies reach the centre and the JIT settles
const LIMITE_LENTO_MS = 20;

export function criarMedicao({ ativa, segundos, estado, camera, canvas, render, modo, saida }) {
  // room for 250 frames per second of measurement, so collecting never allocates
  const capacidade = Math.ceil(segundos * 250);
  const quadros = new Float32Array(capacidade);
  const cpu = new Float32Array(capacidade);
  const escalas = new Float32Array(capacidade);
  const naTela = new Float32Array(capacidade);
  const centro = { x: NaN, y: NaN, tick: -1 };
  let n = 0;
  let inicioBench = 0;
  let fimBench = 0;
  let coletando = false;

  function conduzir(agora) {
    if (!ativa || !estado.mapa) return;
    if (!inicioBench) {
      inicioBench = agora + AQUECIMENTO_MS;
      fimBench = inicioBench + segundos * 1000;
    }
    seguirExercito();
    const t = (agora - inicioBench) / 1000;
    camera.x = centro.x + Math.cos(t * 0.5) * 6;
    camera.y = centro.y + Math.sin(t * 0.5) * 4;
    coletando = agora >= inicioBench && agora < fimBench;
    if (agora >= fimBench && !window.__bench) publicar();
  }

  // Centre of the local player's units, recomputed once per snapshot and eased so the orbit does not jump.
  function seguirExercito() {
    const atual = estado.atual;
    if (!atual || atual.tick === centro.tick) return;
    centro.tick = atual.tick;
    let sx = 0;
    let sy = 0;
    let m = 0;
    for (let k = 0; k < atual.n; k++) {
      if (atual.dono[k] !== estado.jogadorLocal) continue;
      sx += atual.x[k];
      sy += atual.y[k];
      m++;
    }
    if (m === 0) return;
    const x = sx / m / FP;
    const y = sy / m / FP;
    if (Number.isNaN(centro.x)) {
      centro.x = x;
      centro.y = y;
    } else {
      centro.x += (x - centro.x) * 0.05;
      centro.y += (y - centro.y) * 0.05;
    }
  }

  function publicar() {
    const q = quadros.subarray(0, n);
    const c = cpu.subarray(0, n);
    const ticks = estado.tickMs.slice(-Math.round(segundos * PASSOS_POR_SEGUNDO));
    let lentos = 0;
    let soma = 0;
    let somaEscala = 0;
    let somaNaTela = 0;
    for (let i = 0; i < n; i++) {
      if (q[i] > LIMITE_LENTO_MS) lentos++;
      soma += q[i];
      somaEscala += escalas[i];
      somaNaTela += naTela[i];
    }
    window.__bench = {
      navegador: navigator.userAgent,
      tela: `${screen.width}x${screen.height} CSS, dpr ${window.devicePixelRatio}`,
      modo,
      canvas: `${canvas.width}x${canvas.height}`,
      escalaMedia: +(somaEscala / Math.max(1, n)).toFixed(3),
      escalaFixa: render.escala.estado.fixo,
      unidades: estado.atual?.n ?? 0,
      spritesNaTelaMedio: Math.round(somaNaTela / Math.max(1, n)),
      placa: render.info.placa,
      quadros: n,
      qpsMedio: +(1000 / (soma / Math.max(1, n))).toFixed(1),
      quadroP50: +percentil(q, 50).toFixed(2),
      quadroP95: +percentil(q, 95).toFixed(2),
      quadroP99: +percentil(q, 99).toFixed(2),
      quadrosAcimaDe20ms: lentos,
      fracaoAcimaDe20ms: +(lentos / Math.max(1, n)).toFixed(4),
      cpuQuadroP50: +percentil(c, 50).toFixed(2),
      cpuQuadroP95: +percentil(c, 95).toFixed(2),
      cpuQuadroP99: +percentil(c, 99).toFixed(2),
      gpuMs: render.estatisticas.gpuMs >= 0 ? +render.estatisticas.gpuMs.toFixed(2) : null,
      passoSimP50: +percentil(ticks, 50).toFixed(2),
      passoSimP95: +percentil(ticks, 95).toFixed(2),
      atlas: Boolean(render.folhas.folha('prototipo-tanque')),
    };
    saida.hidden = false;
    saida.textContent = JSON.stringify(window.__bench, null, 2);
  }

  function registrarQuadro(dt, cpuMs) {
    if (!coletando || n >= capacidade) return;
    quadros[n] = dt;
    cpu[n] = cpuMs;
    escalas[n] = render.estatisticas.escala;
    naTela[n] = render.estatisticas.sprites;
    n++;
  }

  return { conduzir, registrarQuadro };
}
