// Combat rules: the armas.json validator and its conversions, the damage matrix, cover, height, veterancy, arcing
// shells with splash, the attack alert and the pace of a 10 against 10 fight with the plan's starting numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { criarSimulacao, passo, REGRAS_LIVRES } from '../site/rts/js/sim/simulacao.js';
import { FP, EVENTO, TAMANHO_EVENTO, E_TIPO, E_TICK, E_ENTIDADE, E_ALVO, idDe } from '../site/rts/js/sim/contratos.js';
import { validarRegrasCombate, REGRAS_COMBATE_PADRAO, combateDe, decimosParaMundo, msParaPassos, COBERTURA } from '../site/rts/js/sim/armas.js';
import { calcularDano, danoBaseDe } from '../site/rts/js/sim/combate.js';
import { ganharExperiencia, definirVeterania, experienciaPorDano } from '../site/rts/js/sim/veterania.js';

const ARMAS = {
  ...REGRAS_COMBATE_PADRAO,
  armas: [
    { nome: 'carabina', tipoDano: 'bala', dano: 10, recargaMs: 1000, alcance: 40 },
    { nome: 'arpao', tipoDano: 'perfurante', dano: 30, recargaMs: 2000, alcance: 50 },
    { nome: 'morteiro', tipoDano: 'explosivo', dano: 60, recargaMs: 4000, alcance: 120, alcanceMinimo: 30, raioArea: 10, emArco: 1, velocidadeProjetil: 80 },
    { nome: 'canhao', tipoDano: 'perfurante', dano: 45, recargaMs: 2200, alcance: 50 },
  ],
};

// game data in the design front's file formats (C5): speeds in hundredths of a cell per second, radii in tenths
const comum = { lotacao: 1, giroCorpo: 16, giroTorre: 16, tempoMs: 10000 };
const DADOS = {
  unidades: {
    versao: 1,
    unidades: [
      { nome: 'turma', faccao: 'religadores', ...comum, classe: 'infantaria', blindagem: 'pessoal', custo: 100, vida: 100, velocidade: 120, raio: 2, visao: 7, arma: 'carabina' },
      { nome: 'arpoador', faccao: 'desligados', ...comum, classe: 'infantaria', blindagem: 'pessoal', custo: 150, vida: 90, velocidade: 100, raio: 2, visao: 7, arma: 'arpao' },
      { nome: 'canhao', faccao: 'desligados', ...comum, classe: 'veiculo', blindagem: 'leve', custo: 700, vida: 300, velocidade: 90, raio: 3, visao: 15, arma: 'morteiro' },
      { nome: 'cesto', faccao: 'religadores', ...comum, classe: 'veiculoGrande', blindagem: 'pesada', custo: 600, vida: 900, velocidade: 110, raio: 4, visao: 8, arma: 'canhao' },
    ],
  },
  predios: { versao: 1, predios: [] },
  armas: ARMAS,
};
const [TURMA, ARPOADOR, CANHAO, CESTO] = [0, 1, 2, 3];

/** A match on an open map with explicit units (cells), the test data and optional height and cover layers. */
function partida({ unidades, largura = 48, altura = 48, nivel, cobertura }) {
  const sim = criarSimulacao({
    mapa: { largura, altura, nivel, bases: [{ x: 4, y: 4 }] },
    dados: DADOS,
    regras: REGRAS_LIVRES,
    unidades: unidades.map(u => ({ direcao: 0, ...u, x: Math.trunc(u.x * FP), y: Math.trunc(u.y * FP) })),
  });
  if (cobertura) sim.mapa.cobertura = cobertura;
  return sim;
}

const meio = n => n + 1 / 2;

function eventos(sim, tipo) {
  const lista = [];
  for (let k = 0; k < sim.eventos.length; k += TAMANHO_EVENTO) if (sim.eventos[k + E_TIPO] === tipo) lista.push(sim.eventos.slice(k, k + TAMANHO_EVENTO));
  return lista;
}

// steps until fn(sim) is true or the limit, collecting every event of the given kinds
function avancar(sim, limite, fn = () => false, tipos = []) {
  const vistos = [];
  for (let k = 0; k < limite && !fn(sim); k++) {
    passo(sim);
    for (const tipo of tipos) vistos.push(...eventos(sim, tipo));
  }
  return vistos;
}

const vivos = (sim, time) => {
  let n = 0;
  for (let i = 0; i < sim.capacidade; i++) if (sim.ativo[i] && sim.time[i] === time) n++;
  return n;
};

