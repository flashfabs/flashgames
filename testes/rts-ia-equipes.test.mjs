// Computer teams of a mission (site/rts/js/sim/comportamentos/, front F6): the "equipes" block compiles with its
// errors and difficulty values; each behaviour (guard, patrol, attack along a route with a warning, harvesters by
// difficulty, wave size by the army seen, fall back, rebuild with the player's own Carga, start and stop triggers)
// does what it says on a small open map; the teams act only by their player's commands; and they do not cheat:
// two matches that differ only in enemy units the team cannot see give the same decisions, tick by tick.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { criarSimulacao, passo, REGRAS_LIVRES, somaDeVerificacao } from '../site/rts/js/sim/simulacao.js';
import { FP, FP_BITS, EVENTO, TIPO_COMANDO, CATEGORIA, TAMANHO_EVENTO, E_TIPO, E_ARG, E_X, E_Y, idDe } from '../site/rts/js/sim/contratos.js';
import { compilarDados } from '../site/rts/js/sim/dados.js';
import { REGRAS_COMBATE_PADRAO } from '../site/rts/js/sim/armas.js';
import { rotulosDaMissao, rotular, temRotulo } from '../site/rts/js/sim/gatilhos.js';
import { matar, criarEntidade, idDoSlot } from '../site/rts/js/sim/entidades.js';
import { celulaVisivel } from '../site/rts/js/sim/neblina.js';
import { salvar, carregar } from '../site/rts/js/sim/persistencia.js';
import { compilarEquipes, decisaoDoJogador, COMPORTAMENTO, FASE, INTERVALO_DECISAO } from '../site/rts/js/sim/comportamentos/equipes.js';

const infantaria = { classe: 'infantaria', blindagem: 'pessoal', lotacao: 1, raio: 2, giroCorpo: 16, giroTorre: 16, tempoMs: 12000 };
const veiculo = { classe: 'veiculo', blindagem: 'leve', lotacao: 2, raio: 2, giroCorpo: 16, giroTorre: 16, tempoMs: 15000 };
const DADOS = {
  unidades: {
    versao: 1,
    unidades: [
      { nome: 'turma', faccao: 'religadores', ...infantaria, custo: 100, vida: 100, velocidade: 120, visao: 7, arma: 'carabina' },
      { nome: 'chapa', faccao: 'desligados', ...infantaria, custo: 100, vida: 100, velocidade: 120, visao: 7, arma: 'carabina' },
      { nome: 'rolima', faccao: 'desligados', ...veiculo, custo: 120, vida: 120, velocidade: 300, visao: 7, arma: 'estilingue' },
      { nome: 'guincho', faccao: 'religadores', ...veiculo, raio: 3, custo: 300, vida: 400, velocidade: 100, visao: 5, coletor: 1, coleta: { carga: 100, carregarMs: 4000, descarregarMs: 2000, recolherFaiscaMs: 2000 } },
    ],
  },
  predios: {
    versao: 1,
    predios: [
      { nome: 'escritorio', faccao: 'religadores', pegada: [2, 2], custo: 0, tempoMs: 0, vida: 800, visao: 6 },
      { nome: 'carrocao', faccao: 'desligados', pegada: [3, 2], custo: 0, tempoMs: 0, vida: 1500, visao: 6, filaConstrucao: 1, raioConstrucao: 10, constroi: ['barracao'] },
      { nome: 'barracao', faccao: 'desligados', pegada: [2, 2], custo: 400, tempoMs: 3000, vida: 600, visao: 5 },
    ],
  },
  armas: { ...REGRAS_COMBATE_PADRAO, armas: [{ nome: 'carabina', tipoDano: 'bala', dano: 10, recargaMs: 1000, alcance: 40 }, { nome: 'estilingue', tipoDano: 'bala', dano: 8, recargaMs: 800, alcance: 40 }] },
  pesquisas: { versao: 1, pesquisas: [] },
};
const TIPOS = compilarDados(DADOS).tipos;
const [TURMA, CHAPA, ROLIMA, GUINCHO, ESCRITORIO, CARROCAO, BARRACAO] = [0, 1, 2, 3, 4, 5, 6];
const JOGADOR = 0;
const IA = 1;
const ROTULOS = ['guarda', 'onda', 'reserva', 'patrulha', 'acampamento'];
const LUGARES = {
  areas: { posto: { x: 28, y: 10, largura: 8, altura: 6 }, base: { x: 26, y: 50, largura: 12, altura: 8 }, casa: { x: 26, y: 2, largura: 12, altura: 6 } },
  pontos: { esquina: [10, 30] },
  rotas: { ida: [[32, 20], [32, 38]], volta: [[10, 10], [54, 10], [54, 30]] },
};

