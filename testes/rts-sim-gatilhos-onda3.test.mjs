// The trigger vocabulary of the phase 1 mission: round zones, hits, nearness, re-powering progress, re-powering by
// repair, the REPARAR command, and the camp that packs up, runs along a route, unpacks, and pays its reward when taken
// down.
import test from 'node:test';
import assert from 'node:assert/strict';
import { criarSimulacao, passo, agendarComando, REGRAS_LIVRES } from '../site/rts/js/sim/simulacao.js';
import { FP, EVENTO, TAMANHO_EVENTO, E_TIPO, E_X, E_Y, E_ARG, TIPO_COMANDO, CATEGORIA, DONO_NEUTRO, criarComando, idDe } from '../site/rts/js/sim/contratos.js';
import { REGRAS_COMBATE_PADRAO } from '../site/rts/js/sim/armas.js';
import { extrasMissao, rotular, temRotulo, rotulosDaMissao, compilarMissao, INTERVALO_GATILHOS } from '../site/rts/js/sim/gatilhos.js';
import { progressoReligar, religandoQual } from '../site/rts/js/sim/religar.js';
import { comandoReparar, reparandoQual } from '../site/rts/js/sim/reparo.js';
import { faseDe, FASE } from '../site/rts/js/sim/empacotar.js';
import { BANDEIRA_COMBATE } from '../site/rts/js/sim/habilidades.js';
import { montarRetrato } from '../site/rts/js/sim/retrato.js';
import { ordenarGrupo } from '../site/rts/js/sim/ordens.js';
import { dadosExemplo, mapaExemplo } from './rts-sim-exemplo.mjs';

const pe = { classe: 'infantaria', blindagem: 'pessoal', lotacao: 1, raio: 2, giroCorpo: 16, giroTorre: 16, tempoMs: 12000, velocidade: 120, visao: 7 };
const roda = { classe: 'veiculo', blindagem: 'leve', lotacao: 2, raio: 3, giroCorpo: 8, giroTorre: 8, tempoMs: 20000, velocidade: 200, visao: 7 };
const DADOS = {
  unidades: {
    versao: 1,
    unidades: [
      { nome: 'turma', faccao: 'religadores', ...pe, custo: 100, vida: 100, arma: 'carabina' },
      { nome: 'religador', faccao: 'religadores', ...pe, custo: 300, vida: 120, religa: 1 },
      { nome: 'equipe', faccao: 'religadores', ...roda, custo: 350, vida: 250, reparo: { vidaPorSegundo: 12, alcance: 15 } },
      { nome: 'cesto', faccao: 'religadores', ...roda, classe: 'veiculoGrande', blindagem: 'pesada', custo: 600, vida: 900, arma: 'carabina' },
      { nome: 'carroca', faccao: 'desligados', ...roda, custo: 200, vida: 400 },
      { nome: 'barracao-empacotado', faccao: 'desligados', ...roda, classe: 'veiculoGrande', custo: 400, vida: 600, velocidade: 90 },
    ],
  },
  predios: {
    versao: 1,
    predios: [
      { nome: 'barracao', faccao: 'desligados', pegada: [2, 2], custo: 400, tempoMs: 25000, vida: 1000, visao: 5 },
      { nome: 'subestacao', faccao: 'neutro', pegada: [2, 2], custo: 0, tempoMs: 0, vida: 2000, visao: 5, religavel: 1, tempoReligarMs: 30000 },
      { nome: 'guincho-tombado', faccao: 'neutro', pegada: [1, 1], custo: 0, tempoMs: 0, vida: 400, visao: 2, religavel: 1, tempoReligarMs: 15000 },
    ],
  },
  economia: { versao: 1, lotacaoMaxima: 60, saturacao: 3, cargaDerramada: { porcento: 100, duracaoMs: 90000 }, vento: { intervaloMs: 120000, lote: 80, avisoMs: 15000 }, foraDaRede: { producaoPorcento: 50, defesasParam: 1 }, reciclarPorcento: 50, reparoCustoPorcento: 50, faiscaCarga: 25, cargaInicial: 1000 },
  armas: { ...REGRAS_COMBATE_PADRAO, armas: [{ nome: 'carabina', tipoDano: 'bala', dano: 10, recargaMs: 1000, alcance: 40 }] },
};
const [TURMA, RELIGADOR, EQUIPE, CESTO, CARROCA, BARRACAO_EMPACOTADO, BARRACAO, SUBESTACAO, TOMBADO] = [0, 1, 2, 3, 4, 5, 6, 7, 8];

