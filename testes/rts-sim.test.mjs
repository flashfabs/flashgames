// RTS simulation: contracts, integer math, data validation, flow fields, fog with height, the team view, command
// rules, determinism, and save and load giving the same state.
import test from 'node:test';
import assert from 'node:assert/strict';
import { criarSimulacao, passo, agendarComando, somaDeVerificacao, somasPorSubsistema, REGRAS_LIVRES } from '../site/rts/js/sim/simulacao.js';
import {
  TIPO_COMANDO, FP, VISAO, criarComando, comandoValido, comandoParaArray, comandoDeArray, compararComandos,
  idDe, slotDe, geracaoDe, proximaGeracao, MAX_GERACAO, alocarCamposRetrato, CAMPOS_RETRATO,
} from '../site/rts/js/sim/contratos.js';
import { anguloDe, seno, cosseno, raizInteira, diferencaAngulo, girarAngulo } from '../site/rts/js/sim/matematica.js';
import { validarTiposUnidade, DADOS_PROTOTIPO } from '../site/rts/js/sim/dados.js';
import { criarCaminhos, pedirCampo, avancarCaminhos, INFINITO } from '../site/rts/js/sim/caminhos.js';
import { montarMapa, gerarMapa } from '../site/rts/js/sim/mapa.js';
import { atualizarNeblina, visaoDoTime } from '../site/rts/js/sim/neblina.js';
import { vistaDoTime } from '../site/rts/js/sim/vista.js';
import { salvar, carregar } from '../site/rts/js/sim/persistencia.js';
import { montarRetrato } from '../site/rts/js/sim/retrato.js';

const hex = n => n.toString(16).padStart(8, '0');
const id = (sim, i) => idDe(i, sim.geracao[i]);
const mapaAberto = (largura = 40, altura = 30) => ({ largura, altura, bases: [{ x: 5, y: 5 }] });
// JSON of a structure with typed arrays, to compare team views
const emTexto = valor => JSON.stringify(valor, (_, v) => (ArrayBuffer.isView(v) ? Array.from(v) : v));

// ---------- contracts ----------

test('ids pack slot and generation, and generations wrap without ever reaching 0', () => {
  const idTeste = idDe(1234, 77);
  assert.equal(slotDe(idTeste), 1234);
  assert.equal(geracaoDe(idTeste), 77);
  assert.ok(idDe(0, 1) > 0);
  assert.ok(idDe(65535, MAX_GERACAO) > 0, 'ids stay positive int32');
  assert.equal(proximaGeracao(MAX_GERACAO), 1);
});

test('commands validate structurally, keep a total order and survive the compact array form', () => {
  const c = criarComando({ tick: 9, jogador: 1, seq: 4, tipo: TIPO_COMANDO.MOVER, unidades: [idDe(3, 1)], x: 5 * FP, y: 6 * FP, fila: 1 });
  assert.ok(comandoValido(c));
  assert.deepEqual(comandoDeArray(comandoParaArray(c)), c);
  assert.ok(!comandoValido({ ...c, tipo: 0 }));
  assert.ok(!comandoValido({ ...c, x: 1.5 }), 'floats are refused');
  assert.ok(!comandoValido({ ...c, jogador: 8 }));
  assert.ok(!comandoValido({ ...c, unidades: [0] }));
  const lista = [{ ...c, jogador: 1, seq: 2 }, { ...c, jogador: 0, seq: 9 }, { ...c, tick: 8, jogador: 7 }];
  assert.deepEqual(lista.sort(compararComandos).map(x => [x.tick, x.jogador, x.seq]), [[8, 7, 4], [9, 0, 9], [9, 1, 2]]);
});

test('the snapshot layout allocates every field with its typed array', () => {
  const r = alocarCamposRetrato(3);
  for (const [nome, Tipo] of CAMPOS_RETRATO) {
    assert.ok(r[nome] instanceof Tipo, nome);
    assert.equal(r[nome].length, 3);
  }
});

// ---------- integer math ----------

test('integer angles match atan2 within one unit and the sine table within half a part in 1024', () => {
  for (let dy = -40; dy <= 40; dy += 3) {
    for (let dx = -40; dx <= 40; dx += 3) {
      if (dx === 0 && dy === 0) continue;
      const esperado = ((Math.round((Math.atan2(dy, dx) * 256) / (2 * Math.PI)) % 256) + 256) % 256;
      assert.ok(Math.abs(diferencaAngulo(anguloDe(dx * 1000, dy * 1000), esperado)) <= 1, `${dx},${dy}`);
    }
  }
  for (let a = 0; a < 256; a++) {
    assert.ok(Math.abs(seno(a) - Math.sin((a * 2 * Math.PI) / 256) * 1024) <= 0.5);
    assert.ok(Math.abs(cosseno(a) - Math.cos((a * 2 * Math.PI) / 256) * 1024) <= 0.5);
  }
  assert.equal(girarAngulo(250, 10, 8), 2, 'turns the short way across 0');
  assert.equal(girarAngulo(10, 12, 8), 12);
});

