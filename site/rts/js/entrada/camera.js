// Camera state in map cells (centre and zoom) and the conversion from screen coordinates to world coordinates.

export function criarCamera(zoomCss) {
  // zoom (backing pixels per cell) is derived from zoomCss (CSS pixels per cell) by the resolution module
  return { x: 96, y: 96, zoom: 1, zoomCss };
}

export function paraMundo(canvas, camera, clienteX, clienteY) {
  const r = canvas.getBoundingClientRect();
  const escala = canvas.width / r.width;
  const px = (clienteX - r.left) * escala - canvas.width / 2;
  const py = (clienteY - r.top) * escala - canvas.height / 2;
  return { x: camera.x + px / camera.zoom, y: camera.y + py / camera.zoom };
}