function partida(missao, unidades) {
  return criarSimulacao({
    mapa: { largura: 64, altura: 64, bases: [{ x: 6, y: 6 }, { x: 56, y: 56 }] },
    dados: DADOS,
    missao,
    regras: REGRAS_LIVRES,
    capacidade: 64,
    unidades: unidades.map(u => ({ direcao: 0, ...u, x: Math.trunc(u.x * FP), y: Math.trunc(u.y * FP) })),
  });
}

const meio = n => n + 1 / 2;
const id = (sim, i) => idDe(i, sim.geracao[i]);
const missao = (gatilhos, extra = {}) => ({ versao: 1, id: 'onda-3', ...extra, variaveis: { a: 0, b: 0, c: 0, ...extra.variaveis }, gatilhos });
const marca = (id, nome, quando, mais = {}) => ({ id, quando, acoes: [{ faz: 'variavel', nome, valor: 1 }], ...mais });
const v = (sim, k) => extrasMissao(sim).variaveis[k];
const avancar = (sim, n) => {
  for (let k = 0; k < n; k++) passo(sim);
};
const carga = (sim, j) => sim.extras.economia.carga[j];

function eventos(sim, tipo, passos) {
  const lista = [];
  for (let k = 0; k < passos; k++) {
    passo(sim);
    for (let e = 0; e < sim.eventos.length; e += TAMANHO_EVENTO) if (sim.eventos[e + E_TIPO] === tipo) lista.push(sim.eventos.slice(e, e + TAMANHO_EVENTO));
  }
  return lista;
}

test('a round zone counts, reveals and spawns only inside its disc', () => {
  const roda = { areas: { roda: { x: 30, y: 30, raio: 3 } } };
  const conta = partida(missao([marca('dentro', 'a', { se: 'contagem', jogador: 0, area: 'roda', minimo: 1 })], roda), [{ tipo: TURMA, time: 0, x: meio(33), y: meio(33) }]);
  avancar(conta, INTERVALO_GATILHOS);
  assert.equal(v(conta, 0), 0, 'the corner of the square around the disc is outside');
  conta.x[0] = Math.trunc(meio(32) * FP);
  conta.y[0] = Math.trunc(meio(31) * FP);
  avancar(conta, INTERVALO_GATILHOS);
  assert.equal(v(conta, 0), 1, 'inside the disc');

  // with no unit of player 0 around to see for itself, only the disc is revealed
  const acoes = [{ faz: 'revelar', jogador: 0, area: 'roda' }, { faz: 'criar', jogador: 1, unidades: [{ tipo: 'turma', quantos: 12 }], area: 'roda', grupo: 'g' }];
  const sim = partida(missao([{ id: 'revela', quando: { se: 'tempo', segundos: 0 }, acoes }], roda), [{ tipo: TURMA, time: 0, x: meio(5), y: meio(60) }]);
  passo(sim);
  const explorado = sim.neblina.explorado[0];
  assert.equal(explorado[30 * 64 + 33], 1, 'the edge of the disc');
  assert.equal(explorado[33 * 64 + 33], 0, 'the corner is not revealed');
  let criados = 0;
  for (let i = 0; i < sim.capacidade; i++) {
    if (!sim.ativo[i] || sim.time[i] !== 1) continue;
    const dx = (sim.x[i] >> 10) - 30;
    const dy = (sim.y[i] >> 10) - 30;
    assert.ok(dx * dx + dy * dy <= 9, 'spawned inside the disc');
    criados++;
  }
  assert.equal(criados, 12);
});