test('the integer square root is exact below and above 2^31', () => {
  for (let n = 0; n < 300000; n += 7) {
    const r = raizInteira(n);
    assert.ok(r * r <= n && (r + 1) * (r + 1) > n, String(n));
  }
  for (const n of [2 ** 31 - 1, 2 ** 31, 2 ** 37 + 12345, 2 ** 52 - 1]) {
    const r = raizInteira(n);
    assert.ok(r * r <= n && (r + 1) * (r + 1) > n, String(n));
  }
});

// ---------- data and maps ----------

test('unit data must be integers inside the schema ranges', () => {
  assert.equal(DADOS_PROTOTIPO.length, 2);
  const base = { ...DADOS_PROTOTIPO[0] };
  assert.throws(() => validarTiposUnidade([{ ...base, velocidade: 88.5 }]), /não é inteiro/);
  assert.throws(() => validarTiposUnidade([{ ...base, visao: 99 }]), /fora de/);
  assert.throws(() => validarTiposUnidade([{ ...base, cor: 3 }]), /desconhecido/);
  assert.throws(() => validarTiposUnidade([{ ...base, nome: 'Tanque Grande' }]), /nome inválido/);
});

test('maps from layers are validated and always walled in', () => {
  assert.throws(() => montarMapa({ largura: 20, altura: 20, bloqueado: new Uint8Array(10) }), /camada bloqueado/);
  assert.throws(() => montarMapa({ largura: 20, altura: 20, nivel: new Uint8Array(400).fill(4) }), /nível/);
  const mapa = montarMapa(mapaAberto(20, 20));
  assert.equal(mapa.bloqueado[0], 1);
  assert.equal(mapa.bloqueado[20 * 20 - 1], 1);
  const gerado = gerarMapa(96, 96, 3);
  assert.ok(gerado.nivel.some(n => n === 2) && gerado.nivel.some(n => n === 0), 'the generated map has hills');
});

// ---------- flow fields ----------

test('a flow field computed in slices equals the one computed at once, and is cached', () => {
  const mapa = gerarMapa(96, 96, 5);
  const inteiro = criarCaminhos(mapa);
  const fatiado = criarCaminhos(mapa);
  const destino = mapa.bases[1].y * mapa.largura + mapa.bases[1].x;
  const a = pedirCampo(inteiro, destino, 0);
  avancarCaminhos(inteiro, INFINITO);
  const b = pedirCampo(fatiado, destino, 0);
  let fatias = 0;
  while (!fatiado.pronto[b]) {
    avancarCaminhos(fatiado, 500);
    fatias++;
  }
  assert.ok(fatias > 5, 'the small budget really slices');
  assert.deepEqual(fatiado.dist[b], inteiro.dist[a]);
  assert.deepEqual(fatiado.passo[b], inteiro.passo[a]);
  assert.equal(pedirCampo(fatiado, destino, 9), b, 'the same destination reuses the cached field');
});

// ---------- fog ----------

test('incremental fog equals a fresh count of every unit sight', () => {
  const sim = criarSimulacao({ semente: 3, unidadesPorTime: 120, largura: 96, altura: 96 });
  for (let k = 0; k < 400; k++) passo(sim);
  const novo = criarSimulacao({ semente: 3, unidadesPorTime: 120, largura: 96, altura: 96 });
  for (const nome of ['ativo', 'tipo', 'time', 'x', 'y']) novo[nome].set(sim[nome]);
  novo.celulaVisao.fill(-1);
  for (let t = 0; t < novo.times; t++) novo.neblina.contagem[t].fill(0);
  atualizarNeblina(novo);
  for (let t = 0; t < sim.times; t++) assert.deepEqual(sim.neblina.contagem[t], novo.neblina.contagem[t], `team ${t}`);
});

