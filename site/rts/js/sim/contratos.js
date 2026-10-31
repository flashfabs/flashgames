// Contracts between the simulation and everyone else: commands (the only input of the simulation), the per-tick
// snapshot sent to the presentation, presentation events, the team view for the computer players, and the
// messages between the main thread and the worker. Pure data and integer helpers, no DOM, safe in a Worker and Node.
// A contract change goes in its own commit, bumps its version and is announced to the consumers.

/**
 * Version of the command envelope (the fields of Comando, their ranges and their compact array form), frozen at 1 on
 * 31/10/2026 after the lockstep spike ran ten minutes on four pages with no desync. Only the envelope is frozen: new
 * command kinds can still be added, and their rules are versioned with VERSAO_SIMULACAO.
 */
export const VERSAO_COMANDOS = 1;
/** Version of the snapshot, events and static map formats, of the command kinds' rules and of every rule replays depend on. */
export const VERSAO_SIMULACAO = 4;

// ---------- units of measure ----------

export const FP_BITS = 10;
/** One map cell in world units. Positions, ranges and speeds are integers in world units. */
export const FP = 1 << FP_BITS;
export const PASSOS_POR_SEGUNDO = 30;
/** Angles are integers 0..255; 0 points to +x (east), 64 to +y (south, down on screen), a full turn is 256. */
export const VOLTA = 256;
/** Simulation speeds offered to the player, in percent of PASSOS_POR_SEGUNDO. */
export const VELOCIDADES = Object.freeze([75, 100, 125]);
export const MAX_JOGADORES = 8;
/** Owner of neutral entities (resource nodes, spilled charge, dead structures of the map); never a player or a team. */
export const DONO_NEUTRO = 255;

// ---------- entity ids with generation ----------

// An id packs the slot (low 16 bits) and the slot's generation (15 bits above), so a late command or a stale
// snapshot never hits the new entity that took a freed slot. Generations start at 1, so every valid id is > 0.
export const BITS_SLOT = 16;
export const MAX_SLOTS = 1 << BITS_SLOT;
export const MAX_GERACAO = 0x7fff;
export const SEM_ENTIDADE = -1;

export const idDe = (slot, geracao) => slot | (geracao << BITS_SLOT);
export const slotDe = id => id & (MAX_SLOTS - 1);
export const geracaoDe = id => id >>> BITS_SLOT;
/** Next generation for a slot that is being reused, wrapping inside 1..MAX_GERACAO. */
export const proximaGeracao = geracao => (geracao >= MAX_GERACAO ? 1 : geracao + 1);

// ---------- commands (C1) ----------

/** Command kinds; 0 is never valid. What each one reads is described below, field by field. */
export const TIPO_COMANDO = Object.freeze({
  MOVER: 1,
  ATACAR: 2,
  ATACAR_MOVENDO: 3,
  PARAR: 4,
  SEGURAR_POSICAO: 5,
  PATRULHAR: 6,
  CONSTRUIR: 7,
  PRODUZIR: 8,
  CANCELAR: 9,
  PONTO_DE_ENCONTRO: 10,
  COLETAR: 11,
  REPARAR: 12,
  HABILIDADE: 13,
  DESISTIR: 14,
  PESQUISAR: 15,
  RECICLAR: 16,
});
const ULTIMO_TIPO_COMANDO = 16;

