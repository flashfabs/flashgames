// Mission triggers (C7): the compiler and its errors, every condition and every action, repetition, and a sandbox
// mission with three scripted waves that attack the player's base and end the match in victory or defeat.
import test from 'node:test';
import assert from 'node:assert/strict';
import { criarSimulacao, passo, REGRAS_LIVRES } from '../site/rts/js/sim/simulacao.js';
import { FP, EVENTO, TAMANHO_EVENTO, E_TIPO, E_ARG, E_X, E_Y, idDe } from '../site/rts/js/sim/contratos.js';
import { CLASSE } from '../site/rts/js/sim/dados.js';
import { REGRAS_COMBATE_PADRAO } from '../site/rts/js/sim/armas.js';
import { compilarMissao, textosDaMissao, rotulosDaMissao, cenasDaMissao, extrasMissao, rotular, resultadoDaMissao, temRotulo, RESULTADO, ESTADO_OBJETIVO, INTERVALO_GATILHOS } from '../site/rts/js/sim/gatilhos.js';
import { tipoLiberado, pesquisaFeita } from '../site/rts/js/sim/pesquisas.js';
import { tempoParaReligar, ordenarReligar } from '../site/rts/js/sim/religar.js';

const ARMAS = { ...REGRAS_COMBATE_PADRAO, armas: [{ nome: 'carabina', tipoDano: 'bala', dano: 10, recargaMs: 1000, alcance: 40 }, { nome: 'estilingue', tipoDano: 'bala', dano: 6, recargaMs: 1000, alcance: 40 }] };
const celulasPorSegundo = decimos => Math.trunc((decimos * FP) / 300);
const BASE = { giroCorpo: 16, giroTorre: 16, coletor: 0, alcance: 0, dano: 0, recarga: 30 };
const TIPOS = [
  { nome: 'turma', velocidade: celulasPorSegundo(12), vida: 100, raio: 160, visao: 7, classe: CLASSE.INFANTARIA, ...BASE },
  { nome: 'rolima', velocidade: celulasPorSegundo(30), vida: 60, raio: 200, visao: 7, classe: CLASSE.VEICULO, ...BASE },
  { nome: 'escritorio', velocidade: 1, vida: 600, raio: 700, visao: 6, classe: CLASSE.VEICULO_GRANDE, ...BASE },
  { nome: 'guincho', velocidade: celulasPorSegundo(16), vida: 400, raio: 300, visao: 5, classe: CLASSE.VEICULO, ...BASE, coletor: 1 },
  { nome: 'almoxarifado', velocidade: 1, vida: 800, raio: 700, visao: 5, classe: CLASSE.VEICULO_GRANDE, ...BASE },
  { nome: 'religador', velocidade: celulasPorSegundo(12), vida: 120, raio: 160, visao: 7, classe: CLASSE.INFANTARIA, ...BASE },
];
const COMBATE = [
  { arma: 'carabina', blindagem: 'pessoal', custo: 100 },
  { arma: 'estilingue', blindagem: 'leve', custo: 200 },
  { arma: null, blindagem: 'estrutura', custo: 1000 },
  { arma: null, blindagem: 'leve', custo: 300 },
  { arma: null, blindagem: 'estrutura', custo: 800, religavel: 1, tempoReligar: 20 },
  { arma: null, blindagem: 'pessoal', custo: 300, religa: 1 },
];
const PESQUISAS = { versao: 1, pesquisas: [{ nome: 'cabo-reforcado', custo: 0, tempoSegundos: 10, predio: 'almoxarifado', efeitos: [{ efeito: 'libera', tipos: ['guincho'] }] }] };

/** A match on an open 64x64 map with the mission, explicit units in cells and the combat fields on the kinds. */
function partida(missao, { unidades = [], dificuldade, lugares, timeNeutro } = {}) {
  const sim = criarSimulacao({
    mapa: { largura: 64, altura: 64, bases: [{ x: 32, y: 54 }, { x: 32, y: 6 }] },
    tipos: TIPOS,
    armas: ARMAS,
    pesquisas: PESQUISAS,
    missao,
    lugares,
    dificuldade,
    timeNeutro,
    regras: REGRAS_LIVRES,
    capacidade: 200,
    unidades: unidades.map(u => ({ direcao: 0, ...u, x: Math.trunc(u.x * FP), y: Math.trunc(u.y * FP), time: u.time })),
  });
  sim.tipos = Object.freeze(TIPOS.map((tipo, t) => Object.freeze({ ...tipo, ...COMBATE[t] })));
  return sim;
}

