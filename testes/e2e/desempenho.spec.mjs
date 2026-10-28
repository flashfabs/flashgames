// Performance with a full room: 8 players on a normal map (crates and items), the guests walking around and
// some of them dropping bombs. Frame times of the host and of one guest are measured and printed.
// The two measured players each get a browser of their own: pages of one headless Chromium share a single
// software GPU process, and with 8 pages in it the frame rate drops to ~20 fps for reasons that have nothing
// to do with the game (with 2 pages it stays at 60). The other 6 players share a third browser.

import { test, expect } from './mesa.mjs';

const JANELA_MS = 8_000;
const TECLAS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
// Generous limits: they catch a real regression (a frame loop or a simulation tick that got several times
// slower) without failing on a busy machine. The measured numbers are printed on every run.
const LIMITES = { quadroP95Ms: 40, trabalhoP95Ms: 8, tiqueP95Ms: 8 };

// Init script: times every animation frame and every timer tick (the host simulates on Web Worker ticks),
// without touching the game code.
function medir() {
  const medidas = { ativo: false, intervalos: [], trabalho: [], tiques: [], tarefasLongas: [] };
  window.__desempenho = medidas;
  const cronometrar = (lista, funcao, contexto, args) => {
    const inicio = performance.now();
    try {
      return funcao.apply(contexto, args);
    } finally {
      if (medidas.ativo) lista.push(performance.now() - inicio);
    }
  };

  const raf = window.requestAnimationFrame.bind(window);
  let anterior = null;
  window.requestAnimationFrame = callback => raf(instante => {
    if (medidas.ativo && anterior !== null) medidas.intervalos.push(instante - anterior);
    anterior = medidas.ativo ? instante : null;
    cronometrar(medidas.trabalho, callback, window, [instante]);
  });

  const WorkerOriginal = window.Worker;
  window.Worker = class extends WorkerOriginal {
    set onmessage(funcao) {
      super.onmessage = function (evento) {
        return cronometrar(medidas.tiques, funcao, this, [evento]);
      };
    }

    get onmessage() {
      return super.onmessage;
    }
  };

  try {
    new PerformanceObserver(lista => {
      if (medidas.ativo) for (const tarefa of lista.getEntries()) medidas.tarefasLongas.push(tarefa.duration);
    }).observe({ type: 'longtask' });
  } catch {
    // Long task timing is optional; frame and tick times are enough.
  }
}

function percentil(valores, p) {
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.min(ordenados.length - 1, Math.floor(ordenados.length * p))] ?? 0;
}

function resumir(medidas) {
  const arredondar = valor => Math.round(valor * 10) / 10;
  const media = medidas.intervalos.reduce((soma, valor) => soma + valor, 0) / medidas.intervalos.length;
  return {
    quadros: medidas.intervalos.length,
    fps: arredondar(1000 / media),
    quadroP50Ms: arredondar(percentil(medidas.intervalos, 0.5)),
    quadroP95Ms: arredondar(percentil(medidas.intervalos, 0.95)),
    quadroMaxMs: arredondar(Math.max(...medidas.intervalos)),
    trabalhoP50Ms: arredondar(percentil(medidas.trabalho, 0.5)),
    trabalhoP95Ms: arredondar(percentil(medidas.trabalho, 0.95)),
    trabalhoMaxMs: arredondar(Math.max(...medidas.trabalho)),
    tiques: medidas.tiques.length,
    tiqueP50Ms: arredondar(percentil(medidas.tiques, 0.5)),
    tiqueP95Ms: arredondar(percentil(medidas.tiques, 0.95)),
    tiqueMaxMs: arredondar(Math.max(0, ...medidas.tiques)),
    tarefasLongas: medidas.tarefasLongas.length,
  };
}

