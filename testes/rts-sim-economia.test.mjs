// Economy, construction and production rules on the example sandbox (testes/rts-sim-exemplo.mjs): harvesting with
// saturation, spilled charge, wind gusts, the power network of posts, placement, production queues with the
// population cap, building sites raised by a unit, ghosts of buildings, and save and load in the middle of it all.
import test from 'node:test';
import assert from 'node:assert/strict';
import { criarSimulacao, passo, agendarComando, somaDeVerificacao } from '../site/rts/js/sim/simulacao.js';
import {
  TIPO_COMANDO, EVENTO, MOTIVO, FAIXA, FAIXA_ESTADO, BANDEIRA, CATEGORIA, FP, TAMANHO_EVENTO, E_TIPO, E_ARG, E_ALVO_X,
  E_ENTIDADE, FL_FAIXAS, FX_ESTADO, FX_N, FX_ITENS, TAMANHO_FAIXA, TAMANHO_REGISTRO_FILA, criarComando, idDe,
} from '../site/rts/js/sim/contratos.js';
import { TAREFA } from '../site/rts/js/sim/estado.js';
import { matar, criarEntidade } from '../site/rts/js/sim/entidades.js';
import { colocarPredio, motivoPosicao, motivoPosicaoNaSimulacao } from '../site/rts/js/sim/construcao.js';
import { cargaDe } from '../site/rts/js/sim/economia.js';
import { lotacaoUsada } from '../site/rts/js/sim/producao.js';
import { montarRetrato, montarMapaEstatico } from '../site/rts/js/sim/retrato.js';
import { vistaDoTime } from '../site/rts/js/sim/vista.js';
import { salvar, carregar } from '../site/rts/js/sim/persistencia.js';
import { dadosExemplo, mapaExemplo } from './rts-sim-exemplo.mjs';

const novaCaixa = (opcoes = {}) => criarSimulacao({ dados: dadosExemplo(), arquivosMapa: mapaExemplo(), ...opcoes });
const tipoDe = (sim, nome) => sim.tipos.findIndex(t => t.nome === nome);
const id = (sim, i) => idDe(i, sim.geracao[i]);
const slotsDo = (sim, nome, time) => {
  const t = tipoDe(sim, nome);
  const lista = [];
  for (let i = 0; i < sim.capacidade; i++) if (sim.ativo[i] && sim.tipo[i] === t && (time === undefined || sim.time[i] === time)) lista.push(i);
  return lista;
};
let seq = 0;
const ordenar = (sim, campos) => agendarComando(sim, criarComando({ tick: sim.tick + 1, jogador: 0, seq: seq++, ...campos }));
// runs ticks, collecting the events of every one
function rodar(sim, passos) {
  const eventos = [];
  for (let k = 0; k < passos; k++) {
    passo(sim);
    for (let e = 0; e < sim.eventos.length; e += TAMANHO_EVENTO) eventos.push(sim.eventos.slice(e, e + TAMANHO_EVENTO));
  }
  return eventos;
}
const doTipo = (eventos, tipo) => eventos.filter(e => e[E_TIPO] === tipo);
const celula = n => n * FP + (FP >> 1);
// a unit of `nome` for team `time` at the centre of cell (cx, cy), the way production places one
const colocarUnidade = (sim, nome, time, cx, cy) => criarEntidade(sim, tipoDe(sim, nome), time, celula(cx), celula(cy), 64);
const guincho = (sim, x = 14, y = 28) => colocarUnidade(sim, 'guincho-de-celulas', 0, x, y);

test.beforeEach(() => {
  seq = 0;
});