const meio = n => n + 1 / 2;
const missao = (gatilhos, extra = {}) => ({ versao: 1, id: 'teste', variaveis: { marca: 0 }, ...extra, gatilhos });
const marcar = (id, quando, mais = {}) => ({ id, quando, acoes: [{ faz: 'variavel', nome: 'marca', somar: 1 }], ...mais });
const marca = sim => extrasMissao(sim).variaveis[0];

// advances n trigger evaluations
function avaliacoes(sim, n = 1) {
  for (let k = 0; k < n * INTERVALO_GATILHOS; k++) passo(sim);
}

function eventosDoPasso(sim, tipo) {
  const lista = [];
  for (let k = 0; k < sim.eventos.length; k += TAMANHO_EVENTO) if (sim.eventos[k + E_TIPO] === tipo) lista.push(sim.eventos.slice(k, k + TAMANHO_EVENTO));
  return lista;
}

function coletar(sim, passos, tipos, parar = () => false) {
  const vistos = [];
  for (let k = 0; k < passos && !parar(sim); k++) {
    passo(sim);
    for (const tipo of tipos) if (tipo) vistos.push(...eventosDoPasso(sim, tipo));
  }
  return vistos;
}

const vivosDoTime = (sim, time) => {
  let n = 0;
  for (let i = 0; i < sim.capacidade; i++) if (sim.ativo[i] && sim.time[i] === time) n++;
  return n;
};

test('the compiler resolves difficulty, places and names, and lists every problem at once', () => {
  const m = {
    versao: 1,
    id: 'nomes',
    objetivos: [{ id: 'a', texto: 'obj.a', tipo: 'principal' }],
    areas: { norte: { x: 10, y: 2, largura: 4, altura: 3 } },
    grupos: { todos: ['onda-1', 'onda-2'] },
    gatilhos: [
      { id: 'g1', quando: { se: 'tempo', segundos: { facil: 30, normal: 20, dificil: 10 } }, acoes: [{ faz: 'mensagem', texto: 'msg.1' }, { faz: 'luz', cena: 'entardecer' }] },
      { id: 'g2', quando: { se: 'vivos', grupo: 'todos', maximo: 0 }, acoes: [{ faz: 'aviso', grupo: 'onda-2', area: 'norte', texto: 'msg.2' }, { faz: 'ordenar', grupo: 'onda-3', ordem: 'mover', ponto: 'ponte' }] },
    ],
  };
  const contexto = { tipos: TIPOS, times: 2, largura: 64, altura: 64, lugares: { pontos: { ponte: [20, 30] } } };
  assert.deepEqual(textosDaMissao(m), ['obj.a', 'msg.1', 'msg.2']);
  assert.deepEqual(rotulosDaMissao(m), ['onda-1', 'onda-2', 'onda-3']);
  assert.deepEqual(cenasDaMissao(m), ['entardecer']);
  assert.equal(compilarMissao(m, { ...contexto, dificuldade: 0 }).gatilhos[0].quando.passos, 30 * 30);
  assert.equal(compilarMissao(m, contexto).gatilhos[0].quando.passos, 20 * 30, 'normal by default');
  const c = compilarMissao(m, { ...contexto, dificuldade: 2 });
  assert.equal(c.gatilhos[0].quando.passos, 10 * 30);
  assert.deepEqual(Array.from(c.gatilhos[1].quando.grupo), [1, 1, 0], 'a union marks its labels');
  assert.equal(c.gatilhos[1].acoes[1].ponto.x, 20 * FP + FP / 2, 'a point from the map');
  assert.equal(c.gatilhos[1].acoes[0].area.x, 12 * FP, 'the centre of the area');

  assert.throws(
    () =>
      compilarMissao(
        {
          versao: 1,
          gatilhos: [
            { id: 'x', quando: { se: 'lua' }, acoes: [{ faz: 'dançar' }] },
            { id: 'x', quando: { se: 'tempo', segundos: 1.5 }, acoes: [{ faz: 'criar', jogador: 5, unidades: [{ tipo: 'dragao', quantos: 1 }], area: 'nenhuma' }] },
            { id: 'y', quando: { se: 'depoisDe', gatilho: 'z', segundos: { facil: 1 } }, acoes: [] },
          ],
        },
        contexto,
      ),
    erro => {
      for (const trecho of ['condição desconhecida lua', 'ação desconhecida dançar', 'id repetido x', '1.5 não é inteiro', 'fora de 0..1', 'tipo dragao não existe', 'área nenhuma não existe', 'gatilho z não existe', 'por dificuldade']) assert.ok(erro.message.includes(trecho), trecho);
      return true;
    },
  );
});

