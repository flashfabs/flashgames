// Automated benchmark (?bench=1&seg=N): after a warm-up the camera orbits the local player's army (its centre is
// followed smoothly) while frame intervals, CPU time per frame, GPU time per frame (where the timer query is
// exposed), sprites on screen and simulation step times are collected into preallocated arrays; the result, with the
// screen, canvas, render scale, terrain mode and browser it was measured on, lands in window.__bench and on the page.
// With &predios=N the battle gets N still buildings of a match around it (offices, garages, poles with cables, some
// under construction) and with &tropas=N N still units, both drawn through the same path as the simulation's (in a
// mission, ?partida=, of the mission's own kinds), so a mission can be measured with 2,000 units on screen; with
// &kit=<phase> every sprite asset of that phase in the art index is loaded first, so mibTexturas can be checked
// against the art budget.
import { FP, PASSOS_POR_SEGUNDO, MAX_SLOTS, BANDEIRA, CATEGORIA, idDe } from '../sim/contratos.js';

// Kinds of the benchmark: the prototype's two units keep kinds 0 and 1, then buildings of a match.
const TIPOS_BANCADA = [
  { nome: 'veiculo-leve', categoria: CATEGORIA.UNIDADE, asset: '', pegada: [1, 1], lotacao: 1 },
  { nome: 'tanque', categoria: CATEGORIA.UNIDADE, asset: '', pegada: [1, 1], lotacao: 2 },
  { nome: 'escritorio-regional', categoria: CATEGORIA.PREDIO, asset: 'religadores-construcao-escritorio-regional', pegada: [4, 3] },
  { nome: 'poste', categoria: CATEGORIA.PREDIO, asset: '', pegada: [1, 1] },
  { nome: 'garagem', categoria: CATEGORIA.PREDIO, asset: '', pegada: [3, 3] },
  { nome: 'almoxarifado', categoria: CATEGORIA.PREDIO, asset: '', pegada: [3, 2] },
  { nome: 'torre-de-holofote', categoria: CATEGORIA.PREDIO, asset: '', pegada: [2, 2] },
  { nome: 'cata-vento', categoria: CATEGORIA.PREDIO, asset: '', pegada: [1, 1] },
  { nome: 'pilha', categoria: CATEGORIA.RECURSO, asset: '', pegada: [2, 2] },
];

function camposDeExtras(n) {
  return { n, id: new Int32Array(n), tipo: new Uint16Array(n), dono: new Uint8Array(n), x: new Int32Array(n), y: new Int32Array(n), dirCorpo: new Uint8Array(n), dirTorre: new Uint8Array(n), inicioAnim: new Int32Array(n), vida: new Uint8Array(n).fill(255), bandeiras: new Uint16Array(n), progresso: new Uint8Array(n).fill(255), ligacao: new Int32Array(n).fill(-1) };
}

/**
 * Still units on a grid around (cx, cy), cycling through the unit kinds, facing every way; slots below the
 * benchmark buildings'.
 */
export function tropasDeBancada(n, cx, cy, dono, tipos = TIPOS_BANCADA, primeiroSlot = MAX_SLOTS - 1024) {
  const campos = camposDeExtras(n);
  const unidades = tipos.map((t, i) => i).filter(i => tipos[i].categoria === CATEGORIA.UNIDADE);
  const lado = Math.ceil(Math.sqrt(n));
  for (let k = 0; k < n; k++) {
    campos.id[k] = idDe(primeiroSlot - 1 - k, 1);
    campos.tipo[k] = unidades.length ? unidades[k % unidades.length] : 0;
    campos.dono[k] = dono;
    campos.x[k] = Math.round((cx + ((k % lado) - lado / 2) * 0.8) * FP);
    campos.y[k] = Math.round((cy + (Math.floor(k / lado) - lado / 2) * 0.8) * FP);
    campos.dirCorpo[k] = (k * 37) & 255;
    campos.dirTorre[k] = (k * 53) & 255;
  }
  return campos;
}

/** One snapshot-like source out of two (allocated once, when the benchmark starts). */
export function juntarExtras(a, b) {
  if (!a) return b;
  if (!b) return a;
  const campos = camposDeExtras(a.n + b.n);
  for (const nome of Object.keys(campos)) {
    if (nome === 'n') continue;
    campos[nome].set(a[nome], 0);
    campos[nome].set(b[nome], a.n);
  }
  return campos;
}

/**
 * Still buildings on a grid ring around (cx, cy), in the snapshot's layout: every other one a pole, poles chained by
 * cables, one in five under construction. Slots from the top of the range, so they never meet the simulation's.
 */
