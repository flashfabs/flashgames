// Re-powering dead structures and research: progress that pauses when the re-powering unit leaves and winds back under
// another team, the change of hands, a re-powered structure going dead again when destroyed; research effects on
// combat and speed, technology level and unlocks, and the research that finishes by itself with its building.
import test from 'node:test';
import assert from 'node:assert/strict';
import { criarSimulacao, passo, REGRAS_LIVRES } from '../site/rts/js/sim/simulacao.js';
import { FP, EVENTO, TAMANHO_EVENTO, E_TIPO, DONO_NEUTRO, idDe } from '../site/rts/js/sim/contratos.js';
import * as neblina from '../site/rts/js/sim/neblina.js';
import { REGRAS_COMBATE_PADRAO, decimosParaMundo } from '../site/rts/js/sim/armas.js';
import { calcularDano, danoBaseDe, fatorVelocidade } from '../site/rts/js/sim/combate.js';
import { ordenarReligar, progressoReligar, sendoReligada, tempoParaReligar, religandoQual } from '../site/rts/js/sim/religar.js';
import { compilarEfeitos, concluirPesquisa, pesquisaDisponivel, pesquisaFeita, tipoLiberado, nivelTecnologia, extrasPesquisas } from '../site/rts/js/sim/pesquisas.js';

// game data in the design front's file formats (C5)
const infantaria = { classe: 'infantaria', blindagem: 'pessoal', lotacao: 1, raio: 2, giroCorpo: 16, giroTorre: 16, tempoMs: 12000, velocidade: 120, visao: 7 };
const DADOS = {
  unidades: {
    versao: 1,
    unidades: [
      { nome: 'turma', faccao: 'religadores', ...infantaria, custo: 100, vida: 100, arma: 'carabina' },
      { nome: 'religador', faccao: 'religadores', ...infantaria, custo: 300, vida: 120, religa: 1 },
      { nome: 'cesto', faccao: 'religadores', classe: 'veiculoGrande', blindagem: 'pesada', lotacao: 3, raio: 4, giroCorpo: 8, giroTorre: 8, tempoMs: 35000, velocidade: 110, visao: 8, custo: 600, vida: 900, nivel: 2, arma: 'carabina' },
      { nome: 'guincho', faccao: 'religadores', classe: 'veiculo', blindagem: 'leve', lotacao: 2, raio: 3, giroCorpo: 8, giroTorre: 8, tempoMs: 20000, velocidade: 160, visao: 5, custo: 300, vida: 400, coletor: 1, coleta: { carga: 100, carregarMs: 4000, descarregarMs: 2000, recolherFaiscaMs: 2000 } },
    ],
  },
  predios: {
    versao: 1,
    predios: [
      { nome: 'torre-antiga', faccao: 'neutro', pegada: [1, 1], custo: 0, tempoMs: 0, vida: 500, visao: 9, religavel: 1, tempoReligarMs: 20000, arma: 'holofote' },
      { nome: 'almoxarifado', faccao: 'religadores', pegada: [1, 1], custo: 800, tempoMs: 30000, vida: 800, visao: 5 },
      { nome: 'garagem', faccao: 'religadores', pegada: [1, 1], custo: 800, tempoMs: 30000, vida: 800, visao: 5 },
    ],
  },
  armas: { ...REGRAS_COMBATE_PADRAO, armas: [{ nome: 'carabina', tipoDano: 'bala', dano: 10, recargaMs: 1000, alcance: 40 }, { nome: 'holofote', tipoDano: 'bala', dano: 20, recargaMs: 1000, alcance: 60 }] },
  pesquisas: {
    versao: 1,
    pesquisas: [
      { nome: 'nivel-2', predio: 'almoxarifado', custo: 0, tempoMs: 100, efeito: { efeito: 'nivel', nivel: 2, automatica: 1 } },
      { nome: 'mira-fina', predio: 'almoxarifado', custo: 400, tempoMs: 10000, efeito: [{ efeito: 'dano', porcento: 20, tipos: ['turma'] }, { efeito: 'alcance', decimos: 10, tipos: ['turma'] }] },
      { nome: 'colete', predio: 'almoxarifado', custo: 300, tempoMs: 5000, efeito: [{ efeito: 'resistencia', porcento: 20 }, { efeito: 'recarga', porcento: 10, tipos: ['turma'] }] },
      { nome: 'turno-extra', predio: 'almoxarifado', custo: 300, tempoMs: 5000, efeito: { efeito: 'velocidade', porcento: 15, tipos: ['guincho'] } },
      { nome: 'oficina', predio: 'almoxarifado', custo: 0, tempoMs: 5000, efeito: { efeito: 'libera', tipos: ['garagem'] } },
    ],
  },
};
// kinds: the units in file order, then the buildings
const [TURMA, RELIGADOR, CESTO, GUINCHO, TORRE, ALMOXARIFADO, GARAGEM] = [0, 1, 2, 3, 4, 5, 6];
const [NIVEL_2, MIRA_FINA, COLETE, TURNO_EXTRA, OFICINA] = [0, 1, 2, 3, 4];
// the dead structures belong to DONO_NEUTRO once the fog ignores that owner (the economy front's core)
const neblinaComNeutro = typeof neblina.retirarVisao === 'function';