// What each kind reads (fields not listed are ignored; ids are ids with generation, kinds are indices of
// MapaEstatico.tipos, positions are world units):
// MOVER, ATACAR_MOVENDO, PATRULHAR: unidades, (x, y), fila (MOVER and ATACAR_MOVENDO only).
// ATACAR: unidades, alvo, fila.
// PARAR, SEGURAR_POSICAO: unidades.
// PRODUZIR: unidades = producer buildings, arg = unit or building kind. The item goes to the listed producer that
//   can make it with the shortest queue in its lane (ties to the lowest slot); with no producer listed, to any of the
//   player's producers the same way. Cost is paid when queued; buildings queue in the construction lane of the
//   headquarters, units in the unit lane.
// CONSTRUIR: arg = building kind, (x, y) = a point inside the top-left cell of its footprint. Two forms:
//   unidades = the headquarters holding that kind ready to place (FAIXA_ESTADO.PRONTO): the building appears there at
//   once; with fila = 1 the same kind is queued again right after (posts in a row with Shift).
//   unidades = builder units whose kind lists it in `ergue`: the cost is paid now, the first of them walks to the
//   site and raises it there (or, with alvo = an unfinished building of the player, resumes it).
// CANCELAR: unidades = [producer], x = lane (FAIXA.*), arg = position in that lane's queue (0 = the head, also a
//   building waiting to be placed); refunds the whole cost.
// PONTO_DE_ENCONTRO: unidades = producers, (x, y) = rally point, alvo = optional entity (a resource node sends new
//   harvesters to it, a unit or building makes new units follow it); x = y = -1 with no alvo clears the point.
// COLETAR: unidades = harvesters, alvo = a battery pile (its node), a spark of spilled charge or one of the player's
//   depots (to unload now); with no alvo, the node nearest to (x, y) that the team has explored.
// REPARAR: unidades = support units, alvo = the unit or building to repair.
// HABILIDADE: unidades, arg = ability code, alvo and (x, y) as the ability needs (codes defined by the combat module).
// DESISTIR: no field; the player concedes.
// PESQUISAR: unidades = [building], arg = research index (MapaEstatico.pesquisas); queues in the unit lane.
// RECICLAR: unidades = the player's finished buildings; each is taken down and returns half its cost.

/** Production lanes of a producer building: units (and research) and, in the headquarters, buildings. */
export const FAIXA = Object.freeze({ UNIDADES: 0, CONSTRUCAO: 1 });
/** Items queued per lane. */
export const MAX_FILA = 5;
/** Queue items are kinds, or research as ITEM_PESQUISA + research index. */
export const ITEM_PESQUISA = 0x1000;
/** Why a command was refused, in the arg of EVENTO.COMANDO_RECUSADO. */
export const MOTIVO = Object.freeze({
  SEM_CARGA: 1, // not enough Carga to pay
  LOTACAO_CHEIA: 2, // the queue head waits: population at the cap
  FILA_CHEIA: 3, // MAX_FILA items in the lane already
  NAO_PRODUZ: 4, // that producer or builder cannot make that kind
  BLOQUEADO: 5, // a required building, research or mission unlock is missing
  NADA_PRONTO: 6, // no building of that kind ready to place
  FORA_DA_AREA: 7, // outside the player's building area (for the Religadores, the powered network)
  TERRENO_OCUPADO: 8, // a building, a resource node or a unit stands on the footprint
  TERRENO_IMPROPRIO: 9, // blocked ground or more than one height level under the footprint
  CELULA_NAO_VENTOSA: 10, // the kind needs a windy cell under its footprint
  FORA_DO_MAPA: 11,
  LIMITE: 12, // the player already has the most of that kind the rules allow
  PERTO_DO_RECURSO: 13, // a depot too close to a battery pile (economy data, distanciaMinimaPilha)
});

/**
 * The only input of the simulation. Control groups, camera, selection and pause are not commands.
 * The simulation validates ownership, existence, cost and position and drops what is invalid, the same way on every
 * machine (refusals a player should hear about raise EVENTO.COMANDO_RECUSADO); within a tick, commands apply in total
 * order (jogador, seq).
 * @typedef {object} Comando
 * @property {number} tick      tick the command runs on, set by the command source, never by the interface
 * @property {number} jogador   player index, 0..MAX_JOGADORES-1
 * @property {number} seq       per-player sequence number, strictly increasing
 * @property {number} tipo      TIPO_COMANDO.*
 * @property {number[]} unidades ids with generation of the units or buildings being ordered (may be empty)
 * @property {number} alvo      target entity id, or SEM_ENTIDADE
 * @property {number} x         target point in world units (1 cell = FP); some kinds use it as a small integer (above)
 * @property {number} y
 * @property {number} arg       unit or building kind, queue position, research, ability; 0 when unused
 * @property {number} fila      1 appends to the units' order queue (Shift), 0 replaces it
 */