test('atingido holds for N s after a hit, and perto counts the player’s units near the group', () => {
  const m = missao([
    marca('golpe', 'a', { se: 'atingido', grupo: 'posto', segundos: 2 }, { repete: true }),
    { id: 'zera', quando: { se: 'nao', condicao: { se: 'atingido', grupo: 'posto', segundos: 2 } }, acoes: [{ faz: 'variavel', nome: 'a', valor: 0 }], repete: true },
    marca('cerco', 'b', { se: 'perto', grupo: 'posto', jogador: 0, celulas: 6, minimo: 2 }),
  ]);
  const sim = partida(m, [
    { tipo: BARRACAO, time: 1, x: 30, y: 30 },
    { tipo: TURMA, time: 0, x: meio(34), y: meio(30) },
    { tipo: TURMA, time: 0, x: meio(50), y: meio(30) },
  ]);
  rotular(sim, 0, 'posto');
  sim.recarga[1] = 1000000;
  avancar(sim, 30);
  assert.equal(v(sim, 0), 0);
  assert.equal(v(sim, 1), 0, 'only one unit near');
  sim.recarga[1] = 0;
  avancar(sim, 12);
  assert.equal(v(sim, 0), 1, 'hit');
  sim.recarga[1] = 1000000;
  avancar(sim, 3 * 30);
  assert.equal(v(sim, 0), 0, 'over 2 s after the last hit');
  sim.x[2] = Math.trunc(meio(30) * FP);
  sim.y[2] = Math.trunc(meio(34) * FP);
  avancar(sim, INTERVALO_GATILHOS * 2);
  assert.equal(v(sim, 1), 1, 'two units within 6 cells');
});

test('religacao follows the re-powering progress by share and by seconds left', () => {
  const m = missao([
    marca('metade', 'a', { se: 'religacao', grupo: 'subestacao', jogador: 0, minimoPorcento: 50 }),
    marca('quase', 'b', { se: 'religacao', grupo: 'subestacao', faltamSegundos: 5 }),
    marca('feita', 'c', { se: 'dono', grupo: 'subestacao', jogador: 0 }),
  ]);
  const sim = partida(m, [
    { tipo: SUBESTACAO, time: DONO_NEUTRO, x: 30, y: 30 },
    { tipo: RELIGADOR, time: 0, x: meio(28), y: meio(30) },
  ]);
  rotular(sim, 0, 'subestacao');
  agendarComando(sim, criarComando({ tick: 1, jogador: 0, seq: 1, tipo: TIPO_COMANDO.HABILIDADE, unidades: [id(sim, 1)], alvo: id(sim, 0), arg: 1 }));
  const quando = {};
  for (let k = 0; k < 40 * 30 && v(sim, 2) === 0; k++) {
    passo(sim);
    for (const [n, nome] of [[0, 'metade'], [1, 'quase']]) if (v(sim, n) === 1 && quando[nome] === undefined) quando[nome] = progressoReligar(sim, 0).passos;
  }
  assert.equal(v(sim, 2), 1, 're-powered');
  assert.ok(quando.metade >= 15 * 30 && quando.metade <= 15 * 30 + INTERVALO_GATILHOS, `half at ${quando.metade} of 900 ticks`);
  assert.ok(quando.quase >= 25 * 30 && quando.quase <= 25 * 30 + INTERVALO_GATILHOS, `5 s left at ${quando.quase}`);
});

test('a structure re-powered by repair takes the repair crew, not the re-powering unit, and pays its reward', () => {
  const m = missao([
    { id: 'prepara', quando: { se: 'tempo', segundos: 0 }, acoes: [{ faz: 'religavel', grupo: 'tombado', segundos: 15, por: 'reparo' }] },
    { id: 'resgate', quando: { se: 'dono', grupo: 'tombado', jogador: 0 }, acoes: [{ faz: 'destruir', grupo: 'tombado' }, { faz: 'criar', jogador: 0, unidades: [{ tipo: 'cesto', quantos: 1 }], ponto: 'resgate', grupo: 'veterano', veterania: 2 }] },
  ], { pontos: { resgate: [30, 32] } });
  const sim = partida(m, [
    { tipo: TOMBADO, time: DONO_NEUTRO, x: 30, y: 30 },
    { tipo: RELIGADOR, time: 0, x: meio(26), y: meio(30) },
    { tipo: EQUIPE, time: 0, x: meio(26), y: meio(31) },
  ]);
  rotular(sim, 0, 'tombado');
  passo(sim);
  comandoReparar(sim, [1], id(sim, 0));
  assert.equal(religandoQual(sim, 1), 0, 'the re-powering unit cannot repair it');
  agendarComando(sim, criarComando({ tick: sim.tick + 1, jogador: 0, seq: 1, tipo: TIPO_COMANDO.REPARAR, unidades: [id(sim, 2)], alvo: id(sim, 0) }));
  passo(sim);
  assert.equal(religandoQual(sim, 2), id(sim, 0), 'REPARAR sends the crew');
  let veterano = -1;
  for (let k = 0; k < 30 * 30 && veterano < 0; k++) {
    passo(sim);
    for (let i = 0; i < sim.capacidade; i++) if (sim.ativo[i] && sim.tipo[i] === CESTO) veterano = i;
  }
  assert.ok(veterano >= 0, 'the reward came');
  assert.equal(sim.veterania[veterano], 2);
  assert.ok(temRotulo(sim, id(sim, veterano), 'veterano'));
  for (let i = 0; i < sim.capacidade; i++) assert.ok(!sim.ativo[i] || sim.tipo[i] !== TOMBADO, 'the wreck is gone');
});

