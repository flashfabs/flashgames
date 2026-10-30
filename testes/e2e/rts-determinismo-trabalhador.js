// Module Worker for rts-determinismo.spec.mjs: runs a match the way the game does, inside a Worker, and answers with its checksums.
// { tipo: 'roteiro' } runs the prototype's scripted match; { tipo: 'replay', replay } runs a golden replay through the engine's executarReplay.
self.onmessage = async ({ data }) => {
  try {
    if (data.tipo === 'roteiro') {
      const { executarRoteiro } = await import('/prototipos/rts-4k/roteiro-determinismo.js');
      const { somas, final } = executarRoteiro(() => performance.now());
      self.postMessage({ somas, final });
    } else if (data.tipo === 'replay') {
      const { executarReplay } = await import('/site/rts/js/sim/replay.js');
      const { somas, final } = executarReplay(data.replay);
      self.postMessage({ somas, final });
    } else {
      throw new Error(`unknown request ${data.tipo}`);
    }
  } catch (erro) {
    self.postMessage({ erro: String(erro?.stack ?? erro) });
  }
};
