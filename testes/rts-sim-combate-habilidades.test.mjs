// Combat abilities and slows: the raised basket (still, more reach, no uphill penalty, lowered by a move order),
// artillery that arms before firing, the pressure shot, the ram's stun, caltrops on wheels, the ambush that hides a
// still unit, the reading of an enemy building, and the weapons that slow what they hit or the ground they hit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { criarSimulacao, passo, REGRAS_LIVRES } from '../site/rts/js/sim/simulacao.js';
import { FP, EVENTO, TAMANHO_EVENTO, E_TIPO, E_TICK, E_ENTIDADE, TIPO_COMANDO, idDe } from '../site/rts/js/sim/contratos.js';
import { REGRAS_COMBATE_PADRAO } from '../site/rts/js/sim/armas.js';
import { fatorVelocidade, calcularDano } from '../site/rts/js/sim/combate.js';
import { comandoHabilidade, HABILIDADE, BANDEIRA_COMBATE, bandeirasDeCombate, implantado, predioLido, ocultoPara } from '../site/rts/js/sim/habilidades.js';
import { religandoQual } from '../site/rts/js/sim/religar.js';
import { ordenarGrupo } from '../site/rts/js/sim/ordens.js';

const comum = { lotacao: 1, giroCorpo: 16, giroTorre: 16, tempoMs: 10000, custo: 100, visao: 9 };
const pe = { ...comum, classe: 'infantaria', blindagem: 'pessoal', raio: 2, velocidade: 120, vida: 100 };
const roda = { ...comum, classe: 'veiculo', blindagem: 'leve', raio: 3, velocidade: 200, vida: 300 };
const DADOS = {
  unidades: {
    versao: 1,
    unidades: [
      { nome: 'alvo-a-pe', faccao: 'religadores', ...pe },
      { nome: 'alvo-de-roda', faccao: 'religadores', ...roda },
      { nome: 'cesto', faccao: 'religadores', ...roda, classe: 'veiculoGrande', blindagem: 'pesada', vida: 900, arma: 'lanca', habilidade: { tipo: 'erguer', alcanceExtra: 20, visaoExtra: 2, erguerMs: 2000, baixarMs: 1500, ignoraElevacao: 1 } },
      { nome: 'caldeira', faccao: 'desligados', ...roda, arma: 'morteiro', habilidade: { tipo: 'armar', armarMs: 3000, desarmarMs: 2000, apitoMs: 1000 } },
      { nome: 'locomovel', faccao: 'desligados', ...roda, vida: 1100, arma: 'lanca', habilidade: { tipo: 'pressao', paradoMs: 5000, danoPorcento: 150 } },
      { nome: 'carro-vela', faccao: 'desligados', ...roda, arma: 'garrucha', habilidade: { tipo: 'abalroar', atordoaMs: 1000, alcance: 20, recargaMs: 15000 } },
      { nome: 'rolima', faccao: 'desligados', ...roda, habilidade: { tipo: 'estrepes', raio: 15, lentidaoPorcento: 50, duracaoMs: 10000, vidaMs: 30000, recargaMs: 20000, soRodas: 1 } },
      { nome: 'chapa', faccao: 'desligados', ...pe, arma: 'carabina', habilidade: { tipo: 'tocaia', paradoMs: 3000 } },
      { nome: 'leiturista', faccao: 'religadores', ...roda, habilidade: { tipo: 'leitura', alcance: 80, duracaoMs: 30000, recargaMs: 60000 } },
      { nome: 'atirador', faccao: 'religadores', ...pe, arma: 'carabina' },
      { nome: 'arpoador', faccao: 'desligados', ...pe, arma: 'arpao' },
      { nome: 'bobinas', faccao: 'religadores', ...roda, arma: 'carretel' },
      { nome: 'religador', faccao: 'religadores', ...pe, religa: 1 },
    ],
  },
  predios: {
    versao: 1,
    predios: [
      { nome: 'barracao', faccao: 'desligados', pegada: [1, 1], custo: 400, tempoMs: 25000, vida: 1125, visao: 5 },
      { nome: 'torre-antiga', faccao: 'neutro', pegada: [1, 1], custo: 0, tempoMs: 0, vida: 1200, visao: 9, religavel: 1, tempoReligarMs: 20000 },
    ],
  },
  armas: {
    ...REGRAS_COMBATE_PADRAO,
    armas: [
      { nome: 'lanca', tipoDano: 'perfurante', dano: 40, recargaMs: 2000, alcance: 50 },
      { nome: 'morteiro', tipoDano: 'explosivo', dano: 70, recargaMs: 5000, alcance: 140, alcanceMinimo: 40, raioArea: 12, emArco: 1 },
      { nome: 'garrucha', tipoDano: 'bala', dano: 12, recargaMs: 800, alcance: 40 },
      { nome: 'carabina', tipoDano: 'bala', dano: 10, recargaMs: 1000, alcance: 40 },
      { nome: 'arpao', tipoDano: 'perfurante', dano: 30, recargaMs: 2000, alcance: 50, efeito: { tipo: 'lentidao', porcento: 40, duracaoMs: 4000, raio: 0, noChao: 0, soVeiculo: 1 } },
      { nome: 'carretel', tipoDano: 'explosivo', dano: 20, recargaMs: 4000, alcance: 120, alcanceMinimo: 30, raioArea: 10, emArco: 1, efeito: { tipo: 'lentidao', porcento: 40, duracaoMs: 8000, raio: 10, noChao: 1 } },
    ],
  },
};
const [A_PE, DE_RODA, CESTO, CALDEIRA, LOCOMOVEL, CARRO_VELA, ROLIMA, CHAPA, LEITURISTA, ATIRADOR, ARPOADOR, BOBINAS, RELIGADOR, BARRACAO, TORRE] = Array.from({ length: 15 }, (_, k) => k);