// a unit at the centre of its cell; a building centred on its footprint, whose top-left cell is given, as maps do
const posicao = (tipo, c, eixo) => (TIPOS[tipo].categoria === CATEGORIA.PREDIO ? c * FP + ((TIPOS[tipo].pegada[eixo] * FP) >> 1) : c * FP + (FP >> 1));

/** A match on an open 64x64 map: the mission with these teams and triggers, units in cells with optional labels. */
function partida({ equipes, unidades, gatilhos = [], dificuldade, cargaInicial = 0, capacidade = 300 }) {
  const missao = { versao: 1, id: 'teste-ia', ...LUGARES, grupos: { rotulados: ROTULOS }, gatilhos, equipes };
  const sim = criarSimulacao({
    mapa: { largura: 64, altura: 64, bases: [{ x: 32, y: 54 }, { x: 32, y: 6 }] },
    dados: DADOS,
    missao,
    dificuldade,
    regras: REGRAS_LIVRES,
    capacidade,
    cargaInicial,
    unidades: unidades.map(u => ({ direcao: 0, tipo: u.tipo, time: u.time, x: posicao(u.tipo, u.x, 0), y: posicao(u.tipo, u.y, 1) })),
  });
  unidades.forEach((u, k) => u.rotulo && rotular(sim, k, u.rotulo));
  return sim;
}

const fileira = (tipo, time, x, y, n, rotulo) => Array.from({ length: n }, (_, k) => ({ tipo, time, x: x + (k % 4), y: y + Math.trunc(k / 4), rotulo }));
const segundos = s => s * 30;

// Runs `passos` ticks, collecting the computer player's commands (as scheduled) and the events of every tick.
function jogar(sim, passos, { parar = () => false } = {}) {
  const comandos = [];
  const eventos = [];
  for (let k = 0; k < passos && !parar(sim); k++) {
    const antes = sim.comandos.length;
    passo(sim);
    for (const c of sim.comandos.slice(antes)) if (c.jogador === IA) comandos.push({ ...c, emitidoEm: sim.tick });
    for (let o = 0; o < sim.eventos.length; o += TAMANHO_EVENTO) {
      const tipo = sim.eventos[o + E_TIPO];
      if (tipo === EVENTO.AVISO_ATAQUE || tipo === EVENTO.ONDA) eventos.push({ tipo, tick: sim.tick, arg: sim.eventos[o + E_ARG], x: sim.eventos[o + E_X], y: sim.eventos[o + E_Y] });
    }
  }
  return { comandos, eventos };
}

const vivos = (sim, time, tipo) => {
  const lista = [];
  for (let i = 0; i < sim.capacidade; i++) if (sim.ativo[i] && sim.time[i] === time && (tipo === undefined || sim.tipo[i] === tipo)) lista.push(i);
  return lista;
};
const celula = v => v >> FP_BITS;
const centro = (sim, slots) => ({ x: slots.reduce((s, i) => s + celula(sim.x[i]), 0) / slots.length, y: slots.reduce((s, i) => s + celula(sim.y[i]), 0) / slots.length });
const ordenarJogador = (sim, slots, tipo, x, y, seq) => sim.comandos.push({ tick: sim.tick + 1, jogador: JOGADOR, seq, tipo, alvo: -1, x: Math.trunc((x + 0.5) * FP), y: Math.trunc((y + 0.5) * FP), arg: 0, fila: 0, unidades: slots.map(i => idDoSlot(sim, i)) });

