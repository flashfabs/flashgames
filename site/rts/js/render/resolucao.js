// Backing resolution of the game canvas. Native mode: CSS size times devicePixelRatio, capped at the pixel count
// of 3840x2160 (keeping the aspect), and recomputed when the window, the stage or the DPR changes (moving the
// window to another screen, page zoom). Fixed modes 4k and 1080p letterbox a 16:9 backing store in the window,
// for measuring a given resolution on any screen.

export const TETO_PIXELS = 3840 * 2160;
const FIXOS = { '4k': [3840, 2160], '1080p': [1920, 1080] };

/**
 * Device-pixel size of the canvas for a CSS box, capped by pixel count.
 * @param {number} cssLargura
 * @param {number} cssAltura
 * @param {number} dpr
 * @param {number} [teto]
 */
export function tamanhoNativo(cssLargura, cssAltura, dpr, teto = TETO_PIXELS) {
  let largura = Math.max(1, Math.round(cssLargura * dpr));
  let altura = Math.max(1, Math.round(cssAltura * dpr));
  if (largura * altura > teto) {
    const k = Math.sqrt(teto / (largura * altura));
    largura = Math.floor(largura * k);
    altura = Math.floor(altura * k);
  }
  return [largura, altura];
}

/**
 * Keeps the canvas backing size right and tells the renderer.
 * @param {{ canvas: HTMLCanvasElement, palco: HTMLElement, modo: string, aoMudar: (largura: number, altura: number) => void }} p
 */
export function criarResolucao({ canvas, palco, modo, aoMudar }) {
  let consulta = null;

  function ajustarTamanho() {
    const cssL = palco.clientWidth;
    const cssA = palco.clientHeight;
    let largura;
    let altura;
    if (FIXOS[modo]) {
      [largura, altura] = FIXOS[modo];
      const escala = Math.min(cssL / largura, cssA / altura);
      canvas.style.width = `${Math.floor(largura * escala)}px`;
      canvas.style.height = `${Math.floor(altura * escala)}px`;
    } else {
      [largura, altura] = tamanhoNativo(cssL, cssA, window.devicePixelRatio || 1);
      canvas.style.width = `${cssL}px`;
      canvas.style.height = `${cssA}px`;
    }
    aoMudar(largura, altura);
  }

  // There is no DPR change event: watch a media query for the current value and re-arm it after each change.
  function vigiarDpr() {
    consulta?.removeEventListener('change', aoMudarDpr);
    consulta = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    consulta.addEventListener('change', aoMudarDpr);
  }

  function aoMudarDpr() {
    vigiarDpr();
    ajustarTamanho();
  }

  new ResizeObserver(ajustarTamanho).observe(palco);
  vigiarDpr();
  ajustarTamanho();
  return { ajustarTamanho };
}
