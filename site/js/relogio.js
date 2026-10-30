// Timers backed by a Web Worker: page timers get throttled in background tabs, worker timers much less.
// The host keeps simulating even if its tab is not in front.

export function criarTique(intervaloMs, aoTique) {
  try {
    const codigo = `setInterval(() => postMessage(0), ${Math.max(1, Math.round(intervaloMs))});`;
    const url = URL.createObjectURL(new Blob([codigo], { type: 'text/javascript' }));
    const worker = new Worker(url);
    worker.onmessage = () => aoTique();
    return {
      parar() {
        worker.terminate();
        URL.revokeObjectURL(url);
      },
    };
  } catch (erro) {
    console.warn('Worker timer unavailable, falling back to setInterval', erro);
    const id = setInterval(aoTique, intervaloMs);
    return { parar: () => clearInterval(id) };
  }
}

// Calls aoPasso(dt) at a fixed rate. Work is capped per wakeup, but elapsed time is retained for later wakeups.
export function criarPassoFixo(hz, aoPasso, { agora = () => performance.now(), criarTimer = criarTique } = {}) {
  const passo = 1 / hz;
  const maxPassosPorTique = 15;
  let ultimo = agora();
  let acumulado = 0;
  return criarTimer(500 / hz, () => {
    const instante = agora();
    acumulado += Math.max(0, (instante - ultimo) / 1000);
    ultimo = instante;
    let passos = 0;
    while (acumulado + 1e-9 >= passo && passos < maxPassosPorTique) {
      acumulado -= passo;
      passos++;
      aoPasso(passo);
    }
  });
}
