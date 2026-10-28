// Performance with a full room: 8 players on a normal map (crates and items), the guests walking around and
// some of them dropping bombs. Frame times of the host and of one guest are measured and printed.
// This project runs with the Mac's GPU (see playwright.config.mjs) and the measured pages at an iPad's pixel
// density: in software rendering, canvas cost grows with the pixel count and says nothing about a tablet.
// The two measured players each get a browser of their own, so the other pages do not share their GPU process;
// the other 6 players share a third browser.

import { test, expect } from './mesa.mjs';

const JANELA_MS = 8_000;
const TECLAS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
// Generous limits: they catch a real regression (a frame loop or a simulation tick that got several times
// slower) without failing on a busy machine. The measured numbers are printed on every run.
const LIMITES = {
  normal: { fpsMin: 30, quadroP95Ms: 40, trabalhoP95Ms: 8, tiqueP95Ms: 8 },
  cpu4x: { fpsMin: 20, quadroP95Ms: 60, trabalhoP95Ms: 16, tiqueP95Ms: 16 },
};
// The second window runs with the CPU this many times slower (Chrome DevTools throttling), roughly a tablet.
const LENTIDAO_CPU = 4;
// Measured pages look like an iPad in landscape: twice the pixel density (SALINHA_DENSIDADE changes it), so the
// canvas costs what it costs there.
const TELA_MEDIDA = { viewport: { width: 1180, height: 820 }, deviceScaleFactor: Number(process.env.SALINHA_DENSIDADE ?? 2) };

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

  // Several loops may share a frame (the game and the animated portraits): callbacks with the same timestamp are
  // one frame, and their work is added up.
  const raf = window.requestAnimationFrame.bind(window);
  let quadro = null; // { instante, trabalho } of the frame being run
  window.requestAnimationFrame = callback => raf(instante => {
    const inicio = performance.now();
    try {
      return callback(instante);
    } finally {
      const gasto = performance.now() - inicio;
      if (!medidas.ativo) {
        quadro = null;
      } else if (quadro?.instante === instante) {
        quadro.trabalho += gasto;
      } else {
        if (quadro) {
          medidas.intervalos.push(instante - quadro.instante);
          medidas.trabalho.push(quadro.trabalho);
        }
        quadro = { instante, trabalho: gasto };
      }
    }
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

// Measures every player in `medidos` at the same time for one window.
async function medirJanela(medidos) {
  const paginas = Object.values(medidos).map(jogador => jogador.pagina);
  await Promise.all(paginas.map(pagina => pagina.evaluate(() => {
    Object.assign(window.__desempenho, { ativo: true, intervalos: [], trabalho: [], tiques: [], tarefasLongas: [] });
  })));
  await paginas[0].waitForTimeout(JANELA_MS);
  const resultado = {};
  for (const [papel, jogador] of Object.entries(medidos)) {
    resultado[papel] = resumir(await jogador.pagina.evaluate(() => {
      window.__desempenho.ativo = false;
      return window.__desempenho;
    }));
  }
  return resultado;
}

test('8 players: frame times of the host and of a guest, normal and with a 4x slower CPU', async ({ mesa, playwright, browserName, launchOptions, headless }) => {
  test.setTimeout(240_000);
  const proprios = await Promise.all([0, 1].map(() => playwright[browserName].launch({ ...launchOptions, headless })));
  try {
    const nomes = ['Anfitrião', 'Bruna', 'Caio', 'Dani', 'Enzo', 'Flora', 'Gui', 'Helô'];
    const host = await mesa.novoJogador(nomes[0], { iniciar: [medir], navegador: proprios[0], contexto: TELA_MEDIDA });
    const { link } = await host.criarSala();
    // Guests join all at once, which also checks that the host copes with simultaneous arrivals.
    const convidados = await Promise.all(nomes.slice(1).map(async (nome, n) => {
      const jogador = await mesa.novoJogador(nome, n === 0 ? { iniciar: [medir], navegador: proprios[1], contexto: TELA_MEDIDA } : {});
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
    const resultados = { normal: await medirJanela(medidos) };
    for (const jogador of Object.values(medidos)) {
      const cdp = await jogador.contexto.newCDPSession(jogador.pagina);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: LENTIDAO_CPU });
    }
    resultados.cpu4x = await medirJanela(medidos);
    for (const parar of paradas) await parar();

    const jogo = await host.jogo();
    resultados.partida = {
      fase: jogo.fase,
      vivos: jogo.vista?.j.filter(jogador => jogador.v).length ?? null,
      caixasDestruidas: jogo.vista?.j.reduce((soma, jogador) => soma + jogador.cx, 0) ?? null,
    };
    console.log(`Desempenho com 8 jogadores (${JANELA_MS / 1000} s por janela, normal e com a CPU ${LENTIDAO_CPU}x mais lenta):\n${JSON.stringify(resultados, null, 2)}`);
    await test.info().attach('desempenho.json', { body: JSON.stringify(resultados, null, 2), contentType: 'application/json' });

    for (const [janela, limites] of Object.entries(LIMITES)) {
      for (const papel of Object.keys(medidos)) {
        const medida = resultados[janela][papel];
        expect(medida.quadros, `${janela}, ${papel}: frames drawn`).toBeGreaterThan((JANELA_MS / 1000) * limites.fpsMin);
        expect(medida.quadroP95Ms, `${janela}, ${papel}: p95 frame interval`).toBeLessThan(limites.quadroP95Ms);
        expect(medida.trabalhoP95Ms, `${janela}, ${papel}: p95 time spent in a frame`).toBeLessThan(limites.trabalhoP95Ms);
      }
      expect(resultados[janela].anfitriao.tiques, `${janela}, host: simulation ticks`).toBeGreaterThan((JANELA_MS / 1000) * 60);
      expect(resultados[janela].anfitriao.tiqueP95Ms, `${janela}, host: p95 time of a simulation tick`).toBeLessThan(limites.tiqueP95Ms);
    }

    // The room is full: a ninth person is turned away with an explanation and stays on the home screen.
    const nono = await mesa.novoJogador('Ivo');
    const endereco = new URL(link);
    endereco.search = '?teste=1';
    await nono.pagina.goto(endereco.toString());
    await nono.pagina.getByRole('button', { name: 'Entrar na sala' }).click();
    await expect(nono.pagina.locator('#mensagem-inicio')).toContainText(/cheia/i, { timeout: 25_000 });
    await expect(nono.pagina.locator('#sala')).toBeHidden();
    await expect(host.pagina.locator('#contagem-membros')).toHaveText('8/8');
  } finally {
    // Contexts first (the table closes them too), then the two extra browsers.
    await mesa.fechar();
    await Promise.all(proprios.map(navegador => navegador.close()));
  }
});

// Robots run inside the host's simulation, so a host alone with 7 hard robots is the heaviest host there is.
test('host with 7 hard robots: frame and simulation times, normal and with a 4x slower CPU', async ({ mesa }) => {
  const host = await mesa.novoJogador('Anfitrião', { iniciar: [medir], contexto: TELA_MEDIDA });
  await host.criarSala();
  const lobby = host.pagina.locator('.pavio-aviso');
  await lobby.getByRole('button', { name: 'Difícil', exact: true }).click();
  for (let n = 0; n < 7; n++) await lobby.getByRole('button', { name: '+ Robô' }).click();
  await expect(lobby.locator('.pavio-prontos-robo')).toHaveCount(7);
  await expect(lobby.getByRole('button', { name: '+ Robô' })).toBeDisabled();
  await host.ficarPronto();
  await host.esperarFase('jogo');
  expect((await host.jogo()).escalacao).toHaveLength(8);

  const medidos = { anfitriao: host };
  await host.pagina.waitForTimeout(1000);
  const resultados = { normal: await medirJanela(medidos) };
  const cdp = await host.contexto.newCDPSession(host.pagina);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: LENTIDAO_CPU });
  resultados.cpu4x = await medirJanela(medidos);
  const jogo = await host.jogo();
  resultados.partida = { fase: jogo.fase, numero: jogo.numero, vivos: jogo.vista?.j.filter(jogador => jogador.v).length ?? null };
  console.log(`Anfitrião com 7 robôs difíceis (${JANELA_MS / 1000} s por janela, normal e com a CPU ${LENTIDAO_CPU}x mais lenta):\n${JSON.stringify(resultados, null, 2)}`);
  await test.info().attach('desempenho-robos.json', { body: JSON.stringify(resultados, null, 2), contentType: 'application/json' });

  for (const [janela, limites] of Object.entries(LIMITES)) {
    const medida = resultados[janela].anfitriao;
    expect(medida.quadros, `${janela}: frames drawn`).toBeGreaterThan((JANELA_MS / 1000) * limites.fpsMin);
    expect(medida.quadroP95Ms, `${janela}: p95 frame interval`).toBeLessThan(limites.quadroP95Ms);
    expect(medida.trabalhoP95Ms, `${janela}: p95 time spent in a frame`).toBeLessThan(limites.trabalhoP95Ms);
    expect(medida.tiqueP95Ms, `${janela}: p95 time of a simulation tick with the robots`).toBeLessThan(limites.tiqueP95Ms);
  }
});