// ---------- format ----------

const compilar = (equipes, dificuldade = 'normal', gatilhos = []) => compilarEquipes({ versao: 1, id: 'x', ...LUGARES, grupos: { rotulados: ROTULOS }, gatilhos, equipes }, { dificuldade, times: 2, largura: 64, altura: 64 });

test('the teams block compiles places, triggers and numbers by difficulty, with defaults', () => {
  const gatilhos = [{ id: 'comeca', quando: { se: 'tempo', segundos: 5 }, acoes: [] }];
  const equipes = [
    { id: 'g', grupo: 'guarda', jogador: IA, faz: 'guardar', area: 'posto' },
    { id: 'a', grupo: 'onda', jogador: IA, faz: 'atacar', rota: 'ida', area: 'base', aviso: { facil: 20, normal: 15, dificil: 10 }, desde: 'comeca', recuar: 40, recuo: 'casa', escala: { reserva: 'reserva', porcento: { facil: 50, normal: 100, dificil: 150 } } },
    { id: 'p', grupo: 'patrulha', jogador: IA, faz: 'patrulhar', rota: 'volta', alcance: 8 },
    { id: 'r', grupo: 'acampamento', jogador: IA, faz: 'reconstruir', espera: 5 },
    { id: 'v', grupo: 'rotulados', jogador: IA, faz: 'recuar', ponto: 'esquina' },
  ];
  const facil = compilar(equipes, 'facil', gatilhos);
  const dificil = compilar(equipes, 'dificil', gatilhos);
  const [g, a, p, r, v] = dificil.equipes;
  assert.deepEqual(dificil.jogadores, [IA]);
  assert.equal(g.faz, COMPORTAMENTO.GUARDAR);
  assert.equal(g.alcance, 6);
  assert.deepEqual([g.lugar.cx0, g.lugar.cy0, g.lugar.cx1, g.lugar.cy1], [28, 10, 36, 16]);
  assert.equal(a.aviso, segundos(10));
  assert.equal(facil.equipes[1].aviso, segundos(20));
  assert.equal(a.coletores, 50, 'hard sends half the wave at harvesters by default');
  assert.equal(facil.equipes[1].coletores, 0, 'easy leaves harvesters alone by default');
  assert.equal(a.desde, 0);
  assert.equal(a.ate, -1);
  assert.equal(a.escala.porcento, 150);
  assert.equal(a.rota.length, 2);
  assert.equal(a.recuo.cx0, 26);
  assert.equal(p.rota.length, 3);
  assert.equal(p.alcance, 8);
  assert.equal(r.espera, segundos(5));
  assert.equal(v.alcance, 4);
  assert.deepEqual([v.lugar.cx0, v.lugar.cy0], [6, 26], 'a point with the default 4-cell radius');
  // a union marks all its labels, and its events carry its first one
  assert.equal(v.grupo.filter(Boolean).length, ROTULOS.length);
  assert.equal(compilar([]), null);
});

test('the teams block reports every problem at once', () => {
  assert.throws(
    () =>
      compilar([
        { id: 'a', grupo: 'ninguem', jogador: IA, faz: 'atacar', area: 'base', aviso: 5 },
        { id: 'a', grupo: 'guarda', jogador: 9, faz: 'voar' },
        { id: 'c', grupo: 'guarda', jogador: IA, faz: 'guardar', desde: 'nunca' },
        { id: 'd', grupo: 'patrulha', jogador: IA, faz: 'patrulhar', rota: 'sumida' },
        { id: 'e', grupo: 'guarda', jogador: IA, faz: 'guardar', area: 'posto', recuar: 30 },
      ]),
    erro => {
      for (const trecho of ['ninguem não é rótulo', 'aviso: 5 s', 'id ausente ou repetido', 'jogador: 9 fora', 'voar não é', 'gatilho nunca não existe', 'falta area ou ponto', 'rota sumida não existe', 'recuar sem recuo']) assert.match(erro.message, new RegExp(trecho), trecho);
      return true;
    },
  );
});

