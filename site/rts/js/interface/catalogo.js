// What the interface knows about each entity kind (the `tipo` of the snapshot): the name the player reads, whether it
// is a unit, a building or a resource, cost, population, build time, footprint, and what it produces or builds.
// It is read from the game data (C5) the simulation runs on, so a button never promises what the simulation refuses.

/** @typedef {'unidade'|'coletor'|'predio'|'recurso'} Categoria */

/**
 * @typedef {object} TipoDoCatalogo
 * @property {string} id         data id, lowercase with hyphens
 * @property {string} nome       name shown to the player
 * @property {Categoria} categoria
 * @property {number} custo      Carga
 * @property {number} lotacao    population points
 * @property {number} tempo      build time in ticks
 * @property {number[]} pegada   [width, height] in cells, buildings only
 * @property {number[]} produz   unit kinds this building trains
 * @property {number[]} constroi building kinds this building builds (the headquarters)
 * @property {boolean} qg        headquarters: B brings the camera to it
 */

const DESCONHECIDO = Object.freeze({ id: '?', nome: '?', categoria: 'unidade', custo: 0, lotacao: 0, tempo: 0, pegada: [1, 1], produz: [], constroi: [], qg: false });

/** "turma-de-linha" → "Turma de linha", for kinds whose data has no display name yet. */
export function nomeDoId(id) {
  const texto = String(id).replace(/-/g, ' ');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Display name of a kind: its C11 text ("unidade.<id>.nome" or "predio.<id>.nome"), else one made from the id. */
function nomeVisivel(t, texto) {
  const id = `${t.categoria === 'predio' ? 'predio' : t.categoria === 'recurso' ? 'recurso' : 'unidade'}.${t.id}.nome`;
  return texto?.tem(id) ? texto(id) : nomeDoId(t.id ?? '?');
}

/**
 * Catalog over a list indexed by kind number.
 * @param {Partial<TipoDoCatalogo>[]} tipos
 * @param {((id: string) => string) & {tem: (id: string) => boolean}} [texto] C11 lookup for the names
 */
export function criarCatalogo(tipos, texto) {
  const lista = tipos.map(t => Object.freeze({ ...DESCONHECIDO, ...t, nome: t.nome ?? nomeVisivel({ ...DESCONHECIDO, ...t }, texto) }));
  const info = tipo => lista[tipo] ?? DESCONHECIDO;
  const qgs = new Set(lista.flatMap((t, tipo) => (t.qg ? [tipo] : [])));
  return {
    info,
    get tamanho() {
      return lista.length;
    },
    categoria: tipo => info(tipo).categoria,
    ehPredio: tipo => info(tipo).categoria === 'predio',
    ehUnidade: tipo => info(tipo).categoria === 'unidade' || info(tipo).categoria === 'coletor',
    ehColetor: tipo => info(tipo).categoria === 'coletor',
    ehRecurso: tipo => info(tipo).categoria === 'recurso',
    ehQG: tipo => qgs.has(tipo),
    nome: tipo => info(tipo).nome,
  };
}

/** The prototype's kinds (sim/dados.js DADOS_PROTOTIPO): fighting vehicles only. */
export function catalogoDoPrototipo(tiposDaSimulacao, texto) {
  return criarCatalogo(tiposDaSimulacao.map(t => ({ id: t.nome, categoria: t.coletor ? 'coletor' : 'unidade' })), texto);
}
