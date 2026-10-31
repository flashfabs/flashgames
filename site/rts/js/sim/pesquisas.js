// Research effects, technology level and unlocks. The research list comes from the data compiler (sim.pesquisas, from
// pesquisas.json) and its queue, payment and PRODUCAO_CONCLUIDA event from production (PESQUISAR); this module keeps
// what each team finished, applies a finished research's `efeito` and answers production's questions: may a kind be
// queued (unlocked and within the team's technology level), may a research be queued (not done yet).
// `efeito` is one effect or a list of them:
//   { "efeito": "dano" | "resistencia" | "recarga" | "velocidade" | "paralisia", "porcento", "tipos"? }
//   { "efeito": "alcance", "decimos", "tipos"? }   { "efeito": "libera", "tipos" }
//   { "efeito": "nivel", "nivel", "automatica"?, "faccao"? }
// An effect without `tipos` applies to every kind. A research with automatica finishes by itself once its team has a
// finished building of the research's kind. Kinds named by some `libera` start locked, and a kind whose `nivel` is
// above the team's technology level (1 at the start) stays locked until a research raises it.
import { decimosParaMundo } from './armas.js';

const EFEITOS = Object.freeze({ dano: 100, resistencia: 80, recarga: 80, velocidade: 100, paralisia: 100, alcance: 40, libera: 0, nivel: 3 });
// automatic research is checked on every this many ticks
const INTERVALO_AUTOMATICA = 30;

/**
 * Checks the `efeito` of every research against the kinds and compiles it. Throws one error listing every problem.
 * @param {readonly {nome: string, predio: number, efeito: object|object[]|null}[]} pesquisas the compiled research list
 * @param {readonly object[]} tipos
 */
export function compilarEfeitos(pesquisas, tipos) {
  const erros = [];
  const marcar = (onde, nomes) => {
    const marca = new Uint8Array(tipos.length);
    if (nomes === undefined) return marca.fill(1);
    if (!Array.isArray(nomes)) erros.push(`${onde}: esperava uma lista de tipos`);
    for (const nome of nomes ?? []) {
      const t = tipos.findIndex(tipo => tipo.nome === nome);
      if (t < 0) erros.push(`${onde}: tipo ${nome} não existe`);
      else marca[t] = 1;
    }
    return marca;
  };
  const inteiro = (onde, v, minimo, maximo) => {
    if (!Number.isInteger(v) || v < minimo || v > maximo) erros.push(`${onde}: ${v} não é inteiro em ${minimo}..${maximo}`);
    return Number.isInteger(v) ? v : 0;
  };
  const compiladas = pesquisas.map((p, k) => {
    const lista = p.efeito === null || p.efeito === undefined ? [] : Array.isArray(p.efeito) ? p.efeito : [p.efeito];
    let automatica = 0;
    const efeitos = lista.map((e, j) => {
      const onde = `pesquisas[${p.nome ?? k}].efeito${lista.length > 1 ? `[${j}]` : ''}`;
      if (!(e?.efeito in EFEITOS)) {
        erros.push(`${onde}.efeito: ${e?.efeito} não é ${Object.keys(EFEITOS).join(', ')}`);
        return null;
      }
      const conhecidos = { efeito: 1, tipos: 1, porcento: 1, decimos: 1, nivel: 1, automatica: 1, faccao: 1 };
      for (const campo of Object.keys(e)) if (!(campo in conhecidos)) erros.push(`${onde}.${campo}: campo desconhecido`);
      if (e.efeito === 'libera') return { efeito: 'libera', tipos: marcar(`${onde}.tipos`, e.tipos ?? []) };
      if (e.efeito === 'nivel') {
        if (e.automatica === 1) automatica = 1;
        return { efeito: 'nivel', valor: inteiro(`${onde}.nivel`, e.nivel, 1, EFEITOS.nivel) };
      }
      if (e.efeito === 'alcance') return { efeito: 'alcance', valor: decimosParaMundo(inteiro(`${onde}.decimos`, e.decimos, 0, EFEITOS.alcance)), tipos: marcar(`${onde}.tipos`, e.tipos) };
      return { efeito: e.efeito, valor: inteiro(`${onde}.porcento`, e.porcento, 0, EFEITOS[e.efeito]), tipos: marcar(`${onde}.tipos`, e.tipos) };
    });
    return Object.freeze({ nome: p.nome, predio: p.predio, automatica, efeitos: Object.freeze(efeitos.filter(Boolean)) });
  });
  if (erros.length > 0) throw new Error(`pesquisas inválidas:\n${erros.join('\n')}`);
  const travados = new Uint8Array(tipos.length);
  for (const p of compiladas) for (const e of p.efeitos) if (e.efeito === 'libera') for (let t = 0; t < tipos.length; t++) travados[t] |= e.tipos[t];
  return Object.freeze({ pesquisas: Object.freeze(compiladas), travados, automaticas: compiladas.some(p => p.automatica) });
}