test('time, after, timer, variable, fired and difficulty conditions', () => {
  const sim = partida(
    missao(
      [
        { id: 'relogio', quando: { se: 'tempo', segundos: 1 }, acoes: [{ faz: 'cronometro', nome: 'espera', segundos: 2 }, { faz: 'variavel', nome: 'x', valor: 5 }] },
        { id: 'depois', quando: { se: 'depoisDe', gatilho: 'relogio', segundos: 1 }, acoes: [{ faz: 'variavel', nome: 'x', somar: 1 }] },
        marcar('fim-do-cronometro', { se: 'cronometro', nome: 'espera' }),
        { id: 'igual', quando: { se: 'variavel', nome: 'x', igual: 6 }, acoes: [{ faz: 'variavel', nome: 'y', valor: 1 }] },
        { id: 'disparado', quando: { se: 'todas', condicoes: [{ se: 'disparou', gatilho: 'igual' }, { se: 'nao', condicao: { se: 'dificuldade', minimo: 2 } }] }, acoes: [{ faz: 'variavel', nome: 'y', somar: 10 }] },
        { id: 'dificil', quando: { se: 'alguma', condicoes: [{ se: 'dificuldade', minimo: 2 }, { se: 'tempo', segundos: 100 }] }, acoes: [{ faz: 'variavel', nome: 'y', valor: -1 }] },
      ],
      { variaveis: { marca: 0, x: 0, y: 0 } },
    ),
  );
  const ex = extrasMissao(sim);
  const ate = segundos => {
    while (sim.tick < segundos * 30) passo(sim);
  };
  ate(0.9);
  assert.equal(ex.variaveis[1], 0);
  ate(1.1);
  assert.equal(ex.variaveis[1], 5, 'tempo');
  ate(2.1);
  assert.equal(ex.variaveis[1], 6, 'depoisDe');
  ate(2.9);
  assert.equal(marca(sim), 0);
  ate(3.2);
  assert.equal(marca(sim), 1, 'cronometro');
  assert.equal(ex.variaveis[2], 11, 'variavel igual, disparou, nao dificuldade');
  assert.equal(ex.disparos[5], 0, 'not hard');
});

