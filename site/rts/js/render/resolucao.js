// Backing resolution of the game canvas: native (CSS size times DPR) or a fixed 16:9 4K or 1080p letterboxed in the
// window; the camera zoom follows so the field of view stays the same whatever the backing resolution.

export function criarResolucao({ canvas, palco, camera, resolucao }) {
  function ajustarTamanho() {
    const cssL = palco.clientWidth;
    const cssA = palco.clientHeight;
    let largura;
    let altura;
    if (resolucao === '4k' || resolucao === '1080p') {
      [largura, altura] = resolucao === '4k' ? [3840, 2160] : [1920, 1080];
      // letterbox the fixed 16:9 backing store inside the window
      const escala = Math.min(cssL / largura, cssA / altura);
      canvas.style.width = `${Math.floor(largura * escala)}px`;
      canvas.style.height = `${Math.floor(altura * escala)}px`;
    } else {
      const dpr = window.devicePixelRatio || 1;
      largura = Math.round(cssL * dpr);
      altura = Math.round(cssA * dpr);
      canvas.style.width = `${cssL}px`;
      canvas.style.height = `${cssA}px`;
    }
    canvas.width = largura;
    canvas.height = altura;
    // keep the same field of view whatever the backing resolution: zoom is defined in CSS pixels per cell
    camera.zoom = camera.zoomCss * (largura / canvas.clientWidth);
  }
  window.addEventListener('resize', ajustarTamanho);
  ajustarTamanho();
  return { ajustarTamanho };
}
