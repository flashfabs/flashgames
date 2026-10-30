// Dynamic render scale in steps (100, 85, 75, 67, 50%) with hysteresis, driven by the frame interval.
//
// Frame intervals are quantised by vsync, so "fast enough to go up" cannot be read from them; instead the
// controller steps down after 2 s in which more than 10% of the frames blew the budget, and probes one step
// up after a calm stretch (5 s at first). A probe that fails within its 2 s window steps back down and
// doubles the wait before the next probe, up to 80 s; a probe that survives resets the wait to 5 s.
// When the GPU time of a frame is known (timer queries), it also has to fit in 70% of the budget, scaled
// by the pixel count of the next step, before a probe is tried.

export const DEGRAUS = Object.freeze([1, 0.85, 0.75, 0.67, 0.5]);

const JANELA_MS = 2000;
const FRACAO_ESTOURO = 0.1;
const CALMA_INICIAL_MS = 5000;
const CALMA_MAXIMA_MS = 80000;
const PROVA_MS = 2000;
const CAPACIDADE = 512;

/**
 * @param {{ orcamentoMs?: number, degrauInicial?: number }} [opcoes]
 */
export function criarControleDeEscala(opcoes = {}) {
  // a frame counts as blown when it takes more than 1.2 budgets, i.e. vsync missed at the target rate
  let orcamento = opcoes.orcamentoMs ?? 1000 / 60;
  const intervalos = new Float32Array(CAPACIDADE);
  const instantes = new Float64Array(CAPACIDADE);
  let inicio = 0;
  let quantidade = 0;
  let inicioJanela = NaN;
  let degrau = opcoes.degrauInicial ?? 0;
  let fixo = false;
  let ultimaMudanca = -Infinity;
  let calma = CALMA_INICIAL_MS;
  let provando = false;
  let gpuMs = -1;

  function limparJanela() {
    inicio = 0;
    quantidade = 0;
    inicioJanela = NaN;
  }

  function mudar(novo, agora) {
    degrau = novo;
    ultimaMudanca = agora;
    limparJanela();
  }

  /**
   * Records one frame and returns the scale to use for the next one.
   * @param {number} agora timestamp in ms
   * @param {number} intervaloMs time since the previous frame
   */
  function registrar(agora, intervaloMs) {
    if (Number.isNaN(inicioJanela)) inicioJanela = agora;
    const fim = (inicio + quantidade) % CAPACIDADE;
    intervalos[fim] = intervaloMs;
    instantes[fim] = agora;
    if (quantidade < CAPACIDADE) quantidade++;
    else inicio = (inicio + 1) % CAPACIDADE;
    while (quantidade > 0 && agora - instantes[inicio] > JANELA_MS) {
      inicio = (inicio + 1) % CAPACIDADE;
      quantidade--;
    }
    if (fixo) return DEGRAUS[degrau];

    const desdeMudanca = agora - ultimaMudanca;
    const janelaCheia = agora - inicioJanela >= JANELA_MS;
    if (janelaCheia || (provando && desdeMudanca >= 250)) {
      let estouros = 0;
      const limite = orcamento * 1.2;
      for (let k = 0; k < quantidade; k++) if (intervalos[(inicio + k) % CAPACIDADE] > limite) estouros++;
      if (estouros > quantidade * FRACAO_ESTOURO && (janelaCheia || estouros >= 6)) {
        if (provando) calma = Math.min(CALMA_MAXIMA_MS, calma * 2);
        provando = false;
        if (degrau < DEGRAUS.length - 1) mudar(degrau + 1, agora);
        else limparJanela();
        return DEGRAUS[degrau];
      }
    }
    if (provando && desdeMudanca >= PROVA_MS) {
      provando = false;
      calma = CALMA_INICIAL_MS;
    }
    if (!provando && degrau > 0 && desdeMudanca >= calma && cabeNoProximo()) {
      provando = true;
      mudar(degrau - 1, agora);
    }
    return DEGRAUS[degrau];
  }

  function cabeNoProximo() {
    if (gpuMs < 0) return true;
    const razaoPixels = (DEGRAUS[degrau - 1] / DEGRAUS[degrau]) ** 2;
    return gpuMs * razaoPixels < orcamento * 0.7;
  }

  return {
    registrar,
    /** Latest GPU time of a frame in ms, when timer queries exist; negative means unknown. */
    informarGpu(ms) {
      gpuMs = ms;
    },
    definirOrcamento(ms) {
      orcamento = ms;
    },
    /** Pins the scale (options menu, benchmarks); pass null to go back to automatic. */
    fixar(valor) {
      if (valor === null) {
        fixo = false;
        return;
      }
      const indice = DEGRAUS.indexOf(valor);
      if (indice < 0) throw new Error(`escala fora dos degraus: ${valor}`);
      fixo = true;
      degrau = indice;
      limparJanela();
    },
    get escala() {
      return DEGRAUS[degrau];
    },
    get estado() {
      return { escala: DEGRAUS[degrau], fixo, provando, calmaMs: calma, orcamentoMs: orcamento };
    },
  };
}