/** Builds a command with every field present and defaults for the optional ones. */
export function criarComando({ tick = 0, jogador, seq, tipo, unidades = [], alvo = SEM_ENTIDADE, x = 0, y = 0, arg = 0, fila = 0 }) {
  return { tick, jogador, seq, tipo, unidades: Array.from(unidades), alvo, x, y, arg, fila };
}

const ehInteiro = v => Number.isInteger(v) && v >= -0x80000000 && v <= 0x7fffffff;
/** Most unit ids one command may carry (about 11 KB of JSON); a bigger selection goes as several commands. */
export const MAX_UNIDADES_POR_COMANDO = 1024;

/** Structural check only (integer fields, ranges); game rules are checked by the simulation. */
export function comandoValido(c) {
  if (!c || typeof c !== 'object') return false;
  for (const campo of ['tick', 'jogador', 'seq', 'tipo', 'alvo', 'x', 'y', 'arg', 'fila']) if (!ehInteiro(c[campo])) return false;
  if (c.tick < 0 || c.seq < 0) return false;
  if (c.jogador < 0 || c.jogador >= MAX_JOGADORES) return false;
  if (c.tipo < 1 || c.tipo > ULTIMO_TIPO_COMANDO) return false;
  if (c.fila !== 0 && c.fila !== 1) return false;
  if (!Array.isArray(c.unidades) || c.unidades.length > MAX_UNIDADES_POR_COMANDO) return false;
  for (const id of c.unidades) if (!ehInteiro(id) || id <= 0) return false;
  return true;
}

/** Total order used to apply commands: tick, then player, then sequence. */
export function compararComandos(a, b) {
  return a.tick - b.tick || a.jogador - b.jogador || a.seq - b.seq;
}

// Compact array form for the network and the replay: [tick, jogador, seq, tipo, alvo, x, y, arg, fila, ...unidades].
const CAMPOS_FIXOS = 9;

export function comandoParaArray(c) {
  return [c.tick, c.jogador, c.seq, c.tipo, c.alvo, c.x, c.y, c.arg, c.fila, ...c.unidades];
}

export function comandoDeArray(a) {
  return { tick: a[0], jogador: a[1], seq: a[2], tipo: a[3], alvo: a[4], x: a[5], y: a[6], arg: a[7], fila: a[8], unidades: a.slice(CAMPOS_FIXOS) };
}

// ---------- fog of war ----------

/**
 * Per-cell visibility for one team. The values are chosen so the grid uploads straight to an R8 texture:
 * never seen, seen before (terrain and building ghosts only), visible now.
 */
export const VISAO = Object.freeze({ NUNCA: 0, VISTA: 128, VISIVEL: 255 });

// ---------- presentation events (C3) ----------

/** Event kinds. The simulation writes them for the presentation and never reads them back. */
export const EVENTO = Object.freeze({
  TIRO: 1,
  IMPACTO: 2,
  EXPLOSAO: 3,
  MORTE: 4,
  PRODUCAO_CONCLUIDA: 5,
  CONSTRUCAO_CONCLUIDA: 6,
  SOB_ATAQUE: 7,
  RECURSO_ESGOTADO: 8,
  MENSAGEM_MISSAO: 9,
  OBJETIVO: 10,
  VITORIA: 11,
  DERROTA: 12,
  SURGIMENTO: 13,
  PREDIO_PRONTO: 14,
  COMANDO_RECUSADO: 15,
  CARGA_DERRAMADA: 16,
  DESCARGA: 17,
  RAJADA_ANUNCIADA: 18,
  RAJADA: 19,
  REDE_CORTADA: 20,
  AVISO_ATAQUE: 21,
  ONDA: 22,
  PROMOCAO: 23,
  RELIGADO: 24,
  CAMERA: 25,
  LUZ: 26,
});

