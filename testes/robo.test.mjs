import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Partida, MAPAS, gradeVazia, indice, velocidade, AJUSTES, CAIXA, CAIXA_MISTERIO, COLUNAS, LINHAS, DIRECAO } from '../site/js/pavio/regras.js';
import { mapaDePerigo, rotaDeFuga, fugaDepoisDaBomba, criarRobo, aplicarAcaoDoRobo, chuteContra, celulaDe, NIVEIS, ORDEM_NIVEIS, MARGEM_S } from '../site/js/pavio/robo.js';

const DT = 1 / 60;
const PASSO = 1 / velocidade(0);
const semItens = () => 0.99;
const bomba = (x, y, restante, alcance = 2, perfurante = false) => ({ x, y, restante, alcance, perfurante });
// The danger map reads only the grid, the bombs and the flames of a match.
const cena = ({ grade = gradeVazia(), bombas = [], chamas = new Map() } = {}) => ({ grade, bombas, chamas });
const vizinhas = (a, b) => [1, COLUNAS].includes(Math.abs(a - b));

// Small seeded generator (mulberry32): the long simulations always play the same way.
function sorteador(semente) {
  let estado = semente >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Runs a match where every player is a robot, the way the host does: brains first, then the rules.
function jogarComRobos(partida, robos, segundos, aCadaPasso = () => {}) {
  for (let t = 0; t < segundos && !partida.resultado; t += DT) {
    for (const robo of robos) aplicarAcaoDoRobo(partida, robo.id, robo.pensar(partida, DT));
    partida.passo(DT);
    aCadaPasso(partida);
  }
}

test('danger map covers the blast cross at the fuse time and stops at pillars', () => {
  const perigo = mapaDePerigo(cena({ bombas: [bomba(3, 1, 1)] }));
  for (const [x, y] of [[3, 1], [2, 1], [1, 1], [4, 1], [5, 1], [3, 2], [3, 3]]) {
    assert.equal(perigo.ini[indice(x, y)], 1, `${x},${y} burns when the bomb goes off`);
    assert.equal(perigo.fim[indice(x, y)], 1 + AJUSTES.chamaS);
  }
  for (const [x, y] of [[6, 1], [3, 4], [4, 2]]) assert.equal(perigo.ini[indice(x, y)], Infinity, `${x},${y} is out of reach`);
});

test('danger map: a crate stops the flame, a piercing flame goes through', () => {
  const grade = gradeVazia();
  grade[indice(4, 1)] = CAIXA;
  const normal = mapaDePerigo(cena({ grade, bombas: [bomba(2, 1, 1, 3)] }));
  assert.equal(normal.ini[indice(4, 1)], 1, 'the crate itself burns');
  assert.equal(normal.ini[indice(5, 1)], Infinity);
  const perfurante = mapaDePerigo(cena({ grade, bombas: [bomba(2, 1, 1, 3, true)] }));
  assert.equal(perfurante.ini[indice(5, 1)], 1);
});

test('danger map accounts for a mystery crate potentially exploding', () => {
  const grade = gradeVazia();
  grade[indice(3, 1)] = CAIXA_MISTERIO;
  const perigo = mapaDePerigo(cena({ grade, bombas: [bomba(2, 1, 1, 1)] }));
  assert.equal(perigo.ini[indice(7, 1)], 1);
  assert.equal(perigo.ini[indice(8, 1)], Infinity);
});

test('danger map: a chain reaction brings the next bomb forward', () => {
  const perigo = mapaDePerigo(cena({ bombas: [bomba(1, 1, 0.5), bomba(3, 1, 2), bomba(9, 1, 2)] }));
  assert.equal(perigo.ini[indice(5, 1)], 0.5, 'the second bomb blows with the first one');
  assert.equal(perigo.ini[indice(3, 3)], 0.5);
  assert.equal(perigo.ini[indice(9, 3)], 2, 'a bomb out of reach keeps its own fuse');
});

test('danger map: a crate broken by an earlier blast lets later flames through once it is out', () => {
  const grade = gradeVazia();
  grade[indice(5, 1)] = CAIXA;
  // The bomb below breaks the crate at 0.5 s; it burns until 0.5 + chamaS.
  const depois = mapaDePerigo(cena({ grade, bombas: [bomba(5, 3, 0.5), bomba(3, 1, 2, 4)] }));
  assert.equal(depois.ini[indice(7, 1)], 2, 'the late blast crosses the cleared cell');
  const durante = mapaDePerigo(cena({ grade, bombas: [bomba(5, 3, 0.5), bomba(3, 1, 0.8, 4)] }));
  assert.equal(durante.ini[indice(6, 1)], Infinity, 'the burning crate still stops it');
});

test('danger map: flames on the ground are dangerous until they burn out', () => {
  const perigo = mapaDePerigo(cena({ chamas: new Map([[indice(2, 1), { restante: 0.3, idade: 0.2, forma: 'h' }]]) }));
  assert.equal(perigo.ini[indice(2, 1)], 0);
  assert.equal(perigo.fim[indice(2, 1)], 0.3);
});

test('danger map: an armed remote bomb of someone else can go off at once, our own one looks like a fuse', () => {
  // Dropped 2 s ago with the detonator: 8 s left on its own timer.
  const remota = { ...bomba(3, 1, AJUSTES.detonadorS - 2), remota: true, dono: 'outro' };
  const deles = mapaDePerigo(cena({ bombas: [remota] }), [], { eu: 'eu' });
  assert.equal(deles.ini[indice(5, 1)], 0, 'its owner may press now');
  assert.equal(deles.fim[indice(5, 1)], remota.restante + AJUSTES.chamaS, 'or let it go off by itself');
  const minha = mapaDePerigo(cena({ bombas: [{ ...remota, dono: 'eu' }] }), [], { eu: 'eu' });
  assert.ok(Math.abs(minha.ini[indice(5, 1)] - 1) < 1e-9, 'our own one never looks closer than a second away');
  const nova = { ...bomba(3, 1, AJUSTES.detonadorS), remota: true, dono: 'eu' };
  assert.ok(Math.abs(mapaDePerigo(cena({ bombas: [nova] }), [], { eu: 'eu' }).ini[indice(5, 1)] - AJUSTES.pavioS) < 1e-9, 'a fresh one is planned like a normal fuse');
  const detonada = mapaDePerigo(cena({ bombas: [nova] }), [], { eu: 'eu', detonar: nova });
  assert.equal(detonada.ini[indice(5, 1)], 0, 'unless we are about to set it off');
});

test('danger map: a frozen fuse waits, but a chain reaction still sets it off', () => {
  const congelada = { ...bomba(3, 1, 1), congelada: 2 };
  assert.equal(mapaDePerigo(cena({ bombas: [congelada] })).ini[indice(5, 1)], 3);
  const comOutra = mapaDePerigo(cena({ bombas: [congelada, bomba(3, 3, 0.5)] }));
  assert.equal(comOutra.ini[indice(5, 1)], 0.5);
});

test('danger map: a kicked bomb may blow anywhere along its slide', () => {
  const grade = gradeVazia();
  grade[indice(9, 1)] = CAIXA;
  const chutada = { ...bomba(3, 1, 2, 1), deslize: DIRECAO.DIREITA, avanco: 0.2 };
  const perigo = mapaDePerigo(cena({ grade, bombas: [chutada] }));
  for (const x of [3, 5, 8]) assert.equal(perigo.ini[indice(x, 1)], 2, `fire may reach ${x},1`);
  assert.equal(perigo.ini[indice(7, 2)], 2, 'stopping at (7, 1) would burn below it');
  assert.equal(perigo.ini[indice(10, 1)], Infinity, 'the crate stops the slide and the blast');
});

test('danger map: sudden death marks the next cells of the spiral for good', () => {
  const partida = new Partida([{ id: 'a', slot: 0 }], { grade: gradeVazia() });
  partida.tempo = partida.morteSubitaS - 1;
  const perigo = mapaDePerigo(partida);
  const [x, y] = partida.espiral[0];
  assert.equal(perigo.ini[indice(x, y)], 1 + AJUSTES.morteSubitaPassoS);
  assert.equal(perigo.fim[indice(x, y)], Infinity);
  const [xl, yl] = partida.espiral.at(-1);
  assert.equal(perigo.ini[indice(xl, yl)], Infinity, 'cells far ahead in the spiral are not counted yet');
});

test('escape route leaves the blast through open cells and ends somewhere safe', () => {
  const partida = new Partida([{ id: 'a', slot: 0 }, { id: 'b', slot: 1 }], { grade: gradeVazia(), sorteio: semItens });
  partida.pedirBomba('a');
  partida.passo(DT);
  const perigo = mapaDePerigo(partida);
  const origem = indice(1, 1);
  const rota = rotaDeFuga(partida, perigo, origem, { passo: PASSO });
  assert.ok(rota?.length >= 2);
  let anterior = origem;
  for (const { celula } of rota) {
    assert.ok(vizinhas(anterior, celula), 'one cell at a time');
    anterior = celula;
  }
  assert.equal(perigo.ini[rota.at(-1).celula], Infinity);
  assert.deepEqual(rotaDeFuga(partida, perigo, indice(9, 9), { passo: PASSO }), [], 'nothing to do when already safe');
});

test('escape route is null inside a pocket the blast fills', () => {
  const grade = gradeVazia();
  grade[indice(3, 1)] = CAIXA;
  grade[indice(1, 3)] = CAIXA;
  const partida = cena({ grade, bombas: [bomba(1, 1, AJUSTES.pavioS)] });
  assert.equal(rotaDeFuga(partida, mapaDePerigo(partida), indice(1, 1), { passo: PASSO }), null);
});

test('escape route waits for a flame ahead to burn out when that is the only way', () => {
  const grade = gradeVazia();
  grade[indice(1, 3)] = CAIXA;
  // Own bomb at (1, 1) with range 1; the only way out, (3, 1), is on fire for another 0.5 s.
  const partida = cena({
    grade,
    bombas: [bomba(1, 1, AJUSTES.pavioS, 1)],
    chamas: new Map([[indice(3, 1), { restante: 0.5, idade: 0.1, forma: 'h' }]]),
  });
  const rota = rotaDeFuga(partida, mapaDePerigo(partida), indice(1, 1), { passo: PASSO });
  const naChama = rota?.find(({ celula }) => celula === indice(3, 1));
  assert.ok(naChama, 'the way out goes through the burning cell');
  // It enters only after the fire is out (with the safety margin), half a step after leaving.
  assert.ok(naChama.saida + PASSO / 2 > 0.5 + MARGEM_S - 1e-9, `left at ${naChama.saida}`);
});

test('a bomb is refused where it would leave no way out', () => {
  const grade = gradeVazia();
  grade[indice(3, 1)] = CAIXA;
  grade[indice(1, 3)] = CAIXA;
  const partida = cena({ grade });
  const jogador = { alcance: 2, perfurante: false, tenis: 0 };
  assert.equal(fugaDepoisDaBomba(partida, jogador, indice(1, 1)).rota, null, 'the blast fills the pocket');
  assert.ok(fugaDepoisDaBomba(partida, jogador, indice(2, 1)).rota?.length, 'from the side cell it can hide around the corner');
});

test('a robot never bombs a dead end it cannot escape, and bombs it once the blast is short enough', () => {
  const grade = gradeVazia();
  // A one-cell-wide corridor (1,1)-(1,3) closed by crates.
  for (const [x, y] of [[2, 1], [2, 3], [1, 4]]) grade[indice(x, y)] = CAIXA;
  for (const nivel of ORDEM_NIVEIS) {
    const longo = new Partida([{ id: 'r', slot: 0 }], { grade, sorteio: semItens });
    longo.jogadores[0].alcance = 3;
    let bombas = 0;
    jogarComRobos(longo, [criarRobo({ id: 'r', nivel, sorteio: sorteador(1) })], 8, p => (bombas += p.bombas.length));
    assert.equal(bombas, 0, `${nivel}: no bomb when the blast covers the whole corridor`);
    assert.equal(longo.jogadores[0].vivo, true);

    const curto = new Partida([{ id: 'r', slot: 0 }], { grade, sorteio: semItens });
    curto.jogadores[0].alcance = 1;
    jogarComRobos(curto, [criarRobo({ id: 'r', nivel, sorteio: sorteador(1) })], 8);
    assert.equal(curto.jogadores[0].vivo, true, `${nivel}: survives its own bombs`);
    assert.ok(curto.jogadores[0].caixas >= 1, `${nivel}: breaks out of the corridor`);
  }
});

test('a robot alone never dies by its own bombs and keeps clearing crates', () => {
  for (const nivel of ORDEM_NIVEIS) {
    for (const mapa of [MAPAS[0], MAPAS[3], MAPAS[4]]) {
      const sorteio = sorteador(7);
      const partida = new Partida([{ id: 'r', slot: 0 }], { mapa, sorteio });
      jogarComRobos(partida, [criarRobo({ id: 'r', nivel, sorteio })], 80);
      const [robo] = partida.jogadores;
      assert.equal(robo.vivo, true, `${nivel} on ${mapa.nome}`);
      assert.ok(robo.caixas >= 20, `${nivel} on ${mapa.nome} broke only ${robo.caixas} crates`);
    }
  }
});

test('a robot with the detonator and a single bomb sets its bombs off from a safe place', () => {
  for (const nivel of ORDEM_NIVEIS) {
    const sorteio = sorteador(5);
    const partida = new Partida([{ id: 'r', slot: 0 }], { mapa: { ...MAPAS[1], itens: [] }, sorteio });
    const [robo] = partida.jogadores;
    robo.detonador = true;
    let detonadas = 0;
    let soltas = 0;
    let antes = new Map();
    jogarComRobos(partida, [criarRobo({ id: 'r', nivel, sorteio })], 30, p => {
      for (const [b, restante] of antes) if (!p.bombas.includes(b) && restante > 0.05) detonadas++;
      for (const b of p.bombas) if (!antes.has(b)) soltas++;
      antes = new Map(p.bombas.map(b => [b, b.restante]));
    });
    assert.equal(robo.vivo, true, nivel);
    assert.ok(soltas >= 4, `${nivel} dropped ${soltas} bombs`);
    assert.ok(detonadas >= soltas / 2, `${nivel} set off ${detonadas} of ${soltas} before their time`);
  }
});

// Ice, kicks and shortcuts are used on purpose (their own tests below), and never leave a robot stuck.
test('robots holding kick, shortcut and ice never get stuck', () => {
  const niveis = ['facil', 'medio', 'dificil', 'dificil'];
  for (const mapa of [MAPAS[1], MAPAS[3]]) {
    const sorteio = sorteador(11);
    const partida = new Partida(niveis.map((_, slot) => ({ id: `r${slot}`, slot })), { mapa, sorteio });
    for (const jogador of partida.jogadores) Object.assign(jogador, { chute: true, atalhos: AJUSTES.maxAtalhos, gelo: AJUSTES.maxGelo, bombasMax: 2 });
    const robos = niveis.map((nivel, slot) => criarRobo({ id: `r${slot}`, nivel, sorteio }));
    const usados = [];
    const paradoDesde = new Map();
    let maiorParada = 0;
    jogarComRobos(partida, robos, 60, p => {
      for (const ev of p.tirarEventos()) if (ev.e === 'atalho') usados.push(ev);
      for (const j of p.jogadores.filter(vivo => vivo.vivo)) {
        const onde = `${j.x},${j.y}`;
        const visto = paradoDesde.get(j.id);
        if (visto?.onde !== onde) paradoDesde.set(j.id, { onde, desde: p.tempo });
        else maiorParada = Math.max(maiorParada, p.tempo - visto.desde);
      }
    });
    // A shortcut is only taken to run from fire: never twice in a row from the same place.
    assert.ok(usados.every((ev, k) => k === 0 || ev.x !== usados[k - 1].x || ev.y !== usados[k - 1].y), `${mapa.nome}: shortcuts back and forth`);
    assert.ok(maiorParada < 20, `${mapa.nome}: a robot stood still for ${maiorParada.toFixed(1)} s`);
  }
});

test('a full arena of robots of every level plays each map to the end', () => {
  const niveis = ['facil', 'medio', 'dificil', 'facil', 'medio', 'dificil', 'medio', 'dificil'];
  for (const [n, mapa] of MAPAS.entries()) {
    const sorteio = sorteador(100 + n);
    const partida = new Partida(niveis.map((_, slot) => ({ id: `r${slot}`, slot })), { mapa, sorteio });
    const robos = niveis.map((nivel, slot) => criarRobo({ id: `r${slot}`, nivel, sorteio }));
    let entradasValidas = true;
    const robosVigiados = robos.map(robo => ({
      id: robo.id,
      pensar(...args) {
        const acao = robo.pensar(...args);
        entradasValidas &&= Number.isInteger(acao.d) && Number.isInteger(acao.d2) && typeof acao.bomba === 'boolean';
        return acao;
      },
    }));
    jogarComRobos(partida, robosVigiados, partida.morteSubitaS + COLUNAS * LINHAS * AJUSTES.morteSubitaPassoS + 2);
    assert.ok(partida.resultado, `${mapa.nome} ended`);
    assert.ok(entradasValidas, 'robots answer with the same input a person gives');
    assert.ok(partida.jogadores.reduce((soma, j) => soma + j.caixas, 0) > 30, `${mapa.nome}: crates were broken`);
  }
});

test('a robot with ice and no way out freezes the bomb and runs', () => {
  // Column 1 below the bomb is a dead end too long to leave before the fuse; to the right, crates.
  const montar = gelo => {
    const grade = gradeVazia();
    for (let y = 2; y <= 9; y++) grade[indice(2, y)] = CAIXA;
    const partida = new Partida([{ id: 'r', slot: 0 }, { id: 'b', slot: 1 }], { grade, sorteio: () => 0.99 });
    const [r, b] = partida.jogadores;
    b.x = 1;
    b.y = 3;
    b.alcance = 6;
    partida.pedirBomba('b');
    partida.passo(DT);
    b.x = 19;
    b.y = 13;
    partida.bombas[0].restante = 0.9;
    r.x = 1;
    r.y = 5;
    r.gelo = gelo;
    return { partida, r };
  };
  const semGelo = montar(0);
  jogarComRobos(semGelo.partida, [criarRobo({ id: 'r', nivel: 'dificil', sorteio: () => 0.5 })], 1.5);
  assert.equal(semGelo.r.vivo, false, 'without ice there is no way out');
  const comGelo = montar(2);
  let congelou = false;
  jogarComRobos(comGelo.partida, [criarRobo({ id: 'r', nivel: 'dificil', sorteio: () => 0.5 })], 5, partida => {
    congelou ||= partida.bombas.some(bomba => bomba.congelada > 0);
  });
  assert.ok(congelou, 'the bomb was frozen');
  assert.equal(comGelo.r.vivo, true);
  assert.equal(comGelo.r.gelo, 1, 'one shot was enough');
});

test('a robot with a shortcut and no way out crosses the crates next to it', () => {
  // The ice scenario: column 1 below the bomb is a dead end, crates along column 2.
  const montar = atalhos => {
    const grade = gradeVazia();
    for (let y = 2; y <= 9; y++) grade[indice(2, y)] = CAIXA;
    const partida = new Partida([{ id: 'r', slot: 0 }, { id: 'b', slot: 1 }], { grade, sorteio: () => 0.99 });
    const [r, b] = partida.jogadores;
    b.x = 1;
    b.y = 3;
    b.alcance = 6;
    partida.pedirBomba('b');
    partida.passo(DT);
    b.x = 19;
    b.y = 13;
    partida.bombas[0].restante = 0.9;
    r.x = 1;
    r.y = 5;
    r.atalhos = atalhos;
    return { partida, r };
  };
  const sem = montar(0);
  jogarComRobos(sem.partida, [criarRobo({ id: 'r', nivel: 'medio', sorteio: () => 0.5 })], 1.5);
  assert.equal(sem.r.vivo, false);
  const com = montar(1);
  jogarComRobos(com.partida, [criarRobo({ id: 'r', nivel: 'medio', sorteio: () => 0.5 })], 3);
  assert.equal(com.r.vivo, true);
  assert.equal(com.r.atalhos, 0);
  assert.ok(com.r.x >= 3, 'landed past the crates');
});

test('a hunting robot kicks a bomb next to it at an enemy down the line', () => {
  const partida = new Partida([{ id: 'r', slot: 0 }, { id: 'b', slot: 1 }], { grade: gradeVazia(), sorteio: () => 0.99 });
  const [r, b] = partida.jogadores;
  b.x = 2;
  b.y = 1;
  partida.pedirBomba('b');
  partida.passo(DT);
  partida.bombas[0].restante = 3;
  b.x = 12;
  b.y = 1;
  r.chute = true;
  const kicks = [];
  jogarComRobos(partida, [criarRobo({ id: 'r', nivel: 'dificil', sorteio: () => 0.5 })], 1.6, p => {
    for (const ev of p.tirarEventos()) if (ev.e === 'chute') kicks.push(ev);
  });
  assert.equal(kicks.length, 1);
  assert.equal(partida.bombas[0].x, 11, 'the bomb slid up to the enemy');
  assert.equal(r.vivo, true);
  assert.equal(chuteContra(partida, { ...r, chute: false }, indice(1, 1)), null, 'no kick without the power');
});

test('robot levels and helpers are consistent', () => {
  assert.deepEqual(ORDEM_NIVEIS, ['facil', 'medio', 'dificil']);
  for (const nivel of ORDEM_NIVEIS) assert.ok(NIVEIS[nivel].nome);
  assert.ok(NIVEIS.facil.reacao > NIVEIS.medio.reacao && NIVEIS.medio.reacao > NIVEIS.dificil.reacao, 'harder robots react faster');
  assert.equal(criarRobo({ id: 'x', nivel: 'inexistente' }).nivel, 'medio');
  assert.equal(celulaDe({ x: 3.49, y: 1.51 }), indice(3, 2));
});