test('REPARAR heals a damaged unit of the team, pays part of its cost, raises the crew and stops when whole', () => {
  const sim = partida(missao([]), [
    { tipo: CESTO, time: 0, x: meio(30), y: meio(30) },
    { tipo: EQUIPE, time: 0, x: meio(24), y: meio(30) },
    { tipo: CESTO, time: 1, x: meio(50), y: meio(50) },
  ]);
  sim.vida[0] = 300;
  const antes = carga(sim, 0);
  comandoReparar(sim, [1], id(sim, 2));
  assert.equal(reparandoQual(sim, 1), 0, 'not an enemy');
  comandoReparar(sim, [1], id(sim, 0));
  assert.equal(reparandoQual(sim, 1), id(sim, 0));
  avancar(sim, 10 * 30);
  const curado = sim.vida[0] - 300;
  assert.ok(curado > 0 && curado <= 120, `${curado} health in 10 s of walking and work`);
  // 50% of the cost in proportion: 600 x curado / 900 x 0.5
  const pago = antes - carga(sim, 0);
  assert.ok(Math.abs(pago - Math.trunc((600 * curado) / 1800)) <= 1, `${pago} paid for ${curado}`);
  assert.equal(sim.experiencia[1], curado, 'the crew earns what it repaired');
  avancar(sim, 60 * 30);
  assert.equal(sim.vida[0], 900, 'whole');
  assert.equal(reparandoQual(sim, 1), 0, 'and done');
  assert.equal(sim.veterania[1], 0, 'below the first level of 1,500 repaired');

  const pobre = partida(missao([]), [
    { tipo: CESTO, time: 0, x: meio(30), y: meio(30) },
    { tipo: EQUIPE, time: 0, x: meio(29), y: meio(30) },
  ]);
  pobre.vida[0] = 300;
  pobre.extras.economia.carga[0] = 2;
  comandoReparar(pobre, [1], id(pobre, 0));
  avancar(pobre, 10 * 30);
  assert.equal(reparandoQual(pobre, 1), 0, 'out of Carga, it stops');
  assert.ok(pobre.vida[0] < 320);

  const chamada = partida(missao([]), [
    { tipo: CESTO, time: 0, x: meio(30), y: meio(30) },
    { tipo: EQUIPE, time: 0, x: meio(24), y: meio(30) },
  ]);
  chamada.vida[0] = 300;
  comandoReparar(chamada, [1], id(chamada, 0));
  passo(chamada);
  ordenarGrupo(chamada, [1], TIPO_COMANDO.MOVER, Math.trunc(meio(10) * FP), Math.trunc(meio(10) * FP));
  passo(chamada);
  assert.equal(reparandoQual(chamada, 1), 0, 'another order calls it off');
});