// Events travel as flat Int32Array records of TAMANHO_EVENTO integers; E_* are the offsets inside a record.
// Positions are in world units at the moment of the event, so the presentation needs no lookup; a building's position
// is the centre of its footprint. Without a target, alvo is SEM_ENTIDADE and (alvoX, alvoY) repeats (x, y).
// TIRO: entidade at (x, y) fires at alvo at (alvoX, alvoY), arg is the shooter's kind.
// IMPACTO: entidade was hit by alvo (the shooter), arg is the weapon index (armas.json).
// EXPLOSAO: (x, y) is the point of impact of an area weapon, entidade the shooter, arg the weapon index.
// MORTE: entidade (unit, building, node) died at (x, y), alvo is the killer, arg is the dead entity's kind.
// SURGIMENTO: entidade appeared (spawned or respawned) at (x, y), arg is its kind.
// PRODUCAO_CONCLUIDA: entidade is the new unit at the producer's exit, alvo the producer, arg the kind; for research,
//   entidade is the building, alvo SEM_ENTIDADE and arg ITEM_PESQUISA + research index.
// PREDIO_PRONTO: entidade is the headquarters, arg the building kind now waiting to be placed.
// CONSTRUCAO_CONCLUIDA: entidade is the finished building standing on the map, arg its kind.
// SOB_ATAQUE: entidade was hit, alvo is the attacker; at most one per team every 5 s, or far from the last one (combat
//   module).
// MENSAGEM_MISSAO: arg is the index of the text in the mission's texts, (x, y) an optional area to point at.
// OBJETIVO: arg is objective index * 4 + state (1 active, 2 done, 3 failed).
// VITORIA, DERROTA: arg is the player.
// RECURSO_ESGOTADO: entidade is a battery pile that ran dry, arg the index of its node in the map's `nos`.
// COMANDO_RECUSADO: entidade is the producer or first unit of the command (SEM_ENTIDADE if none), (x, y) the command's
//   point, alvoX the player, alvoY the command kind, arg a MOTIVO.
// CARGA_DERRAMADA: entidade is the dead harvester (stale id) at (x, y), arg the Carga spilled as sparks.
// DESCARGA: entidade is the harvester, alvo the depot, arg the Carga delivered to the harvester's owner.
// RAJADA_ANUNCIADA: no entity, alvoX is the tick the gust arrives, arg the ticks until then.
// RAJADA: entidade is a windmill on a windy cell, arg the Carga it paid its owner.
// REDE_CORTADA: entidade is a building that lost power, arg its kind.
// AVISO_ATAQUE: no entity, (x, y) the centre of the area the attack will reach, arg the mission group (missions).
// ONDA: no entity, (x, y) where the group appears, arg the mission group (missions).
// PROMOCAO: entidade rose a veterancy level, arg the new level 1..3.
// RELIGADO: entidade is a structure brought back, alvo the unit that did it; its owner is now that unit's.
// CAMERA: no entity, (x, y) where the mission moves the local camera.
// LUZ: no entity, arg the lighting scene the mission asks for (dusk, night).
export const TAMANHO_EVENTO = 9;
export const E_TIPO = 0;
export const E_TICK = 1;
export const E_ENTIDADE = 2;
export const E_ALVO = 3;
export const E_X = 4;
export const E_Y = 5;
export const E_ALVO_X = 6;
export const E_ALVO_Y = 7;
export const E_ARG = 8;

// ---------- snapshot (C2) ----------

/** Bits of Retrato.bandeiras. Bits from 512 up are reserved for the combat module (raised turret, stunned, hidden). */
export const BANDEIRA = Object.freeze({
  PARADA: 1, // has no order to follow
  EM_COMBATE: 2, // has a target in range
  PRESA: 4, // movement stalled by blocking (stuck detection)
  EM_OBRA: 8, // building under construction; progresso tells how far
  ENERGIZADO: 16, // building with power (on the network, or not needing it); a network node that conducts
  OCIOSA: 32, // harvester with nothing to do (no node, no spark, nothing to unload)
  COLETANDO: 64, // harvester loading at a node, picking a spark or unloading at a depot
  ESGOTADO: 128, // resource node with nothing left
  PRODUZINDO: 256, // producer with a queue advancing
});

/** What an entity is; MapaEstatico.tipos[tipo].categoria. */
export const CATEGORIA = Object.freeze({
  UNIDADE: 0,
  PREDIO: 1,
  RECURSO: 2, // a battery pile of a resource node: fixed, finite, dims as it empties
  FAISCA: 3, // spilled charge on the ground, any harvester picks it for a while
  ESTRUTURA: 4, // neutral map structure that can be brought back (combat module)
});

