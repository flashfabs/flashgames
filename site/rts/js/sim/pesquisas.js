// Research (pesquisas.json, the design front's numbers): the researches each team has done, the bonuses they give
// each unit kind (damage, resistance, range and reload, read by combat), the team's technology level and which kinds
// it may build (`libera` effects, and the mission's liberar and bloquear actions). A research runs at a building of its
// kind, one at a time per building, paid when it starts; done, it applies its effects and emits PESQUISA_CONCLUIDA.
//   { "versao": 1, "pesquisas": [{ "nome", "custo", "tempoSegundos", "predio", "requer": [nomes],
//       "efeitos": [{ "efeito": "dano" | "resistencia" | "recarga", "porcento", "tipos"? }, { "efeito": "alcance",
//                    "decimos", "tipos"? }, { "efeito": "libera", "tipos" }, { "efeito": "nivel", "nivel" }] }] }
// An effect without `tipos` applies to every kind. Kinds named by some `libera` start locked; every other kind starts
// free.
import { EVENTO, PASSOS_POR_SEGUNDO } from './contratos.js';
import { emitirEvento } from './entidades.js';
import { emitirEventoNoPonto } from './combate.js';
import { decimosParaMundo } from './armas.js';

export const VERSAO_PESQUISAS = 1;
const EFEITOS = Object.freeze({ dano: [0, 100], resistencia: [0, 80], recarga: [0, 80], alcance: [0, 40], libera: null, nivel: [1, 9] });

/**
 * Checks pesquisas.json against the unit kinds and compiles it: kinds and prerequisites by index, times in ticks,
 * ranges in world units. Throws one error listing every problem.
 */
export function compilarPesquisas(dados, tipos) {
  const erros = [];
  if (!dados || typeof dados !== 'object') throw new Error('pesquisas: não é um objeto');
  if (dados.versao !== VERSAO_PESQUISAS) erros.push(`versao: ${dados.versao}, esperava ${VERSAO_PESQUISAS}`);
  const lista = Array.isArray(dados.pesquisas) ? dados.pesquisas : [];
  if (!Array.isArray(dados.pesquisas)) erros.push('pesquisas: esperava uma lista');
  const nomes = lista.map(p => p?.nome);
  const inteiro = (onde, v, minimo, maximo) => {
    if (!Number.isInteger(v) || v < minimo || v > maximo) erros.push(`${onde}: ${v} não é inteiro em ${minimo}..${maximo}`);
    return Number.isInteger(v) ? v : 0;
  };
  const marcar = (onde, nomesDeTipo) => {
    const marca = new Uint8Array(tipos.length);
    if (nomesDeTipo === undefined) return marca.fill(1);
    if (!Array.isArray(nomesDeTipo)) erros.push(`${onde}: esperava uma lista de tipos`);
    for (const nome of nomesDeTipo ?? []) {
      const t = tipos.findIndex(tipo => tipo.nome === nome);
      if (t < 0) erros.push(`${onde}: tipo ${nome} não existe`);
      else marca[t] = 1;
    }
    return marca;
  };
  const pesquisas = lista.map((p, k) => {
    const onde = `pesquisas[${k}]${typeof p?.nome === 'string' ? ` (${p.nome})` : ''}`;
    if (typeof p?.nome !== 'string' || !/^[a-z0-9-]+$/.test(p.nome)) erros.push(`${onde}: nome inválido`);
    if (nomes.indexOf(p?.nome) !== k) erros.push(`${onde}: nome repetido`);
    const predio = tipos.findIndex(tipo => tipo.nome === p?.predio);
    if (predio < 0) erros.push(`${onde}.predio: tipo ${p?.predio} não existe`);
    const requer = (p?.requer ?? []).map(nome => {
      const r = nomes.indexOf(nome);
      if (r < 0 || r === k) erros.push(`${onde}.requer: pesquisa ${nome} não existe`);
      return r;
    });
    const efeitos = (Array.isArray(p?.efeitos) ? p.efeitos : []).map((e, j) => {
      const ondeE = `${onde}.efeitos[${j}]`;
      if (!(e?.efeito in EFEITOS)) {
        erros.push(`${ondeE}.efeito: ${e?.efeito} não é ${Object.keys(EFEITOS).join(', ')}`);
        return null;
      }
      const faixa = EFEITOS[e.efeito];
      if (e.efeito === 'libera') return { efeito: 'libera', tipos: marcar(`${ondeE}.tipos`, e.tipos ?? []) };
      if (e.efeito === 'nivel') return { efeito: 'nivel', valor: inteiro(`${ondeE}.nivel`, e.nivel, faixa[0], faixa[1]) };
      if (e.efeito === 'alcance') return { efeito: 'alcance', valor: decimosParaMundo(inteiro(`${ondeE}.decimos`, e.decimos, faixa[0], faixa[1])), tipos: marcar(`${ondeE}.tipos`, e.tipos) };
      return { efeito: e.efeito, valor: inteiro(`${ondeE}.porcento`, e.porcento, faixa[0], faixa[1]), tipos: marcar(`${ondeE}.tipos`, e.tipos) };
    });
    if (!Array.isArray(p?.efeitos) || efeitos.length === 0) erros.push(`${onde}.efeitos: esperava uma lista`);
    return {
      nome: p?.nome,
      custo: inteiro(`${onde}.custo`, p?.custo, 0, 100000),
      passos: inteiro(`${onde}.tempoSegundos`, p?.tempoSegundos, 1, 3600) * PASSOS_POR_SEGUNDO,
      predio,
      requer,
      efeitos: efeitos.filter(Boolean),
    };
  });
  if (erros.length > 0) throw new Error(`pesquisas inválidas:\n${erros.join('\n')}`);
  const travados = new Uint8Array(tipos.length);
  for (const p of pesquisas) for (const e of p.efeitos) if (e.efeito === 'libera') for (let t = 0; t < tipos.length; t++) travados[t] |= e.tipos[t];
  return Object.freeze({ pesquisas: Object.freeze(pesquisas), travados });
}