function partida(unidades, { nivel } = {}) {
  return criarSimulacao({
    mapa: { largura: 48, altura: 48, nivel, bases: [{ x: 4, y: 4 }, { x: 40, y: 40 }] },
    dados: DADOS,
    regras: REGRAS_LIVRES,
    capacidade: 32,
    unidades: unidades.map(u => ({ direcao: 0, ...u, x: Math.trunc(u.x * FP), y: Math.trunc(u.y * FP) })),
  });
}

const meio = n => n + 1 / 2;
const id = (sim, i) => idDe(i, sim.geracao[i]);
const parado = (sim, i) => (sim.recarga[i] = 1000000);

function tiros(sim, passos, de) {
  const lista = [];
  for (let k = 0; k < passos; k++) {
    passo(sim);
    for (let e = 0; e < sim.eventos.length; e += TAMANHO_EVENTO) if (sim.eventos[e + E_TIPO] === EVENTO.TIRO && sim.eventos[e + E_ENTIDADE] === id(sim, de)) lista.push(sim.eventos[e + E_TICK]);
  }
  return lista;
}

test('a raised basket stands still, reaches farther, ignores the uphill penalty and comes down with a move order', () => {
  const largura = 48;
  const nivel = new Uint8Array(largura * largura);
  for (let y = 0; y < largura; y++) for (let x = 30; x < largura; x++) nivel[y * largura + x] = 1;
  const sim = partida(
    [
      { tipo: CESTO, time: 0, x: meio(24), y: meio(20) },
      { tipo: A_PE, time: 1, x: meio(30), y: meio(20) },
    ],
    { nivel },
  );
  parado(sim, 1);
  assert.equal(tiros(sim, 60, 0).length, 0, '6 cells is beyond 5');
  comandoHabilidade(sim, [0], HABILIDADE.ERGUER, -1);
  assert.equal(fatorVelocidade(sim, 0), 0, 'still while raising');
  const disparos = tiros(sim, 90, 0);
  assert.ok(implantado(sim, 0));
  assert.ok(bandeirasDeCombate(sim, 0) & BANDEIRA_COMBATE.IMPLANTADO);
  assert.ok(disparos.length > 0 && disparos[0] >= 60 + 60, 'fires once raised, with 2 more cells of reach');
  assert.equal(sim.vida[1], 100 - 16, 'piercing on personal, no uphill penalty from the basket');
  assert.equal(calcularDano(sim, 0, 40, 0, 1), 12, 'the same shot from below without it');
  ordenarGrupo(sim, [0], TIPO_COMANDO.MOVER, Math.trunc(meio(10) * FP), Math.trunc(meio(20) * FP));
  passo(sim);
  assert.ok(!implantado(sim, 0), 'packing up');
  assert.equal(fatorVelocidade(sim, 0), 0);
  for (let k = 0; k < 50; k++) passo(sim);
  assert.equal(fatorVelocidade(sim, 0), 100, 'down after 1.5 s and on its way');
});