test('count, alive, owner, health and seen conditions read the entities', () => {
  const m = missao(
    [
      marcar('tres-turmas', { se: 'contagem', jogador: 0, tipos: ['turma'], minimo: 3 }),
      { id: 'na-area', quando: { se: 'contagem', jogador: 1, area: 'ponte', minimo: 1 }, acoes: [{ faz: 'variavel', nome: 'area', valor: 1 }] },
      { id: 'grupo-morto', quando: { se: 'vivos', grupo: 'posto', maximo: 0 }, acoes: [{ faz: 'variavel', nome: 'morto', valor: 1 }] },
      { id: 'do-jogador', quando: { se: 'dono', grupo: 'torre', jogador: 0 }, acoes: [{ faz: 'variavel', nome: 'dono', valor: 1 }] },
      { id: 'ferido', quando: { se: 'vida', grupo: 'torre', maximoPorcento: 50 }, acoes: [{ faz: 'variavel', nome: 'ferido', valor: 1 }] },
      { id: 'avistou', quando: { se: 'visto', jogador: 0, area: 'ponte' }, acoes: [{ faz: 'variavel', nome: 'visto', valor: 1 }] },
    ],
    { variaveis: { marca: 0, area: 0, morto: 0, dono: 0, ferido: 0, visto: 0 }, areas: { ponte: { x: 40, y: 20, largura: 4, altura: 4 } } },
  );
  const sim = partida(m, {
    unidades: [
      { tipo: 0, time: 0, x: meio(10), y: meio(50) },
      { tipo: 0, time: 0, x: meio(12), y: meio(50) },
      { tipo: 2, time: 1, x: meio(30), y: meio(10) }, // posto
      { tipo: 4, time: 1, x: meio(50), y: meio(50) }, // torre
    ],
  });
  rotular(sim, 2, 'posto');
  rotular(sim, 3, 'torre');
  rotular(sim, 0, 'nome-que-a-missao-nao-usa');
  assert.ok(temRotulo(sim, idDe(2, sim.geracao[2]), 'posto'));
  assert.ok(!temRotulo(sim, idDe(0, sim.geracao[0]), 'posto'));
  const v = () => Array.from(extrasMissao(sim).variaveis);
  avaliacoes(sim, 2);
  assert.deepEqual(v(), [0, 0, 0, 0, 0, 0]);
  sim.time[3] = 0;
  sim.vida[3] = 400;
  sim.x[2] = Math.trunc(meio(41) * FP);
  sim.y[2] = Math.trunc(meio(21) * FP);
  sim.x[0] = Math.trunc(meio(38) * FP);
  sim.y[0] = Math.trunc(meio(22) * FP);
  avaliacoes(sim, 2);
  assert.deepEqual(v(), [0, 1, 0, 1, 1, 1], 'area, owner, health and seen');
  sim.ativo[2] = 0;
  avaliacoes(sim, 1);
  assert.equal(v()[2], 1, 'group destroyed');
  assert.equal(v()[0], 0);
  // a third turma of player 0 appears in a recycled slot; the old label does not stick to it
  sim.ativo[2] = 1;
  sim.geracao[2]++;
  sim.tipo[2] = 0;
  sim.time[2] = 0;
  avaliacoes(sim, 1);
  assert.equal(v()[0], 1, 'contagem by kind and player');
  assert.ok(!temRotulo(sim, idDe(2, sim.geracao[2]), 'posto'));
});

test('economy, idle player and research conditions', () => {
  const sim = partida(
    missao(
      [
        marcar('rico', { se: 'recursos', jogador: 0, minimo: 1000 }),
        { id: 'coletando', quando: { se: 'coletores', jogador: 0, minimo: 1 }, acoes: [{ faz: 'variavel', nome: 'c', valor: 1 }] },
        { id: 'parado', quando: { se: 'parado', jogador: 0, segundos: 2 }, acoes: [{ faz: 'variavel', nome: 'p', valor: 1 }] },
        { id: 'pesquisou', quando: { se: 'pesquisa', jogador: 0, pesquisa: 'cabo-reforcado' }, acoes: [{ faz: 'variavel', nome: 'q', valor: 1 }] },
      ],
      { variaveis: { marca: 0, c: 0, p: 0, q: 0 } },
    ),
    { unidades: [{ tipo: 3, time: 0, x: meio(10), y: meio(50) }] },
  );
  // the economy front's arrays, as the conditions read them
  sim.recursos = new Int32Array([500, 0]);
  sim.ultimoComando = new Int32Array(2);
  const v = () => Array.from(extrasMissao(sim).variaveis);
  sim.ultimoComando[0] = 45;
  while (sim.tick < 90) passo(sim);
  assert.deepEqual(v(), [0, 0, 0, 0]);
  sim.recursos[0] = 1000;
  sim.parada[0] = 0;
  sim.ultimoComando[0] = 0;
  avaliacoes(sim, 1);
  assert.deepEqual(v(), [1, 1, 1, 0]);
});