/** Players 0 and 1 and an optional third side on an open 48x48 map with explicit units in cells. */
function partida(unidades) {
  const sim = criarSimulacao({
    mapa: { largura: 48, altura: 48, bases: [{ x: 4, y: 4 }, { x: 40, y: 40 }] },
    dados: DADOS,
    regras: REGRAS_LIVRES,
    capacidade: 32,
    unidades: unidades.map(u => ({ direcao: 0, ...u, x: Math.trunc(u.x * FP), y: Math.trunc(u.y * FP) })),
  });
  for (let i = 0; i < sim.capacidade; i++) {
    if (!sim.ativo[i] || sim.tipo[i] < TORRE) continue;
    sim.segurando[i] = 1;
    // a dead tower held by the stand-in third team must not fire
    if (sim.tipo[i] === TORRE && sim.time[i] === 2) sim.recarga[i] = 1000000;
  }
  return sim;
}

const meio = n => n + 1 / 2;
const id = (sim, i) => idDe(i, sim.geracao[i]);
// owner of the dead structures in these tests: the neutral side when the fog takes it, a third team before that
const MORTA = neblinaComNeutro ? DONO_NEUTRO : 2;

function eventos(sim, tipo) {
  const lista = [];
  for (let k = 0; k < sim.eventos.length; k += TAMANHO_EVENTO) if (sim.eventos[k + E_TIPO] === tipo) lista.push(sim.eventos.slice(k, k + TAMANHO_EVENTO));
  return lista;
}

function avancar(sim, passos, parar = () => false) {
  for (let k = 0; k < passos && !parar(sim); k++) passo(sim);
}