// ---------- behaviours ----------

test('a guard team attacks what enters its zone and goes back to it afterwards', () => {
  const sim = partida({
    equipes: [{ id: 'g', grupo: 'guarda', jogador: IA, faz: 'guardar', area: 'posto', alcance: 4 }],
    unidades: [...fileira(CHAPA, IA, 30, 12, 4, 'guarda'), { tipo: TURMA, time: JOGADOR, x: 32, y: 40 }],
  });
  const intruso = vivos(sim, JOGADOR)[0];
  const parado = jogar(sim, segundos(5));
  assert.ok(parado.comandos.every(c => c.tipo === TIPO_COMANDO.ATACAR_MOVENDO && celula(c.x) === 32 && celula(c.y) === 13), 'only holds the zone centre while nobody comes');
  ordenarJogador(sim, [intruso], TIPO_COMANDO.MOVER, 32, 18, 1);
  const luta = jogar(sim, segundos(40), { parar: s => !s.ativo[intruso] });
  assert.equal(sim.ativo[intruso], 0, 'the intruder falls');
  assert.ok(luta.comandos.some(c => c.tipo === TIPO_COMANDO.ATACAR_MOVENDO && celula(c.y) >= 17), 'the guards went at the intruder');
  const volta = jogar(sim, segundos(25));
  assert.ok(volta.comandos.some(c => c.tipo === TIPO_COMANDO.ATACAR_MOVENDO && celula(c.x) === 32 && celula(c.y) === 13), 'and were sent back to the zone');
  const guardas = vivos(sim, IA);
  const c = centro(sim, guardas);
  assert.ok(c.y >= 9 && c.y <= 17 && c.x >= 27 && c.x <= 37, `back in the zone: ${JSON.stringify(c)}`);
});

test('a patrol team walks its route to the end and back', () => {
  const sim = partida({
    equipes: [{ id: 'p', grupo: 'patrulha', jogador: IA, faz: 'patrulhar', rota: 'volta' }],
    unidades: fileira(ROLIMA, IA, 20, 20, 3, 'patrulha'),
  });
  const pontos = [];
  for (let k = 0; k < 120; k++) {
    jogar(sim, segundos(1));
    const ponto = sim.extras.equipes.ponto[0];
    if (pontos.at(-1) !== ponto) pontos.push(ponto);
  }
  assert.deepEqual(pontos.slice(0, 5), [0, 1, 2, 1, 0], 'out to the third point and back to the first');
});

test('an attack warns at least its warning time before leaving, follows its route and hits the base', () => {
  const sim = partida({
    gatilhos: [{ id: 'comeca', quando: { se: 'tempo', segundos: 2 }, acoes: [] }],
    equipes: [{ id: 'a', grupo: 'onda', jogador: IA, faz: 'atacar', rota: 'ida', area: 'base', aviso: 12, desde: 'comeca', coletores: 0 }],
    unidades: [...fileira(ROLIMA, IA, 30, 5, 6, 'onda'), { tipo: ESCRITORIO, time: JOGADOR, x: 31, y: 53 }],
  });
  const escritorio = vivos(sim, JOGADOR)[0];
  const inicio = vivos(sim, IA).map(i => [sim.x[i], sim.y[i]]);
  const { comandos, eventos } = jogar(sim, segundos(100), { parar: s => !s.ativo[escritorio] });
  const aviso = eventos.find(e => e.tipo === EVENTO.AVISO_ATAQUE);
  const onda = eventos.find(e => e.tipo === EVENTO.ONDA);
  assert.ok(aviso && onda, 'a warning and a wave');
  const missao = sim.opcoes.missao;
  assert.equal(rotulosDaMissao(missao)[aviso.arg], 'onda');
  assert.equal(onda.arg, aviso.arg);
  assert.deepEqual([celula(aviso.x), celula(aviso.y)], [32, 54], 'the warning points at the destination');
  assert.ok(aviso.tick >= segundos(2) && aviso.tick <= segundos(2) + INTERVALO_DECISAO + 3);
  assert.ok(onda.tick - aviso.tick >= segundos(12), `left ${(onda.tick - aviso.tick) / 30} s after the warning`);
  assert.ok(comandos.every(c => c.emitidoEm >= onda.tick || c.tipo !== TIPO_COMANDO.ATACAR_MOVENDO), 'nobody moves during the warning');
  const primeiroPasso = comandos.find(c => c.tipo === TIPO_COMANDO.ATACAR_MOVENDO);
  assert.deepEqual([celula(primeiroPasso.x), celula(primeiroPasso.y)], [32, 20], 'first leg to the first route point');
  assert.ok(comandos.some(c => celula(c.x) === 32 && celula(c.y) === 38), 'then the second one');
  assert.equal(sim.ativo[escritorio], 0, 'the base building falls');
  assert.ok(inicio.length === 6);
});