test('the sandbox starts with the map entities in the first slots, Carga from the economy data and powered headquarters', () => {
  const sim = (novaCaixa());
  const mapa = mapaExemplo();
  assert.equal(sim.entidadesDoMapa.length, mapa.entidades.entidades.length);
  assert.equal(sim.tipos[sim.tipo[sim.etiquetas['qg-sul']]].nome, 'escritorio-regional');
  assert.equal(cargaDe(sim, 0), 1500);
  passo(sim);
  const qg = sim.etiquetas['qg-sul'];
  assert.equal(sim.energizado[qg], 1, 'the headquarters roots its own network');
  assert.equal(sim.grade.bloqueado[31 * 48 + 6], 1, 'its footprint blocks the grid');
  assert.equal(sim.mapa.bloqueado[31 * 48 + 6], 0, 'the terrain stays apart');
  const pilhas = slotsDo(sim, 'pilha');
  assert.equal(pilhas.length, 6);
  assert.ok(pilhas.every(i => sim.time[i] === 255 && sim.carga[i] === 1500));
  const estatico = montarMapaEstatico(sim, 0);
  assert.equal(estatico.tipos[sim.tipo[qg]].nome, 'escritorio-regional');
  assert.equal(estatico.nos.length, 2);
  assert.equal(estatico.ventosa[19 * 48 + 23], 1);
  assert.equal(estatico.economia.saturacao, 3);
});

test('a harvester loads at a pile, carries to the depot and delivers 100 Carga a trip', () => {
  const sim = (novaCaixa());
  const g = slotsDo(sim, 'guincho-de-celulas', 0)[0];
  const pilha = slotsDo(sim, 'pilha').find(i => sim.no[i] === 0);
  passo(sim);
  assert.ok(montarRetrato(sim).bandeiras[0] >= 0);
  ordenar(sim, { tipo: TIPO_COMANDO.COLETAR, unidades: [id(sim, g)], alvo: id(sim, pilha) });
  const eventos = rodar(sim, 1500);
  const descargas = doTipo(eventos, EVENTO.DESCARGA);
  assert.ok(descargas.length >= 2, `${descargas.length} deliveries in 50 s`);
  assert.ok(descargas.every(e => e[E_ARG] === 100));
  assert.equal(cargaDe(sim, 0), 1500 + 100 * descargas.length);
  assert.ok(sim.viagens[g] >= 2);
  let restante = 0;
  for (const p of slotsDo(sim, 'pilha')) if (sim.no[p] === 0) restante += sim.carga[p];
  assert.equal(restante, 4500 - 100 * descargas.length - (sim.carga[g] > 0 ? sim.carga[g] : 0), 'what left the node is in the depot or in the harvester');
});

test('a node takes three harvesters at a time; the others wait their turn in arrival order', () => {
  const sim = (novaCaixa());
  const guinchos = [slotsDo(sim, 'guincho-de-celulas', 0)[0]];
  for (const [x, y] of [[14, 28], [15, 28], [14, 29], [15, 29]]) guinchos.push(guincho(sim, x, y));
  const pilha = slotsDo(sim, 'pilha').find(i => sim.no[i] === 0);
  ordenar(sim, { tipo: TIPO_COMANDO.COLETAR, unidades: guinchos.map(i => id(sim, i)), alvo: id(sim, pilha) });
  let maximo = 0;
  let esperaram = 0;
  for (let k = 0; k < 900; k++) {
    passo(sim);
    const carregando = guinchos.filter(i => sim.tarefa[i] === TAREFA.CARREGAR).length;
    maximo = Math.max(maximo, carregando);
    if (carregando === 3 && guinchos.some(i => sim.tarefa[i] === TAREFA.ESPERAR)) esperaram++;
    const r = montarRetrato(sim);
    const k2 = Array.from(r.id).indexOf(id(sim, pilha));
    assert.equal(r.ocupacao[k2], carregando, 'the pile shows how many load at its node');
  }
  assert.equal(maximo, 3, 'saturation: three at a time');
  assert.ok(esperaram > 0, 'the fourth and fifth waited');
  assert.ok(guinchos.every(i => sim.viagens[i] >= 1 || sim.tarefa[i] !== TAREFA.ESPERAR), 'everyone got a turn');
});

