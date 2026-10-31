// Re-powering dead structures and research: progress that pauses when the re-powering unit leaves and winds back under
// another team, the change of hands, a re-powered structure going dead again when destroyed; research paid up front at
// its building, prerequisites, every effect, and a research lost with its building.
import test from 'node:test';
import assert from 'node:assert/strict';
import { criarSimulacao, passo, REGRAS_LIVRES } from '../site/rts/js/sim/simulacao.js';
import { FP, EVENTO, TAMANHO_EVENTO, E_TIPO, idDe } from '../site/rts/js/sim/contratos.js';
import { CLASSE } from '../site/rts/js/sim/dados.js';
import { REGRAS_COMBATE_PADRAO, decimosParaMundo } from '../site/rts/js/sim/armas.js';
import { calcularDano, danoBaseDe } from '../site/rts/js/sim/combate.js';
import { ordenarReligar, progressoReligar, sendoReligada, tempoParaReligar, religandoQual } from '../site/rts/js/sim/religar.js';
import { compilarPesquisas, iniciarPesquisa, pesquisaFeita, pesquisaEmCurso, tipoLiberado, nivelTecnologia, extrasPesquisas } from '../site/rts/js/sim/pesquisas.js';

const ARMAS = { ...REGRAS_COMBATE_PADRAO, armas: [{ nome: 'carabina', tipoDano: 'bala', dano: 10, recargaMs: 1000, alcance: 40 }, { nome: 'holofote', tipoDano: 'bala', dano: 20, recargaMs: 1000, alcance: 60 }] };
const celulasPorSegundo = decimos => Math.trunc((decimos * FP) / 300);
const BASE = { giroCorpo: 16, giroTorre: 16, coletor: 0, alcance: 0, dano: 0, recarga: 30 };
const TIPOS = [
  { nome: 'turma', velocidade: celulasPorSegundo(12), vida: 100, raio: 160, visao: 7, classe: CLASSE.INFANTARIA, ...BASE },
  { nome: 'religador', velocidade: celulasPorSegundo(12), vida: 120, raio: 160, visao: 7, classe: CLASSE.INFANTARIA, ...BASE },
  { nome: 'torre-antiga', velocidade: 1, vida: 500, raio: 500, visao: 9, classe: CLASSE.VEICULO_GRANDE, ...BASE },
  { nome: 'almoxarifado', velocidade: 1, vida: 800, raio: 700, visao: 5, classe: CLASSE.VEICULO_GRANDE, ...BASE },
  { nome: 'cesto', velocidade: celulasPorSegundo(11), vida: 900, raio: 440, visao: 8, classe: CLASSE.VEICULO_GRANDE, ...BASE },
];
const COMBATE = [
  { arma: 'carabina', blindagem: 'pessoal', custo: 100 },
  { arma: null, blindagem: 'pessoal', custo: 300, religa: 1 },
  { arma: 'holofote', blindagem: 'estrutura', custo: 600, religavel: 1, tempoReligar: 20 },
  { arma: null, blindagem: 'estrutura', custo: 800 },
  { arma: 'carabina', blindagem: 'pesada', custo: 600 },
];
const [TURMA, RELIGADOR, TORRE, ALMOXARIFADO, CESTO] = [0, 1, 2, 3, 4];
const NEUTRO = 2;
const PESQUISAS = {
  versao: 1,
  pesquisas: [
    { nome: 'mira-fina', custo: 400, tempoSegundos: 10, predio: 'almoxarifado', efeitos: [{ efeito: 'dano', porcento: 20, tipos: ['turma'] }, { efeito: 'alcance', decimos: 10, tipos: ['turma'] }] },
    { nome: 'colete', custo: 300, tempoSegundos: 5, predio: 'almoxarifado', requer: ['mira-fina'], efeitos: [{ efeito: 'resistencia', porcento: 20 }, { efeito: 'recarga', porcento: 10, tipos: ['turma'] }] },
    { nome: 'nivel-2', custo: 0, tempoSegundos: 5, predio: 'almoxarifado', efeitos: [{ efeito: 'nivel', nivel: 2 }, { efeito: 'libera', tipos: ['cesto'] }] },
  ],
};