test('a building packs into a unit with its label and share of health, and unpacks on a free spot', () => {
  const m = missao([
    { id: 'empacota', quando: { se: 'tempo', segundos: 0 }, acoes: [{ faz: 'empacotar', grupo: 'acampamento', em: 'carroca', segundos: 5 }] },
    { id: 'desempacota', quando: { se: 'tempo', segundos: 8 }, acoes: [{ faz: 'desempacotar', grupo: 'acampamento', area: 'longe', segundos: 3 }] },
  ], { areas: { longe: { x: 40, y: 20, largura: 10, altura: 10 } } });
  const sim = partida(m, [{ tipo: BARRACAO, time: 1, x: 20, y: 20 }]);
  rotular(sim, 0, 'acampamento');
  sim.vida[0] = 500;
  const mortes = eventos(sim, EVENTO.MORTE, 5 * 30 + 2 * INTERVALO_GATILHOS);
  assert.equal(mortes.length, 0, 'packing is not a death');
  let carroca = -1;
  for (let i = 0; i < sim.capacidade; i++) if (sim.ativo[i] && sim.tipo[i] === CARROCA) carroca = i;
  assert.ok(carroca >= 0, 'packed');
  assert.equal(faseDe(sim, carroca), FASE.EMPACOTADO);
  assert.equal(sim.vida[carroca], 200, 'half health, as the building had');
  assert.ok(temRotulo(sim, id(sim, carroca), 'acampamento'));
  assert.equal(sim.time[carroca], 1);
  // outside the area at 8 s: it stays packed; moved into it, it unpacks
  avancar(sim, 4 * 30);
  assert.equal(faseDe(sim, carroca), FASE.EMPACOTADO, 'not in the area');
  sim.x[carroca] = Math.trunc(meio(44) * FP);
  sim.y[carroca] = Math.trunc(meio(24) * FP);
  extrasMissao(sim).ativo[1] = 1;
  avancar(sim, 4 * 30);
  let barracao = -1;
  for (let i = 0; i < sim.capacidade; i++) if (sim.ativo[i] && sim.tipo[i] === BARRACAO) barracao = i;
  assert.ok(barracao >= 0, 'unpacked');
  assert.ok(temRotulo(sim, id(sim, barracao), 'acampamento'));
  assert.equal(sim.vida[barracao], 500);
  assert.ok(Math.abs((sim.x[barracao] >> 10) - 44) <= 2 && Math.abs((sim.y[barracao] >> 10) - 24) <= 2, 'near where the wagon stood');
});

test('the camp packs and runs when threatened, and taking it down pays the reward', () => {
  const m = missao(
    [
      { id: 'objetivo', quando: { se: 'tempo', segundos: 0 }, acoes: [{ faz: 'objetivo', objetivo: 'desmontar', estado: 'ativo' }] },
      { id: 'ameacado', quando: { se: 'alguma', condicoes: [{ se: 'atingido', grupo: 'acampamento', segundos: 1 }, { se: 'perto', grupo: 'acampamento', jogador: 0, celulas: 6 }] }, acoes: [{ faz: 'empacotar', grupo: 'acampamento', em: 'carroca', segundos: 5 }, { faz: 'mensagem', texto: 'radio.locutor.acampamento_foge' }] },
      { id: 'foge', quando: { se: 'contagem', grupo: 'acampamento', tipos: ['carroca'], minimo: 2 }, acoes: [{ faz: 'ordenar', grupo: 'acampamento', ordem: 'mover', rota: 'fuga' }] },
      { id: 'chegou', quando: { se: 'contagem', grupo: 'acampamento', area: 'refugio', minimo: 2 }, acoes: [{ faz: 'desempacotar', grupo: 'acampamento', area: 'refugio', segundos: 5 }] },
      { id: 'desmontado', quando: { se: 'todas', condicoes: [{ se: 'disparou', gatilho: 'objetivo' }, { se: 'vivos', grupo: 'acampamento', maximo: 0 }] }, acoes: [{ faz: 'objetivo', objetivo: 'desmontar', estado: 'cumprido' }, { faz: 'recursos', jogador: 0, somar: 1000 }] },
    ],
    { objetivos: [{ id: 'desmontar', texto: 'missao.obj.desmontar', tipo: 'opcional' }], areas: { refugio: { x: 52, y: 50, largura: 8, altura: 8 } }, rotas: { fuga: [[40, 30], [55, 54]] } },
  );
  const montar = (emboscada = []) => {
    const sim = partida(m, [
      { tipo: BARRACAO, time: 1, x: 20, y: 20 },
      { tipo: BARRACAO, time: 1, x: 24, y: 20 },
      { tipo: TURMA, time: 0, x: meio(10), y: meio(21) },
      ...emboscada.map(([x, y]) => ({ tipo: TURMA, time: 0, x: meio(x), y: meio(y) })),
    ]);
    rotular(sim, 0, 'acampamento');
    rotular(sim, 1, 'acampamento');
    return sim;
  };
  const doTipo = (sim, tipo) => {
    const lista = [];
    for (let i = 0; i < sim.capacidade; i++) if (sim.ativo[i] && sim.tipo[i] === tipo) lista.push(i);
    return lista;
  };
  const chegar = sim => ordenarGrupo(sim, [2], TIPO_COMANDO.MOVER, Math.trunc(meio(16) * FP), Math.trunc(meio(21) * FP));

  // left alone, the camp stays
  const quieto = montar();
  avancar(quieto, 20 * 30);
  assert.equal(extrasMissao(quieto).disparos[1], 0);
  assert.equal(doTipo(quieto, BARRACAO).length, 2);

  // threatened, it packs, runs along its route and sets up again far away, and the objective stays open
  const fuga = montar();
  chegar(fuga);
  avancar(fuga, 2 * 60 * 30);
  const barracoes = doTipo(fuga, BARRACAO);
  assert.equal(barracoes.length, 2, 'set up again');
  for (const i of barracoes) assert.ok(fuga.x[i] >> 10 >= 48 && fuga.y[i] >> 10 >= 46, 'at the refuge');
  assert.equal(extrasMissao(fuga).objetivos[0], 1, 'the objective is still open');

  // a squad in ambush where the route bends catches the wagons on their way, and the reward comes
  const caca = montar([[39, 32], [41, 32], [39, 28], [41, 28]]);
  chegar(caca);
  for (let k = 0; k < 15 * 30 && doTipo(caca, CARROCA).length < 2; k++) passo(caca);
  const carrocas = doTipo(caca, CARROCA);
  assert.equal(carrocas.length, 2, 'packed and on the run');
  for (const i of carrocas) caca.vida[i] = 30;
  const antes = carga(caca, 0);
  avancar(caca, 40 * 30);
  assert.equal(doTipo(caca, CARROCA).length, 0, 'caught');
  assert.equal(doTipo(caca, BARRACAO).length, 0, 'and never set up again');
  assert.equal(extrasMissao(caca).objetivos[0], 2, 'desmontar is done');
  assert.equal(carga(caca, 0) - antes, 1000, 'and the reward is paid');
});