/**
 * Per-entity arrays of the snapshot, in slot order, one entry per live entity (n entries).
 * Name and TypedArray constructor; the worker transfers their buffers without copying.
 */
export const CAMPOS_RETRATO = Object.freeze([
  ['id', Int32Array], // id with generation; match entities between snapshots by id, never by index
  ['tipo', Uint16Array], // index of MapaEstatico.tipos
  ['dono', Uint8Array], // player index, DONO_NEUTRO for neutral entities
  ['x', Int32Array], // position in world units; for buildings and nodes, the centre of the footprint
  ['y', Int32Array],
  ['nivel', Uint8Array], // height level of the cell, 0..3
  ['dirCorpo', Uint8Array], // body facing, 0..255
  ['dirTorre', Uint8Array], // turret facing, 0..255
  ['anim', Uint8Array], // animation code
  ['inicioAnim', Int32Array], // tick the animation started
  ['vida', Uint8Array], // health as a fraction of the maximum, 1..255 while alive
  ['bandeiras', Uint16Array], // BANDEIRA.*
  ['alvo', Int32Array], // id of the current target, or SEM_ENTIDADE
  ['progresso', Uint8Array], // building: construction done, 0..255 (255 finished); 255 for everything else
  ['carga', Uint8Array], // harvester: load as a fraction of its capacity; pile: what is left of its start; spark: what is left of its life; 0..255
  ['ocupacao', Uint8Array], // battery pile: harvesters loading at its node now (the "2/3" of the interface); 0 otherwise
  ['ligacao', Int32Array], // building: id of the network node its cable comes from, SEM_ENTIDADE if none
  ['veterania', Uint8Array], // veterancy level 0..3
]);

/** Fields of the building ghosts (enemy buildings and resource nodes last seen where the team cannot see now). */
export const CAMPOS_FANTASMA = Object.freeze([
  ['id', Int32Array],
  ['tipo', Uint16Array],
  ['dono', Uint8Array],
  ['x', Int32Array],
  ['y', Int32Array],
  ['vida', Uint8Array], // as last seen, 1..255
  ['carga', Uint8Array], // nodes: what was left when last seen, 0..255
]);

// Retrato.filas: one record of TAMANHO_REGISTRO_FILA integers per producer building of the local player, in slot
// order. FL_* are offsets in the record; the two lanes (FAIXA.*) follow at FL_FAIXAS + faixa * TAMANHO_FAIXA, with
// FX_* offsets inside a lane. Items are kinds or ITEM_PESQUISA + research; -1 marks an empty position.
export const FL_PRODUTOR = 0; // id with generation
export const FL_ENCONTRO_X = 1; // rally point in world units, -1 when none
export const FL_ENCONTRO_Y = 2;
export const FL_ENCONTRO_ALVO = 3; // rally entity id, or SEM_ENTIDADE
export const FL_FAIXAS = 4;
export const FX_ESTADO = 0; // FAIXA_ESTADO.*
export const FX_PROGRESSO = 1; // head item done, 0..1000
export const FX_N = 2; // items queued, the head included
export const FX_ITENS = 3; // MAX_FILA items, the head first
export const TAMANHO_FAIXA = FX_ITENS + MAX_FILA;
export const TAMANHO_REGISTRO_FILA = FL_FAIXAS + 2 * TAMANHO_FAIXA;
/** State of a lane's head. */
export const FAIXA_ESTADO = Object.freeze({
  VAZIA: 0,
  PRODUZINDO: 1, // advancing (at half speed when the producer has no power: see BANDEIRA.ENERGIZADO)
  ESPERA_LOTACAO: 2, // a unit waits for room under the population cap
  PRONTO: 3, // a building waits to be placed (CONSTRUIR)
  ESPERA_REQUISITO: 4, // a required building is gone
});

