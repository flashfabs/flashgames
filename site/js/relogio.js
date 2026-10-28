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

// Calls aoPasso(dt) at a fixed rate, catching up on late ticks (capped so a long stall does not explode).
export function criarPassoFixo(hz, aoPasso) {
  const passo = 1 / hz;
  let ultimo = performance.now();
  let acumulado = 0;
  return criarTique(500 / hz, () => {
    const agora = performance.now();
    acumulado += Math.min((agora - ultimo) / 1000, 0.25);
    ultimo = agora;
    while (acumulado >= passo) {
      acumulado -= passo;
      aoPasso(passo);
    }
  });
}
