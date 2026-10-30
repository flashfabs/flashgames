// Projection contract (site/rts/dados/projecao.json): an oblique orthographic camera over the square grid,
// shared by the renderer, the input layer (screen to map) and the Blender scripts.
//
// Map axes: x east, y south, in cells. A ground offset of d cells shows on screen as d*px across and
// d*px*sin(elevation) down; a height of h metres rises h*(px/metrosPorCelula)*cos(elevation).

const GRAUS = Math.PI / 180;

/** @typedef {{ x: number, y: number, zoom: number }} Camera map point at the screen centre, zoom factor */
/** @typedef {{ largura: number, altura: number, px: number }} Vista viewport in device pixels and px per cell */

/**
 * Checks the shape and the internal consistency of projecao.json, throwing on the first problem.
 * @param {any} dados
 */
export function validarProjecao(dados) {
  const falha = mensagem => {
    throw new Error(`projecao.json: ${mensagem}`);
  };
  if (!dados || typeof dados !== 'object') falha('não é um objeto');
  if (!Number.isInteger(dados.versao) || dados.versao < 0) falha('versao inválida');
  const elevacao = dados.camera?.elevacaoGraus;
  if (!(elevacao > 20 && elevacao < 90)) falha('camera.elevacaoGraus fora de 20..90');
  const rotacao = dados.camera?.blenderRotacaoGraus;
  if (!Array.isArray(rotacao) || Math.abs(rotacao[0] - (90 - elevacao)) > 1e-6 || rotacao[1] !== 0 || rotacao[2] !== 0) {
    falha('camera.blenderRotacaoGraus não bate com a elevação');
  }
  if (!(dados.metrosPorCelula > 0)) falha('metrosPorCelula inválido');
  const { hd, uhd } = dados.pxPorCelula ?? {};
  if (!Number.isInteger(hd) || !Number.isInteger(uhd) || uhd !== hd * 2) falha('pxPorCelula precisa de hd inteiro e uhd = 2 × hd');
  const campo = dados.campoDeVisao ?? {};
  if (!(campo.colunasReferencia > 0)) falha('campoDeVisao.colunasReferencia inválido');
  if (!Array.isArray(campo.proporcaoReferencia) || campo.proporcaoReferencia.length !== 2) falha('campoDeVisao.proporcaoReferencia inválida');
  if (!(campo.colunasMin > 0 && campo.colunasMin <= campo.colunasReferencia && campo.colunasMax >= campo.colunasReferencia)) {
    falha('campoDeVisao: precisa de colunasMin <= colunasReferencia <= colunasMax');
  }
  const zooms = campo.zooms ?? {};
  if (!(zooms.afastado > 0 && zooms.afastado < zooms.padrao && zooms.padrao === 1 && zooms.aproximado > zooms.padrao)) {
    falha('campoDeVisao.zooms precisa de afastado < padrao = 1 < aproximado');
  }
  const sol = dados.sol ?? {};
  if (!(sol.elevacaoGraus > 0 && sol.elevacaoGraus <= 90)) falha('sol.elevacaoGraus fora de 0..90');
  const esperado = vetorDoSol(sol.azimuteTelaGraus, sol.elevacaoGraus);
  if (!Array.isArray(sol.vetorParaOSol) || sol.vetorParaOSol.some((v, i) => Math.abs(v - esperado[i]) > 5e-4)) {
    falha('sol.vetorParaOSol não bate com azimute e elevação');
  }
  const [rx, ry, rz] = sol.blenderRotacaoGraus ?? [];
  if (Math.abs(rx - (90 - sol.elevacaoGraus)) > 1e-6 || ry !== 0 || Math.abs(normalizarGraus(rz - (sol.azimuteTelaGraus - 270))) > 1e-6) {
    falha('sol.blenderRotacaoGraus não bate com azimute e elevação');
  }
  if (typeof dados.transformacaoDeCor !== 'string') falha('transformacaoDeCor ausente');
  if (!(dados.exageroInfantaria >= 1)) falha('exageroInfantaria precisa ser >= 1');
  const cores = dados.time?.cores;
  if (!Array.isArray(cores) || cores.length < 8 || cores.some(c => !Array.isArray(c) || c.length !== 3 || c.some(v => !Number.isInteger(v) || v < 0 || v > 255))) {
    falha('time.cores precisa de 8 cores RGB de 0 a 255');
  }
  if (!(dados.time.fator > 0)) falha('time.fator inválido');
  return dados;
}

function normalizarGraus(graus) {
  return ((((graus + 180) % 360) + 360) % 360) - 180;
}

