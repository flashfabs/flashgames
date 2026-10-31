// Computer teams of a mission (C7, the "equipes" block, front F6): each team is a mission group of one computer player
// with a behaviour: guard a zone, patrol a route, attack along a route, fall back, or rebuild its buildings. This file
// holds the format, its compiler and the teams' saved state; indice.js runs them behind the step seam (sim/equipes.js)
// and decisoes.js decides, from the team's view alone.
//
// Format, in the mission next to "gatilhos". Every number may be { "facil", "normal", "dificil" } as in the triggers;
// positions in cells, times in seconds; places by name, looked up in the mission first and then in the map; groups are
// mission labels or unions, as in the triggers, and must be labels the mission knows (rotulosDaMissao):
//   "equipes": [{ "id", "grupo", "jogador", "faz": "guardar" | "patrulhar" | "atacar" | "recuar" | "reconstruir",
//     "desde"?: <trigger id> (starts once it fired), "ate"?: <trigger id> (stops once it fired; units keep their last
//     order),
//     guardar: "area" | "ponto" (with "raio", 4), "alcance" (6): attacks what it sees in the zone or that many cells
//       around it, and goes back once it sees nothing for 5 s;
//     patrulhar: "rota" walked back and forth by attack-move, "alcance" (6) cells around the team to turn on;
//     atacar: "rota"?, "area" | "ponto" (the destination), "aviso" (seconds, 0 or at least 10: with a warning the team
//       sends AVISO_ATAQUE when it starts and ONDA when it leaves; 0 when a trigger already warned), "coletores"
//       (percent of the team sent at harvesters in sight; 0, 25 and 50 by difficulty when left out), "escala"?:
//       { "reserva": <group>, "porcento" (100), "minimo" (1), "maximo" (60) } (the wave's strength follows the
//       player's army the team has seen: units come from the reserve, or go back to it; a team with "escala" and no
//       unit of its own forms its wave from the reserve, once per firing of its "desde" trigger, or once without one);
//     recuar: "area" | "ponto": goes there and guards it ("alcance" 4);
//     reconstruir: "espera" (20): rebuilds the group's buildings that fall, queued at a headquarters of the group with
//       the player's own Carga and placed where they stood;
//     guardar, patrulhar and atacar also take "recuar" (percent, 0 never) and "recuo" (area or point): under that
//     share of its strength, with more armed enemy strength in sight than its own, the team falls back there and
//     guards it }]
// A unit is in the first active team, in file order, whose group it carries.
import { FP, PASSOS_POR_SEGUNDO, MAX_UNIDADES_POR_COMANDO } from '../contratos.js';
import * as estado from '../estado.js';
import { missaoDe, indiceDificuldade, rotulosDaMissao } from '../gatilhos.js';
import { COMPORTAMENTO, FASE, PREDIO, MAX_PREDIOS_EQUIPE, CAMPOS_PREDIO } from './decisoes.js';

export { COMPORTAMENTO, FASE, PREDIO, MAX_PREDIOS_EQUIPE };

/** Most teams one mission may have. */
export const MAX_EQUIPES = 64;
const NOMES = { guardar: COMPORTAMENTO.GUARDAR, patrulhar: COMPORTAMENTO.PATRULHAR, atacar: COMPORTAMENTO.ATACAR, recuar: COMPORTAMENTO.RECUAR, reconstruir: COMPORTAMENTO.RECONSTRUIR };
const DIFICULDADES = ['facil', 'normal', 'dificil'];
const COLETORES_PADRAO = [0, 25, 50];
const MAX_VALOR = 0x3fffffff;

const listaDeEquipes = missao => (Array.isArray(missao?.equipes) ? missao.equipes : []);

/**
 * The teams of a mission compiled against the kinds, the places and the difficulty, or null when it has none.
 * Throws with every problem found.
 * @param {object} missao the mission JSON
 * @param {{ lugares?: object, dificuldade?: string|number, times: number, largura: number, altura: number }} contexto
 */