// Random walk with the arrow keys until the returned function is called; bomb droppers press Space every ~2 s.
function vagar(jogador, { bombas }) {
  let ativo = true;
  const rodando = (async () => {
    let tecla = null;
    let proximaBomba = performance.now() + 1000 + Math.random() * 1000;
    while (ativo) {
      const nova = TECLAS[Math.floor(Math.random() * TECLAS.length)];
      await jogador.pagina.keyboard.down(nova);
      if (tecla && tecla !== nova) await jogador.pagina.keyboard.up(tecla);
      tecla = nova;
      if (bombas && performance.now() > proximaBomba) {
        await jogador.soltarBomba();
        proximaBomba = performance.now() + 1500 + Math.random() * 1000;
      }
      await jogador.pagina.waitForTimeout(250 + Math.random() * 350);
    }
    if (tecla) await jogador.pagina.keyboard.up(tecla);
  })();
  return async () => {
    ativo = false;
    await rodando;
  };
}

test('8 players: frame times of the host and of a guest', async ({ mesa, playwright, browserName, launchOptions, headless }) => {
  const proprios = await Promise.all([0, 1].map(() => playwright[browserName].launch({ ...launchOptions, headless })));
  try {
    const nomes = ['Anfitrião', 'Bruna', 'Caio', 'Dani', 'Enzo', 'Flora', 'Gui', 'Helô'];
    const host = await mesa.novoJogador(nomes[0], { iniciar: [medir], navegador: proprios[0] });
    const { link } = await host.criarSala();
    // Guests join all at once, which also checks that the host copes with simultaneous arrivals.
    const convidados = await Promise.all(nomes.slice(1).map(async (nome, n) => {
      const jogador = await mesa.novoJogador(nome, n === 0 ? { iniciar: [medir], navegador: proprios[1] } : {});
      await jogador.entrarPeloLink(link);
      return jogador;
    }));
    const todos = [host, ...convidados];
    for (const jogador of todos) await expect(jogador.pagina.locator('#contagem-membros')).toHaveText('8/8');

    await mesa.todosProntos(todos);
    for (const jogador of todos) await jogador.esperarFase('jogo');
    const medidos = { anfitriao: host, convidado: convidados[0] };

    const paradas = convidados.map((jogador, n) => vagar(jogador, { bombas: n % 2 === 1 }));
    await host.pagina.waitForTimeout(1000);
    await Promise.all(Object.values(medidos).map(jogador => jogador.pagina.evaluate(() => {
      window.__desempenho.ativo = true;
    })));
    await host.pagina.waitForTimeout(JANELA_MS);
    const resultados = {};
    for (const [papel, jogador] of Object.entries(medidos)) {
      resultados[papel] = resumir(await jogador.pagina.evaluate(() => {
        window.__desempenho.ativo = false;
        return window.__desempenho;
      }));
    }
    for (const parar of paradas) await parar();

    const jogo = await host.jogo();
    resultados.partida = {
      fase: jogo.fase,
      vivos: jogo.vista?.j.filter(jogador => jogador.v).length ?? null,
      caixasDestruidas: jogo.vista?.j.reduce((soma, jogador) => soma + jogador.cx, 0) ?? null,
    };
    console.log(`Desempenho com 8 jogadores (${JANELA_MS / 1000} s de partida):\n${JSON.stringify(resultados, null, 2)}`);
    await test.info().attach('desempenho.json', { body: JSON.stringify(resultados, null, 2), contentType: 'application/json' });

    for (const papel of Object.keys(medidos)) {
      expect(resultados[papel].quadros, `${papel}: frames drawn`).toBeGreaterThan((JANELA_MS / 1000) * 30);
      expect(resultados[papel].quadroP95Ms, `${papel}: p95 frame interval`).toBeLessThan(LIMITES.quadroP95Ms);
      expect(resultados[papel].trabalhoP95Ms, `${papel}: p95 time spent in a frame`).toBeLessThan(LIMITES.trabalhoP95Ms);
    }
    expect(resultados.anfitriao.tiques, 'host: simulation ticks').toBeGreaterThan((JANELA_MS / 1000) * 60);
    expect(resultados.anfitriao.tiqueP95Ms, 'host: p95 time of a simulation tick').toBeLessThan(LIMITES.tiqueP95Ms);
  } finally {
    // Contexts first (the table closes them too), then the two extra browsers.
    await mesa.fechar();
    await Promise.all(proprios.map(navegador => navegador.close()));
  }
});