// Unit vector towards the sun in Blender axes (x east, y north, z up); azimuth counter-clockwise from east.
function vetorDoSol(azimuteGraus, elevacaoGraus) {
  const a = azimuteGraus * GRAUS;
  const e = elevacaoGraus * GRAUS;
  return [Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), Math.sin(e)];
}

/**
 * Precomputes what the renderer needs every frame from a validated contract.
 * @param {any} dados contents of projecao.json
 */
export function criarProjecao(dados) {
  validarProjecao(dados);
  const elevacao = dados.camera.elevacaoGraus * GRAUS;
  const campo = dados.campoDeVisao;
  const [pl, pa] = campo.proporcaoReferencia;
  const [sx, sy, sz] = dados.sol.vetorParaOSol;
  return {
    dados,
    seno: Math.sin(elevacao),
    cosseno: Math.cos(elevacao),
    // screen heights of the default view, in cells across: 30 columns at 16:9 give 16.875
    alturaEmCelulas: campo.colunasReferencia * (pa / pl),
    colunasMin: campo.colunasMin,
    colunasMax: campo.colunasMax,
    zooms: { ...campo.zooms },
    metrosPorCelula: dados.metrosPorCelula,
    pxNivel: { hd: dados.pxPorCelula.hd, uhd: dados.pxPorCelula.uhd },
    // towards the sun in map axes (y south)
    sol: [sx, -sy, sz],
    exageroInfantaria: dados.exageroInfantaria,
    fatorTime: dados.time.fator,
    coresTime: Float32Array.from(dados.time.cores.flat(), v => v / 255),
  };
}

/** Fetches and validates the contract. */
export async function carregarProjecao(url = new URL('../../dados/projecao.json', import.meta.url)) {
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error(`projecao.json: HTTP ${resposta.status}`);
  return criarProjecao(await resposta.json());
}

/**
 * Pixels per cell across the screen: the default view keeps the visible rows fixed for any aspect ratio,
 * clamps the visible columns, then applies the zoom factor.
 * @param {ReturnType<typeof criarProjecao>} projecao
 * @param {number} largura viewport width, any unit
 * @param {number} altura viewport height, same unit
 * @param {number} zoom
 */
export function pxPorCelula(projecao, largura, altura, zoom = 1) {
  let px = altura / projecao.alturaEmCelulas;
  const colunas = largura / px;
  if (colunas > projecao.colunasMax) px = largura / projecao.colunasMax;
  else if (colunas < projecao.colunasMin) px = largura / projecao.colunasMin;
  return px * zoom;
}

// Art level for a given on-screen density: hd stops when it would be magnified more than 12.5%.
export function escolherNivel(projecao, px) {
  return px > projecao.pxNivel.hd * 1.125 ? 'uhd' : 'hd';
}

/**
 * Map point to device pixels from the top-left of the viewport; writes [x, y] into saida.
 * @param {ReturnType<typeof criarProjecao>} projecao
 * @param {Camera} camera
 * @param {Vista} vista
 * @param {number} x map cells
 * @param {number} y map cells
 * @param {number} alturaMetros height above the ground
 * @param {Float64Array | number[]} saida
 */
export function mundoParaTela(projecao, camera, vista, x, y, alturaMetros, saida) {
  saida[0] = vista.largura * 0.5 + (x - camera.x) * vista.px;
  saida[1] = vista.altura * 0.5 + (y - camera.y) * vista.px * projecao.seno - (alturaMetros * vista.px * projecao.cosseno) / projecao.metrosPorCelula;
  return saida;
}

/**
 * Device pixel to the map point on the ground plane under it; writes [x, y] into saida.
 * @param {ReturnType<typeof criarProjecao>} projecao
 * @param {Camera} camera
 * @param {Vista} vista
 * @param {number} px
 * @param {number} py
 * @param {Float64Array | number[]} saida
 */
export function telaParaMundo(projecao, camera, vista, px, py, saida) {
  saida[0] = camera.x + (px - vista.largura * 0.5) / vista.px;
  saida[1] = camera.y + (py - vista.altura * 0.5) / (vista.px * projecao.seno);
  return saida;
}

/** Visible ground rectangle in cells, [x0, y0, x1, y1], with a margin in cells. */
export function areaVisivel(projecao, camera, vista, margem, saida) {
  const meiaL = vista.largura / (2 * vista.px);
  const meiaA = vista.altura / (2 * vista.px * projecao.seno);
  saida[0] = camera.x - meiaL - margem;
  saida[1] = camera.y - meiaA - margem;
  saida[2] = camera.x + meiaL + margem;
  saida[3] = camera.y + meiaA + margem;
  return saida;
}