/**
 * One snapshot per tick, worker to main thread.
 * @typedef {object} Retrato
 * @property {'retrato'} t
 * @property {number} versao     VERSAO_SIMULACAO
 * @property {number} tick
 * @property {number} msPasso    wall time the step took in the worker (measurement only)
 * @property {number} soma       state checksum (uint32) after tick `tickSoma`; hashing the whole state costs about half a
 *                               step, so the worker does it once per second of game time (every PASSOS_POR_SEGUNDO ticks)
 * @property {number} tickSoma   the tick `soma` belongs to
 * @property {number} n          live entities, the length of every per-entity array
 * @property {Int32Array} id
 * @property {Uint16Array} tipo
 * @property {Uint8Array} dono
 * @property {Int32Array} x
 * @property {Int32Array} y
 * @property {Uint8Array} nivel
 * @property {Uint8Array} dirCorpo
 * @property {Uint8Array} dirTorre
 * @property {Uint8Array} anim
 * @property {Int32Array} inicioAnim
 * @property {Uint8Array} vida
 * @property {Uint16Array} bandeiras
 * @property {Int32Array} alvo
 * @property {Uint8Array} progresso
 * @property {Uint8Array} carga
 * @property {Uint8Array} ocupacao
 * @property {Int32Array} ligacao
 * @property {Uint8Array} veterania
 * @property {Uint8Array} visao      VISAO.* per cell for the local player's team, row-major
 * @property {Int32Array} recursos   Carga per player
 * @property {Int32Array} lotacao    per player: population used (units alive plus heads in production), then the cap
 * @property {Int32Array} filas      TAMANHO_REGISTRO_FILA integers per producer of the local player
 * @property {object} fantasmas      the local team's building ghosts: n plus every field of CAMPOS_FANTASMA
 * @property {number} proximaRajada  tick of the next wind gust, 0 when there is none
 * @property {Int32Array} eventos    TAMANHO_EVENTO integers per event, for the ticks since the previous snapshot
 */

/** Allocates the per-entity arrays of a snapshot for n entities. */
export function alocarCamposRetrato(n) {
  const campos = {};
  for (const [nome, Tipo] of CAMPOS_RETRATO) campos[nome] = new Tipo(n);
  return campos;
}

/** Allocates the ghost arrays for n ghosts. */
export function alocarFantasmas(n) {
  const fantasmas = { n };
  for (const [nome, Tipo] of CAMPOS_FANTASMA) fantasmas[nome] = new Tipo(n);
  return fantasmas;
}

/** Buffers to transfer with postMessage. */
export function transferiveisDoRetrato(retrato) {
  const lista = CAMPOS_RETRATO.map(([nome]) => retrato[nome].buffer);
  lista.push(retrato.visao.buffer, retrato.recursos.buffer, retrato.lotacao.buffer, retrato.filas.buffer, retrato.eventos.buffer);
  for (const [nome] of CAMPOS_FANTASMA) lista.push(retrato.fantasmas[nome].buffer);
  return lista;
}

/**
 * Static part of the match, sent once by the worker when it is ready.
 * @typedef {object} MapaEstatico
 * @property {'pronto'} t
 * @property {number} versao      VERSAO_SIMULACAO
 * @property {number} largura     cells
 * @property {number} altura
 * @property {Uint8Array} bloqueado 1 where ground units cannot pass
 * @property {Uint8Array} relevo  0..255 visual relief
 * @property {Uint8Array} nivel   height level 0..3 per cell
 * @property {Uint8Array} ventosa 1 on windy cells, where windmills can stand
 * @property {Uint8Array} cobertura 0 none, 1 brush, 2 ruins (combat module)
 * @property {Uint8Array} solo    ground kind per cell, for the terrain art (0 when the map has no such layer)
 * @property {Uint8Array} decoracao decoration id per cell, presentation only
 * @property {{x: number, y: number}[]} bases start cells per player
 * @property {number} jogadorLocal the player the snapshot's visao belongs to
 * @property {{jogador: number, time: number, faccao: string}[]} jogadores
 * @property {TipoEstatico[]} tipos every kind, indexed by the snapshot's `tipo`
 * @property {{nome: string, predio: number, custo: number, tempo: number}[]} pesquisas research, by index
 * @property {{x: number, y: number}[]} nos resource nodes of the map (cells), by index
 * @property {string[]} solos     names of the ground kinds of the `solo` layer, by value (empty for a generated map)
 * @property {string[]} decoracoes names of the decorations, the `decoracao` layer's value minus one
 * @property {object} economia    economy rules: lotacaoMaxima, saturacao, distanciaMinimaPilha (cells), faiscaCarga,
 *                                duracaoFaisca, intervaloRajada, avisoRajada (ticks), loteRajada, reciclarPorcento
 */

