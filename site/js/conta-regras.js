// Device profile rules, shared by the browser (offline copy) and the Netlify Functions (the stored profile):
// field cleanup, how a finished match adds up into statistics, records and history, the ranking line,
// and the recovery code format. Pure functions: no DOM, no network, no storage.

import { PONTOS } from './pavio/regras.js';

export const ALFABETO_CONTA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const TAMANHO_ID = 10;
export const TAMANHO_SEGREDO = 20;
export const TAMANHO_NOME = 16;
export const MAX_SIMBOLO = 16; // UTF-16 units: room for one emoji, even a composed one
export const MAX_COR = 31;
export const MAX_HISTORICO = 30;
export const MAX_RANKING = 100;
export const MAX_LOTE = 10; // matches registered in one request (offline ones are sent together)
export const SIMBOLO_PADRAO = '💣';

export class ErroConta extends Error {
  constructor(mensagem, status = 400) {
    super(mensagem);
    this.status = status;
  }
}

// The game's points, never taken from the client: crates, eliminations and the win.
export function pontosDaPartida({ caixas, eliminacoes, venceu }) {
  return caixas * PONTOS.caixa + eliminacoes * PONTOS.eliminacao + (venceu ? PONTOS.vitoria : 0);
}

function limparTexto(texto, maximo) {
  return String(texto ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, maximo);
}

export function limparNome(texto) {
  return limparTexto(texto, TAMANHO_NOME) || 'Sem nome';
}

export function limparSimbolo(texto) {
  return limparTexto(texto, MAX_SIMBOLO) || SIMBOLO_PADRAO;
}

export function limparCor(valor) {
  const cor = Number(valor);
  return Number.isInteger(cor) && cor >= 0 && cor <= MAX_COR ? cor : 0;
}

// Only the fields a person may change; anything else in the input is ignored.
export function camposEditaveis({ nome, cor, simbolo } = {}) {
  const campos = {};
  if (nome !== undefined) campos.nome = limparNome(nome);
  if (cor !== undefined) campos.cor = limparCor(cor);
  if (simbolo !== undefined) campos.simbolo = limparSimbolo(simbolo);
  return campos;
}

export function estatisticasVazias() {
  return {
    partidas: 0,
    vitorias: 0,
    pontos: 0,
    caixas: 0,
    eliminacoes: 0,
    rodadasVencidas: 0,
    partidasComAmigos: 0, // matches with at least two people (robots do not count): the ranking uses these
    pontosComAmigos: 0,
    sequenciaAtual: 0,
    recordes: { pontos: 0, caixas: 0, eliminacoes: 0, sequencia: 0 },
  };
}

export function novoPerfil({ id, nome, cor, simbolo, agora = Date.now() }) {
  return {
    id,
    nome: limparNome(nome),
    cor: limparCor(cor),
    simbolo: limparSimbolo(simbolo),
    criadoEm: agora,
    atualizadoEm: agora,
    estatisticas: estatisticasVazias(),
    historico: [],
  };
}

function inteiro(valor, minimo, maximo, campo) {
  const numero = Number(valor ?? 0);
  if (!Number.isInteger(numero) || numero < minimo || numero > maximo) {
    throw new ErroConta(`Campo "${campo}" fora do esperado.`);
  }
  return numero;
}

// One finished match, as seen by the player who registers it. Throws ErroConta when something is implausible.
export function normalizarResumo(resumo, agora = Date.now()) {
  if (!resumo || typeof resumo !== 'object') throw new ErroConta('Resumo da partida ausente.');
  const jogadores = inteiro(resumo.jogadores ?? 1, 1, 8, 'jogadores');
  const robos = inteiro(resumo.robos, 0, jogadores - 1, 'robos');
  const caixas = inteiro(resumo.caixas, 0, 400, 'caixas');
  const eliminacoes = inteiro(resumo.eliminacoes, 0, jogadores - 1, 'eliminacoes');
  const venceu = Boolean(resumo.venceu);
  const em = Number(resumo.em);
  return {
    em: Number.isFinite(em) && em > agora - 7 * 24 * 3600 * 1000 && em <= agora + 60 * 1000 ? Math.round(em) : agora,
    mapa: String(resumo.mapa ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20),
    venceu,
    caixas,
    eliminacoes,
    pontos: pontosDaPartida({ caixas, eliminacoes, venceu }),
    jogadores,
    robos,
    duracaoS: inteiro(Math.round(Number(resumo.duracaoS ?? 0)), 0, 900, 'duracaoS'),
    campeaoDaRodada: Boolean(resumo.campeaoDaRodada),
  };
}

