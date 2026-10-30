// Camera state in map cells (centre and zoom) and the conversions between client pixels and the map. This file is the
// seam with the renderer: input code only calls these functions and never reads camera.zoom or camera.zoomCss itself.

/** CSS pixels per cell at zoom factor 1. */
const PIXELS_CSS_POR_CELULA = 46;

export function criarCamera(zoomCss = PIXELS_CSS_POR_CELULA) {
  // zoom (backing pixels per cell) is derived from zoomCss (CSS pixels per cell) by the resolution module
  return { x: 96, y: 96, zoom: 1, zoomCss };
}

/** Map point (cells) under the client pixel (clienteX, clienteY), written to saida and returned. */
export function paraMundo(canvas, camera, clienteX, clienteY, saida = { x: 0, y: 0 }) {
  const r = canvas.getBoundingClientRect();
  const escala = canvas.width / r.width;
  saida.x = camera.x + ((clienteX - r.left) * escala - canvas.width / 2) / camera.zoom;
  saida.y = camera.y + ((clienteY - r.top) * escala - canvas.height / 2) / camera.zoom;
  return saida;
}

/** Client pixel (CSS) of the ground point (x, y) in cells, written to saida and returned. */
export function paraTela(canvas, camera, x, y, saida = { x: 0, y: 0 }) {
  const r = canvas.getBoundingClientRect();
  const escala = r.width / canvas.width;
  saida.x = r.left + ((x - camera.x) * camera.zoom + canvas.width / 2) * escala;
  saida.y = r.top + ((y - camera.y) * camera.zoom + canvas.height / 2) * escala;
  return saida;
}

/** CSS pixels one cell takes horizontally on screen now, to turn pointer drags into camera moves. */
export function pixelsCssPorCelula(canvas, camera) {
  return camera.zoom * (canvas.getBoundingClientRect().width / canvas.width);
}

/** Sets the zoom factor (1 is the default view); the resolution module re-derives the backing zoom afterwards. */
export function definirZoom(camera, fator) {
  camera.zoomCss = PIXELS_CSS_POR_CELULA * fator;
}