test('artillery arms before its first shot and packs up to move', () => {
  const sim = partida([
    { tipo: CALDEIRA, time: 1, x: meio(10), y: meio(20) },
    { tipo: A_PE, time: 0, x: meio(18), y: meio(20) },
  ]);
  parado(sim, 1);
  const disparos = tiros(sim, 200, 0);
  assert.ok(disparos.length > 0);
  assert.ok(disparos[0] >= 90, `first shot at tick ${disparos[0]}, after 3 s of arming`);
  assert.ok(implantado(sim, 0));
  sim.ativo[1] = 0;
  ordenarGrupo(sim, [0], TIPO_COMANDO.MOVER, Math.trunc(meio(30) * FP), Math.trunc(meio(20) * FP));
  for (let k = 0; k < 10; k++) passo(sim);
  assert.ok(!implantado(sim, 0));
  assert.equal(fatorVelocidade(sim, 0), 0, 'packing');
  for (let k = 0; k < 60; k++) passo(sim);
  assert.equal(fatorVelocidade(sim, 0), 100);
});

test('a shot after standing still hits harder once', () => {
  const sim = partida([
    { tipo: LOCOMOVEL, time: 1, x: meio(10), y: meio(20) },
    { tipo: CESTO, time: 0, x: meio(14), y: meio(20) },
  ]);
  parado(sim, 0);
  parado(sim, 1);
  for (let k = 0; k < 160; k++) passo(sim);
  sim.recarga[0] = 0;
  tiros(sim, 3, 0);
  assert.equal(sim.vida[1], 900 - 90, '150% of 40 on heavy armour (150%)');
  sim.recarga[0] = 0;
  tiros(sim, 3, 0);
  assert.equal(sim.vida[1], 900 - 90 - 60, 'the next one is plain');
});

test('the ram stuns a close enemy unit, which neither moves nor fires for a second', () => {
  const sim = partida([
    { tipo: CARRO_VELA, time: 1, x: meio(10), y: meio(20) },
    { tipo: ATIRADOR, time: 0, x: meio(11), y: meio(20) },
  ]);
  let atordoado = -1;
  for (let k = 0; k < 12 && atordoado < 0; k++) {
    passo(sim);
    if (bandeirasDeCombate(sim, 1) & BANDEIRA_COMBATE.ATORDOADO) atordoado = sim.tick;
  }
  assert.ok(atordoado > 0, 'stunned');
  assert.equal(fatorVelocidade(sim, 1), 0);
  const disparos = tiros(sim, 25, 1);
  assert.equal(disparos.length, 0, 'no shot while stunned');
  assert.ok(tiros(sim, 40, 1).length > 0, 'fires again after');
});

test('caltrops slow vehicles that cross them for a while, not people on foot', () => {
  const sim = partida([
    { tipo: ROLIMA, time: 1, x: meio(10), y: meio(20) },
    { tipo: DE_RODA, time: 0, x: meio(11), y: meio(20) },
    { tipo: A_PE, time: 0, x: meio(10), y: meio(21) },
  ]);
  for (let k = 0; k < 8; k++) passo(sim);
  assert.equal(fatorVelocidade(sim, 1), 50, 'the wheels are caught');
  assert.equal(fatorVelocidade(sim, 2), 100, 'feet are not');
  sim.x[1] = Math.trunc(meio(30) * FP);
  for (let k = 0; k < 9 * 30; k++) passo(sim);
  assert.equal(fatorVelocidade(sim, 1), 50, 'still slowed 9 s after leaving');
  for (let k = 0; k < 2 * 30; k++) passo(sim);
  assert.equal(fatorVelocidade(sim, 1), 100);
});