/** Compiled research of the match (opcoes.pesquisas), with an empty list when there is none. */
export function pesquisasDe(sim) {
  if (sim.pesquisasCompiladas) return sim.pesquisasCompiladas;
  sim.pesquisasCompiladas = compilarPesquisas(sim.opcoes?.pesquisas ?? { versao: VERSAO_PESQUISAS, pesquisas: [] }, sim.tipos);
  return sim.pesquisasCompiladas;
}

/**
 * Research state, only typed arrays, in sim.extras.pesquisas: per team and research whether it is done; per team and
 * kind the bonuses (percent, range in world units) and whether the kind may be built; per team its technology level;
 * per building slot the research running there (index + 1), the tick it ends and the generation it belongs to.
 */
export function extrasPesquisas(sim) {
  sim.extras ??= {};
  if (!sim.extras.pesquisas) {
    const { pesquisas, travados } = pesquisasDe(sim);
    const nt = sim.tipos.length;
    const liberado = new Uint8Array(sim.times * nt);
    for (let t = 0; t < sim.times; t++) for (let k = 0; k < nt; k++) liberado[t * nt + k] = travados[k] ? 0 : 1;
    sim.extras.pesquisas = {
      feitas: new Uint8Array(sim.times * pesquisas.length),
      dano: new Int16Array(sim.times * nt),
      resistencia: new Int16Array(sim.times * nt),
      recarga: new Int16Array(sim.times * nt),
      alcance: new Int32Array(sim.times * nt),
      liberado,
      nivel: new Uint8Array(sim.times).fill(1),
      emCurso: new Int16Array(sim.capacidade),
      termina: new Int32Array(sim.capacidade),
      geracao: new Uint16Array(sim.capacidade),
    };
  }
  return sim.extras.pesquisas;
}

/** Whether team `time` finished research k. */
export function pesquisaFeita(sim, time, k) {
  const n = pesquisasDe(sim).pesquisas.length;
  return k >= 0 && k < n && extrasPesquisas(sim).feitas[time * n + k] === 1;
}

/** Whether team `time` may build or train kind `tipo` (production asks before queueing). */
export const tipoLiberado = (sim, time, tipo) => extrasPesquisas(sim).liberado[time * sim.tipos.length + tipo] === 1;

/** Team `time`'s technology level, from 1. */
export const nivelTecnologia = (sim, time) => extrasPesquisas(sim).nivel[time];