// Returns a new profile with the match added; the input profile is left untouched.
export function aplicarPartida(perfil, partida) {
  const e = structuredClone(perfil.estatisticas ?? estatisticasVazias());
  e.recordes ??= estatisticasVazias().recordes;
  e.partidas += 1;
  e.pontos += partida.pontos;
  e.caixas += partida.caixas;
  e.eliminacoes += partida.eliminacoes;
  if (partida.venceu) e.vitorias += 1;
  if (partida.campeaoDaRodada) e.rodadasVencidas += 1;
  if (partida.jogadores - partida.robos >= 2) {
    e.partidasComAmigos += 1;
    e.pontosComAmigos += partida.pontos;
  }
  e.sequenciaAtual = partida.venceu ? e.sequenciaAtual + 1 : 0;
  e.recordes.pontos = Math.max(e.recordes.pontos, partida.pontos);
  e.recordes.caixas = Math.max(e.recordes.caixas, partida.caixas);
  e.recordes.eliminacoes = Math.max(e.recordes.eliminacoes, partida.eliminacoes);
  e.recordes.sequencia = Math.max(e.recordes.sequencia, e.sequenciaAtual);
  const historico = [partida, ...(perfil.historico ?? [])].slice(0, MAX_HISTORICO);
  return { ...perfil, estatisticas: e, historico, atualizadoEm: Math.max(perfil.atualizadoEm ?? 0, partida.em) };
}

// What other people may see of a profile: never the secret or its hash.
export function perfilPublico(perfil) {
  const { id, nome, cor, simbolo, criadoEm, atualizadoEm, estatisticas } = perfil;
  return { id, nome, cor, simbolo, criadoEm, atualizadoEm, estatisticas };
}

export function linhaDoRanking(perfil) {
  const e = perfil.estatisticas ?? estatisticasVazias();
  return {
    id: perfil.id,
    nome: perfil.nome,
    cor: perfil.cor,
    simbolo: perfil.simbolo,
    pontos: e.pontosComAmigos,
    vitorias: e.vitorias,
    partidas: e.partidasComAmigos,
  };
}

// Puts (or refreshes) one profile in the ranking: most points with friends first, then most wins.
export function atualizarRanking(linhas, perfil, maximo = MAX_RANKING) {
  const linha = linhaDoRanking(perfil);
  const outras = (linhas ?? []).filter(item => item.id !== linha.id);
  if (linha.partidas > 0) outras.push(linha);
  return outras.sort((a, b) => b.pontos - a.pontos || b.vitorias - a.vitorias || a.id.localeCompare(b.id)).slice(0, maximo);
}

// The recovery code is the profile id followed by its secret, in groups of five: whoever has it owns the profile.
export function formatarCodigo({ id, segredo }) {
  return `${id}${segredo}`.match(/.{1,5}/g).join('-');
}

export function lerCodigo(texto) {
  const limpo = String(texto ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (limpo.length !== TAMANHO_ID + TAMANHO_SEGREDO || ![...limpo].every(letra => ALFABETO_CONTA.includes(letra))) return null;
  return { id: limpo.slice(0, TAMANHO_ID), segredo: limpo.slice(TAMANHO_ID) };
}

export function idValido(id) {
  return typeof id === 'string' && id.length === TAMANHO_ID && [...id].every(letra => ALFABETO_CONTA.includes(letra));
}