test('messages, warnings, objectives, light and camera become presentation events', () => {
  const m = missao([
    {
      id: 'tudo',
      quando: { se: 'tempo', segundos: 0 },
      acoes: [
        { faz: 'mensagem', texto: 'missao.ola', area: 'norte' },
        { faz: 'objetivo', objetivo: 'resistir', estado: 'ativo' },
        { faz: 'aviso', grupo: 'onda-1', area: 'norte', texto: 'alerta.norte' },
        { faz: 'luz', cena: 'entardecer' },
        { faz: 'camera', area: 'norte' },
        { faz: 'objetivo', objetivo: 'resistir', estado: 'ativo' },
      ],
    },
    { id: 'feito', quando: { se: 'objetivo', objetivo: 'resistir', estado: 'ativo' }, acoes: [{ faz: 'objetivo', objetivo: 'resistir', estado: 'cumprido' }] },
  ], { objetivos: [{ id: 'resistir', texto: 'missao.obj.resistir', tipo: 'principal' }], areas: { norte: { x: 30, y: 2, largura: 4, altura: 2 } } });
  const sim = partida(m);
  const tipos = [EVENTO.MENSAGEM_MISSAO, EVENTO.OBJETIVO, EVENTO.AVISO_ATAQUE, EVENTO.LUZ, EVENTO.CAMERA];
  const vistos = coletar(sim, 1, tipos);
  const mensagens = vistos.filter(e => e[E_TIPO] === EVENTO.MENSAGEM_MISSAO);
  assert.deepEqual(mensagens.map(e => e[E_ARG]), [1, 2], 'indices in textosDaMissao: the objective text comes first');
  assert.deepEqual([mensagens[0][E_X], mensagens[0][E_Y]], [32 * FP, 3 * FP]);
  const objetivos = vistos.filter(e => e[E_TIPO] === EVENTO.OBJETIVO);
  assert.deepEqual(objetivos.map(e => e[E_ARG]), [0 * 4 + ESTADO_OBJETIVO.ATIVO, 0 * 4 + ESTADO_OBJETIVO.CUMPRIDO], 'no repeat for the same state');
  if (EVENTO.AVISO_ATAQUE) assert.equal(vistos.filter(e => e[E_TIPO] === EVENTO.AVISO_ATAQUE)[0][E_ARG], 0);
  if (EVENTO.LUZ) assert.equal(vistos.filter(e => e[E_TIPO] === EVENTO.LUZ)[0][E_ARG], 0);
  if (EVENTO.CAMERA) assert.equal(vistos.filter(e => e[E_TIPO] === EVENTO.CAMERA)[0][E_X], 32 * FP);
  assert.equal(extrasMissao(sim).objetivos[0], ESTADO_OBJETIVO.CUMPRIDO);
});