test('harvesters in sight draw part of the wave by difficulty', () => {
  const caca = dificuldade => {
    const sim = partida({
      dificuldade,
      equipes: [{ id: 'a', grupo: 'onda', jogador: IA, faz: 'atacar', rota: 'ida', area: 'base' }],
      unidades: [...fileira(ROLIMA, IA, 30, 14, 4, 'onda'), { tipo: GUINCHO, time: JOGADOR, x: 38, y: 24 }],
    });
    const guincho = idDoSlot(sim, vivos(sim, JOGADOR)[0]);
    const { comandos } = jogar(sim, segundos(20));
    return comandos.filter(c => c.tipo === TIPO_COMANDO.ATACAR && c.alvo === guincho).map(c => c.unidades.length);
  };
  assert.deepEqual(caca('facil'), [], 'easy leaves it alone');
  assert.deepEqual(caca('normal').slice(0, 1), [1], 'normal sends a quarter (rounded up)');
  assert.deepEqual(caca('dificil').slice(0, 1), [2], 'hard sends half');
});

test('a scaled wave takes units from the reserve against a big army and gives them back against none', () => {
  const montar = (naOnda, exercito) =>
    partida({
      equipes: [{ id: 'a', grupo: 'onda', jogador: IA, faz: 'atacar', area: 'base', coletores: 0, escala: { reserva: 'reserva', minimo: 2, maximo: 10 } }],
      unidades: [...fileira(CHAPA, IA, 24, 4, naOnda, 'onda'), ...fileira(CHAPA, IA, 40, 4, 8, 'reserva'), ...fileira(TURMA, JOGADOR, 24, 10, exercito)],
    });
  const contar = sim => {
    let o = 0;
    let r = 0;
    for (const i of vivos(sim, IA)) {
      if (temRotulo(sim, idDoSlot(sim, i), 'onda')) o++;
      if (temRotulo(sim, idDoSlot(sim, i), 'reserva')) r++;
    }
    return [o, r];
  };
  // six enemy infantry in sight (600 of strength): the wave grows to six of the same strength
  const grande = montar(2, 6);
  jogar(grande, INTERVALO_DECISAO * 2);
  assert.deepEqual(contar(grande), [6, 4]);
  // nothing in sight: the wave keeps its minimum and the rest goes to the reserve
  const nenhum = montar(5, 0);
  jogar(nenhum, INTERVALO_DECISAO * 2);
  assert.deepEqual(contar(nenhum), [2, 11]);
});

