// Camera state and every screen/map conversion of the input layer. The camera is the map point at the screen centre
// (cells) and the zoom factor of projecao.json (1 = default view, between the far and near zooms); the projection
// (oblique camera, so screen y is foreshortened by sin(elevation)) comes from render/projecao.js.
import { pxPorCelula, telaParaMundo, mundoParaTela } from '../render/projecao.js';

/**
 * @param {number} zoom
 * @param {ReturnType<typeof import('../render/projecao.js').criarProjecao>} projecao
 */
export function criarCamera(zoom, projecao) {
  return { x: 96, y: 96, zoom, projecao };
}

const vista = { largura: 1, altura: 1, px: 1 };
const ponto = [0, 0];

function atualizarVista(canvas, camera) {
  vista.largura = canvas.width;
  vista.altura = canvas.height;
  vista.px = pxPorCelula(camera.projecao, canvas.width, canvas.height, camera.zoom);
  return vista;
}

/** Canvas pixels per cell across the screen (down the screen it is this times sin(elevation)). */
export function pixelsPorCelula(canvas, camera) {
  return atualizarVista(canvas, camera).px;
}

/** CSS pixels per cell across the screen. */
export function pixelsCssPorCelula(canvas, camera) {
  return (pixelsPorCelula(canvas, camera) * canvas.clientWidth) / canvas.width;
}

/** Ground point under a pointer (client CSS pixels), in map cells, written into saida.x and saida.y. */
export function paraMundo(canvas, camera, clienteX, clienteY, saida = { x: 0, y: 0 }) {
  const r = canvas.getBoundingClientRect();
  const k = canvas.width / r.width;
  telaParaMundo(camera.projecao, camera, atualizarVista(canvas, camera), (clienteX - r.left) * k, (clienteY - r.top) * k, ponto);
  saida.x = ponto[0];
  saida.y = ponto[1];
  return saida;
}

/** Ground point (map cells) to client CSS pixels, written into saida.x and saida.y. */
export function paraTela(canvas, camera, x, y, saida = { x: 0, y: 0 }) {
  const r = canvas.getBoundingClientRect();
  mundoParaTela(camera.projecao, camera, atualizarVista(canvas, camera), x, y, 0, ponto);
  saida.x = r.left + (ponto[0] * r.width) / canvas.width;
  saida.y = r.top + (ponto[1] * r.height) / canvas.height;
  return saida;
}

/** Sets the zoom factor, kept between the far and near zooms of projecao.json. */
export function definirZoom(camera, fator) {
  const { afastado, aproximado } = camera.projecao.zooms;
  camera.zoom = Math.max(afastado, Math.min(aproximado, fator));
}
