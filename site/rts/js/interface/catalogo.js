// What the interface knows about each entity kind (the `tipo` of the snapshot): the name the player reads, whether it
// is a unit, a building or a resource, cost, population, build time, footprint, and what it trains, builds or raises.
// It comes from MapaEstatico.tipos, the kinds the simulation itself compiled from the game data (C5), so a button
// never promises what the simulation refuses; names come from C11.
import { CATEGORIA, ITEM_PESQUISA } from '../sim/contratos.js';

/** @typedef {'unidade'|'coletor'|'predio'|'recurso'|'faisca'|'estrutura'} Categoria */

/**
 * @typedef {object} TipoDoCatalogo
 * @property {string} id         data id, lowercase with hyphens
 * @property {string} nome       name shown to the player
 * @property {Categoria} categoria
 * @property {number} custo      Carga
 * @property {number} lotacao    population points
 * @property {number} tempo      build time in ticks
 * @property {number[]} pegada   [width, height] in cells
 * @property {number[]} produz   unit kinds this building trains, in grid order
 * @property {number[]} constroi building kinds this building builds (the headquarters), in grid order
 * @property {number[]} ergue    building kinds this unit raises on site
 * @property {boolean} qg        has the construction lane: B brings the camera to it
 * @property {number} raioRede   network radius in cells (0: not a network node)
 * @property {boolean} raizRede  powers the network by itself
 * @property {boolean} precisaRede works at half speed without power
 * @property {boolean} exigeVentosa must stand on a windy cell
 * @property {Habilidade | null} habilidade the player-usable ability of a unit kind
 * @property {boolean} repara    a support unit that repairs (REPARAR) its own team's units and buildings
 * @property {boolean} porReparo a neutral structure the mission lets repair units bring back (REPARAR on it)
 */

/**
 * An ability as the command card offers it: the HABILIDADE code of the combat front, what it targets ('estrutura' a
 * neutral structure to bring back, 'predio' an enemy building, null nothing: it toggles), and the C11 label, with
 * textoAtivo for a toggle that is on.
 * @typedef {{codigo: number, alvo: 'estrutura' | 'predio' | null, texto: string, textoAtivo?: string}} Habilidade
 */

/** HABILIDADE codes of the combat front (arg of the command). */
export const HABILIDADE = Object.freeze({ RELIGAR: 1, CESTO: 2, LEITURA: 3 });
/** Bit of Retrato.bandeiras set while a basket is raised (combat bits start at 512). */
export const BANDEIRA_CESTO_ERGUIDO = 512;

const HABILIDADES_DO_C5 = {
  erguer: { codigo: HABILIDADE.CESTO, alvo: null, texto: 'comando.erguer_cesto', textoAtivo: 'comando.baixar_cesto' },
  leitura: { codigo: HABILIDADE.LEITURA, alvo: 'predio', texto: 'comando.leitura' },
};
const RELIGAR = Object.freeze({ codigo: HABILIDADE.RELIGAR, alvo: 'estrutura', texto: 'comando.religar' });

/** The player-usable ability of a C5 unit entry ("religa": 1, or "habilidade": { "tipo": "erguer" | "leitura" }), or null. */
export function habilidadeDoC5(unidade) {
  if (!unidade) return null;
  if (unidade.religa) return RELIGAR;
  return HABILIDADES_DO_C5[unidade.habilidade?.tipo] ?? null;
}

/** The ability of a kind of the static map (MapaEstatico.tipos[].religa and .habilidade), or undefined when it does not say. */
function habilidadeDoMapa(tipo) {
  if (!('religa' in tipo) && !('habilidade' in tipo)) return undefined;
  if (tipo.religa) return RELIGAR;
  return HABILIDADES_DO_C5[tipo.habilidade] ?? null;
}

/**
 * Names of the neutral structure kinds a mission (C7) makes repair units bring back: the map entities (C6) labelled
 * with the group of a `religavel` action that says `por: "reparo"`.
 * @param {object | null | undefined} missao
 * @param {{entidades?: {tipo: string, etiqueta?: string}[]} | null | undefined} entidadesDoMapa the map's entidades.json
 * @returns {Set<string>}
 */
export function estruturasPorReparo(missao, entidadesDoMapa) {
  const grupos = new Set();
  for (const gatilho of missao?.gatilhos ?? []) {
    for (const acao of gatilho.acoes ?? gatilho.faz ?? []) if (acao?.faz === 'religavel' && acao.por === 'reparo' && acao.grupo) grupos.add(acao.grupo);
  }
  const nomes = new Set();
  for (const entidade of entidadesDoMapa?.entidades ?? []) if (entidade.etiqueta && grupos.has(entidade.etiqueta)) nomes.add(entidade.tipo);
  return nomes;
}

const DESCONHECIDO = Object.freeze({ id: '?', nome: '?', categoria: 'unidade', custo: 0, lotacao: 0, tempo: 0, pegada: [1, 1], produz: [], constroi: [], ergue: [], qg: false, raioRede: 0, raizRede: false, precisaRede: false, exigeVentosa: false, habilidade: null, repara: false, porReparo: false });

