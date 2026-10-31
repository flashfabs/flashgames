// A bascule bridge (a structure with the passage role in predios.json): neutral, it blocks like any structure and the
// water under it stays water; re-powered by a team, its deck comes down and its cells are ground for everyone, the flow
// fields start over, and a load keeps it open.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { criarSimulacao, passo, agendarComando, somaDeVerificacao, REGRAS_LIVRES } from '../site/rts/js/sim/simulacao.js';
import { TIPO_COMANDO, FP, DONO_NEUTRO, criarComando, idDe } from '../site/rts/js/sim/contratos.js';
import { centroDaPegada } from '../site/rts/js/sim/pegadas.js';
import { trocarDono } from '../site/rts/js/sim/religar.js';
import { salvar, carregar } from '../site/rts/js/sim/persistencia.js';

const dadosUrl = new URL('../site/rts/dados/', import.meta.url);
const dados = () => Object.fromEntries(['unidades', 'predios', 'economia', 'pesquisas', 'armas'].map(n => [n, JSON.parse(readFileSync(new URL(`${n}.json`, dadosUrl), 'utf8'))]));
const LARGURA = 30;
const ALTURA = 24;
const RIO = [9, 13]; // rows of deep water across the whole map

// A river from border to border, a bascule bridge over it (2 x 7 cells, columns 14 and 15, rows 8 to 14) and a
// player's squad north of it.
function partida() {
  const bloqueado = new Uint8Array(LARGURA * ALTURA);
  for (let y = 0; y < ALTURA; y++) {
    for (let x = 0; x < LARGURA; x++) {
      const borda = x === 0 || y === 0 || x === LARGURA - 1 || y === ALTURA - 1;
      if (borda || (y >= RIO[0] && y <= RIO[1])) bloqueado[y * LARGURA + x] = 1;
    }
  }
  const mapa = { largura: LARGURA, altura: ALTURA, bloqueado, bases: [{ x: 5, y: 4 }, { x: 25, y: 20 }] };
  const tipos = criarSimulacao({ dados: dados(), mapa, unidades: [], regras: REGRAS_LIVRES, capacidade: 4 }).tipos;
  const tipoDe = nome => tipos.findIndex(t => t.nome === nome);
  const unidades = [
    { tipo: tipoDe('ponte-basculante'), time: DONO_NEUTRO, x: centroDaPegada(14, 2), y: centroDaPegada(8, 7) },
    { tipo: tipoDe('turma-de-linha'), time: 0, x: 14 * FP + 512, y: 4 * FP + 512 },
  ];
  return criarSimulacao({ dados: dados(), mapa, unidades, regras: REGRAS_LIVRES, capacidade: 16 });
}
const rodar = (sim, passos) => {
  for (let k = 0; k < passos; k++) passo(sim);
};
const celula = (sim, x, y) => sim.grade.bloqueado[y * LARGURA + x];

test('a neutral bridge blocks; re-powered, its deck is ground and a squad crosses the river on it', () => {
  const sim = partida();
  const ponte = 0;
  const turma = 1;
  assert.equal(sim.tipos[sim.tipo[ponte]].nome, 'ponte-basculante');
  assert.equal(celula(sim, 14, 11), 1, 'water under the raised deck');
  agendarComando(sim, criarComando({ tick: 1, jogador: 0, seq: 0, tipo: TIPO_COMANDO.MOVER, unidades: [idDe(turma, sim.geracao[turma])], x: 14 * FP + 512, y: 19 * FP + 512 }));
  rodar(sim, 600);
  assert.ok(sim.y[turma] >> 10 < RIO[0], 'no way across while the bridge is up');
  trocarDono(sim, ponte, 0);
  for (let y = 8; y <= 14; y++) for (const x of [14, 15]) assert.equal(celula(sim, x, y), 0, `deck cell (${x}, ${y}) is ground`);
  assert.equal(celula(sim, 13, 11), 1, 'the river beside it is still water');
  // a load rebuilds the grid with the bridge open
  const copia = carregar(salvar(sim));
  assert.deepEqual(copia.grade.bloqueado, sim.grade.bloqueado);
  agendarComando(sim, criarComando({ tick: sim.tick + 1, jogador: 0, seq: 1, tipo: TIPO_COMANDO.MOVER, unidades: [idDe(turma, sim.geracao[turma])], x: 14 * FP + 512, y: 19 * FP + 512 }));
  agendarComando(copia, criarComando({ tick: copia.tick + 1, jogador: 0, seq: 1, tipo: TIPO_COMANDO.MOVER, unidades: [idDe(turma, copia.geracao[turma])], x: 14 * FP + 512, y: 19 * FP + 512 }));
  rodar(sim, 900);
  rodar(copia, 900);
  assert.ok(sim.y[turma] >> 10 > RIO[1], `the squad crossed (row ${sim.y[turma] >> 10})`);
  assert.equal(somaDeVerificacao(copia), somaDeVerificacao(sim));
});