test('a dead harvester spills its load as sparks that another harvester picks up, and that fade after 90 s', () => {
  const sim = (novaCaixa());
  const morto = guincho(sim, 20, 30);
  const outro = guincho(sim, 22, 32);
  sim.carga[morto] = 100;
  passo(sim);
  matar(sim, morto, -1);
  const eventos = rodar(sim, 1);
  const derrame = doTipo(eventos, EVENTO.CARGA_DERRAMADA);
  assert.equal(derrame.length, 1);
  assert.equal(derrame[0][E_ARG], 100);
  const faiscas = slotsDo(sim, 'faisca');
  assert.equal(faiscas.length, 4, '100 Carga in sparks of 25');
  assert.equal(faiscas.reduce((s, i) => s + sim.carga[i], 0), 100);
  ordenar(sim, { tipo: TIPO_COMANDO.COLETAR, unidades: [id(sim, outro)], alvo: id(sim, faiscas[0]) });
  rodar(sim, 600);
  assert.equal(slotsDo(sim, 'faisca').length, 0, 'it picked up all four');
  assert.ok(sim.carga[outro] === 100 || cargaDe(sim, 0) === 1600, 'and carries or delivered them');
  // sparks nobody picks fade
  const sozinha = (novaCaixa());
  const g = guincho(sozinha, 20, 30);
  sozinha.carga[g] = 50;
  passo(sozinha);
  matar(sozinha, g, -1);
  passo(sozinha);
  assert.equal(slotsDo(sozinha, 'faisca').length, 2);
  rodar(sozinha, 2690);
  assert.equal(slotsDo(sozinha, 'faisca').length, 2);
  rodar(sozinha, 20);
  assert.equal(slotsDo(sozinha, 'faisca').length, 0, 'gone after 90 s');
});

test('a wind gust is announced 15 s ahead and pays every windmill standing on a windy cell at that moment', () => {
  const sim = (novaCaixa());
  const vento = colocarPredio(sim, tipoDe(sim, 'cata-vento'), 0, 22, 19);
  assert.ok(vento >= 0);
  const outro = colocarPredio(sim, tipoDe(sim, 'cata-vento'), 1, 30, 30);
  const eventos = rodar(sim, 3600);
  const anuncio = doTipo(eventos, EVENTO.RAJADA_ANUNCIADA);
  assert.equal(anuncio.length, 1);
  assert.equal(anuncio[0][E_ALVO_X], 3600, 'the gust tick');
  assert.equal(anuncio[0][E_ARG], 450, '15 s ahead');
  const rajadas = doTipo(eventos, EVENTO.RAJADA);
  assert.deepEqual(rajadas.map(e => e[E_ENTIDADE]).sort(), [id(sim, vento), id(sim, outro)].sort());
  assert.equal(cargaDe(sim, 0), 1500 + 80);
  assert.equal(montarRetrato(sim).proximaRajada, 7200);
  // a windmill that falls before the gust gets nothing
  matar(sim, vento, -1);
  rodar(sim, 3600);
  assert.equal(cargaDe(sim, 0), 1580);
});

test('posts carry the network; a building past a fallen post loses power and works at half speed', () => {
  const sim = novaCaixa({ cargaInicial: 10000 });
  passo(sim);
  const poste = tipoDe(sim, 'poste');
  // the headquarters reaches 8 cells from its centre (7.5, 32.5); posts 6 apart chain eastwards
  const p1 = colocarPredio(sim, poste, 0, 13, 32);
  const p2 = colocarPredio(sim, poste, 0, 19, 32);
  const acumulador = colocarPredio(sim, tipoDe(sim, 'acumulador'), 0, 22, 32);
  passo(sim);
  assert.deepEqual([sim.energizado[p1], sim.energizado[p2], sim.energizado[acumulador]], [1, 1, 1]);
  assert.equal(sim.ligacao[p2], p1, 'the cable runs post to post');
  const r = montarRetrato(sim);
  const k = Array.from(r.id).indexOf(id(sim, p2));
  assert.ok(r.bandeiras[k] & BANDEIRA.ENERGIZADO);
  assert.equal(r.ligacao[k], id(sim, p1));
  matar(sim, p1, -1);
  const eventos = rodar(sim, 1);
  assert.equal(sim.energizado[p2], 0, 'cut past the fallen post');
  assert.equal(sim.energizado[acumulador], 0);
  assert.deepEqual(doTipo(eventos, EVENTO.REDE_CORTADA).map(e => e[E_ENTIDADE]), [id(sim, acumulador)], 'only electric buildings raise the alarm');
  // the building area follows the network: the spot east of the cut is out now
  assert.equal(motivoPosicaoNaSimulacao(sim, 0, poste, 25, 32), MOTIVO.FORA_DA_AREA);
  assert.equal(motivoPosicaoNaSimulacao(sim, 0, poste, 12, 30), 0);
});

