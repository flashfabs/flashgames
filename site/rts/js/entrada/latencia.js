// Click-to-marker latency, the measure behind "the click answers at once" (under 100 ms): from the input event's
// timeStamp, on the same clock as performance.now(), to the end of the first frame that draws the answer.
// The browser still has to composite that frame, so the real figure is up to one display refresh longer.

export const META_LATENCIA_MS = 100;

export function criarMedidorDeLatencia(maximo = 200) {
  const pendentes = [];
  const amostras = [];

  return {
    /** Remembers an input that must show an answer on screen; called from the event handler. */
    anotar(timeStamp, rotulo) {
      pendentes.push({ timeStamp, rotulo });
    },
    /** Closes every pending input at the end of a drawn frame. */
    aoDesenhar(fimDoQuadro) {
      for (const { timeStamp, rotulo } of pendentes) {
        amostras.push({ ms: fimDoQuadro - timeStamp, rotulo });
        if (amostras.length > maximo) amostras.shift();
      }
      pendentes.length = 0;
    },
    resumo() {
      const lista = amostras.map(amostra => amostra.ms).sort((a, b) => a - b);
      const em = p => (lista.length ? lista[Math.min(lista.length - 1, Math.floor(p * lista.length))] : 0);
      return { n: lista.length, p50: em(0.5), p95: em(0.95), maximo: lista.at(-1) ?? 0, acimaDaMeta: lista.filter(ms => ms > META_LATENCIA_MS).length };
    },
    amostras: () => amostras.slice(),
  };
}