test('spawning, orders, attack, owner, destruction, veterancy, unlocks, research and reveal act on the match', () => {
  const m = missao(
    [
      {
        id: 'chegam',
        quando: { se: 'tempo', segundos: 0 },
        acoes: [
          { faz: 'criar', jogador: 1, unidades: [{ tipo: 'rolima', quantos: { facil: 2, normal: 3, dificil: 5 } }, { tipo: 'turma', quantos: 1 }], area: 'norte', grupo: 'onda', veterania: 2 },
          { faz: 'criar', jogador: 0, unidades: [{ tipo: 'turma', quantos: 2 }], ponto: 'base', grupo: 'defesa' },
          { faz: 'ordenar', grupo: 'onda', ordem: 'atacarMovendo', rota: 'descida' },
          { faz: 'ordenar', grupo: 'defesa', ordem: 'segurar' },
          { faz: 'bloquear', jogador: 0, tipos: ['turma'] },
          { faz: 'revelar', jogador: 0, area: 'canto' },
          { faz: 'pesquisa', jogador: 0, pesquisa: 'cabo-reforcado' },
          { faz: 'religavel', grupo: 'defesa', segundos: 7 },
        ],
      },
      { id: 'depois', quando: { se: 'tempo', segundos: 1 }, acoes: [{ faz: 'dono', grupo: 'defesa', jogador: 1 }, { faz: 'destruir', grupo: 'onda' }, { faz: 'liberar', jogador: 0, tipos: ['turma'] }, { faz: 'gatilho', gatilho: 'nunca', ativo: false }] },
      marcar('nunca', { se: 'tempo', segundos: 2 }),
    ],
    { areas: { norte: { x: 30, y: 2, largura: 4, altura: 2 }, canto: { x: 1, y: 1, largura: 3, altura: 3 } }, pontos: { base: [32, 54] }, rotas: { descida: [[32, 20], [32, 40], [32, 52]] } },
  );
  const sim = partida(m, { dificuldade: 2 });
  const surgiram = coletar(sim, 1, [EVENTO.SURGIMENTO, EVENTO.ONDA]);
  assert.equal(surgiram.filter(e => e[E_TIPO] === EVENTO.SURGIMENTO).length, 8, '5 + 1 on hard, and 2');
  if (EVENTO.ONDA) assert.deepEqual(surgiram.filter(e => e[E_TIPO] === EVENTO.ONDA).map(e => e[E_ARG]), [0, 1]);
  const ex = extrasMissao(sim);
  const onda = [];
  const defesa = [];
  for (let i = 0; i < sim.capacidade; i++) {
    if (!sim.ativo[i]) continue;
    (sim.time[i] === 1 ? onda : defesa).push(i);
  }
  assert.equal(onda.length, 6);
  for (const i of onda) {
    assert.ok(sim.x[i] >> 10 >= 30 && sim.x[i] >> 10 < 34 && sim.y[i] >> 10 >= 2 && sim.y[i] >> 10 < 4, 'inside the area');
    assert.equal(sim.veterania[i], 2);
    assert.ok(sim.ordens.ordem[i] >= 0, 'has an order');
    assert.equal(sim.ordens.filaTamanho[i], 2, 'the rest of the route is queued');
  }
  for (const i of defesa) assert.equal(sim.segurando[i], 1);
  assert.equal(tipoLiberado(sim, 0, 0), false, 'bloquear');
  assert.equal(sim.neblina.explorado[0][2 * 64 + 2], 1, 'revelar');
  assert.ok(pesquisaFeita(sim, 0, 0), 'pesquisa');
  assert.equal(tipoLiberado(sim, 0, 3), true, 'the research unlocked the harvester');
  assert.equal(tempoParaReligar(sim, defesa[0]), 7 * 30, 'religavel');
  while (sim.tick < 31) passo(sim);
  for (const i of defesa) assert.equal(sim.time[i], 1, 'dono');
  for (const i of onda) assert.equal(sim.ativo[i], 0, 'destruir');
  assert.equal(tipoLiberado(sim, 0, 0), true, 'liberar');
  while (sim.tick < 70) passo(sim);
  assert.equal(ex.variaveis[0], 0, 'a trigger turned off never fires');
});

test('re-powering and attack orders driven by the mission', () => {
  const m = missao(
    [
      { id: 'prepara', quando: { se: 'tempo', segundos: 0 }, acoes: [{ faz: 'religavel', grupo: 'torre', segundos: 5 }, { faz: 'atacar', grupo: 'ataque', alvo: 'alvo' }] },
      { id: 'religando', quando: { se: 'religando', grupo: 'torre', jogador: 0 }, acoes: [{ faz: 'variavel', nome: 'r', valor: 1 }] },
      { id: 'religada', quando: { se: 'dono', grupo: 'torre', jogador: 0 }, acoes: [{ faz: 'variavel', nome: 'd', valor: 1 }] },
    ],
    { variaveis: { marca: 0, r: 0, d: 0 } },
  );
  const sim = partida(m, {
    timeNeutro: 2,
    unidades: [
      { tipo: 4, time: 2, x: meio(40), y: meio(40) },
      { tipo: 5, time: 0, x: meio(39), y: meio(41) },
      { tipo: 0, time: 0, x: meio(10), y: meio(10) },
      { tipo: 2, time: 1, x: meio(10), y: meio(30) },
    ],
  });
  rotular(sim, 0, 'torre');
  rotular(sim, 2, 'ataque');
  rotular(sim, 3, 'alvo');
  sim.segurando[0] = 1;
  passo(sim);
  assert.equal(tempoParaReligar(sim, 0), 5 * 30);
  const o = sim.ordens.ordem[2];
  assert.ok(o >= 0 && sim.ordens.alvo[o] === idDe(3, sim.geracao[3]), 'the attack order targets the labelled office');
  ordenarReligar(sim, [1], idDe(0, sim.geracao[0]));
  const ex = extrasMissao(sim);
  const r = [];
  while (sim.tick < 30 * 30 && ex.variaveis[2] === 0) {
    passo(sim);
    r.push(ex.variaveis[1]);
  }
  assert.equal(ex.variaveis[2], 1, 'dono after the re-powering');
  assert.equal(r.includes(1), true, 'religando while it worked');
  while (sim.tick < 30 * 30 && sim.vida[3] === 600) passo(sim);
  assert.ok(sim.vida[3] < 600, 'the attackers walked 20 cells to the office and fired');
});