test('a beaten attack falls back to its fallback place and guards it', () => {
  const sim = partida({
    equipes: [{ id: 'a', grupo: 'onda', jogador: IA, faz: 'atacar', area: 'base', coletores: 0, recuar: 60, recuo: 'casa' }],
    unidades: [...fileira(CHAPA, IA, 30, 30, 4, 'onda'), ...fileira(TURMA, JOGADOR, 29, 44, 12)],
  });
  const { comandos } = jogar(sim, segundos(60));
  const recuo = comandos.find(c => c.tipo === TIPO_COMANDO.MOVER);
  assert.ok(recuo, 'it fell back');
  assert.deepEqual([celula(recuo.x), celula(recuo.y)], [32, 5], 'to the centre of the fallback area');
  assert.equal(sim.extras.equipes.recuado[0], 1);
  const sobreviventes = vivos(sim, IA);
  if (sobreviventes.length > 0) assert.ok(centro(sim, sobreviventes).y < 16, 'what is left of the team is back home');
});

test('a camp rebuilds a fallen building with its own Carga, on the same cell, and only when it can pay', () => {
  const montar = cargaInicial =>
    partida({
      cargaInicial,
      equipes: [{ id: 'r', grupo: 'acampamento', jogador: IA, faz: 'reconstruir', espera: 5 }],
      unidades: [
        { tipo: CARROCAO, time: IA, x: 30, y: 4, rotulo: 'acampamento' },
        { tipo: BARRACAO, time: IA, x: 36, y: 4, rotulo: 'acampamento' },
      ],
    });
  const sim = montar(1000);
  jogar(sim, segundos(2));
  const [, barracao] = vivos(sim, IA);
  const lugar = [sim.x[barracao], sim.y[barracao]];
  matar(sim, barracao, -1);
  const { comandos } = jogar(sim, segundos(20));
  assert.deepEqual(comandos.map(c => c.tipo), [TIPO_COMANDO.PRODUZIR, TIPO_COMANDO.CONSTRUIR]);
  assert.ok(comandos[0].emitidoEm >= segundos(7), 'after the wait');
  const novo = vivos(sim, IA, BARRACAO);
  assert.equal(novo.length, 1, 'rebuilt');
  assert.deepEqual([sim.x[novo[0]], sim.y[novo[0]]], lugar, 'where it stood');
  assert.ok(temRotulo(sim, idDoSlot(sim, novo[0]), 'acampamento'), 'with the group label');
  assert.equal(sim.extras.economia.carga[IA], 600, 'paid from the player Carga');

  const pobre = montar(300);
  jogar(pobre, segundos(2));
  matar(pobre, vivos(pobre, IA, BARRACAO)[0], -1);
  assert.deepEqual(jogar(pobre, segundos(30)).comandos, [], 'nothing without the Carga');
  assert.equal(pobre.extras.economia.carga[IA], 300);
});

test('a team waits for its start trigger and stops at its stop trigger', () => {
  const sim = partida({
    gatilhos: [
      { id: 'comeca', quando: { se: 'tempo', segundos: 5 }, acoes: [] },
      { id: 'para', quando: { se: 'tempo', segundos: 15 }, acoes: [] },
    ],
    equipes: [{ id: 'g', grupo: 'guarda', jogador: IA, faz: 'guardar', area: 'casa', desde: 'comeca', ate: 'para' }],
    unidades: fileira(CHAPA, IA, 10, 40, 4, 'guarda'),
  });
  const { comandos } = jogar(sim, segundos(30));
  assert.ok(comandos.length > 0);
  assert.ok(comandos.every(c => c.emitidoEm > segundos(5) && c.emitidoEm < segundos(15) + INTERVALO_DECISAO), comandos.map(c => c.emitidoEm).join(' '));
  assert.equal(sim.extras.equipes.fase[0], FASE.PARADA);
});

test('the teams act only through their player commands, one tick later, with their own sequence', () => {
  const sim = partida({
    equipes: [{ id: 'a', grupo: 'onda', jogador: IA, faz: 'atacar', rota: 'ida', area: 'base' }],
    unidades: [...fileira(ROLIMA, IA, 30, 5, 4, 'onda'), { tipo: ESCRITORIO, time: JOGADOR, x: 31, y: 53 }],
  });
  const { comandos } = jogar(sim, segundos(30));
  assert.ok(comandos.length > 0);
  for (const c of comandos) {
    assert.equal(c.jogador, IA);
    assert.equal(c.tick, c.emitidoEm + 1);
  }
  assert.deepEqual(comandos.map(c => c.seq), comandos.map((_, k) => k + 1));
});