test('the snapshot shows re-powering progress and packing, and the lights come on from the mission\u2019s point', () => {
  const m = missao(
    [
      { id: 'empacota', quando: { se: 'tempo', segundos: 0 }, acoes: [{ faz: 'empacotar', grupo: 'acampamento', em: 'carroca', segundos: 2 }, { faz: 'luz', cena: 'entardecer', ponto: 'morro' }] },
      { id: 'noite', quando: { se: 'tempo', segundos: 1 }, acoes: [{ faz: 'luz', cena: 'noite' }] },
    ],
    { pontos: { morro: [30, 31] } },
  );
  const sim = partida(m, [
    { tipo: SUBESTACAO, time: DONO_NEUTRO, x: 30, y: 30 },
    { tipo: RELIGADOR, time: 0, x: meio(28), y: meio(30) },
    { tipo: BARRACAO, time: 1, x: 50, y: 50 },
  ]);
  rotular(sim, 2, 'acampamento');
  const linha = (r, i) => Array.from(r.id).indexOf(id(sim, i));
  const luzes = eventos(sim, EVENTO.LUZ, 1);
  assert.equal(luzes.length, 1);
  assert.deepEqual([luzes[0][E_X], luzes[0][E_Y], luzes[0][E_ARG]], [Math.trunc(meio(30) * FP), Math.trunc(meio(31) * FP), 0], 'from the point, in world units');
  let r = montarRetrato(sim);
  assert.equal(r.progresso[linha(r, 0)], 255, 'nobody started');
  assert.ok(r.bandeiras[linha(r, 2)] & BANDEIRA_COMBATE.EMPACOTANDO, 'packing');
  assert.equal(r.bandeiras[linha(r, 2)] & BANDEIRA_COMBATE.EMPACOTADO, 0);

  agendarComando(sim, criarComando({ tick: sim.tick + 1, jogador: 0, seq: 1, tipo: TIPO_COMANDO.HABILIDADE, unidades: [id(sim, 1)], alvo: id(sim, 0), arg: 1 }));
  const noite = eventos(sim, EVENTO.LUZ, 2 * 30);
  assert.deepEqual([noite[0][E_X], noite[0][E_Y], noite[0][E_ARG]], [0, 0, 1], 'with no point, from the camera');
  avancar(sim, 13 * 30);
  r = montarRetrato(sim);
  const feito = progressoReligar(sim, 0);
  assert.ok(feito.passos > 0);
  assert.equal(r.progresso[linha(r, 0)], Math.trunc((feito.passos * 255) / feito.total), 'how far the re-powering got');
  let carroca = -1;
  for (let i = 0; i < sim.capacidade; i++) if (sim.ativo[i] && sim.tipo[i] === CARROCA) carroca = i;
  const b = r.bandeiras[linha(r, carroca)];
  assert.ok(b & BANDEIRA_COMBATE.EMPACOTADO, 'a packed building');
  assert.equal(b & BANDEIRA_COMBATE.EMPACOTANDO, 0);
});