test('a re-powering unit walks to the dead structure, its count pauses when it leaves, and the structure changes hands', () => {
  const sim = partida([
    { tipo: TORRE, time: MORTA, x: meio(24), y: meio(24) },
    { tipo: RELIGADOR, time: 0, x: meio(16), y: meio(24) },
    { tipo: TURMA, time: 0, x: meio(4), y: meio(4) },
  ]);
  assert.equal(tempoParaReligar(sim, 0), 20 * 30, 'the kind time');
  ordenarReligar(sim, [2], id(sim, 0));
  assert.equal(religandoQual(sim, 2), 0, 'a unit that cannot re-power is left alone');
  ordenarReligar(sim, [1, 2], id(sim, 0));
  assert.equal(religandoQual(sim, 1), id(sim, 0));
  avancar(sim, 20 * 30, s => sendoReligada(s, 0, 0));
  assert.ok(sendoReligada(sim, 0, 0), 'it got there and works');
  avancar(sim, 5 * 30);
  const antes = progressoReligar(sim, 0);
  assert.equal(antes.time, 0);
  assert.ok(antes.passos >= 5 * 30 - 1 && antes.passos <= 5 * 30 + 1, `${antes.passos} ticks of work`);
  // sent away, the count pauses
  sim.x[1] = Math.trunc(meio(10) * FP);
  avancar(sim, 3 * 30);
  assert.equal(progressoReligar(sim, 0).passos, antes.passos, 'paused');
  assert.ok(!sendoReligada(sim, 0));
  ordenarReligar(sim, [1], id(sim, 0));
  const religados = [];
  avancar(sim, 40 * 30, s => {
    if (EVENTO.RELIGADO) religados.push(...eventos(s, EVENTO.RELIGADO));
    return s.time[0] === 0;
  });
  assert.equal(sim.time[0], 0, 'the tower belongs to the player');
  assert.equal(progressoReligar(sim, 0).time, -1, 'progress cleared');
  assert.equal(religandoQual(sim, 1), 0);
  if (EVENTO.RELIGADO) assert.equal(religados.length, 1);
});

test('another team winds the progress back before starting its own', () => {
  const sim = partida([
    { tipo: TORRE, time: MORTA, x: meio(24), y: meio(24) },
    { tipo: RELIGADOR, time: 0, x: meio(23), y: meio(25) },
    { tipo: RELIGADOR, time: 1, x: meio(25), y: meio(23) },
  ]);
  ordenarReligar(sim, [1], id(sim, 0));
  avancar(sim, 60);
  const meu = progressoReligar(sim, 0);
  assert.equal(meu.time, 0);
  // the player's unit leaves and the other team's unit arrives: it winds the player's progress down first
  sim.x[1] = Math.trunc(meio(4) * FP);
  sim.y[1] = Math.trunc(meio(40) * FP);
  ordenarReligar(sim, [2], id(sim, 0));
  avancar(sim, 30);
  const contra = progressoReligar(sim, 0);
  assert.equal(contra.time, 0, 'still the player’s progress');
  assert.ok(contra.passos < meu.passos, 'wound back');
  avancar(sim, meu.passos + 30);
  assert.equal(progressoReligar(sim, 0).time, 1, 'then the other team starts its own');
});

test('a re-powered structure fights for its side and goes dead again when destroyed', { skip: !neblinaComNeutro && 'needs the fog that ignores DONO_NEUTRO' }, () => {
  const sim = partida([
    { tipo: TORRE, time: DONO_NEUTRO, x: meio(24), y: meio(24) },
    { tipo: RELIGADOR, time: 0, x: meio(23), y: meio(25) },
    { tipo: CESTO, time: 1, x: meio(27), y: meio(24) },
  ]);
  sim.recarga[2] = 1000000;
  avancar(sim, 60);
  assert.equal(sim.vida[0], 500, 'nobody shoots the neutral tower');
  ordenarReligar(sim, [1], id(sim, 0));
  avancar(sim, 25 * 30, s => s.time[0] === 0);
  assert.equal(sim.time[0], 0);
  // the re-powering unit leaves, so the tower is the enemy's closest target
  sim.x[1] = Math.trunc(meio(4) * FP);
  sim.y[1] = Math.trunc(meio(40) * FP);
  avancar(sim, 30);
  assert.ok(sim.vida[2] < 900, 'the tower shoots the enemy');
  sim.recarga[2] = 0;
  sim.vida[0] = 5;
  const mortes = [];
  avancar(sim, 6 * 30, s => {
    mortes.push(...eventos(s, EVENTO.MORTE));
    return s.time[0] === DONO_NEUTRO;
  });
  assert.equal(sim.time[0], DONO_NEUTRO, 'dead again');
  assert.equal(sim.ativo[0], 1, 'not removed');
  assert.equal(sim.vida[0], 500, 'healed for the next one');
  assert.equal(mortes.length, 0);
});