export function compilarEquipes(missao, contexto) {
  const lista = listaDeEquipes(missao);
  if (lista.length === 0) return null;
  const erros = [];
  const { times, largura, altura } = contexto;
  const lugares = contexto.lugares ?? {};
  const dificuldade = indiceDificuldade(contexto.dificuldade);
  if (lista.length > MAX_EQUIPES) erros.push(`equipes: ${lista.length}, no máximo ${MAX_EQUIPES}`);

  const numero = (onde, v, minimo = -MAX_VALOR, maximo = MAX_VALOR) => {
    let valor = v;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (!DIFICULDADES.every(d => d in v)) {
        erros.push(`${onde}: o valor por dificuldade precisa de ${DIFICULDADES.join(', ')}`);
        return 0;
      }
      valor = v[DIFICULDADES[dificuldade]];
    }
    if (!Number.isInteger(valor)) {
      erros.push(`${onde}: ${JSON.stringify(v)} não é inteiro`);
      return 0;
    }
    if (valor < minimo || valor > maximo) erros.push(`${onde}: ${valor} fora de ${minimo}..${maximo}`);
    return valor;
  };
  const opcional = (onde, v, padrao, minimo, maximo) => (v === undefined ? padrao : numero(onde, v, minimo, maximo));

  const rotulos = rotulosDaMissao(missao);
  const unioes = missao.grupos && typeof missao.grupos === 'object' ? missao.grupos : {};
  const membrosDaUniao = u => (Array.isArray(u) ? u : Array.isArray(u?.etiquetas) ? u.etiquetas : []);
  // labels marked by a group name, and the label its events and new members carry (a union's first one)
  const grupo = (onde, nome) => {
    const marcas = new Uint8Array(rotulos.length);
    if (typeof nome !== 'string') {
      erros.push(`${onde}: falta o nome do grupo`);
      return { grupo: marcas, rotulo: 0, nome: '' };
    }
    const nomes = nome in unioes ? membrosDaUniao(unioes[nome]) : [nome];
    for (const r of nomes) {
      const k = rotulos.indexOf(r);
      if (k < 0) erros.push(`${onde}: ${r} não é rótulo da missão (use-o num gatilho ou numa união)`);
      else marcas[k] = 1;
    }
    const principal = Math.max(0, rotulos.indexOf(nomes[0]));
    return { grupo: marcas, rotulo: principal, nome: rotulos[principal] ?? '' };
  };
  const gatilhos = Array.isArray(missao.gatilhos) ? missao.gatilhos : [];
  // a trigger id the mission has, or null
  const gatilho = (onde, id) => {
    if (id === undefined) return null;
    if (!gatilhos.some(g => g?.id === id)) erros.push(`${onde}: gatilho ${id} não existe`);
    return id;
  };
  const procurar = (colecao, nome) => missao[colecao]?.[nome] ?? lugares[colecao]?.[nome];
  const area = (onde, nome) => {
    const a = procurar('areas', nome);
    if (!a) {
      erros.push(`${onde}: área ${nome} não existe na missão nem no mapa`);
      return null;
    }
    const cx0 = numero(`${onde}.x`, a.x, 0, largura - 1);
    const cy0 = numero(`${onde}.y`, a.y, 0, altura - 1);
    const cx1 = cx0 + numero(`${onde}.largura`, a.largura, 1, largura - cx0);
    const cy1 = cy0 + numero(`${onde}.altura`, a.altura, 1, altura - cy0);
    return { cx0, cy0, cx1, cy1, x: ((cx0 + cx1) * FP) >> 1, y: ((cy0 + cy1) * FP) >> 1 };
  };
  const ponto = (onde, nome, raio) => {
    const p = procurar('pontos', nome);
    if (!Array.isArray(p) || p.length !== 2) {
      erros.push(`${onde}: ponto ${nome} não existe na missão nem no mapa`);
      return null;
    }
    const cx = numero(`${onde}.x`, p[0], 0, largura - 1);
    const cy = numero(`${onde}.y`, p[1], 0, altura - 1);
    return { cx0: Math.max(0, cx - raio), cy0: Math.max(0, cy - raio), cx1: Math.min(largura, cx + raio + 1), cy1: Math.min(altura, cy + raio + 1), x: cx * FP + (FP >> 1), y: cy * FP + (FP >> 1) };
  };
  // the place of an item: its "area", or its "ponto" with "raio"
  const lugar = (onde, item, chaveArea, chavePonto, obrigatorio) => {
    if (item[chaveArea] !== undefined) return area(`${onde}.${chaveArea}`, item[chaveArea]);
    if (item[chavePonto] !== undefined) return ponto(`${onde}.${chavePonto}`, item[chavePonto], opcional(`${onde}.raio`, item.raio, 4, 0, 32));
    if (obrigatorio) erros.push(`${onde}: falta ${chaveArea} ou ${chavePonto}`);
    return null;
  };
  // an area of that name, else a point of that name with a 4-cell radius
  const lugarPorNome = (onde, nome) => (procurar('areas', nome) ? area(onde, nome) : ponto(onde, nome, 4));
  const rota = (onde, nome) => {
    const r = procurar('rotas', nome);
    if (!Array.isArray(r) || r.length === 0) {
      erros.push(`${onde}: rota ${nome} não existe na missão nem no mapa`);
      return [];
    }
    return r.map((p, k) => {
      const cx = numero(`${onde}[${k}].x`, p?.[0], 0, largura - 1);
      const cy = numero(`${onde}[${k}].y`, p?.[1], 0, altura - 1);
      return Object.freeze({ x: cx * FP + (FP >> 1), y: cy * FP + (FP >> 1) });
    });
  };
  const segundos = (onde, v, padrao) => opcional(onde, v, padrao, 0, 3600) * PASSOS_POR_SEGUNDO;

  const ids = new Set();
  const equipes = lista.map((item, e) => {
    const onde = `equipes[${item?.id ?? e}]`;
    if (!item || typeof item !== 'object') {
      erros.push(`${onde}: não é um objeto`);
      return null;
    }
    if (typeof item.id !== 'string' || ids.has(item.id)) erros.push(`${onde}: id ausente ou repetido`);
    ids.add(item.id);
    const faz = NOMES[item.faz];
    if (!faz) erros.push(`${onde}.faz: ${item.faz} não é guardar, patrulhar, atacar, recuar nem reconstruir`);
    const g = grupo(`${onde}.grupo`, item.grupo ?? item.etiqueta);
    const eq = {
      id: item.id,
      faz,
      jogador: numero(`${onde}.jogador`, item.jogador, 0, times - 1),
      grupo: g.grupo,
      rotulo: g.rotulo,
      desde: gatilho(`${onde}.desde`, item.desde),
      ate: gatilho(`${onde}.ate`, item.ate),
      alcance: opcional(`${onde}.alcance`, item.alcance, faz === COMPORTAMENTO.RECUAR ? 4 : 6, 0, 32),
      lugar: null,
      rota: [],
      aviso: 0,
      coletores: 0,
      recuar: opcional(`${onde}.recuar`, item.recuar, 0, 0, 100),
      recuo: null,
      escala: null,
      espera: segundos(`${onde}.espera`, item.espera, 20),
    };
    if (faz === COMPORTAMENTO.GUARDAR || faz === COMPORTAMENTO.RECUAR) eq.lugar = lugar(onde, item, 'area', 'ponto', true);
    if (faz === COMPORTAMENTO.RECUAR) eq.recuo = eq.lugar;
    if (faz === COMPORTAMENTO.PATRULHAR) {
      eq.rota = rota(`${onde}.rota`, item.rota);
      if (eq.rota.length === 0) erros.push(`${onde}.rota: a patrulha precisa de uma rota`);
    }
    if (faz === COMPORTAMENTO.ATACAR) {
      if (item.rota !== undefined) eq.rota = rota(`${onde}.rota`, item.rota);
      eq.lugar = lugar(onde, item, 'area', 'ponto', true);
      const aviso = numero(`${onde}.aviso`, item.aviso ?? 0, 0, 600);
      if (aviso > 0 && aviso < 10) erros.push(`${onde}.aviso: ${aviso} s; o aviso é 0 (dado por um gatilho) ou pelo menos 10 s`);
      eq.aviso = aviso * PASSOS_POR_SEGUNDO;
      eq.coletores = opcional(`${onde}.coletores`, item.coletores, COLETORES_PADRAO[dificuldade], 0, 100);
      if (item.escala !== undefined) {
        const es = item.escala ?? {};
        const reserva = grupo(`${onde}.escala.reserva`, es.reserva);
        eq.escala = Object.freeze({
          reserva: Object.freeze({ grupo: reserva.grupo, rotulo: reserva.rotulo }),
          porcento: opcional(`${onde}.escala.porcento`, es.porcento, 100, 0, 1000),
          minimo: opcional(`${onde}.escala.minimo`, es.minimo, 1, 0, MAX_UNIDADES_POR_COMANDO),
          maximo: opcional(`${onde}.escala.maximo`, es.maximo, 60, 1, MAX_UNIDADES_POR_COMANDO),
        });
      }
    }
    if (faz === COMPORTAMENTO.GUARDAR || faz === COMPORTAMENTO.PATRULHAR || faz === COMPORTAMENTO.ATACAR) {
      if (item.recuo !== undefined) eq.recuo = lugarPorNome(`${onde}.recuo`, item.recuo);
      else if (eq.recuar > 0) erros.push(`${onde}: recuar sem recuo`);
    }
    return Object.freeze(eq);
  });
  if (erros.length > 0) throw new Error(`equipes da missão ${missao.id ?? ''} inválidas:\n${erros.join('\n')}`);
  const jogadores = [...new Set(equipes.map(eq => eq.jogador))].sort((a, b) => a - b);
  return Object.freeze({ equipes: Object.freeze(equipes), jogadores: Object.freeze(jogadores), rotulos });
}