test('a mission drains a resource node, pile by pile, and can fill it back up to its start', () => {
  const missaoDoNo = {
    versao: 1,
    id: 'apagar',
    gatilhos: [
      { id: 'apaga', quando: { se: 'tempo', segundos: 1 }, acoes: [{ faz: 'recursos', no: 'no-norte', somar: -2000 }], repete: true, intervaloSegundos: 1 },
      { id: 'apagou', quando: { se: 'recursos', no: 'no-norte', maximo: 0 }, acoes: [{ faz: 'gatilho', gatilho: 'apaga', ativo: false }, { faz: 'recursos', no: 'no-sul', somar: 999999 }] },
    ],
  };
  const sim = criarSimulacao({ dados: dadosExemplo(), arquivosMapa: mapaExemplo(), missao: missaoDoNo });
  const pilhas = no => {
    const lista = [];
    for (let i = 0; i < sim.capacidade; i++) if (sim.ativo[i] && sim.tipos[sim.tipo[i]].categoria === CATEGORIA.RECURSO && sim.no[i] === no) lista.push(i);
    return lista;
  };
  const total = no => pilhas(no).reduce((t, i) => t + sim.carga[i], 0);
  const norte = total(1);
  const sul = pilhas(0);
  assert.ok(norte > 4000);
  avancar(sim, 30 + INTERVALO_GATILHOS);
  assert.equal(total(1), norte - 2000, 'one drain');
  const [primeira] = pilhas(1);
  assert.equal(sim.carga[primeira], Math.max(0, 1500 - 2000), 'the first pile first');
  sim.carga[sul[0]] -= 700;
  avancar(sim, 10 * 30);
  assert.equal(total(1), 0, 'gone dark');
  assert.equal(extrasMissao(sim).ativo[0], 0, 'and the drain stopped');
  assert.ok(sul.every(i => sim.carga[i] === sim.cargaMaxima[i]), 'the other node filled back to its start, no more');
});

test('without em, a building packs into the kind named after it, and the teams block is accepted and labelled last', () => {
  const m = missao([{ id: 'empacota', quando: { se: 'tempo', segundos: 0 }, acoes: [{ faz: 'empacotar', grupo: 'acampamento', segundos: 1 }] }], {
    // a valid teams block (comportamentos/formato.js): the step compiles it
    pontos: { ponte: [30, 30] },
    equipes: [{ id: 'guarda', grupo: 'guarda-ponte', jogador: 1, faz: 'guardar', ponto: 'ponte' }, { id: 'campo', grupo: 'acampamento', reserva: 'reserva-norte', jogador: 1, faz: 'reconstruir' }],
    licoes: { versao: 1, licoes: [] },
  });
  assert.deepEqual(rotulosDaMissao(m), ['acampamento', 'guarda-ponte', 'reserva-norte']);
  const sim = partida(m, [{ tipo: BARRACAO, time: 1, x: 20, y: 20 }]);
  rotular(sim, 0, 'acampamento');
  avancar(sim, 30 + 2 * INTERVALO_GATILHOS);
  let empacotado = -1;
  for (let i = 0; i < sim.capacidade; i++) if (sim.ativo[i] && sim.tipo[i] === BARRACAO_EMPACOTADO) empacotado = i;
  assert.ok(empacotado >= 0, 'its own packed kind');
  assert.ok(temRotulo(sim, id(sim, empacotado), 'acampamento'));
  assert.throws(() => compilarMissao({ ...m, outra: 1 }, { tipos: sim.tipos, times: 2, largura: 64, altura: 64 }), /outra: campo desconhecido/);
});
