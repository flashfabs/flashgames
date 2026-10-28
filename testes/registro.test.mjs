import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarRegistro } from '../site/js/pavio/registro.js';

const esperar = () => new Promise(resolve => setTimeout(resolve, 0));

function montar(meuId = 'eu') {
  let agora = 1_000_000;
  const registradas = [];
  const registro = criarRegistro({ meuId: () => meuId, registrar: resumo => registradas.push(resumo), agora: () => agora });
  return { registro, registradas, passar: ms => { agora += ms; } };
}

const escalacao = [
  { id: 'eu', nome: 'Eu' },
  { id: 'ana', nome: 'Ana' },
  { id: 'robo-1', nome: 'Robô', robo: 'medio' },
];

test('each match registers this player\'s crates, eliminations and win, robots counted apart', async () => {
  const { registro, registradas, passar } = montar();
  registro.aoMudarFase({ fase: 'contagem', idPartida: 1, mapa: 0, escalacao, placar: { eu: { vitorias: 0, caixas: 0, eliminacoes: 0 } } });
  passar(90_000);
  registro.aoMudarFase({ fase: 'resultado', idPartida: 1, mapa: 0, escalacao, resultado: { vencedor: 'eu' }, placar: { eu: { vitorias: 1, caixas: 7, eliminacoes: 2 } } });
  registro.aoMudarFase({ fase: 'contagem', idPartida: 2, mapa: 1, escalacao, placar: { eu: { vitorias: 1, caixas: 7, eliminacoes: 2 } } });
  passar(60_000);
  registro.aoMudarFase({ fase: 'resultado', idPartida: 2, mapa: 1, escalacao, resultado: { vencedor: 'ana' }, placar: { eu: { vitorias: 1, caixas: 10, eliminacoes: 2 } } });
  await esperar();
  assert.equal(registradas.length, 2);
  assert.deepEqual(
    { ...registradas[0], em: 0 },
    { em: 0, mapa: 'patio', venceu: true, caixas: 7, eliminacoes: 2, jogadores: 3, robos: 1, duracaoS: 90, campeaoDaRodada: false },
  );
  assert.equal(registradas[1].caixas, 3, 'the difference since the match started');
  assert.equal(registradas[1].venceu, false);
  assert.equal(registradas[1].mapa, 'deposito');
});

test('the last match on the final screen also says whether this player won the round', async () => {
  const { registro, registradas } = montar();
  registro.aoMudarFase({ fase: 'contagem', idPartida: 5, mapa: 4, escalacao, placar: { eu: { vitorias: 2, caixas: 10, eliminacoes: 3 }, ana: { vitorias: 2, caixas: 9, eliminacoes: 3 } } });
  registro.aoMudarFase({ fase: 'final', idPartida: 5, mapa: 4, escalacao, motivo: null, resultado: { vencedor: 'eu' }, placar: { eu: { vitorias: 3, caixas: 12, eliminacoes: 4 }, ana: { vitorias: 2, caixas: 9, eliminacoes: 3 } } });
  await esperar();
  assert.equal(registradas.length, 1);
  assert.equal(registradas[0].campeaoDaRodada, true);
});

test('spectators, late joiners and repeated phases register nothing; an interrupted match still counts', async () => {
  const fora = montar('outro');
  fora.registro.aoMudarFase({ fase: 'contagem', idPartida: 1, mapa: 0, escalacao, placar: {} });
  fora.registro.aoMudarFase({ fase: 'resultado', idPartida: 1, mapa: 0, escalacao, placar: {} });
  const tarde = montar();
  tarde.registro.aoMudarFase({ fase: 'resultado', idPartida: 3, mapa: 2, escalacao, placar: { eu: { vitorias: 1, caixas: 4, eliminacoes: 0 } } });
  const interrompida = montar();
  interrompida.registro.aoMudarFase({ fase: 'contagem', idPartida: 1, mapa: 0, escalacao, placar: {} });
  interrompida.registro.aoMudarFase({ fase: 'final', idPartida: 1, mapa: 0, escalacao, motivo: 'Ana saiu da sala, então a rodada acabou.', resultado: null, placar: { eu: { vitorias: 0, caixas: 2, eliminacoes: 0 } } });
  interrompida.registro.aoMudarFase({ fase: 'final', idPartida: 1, mapa: 0, escalacao, motivo: 'repetido', placar: { eu: { vitorias: 0, caixas: 2, eliminacoes: 0 } } });
  await esperar();
  assert.equal(fora.registradas.length, 0);
  assert.equal(tarde.registradas.length, 0);
  assert.equal(interrompida.registradas.length, 1);
  assert.equal(interrompida.registradas[0].caixas, 2);
  assert.equal(interrompida.registradas[0].campeaoDaRodada, false);
});