/** Three sides (player, enemy, neutral) on an open 48x48 map with explicit units in cells. */
function partida(unidades) {
  const sim = criarSimulacao({
    mapa: { largura: 48, altura: 48, bases: [{ x: 4, y: 4 }, { x: 40, y: 40 }, { x: 24, y: 4 }] },
    tipos: TIPOS,
    armas: ARMAS,
    pesquisas: PESQUISAS,
    timeNeutro: NEUTRO,
    regras: REGRAS_LIVRES,
    capacidade: 32,
    unidades: unidades.map(u => ({ direcao: 0, ...u, x: Math.trunc(u.x * FP), y: Math.trunc(u.y * FP) })),
  });
  sim.tipos = Object.freeze(TIPOS.map((tipo, t) => Object.freeze({ ...tipo, ...COMBATE[t] })));
  for (let i = 0; i < sim.capacidade; i++) if (sim.ativo[i] && (sim.tipo[i] === TORRE || sim.tipo[i] === ALMOXARIFADO)) sim.segurando[i] = 1;
  return sim;
}

const meio = n => n + 1 / 2;
const id = (sim, i) => idDe(i, sim.geracao[i]);

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
    { tipo: TORRE, time: NEUTRO, x: meio(24), y: meio(24) },
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

test('another team winds the progress back before starting its own, and the neutral side neither shoots nor is shot', () => {
  const sim = partida([
    { tipo: TORRE, time: NEUTRO, x: meio(24), y: meio(24) },
    { tipo: RELIGADOR, time: 0, x: meio(23), y: meio(25) },
    { tipo: RELIGADOR, time: 1, x: meio(25), y: meio(23) },
  ]);
  ordenarReligar(sim, [1], id(sim, 0));
  avancar(sim, 60);
  const meu = progressoReligar(sim, 0);
  assert.equal(meu.time, 0);
  // the other team's unit arrives; it is later in slot order, but the structure gets one tick of work per tick, to
  // whoever comes first, so the player's unit keeps the lead while it stays
  sim.x[1] = Math.trunc(meio(4) * FP);
  sim.y[1] = Math.trunc(meio(40) * FP);
  ordenarReligar(sim, [2], id(sim, 0));
  avancar(sim, 30);
  const contra = progressoReligar(sim, 0);
  assert.equal(contra.time, 0, 'still the player’s progress');
  assert.ok(contra.passos < meu.passos, 'wound back');
  avancar(sim, meu.passos + 30);
  assert.equal(progressoReligar(sim, 0).time, 1, 'then the other team starts its own');
  assert.equal(sim.vida[0], 500, 'nobody shoots the neutral tower');
});

test('a re-powered structure fights for its side and goes dead again when destroyed', () => {
  const sim = partida([
    { tipo: TORRE, time: NEUTRO, x: meio(24), y: meio(24) },
    { tipo: RELIGADOR, time: 0, x: meio(23), y: meio(25) },
    { tipo: CESTO, time: 1, x: meio(27), y: meio(24) },
  ]);
  sim.recarga[2] = 1000000;
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
    return s.time[0] === NEUTRO;
  });
  assert.equal(sim.time[0], NEUTRO, 'dead again');
  assert.equal(sim.ativo[0], 1, 'not removed');
  assert.equal(sim.vida[0], 500, 'healed for the next one');
  assert.equal(mortes.length, 0);
});