test('the placement rule refuses bad ground, other footprints, units, distance and lack of wind, alike on the snapshot', () => {
  const sim = (novaCaixa());
  passo(sim);
  const poste = tipoDe(sim, 'poste');
  const vento = tipoDe(sim, 'cata-vento');
  const g = slotsDo(sim, 'guincho-de-celulas', 0)[0];
  const gx = sim.x[g] >> 10;
  const gy = sim.y[g] >> 10;
  const casos = [
    [poste, 12, 30, 0],
    [poste, 7, 32, MOTIVO.TERRENO_OCUPADO], // on the headquarters
    [poste, gx, gy, MOTIVO.TERRENO_OCUPADO], // on the harvester
    [poste, 0, 30, MOTIVO.FORA_DO_MAPA],
    [poste, 30, 10, MOTIVO.FORA_DA_AREA],
    [vento, 12, 30, MOTIVO.CELULA_NAO_VENTOSA],
    [tipoDe(sim, 'turma-de-linha'), 12, 30, MOTIVO.NAO_PRODUZ],
  ];
  const estatico = montarMapaEstatico(sim, 0);
  const retrato = montarRetrato(sim);
  for (const [tipo, cx, cy, esperado] of casos) {
    assert.equal(motivoPosicaoNaSimulacao(sim, 0, tipo, cx, cy), esperado, `${sim.tipos[tipo].nome} at ${cx},${cy}`);
    assert.equal(motivoPosicao(estatico, retrato, 0, tipo, cx, cy), esperado, `the page agrees for ${cx},${cy}`);
  }
  // uneven ground: the hill's edge from level 0 to level 1
  const amplo = (novaCaixa());
  for (let x = 9; x <= 21; x += 6) colocarPredio(amplo, poste, 0, x, 25);
  passo(amplo);
  assert.equal(motivoPosicaoNaSimulacao(amplo, 0, tipoDe(amplo, 'acumulador'), 18, 15), MOTIVO.TERRENO_IMPROPRIO);
});

test('production: paid when queued, five at most, refunded when cancelled, the unit leaves for the rally point', () => {
  const sim = (novaCaixa());
  const qg = sim.etiquetas['qg-sul'];
  const turma = tipoDe(sim, 'guincho-de-celulas');
  passo(sim);
  ordenar(sim, { tipo: TIPO_COMANDO.PONTO_DE_ENCONTRO, unidades: [id(sim, qg)], x: celula(14), y: celula(34) });
  for (let k = 0; k < 6; k++) ordenar(sim, { tipo: TIPO_COMANDO.PRODUZIR, unidades: [id(sim, qg)], arg: turma });
  let eventos = rodar(sim, 1);
  assert.equal(cargaDe(sim, 0), 1500 - 5 * 300 + 300 * 0, 'five paid');
  const recusas = doTipo(eventos, EVENTO.COMANDO_RECUSADO);
  assert.equal(recusas.length, 1);
  assert.equal(recusas[0][E_ARG], MOTIVO.FILA_CHEIA);
  const filas = montarRetrato(sim).filas;
  assert.equal(filas.length, TAMANHO_REGISTRO_FILA);
  assert.equal(filas[FL_FAIXAS + FX_N], 5);
  assert.equal(filas[FL_FAIXAS + FX_ESTADO], FAIXA_ESTADO.PRODUZINDO);
  assert.equal(filas[FL_FAIXAS + FX_ITENS], turma);
  ordenar(sim, { tipo: TIPO_COMANDO.CANCELAR, unidades: [id(sim, qg)], x: FAIXA.UNIDADES, arg: 4 });
  ordenar(sim, { tipo: TIPO_COMANDO.CANCELAR, unidades: [id(sim, qg)], x: FAIXA.UNIDADES, arg: 3 });
  rodar(sim, 1);
  assert.equal(cargaDe(sim, 0), 600, 'two refunded in full');
  eventos = rodar(sim, 600);
  const prontas = doTipo(eventos, EVENTO.PRODUCAO_CONCLUIDA);
  assert.equal(prontas.length, 1, 'one harvester in 20 s');
  assert.equal(prontas[0][3], id(sim, qg), 'the producer in alvo');
  const nova = prontas[0][E_ENTIDADE] & 0xffff;
  assert.notEqual(sim.tarefa[nova], TAREFA.NENHUMA, 'a new harvester goes harvesting');
  assert.equal(lotacaoUsada(sim)[0], 2 + 2 + 2, 'the starting harvester, the new one and the head in production');
});