test('a unit on low ground sees the edge of a higher plateau but not what is behind it', () => {
  const largura = 30;
  const nivel = new Uint8Array(largura * 20);
  for (let y = 0; y < 20; y++) for (let x = 13; x < 30; x++) nivel[y * largura + x] = 1;
  const sim = criarSimulacao({ mapa: { largura, altura: 20, nivel, bases: [{ x: 5, y: 10 }] }, unidades: [{ tipo: 0, time: 0, x: 10 * FP + 512, y: 10 * FP + 512 }], regras: REGRAS_LIVRES });
  const visao = visaoDoTime(sim, 0);
  assert.equal(visao[10 * largura + 12], VISAO.VISIVEL);
  assert.equal(visao[10 * largura + 13], VISAO.VISIVEL, 'the cliff edge is seen');
  assert.equal(visao[10 * largura + 15], VISAO.NUNCA, 'behind the edge is hidden');
  assert.equal(visao[10 * largura + 7], VISAO.VISIVEL, 'open ground on the same level is seen');
});

test('the team view shows enemies only on visible cells, and hidden enemies never change it', () => {
  const unidades = [
    { tipo: 0, time: 0, x: 5 * FP, y: 10 * FP },
    { tipo: 0, time: 1, x: 9 * FP, y: 10 * FP },
    { tipo: 0, time: 1, x: 35 * FP, y: 20 * FP },
  ];
  const sim = criarSimulacao({ mapa: mapaAberto(), unidades, regras: REGRAS_LIVRES });
  const vista = vistaDoTime(sim, 0);
  assert.equal(vista.proprias.n, 1);
  assert.deepEqual(Array.from(vista.inimigas.id), [id(sim, 1)]);
  sim.x[2] = 36 * FP;
  sim.y[2] = 25 * FP;
  assert.equal(emTexto(vistaDoTime(sim, 0)), emTexto(vista), 'moving a hidden enemy changes nothing the team sees');
});

// ---------- commands ----------

test('stale ids and other players units are ignored', () => {
  const unidades = [
    { tipo: 0, time: 0, x: 5 * FP, y: 5 * FP },
    { tipo: 0, time: 1, x: 30 * FP, y: 20 * FP },
  ];
  const sim = criarSimulacao({ mapa: mapaAberto(), unidades, regras: REGRAS_LIVRES });
  const velho = idDe(0, sim.geracao[0] + 1);
  agendarComando(sim, criarComando({ tick: 1, jogador: 0, seq: 0, tipo: TIPO_COMANDO.MOVER, unidades: [velho], x: 20 * FP, y: 5 * FP }));
  agendarComando(sim, criarComando({ tick: 1, jogador: 0, seq: 1, tipo: TIPO_COMANDO.MOVER, unidades: [id(sim, 1)], x: 20 * FP, y: 5 * FP }));
  passo(sim);
  assert.equal(sim.ordens.ordem[0], -1, 'a stale generation does not order the unit');
  assert.equal(sim.ordens.ordem[1], -1, 'a player cannot order another player unit');
});

test('the commands of a tick apply in (jogador, seq) order whatever order they arrived in', () => {
  const unidades = [
    { tipo: 0, time: 0, x: 5 * FP, y: 5 * FP },
    { tipo: 0, time: 1, x: 30 * FP, y: 20 * FP },
  ];
  const rodar = inverter => {
    const s = criarSimulacao({ mapa: mapaAberto(), unidades, regras: REGRAS_LIVRES });
    const a = criarComando({ tick: 1, jogador: 0, seq: 0, tipo: TIPO_COMANDO.MOVER, unidades: [id(s, 0)], x: 30 * FP, y: 8 * FP });
    const b = criarComando({ tick: 1, jogador: 1, seq: 0, tipo: TIPO_COMANDO.MOVER, unidades: [id(s, 1)], x: 6 * FP, y: 20 * FP });
    for (const c of inverter ? [b, a] : [a, b]) agendarComando(s, c);
    for (let k = 0; k < 60; k++) passo(s);
    return somaDeVerificacao(s);
  };
  assert.equal(rodar(true), rodar(false));
});

