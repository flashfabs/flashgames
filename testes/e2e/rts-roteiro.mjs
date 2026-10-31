// A scripted player for the grey slice end-to-end tests: given a decoded snapshot (window.__rts.retrato(), or
// decodificarRetrato in Node), it returns the commands a plain defensive player would give now. The same function
// drives the browser test and a Node run of the real simulation, so a plan tuned in Node is the plan the test plays.
// Plan: an accumulator (the depot) and two barracks from the headquarters, harvesters on the nearest pile once the
// depot stands, lost harvesters replaced before anything else, every barracks always training a squad, and the
// squads held next to that pile, which is what the waves go for, so the income survives them; enemies that come
// near the headquarters or the pile are chased down by every squad standing idle.
// A mission can add two steps through its options (opcoesDaMissao, from the map): clearing a far node, where the army
// takes out the guards of a battery yard along a map route so the harvesters can work it once the piles near the base
// run dry (they carry to the depot at home; the guard stays by the base); and the Religador, whom the idle squads
// escort to the substation along a map route once one is on the map and the base is quiet, holding there while it
// re-powers it. Squads that stay or are trained afterwards guard the base.

import { BANDEIRA, CATEGORIA } from '../../site/rts/js/sim/contratos.js';

/** Seconds of game between two decisions. */
export const DECISAO_SEGUNDOS = 5;
const PLANO = ['acumulador', 'alojamento-da-turma', 'alojamento-da-turma'];
// spots for a new building around the headquarters, in cells, tried in turn until one is accepted
const LUGARES = [[4, -6], [5, -1], [-2, -7], [5, 3], [-6, -6], [1, -10], [8, -5], [8, 0], [-4, 3], [3, 6], [9, -9], [-1, 7]];
// the guard point sits on the line from the harvested pile to the headquarters, this share of the way
const GUARDA_PARA_O_QG = 0.25;
// enemies this close to the headquarters or to the harvested pile are chased
const RAIO_AMEACA = 16 * 1024;
const CELULA = 1024;
const { PARADA, OCIOSA } = BANDEIRA;
const COMBATENTES = ['turma-de-linha', 'cesto-blindado'];
// share of the idle squads at home that stays to guard the base (at least 3) when the army leaves to clear a node,
// and when the escort leaves: the waves already called still come at the base while the escort is away
const FICAM_NO_ATAQUE = 1 / 6;
const FICAM_NA_ESCOLTA = 1 / 3;
// a group is sent on to the next point of its route this far before it reaches one, so it does not stop at each
const ANTES_DO_PONTO = 10 * CELULA;

// clearing a node: idle squads at home it takes to leave; enemies this close to a node (or a pile) guard it
const ATAQUE_MINIMO = 12;
const RAIO_DO_NO = 12 * CELULA;

// the Religador: the structure it is taken to, the idle squads at home the escort takes to leave
const ALVO_RELIGAR = 'subestacao';
const ESCOLTA_MINIMA = 8;
// the escort this close to the substation lets the Religador start; a Religador farther than this from its escort
// waits for it to come back
const PERTO_DO_ALVO = 9 * CELULA;
const SEPARADOS = 24 * CELULA;
// enemies this close to the substation are chased by the escort holding it, and squads of ours this close to it (the
// reinforcement the mission sends) join the escort
const RAIO_DO_ALVO = 14 * CELULA;
const JUNTAM_SE = 30 * CELULA;

// per mission, names in the map's entidades.json: the route the escort follows to the substation, and the node to
// clear and the route there
const MISSOES = {
  'morro-aceso': { rota: 'rota-aberta', limpar: { no: 'cemiterio-norte', rota: 'rota-estreita' } },
};

const pontoDaCelula = ([x, y]) => ({ x: x * CELULA + CELULA / 2, y: y * CELULA + CELULA / 2 });
const custoDe = (tipos, nome) => tipos.find(t => t.nome === nome)?.custo ?? 0;
const distancia = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const centroDe = lista => ({ x: Math.round(lista.reduce((s, e) => s + e.x, 0) / lista.length), y: Math.round(lista.reduce((s, e) => s + e.y, 0) / lista.length) });
const ehUnidadeInimiga = (e, mapa) => e.dono === 1 && mapa.tipos[e.tipo]?.categoria === CATEGORIA.UNIDADE;
const maisPerto = (lista, ponto) => lista.slice().sort((a, b) => distancia(a, ponto) - distancia(b, ponto))[0];