test('the population cap holds a unit head until there is room again', () => {
  const sim = novaCaixa({ cargaInicial: 100000 });
  const qg = sim.etiquetas['qg-sul'];
  const turma = tipoDe(sim, 'turma-de-linha');
  // an infantry barracks in the network
  const alojamento = colocarPredio(sim, tipoDe(sim, 'alojamento-da-turma'), 0, 10, 34);
  colocarPredio(sim, tipoDe(sim, 'acumulador'), 0, 3, 28);
  passo(sim);
  assert.equal(sim.energizado[alojamento], 1);
  // fill the cap: 58 points of infantry plus the starting harvester's 2
  for (let k = 0; k < 58; k++) colocarUnidade(sim, 'turma-de-linha', 0, 20 + (k % 10), 36 - Math.trunc(k / 10));
  assert.equal(lotacaoUsada(sim)[0], 60);
  ordenar(sim, { tipo: TIPO_COMANDO.PRODUZIR, unidades: [id(sim, alojamento)], arg: turma });
  let eventos = rodar(sim, 400);
  assert.equal(doTipo(eventos, EVENTO.PRODUCAO_CONCLUIDA).length, 0);
  const recusas = doTipo(eventos, EVENTO.COMANDO_RECUSADO).filter(e => e[E_ARG] === MOTIVO.LOTACAO_CHEIA);
  assert.equal(recusas.length, 1, 'said once');
  const r = montarRetrato(sim);
  assert.deepEqual([r.lotacao[0], r.lotacao[1]], [60, 60]);
  const registro = Array.from({ length: r.filas.length / TAMANHO_REGISTRO_FILA }, (_, k) => r.filas.subarray(k * TAMANHO_REGISTRO_FILA, (k + 1) * TAMANHO_REGISTRO_FILA)).find(f => f[0] === id(sim, alojamento));
  assert.equal(registro[FL_FAIXAS + FX_ESTADO], FAIXA_ESTADO.ESPERA_LOTACAO);
  matar(sim, slotsDo(sim, 'turma-de-linha', 0)[0], -1);
  eventos = rodar(sim, 400);
  assert.equal(doTipo(eventos, EVENTO.PRODUCAO_CONCLUIDA).length, 1, 'room again: out it comes');
  assert.equal(lotacaoUsada(sim)[0], 60);
  assert.ok(qg >= 0);
});