test('the Shift queue, hold position, stop and attack behave', () => {
  const unidades = [
    { tipo: 1, time: 0, x: 5 * FP, y: 10 * FP },
    { tipo: 0, time: 0, x: 5 * FP, y: 12 * FP },
    { tipo: 0, time: 1, x: 30 * FP, y: 10 * FP },
  ];
  const sim = criarSimulacao({ mapa: mapaAberto(), unidades, regras: REGRAS_LIVRES });
  let seq = 0;
  const ordenar = (tipo, extra) => agendarComando(sim, criarComando({ tick: sim.tick + 1, jogador: 0, seq: seq++, tipo, ...extra }));
  ordenar(TIPO_COMANDO.MOVER, { unidades: [id(sim, 1)], x: 15 * FP, y: 12 * FP });
  passo(sim);
  ordenar(TIPO_COMANDO.MOVER, { unidades: [id(sim, 1)], x: 15 * FP, y: 22 * FP, fila: 1 });
  passo(sim);
  assert.equal(sim.ordens.filaTamanho[1], 1, 'the second order waits in the queue');
  for (let k = 0; k < 1500 && !(sim.parada[1] && sim.ordens.filaTamanho[1] === 0); k++) passo(sim);
  assert.ok(Math.abs(sim.y[1] - 22 * FP) < 2 * FP, 'the queued order ran after the first');

  ordenar(TIPO_COMANDO.SEGURAR_POSICAO, { unidades: [id(sim, 1)] });
  passo(sim);
  assert.equal(sim.segurando[1], 1);
  ordenar(TIPO_COMANDO.PARAR, { unidades: [id(sim, 1)] });
  passo(sim);
  assert.equal(sim.segurando[1], 0);
  assert.equal(sim.ordens.ordem[1], -1);

  ordenar(TIPO_COMANDO.ATACAR, { unidades: [id(sim, 0)], alvo: id(sim, 2) });
  for (let k = 0; k < 1500 && sim.ativo[2]; k++) passo(sim);
  assert.equal(sim.ativo[2], 0, 'the tank walked into range and killed its target');
});

// ---------- determinism, save and load ----------

function partidaRoteirizada(passos, unidadesPorTime = 300) {
  const sim = criarSimulacao({ semente: 7, unidadesPorTime });
  const somas = [];
  for (let k = 0; k < passos; k++) {
    if (sim.tick + 1 === 150 || sim.tick + 1 === 900) {
      const time0 = [];
      for (let i = 0; i < sim.capacidade; i++) if (sim.ativo[i] && sim.time[i] === 0) time0.push(id(sim, i));
      const [x, y] = sim.tick + 1 === 150 ? [60, 70] : [150, 140];
      agendarComando(sim, criarComando({ tick: sim.tick + 1, jogador: 0, seq: sim.tick, tipo: TIPO_COMANDO.ATACAR_MOVENDO, unidades: time0.slice(0, 200), x: x * FP, y: y * FP }));
    }
    passo(sim);
    if (sim.tick % 300 === 0) somas.push(hex(somaDeVerificacao(sim)));
  }
  return { sim, somas };
}

test('the same match gives the same checksums twice', () => {
  assert.deepEqual(partidaRoteirizada(1200).somas, partidaRoteirizada(1200).somas);
});

test('saving and loading mid-match continues with the same state, subsystem by subsystem', () => {
  const { sim } = partidaRoteirizada(1000);
  // leave a field half computed and commands pending, the hardest moments to save
  sim.expansoesPorPasso = 3000;
  const time0 = [];
  for (let i = 0; i < sim.capacidade; i++) if (sim.ativo[i] && sim.time[i] === 0) time0.push(id(sim, i));
  agendarComando(sim, criarComando({ tick: sim.tick + 1, jogador: 0, seq: 999, tipo: TIPO_COMANDO.MOVER, unidades: time0.slice(0, 50), x: 170 * FP, y: 20 * FP }));
  agendarComando(sim, criarComando({ tick: sim.tick + 3, jogador: 0, seq: 1000, tipo: TIPO_COMANDO.PATRULHAR, unidades: time0.slice(50, 90), x: 40 * FP, y: 40 * FP }));
  passo(sim);
  assert.ok(sim.caminhos.fila.length > 0, 'a field is still being computed');
  const copia = carregar(salvar(sim));
  assert.deepEqual(somasPorSubsistema(copia), somasPorSubsistema(sim));
  for (let k = 0; k < 600; k++) {
    passo(sim);
    passo(copia);
    if (k % 50 === 0) assert.equal(hex(somaDeVerificacao(copia)), hex(somaDeVerificacao(sim)), `tick ${sim.tick}`);
  }
  assert.deepEqual(somasPorSubsistema(copia), somasPorSubsistema(sim));
});

test('the snapshot lists live entities in slot order with the local team fog', () => {
  const { sim } = partidaRoteirizada(400, 100);
  const r = montarRetrato(sim, { jogadorLocal: 1 });
  let vivos = 0;
  for (let i = 0; i < sim.capacidade; i++) if (sim.ativo[i]) vivos++;
  assert.equal(r.n, vivos);
  for (let k = 1; k < r.n; k++) assert.ok(slotDe(r.id[k]) > slotDe(r.id[k - 1]));
  assert.deepEqual(r.visao, visaoDoTime(sim, 1));
  assert.ok(r.vida.every(v => v >= 1 && v <= 255));
});
