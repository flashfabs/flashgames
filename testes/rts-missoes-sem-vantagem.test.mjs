// Stage E4, "the computer gets no extra resources, vision or production", on the mission scripts (C7): the teams'
// own code is held to it by testes/rts-ia-equipes.test.mjs (it only sees vistaDoTime and only acts by commands);
// this test holds the missions to it, since a trigger can grant Carga, vision, research or unit kinds to any player.
// A computer player (any but player 0) may only get a starting stock of Carga, at time 0 and the same in every
// difficulty (difficulty never changes what the computer has); vision, research and unlocked kinds, never.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const PASTA = new URL('../site/rts/dados/missoes/', import.meta.url);
const JOGADOR_LOCAL = 0;
const NUNCA_PARA_O_COMPUTADOR = ['revelar', 'pesquisa', 'liberar'];

const missoes = existsSync(PASTA)
  ? readdirSync(PASTA).filter(nome => nome.endsWith('.json') && !nome.endsWith('.licoes.json')).map(nome => ({ nome, json: JSON.parse(readFileSync(new URL(nome, PASTA), 'utf8')) }))
  : [];
const noInicio = gatilho => gatilho.quando?.se === 'tempo' && (gatilho.quando.segundos ?? 0) === 0;

/** Every action of a mission with the trigger it belongs to. */
function acoes(missao) {
  return (missao.gatilhos ?? []).flatMap(gatilho => (gatilho.acoes ?? []).map(acao => ({ gatilho, acao })));
}

test('the repository has missions to check', () => {
  assert.ok(missoes.length > 0);
});

for (const { nome, json } of missoes) {
  test(`${nome}: the computer gets no vision, research or kinds from the script`, () => {
    const achados = acoes(json).filter(({ acao }) => NUNCA_PARA_O_COMPUTADOR.includes(acao.faz) && acao.jogador !== undefined && acao.jogador !== JOGADOR_LOCAL);
    assert.deepEqual(achados.map(({ gatilho, acao }) => `${gatilho.id}: ${acao.faz} para o jogador ${acao.jogador}`), []);
  });

  test(`${nome}: the computer's Carga from the script is only a starting stock, the same in every difficulty`, () => {
    for (const { gatilho, acao } of acoes(json)) {
      if (acao.faz !== 'recursos' || acao.jogador === JOGADOR_LOCAL) continue;
      assert.ok(noInicio(gatilho), `${gatilho.id}: Carga para o jogador ${acao.jogador} depois do começo`);
      assert.equal(typeof acao.somar, 'number', `${gatilho.id}: Carga do jogador ${acao.jogador} muda com a dificuldade`);
    }
  });
}

test('the check catches a mission that favours the computer', () => {
  const trapaceira = {
    gatilhos: [
      { id: 'meio', quando: { se: 'tempo', segundos: 300 }, acoes: [{ faz: 'recursos', jogador: 1, somar: 500 }, { faz: 'revelar', jogador: 1, area: 'base-jogador' }] },
      { id: 'inicio', quando: { se: 'tempo', segundos: 0 }, acoes: [{ faz: 'recursos', jogador: 1, somar: { facil: 0, normal: 500, dificil: 1000 } }] },
    ],
  };
  const lista = acoes(trapaceira);
  assert.equal(lista.filter(({ acao }) => NUNCA_PARA_O_COMPUTADOR.includes(acao.faz) && acao.jogador !== JOGADOR_LOCAL).length, 1);
  assert.equal(lista.filter(({ gatilho, acao }) => acao.faz === 'recursos' && acao.jogador !== JOGADOR_LOCAL && !noInicio(gatilho)).length, 1);
  assert.equal(lista.filter(({ acao }) => acao.faz === 'recursos' && acao.jogador !== JOGADOR_LOCAL && typeof acao.somar !== 'number').length, 1);
});