/** Compiled effects of the match's research (derived from the data, rebuilt after a load). */
export function pesquisasDe(sim) {
  if (!sim.pesquisasCompiladas) sim.pesquisasCompiladas = compilarEfeitos(sim.pesquisas ?? [], sim.tipos);
  return sim.pesquisasCompiladas;
}

/**
 * Research state, only typed arrays, in sim.extras.pesquisas: per team and research whether it is done; per team and
 * kind the bonuses (percent; range in world units) and whether the kind is unlocked; per team its technology level.
 */
export function extrasPesquisas(sim) {
  sim.extras ??= {};
  if (!sim.extras.pesquisas) {
    const { pesquisas, travados } = pesquisasDe(sim);
    const nt = sim.tipos.length;
    const porTipo = () => new Int16Array(sim.times * nt);
    const liberado = new Uint8Array(sim.times * nt);
    for (let t = 0; t < sim.times; t++) for (let k = 0; k < nt; k++) liberado[t * nt + k] = travados[k] ? 0 : 1;
    sim.extras.pesquisas = {
      feitas: new Uint8Array(sim.times * pesquisas.length),
      dano: porTipo(),
      resistencia: porTipo(),
      recarga: porTipo(),
      velocidade: porTipo(),
      paralisia: porTipo(),
      alcance: new Int32Array(sim.times * nt),
      liberado,
      nivel: new Uint8Array(sim.times).fill(1),
    };
  }
  return sim.extras.pesquisas;
}

/** Whether team `jogador` finished research k. */
export function pesquisaFeita(sim, jogador, k) {
  const n = pesquisasDe(sim).pesquisas.length;
  return jogador < sim.times && k >= 0 && k < n && extrasPesquisas(sim).feitas[jogador * n + k] === 1;
}

/** Whether `jogador` may queue research k (production checks the required buildings apart). */
export const pesquisaDisponivel = (sim, jogador, k) => k >= 0 && k < pesquisasDe(sim).pesquisas.length && jogador < sim.times && !pesquisaFeita(sim, jogador, k);

/** Team `jogador`'s technology level, from 1. */
export const nivelTecnologia = (sim, jogador) => (jogador < sim.times ? extrasPesquisas(sim).nivel[jogador] : 1);

/** Whether `jogador` may queue kind `tipo` now: unlocked by research or mission and within its technology level. */
export function tipoLiberado(sim, jogador, tipo) {
  if (jogador >= sim.times || tipo < 0 || tipo >= sim.tipos.length) return jogador >= sim.times;
  return extrasPesquisas(sim).liberado[jogador * sim.tipos.length + tipo] === 1 && (sim.tipos[tipo].nivel ?? 1) <= nivelTecnologia(sim, jogador);
}

/** Unlocks (valor 1) or locks (0) the kinds marked in `marcados` for `jogador` (missions and research). */
export function liberarTipos(sim, jogador, marcados, valor) {
  if (jogador >= sim.times) return;
  const ex = extrasPesquisas(sim);
  const nt = sim.tipos.length;
  for (let t = 0; t < nt; t++) if (marcados[t]) ex.liberado[jogador * nt + t] = valor;
}

/** Research k of `jogador` finished (production, a mission, or by itself): applies its effects; false if done already. */
export function concluirPesquisa(sim, jogador, k) {
  if (!pesquisaDisponivel(sim, jogador, k)) return false;
  const { pesquisas } = pesquisasDe(sim);
  const ex = extrasPesquisas(sim);
  const nt = sim.tipos.length;
  ex.feitas[jogador * pesquisas.length + k] = 1;
  for (const e of pesquisas[k].efeitos) {
    if (e.efeito === 'nivel') ex.nivel[jogador] = Math.max(ex.nivel[jogador], e.valor);
    else if (e.efeito === 'libera') liberarTipos(sim, jogador, e.tipos, 1);
    else for (let t = 0; t < nt; t++) if (e.tipos[t]) ex[e.efeito][jogador * nt + t] += e.valor;
  }
  return true;
}

// a finished building of kind `tipo` owned by `jogador`
function temPredioPronto(sim, jogador, tipo) {
  for (let i = 0; i < sim.capacidade; i++) if (sim.ativo[i] && sim.time[i] === jogador && sim.tipo[i] === tipo && (sim.obra?.[i] ?? 0) === 0) return true;
  return false;
}

/** Automatic research (a technology level that comes with its building), checked every second in team order. */
export function avancarPesquisas(sim) {
  const compiladas = pesquisasDe(sim);
  if (!compiladas.automaticas || sim.tick % INTERVALO_AUTOMATICA !== 0) return;
  compiladas.pesquisas.forEach((p, k) => {
    if (!p.automatica) return;
    for (let jogador = 0; jogador < sim.times; jogador++) if (!pesquisaFeita(sim, jogador, k) && temPredioPronto(sim, jogador, p.predio)) concluirPesquisa(sim, jogador, k);
  });
}