test('the headquarters builds a post, it waits to be placed, CONSTRUIR places it and Shift queues the next', () => {
  const sim = (novaCaixa());
  const qg = sim.etiquetas['qg-sul'];
  const poste = tipoDe(sim, 'poste');
  passo(sim);
  ordenar(sim, { tipo: TIPO_COMANDO.PRODUZIR, unidades: [id(sim, qg)], arg: poste });
  let eventos = rodar(sim, 160);
  assert.equal(doTipo(eventos, EVENTO.PREDIO_PRONTO).length, 1, 'ready after 5 s');
  const filas = montarRetrato(sim).filas;
  assert.equal(filas[FL_FAIXAS + TAMANHO_FAIXA + FX_ESTADO], FAIXA_ESTADO.PRONTO);
  ordenar(sim, { tipo: TIPO_COMANDO.CONSTRUIR, unidades: [id(sim, qg)], arg: poste, x: 30 * FP, y: 10 * FP });
  eventos = rodar(sim, 1);
  assert.equal(doTipo(eventos, EVENTO.COMANDO_RECUSADO)[0][E_ARG], MOTIVO.FORA_DA_AREA);
  ordenar(sim, { tipo: TIPO_COMANDO.CONSTRUIR, unidades: [id(sim, qg)], arg: poste, x: 12 * FP + 512, y: 30 * FP + 512, fila: 1 });
  eventos = rodar(sim, 1);
  const concluidas = doTipo(eventos, EVENTO.CONSTRUCAO_CONCLUIDA);
  assert.equal(concluidas.length, 1);
  assert.equal(slotsDo(sim, 'poste', 0).length, 1);
  assert.equal(cargaDe(sim, 0), 1500 - 50 - 50, 'Shift paid for the next one');
  assert.equal(montarRetrato(sim).filas[FL_FAIXAS + TAMANHO_FAIXA + FX_N], 1);
});

test('a builder raises a forward post on site, which roots its own network and takes deliveries', () => {
  const sim = novaCaixa({ cargaInicial: 5000 });
  const equipe = colocarUnidade(sim, 'equipe-de-manutencao', 0, 12, 33);
  const tipo = tipoDe(sim, 'poste-avancado');
  passo(sim);
  ordenar(sim, { tipo: TIPO_COMANDO.CONSTRUIR, unidades: [id(sim, equipe)], arg: tipo, x: 12 * FP, y: 28 * FP });
  let eventos = rodar(sim, 1);
  const obra = slotsDo(sim, 'poste-avancado', 0)[0];
  assert.ok(obra >= 0 && sim.obra[obra] > 0, 'a site at once');
  assert.equal(cargaDe(sim, 0), 4000);
  const r = montarRetrato(sim);
  const k = Array.from(r.id).indexOf(id(sim, obra));
  assert.ok(r.bandeiras[k] & BANDEIRA.EM_OBRA);
  assert.ok(r.progresso[k] < 255);
  eventos = rodar(sim, 1400);
  assert.equal(sim.obra[obra], 0);
  assert.equal(doTipo(eventos, EVENTO.CONSTRUCAO_CONCLUIDA).length, 1);
  assert.equal(sim.energizado[obra], 1, 'roots its own network');
  assert.equal(sim.tarefa[equipe], TAREFA.NENHUMA);
});

test('ghosts: an enemy building seen once stays in the team view under the fog until the team sees it gone', () => {
  const sim = (novaCaixa());
  const barracao = sim.etiquetas['barracao-norte'];
  const batedor = colocarUnidade(sim, 'turma-de-linha', 0, 36, 10);
  rodar(sim, 2);
  let vista = vistaDoTime(sim, 0);
  assert.ok(Array.from(vista.inimigas.id).includes(id(sim, barracao)), 'seen now');
  assert.equal(vista.fantasmas.n, 0, 'no ghost while in sight');
  // walk away
  ordenar(sim, { tipo: TIPO_COMANDO.MOVER, unidades: [id(sim, batedor)], x: celula(12), y: celula(34) });
  rodar(sim, 900);
  vista = vistaDoTime(sim, 0);
  assert.ok(!Array.from(vista.inimigas.id).includes(id(sim, barracao)));
  assert.ok(Array.from(vista.fantasmas.id).includes(id(sim, barracao)), 'remembered under the fog');
  matar(sim, barracao, -1);
  rodar(sim, 1);
  assert.ok(Array.from(vistaDoTime(sim, 0).fantasmas.id).includes(id(sim, barracao)), 'still there: nobody saw it fall');
  assert.ok(Array.from(montarRetrato(sim).fantasmas.id).includes(id(sim, barracao)), 'and in the snapshot of the local team');
  ordenar(sim, { tipo: TIPO_COMANDO.MOVER, unidades: [id(sim, batedor)], x: celula(36), y: celula(10) });
  rodar(sim, 900);
  assert.ok(!Array.from(vistaDoTime(sim, 0).fantasmas.id).includes(id(sim, barracao)), 'forgotten once seen gone');
});