test('an ambush unit standing still is hidden until it fires or an enemy comes close', () => {
  const sim = partida([
    { tipo: CHAPA, time: 1, x: meio(10), y: meio(20) },
    { tipo: ATIRADOR, time: 0, x: meio(10) + 3.5, y: meio(20) },
  ]);
  parado(sim, 0);
  parado(sim, 1);
  for (let k = 0; k < 91; k++) passo(sim);
  assert.ok(ocultoPara(sim, 0, 0, sim.x[1], sim.y[1]), 'hidden at 3.5 cells');
  assert.ok(bandeirasDeCombate(sim, 0) & BANDEIRA_COMBATE.OCULTO);
  sim.recarga[1] = 0;
  assert.equal(tiros(sim, 30, 1).length, 0, 'the enemy cannot target it');
  sim.recarga[0] = 0;
  assert.ok(tiros(sim, 10, 0).length > 0, 'it fires');
  assert.ok(!ocultoPara(sim, 0, 0, sim.x[1], sim.y[1]), 'and shows itself');
  sim.x[1] = Math.trunc((meio(10) + 1) * FP);
  for (let k = 0; k < 91; k++) passo(sim);
  assert.ok(!ocultoPara(sim, 0, 0, sim.x[1], sim.y[1]), 'seen from a cell away');
});

test('reading an enemy building in reach shows it to the team for 30 s, then the ability rests', () => {
  const sim = partida([
    { tipo: LEITURISTA, time: 0, x: meio(10), y: meio(20) },
    { tipo: BARRACAO, time: 1, x: meio(16), y: meio(20) },
    { tipo: BARRACAO, time: 1, x: meio(30), y: meio(20) },
  ]);
  comandoHabilidade(sim, [0], HABILIDADE.LEITURA, id(sim, 2));
  assert.equal(predioLido(sim, 0), -1, 'too far');
  comandoHabilidade(sim, [0], HABILIDADE.LEITURA, id(sim, 1));
  assert.equal(predioLido(sim, 0), 1);
  assert.equal(predioLido(sim, 1), -1);
  for (let k = 0; k < 30 * 30; k++) passo(sim);
  assert.equal(predioLido(sim, 0), -1, 'over after 30 s');
  comandoHabilidade(sim, [0], HABILIDADE.LEITURA, id(sim, 1));
  assert.equal(predioLido(sim, 0), -1, 'resting');
  for (let k = 0; k < 30 * 30; k++) passo(sim);
  comandoHabilidade(sim, [0], HABILIDADE.LEITURA, id(sim, 1));
  assert.equal(predioLido(sim, 0), 1, 'ready a minute after');
});

test('the harpoon slows the vehicles it hits and the cable slows the ground it hits', () => {
  const sim = partida([
    { tipo: ARPOADOR, time: 1, x: meio(10), y: meio(20) },
    { tipo: DE_RODA, time: 0, x: meio(14), y: meio(20) },
    { tipo: A_PE, time: 0, x: meio(14), y: meio(24) },
  ]);
  parado(sim, 1);
  parado(sim, 2);
  tiros(sim, 10, 0);
  assert.equal(fatorVelocidade(sim, 1), 60, '40% slower');
  sim.ativo[1] = 0;
  for (let k = 0; k < 70; k++) passo(sim);
  assert.equal(fatorVelocidade(sim, 2), 100, 'a person hit by the harpoon is not slowed');

  const cabo = partida([
    { tipo: BOBINAS, time: 0, x: meio(10), y: meio(20) },
    { tipo: A_PE, time: 1, x: meio(16), y: meio(20) },
  ]);
  parado(cabo, 1);
  let caiu = -1;
  for (let k = 0; k < 120 && caiu < 0; k++) {
    passo(cabo);
    for (let e = 0; e < cabo.eventos.length; e += TAMANHO_EVENTO) if (cabo.eventos[e + E_TIPO] === EVENTO.EXPLOSAO) caiu = cabo.tick;
  }
  assert.ok(caiu > 0);
  passo(cabo);
  assert.equal(fatorVelocidade(cabo, 1), 60, 'standing on the cable');
  cabo.x[1] = Math.trunc(meio(30) * FP);
  passo(cabo);
  passo(cabo);
  passo(cabo);
  assert.equal(fatorVelocidade(cabo, 1), 100, 'free once off it');
});

test('the HABILIDADE command routes re-powering to the re-powering units', () => {
  const sim = partida([
    { tipo: TORRE, time: 1, x: meio(24), y: meio(24) },
    { tipo: RELIGADOR, time: 0, x: meio(16), y: meio(24) },
  ]);
  comandoHabilidade(sim, [1], HABILIDADE.RELIGAR, id(sim, 0));
  assert.equal(religandoQual(sim, 1), id(sim, 0));
});