/** The compiled teams of a simulation's mission, or null; rebuilt from the saved options after a load. */
export function equipesDaPartida(sim) {
  if (sim.equipesCompiladas !== undefined) return sim.equipesCompiladas;
  const missao = sim.opcoes?.missao;
  // off wherever the mission is off (another map: missaoDe gives null)
  if (listaDeEquipes(missao).length === 0 || !missaoDe(sim)) {
    sim.equipesCompiladas = null;
    return null;
  }
  const { mapa } = sim;
  const lugares = sim.opcoes.lugares ?? mapa.lugares ?? { areas: mapa.areas, pontos: mapa.pontos, rotas: mapa.rotas };
  sim.equipesCompiladas = compilarEquipes(missao, { lugares, dificuldade: sim.opcoes.dificuldade, times: sim.times, largura: mapa.largura, altura: mapa.altura });
  return sim.equipesCompiladas;
}

// compiled once per match, keyed by the match's teams state (a new one after a load)
const doContexto = new WeakMap();

/** The same compiled teams from a seam context (sim/equipes.js): the mission, places, difficulty and static map. */
export function equipesDoContexto(ctx) {
  let c = doContexto.get(ctx.estado);
  if (c === undefined) {
    c = compilarEquipes(ctx.missao, { lugares: ctx.lugares ?? {}, dificuldade: ctx.dificuldade, times: ctx.vista.recursos.length, largura: ctx.mapa.largura, altura: ctx.mapa.altura });
    doContexto.set(ctx.estado, c);
  }
  return c;
}