// ---------- no cheating ----------

// The match of the no-cheating test: a guard with the player's infantry at the edge of its zone, a patrol, a scaled
// wave that leaves after a warning, a reserve, and the player's base, plus a hidden army in the far corner, which the
// computer teams never see.
function partidaComExercitoEscondido(escondidos) {
  return partida({
    gatilhos: [{ id: 'comeca', quando: { se: 'tempo', segundos: 3 }, acoes: [] }],
    equipes: [
      { id: 'g', grupo: 'guarda', jogador: IA, faz: 'guardar', area: 'posto' },
      { id: 'p', grupo: 'patrulha', jogador: IA, faz: 'patrulhar', rota: 'volta' },
      { id: 'a', grupo: 'onda', jogador: IA, faz: 'atacar', rota: 'ida', area: 'base', aviso: 10, desde: 'comeca', coletores: 50, escala: { reserva: 'reserva', porcento: 120, minimo: 3 }, recuar: 30, recuo: 'casa' },
      { id: 'r', grupo: 'reserva', jogador: IA, faz: 'guardar', area: 'casa' },
    ],
    unidades: [
      ...fileira(CHAPA, IA, 30, 12, 4, 'guarda'),
      ...fileira(ROLIMA, IA, 10, 9, 3, 'patrulha'),
      ...fileira(ROLIMA, IA, 44, 3, 4, 'onda'),
      ...fileira(CHAPA, IA, 28, 3, 8, 'reserva'),
      ...fileira(TURMA, JOGADOR, 30, 21, 6),
      { tipo: GUINCHO, time: JOGADOR, x: 36, y: 36 },
      { tipo: ESCRITORIO, time: JOGADOR, x: 31, y: 53 },
      ...fileira(TURMA, JOGADOR, 2, 60, escondidos),
    ],
  });
}

// Changes the player's units on cells the computer team does not see (with `canto`, only those in the far corner,
// which no team ever comes near): moves each one a cell and halves its health and, with `contagem`, also removes one
// and adds six. Returns how many changed.
function mexerNoEscondido(sim, { contagem = false, canto = false } = {}) {
  const escondido = i => !celulaVisivel(sim, IA, celula(sim.y[i]) * sim.mapa.largura + celula(sim.x[i]));
  const noCanto = i => !canto || (celula(sim.x[i]) < 12 && celula(sim.y[i]) > 54);
  const lista = vivos(sim, JOGADOR).filter(i => escondido(i) && noCanto(i));
  lista.forEach((i, k) => {
    if (contagem && k === 0) return matar(sim, i, -1);
    sim.x[i] = Math.max(FP, sim.x[i] - FP);
    sim.vida[i] = 1 + (sim.vida[i] >> 1);
  });
  if (contagem) for (let k = 0; k < 6; k++) criarEntidade(sim, TURMA, JOGADOR, (1 + k) * FP + FP / 2, 62 * FP + FP / 2);
  assert.ok(lista.every(i => !sim.ativo[i] || escondido(i)), 'still hidden');
  return lista.length + (contagem ? 6 : 0);
}