export function prediosDeBancada(n, cx, cy, dono, tipos = TIPOS_BANCADA) {
  const campos = camposDeExtras(n);
  // a pole every other building, the others cycling through the building kinds
  const poste = Math.max(0, tipos.findIndex(t => t.nome === 'poste'));
  const outros = tipos.map((t, i) => i).filter(i => i !== poste && tipos[i].categoria === CATEGORIA.PREDIO);
  let posteAnterior = -1;
  for (let k = 0; k < n; k++) {
    const anel = 1 + Math.floor(k / 12);
    const angulo = ((k % 12) / 12) * 2 * Math.PI + anel * 0.4;
    const raio = 5 + anel * 4.5;
    campos.id[k] = idDe(MAX_SLOTS - 1 - k, 1);
    campos.tipo[k] = k % 2 === 0 || outros.length === 0 ? poste : outros[(k >> 1) % outros.length];
    campos.dono[k] = tipos[campos.tipo[k]].categoria === CATEGORIA.RECURSO ? 255 : dono;
    campos.x[k] = Math.round((cx + Math.cos(angulo) * raio) * FP);
    campos.y[k] = Math.round((cy + Math.sin(angulo) * raio) * FP);
    campos.bandeiras[k] = BANDEIRA.ENERGIZADO;
    if (k % 5 === 4) {
      campos.bandeiras[k] |= BANDEIRA.EM_OBRA;
      campos.progresso[k] = 40 + ((k * 37) % 200);
    }
    if (campos.tipo[k] === poste) {
      if (posteAnterior >= 0) campos.ligacao[k] = campos.id[posteAnterior];
      posteAnterior = k;
    } else if (posteAnterior >= 0) campos.ligacao[k] = campos.id[posteAnterior];
  }
  return campos;
}

export function percentil(lista, p) {
  if (lista.length === 0) return 0;
  const ordenada = Array.from(lista).sort((a, b) => a - b);
  return ordenada[Math.min(ordenada.length - 1, Math.floor((p / 100) * ordenada.length))];
}

const AQUECIMENTO_MS = 4000; // armies reach the centre and the JIT settles
const LIMITE_LENTO_MS = 20;

export function criarMedicao({ ativa, segundos, estado, camera, canvas, render, modo, saida }) {
  const parametros = new URLSearchParams(location.search);
  const predios = ativa ? Number(parametros.get('predios') ?? 0) : 0;
  const tropas = ativa ? Number(parametros.get('tropas') ?? 0) : 0;
  const kit = ativa ? parametros.get('kit') : null;
  let assetsDoKit = 0;
  if (kit) render.carregarFase(kit).then(n => (assetsDoKit = n));
  // room for 1000 frames per second of measurement (an uncapped frame rate), so collecting never allocates
  const capacidade = Math.ceil(segundos * 1000);
  const quadros = new Float32Array(capacidade);
  const cpu = new Float32Array(capacidade);
  const gpu = new Float32Array(capacidade);
  let nGpu = 0;
  const escalas = new Float32Array(capacidade);
  const naTela = new Float32Array(capacidade);
  const centro = { x: NaN, y: NaN, tick: -1 };
  let n = 0;
  let inicioBench = 0;
  let fimBench = 0;
  let coletando = false;
  let ultimoGpu = -1;

  function conduzir(agora) {
    if (!ativa || !estado.mapa) return;
    if (!inicioBench) {
      inicioBench = agora + AQUECIMENTO_MS;
      fimBench = inicioBench + segundos * 1000;
      // the prototype's armies have no buildings: the benchmark brings its own kinds; a mission keeps its kinds
      if ((predios > 0 || tropas > 0) && !estado.mapa.tipos?.some(t => t.categoria === CATEGORIA.PREDIO)) render.definirTipos(TIPOS_BANCADA);
    }
    seguirExercito();
    if ((predios > 0 || tropas > 0) && !estado.extras && !Number.isNaN(centro.x)) {
      const tipos = estado.mapa.tipos?.some(t => t.categoria === CATEGORIA.PREDIO) ? estado.mapa.tipos : TIPOS_BANCADA;
      const p = predios > 0 ? prediosDeBancada(predios, centro.x, centro.y, estado.jogadorLocal, tipos) : null;
      const t = tropas > 0 ? tropasDeBancada(tropas, centro.x, centro.y, estado.jogadorLocal, tipos) : null;
      estado.extras = juntarExtras(p, t);
    }
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
    const g = gpu.subarray(0, nGpu);
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
      unidades: (estado.atual?.n ?? 0) + tropas,
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
      gpuP50: nGpu > 0 ? +percentil(g, 50).toFixed(2) : null,
      gpuP95: nGpu > 0 ? +percentil(g, 95).toFixed(2) : null,
      terreno: render.modoTerreno,
      mibTexturas: +(render.estatisticas.bytesTexturas / 1048576).toFixed(1),
      kit: kit ? { fase: kit, assets: assetsDoKit } : null,
      predios,
      tropas,
      mapa: `${estado.mapa.largura}x${estado.mapa.altura}`,
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
    // the timer query answers a few frames late and only once per finished query; keep each new answer once
    const gpuMs = render.estatisticas.gpuMs;
    if (gpuMs >= 0 && gpuMs !== ultimoGpu) {
      ultimoGpu = gpuMs;
      gpu[nGpu++] = gpuMs;
    }
    escalas[n] = render.estatisticas.escala;
    naTela[n] = render.estatisticas.sprites;
    n++;
  }

  return { conduzir, registrarQuadro };
}