test('repeating triggers wait their interval, and a finished match runs no more triggers', () => {
  const sim = partida(
    missao([
      marcar('pulso', { se: 'tempo', segundos: 0 }, { repete: true, intervaloSegundos: 1 }),
      { id: 'vence', quando: { se: 'variavel', nome: 'marca', minimo: 3 }, acoes: [{ faz: 'vitoria', jogador: 0 }, { faz: 'derrota', jogador: 1 }, { faz: 'variavel', nome: 'marca', somar: 100 }] },
    ]),
  );
  const fim = coletar(sim, 6 * 30, [EVENTO.VITORIA, EVENTO.DERROTA]);
  assert.equal(marca(sim), 103, 'three pulses, then the actions of the winning trigger');
  assert.deepEqual(fim.map(e => [e[E_TIPO], e[E_ARG]]), [[EVENTO.VITORIA, 0], [EVENTO.DERROTA, 1]]);
  assert.deepEqual(Array.from(resultadoDaMissao(sim)), [RESULTADO.VITORIA, RESULTADO.DERROTA]);
});

// The sandbox: the player holds a base with an office and a squad; three scripted waves come from the north after a
// warning of 10 s each, the next one when the previous is gone; victory after the third, defeat when the office falls.
const CAIXA_DE_AREIA = {
  versao: 1,
  id: 'caixa-de-areia-teste',
  objetivos: [{ id: 'resistir', texto: 'missao.caixa.obj.resistir', tipo: 'principal' }],
  areas: { 'chegada-norte': { x: 28, y: 2, largura: 8, altura: 3 } },
  rotas: { 'norte-base': [[32, 20], [32, 40], [32, 52]] },
  grupos: { ondas: ['onda-1', 'onda-2', 'onda-3'] },
  variaveis: { ondas: 0 },
  gatilhos: [
    { id: 'inicio', quando: { se: 'tempo', segundos: 0 }, acoes: [{ faz: 'mensagem', texto: 'missao.caixa.ola' }, { faz: 'objetivo', objetivo: 'resistir', estado: 'ativo' }] },
    { id: 'aviso-1', quando: { se: 'tempo', segundos: 5 }, acoes: [{ faz: 'aviso', grupo: 'onda-1', area: 'chegada-norte', texto: 'alerta.onda' }] },
    { id: 'onda-1', quando: { se: 'depoisDe', gatilho: 'aviso-1', segundos: 10 }, acoes: [{ faz: 'criar', jogador: 1, unidades: [{ tipo: 'rolima', quantos: { facil: 2, normal: 3, dificil: 4 } }], area: 'chegada-norte', grupo: 'onda-1' }, { faz: 'ordenar', grupo: 'onda-1', ordem: 'atacarMovendo', rota: 'norte-base' }, { faz: 'variavel', nome: 'ondas', somar: 1 }] },
    { id: 'aviso-2', quando: { se: 'todas', condicoes: [{ se: 'disparou', gatilho: 'onda-1' }, { se: 'vivos', grupo: 'onda-1', maximo: 0 }] }, acoes: [{ faz: 'aviso', grupo: 'onda-2', area: 'chegada-norte', texto: 'alerta.onda' }] },
    { id: 'onda-2', quando: { se: 'depoisDe', gatilho: 'aviso-2', segundos: 10 }, acoes: [{ faz: 'criar', jogador: 1, unidades: [{ tipo: 'rolima', quantos: 4 }], area: 'chegada-norte', grupo: 'onda-2' }, { faz: 'ordenar', grupo: 'onda-2', ordem: 'atacarMovendo', rota: 'norte-base' }, { faz: 'variavel', nome: 'ondas', somar: 1 }] },
    { id: 'aviso-3', quando: { se: 'todas', condicoes: [{ se: 'disparou', gatilho: 'onda-2' }, { se: 'vivos', grupo: 'onda-2', maximo: 0 }] }, acoes: [{ faz: 'aviso', grupo: 'onda-3', area: 'chegada-norte', texto: 'alerta.onda' }] },
    { id: 'onda-3', quando: { se: 'depoisDe', gatilho: 'aviso-3', segundos: 10 }, acoes: [{ faz: 'criar', jogador: 1, unidades: [{ tipo: 'rolima', quantos: 6 }], area: 'chegada-norte', grupo: 'onda-3' }, { faz: 'ordenar', grupo: 'onda-3', ordem: 'atacarMovendo', rota: 'norte-base' }, { faz: 'variavel', nome: 'ondas', somar: 1 }] },
    { id: 'vitoria', quando: { se: 'todas', condicoes: [{ se: 'variavel', nome: 'ondas', minimo: 3 }, { se: 'vivos', grupo: 'ondas', maximo: 0 }] }, acoes: [{ faz: 'objetivo', objetivo: 'resistir', estado: 'cumprido' }, { faz: 'vitoria', jogador: 0 }] },
    { id: 'derrota', quando: { se: 'contagem', jogador: 0, tipos: ['escritorio'], maximo: 0 }, acoes: [{ faz: 'objetivo', objetivo: 'resistir', estado: 'falhou' }, { faz: 'derrota', jogador: 0 }] },
  ],
};