/** Options of criarRoteiro for a mission, from its map's entidades.json; {} for a mission with none. */
export function opcoesDaMissao(missao, entidadesDoMapa) {
  const plano = MISSOES[missao];
  if (!plano) return {};
  const rotas = entidadesDoMapa?.rotas ?? {};
  const opcoes = { rota: rotas[plano.rota]?.map(pontoDaCelula) ?? null, coletaSegura: true };
  const no = entidadesDoMapa?.nos?.find(n => n.id === plano.limpar?.no);
  if (no) {
    // the route to the node is followed up to its point nearest the node
    const caminho = (rotas[plano.limpar.rota] ?? []).map(pontoDaCelula);
    const alvo = pontoDaCelula([no.x, no.y]);
    const ultimo = caminho.indexOf(maisPerto(caminho, alvo));
    opcoes.limpar = { ...alvo, rota: caminho.slice(0, ultimo + 1) };
  }
  return opcoes;
}

/** New state for one match. */
export function criarRoteiro({ rota = null, coletaSegura = false, limpar = null } = {}) {
  return {
    proximo: 0, lugar: 0, decisoes: 0, coletaSegura, pilhaDeCasa: null,
    limpar, fase: limpar ? 'base' : 'feito', ataque: [],
    rota, escolta: [],
    // per group: the place it was last sent to and how far along its route it got
    destinos: {}, passos: {},
  };
}

/** The point of `rota` a group marches to next (the one after the farthest it reached), or null past the last one. */
function pontoDaRota(roteiro, grupo, rota, centro) {
  if (!rota) return null;
  // the march joins the route at the point nearest the group, and never steps back along it
  if (roteiro.passos[grupo] === undefined) roteiro.passos[grupo] = rota.indexOf(maisPerto(rota, centro));
  while (roteiro.passos[grupo] < rota.length && distancia(rota[roteiro.passos[grupo]], centro) <= ANTES_DO_PONTO) roteiro.passos[grupo]++;
  return rota[roteiro.passos[grupo]] ?? null;
}

/** Sends a group to `destino` attacking on the way, again only when that place moved or someone stopped short of it. */
function irPara(roteiro, grupo, unidades, destino, comandos) {
  const anterior = roteiro.destinos[grupo];
  const mudou = !anterior || distancia(anterior, destino) > 4 * CELULA;
  const paradas = unidades.filter(e => (e.bandeiras & PARADA) && distancia(e, destino) > 4 * CELULA).map(e => e.id);
  if (mudou || paradas.length > 0) comandos.push({ tipo: 'ATACAR_MOVENDO', unidades: mudou ? unidades.map(e => e.id) : paradas, x: destino.x, y: destino.y });
  roteiro.destinos[grupo] = { x: destino.x, y: destino.y };
}

/**
 * A new group out of the idle squads at home when at least `minimo` stand idle; the `ficam` share nearest the
 * headquarters stays.
 */
function formarGrupo(roteiro, grupo, emCasa, qg, minimo, ficam) {
  const ociosas = emCasa.filter(e => e.bandeiras & PARADA).sort((a, b) => distancia(a, qg) - distancia(b, qg));
  if (ociosas.length < minimo) return [];
  delete roteiro.passos[grupo];
  delete roteiro.destinos[grupo];
  return ociosas.slice(Math.max(3, Math.round(ociosas.length * ficam))).map(e => e.id);
}

/** Clearing the mission's node: the army marches there along the route and takes out every enemy around it. */
function limparNo(r, roteiro, mapa, { qg, emCasa, vivas }) {
  const comandos = [];
  const no = roteiro.limpar;
  roteiro.ataque = roteiro.ataque.filter(id => vivas.has(id));
  if (roteiro.ataque.length === 0) {
    // an escort already out takes precedence
    if (roteiro.escolta.length > 0) return comandos;
    roteiro.ataque = formarGrupo(roteiro, 'ataque', emCasa, qg, ATAQUE_MINIMO, FICAM_NO_ATAQUE);
    if (roteiro.ataque.length === 0) return comandos;
  }
  const ataque = roteiro.ataque.map(id => vivas.get(id));
  const centro = centroDe(ataque);
  if (distancia(centro, no) > RAIO_DO_NO) {
    irPara(roteiro, 'ataque', ataque, pontoDaRota(roteiro, 'ataque', no.rota, centro) ?? no, comandos);
    return comandos;
  }
  const guardas = r.entidades.filter(e => e.dono === 1 && distancia(e, no) <= RAIO_DO_NO);
  const unidade = maisPerto(guardas.filter(e => ehUnidadeInimiga(e, mapa)), centro);
  if (unidade) {
    irPara(roteiro, 'ataque', ataque, unidade, comandos);
  } else if (guardas.length > 0) {
    // squads attacking on the move may walk past a building: the tower is ordered by name
    const ociosas = ataque.filter(e => e.bandeiras & PARADA).map(e => e.id);
    if (ociosas.length > 0) comandos.push({ tipo: 'ATACAR', unidades: ociosas, alvo: maisPerto(guardas, centro).id });
  } else {
    // clear: the army goes back to guarding the base
    roteiro.fase = 'feito';
    roteiro.ataque = [];
  }
  return comandos;
}