test('the validator converts design units and rejects what is not an integer rule', () => {
  const r = validarRegrasCombate(ARMAS);
  assert.equal(r.armas[0].recarga, 30);
  assert.equal(r.armas[0].alcance, 4 * FP);
  assert.equal(r.armas[2].alcanceMinimo, 3 * FP);
  assert.equal(r.armas[2].raioArea, FP);
  assert.equal(r.armas[2].velocidade, Math.trunc((80 * FP) / 300));
  assert.equal(r.armas[3].recarga, msParaPassos(2200));
  assert.equal(r.alcanceAcima, decimosParaMundo(5));
  assert.equal(r.matriz[0 * 4 + 2], 25, 'bullet against heavy armour');
  assert.equal(r.matriz[1 * 4 + 2], 150, 'piercing against heavy armour');
  assert.equal(r.cobertura[COBERTURA.NENHUMA * 4 + 0], 100);
  assert.equal(r.cobertura[COBERTURA.RUINA * 4 + 0], 75);
  const errado = mudanca => assert.throws(() => validarRegrasCombate({ ...ARMAS, ...mudanca }), /armas inválidas/);
  errado({ matriz: { ...ARMAS.matriz, bala: [100, 60, 20, 25] } });
  errado({ matriz: { ...ARMAS.matriz, pane: [25, 100, 75] } });
  errado({ elevacao: { danoAcima: 15, danoAbaixo: 25, alcanceAcima: 2.5 } });
  errado({ armas: [{ nome: 'x', tipoDano: 'laser', dano: 1, recargaMs: 1000, alcance: 10 }] });
  errado({ armas: [{ nome: 'x', tipoDano: 'bala', dano: 1, recargaMs: 1000, alcance: 10, mira: 3 }] });
  errado({ armas: [{ nome: 'x', tipoDano: 'bala', dano: 1, recargaMs: 1000, alcance: 10, alcanceMinimo: 20 }] });
  errado({ veterania: { ...ARMAS.veterania, limiares: [100, 100, 500] } });
  errado({ versao: 2 });
});

test('kinds name their weapon and armour, and a kind without them fires its own bullets', () => {
  const sim = partida({ unidades: [{ tipo: TURMA, time: 0, x: 10, y: 10 }] });
  const c = combateDe(sim);
  // the data compiler ends the kinds with the built-in pile and spark, unarmed and never targets
  assert.deepEqual(Array.from(c.armaDoTipo), [0, 1, 2, 3, -1, -1]);
  assert.deepEqual(Array.from(c.blindagemDoTipo).slice(0, 4), [0, 0, 1, 2]);
  assert.deepEqual(Array.from(c.alvejavel), [1, 1, 1, 1, 0, 0]);
  assert.equal(c.custoDoTipo[CESTO], 600);
  const prototipo = criarSimulacao({ largura: 64, altura: 64, unidadesPorTime: 3 });
  const p = combateDe(prototipo);
  assert.equal(p.armas[p.armaDoTipo[1]].dano, prototipo.tipos[1].dano);
  assert.equal(p.blindagemDoTipo[0], 1, 'vehicles default to light armour');
});

test('the matrix sets the damage of each damage kind against each armour', () => {
  const sim = partida({
    unidades: [
      { tipo: TURMA, time: 0, x: 10, y: 10 },
      { tipo: TURMA, time: 1, x: 12, y: 10 },
      { tipo: CESTO, time: 1, x: 12, y: 12 },
      { tipo: CANHAO, time: 1, x: 14, y: 12 },
    ],
  });
  // carabina (bullet) and arpao (piercing) at base damage 100, from flat ground
  assert.equal(calcularDano(sim, 0, 100, 0, 1), 100, 'bullet on personal');
  assert.equal(calcularDano(sim, 0, 100, 0, 2), 25, 'bullet on heavy');
  assert.equal(calcularDano(sim, 0, 100, 0, 3), 60, 'bullet on light');
  assert.equal(calcularDano(sim, 1, 100, 0, 1), 40, 'piercing on personal');
  assert.equal(calcularDano(sim, 1, 100, 0, 2), 150, 'piercing on heavy');
  assert.equal(calcularDano(sim, 2, 100, 0, 1), 125, 'explosive on personal');
  assert.equal(calcularDano(sim, 0, 2, 0, 2), 1, 'every hit does at least 1');
});

test('cover protects personal armour only, by damage kind', () => {
  const largura = 48;
  const cobertura = new Uint8Array(largura * largura);
  cobertura[10 * largura + 12] = COBERTURA.RUINA;
  cobertura[12 * largura + 12] = COBERTURA.MATO;
  cobertura[14 * largura + 12] = COBERTURA.RUINA;
  const sim = partida({
    cobertura,
    unidades: [
      { tipo: TURMA, time: 0, x: 8, y: 8 },
      { tipo: TURMA, time: 1, x: meio(12), y: meio(10) },
      { tipo: TURMA, time: 1, x: meio(12), y: meio(12) },
      { tipo: CESTO, time: 1, x: meio(12), y: meio(14) },
    ],
  });
  assert.equal(calcularDano(sim, 0, 100, 0, 1), 75, 'bullet into ruins');
  assert.equal(calcularDano(sim, 0, 100, 0, 2), 85, 'bullet into brush');
  assert.equal(calcularDano(sim, 1, 100, 0, 1), 34, 'piercing into ruins: 40% then 85%');
  assert.equal(calcularDano(sim, 2, 100, 0, 1), 125, 'explosive ignores cover');
  assert.equal(calcularDano(sim, 1, 100, 0, 3), 150, 'a vehicle in ruins has no cover');
});