test('saving and loading in the middle of harvesting, building and production continues with the same checksums', () => {
  const sim = novaCaixa({ cargaInicial: 5000 });
  const qg = sim.etiquetas['qg-sul'];
  const g = slotsDo(sim, 'guincho-de-celulas', 0)[0];
  const pilha = slotsDo(sim, 'pilha').find(i => sim.no[i] === 0);
  const equipe = colocarUnidade(sim, 'equipe-de-manutencao', 0, 12, 33);
  passo(sim);
  ordenar(sim, { tipo: TIPO_COMANDO.COLETAR, unidades: [id(sim, g)], alvo: id(sim, pilha) });
  ordenar(sim, { tipo: TIPO_COMANDO.PRODUZIR, unidades: [id(sim, qg)], arg: tipoDe(sim, 'guincho-de-celulas') });
  ordenar(sim, { tipo: TIPO_COMANDO.PRODUZIR, unidades: [id(sim, qg)], arg: tipoDe(sim, 'poste') });
  ordenar(sim, { tipo: TIPO_COMANDO.CONSTRUIR, unidades: [id(sim, equipe)], arg: tipoDe(sim, 'poste-avancado'), x: 12 * FP, y: 28 * FP });
  const derruba = colocarUnidade(sim, 'guincho-de-celulas', 0, 20, 30);
  sim.carga[derruba] = 75;
  rodar(sim, 300);
  matar(sim, derruba, -1);
  rodar(sim, 3);
  const copia = carregar(salvar(sim));
  assert.equal(somaDeVerificacao(copia), somaDeVerificacao(sim));
  for (let k = 0; k < 900; k++) {
    passo(sim);
    passo(copia);
    if (k % 150 === 0) assert.equal(somaDeVerificacao(copia), somaDeVerificacao(sim), `tick ${sim.tick}`);
  }
  assert.equal(somaDeVerificacao(copia), somaDeVerificacao(sim));
  assert.ok(CATEGORIA.FAISCA > 0);
});

// ---------- the design front's sandbox ----------

import { existsSync, readFileSync } from 'node:fs';
import { cabecaDaFaixa } from '../site/rts/js/sim/producao.js';

const pastaDados = new URL('../site/rts/dados/', import.meta.url);
function caixaDoRepositorio() {
  const ler = caminho => readFileSync(new URL(caminho, pastaDados));
  const json = caminho => JSON.parse(ler(caminho).toString('utf8'));
  const dados = Object.fromEntries(['unidades', 'predios', 'economia', 'pesquisas', 'armas'].map(nome => [nome, json(`${nome}.json`)]));
  const missao = json('missoes/caixa-de-areia.json');
  const pasta = `mapas/${missao.mapa}/`;
  const cabecalho = json(`${pasta}mapa.json`);
  const arquivosMapa = { cabecalho, camadas: new Uint8Array(ler(pasta + cabecalho.camadas.arquivo)), entidades: json(`${pasta}entidades.json`) };
  // the mission's start trigger gives the starting Carga; without the trigger evaluator, the option does
  return criarSimulacao({ dados, arquivosMapa, missao, dificuldade: 'normal', cargaInicial: 1500 });
}

