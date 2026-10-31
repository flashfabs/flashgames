// Shared pieces for map generators that write a Tiled source by script (decision D16): the TMJ document with the
// three tile layers and the object layers the converter reads (formato.mjs), from plain lists in cells.
// The sandbox generator keeps its own copy of this assembly so its committed source stays byte for byte the same.

import { PIXELS_POR_CELULA, tilesDoTileset } from './formato.mjs';

const PX = PIXELS_POR_CELULA;

/** A Tiled custom property; integers as int, everything else as string. */
export const propriedade = (name, value) => ({ name, type: Number.isInteger(value) ? 'int' : 'string', value });

/**
 * The Tiled map document.
 * @param {{ largura: number, altura: number, solo: Uint8Array, alturaNiveis: Uint8Array, decoracao: Uint8Array }} terreno
 *   size in cells and the layers row by row; `alturaNiveis` is the height layer (levels 0 to 3)
 * @param {{ entidades: object[], nos: object[], ventosas: number[][], passagens: number[][], areas: object,
 *   pontos: object, rotas: object }} objetos everything in cells
 * @param {Record<string, string|number>} propriedades map properties (id, simetria, geradoPor, jogadores)
 */
export function montarTmj(terreno, objetos, propriedades) {
  const { largura, altura } = terreno;
  const tiles = tilesDoTileset();
  const gidDe = (camada, codigo) => 1 + tiles.findIndex(t => t.camada === camada && t.codigo === codigo);
  let proximoId = 1;
  const objeto = (campos, props = {}) => ({
    id: proximoId++,
    name: '',
    type: '',
    rotation: 0,
    visible: true,
    ...campos,
    properties: Object.entries(props).filter(([, v]) => v !== undefined).map(([k, v]) => propriedade(k, v)),
  });
  const camadaTiles = (id, name, dados, camada, vazio) => ({
    id, name, type: 'tilelayer', x: 0, y: 0, width: largura, height: altura, opacity: 1, visible: true,
    data: Array.from(dados, v => (vazio && v === 0 ? 0 : gidDe(camada, v))),
  });
  const grupo = (id, name, objects) => ({ id, name, type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects });
  const retangulo = (tipo, nome, [x, y, w, h]) => objeto({ name: nome, type: tipo, x: x * PX, y: y * PX, width: w * PX, height: h * PX });
  const camadas = [
    camadaTiles(1, 'solo', terreno.solo, 'solo', false),
    camadaTiles(2, 'altura', terreno.alturaNiveis, 'altura', false),
    camadaTiles(3, 'decoracao', terreno.decoracao, 'decoracao', true),
    grupo(4, 'entidades', objetos.entidades.map(e => objeto({ type: e.tipo, x: e.x * PX, y: e.y * PX, width: e.w * PX, height: e.h * PX }, e.props))),
    grupo(5, 'nos', objetos.nos.map(n => objeto({ name: n.id, type: 'no', x: n.x * PX, y: n.y * PX, width: 0, height: 0, point: true }))),
    grupo(6, 'ventosas', objetos.ventosas.map(([x, y]) => objeto({ type: 'ventosa', x: x * PX, y: y * PX, width: 2 * PX, height: 2 * PX }))),
    grupo(7, 'passagens', objetos.passagens.map(r => retangulo('passagem', '', r))),
    grupo(8, 'areas', Object.entries(objetos.areas).map(([nome, r]) => retangulo('area', nome, r))),
    grupo(9, 'pontos', Object.entries(objetos.pontos).map(([nome, [x, y]]) => objeto({ name: nome, type: 'ponto', x: x * PX, y: y * PX, width: 0, height: 0, point: true }))),
    grupo(10, 'rotas', Object.entries(objetos.rotas).map(([nome, pts]) => objeto({ name: nome, type: 'rota', x: pts[0][0] * PX, y: pts[0][1] * PX, width: 0, height: 0, polyline: pts.map(([x, y]) => ({ x: (x - pts[0][0]) * PX, y: (y - pts[0][1]) * PX })) }))),
  ];
  return {
    type: 'map',
    version: '1.10',
    tiledversion: '1.11.0',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    width: largura,
    height: altura,
    tilewidth: PX,
    tileheight: PX,
    infinite: false,
    compressionlevel: -1,
    nextlayerid: camadas.length + 1,
    nextobjectid: proximoId,
    properties: Object.entries(propriedades).map(([k, v]) => propriedade(k, v)),
    tilesets: [{ firstgid: 1, source: 'terreno.tsj' }],
    layers: camadas,
  };
}
