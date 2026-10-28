import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  novoPerfil, normalizarResumo, aplicarPartida, atualizarRanking, formatarCodigo, lerCodigo, camposEditaveis,
  perfilPublico, pontosDaPartida, ErroConta, MAX_HISTORICO, TAMANHO_ID, TAMANHO_SEGREDO,
} from '../site/js/conta-regras.js';

const AGORA = Date.UTC(2026, 9, 28, 3, 0, 0);
const partida = (campos = {}) => normalizarResumo({ jogadores: 4, robos: 0, caixas: 5, eliminacoes: 1, venceu: false, mapa: 'patio', em: AGORA, ...campos }, AGORA);

test('points come from crates, eliminations and the win, never from the client', () => {
  assert.equal(pontosDaPartida({ caixas: 3, eliminacoes: 2, venceu: true }), 3 + 10 + 15);
  const normalizada = normalizarResumo({ jogadores: 2, caixas: 3, eliminacoes: 1, venceu: true, pontos: 9999 }, AGORA);
  assert.equal(normalizada.pontos, 3 + 5 + 15);
});

test('implausible summaries are refused', () => {
  assert.throws(() => normalizarResumo(null, AGORA), ErroConta);
  assert.throws(() => normalizarResumo({ jogadores: 9 }, AGORA), ErroConta);
  assert.throws(() => normalizarResumo({ jogadores: 3, eliminacoes: 3 }, AGORA), ErroConta);
  assert.throws(() => normalizarResumo({ jogadores: 3, robos: 3 }, AGORA), ErroConta);
  assert.throws(() => normalizarResumo({ jogadores: 2, caixas: -1 }, AGORA), ErroConta);
  assert.throws(() => normalizarResumo({ jogadores: 2, caixas: 1.5 }, AGORA), ErroConta);
  const futuro = normalizarResumo({ jogadores: 2, em: AGORA + 3600 * 1000 }, AGORA);
  assert.equal(futuro.em, AGORA, 'a timestamp from the future is replaced by now');
});

test('a match adds up into statistics, records, streak and history', () => {
  let perfil = novoPerfil({ id: 'ABCDEFGHJK', nome: 'Victor', cor: 2, agora: AGORA });
  perfil = aplicarPartida(perfil, partida({ venceu: true, caixas: 8, eliminacoes: 2 }));
  perfil = aplicarPartida(perfil, partida({ venceu: true, caixas: 1, eliminacoes: 3, campeaoDaRodada: true }));
  perfil = aplicarPartida(perfil, partida({ venceu: false, caixas: 0, eliminacoes: 0, robos: 3 }));
  const e = perfil.estatisticas;
  assert.equal(e.partidas, 3);
  assert.equal(e.vitorias, 2);
  assert.equal(e.rodadasVencidas, 1);
  assert.equal(e.caixas, 9);
  assert.equal(e.eliminacoes, 5);
  assert.equal(e.pontos, (8 + 10 + 15) + (1 + 15 + 15) + 0);
  assert.equal(e.sequenciaAtual, 0);
  assert.equal(e.recordes.sequencia, 2);
  assert.equal(e.recordes.caixas, 8);
  assert.equal(e.recordes.eliminacoes, 3);
  assert.equal(e.partidasComAmigos, 2, 'the match with three robots and one person does not count');
  assert.equal(perfil.historico.length, 3);
  assert.equal(perfil.historico[0].caixas, 0, 'newest first');
});

test('matches against robots only do not count for the ranking', () => {
  let perfil = novoPerfil({ id: 'ABCDEFGHJK', nome: 'Solo', agora: AGORA });
  perfil = aplicarPartida(perfil, partida({ jogadores: 4, robos: 3, venceu: true }));
  assert.equal(perfil.estatisticas.partidasComAmigos, 0);
  assert.deepEqual(atualizarRanking([], perfil), []);
});

test('history keeps only the latest matches', () => {
  let perfil = novoPerfil({ id: 'ABCDEFGHJK', nome: 'Muitas', agora: AGORA });
  for (let n = 0; n < MAX_HISTORICO + 5; n++) perfil = aplicarPartida(perfil, partida({ caixas: n }));
  assert.equal(perfil.historico.length, MAX_HISTORICO);
  assert.equal(perfil.historico[0].caixas, MAX_HISTORICO + 4);
});

test('ranking orders by points with friends, then wins, and refreshes an existing line', () => {
  const com = (id, caixas, venceu) => aplicarPartida(novoPerfil({ id, nome: id, agora: AGORA }), partida({ caixas, venceu }));
  let linhas = atualizarRanking([], com('AAAAAAAAAA', 10, false));
  linhas = atualizarRanking(linhas, com('BBBBBBBBBB', 2, true));
  linhas = atualizarRanking(linhas, com('CCCCCCCCCC', 1, false));
  assert.deepEqual(linhas.map(l => l.id), ['BBBBBBBBBB', 'AAAAAAAAAA', 'CCCCCCCCCC']);
  linhas = atualizarRanking(linhas, com('CCCCCCCCCC', 50, true));
  assert.deepEqual(linhas.map(l => l.id), ['CCCCCCCCCC', 'BBBBBBBBBB', 'AAAAAAAAAA']);
  assert.equal(linhas.length, 3);
  assert.equal(atualizarRanking(linhas, com('DDDDDDDDDD', 1, false), 2).length, 2);
});

test('recovery code round-trips and tolerates spaces, dashes and lowercase', () => {
  const credencial = { id: 'ABCDEFGHJK', segredo: 'MNPQRSTUVWXYZ2345678' };
  assert.equal(credencial.id.length, TAMANHO_ID);
  assert.equal(credencial.segredo.length, TAMANHO_SEGREDO);
  const codigo = formatarCodigo(credencial);
  assert.match(codigo, /^([A-Z0-9]{5}-){5}[A-Z0-9]{5}$/);
  assert.deepEqual(lerCodigo(codigo), credencial);
  assert.deepEqual(lerCodigo(` ${codigo.toLowerCase().replaceAll('-', ' ')} `), credencial);
  assert.equal(lerCodigo('ABCDE'), null);
  assert.equal(lerCodigo(codigo.replace('A', 'O')), null, 'letters outside the alphabet are refused');
});

test('only nickname, color and symbol can be edited, and they are cleaned', () => {
  assert.deepEqual(camposEditaveis({ nome: '  <b>Nome muito comprido demais</b> ', cor: 99, simbolo: '', id: 'X', estatisticas: {} }), {
    nome: 'bNome muito comp',
    cor: 0,
    simbolo: '💣',
  });
  assert.deepEqual(camposEditaveis({ cor: 3 }), { cor: 3 });
});

test('the public view never carries the secret hash', () => {
  const perfil = { ...novoPerfil({ id: 'ABCDEFGHJK', nome: 'X', agora: AGORA }), segredoHash: 'abc' };
  assert.equal('segredoHash' in perfilPublico(perfil), false);
});