test('high ground adds damage and reach, low ground takes damage away and cannot see past the edge', () => {
  const largura = 48;
  const nivel = new Uint8Array(largura * largura);
  // a plateau of level 1 east of column 20
  for (let y = 0; y < largura; y++) for (let x = 20; x < largura; x++) nivel[y * largura + x] = 1;
  const sim = partida({
    nivel,
    unidades: [
      { tipo: TURMA, time: 0, x: meio(20), y: meio(10) }, // on the edge of the plateau
      { tipo: TURMA, time: 1, x: meio(20) - 4.25, y: meio(10) }, // below, 4.25 cells away
    ],
  });
  assert.equal(calcularDano(sim, 0, 100, 1, 1), 115, 'shooting down');
  assert.equal(calcularDano(sim, 0, 100, 0, 0), 75, 'shooting up');
  const tiros = avancar(sim, 90, () => false, [EVENTO.TIRO]);
  const quem = new Set(tiros.map(e => e[E_ENTIDADE]));
  assert.ok(quem.has(idDe(0, sim.geracao[0])), 'the unit above reaches 4.25 cells');
  assert.ok(!quem.has(idDe(1, sim.geracao[1])), 'the unit below does not');
  assert.ok(sim.vida[1] < 100);

  // two cells back from the edge, the unit above sees down but is hidden from below
  const escondido = partida({
    nivel,
    unidades: [
      { tipo: TURMA, time: 0, x: meio(22), y: meio(10) },
      { tipo: TURMA, time: 1, x: meio(18), y: meio(10) },
    ],
  });
  const tiros2 = avancar(escondido, 90, () => false, [EVENTO.TIRO]);
  assert.ok(tiros2.length > 0);
  assert.ok(tiros2.every(e => e[E_ENTIDADE] === idDe(0, escondido.geracao[0])), 'only the hidden unit above fires');
});

test('veterancy comes from damage in proportion to the victim cost and raises damage, resistance and fire rate', () => {
  const sim = partida({
    unidades: [
      { tipo: TURMA, time: 0, x: 10, y: 10 },
      { tipo: TURMA, time: 1, x: 12, y: 10 },
      { tipo: CESTO, time: 1, x: 30, y: 30 },
    ],
  });
  // the victim never fires back
  sim.recarga[1] = 100000;
  assert.equal(experienciaPorDano(sim, 1, 100), 100, 'a whole infantryman is worth its cost');
  assert.equal(experienciaPorDano(sim, 2, 90), 60, 'a tenth of a heavy line unit is a tenth of its cost');
  const promocoes = avancar(sim, 20 * 30, s => !s.ativo[1], EVENTO.PROMOCAO ? [EVENTO.PROMOCAO] : []);
  assert.equal(sim.ativo[1], 0, 'the duel ended');
  assert.equal(sim.experiencia[0], 100);
  assert.equal(sim.veterania[0], 1, 'a kill of its own cost is level 1');
  if (EVENTO.PROMOCAO) assert.equal(promocoes.length, 1);
  ganharExperiencia(sim, 0, 149);
  assert.equal(sim.veterania[0], 1);
  ganharExperiencia(sim, 0, 1);
  assert.equal(sim.veterania[0], 2, '250% of its cost');
  ganharExperiencia(sim, 0, 10000);
  assert.equal(sim.veterania[0], 3, 'three levels at most');

  const outra = partida({ unidades: [{ tipo: CESTO, time: 0, x: 10, y: 10 }, { tipo: CESTO, time: 1, x: 14, y: 10 }] });
  assert.equal(danoBaseDe(outra, 0), 45);
  definirVeterania(outra, 0, 3);
  assert.equal(danoBaseDe(outra, 0), 51, '+15% at level 3');
  assert.equal(outra.experiencia[0], 3000, 'the experience of the level threshold');
  definirVeterania(outra, 1, 3);
  assert.equal(calcularDano(outra, 3, 100, 0, 1), 130, '150% against heavy armour, 13% resisted');
  passo(outra);
  const recargas = [];
  for (let k = 0; k < 400; k++) {
    passo(outra);
    for (const e of eventos(outra, EVENTO.TIRO)) if (e[E_ENTIDADE] === idDe(0, outra.geracao[0])) recargas.push(e[E_TICK]);
  }
  assert.ok(recargas.length >= 3);
  assert.equal(recargas[1] - recargas[0], Math.trunc((66 * 90) / 100), 'reload 10% faster at level 3');
});