test('research effects reach combat and speed, per team', () => {
  assert.throws(() => compilarEfeitos([{ nome: 'x', predio: 0, efeito: { efeito: 'voar' } }, { nome: 'y', predio: 0, efeito: { efeito: 'dano', porcento: 10, tipos: ['dragao'] } }], partida([]).tipos), e => ['voar', 'dragao'].every(t => e.message.includes(t)));
  const sim = partida([
    { tipo: TURMA, time: 0, x: meio(14), y: meio(10) },
    { tipo: TURMA, time: 1, x: meio(14), y: meio(30) },
    { tipo: GUINCHO, time: 0, x: meio(20), y: meio(10) },
  ]);
  assert.ok(pesquisaDisponivel(sim, 0, MIRA_FINA));
  assert.ok(concluirPesquisa(sim, 0, MIRA_FINA));
  assert.ok(!concluirPesquisa(sim, 0, MIRA_FINA), 'only once');
  assert.ok(!pesquisaDisponivel(sim, 0, MIRA_FINA));
  assert.ok(pesquisaFeita(sim, 0, MIRA_FINA) && !pesquisaFeita(sim, 1, MIRA_FINA), 'per team');
  assert.equal(danoBaseDe(sim, 0), 12, '+20% damage');
  assert.equal(danoBaseDe(sim, 1), 10, 'the other team has no bonus');
  assert.equal(extrasPesquisas(sim).alcance[0 * sim.tipos.length + TURMA], decimosParaMundo(10));
  concluirPesquisa(sim, 1, COLETE);
  assert.equal(calcularDano(sim, 0, 100, 0, 1), 80, '20% resisted');
  assert.equal(extrasPesquisas(sim).recarga[1 * sim.tipos.length + TURMA], 10);
  assert.equal(fatorVelocidade(sim, 2), 100);
  concluirPesquisa(sim, 0, TURNO_EXTRA);
  assert.equal(fatorVelocidade(sim, 2), 115, 'the harvester is 15% faster');
});

test('research reach shows in combat', () => {
  const sim = partida([
    { tipo: TURMA, time: 0, x: meio(10), y: meio(20) },
    { tipo: TURMA, time: 1, x: meio(10) + 4.6, y: meio(20) },
  ]);
  sim.recarga[1] = 1000000;
  avancar(sim, 60);
  assert.equal(sim.vida[1], 100, '4.6 cells is out of reach');
  concluirPesquisa(sim, 0, MIRA_FINA);
  avancar(sim, 60);
  assert.ok(sim.vida[1] < 100, 'one more cell of reach');
});

test('technology level and unlocks gate what can be built, and the level comes by itself with its building', () => {
  const sim = partida([{ tipo: TURMA, time: 0, x: meio(10), y: meio(10) }]);
  assert.equal(nivelTecnologia(sim, 0), 1);
  assert.equal(tipoLiberado(sim, 0, CESTO), false, 'level 2 kind at level 1');
  assert.equal(tipoLiberado(sim, 0, TURMA), true);
  assert.equal(tipoLiberado(sim, 0, GARAGEM), false, 'a kind some research unlocks starts locked');
  concluirPesquisa(sim, 0, OFICINA);
  assert.equal(tipoLiberado(sim, 0, GARAGEM), true);
  assert.equal(tipoLiberado(sim, 1, GARAGEM), false);
  avancar(sim, 60);
  assert.equal(nivelTecnologia(sim, 0), 1, 'no building yet');
  const comPredio = partida([{ tipo: ALMOXARIFADO, time: 0, x: meio(10), y: meio(10) }]);
  avancar(comPredio, 31);
  assert.equal(nivelTecnologia(comPredio, 0), 2, 'automatic with the building');
  assert.ok(pesquisaFeita(comPredio, 0, NIVEL_2));
  assert.equal(tipoLiberado(comPredio, 0, CESTO), true);
  assert.equal(nivelTecnologia(comPredio, 1), 1, 'per team');
});