/** Unlocks (valor 1) or locks (0) the kinds marked in `marcados` for team `time`. */
export function liberarTipos(sim, time, marcados, valor) {
  const ex = extrasPesquisas(sim);
  const nt = sim.tipos.length;
  for (let t = 0; t < nt; t++) if (marcados[t]) ex.liberado[time * nt + t] = valor;
}

/**
 * Marks research k done for team `time` and applies its effects; `predio` is the building it ran at, or -1 (a mission
 * reward). Returns false when it was already done.
 */
export function concluirPesquisa(sim, time, k, predio = -1) {
  if (k < 0 || pesquisaFeita(sim, time, k)) return false;
  const { pesquisas } = pesquisasDe(sim);
  const ex = extrasPesquisas(sim);
  const nt = sim.tipos.length;
  ex.feitas[time * pesquisas.length + k] = 1;
  for (const e of pesquisas[k].efeitos) {
    if (e.efeito === 'nivel') ex.nivel[time] = Math.max(ex.nivel[time], e.valor);
    else if (e.efeito === 'libera') liberarTipos(sim, time, e.tipos, 1);
    else for (let t = 0; t < nt; t++) if (e.tipos[t]) ex[e.efeito][time * nt + t] += e.valor;
  }
  if (EVENTO.PESQUISA_CONCLUIDA) {
    if (predio >= 0) emitirEvento(sim, EVENTO.PESQUISA_CONCLUIDA, predio, -1, k);
    else emitirEventoNoPonto(sim, EVENTO.PESQUISA_CONCLUIDA, -1, 0, 0, k);
  }
  return true;
}

/**
 * Starts research k at building slot `predio` for its owner: the building must be of the research's kind, idle, the
 * research neither done nor running elsewhere for the team, its prerequisites done and its cost affordable (paid now,
 * when the match keeps resources). Returns whether it started.
 */
export function iniciarPesquisa(sim, predio, k) {
  const { pesquisas } = pesquisasDe(sim);
  if (k < 0 || k >= pesquisas.length || !sim.ativo[predio]) return false;
  const p = pesquisas[k];
  const time = sim.time[predio];
  const ex = extrasPesquisas(sim);
  if (sim.tipo[predio] !== p.predio || pesquisaFeita(sim, time, k)) return false;
  if (ex.emCurso[predio] !== 0 && ex.geracao[predio] === sim.geracao[predio]) return false;
  for (let i = 0; i < sim.capacidade; i++) {
    if (ex.emCurso[i] === k + 1 && sim.ativo[i] && ex.geracao[i] === sim.geracao[i] && sim.time[i] === time) return false;
  }
  if (!p.requer.every(r => pesquisaFeita(sim, time, r))) return false;
  if (sim.recursos) {
    if (sim.recursos[time] < p.custo) return false;
    sim.recursos[time] -= p.custo;
  }
  ex.emCurso[predio] = k + 1;
  ex.termina[predio] = sim.tick + p.passos;
  ex.geracao[predio] = sim.geracao[predio];
  return true;
}

/** Research k running at building slot `predio` as { pesquisa, faltam } ticks, or null. */
export function pesquisaEmCurso(sim, predio) {
  const ex = extrasPesquisas(sim);
  if (ex.emCurso[predio] === 0 || !sim.ativo[predio] || ex.geracao[predio] !== sim.geracao[predio]) return null;
  return { pesquisa: ex.emCurso[predio] - 1, faltam: Math.max(0, ex.termina[predio] - sim.tick) };
}

/** Finishes the researches whose time came, in building slot order; a destroyed building loses its research. */
export function avancarPesquisas(sim) {
  const ex = sim.extras?.pesquisas;
  if (!ex) return;
  for (let i = 0; i < sim.capacidade; i++) {
    if (ex.emCurso[i] === 0) continue;
    if (!sim.ativo[i] || ex.geracao[i] !== sim.geracao[i]) {
      ex.emCurso[i] = 0;
      continue;
    }
    if (sim.tick < ex.termina[i]) continue;
    const k = ex.emCurso[i] - 1;
    ex.emCurso[i] = 0;
    concluirPesquisa(sim, sim.time[i], k, i);
  }
}