/** Escort orders for a Religador on its way to the substation and while it re-powers it. */
function escoltar(r, roteiro, mapa, { qg, emCasa, vivas, religador, emPaz }) {
  const comandos = [];
  const alvo = r.entidades.find(e => e.nome === ALVO_RELIGAR);
  roteiro.escolta = roteiro.escolta.filter(id => vivas.has(id));
  if (!religador || !alvo || alvo.dono === 0) return comandos;
  // the escort leaves only while no enemy is at the base
  if (roteiro.escolta.length === 0 && emPaz) roteiro.escolta = formarGrupo(roteiro, 'escolta', emCasa, qg, ESCOLTA_MINIMA, FICAM_NA_ESCOLTA);
  if (roteiro.escolta.length === 0) return comandos;
  roteiro.escolta.push(...emCasa.filter(e => !roteiro.escolta.includes(e.id) && distancia(e, alvo) <= JUNTAM_SE).map(e => e.id));
  const escolta = roteiro.escolta.map(id => vivas.get(id));
  const centro = centroDe(escolta);
  if (distancia(religador, centro) > SEPARADOS) {
    irPara(roteiro, 'escolta', escolta, religador, comandos);
    comandos.push({ tipo: 'MOVER', unidades: [religador.id], x: centro.x, y: centro.y });
  } else if (distancia(centro, alvo) > PERTO_DO_ALVO) {
    irPara(roteiro, 'escolta', escolta, pontoDaRota(roteiro, 'escolta', roteiro.rota, centro) ?? alvo, comandos);
    comandos.push({ tipo: 'MOVER', unidades: [religador.id], x: centro.x, y: centro.y });
  } else {
    if (religador.bandeiras & PARADA) comandos.push({ tipo: 'HABILIDADE', unidades: [religador.id], alvo: alvo.id, arg: 1 });
    const ameaca = maisPerto(r.entidades.filter(e => ehUnidadeInimiga(e, mapa) && distancia(e, alvo) <= RAIO_DO_ALVO), alvo);
    irPara(roteiro, 'escolta', escolta, ameaca ?? alvo, comandos);
  }
  return comandos;
}

/**
 * Commands for this moment of the match: [{ tipo: name of TIPO_COMANDO, unidades, alvo, x, y, arg }].
 * @param {object} r decoded snapshot with kind names (entidades[].nome) and queues (filas)
 * @param {object} roteiro state from criarRoteiro, updated in place
 * @param {{tipos: {nome: string, custo: number}[]}} mapa the static map (kinds by index)
 */