test('research validation, prerequisites, payment up front and every effect', () => {
  assert.throws(
    () => compilarPesquisas({ versao: 1, pesquisas: [{ nome: 'x', custo: 1, tempoSegundos: 1, predio: 'castelo', requer: ['y'], efeitos: [{ efeito: 'voar' }] }] }, TIPOS),
    e => ['tipo castelo', 'pesquisa y', 'voar'].every(t => e.message.includes(t)),
  );
  const sim = partida([
    { tipo: ALMOXARIFADO, time: 0, x: meio(10), y: meio(10) },
    { tipo: TURMA, time: 0, x: meio(14), y: meio(10) },
    { tipo: TURMA, time: 1, x: meio(14), y: meio(30) },
    { tipo: ALMOXARIFADO, time: 1, x: meio(40), y: meio(40) },
  ]);
  sim.recursos = new Int32Array([500, 1000, 0]);
  assert.equal(tipoLiberado(sim, 0, CESTO), false, 'a kind some research unlocks starts locked');
  assert.equal(tipoLiberado(sim, 0, TURMA), true);
  assert.equal(iniciarPesquisa(sim, 1, 0), false, 'only at a building of its kind');
  assert.equal(iniciarPesquisa(sim, 0, 1), false, 'prerequisite missing');
  assert.equal(iniciarPesquisa(sim, 0, 0), true);
  assert.equal(sim.recursos[0], 100, 'paid up front');
  assert.equal(iniciarPesquisa(sim, 0, 2), false, 'one at a time per building');
  sim.recursos[1] = 0;
  assert.equal(iniciarPesquisa(sim, 3, 0), false, 'the other team cannot afford it');
  const concluidas = [];
  avancar(sim, 10 * 30 + 1, s => {
    if (EVENTO.PESQUISA_CONCLUIDA) concluidas.push(...eventos(s, EVENTO.PESQUISA_CONCLUIDA));
    return pesquisaFeita(s, 0, 0);
  });
  assert.ok(pesquisaFeita(sim, 0, 0));
  assert.ok(sim.tick >= 10 * 30);
  if (EVENTO.PESQUISA_CONCLUIDA) assert.equal(concluidas.length, 1);
  assert.equal(pesquisaFeita(sim, 1, 0), false, 'per team');
  assert.equal(danoBaseDe(sim, 1), 12, '+20% damage');
  assert.equal(danoBaseDe(sim, 2), 10, 'the other team has no bonus');
  assert.equal(extrasPesquisas(sim).alcance[0 * TIPOS.length + TURMA], decimosParaMundo(10));
  sim.recursos[0] = 300;
  assert.equal(iniciarPesquisa(sim, 0, 1), true, 'the prerequisite is done');
  avancar(sim, 5 * 30 + 1, s => pesquisaFeita(s, 0, 1));
  assert.equal(calcularDano(sim, 0, 100, 0, 1), 80, '20% resisted');
  assert.equal(extrasPesquisas(sim).recarga[0 * TIPOS.length + TURMA], 10);
  assert.equal(iniciarPesquisa(sim, 0, 2), true, 'free research');
  assert.ok(pesquisaEmCurso(sim, 0));
  avancar(sim, 5 * 30 + 1, s => pesquisaFeita(s, 0, 2));
  assert.equal(nivelTecnologia(sim, 0), 2);
  assert.equal(tipoLiberado(sim, 0, CESTO), true);
  assert.equal(tipoLiberado(sim, 1, CESTO), false);
});

test('research reach shows in combat, and a research is lost with its building', () => {
  const sim = partida([
    { tipo: ALMOXARIFADO, time: 0, x: meio(10), y: meio(10) },
    { tipo: TURMA, time: 0, x: meio(10), y: meio(20) },
    { tipo: TURMA, time: 1, x: meio(10) + 4.6, y: meio(20) },
  ]);
  sim.recarga[2] = 1000000;
  sim.recursos = new Int32Array([1000, 0, 0]);
  avancar(sim, 60);
  assert.equal(sim.vida[2], 100, '4.6 cells is out of reach');
  iniciarPesquisa(sim, 0, 0);
  avancar(sim, 10 * 30 + 1, s => pesquisaFeita(s, 0, 0));
  avancar(sim, 60);
  assert.ok(sim.vida[2] < 100, 'one more cell of reach');

  const outra = partida([{ tipo: ALMOXARIFADO, time: 0, x: meio(10), y: meio(10) }]);
  outra.recursos = new Int32Array([1000, 0, 0]);
  iniciarPesquisa(outra, 0, 0);
  avancar(outra, 30);
  outra.ativo[0] = 0;
  avancar(outra, 10 * 30);
  assert.equal(pesquisaFeita(outra, 0, 0), false);
  assert.equal(outra.recursos[0], 600, 'no refund');
});