test('an arcing shell lands after its flight and hits the enemies around the point, falling off to the edge', () => {
  const sim = partida({
    unidades: [
      { tipo: CANHAO, time: 0, x: meio(5), y: meio(20) },
      { tipo: TURMA, time: 1, x: meio(15), y: meio(20) },
      { tipo: TURMA, time: 1, x: meio(15) + 0.75, y: meio(20) },
      { tipo: TURMA, time: 1, x: meio(15), y: meio(20) + 3 },
      { tipo: TURMA, time: 0, x: meio(15) - 0.6, y: meio(20) },
    ],
  });
  // the ally beside the target is out of its own team's way: it must not shoot or be shot
  sim.tipos = Object.freeze(sim.tipos.map((tipo, t) => (t === TURMA ? Object.freeze({ ...tipo, arma: null }) : tipo)));
  sim.regrasCombate = null;
  const vistos = avancar(sim, 120, s => eventos(s, EVENTO.EXPLOSAO).length > 0, [EVENTO.TIRO, EVENTO.EXPLOSAO, EVENTO.IMPACTO]);
  const tiro = vistos.find(e => e[E_TIPO] === EVENTO.TIRO);
  const explosao = vistos.find(e => e[E_TIPO] === EVENTO.EXPLOSAO);
  assert.ok(tiro && explosao, 'fired and landed');
  const voo = Math.trunc((10 * FP) / Math.trunc((80 * FP) / 300));
  assert.ok(Math.abs(explosao[E_TICK] - tiro[E_TICK] - voo) <= 1, `flight of about ${voo} ticks`);
  assert.equal(explosao[E_ENTIDADE], idDe(0, sim.geracao[0]));
  const atingidos = vistos.filter(e => e[E_TIPO] === EVENTO.IMPACTO).map(e => e[E_ENTIDADE]);
  assert.deepEqual(atingidos.sort(), [idDe(1, sim.geracao[1]), idDe(2, sim.geracao[2])].sort());
  assert.equal(sim.vida[1], 100 - 75, 'explosive on personal: 125% of 60 at the centre');
  assert.ok(sim.vida[2] > sim.vida[1] && sim.vida[2] < 100, 'less damage away from the centre');
  assert.equal(sim.vida[3], 100, 'outside the radius');
  assert.equal(sim.vida[4], 100, 'allies are not hit');
  assert.ok(sim.experiencia[0] > 0, 'the gunner earns experience');
});

test('an arcing weapon does not fire inside its minimum range', () => {
  const sim = partida({ unidades: [{ tipo: CANHAO, time: 0, x: 10, y: 10 }, { tipo: TURMA, time: 1, x: 12, y: 10 }] });
  const tiros = avancar(sim, 60, () => false, [EVENTO.TIRO]);
  assert.ok(tiros.every(e => e[E_ENTIDADE] !== idDe(0, sim.geracao[0])));
});

test('SOB_ATAQUE warns a team once every few seconds of the same fight', () => {
  const sim = partida({ unidades: [{ tipo: CESTO, time: 0, x: 10, y: 10 }, { tipo: TURMA, time: 1, x: 13, y: 10 }] });
  sim.vida[0] = 100000;
  const alertas = avancar(sim, 12 * 30, () => false, [EVENTO.SOB_ATAQUE]);
  const doTime0 = alertas.filter(e => e[E_ENTIDADE] === idDe(0, sim.geracao[0]));
  assert.ok(doTime0.length >= 2 && doTime0.length <= 3, `${doTime0.length} alerts in 12 s`);
  assert.equal(doTime0[0][E_ALVO], idDe(1, sim.geracao[1]));
});

test('10 basic infantry against 10 resolve in 8 to 20 seconds with the starting numbers', () => {
  const unidades = [];
  for (let k = 0; k < 10; k++) {
    unidades.push({ tipo: TURMA, time: 0, x: meio(10), y: meio(10 + k) });
    unidades.push({ tipo: TURMA, time: 1, x: meio(13), y: meio(10 + k) + 0.25 });
  }
  const sim = partida({ unidades });
  let primeiro = -1;
  avancar(sim, 60 * 30, s => {
    if (primeiro < 0 && eventos(s, EVENTO.TIRO).length > 0) primeiro = s.tick;
    return vivos(s, 0) === 0 || vivos(s, 1) === 0;
  });
  const segundos = (sim.tick - primeiro) / 30;
  assert.ok(primeiro >= 0);
  assert.ok(segundos >= 8 && segundos <= 20, `${segundos} s`);
});