const CATEGORIAS = { [CATEGORIA.PREDIO]: 'predio', [CATEGORIA.RECURSO]: 'recurso', [CATEGORIA.FAISCA]: 'faisca', [CATEGORIA.ESTRUTURA]: 'estrutura' };
const PREFIXO_DO_TEXTO = { predio: 'predio', recurso: 'recurso', faisca: 'recurso', estrutura: 'predio', unidade: 'unidade', coletor: 'unidade' };

/** "turma-de-linha" → "Turma de linha", for kinds whose C11 copy is not there yet. */
export function nomeDoId(id) {
  const texto = String(id).replace(/-/g, ' ');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function nomeVisivel(prefixo, id, texto) {
  const chave = `${prefixo}.${id}.nome`;
  return texto?.tem(chave) ? texto(chave) : nomeDoId(id);
}

/**
 * Catalog over a list indexed by kind number, plus the research list (MapaEstatico.pesquisas).
 * @param {Partial<TipoDoCatalogo>[]} tipos
 * @param {((id: string) => string) & {tem: (id: string) => boolean}} [texto] C11 lookup for the names
 * @param {{nome: string, predio: number, custo: number, tempo: number}[]} [pesquisas]
 */
export function criarCatalogo(tipos, texto, pesquisas = []) {
  const lista = tipos.map(t => {
    const completo = { ...DESCONHECIDO, ...t };
    return Object.freeze({ ...completo, nome: t.nome ?? nomeVisivel(PREFIXO_DO_TEXTO[completo.categoria], completo.id, texto) });
  });
  const listaDePesquisas = pesquisas.map((p, indice) => Object.freeze({ ...p, indice, nomeVisivel: nomeVisivel('pesquisa', p.nome, texto) }));
  const info = tipo => lista[tipo] ?? DESCONHECIDO;
  const categoria = tipo => info(tipo).categoria;
  return {
    info,
    get tamanho() {
      return lista.length;
    },
    categoria,
    ehPredio: tipo => categoria(tipo) === 'predio',
    ehUnidade: tipo => categoria(tipo) === 'unidade' || categoria(tipo) === 'coletor',
    ehColetor: tipo => categoria(tipo) === 'coletor',
    /** Resource piles and spilled sparks: what harvesters take. */
    ehRecurso: tipo => categoria(tipo) === 'recurso' || categoria(tipo) === 'faisca',
    ehQG: tipo => info(tipo).qg,
    /** Support units that repair (REPARAR). */
    repara: tipo => info(tipo).repara,
    /** Neutral structures repair units bring back (REPARAR on them turns into re-powering). */
    porReparo: tipo => info(tipo).porReparo,
    nome: tipo => info(tipo).nome,
    /** Research a building of this kind offers, in data order. */
    pesquisasDe: tipo => listaDePesquisas.filter(p => p.predio === tipo),
    pesquisa: indice => listaDePesquisas[indice] ?? null,
    /** Name of a queue item: a kind, or research as ITEM_PESQUISA + index. */
    nomeDoItem(item) {
      if (item >= ITEM_PESQUISA) return listaDePesquisas[item - ITEM_PESQUISA]?.nomeVisivel ?? '?';
      return info(item).nome;
    },
  };
}

/**
 * Catalog from the static map the worker sends (MapaEstatico.tipos and .pesquisas). Abilities come from the static map
 * (religa, habilidade) or, when it does not carry them, from the C5 unit list of the match by name; who repairs comes
 * from the C5 `reparo` block, which the static map does not carry. `porReparo` names the structure kinds the mission
 * lets repair units bring back (estruturasPorReparo).
 */
export function catalogoDoMapa(mapa, texto, unidadesDoC5 = [], { porReparo = new Set() } = {}) {
  const porNome = new Map(unidadesDoC5.map(u => [u.nome, u]));
  const tipos = (mapa.tipos ?? []).map(t => ({
    id: t.nome,
    categoria: t.categoria === CATEGORIA.UNIDADE ? (t.coletor ? 'coletor' : 'unidade') : (CATEGORIAS[t.categoria] ?? 'unidade'),
    custo: t.custo,
    lotacao: t.lotacao,
    tempo: t.tempo,
    pegada: t.pegada,
    produz: t.produz,
    constroi: t.constroi,
    ergue: t.ergue,
    qg: t.filaConstrucao === 1,
    raioRede: t.raioRede,
    raizRede: t.raizRede === 1,
    precisaRede: t.precisaRede === 1,
    exigeVentosa: t.exigeVentosa === 1,
    habilidade: t.categoria === CATEGORIA.UNIDADE ? (habilidadeDoMapa(t) ?? habilidadeDoC5(porNome.get(t.nome))) : null,
    repara: t.categoria === CATEGORIA.UNIDADE && Boolean(porNome.get(t.nome)?.reparo),
    porReparo: t.categoria === CATEGORIA.ESTRUTURA && porReparo.has(t.nome),
  }));
  return criarCatalogo(tipos, texto, mapa.pesquisas ?? []);
}