/**
 * A kind as the presentation and the interface see it (the simulation's compiled kind, minus the internals).
 * Costs in Carga, times in ticks, sizes in cells; kind lists are indices of MapaEstatico.tipos.
 * @typedef {object} TipoEstatico
 * @property {string} nome       unique, lowercase with hyphens
 * @property {number} categoria  CATEGORIA.*
 * @property {string} faccao     '' for neutral kinds
 * @property {string} asset      sprite manifest name (C9), '' when it has none yet
 * @property {number[]} pegada   [largura, altura] footprint in cells; [1, 1] for units and sparks
 * @property {number} custo
 * @property {number} tempo      production or construction time
 * @property {number} lotacao    population points
 * @property {number} vida
 * @property {number} visao      sight radius in cells
 * @property {number[]} produz   units this producer makes, in its unit lane, in the order of the command grid
 * @property {number[]} constroi buildings the headquarters makes in its construction lane, in grid order
 * @property {number[]} ergue    buildings this unit raises on site
 * @property {number[]} requer   buildings that must stand before this kind can be queued
 * @property {number} raioRede   network radius in cells (0: not a network node)
 * @property {number} raizRede   1: powers the network by itself (headquarters, forward post)
 * @property {number} precisaRede 1: works at half speed without power
 * @property {number} raioConstrucao building area around it for factions without a network, cells
 * @property {number} exigeVentosa 1: must stand on a windy cell
 * @property {number} filaConstrucao 1: has the construction lane (headquarters)
 * @property {number} deposito   1: harvesters unload here
 * @property {number} coletor    1: harvester
 * @property {number} capacidade Carga a harvester carries
 * @property {number} limite     most of this kind a player may have, 0 for no limit
 */

// ---------- team view for computer players (C4) ----------

/**
 * What one team can see: the only input of a computer player, so it cannot cheat by construction.
 * Produced by vistaDoTime(sim, time) in sim/; same per-entity layout as the snapshot.
 * @typedef {object} VistaDoTime
 * @property {number} tick
 * @property {number} time
 * @property {Int32Array} recursos   Carga of each player, indexed by player, with only this team's players filled
 * @property {Int32Array} lotacao    [used, cap] of each player, same rule
 * @property {Int32Array} filas      records of the team's producers, as Retrato.filas
 * @property {object} proprias       own entities, every field of CAMPOS_RETRATO plus n
 * @property {object} inimigas       other entities (enemies and neutral) on visible cells, same layout
 * @property {object} fantasmas      buildings and nodes of others last seen on cells not visible now (CAMPOS_FANTASMA)
 * @property {number} proximaRajada  tick of the next wind gust, 0 when none
 * @property {Uint8Array} visao      VISAO.* per cell for this team
 */

// ---------- messages between the main thread and the worker ----------

/** Main thread to worker. */
export const PARA_TRABALHADOR = Object.freeze({
  INICIAR: 'iniciar', // { opcoes: criarSimulacao options plus avancar (ticks to fast-forward), jogadorLocal and teste }
  COMANDO: 'comando', // { comando }: a Comando without tick; the worker schedules it for the next tick
  PAUSAR: 'pausar', // { valor: boolean, motivo: 'jogador' | 'visibilidade' }; the clock runs only with no reason left
  VELOCIDADE: 'velocidade', // { percentual: one of VELOCIDADES }
  SALVAR: 'salvar', // {}
  CARREGAR: 'carregar', // { bytes: ArrayBuffer from SALVO }; answered with PRONTO
  AVANCAR: 'avancar', // { passos }: only when INICIAR had opcoes.teste; runs the ticks at once, paused or not, and answers one RETRATO
});

/** Worker to main thread. */
export const DO_TRABALHADOR = Object.freeze({
  PRONTO: 'pronto', // MapaEstatico
  RETRATO: 'retrato', // Retrato
  SALVO: 'salvo', // { tick, bytes: ArrayBuffer, replay: replay JSON of the match so far, or null after a load }
  ERRO: 'erro', // { mensagem }; the clock stops
});