test('the design sandbox plays by commands alone: harvest, build in the network, place, produce', t => {
  if (!existsSync(new URL('missoes/caixa-de-areia.json', pastaDados))) return t.skip('the design sandbox is not in the repository');
  const sim = caixaDoRepositorio();
  assert.equal(cargaDe(sim, 0), 1500);
  const qg = (() => {
    for (let i = 0; i < sim.capacidade; i++) if (sim.ativo[i] && sim.time[i] === 0 && sim.tipos[sim.tipo[i]].filaConstrucao) return i;
    return -1;
  })();
  assert.ok(qg >= 0);
  const plano = ['acumulador', 'poste', 'alojamento-da-turma', 'poste', 'acumulador', 'cata-vento'].map(nome => tipoDe(sim, nome));
  let proximo = 0;
  const eventos = [];
  // a spot for kind `tipo` near the headquarters, scanning outwards in rings
  const lugar = tipo => {
    const cx = sim.x[qg] >> 10;
    const cy = sim.y[qg] >> 10;
    for (let r = 2; r < 16; r++) for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
      if (motivoPosicaoNaSimulacao(sim, 0, tipo, x, y) === 0) return [x, y];
    }
    return null;
  };
  for (let k = 0; k < 5400; k++) {
    if (k % 30 === 0) {
      const cabeca = cabecaDaFaixa(sim, qg, FAIXA.CONSTRUCAO);
      if (cabeca.pronta) {
        const onde = lugar(cabeca.item);
        // a windmill with no windy cell in reach is cancelled
        if (onde) ordenar(sim, { tipo: TIPO_COMANDO.CONSTRUIR, unidades: [id(sim, qg)], arg: cabeca.item, x: onde[0] * FP + 512, y: onde[1] * FP + 512 });
        else ordenar(sim, { tipo: TIPO_COMANDO.CANCELAR, unidades: [id(sim, qg)], x: FAIXA.CONSTRUCAO, arg: 0 });
      } else if (cabeca.item < 0 && proximo < plano.length && cargaDe(sim, 0) >= sim.tipos[plano[proximo]].custo) {
        ordenar(sim, { tipo: TIPO_COMANDO.PRODUZIR, unidades: [id(sim, qg)], arg: plano[proximo++] });
      }
      const ociosos = [];
      for (let i = 0; i < sim.capacidade; i++) if (sim.ativo[i] && sim.time[i] === 0 && sim.coletorPorTipo[sim.tipo[i]] && sim.tarefa[i] === TAREFA.NENHUMA) ociosos.push(id(sim, i));
      // like a player, by clicking a pile of the node nearest the base (the automatic choice knows explored nodes only)
      const pilha = slotsDo(sim, 'pilha').filter(i => sim.carga[i] > 0).sort((a, b) => Math.abs(sim.x[a] - sim.x[qg]) + Math.abs(sim.y[a] - sim.y[qg]) - (Math.abs(sim.x[b] - sim.x[qg]) + Math.abs(sim.y[b] - sim.y[qg])))[0];
      if (ociosos.length > 0 && pilha !== undefined) ordenar(sim, { tipo: TIPO_COMANDO.COLETAR, unidades: ociosos, alvo: id(sim, pilha) });
    }
    if (k % 300 === 150) {
      for (const alojamento of slotsDo(sim, 'alojamento-da-turma', 0)) ordenar(sim, { tipo: TIPO_COMANDO.PRODUZIR, unidades: [id(sim, alojamento)], arg: tipoDe(sim, 'turma-de-linha') });
      if (slotsDo(sim, 'guincho-de-celulas', 0).length < 4) ordenar(sim, { tipo: TIPO_COMANDO.PRODUZIR, unidades: [id(sim, qg)], arg: tipoDe(sim, 'guincho-de-celulas') });
    }
    for (const e of rodar(sim, 1)) eventos.push(e);
  }
  const doJogador = tipo => doTipo(eventos, tipo).filter(e => sim.ativo[e[E_ENTIDADE] & 0xffff] ? sim.time[e[E_ENTIDADE] & 0xffff] === 0 : true);
  const entregue = doJogador(EVENTO.DESCARGA).reduce((s, e) => s + e[E_ARG], 0);
  assert.ok(entregue >= 300, `${entregue} Carga delivered in 3 minutes`);
  assert.ok(doJogador(EVENTO.CONSTRUCAO_CONCLUIDA).length >= 4, 'buildings placed from the headquarters');
  assert.ok(slotsDo(sim, 'acumulador', 0).every(i => sim.energizado[i] === 1), 'every depot on the network');
  assert.ok(doTipo(eventos, EVENTO.PRODUCAO_CONCLUIDA).length >= 3, 'units produced');
  assert.ok(slotsDo(sim, 'turma-de-linha', 0).length >= 5);
  assert.equal(lotacaoUsada(sim)[0] <= 60, true);
});