function caixaDeAreia(defensores) {
  const unidades = [{ tipo: 2, time: 0, x: meio(32), y: meio(54) }];
  for (let k = 0; k < defensores; k++) unidades.push({ tipo: 0, time: 0, x: meio(28 + k), y: meio(50) });
  return partida(CAIXA_DE_AREIA, { unidades });
}

test('sandbox: the scripted waves attack after their warnings and the defended base wins', () => {
  const sim = caixaDeAreia(8);
  const fim = s => resultadoDaMissao(s).some(r => r !== RESULTADO.JOGANDO);
  const vistos = coletar(sim, 6 * 60 * 30, [EVENTO.TIRO, EVENTO.SURGIMENTO, EVENTO.MORTE, EVENTO.VITORIA, EVENTO.DERROTA, EVENTO.AVISO_ATAQUE, EVENTO.ONDA], fim);
  const ex = extrasMissao(sim);
  assert.equal(ex.variaveis[0], 3, 'three waves came');
  assert.equal(vistos.filter(e => e[E_TIPO] === EVENTO.SURGIMENTO).length, 3 + 4 + 6);
  // TIRO carries the shooter's kind: the rolimas are the waves
  assert.ok(vistos.some(e => e[E_TIPO] === EVENTO.TIRO && e[E_ARG] === 1), 'the waves fired at the base');
  assert.equal(resultadoDaMissao(sim)[0], RESULTADO.VITORIA);
  assert.equal(vistos.filter(e => e[E_TIPO] === EVENTO.VITORIA).length, 1);
  assert.equal(ex.objetivos[0], ESTADO_OBJETIVO.CUMPRIDO);
  if (EVENTO.AVISO_ATAQUE && EVENTO.ONDA) {
    const avisos = vistos.filter(e => e[E_TIPO] === EVENTO.AVISO_ATAQUE);
    const ondas = vistos.filter(e => e[E_TIPO] === EVENTO.ONDA);
    assert.equal(avisos.length, 3);
    ondas.forEach((o, k) => assert.ok(o[1] - avisos[k][1] >= 10 * 30, 'each wave at least 10 s after its warning'));
  }
  assert.ok(sim.tick / 30 < 6 * 60, `${Math.round(sim.tick / 30)} s`);
});

test('sandbox: an undefended office falls to the waves and the match is lost', () => {
  const sim = caixaDeAreia(0);
  const fim = s => resultadoDaMissao(s).some(r => r !== RESULTADO.JOGANDO);
  const vistos = coletar(sim, 8 * 60 * 30, [EVENTO.DERROTA], fim);
  assert.equal(resultadoDaMissao(sim)[0], RESULTADO.DERROTA);
  assert.equal(vistos.length, 1);
  assert.equal(extrasMissao(sim).objetivos[0], ESTADO_OBJETIVO.FALHOU);
  assert.equal(vivosDoTime(sim, 0), 0);
});
