// Save and load in the middle of each design mission (site/rts/dados/missoes/), on its real map and data, with the
// end-to-end tests' scripted player at the controls and the mission's waves coming: a match loaded from a save keeps
// going with the same checksums, the same events and the same scripted decisions as the one that never stopped.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { criarSimulacao, passo, agendarComando, somaDeVerificacao, somasPorSubsistema } from '../site/rts/js/sim/simulacao.js';
import { TIPO_COMANDO, PASSOS_POR_SEGUNDO, criarComando } from '../site/rts/js/sim/contratos.js';
import { montarRetrato, montarMapaEstatico } from '../site/rts/js/sim/retrato.js';
import { salvar, carregar } from '../site/rts/js/sim/persistencia.js';
import { decodificarRetrato } from '../site/rts/js/teste/gancho.js';
import { criarRoteiro, decidir, DECISAO_SEGUNDOS } from './e2e/rts-roteiro.mjs';

const dadosUrl = new URL('../site/rts/dados/', import.meta.url);
const lerJson = url => JSON.parse(readFileSync(url, 'utf8'));
const pastaMissoes = new URL('missoes/', dadosUrl);
const missoes = existsSync(pastaMissoes) ? readdirSync(pastaMissoes).filter(nome => nome.endsWith('.json')) : [];

function partida(missao) {
  const arquivo = nome => lerJson(new URL(`${nome}.json`, dadosUrl));
  const dados = Object.fromEntries(['unidades', 'predios', 'economia', 'pesquisas', 'armas'].map(nome => [nome, arquivo(nome)]));
  const pasta = new URL(`mapas/${missao.mapa}/`, dadosUrl);
  const cabecalho = lerJson(new URL('mapa.json', pasta));
  const arquivosMapa = { cabecalho, camadas: new Uint8Array(readFileSync(new URL(cabecalho.camadas.arquivo, pasta))), entidades: lerJson(new URL('entidades.json', pasta)) };
  return criarSimulacao({ dados, arquivosMapa, missao, dificuldade: 'normal' });
}

const INTERVALO = DECISAO_SEGUNDOS * PASSOS_POR_SEGUNDO;

// One tick of a match driven by the scripted player, which decides every few seconds from the player's snapshot.
function jogar(sim, roteiro, mapaEstatico) {
  if (sim.tick % INTERVALO === 0) {
    const r = decodificarRetrato(montarRetrato(sim, { jogadorLocal: 0 }), mapaEstatico);
    decidir(r, roteiro, mapaEstatico).forEach((c, k) => {
      agendarComando(sim, criarComando({ ...c, tipo: TIPO_COMANDO[c.tipo], tick: sim.tick + 1, jogador: 0, seq: sim.tick * 16 + k }));
    });
  }
  passo(sim);
  return Array.from(sim.eventos);
}

test('there is a mission to save and load', () => {
  assert.ok(missoes.length >= 1);
});

for (const nome of missoes) {
  test(`mission ${nome}: a match saved and loaded twice goes on like the one that never stopped`, () => {
    const missao = lerJson(new URL(nome, pastaMissoes));
    const original = partida(missao);
    const mapaEstatico = montarMapaEstatico(original, 0);
    const roteiro = criarRoteiro();
    const fim = 12 * 60 * PASSOS_POR_SEGUNDO;
    const salvamentos = [3 * 60 * PASSOS_POR_SEGUNDO + 7, 7 * 60 * PASSOS_POR_SEGUNDO + 13];
    const carregadas = [];
    const eventos = { original: [], carregadas: [] };
    while (original.tick < fim) {
      if (salvamentos.includes(original.tick)) {
        const bytes = salvar(original);
        carregadas.push({ sim: carregar(bytes), roteiro: structuredClone(roteiro), eventos: [] });
        assert.deepEqual(somasPorSubsistema(carregadas.at(-1).sim), somasPorSubsistema(original), `the loaded state sums the same at tick ${original.tick}`);
      }
      eventos.original.push(...jogar(original, roteiro, mapaEstatico));
      for (const c of carregadas) c.eventos.push(...jogar(c.sim, c.roteiro, mapaEstatico));
      if (original.tick % (30 * PASSOS_POR_SEGUNDO) === 0) {
        for (const c of carregadas) assert.equal(somaDeVerificacao(c.sim), somaDeVerificacao(original), `tick ${original.tick}`);
      }
    }
    assert.ok(roteiro.decisoes > 100, 'the scripted player played the whole match');
    for (const c of carregadas) {
      assert.deepEqual(somasPorSubsistema(c.sim), somasPorSubsistema(original));
      assert.deepEqual(c.roteiro, roteiro);
      // the events after the load, which the page and the play-test log read, are the original's too
      assert.deepEqual(c.eventos, eventos.original.slice(eventos.original.length - c.eventos.length));
    }
  });
}