export function decidir(r, roteiro, mapa) {
  const comandos = [];
  const tipoDe = nome => mapa.tipos.findIndex(t => t.nome === nome);
  const minhas = nome => r.entidades.filter(e => e.dono === 0 && e.nome === nome);
  const qg = minhas('escritorio-regional')[0];
  if (!qg) return comandos;
  let carga = r.recursos[0];
  const fila = id => r.filas.find(f => f.produtor === id);
  const filaQg = fila(qg.id);
  roteiro.decisoes++;

  // the headquarters' construction lane: place what is ready, else queue the next building of the plan
  const construcao = filaQg?.faixas.CONSTRUCAO;
  if (construcao?.estado === 'PRONTO') {
    const [dx, dy] = LUGARES[roteiro.lugar++ % LUGARES.length];
    comandos.push({ tipo: 'CONSTRUIR', unidades: [qg.id], arg: tipoDe(construcao.itens[0]), x: qg.x + dx * CELULA, y: qg.y + dy * CELULA });
  } else if (construcao && construcao.itens.length === 0 && roteiro.proximo < PLANO.length && carga >= custoDe(mapa.tipos, PLANO[roteiro.proximo])) {
    const nome = PLANO[roteiro.proximo++];
    carga -= custoDe(mapa.tipos, nome);
    comandos.push({ tipo: 'PRODUZIR', unidades: [qg.id], arg: tipoDe(nome) });
  }

  // harvesters work once a depot stands, on the pile nearest the headquarters (in a mission that asks, one with no
  // enemy around it)
  const guardada = e => r.entidades.some(o => o.dono === 1 && distancia(o, e) <= RAIO_DO_NO);
  const pilha = r.entidades
    .filter(e => e.nome === 'pilha' && e.carga > 0 && !(roteiro.coletaSegura && guardada(e)))
    .sort((a, b) => Math.hypot(a.x - qg.x, a.y - qg.y) - Math.hypot(b.x - qg.x, b.y - qg.y))[0];
  if (pilha && !roteiro.pilhaDeCasa) roteiro.pilhaDeCasa = { x: pilha.x, y: pilha.y };
  if (minhas('acumulador').some(a => a.progresso === 255)) {
    const ociosos = r.entidades.filter(e => e.dono === 0 && e.nome === 'guincho-de-celulas' && (e.bandeiras & OCIOSA)).map(e => e.id);
    if (ociosos.length > 0 && pilha) comandos.push({ tipo: 'COLETAR', unidades: ociosos, alvo: pilha.id });
  }

  // three harvesters before anything else: without them there is no army either
  const custoGuincho = custoDe(mapa.tipos, 'guincho-de-celulas');
  const faltamGuinchos = minhas('guincho-de-celulas').length < 3;
  if (faltamGuinchos && filaQg?.faixas.UNIDADES.itens.length === 0 && carga >= custoGuincho) {
    carga -= custoGuincho;
    comandos.push({ tipo: 'PRODUZIR', unidades: [qg.id], arg: tipoDe('guincho-de-celulas') });
  }
  // every finished barracks always trains a squad, keeping the price of a harvester while one is missing
  const turma = tipoDe('turma-de-linha');
  const reserva = faltamGuinchos ? custoGuincho : 0;
  for (const alojamento of minhas('alojamento-da-turma')) {
    const faixa = fila(alojamento.id)?.faixas.UNIDADES;
    if (alojamento.progresso === 255 && faixa && faixa.itens.length === 0 && carga - reserva >= custoDe(mapa.tipos, 'turma-de-linha')) {
      carga -= custoDe(mapa.tipos, 'turma-de-linha');
      comandos.push({ tipo: 'PRODUZIR', unidades: [alojamento.id], arg: turma });
    }
  }

  // the guard point and the enemies near the base; in a mission that harvests far away, the guard stays by the first
  // pile, next to the base
  const base = (roteiro.limpar ? roteiro.pilhaDeCasa : pilha) ?? qg;
  const guarda = { x: Math.round(base.x + (qg.x - base.x) * GUARDA_PARA_O_QG), y: Math.round(base.y + (qg.y - base.y) * GUARDA_PARA_O_QG) };
  const perto = (e, alvo) => Math.hypot(e.x - alvo.x, e.y - alvo.y) <= RAIO_AMEACA;
  const ameaca = r.entidades
    .filter(e => ehUnidadeInimiga(e, mapa) && (perto(e, qg) || perto(e, guarda)))
    .sort((a, b) => Math.hypot(a.x - qg.x, a.y - qg.y) - Math.hypot(b.x - qg.x, b.y - qg.y))[0];

  // the mission's steps take groups out of the squads at home
  const todos = r.entidades.filter(e => e.dono === 0 && COMBATENTES.includes(e.nome));
  const vivas = new Map(todos.map(e => [e.id, e]));
  const fora = () => new Set([...roteiro.ataque, ...roteiro.escolta]);
  const emCasa = () => todos.filter(e => !fora().has(e.id));
  if (roteiro.fase !== 'feito') comandos.push(...limparNo(r, roteiro, mapa, { qg, emCasa: emCasa(), vivas }));
  comandos.push(...escoltar(r, roteiro, mapa, { qg, emCasa: emCasa(), vivas, religador: minhas('religador')[0], emPaz: !ameaca }));

  // idle squads at home chase the nearest enemy near the base or the pile, else go back to the guard point
  const longeDeCasa = fora();
  const paradas = todos.filter(e => !longeDeCasa.has(e.id) && (e.bandeiras & PARADA));
  if (ameaca && paradas.length > 0) {
    comandos.push({ tipo: 'ATACAR_MOVENDO', unidades: paradas.map(e => e.id), x: ameaca.x, y: ameaca.y });
  } else if (roteiro.decisoes % 2 === 0) {
    const longe = paradas.filter(e => Math.hypot(e.x - guarda.x, e.y - guarda.y) > 4 * CELULA).map(e => e.id);
    if (longe.length > 0) comandos.push({ tipo: 'ATACAR_MOVENDO', unidades: longe, x: guarda.x, y: guarda.y });
  }
  return comandos;
}