// Two matches from the same saved state, one of them changed where the team cannot see: the decision at that tick is
// the same with every hidden unit moved and hurt, one removed and six added. Over the next seconds the matches are
// compared with only the far-corner army moved and hurt: a unit hidden now may come into sight later at the place it
// was moved to (a different visible world), and a removed or added unit shifts the slots of everything created later
// (sparks, new units) and with them the order the rules visit entities in.
test('no cheating: units the computer team cannot see change none of its decisions', () => {
  const base = partidaComExercitoEscondido(12);
  let comparadas = 0;
  let ativas = 0;
  for (let ponto = 0; ponto < 14; ponto++) {
    jogar(base, segundos(5));
    const bytes = salvar(base);
    const contada = [carregar(bytes), carregar(bytes)];
    assert.ok(mexerNoEscondido(contada[1], { contagem: true }) > 0);
    assert.deepEqual(decisaoDoJogador(contada[1], IA), decisaoDoJogador(contada[0], IA), `decision at tick ${base.tick}`);
    assert.deepEqual(contada[1].extras.equipes, contada[0].extras.equipes);
    const igual = carregar(bytes);
    const mexida = carregar(bytes);
    assert.ok(mexerNoEscondido(mexida, { canto: true }) > 0);
    const a = jogar(igual, segundos(5));
    const b = jogar(mexida, segundos(5));
    assert.deepEqual(b.comandos, a.comandos, `commands after tick ${base.tick}`);
    assert.deepEqual(b.eventos, a.eventos);
    assert.deepEqual(mexida.extras.equipes, igual.extras.equipes, 'the teams state, the army seen included');
    comparadas++;
    ativas += a.comandos.length;
  }
  assert.equal(comparadas, 14);
  assert.ok(ativas >= 10, `the teams were busy (${ativas} commands compared)`);
});

test('a hidden army does not grow a scaled wave, a seen one does', () => {
  const tamanhoDaOnda = (escondidos, vistos) => {
    const sim = partida({
      equipes: [{ id: 'a', grupo: 'onda', jogador: IA, faz: 'atacar', area: 'base', coletores: 0, escala: { reserva: 'reserva', minimo: 1, maximo: 20 } }],
      unidades: [...fileira(CHAPA, IA, 24, 4, 1, 'onda'), ...fileira(CHAPA, IA, 40, 4, 12, 'reserva'), ...fileira(TURMA, JOGADOR, 2, 60, escondidos), ...fileira(TURMA, JOGADOR, 24, 10, vistos)],
    });
    jogar(sim, INTERVALO_DECISAO * 2);
    return vivos(sim, IA).filter(i => temRotulo(sim, idDoSlot(sim, i), 'onda')).length;
  };
  assert.equal(tamanhoDaOnda(0, 0), 1);
  assert.equal(tamanhoDaOnda(20, 0), 1, 'twenty hidden units count for nothing');
  assert.equal(tamanhoDaOnda(20, 4), 4);
});

test('the decisions module reads no simulation state: it imports only contracts and integer helpers', () => {
  const fonte = readFileSync(new URL('../site/rts/js/sim/comportamentos/decisoes.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const importados = [...fonte.matchAll(/from '([^']+)'/g)].map(m => m[1]).sort();
  assert.deepEqual(importados, ['../contratos.js', '../matematica.js', '../pegadas.js']);
  assert.doesNotMatch(fonte, /\bsim\b/, 'no sim in the decisions');
});

// ---------- determinism ----------

test('a match with teams saved and loaded midway ends with the same checksum', () => {
  const corrida = partidaComExercitoEscondido(6);
  jogar(corrida, segundos(25));
  const meio = carregar(salvar(corrida));
  jogar(corrida, segundos(25));
  jogar(meio, segundos(25));
  assert.equal(somaDeVerificacao(meio), somaDeVerificacao(corrida));
  assert.ok(Object.keys(corrida.extras.equipes).length > 0, 'the teams state is saved');
});

test('a match without teams keeps no teams state, so its checksums stay as they were', () => {
  const sim = criarSimulacao({ mapa: { largura: 32, altura: 32, bases: [{ x: 8, y: 8 }, { x: 24, y: 24 }] }, dados: DADOS, regras: REGRAS_LIVRES, capacidade: 16, unidades: [{ tipo: TURMA, time: 0, x: 8 * FP, y: 8 * FP }] });
  assert.deepEqual(sim.extras.equipes, {});
  assert.equal(idDe(0, 1) > 0, true);
});