/**
 * The teams' state (sim.extras.comportamentos, the seam's ctx.estado), only typed arrays sized from the mission JSON
 * alone: per team its phase and the tick it began, route point and direction, strength at the start, last enemy
 * contact, last order (kind, target, tick), whether it fell back, the harvester it hunts and since when, the
 * start-trigger firings its waves served and whether the next wave was formed from the reserve, and the buildings it
 * remembers; per player the army it has seen. Empty without teams, so matches without them hash as before.
 */
export function criarExtrasEquipes(sim) {
  const n = Math.min(listaDeEquipes(sim.opcoes?.missao).length, MAX_EQUIPES);
  if (n === 0) return {};
  return {
    fase: new Uint8Array(n),
    inicio: new Int32Array(n),
    ponto: new Int32Array(n),
    sentido: new Int32Array(n),
    poder0: new Int32Array(n),
    contato: new Int32Array(n),
    ordemTipo: new Int32Array(n),
    ordemX: new Int32Array(n),
    ordemY: new Int32Array(n),
    ordemTick: new Int32Array(n),
    recuado: new Uint8Array(n),
    presa: new Int32Array(n).fill(-1),
    presaTick: new Int32Array(n),
    formadas: new Int32Array(n),
    daReserva: new Uint8Array(n),
    predios: new Int32Array(n * MAX_PREDIOS_EQUIPE * CAMPOS_PREDIO),
    exercito: new Int32Array(sim.times),
  };
}
estado.registrarExtras('comportamentos', criarExtrasEquipes);
