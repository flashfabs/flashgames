// Pavio robots: computer players that exist only on the host. Every simulation step a robot reads the match
// (grid, bombs, flames, players) and answers with the same input a person gives: a direction pair { d, d2 }
// and, sometimes, a bomb. The core is a danger map (when each cell will burn, chain reactions included) and a
// timed search for a way out, so a robot never drops a bomb without a safe place to run to.

import { AJUSTES, COLUNAS, LINHAS, PAREDE, CAIXA, CAIXA_MISTERIO, ehCaixa, CHAO, ITEM, DIRECAO, indice, velocidade, destinoAtalho } from './regras.js';

// reacao: seconds between decisions; raio: how far (in cells) it looks for things to do; caca: weight of
// hitting other players; armadilha: checks whether a bomb leaves an enemy without a way out; cautela: enemies
// this close are assumed to answer with a bomb, and the way out must survive that; pausa: chance of idling
// after reaching a goal; ruido: randomness in the choice of goals.
export const NIVEIS = Object.freeze({
  facil: Object.freeze({ nome: 'Fácil', reacao: 0.45, raio: 8, caca: 0, armadilha: false, cautela: 0, itens: 0.6, pausa: 0.45, ruido: 0.6 }),
  medio: Object.freeze({ nome: 'Médio', reacao: 0.22, raio: 12, caca: 1, armadilha: false, cautela: 3, itens: 1, pausa: 0.1, ruido: 0.2 }),
  dificil: Object.freeze({ nome: 'Difícil', reacao: 0.1, raio: 16, caca: 2, armadilha: true, cautela: 5, itens: 1.3, pausa: 0, ruido: 0 }),
});
export const ORDEM_NIVEIS = Object.freeze(Object.keys(NIVEIS));
export const NOMES_ROBOS = Object.freeze(['Parafuso', 'Rebite', 'Bobina', 'Chip', 'Volt', 'Turbina', 'Ferrugem', 'Bip']);

const TOTAL = COLUNAS * LINHAS;
const ITENS = new Set(Object.values(ITEM));
// Neighbor offsets in the flat grid, with the direction that walks there.
const PASSOS = [[-COLUNAS, DIRECAO.CIMA], [COLUNAS, DIRECAO.BAIXO], [-1, DIRECAO.ESQUERDA], [1, DIRECAO.DIREITA]];
const BRACOS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
// Step of each direction, in the order of DIRECAO.
const VETOR = [[0, 0], [0, -1], [0, 1], [-1, 0], [1, 0]];
export const MARGEM_S = 0.15;
// A cell that stays quiet this long counts as safe: longer than any fuse plus its flames.
export const SEGURO_S = AJUSTES.pavioS + AJUSTES.chamaS;
// While the arena closes, a cell must stay open this much longer, so robots drift inward before a pocket shuts.
const FOLGA_SUBITA_S = 5;
const MAX_PASSOS_FUGA = 24;
const SUBPASSOS = 3;
const HORIZONTE_SUBITA_S = 14;
// Our own remote bomb never looks further than this from going off: we keep clear of it until we set it off.
const PISO_REMOTA_S = 1;
const MAX_DESLIZE = 20;
const BOMBAS_TESTADAS = 8;
const BONUS_ARMADILHA = 8;
const INSISTENCIA = 1.25; // keeps the current goal unless another one is clearly better
const CACA_NA_SUBITA = 2;
const PARADO = Object.freeze({ d: DIRECAO.NENHUMA, d2: DIRECAO.NENHUMA, bomba: false });

// How long a cell must stay quiet to count as safe right now.
const janelaDe = partida => (partida.tempo >= partida.morteSubitaS - FOLGA_SUBITA_S ? SEGURO_S + FOLGA_SUBITA_S : SEGURO_S);

const xDe = i => i % COLUNAS;
const yDe = i => Math.floor(i / COLUNAS);
const distancia = (a, b) => Math.abs(xDe(a) - xDe(b)) + Math.abs(yDe(a) - yDe(b));
export const celulaDe = jogador => indice(Math.round(jogador.x), Math.round(jogador.y));

// When a bomb may go off, in seconds from now, as player `eu` sees it: [earliest, latest]. A frozen fuse waits.
// A remote bomb goes off whenever its owner presses, until its own timer runs out: somebody else's can blow as
// soon as it is armed, while ours is planned like a normal fuse that never gets closer than PISO_REMOTA_S,
// because we only set it off from a safe place. `detonar` is going off right now.
function quandoExplode(bomba, eu, detonar) {
  if (bomba === detonar) return [0, 0];
  const congelada = Math.max(0, bomba.congelada ?? 0);
  const fim = congelada + Math.max(0, bomba.restante);
  if (!bomba.remota) return [fim, fim];
  if (eu !== null && bomba.dono === eu) {
    const comoPavio = bomba.restante - (AJUSTES.detonadorS - AJUSTES.pavioS);
    return [congelada + Math.max(comoPavio, Math.min(bomba.restante, PISO_REMOTA_S)), fim];
  }
  const idade = AJUSTES.detonadorS - bomba.restante;
  return [congelada + Math.max(0, AJUSTES.armarDetonadorS - idade), fim];
}

// A kicked bomb may stop anywhere ahead before something solid, so its fire may come from any of those cells.
function celulasDoDeslize(partida, bomba, ocupadas) {
  const celulas = [[bomba.x, bomba.y]];
  const [dx, dy] = VETOR[bomba.deslize ?? 0] ?? VETOR[0];
  if (!dx && !dy) return celulas;
  let [x, y] = celulas[0];
  for (let n = 0; n < MAX_DESLIZE; n++) {
    x += dx;
    y += dy;
    const i = indice(x, y);
    const celula = partida.grade[i];
    if (celula === undefined || celula === PAREDE || ehCaixa(celula) || ITENS.has(celula) || ocupadas.has(i)) break;
    celulas.push([x, y]);
  }
  return celulas;
}

// When each cell may burn, in seconds from now: ini[i] is the first moment and fim[i] the last one
// (Infinity and -Infinity for a cell that will not burn). Bombs go off in order of their earliest time, so a
// chain reaction brings forward the bombs it reaches, and a crate broken by an earlier blast lets later flames
// through (as soon as it may be out, which errs on the side of more fire).
// `extras` are hypothetical bombs ({ x, y, alcance, perfurante, restante }); `eu` is whose map it is (remote
// bombs differ for their owner) and `detonar` a remote bomb about to be set off. Sudden death counts as fire
// that never ends on the cells about to be walled in.
export function mapaDePerigo(partida, extras = [], { eu = null, detonar = null } = {}) {
  const ini = new Float64Array(TOTAL).fill(Infinity);
  const fim = new Float64Array(TOTAL).fill(-Infinity);
  const marcar = (i, desde, ate) => {
    if (desde < ini[i]) ini[i] = desde;
    if (ate > fim[i]) fim[i] = ate;
  };
  const grade = [...partida.grade];
  // A crate that is still burning stops ordinary flames until its fire is out.
  const queimaAte = new Float64Array(TOTAL);
  for (const [i, chama] of partida.chamas ?? []) {
    marcar(i, 0, chama.restante);
    if (chama.forma === 'x') queimaAte[i] = chama.restante;
  }
  const todas = [...partida.bombas, ...extras];
  const ocupadas = new Set(todas.map(bomba => indice(bomba.x, bomba.y)));
  const pendentes = todas.flatMap(bomba => {
    const [t, tarde] = quandoExplode(bomba, eu, detonar);
    return celulasDoDeslize(partida, bomba, ocupadas).map(([x, y]) => ({ x, y, alcance: bomba.alcance, perfurante: Boolean(bomba.perfurante), t, tarde }));
  });
  const naCelula = new Map(pendentes.map(bomba => [indice(bomba.x, bomba.y), bomba]));
  while (pendentes.length) {
    let proxima = 0;
    for (let n = 1; n < pendentes.length; n++) if (pendentes[n].t < pendentes[proxima].t) proxima = n;
    const [bomba] = pendentes.splice(proxima, 1);
    naCelula.delete(indice(bomba.x, bomba.y));
    const ate = bomba.tarde + AJUSTES.chamaS;
    marcar(indice(bomba.x, bomba.y), bomba.t, ate);
    for (const [dx, dy] of BRACOS) {
      for (let passo = 1; passo <= bomba.alcance; passo++) {
        const i = indice(bomba.x + dx * passo, bomba.y + dy * passo);
        const celula = grade[i];
        if (celula === PAREDE || celula === undefined) break;
        if (queimaAte[i] > bomba.t) {
          if (bomba.perfurante) continue;
          break;
        }
        marcar(i, bomba.t, ate);
        if (ehCaixa(celula)) {
          grade[i] = CHAO;
          queimaAte[i] = bomba.t + AJUSTES.chamaS;
          // A mystery crate may explode immediately; plan for the dangerous outcome.
          if (celula === CAIXA_MISTERIO) pendentes.push({ x: bomba.x + dx * passo, y: bomba.y + dy * passo, alcance: 4, perfurante: false, t: bomba.t, tarde: bomba.tarde });
          if (bomba.perfurante) continue;
          break;
        }
        const outra = naCelula.get(i);
        if (outra) {
          // Chain reaction: the other bomb goes off together with this one.
          outra.t = Math.min(outra.t, bomba.t);
          outra.tarde = Math.min(outra.tarde, bomba.tarde);
          break;
        }
        if (ITENS.has(celula)) {
          grade[i] = CHAO;
          break;
        }
      }
    }
  }
  // A planted Molotov can ignite every non-wall cell in its square when its fuse ends.
  for (const molotov of partida.molotovs ?? []) {
    const quando = Math.max(0, molotov.restante);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = molotov.x + dx, y = molotov.y + dy;
      if (x < 0 || y < 0 || x >= COLUNAS || y >= LINHAS) continue;
      const i = indice(x, y);
      if (partida.grade[i] !== PAREDE) marcar(i, quando, quando + AJUSTES.fogoMolotovS);
    }
  }
  marcarMorteSubita(partida, marcar);
  return { ini, fim };
}

function marcarMorteSubita(partida, marcar) {
  const { espiral, morteSubitaS } = partida;
  if (!Array.isArray(espiral) || !Number.isFinite(morteSubitaS)) return;
  const tempo = partida.tempo ?? 0;
  // Before it starts, the first block falls one step after the start; afterwards the accumulator counts down.
  const espera = tempo >= morteSubitaS ? -(partida.acumuladoSubita ?? 0) : morteSubitaS - tempo;
  for (let k = partida.posEspiral ?? 0, n = 1; k < espiral.length; k++, n++) {
    const t = espera + n * AJUSTES.morteSubitaPassoS;
    if (t > HORIZONTE_SUBITA_S) break;
    marcar(indice(espiral[k][0], espiral[k][1]), Math.max(0, t), Infinity);
  }
}

// True when the cell does not burn between `desde` and `ate` (seconds from now), with a safety margin.
export function livre(perigo, i, desde, ate, margem = MARGEM_S) {
  return ate < perigo.ini[i] - margem || desde > perigo.fim[i] + margem;
}

function criarBloqueio(partida, extras = []) {
  const bombas = new Set([...partida.bombas, ...extras].map(bomba => indice(bomba.x, bomba.y)));
  return i => {
    const celula = partida.grade[i];
    return celula === PAREDE || ehCaixa(celula) || celula === undefined || bombas.has(i);
  };
}

// Shortest way to a cell that stays safe, walking one cell every `passo` seconds and allowed to wait in place
// (a third of a step at a time) while a flame ahead burns out. A player standing at the center of a cell at
// time t occupies it from t - passo/2 to t + passo/2, and waiting stretches that. The start may hold a bomb
// (the player stands on it), but no other bomb can be crossed. Returns the steps to take, each one
// { celula, saida } with the cell to walk into and when to leave toward it (seconds from now); [] when the
// start is already safe, or null when there is no way out. A cell is safe when it stays quiet for `janela` seconds.
export function rotaDeFuga(partida, perigo, origem, { passo, extras = [], margem = MARGEM_S, maxPassos = MAX_PASSOS_FUGA, janela = SEGURO_S } = {}) {
  const meio = passo / 2;
  const tique = passo / SUBPASSOS;
  const seguro = (i, t) => livre(perigo, i, t - meio, t + janela, margem);
  const bloqueia = criarBloqueio(partida, extras);
  const niveis = maxPassos * SUBPASSOS;
  const pai = new Int32Array(TOTAL * (niveis + 1)).fill(-1);
  const filas = Array.from({ length: niveis + 1 }, () => []);
  filas[0].push(origem);
  for (let k = 0; k <= niveis; k++) {
    for (const i of filas[k]) {
      if (seguro(i, k * tique)) return refazerRota(pai, k * TOTAL + i, tique);
      // Wait one tick in place, or walk to a neighbor (one whole step).
      for (const j of [i, i - COLUNAS, i + COLUNAS, i - 1, i + 1]) {
        const chegada = j === i ? k + 1 : k + SUBPASSOS;
        const estado = chegada * TOTAL + j;
        if (chegada > niveis || pai[estado] !== -1 || (j !== i && bloqueia(j))) continue;
        const t = chegada * tique;
        if (!livre(perigo, j, t - meio, t + meio, margem)) continue;
        pai[estado] = k * TOTAL + i;
        filas[chegada].push(j);
      }
    }
  }
  return null;
}

function refazerRota(pai, estado, tique) {
  const estados = [];
  for (let e = estado; e !== -1; e = pai[e]) estados.push(e);
  estados.reverse();
  const rota = [];
  for (let n = 1; n < estados.length; n++) {
    const de = estados[n - 1] % TOTAL;
    const para = estados[n] % TOTAL;
    if (para !== de) rota.push({ celula: para, saida: Math.floor(estados[n - 1] / TOTAL) * tique });
  }
  return rota;
}

// Would a bomb dropped now at `celula` by this player leave it a way out? `outras` are more hypothetical bombs
// to survive as well (enemies answering). Returns the flight path (or null) and the bomb.
export function fugaDepoisDaBomba(partida, jogador, celula, { margem = MARGEM_S, outras = [] } = {}) {
  const bomba = { x: xDe(celula), y: yDe(celula), alcance: jogador.alcance, perfurante: jogador.perfurante, restante: AJUSTES.pavioS };
  const extras = [bomba, ...outras];
  const perigo = mapaDePerigo(partida, extras, { eu: jogador.id ?? null });
  const rota = rotaDeFuga(partida, perigo, celula, { passo: 1 / velocidade(jogador.tenis), extras, margem });
  return { rota, bomba };
}

// The worst case near `celula`: every enemy within `raio` drops a bomb right where it stands. A way out that
// survives these does not run into anyone's corridor.
function respostasDe(partida, inimigos, celula, raio) {
  const ocupadas = new Set([celula, ...partida.bombas.map(bomba => indice(bomba.x, bomba.y))]);
  const respostas = [];
  for (const inimigo of inimigos) {
    const onde = celulaDe(inimigo);
    if (ocupadas.has(onde) || distancia(onde, celula) > raio) continue;
    ocupadas.add(onde);
    respostas.push({ x: xDe(onde), y: yDe(onde), alcance: inimigo.alcance, perfurante: inimigo.perfurante, restante: AJUSTES.pavioS });
  }
  return respostas;
}

// Cells reachable without walking into any blast, with their distance in steps and the previous cell.
function mapaDeDistancias(partida, perigo, origem, passo, raio, margem, janela) {
  const dist = new Int16Array(TOTAL).fill(-1);
  const anterior = new Int16Array(TOTAL).fill(-1);
  const bloqueia = criarBloqueio(partida);
  const meio = passo / 2;
  dist[origem] = 0;
  const alcancadas = [origem];
  for (let n = 0; n < alcancadas.length; n++) {
    const i = alcancadas[n];
    if (dist[i] >= raio) continue;
    const t = (dist[i] + 1) * passo;
    for (const [delta] of PASSOS) {
      const j = i + delta;
      if (dist[j] !== -1 || bloqueia(j) || !livre(perigo, j, t - meio, t + janela, margem)) continue;
      dist[j] = dist[i] + 1;
      anterior[j] = i;
      alcancadas.push(j);
    }
  }
  return { dist, anterior, alcancadas };
}

// Steps of a plain walk (no planned waits) from `origem` to `destino`.
function caminho(anterior, origem, destino) {
  const rota = [];
  for (let c = destino; c !== origem && c !== -1; c = anterior[c]) rota.push({ celula: c, saida: -Infinity });
  return rota.reverse();
}

// No safe cell in reach: head for the reachable cell that burns last.
function rotaMenosRuim(partida, perigo, origem, passo) {
  const bloqueia = criarBloqueio(partida);
  const dist = new Int16Array(TOTAL).fill(-1);
  const anterior = new Int16Array(TOTAL).fill(-1);
  dist[origem] = 0;
  const fila = [origem];
  let melhor = origem;
  const folga = i => perigo.ini[i] - dist[i] * passo;
  for (let n = 0; n < fila.length; n++) {
    const i = fila[n];
    if (folga(i) > folga(melhor)) melhor = i;
    if (dist[i] >= 8) continue;
    for (const [delta] of PASSOS) {
      const j = i + delta;
      if (dist[j] !== -1 || bloqueia(j)) continue;
      dist[j] = dist[i] + 1;
      anterior[j] = i;
      fila.push(j);
    }
  }
  return caminho(anterior, origem, melhor);
}

function valorDoItem(item, jogador) {
  switch (item) {
    case ITEM.BOMBA:
    case ITEM.BOMBA2:
      // With the detonator a press sets a bomb off only when none is left to drop: one bomb is best.
      if (jogador.detonador) return 0;
      if (jogador.bombasMax >= AJUSTES.maxBombas) return 0.3;
      return jogador.bombasMax < 4 ? 3 : 1.5;
    case ITEM.FOGO:
    case ITEM.FOGO2:
    case ITEM.FOGO3:
    case ITEM.FOGO5:
      if (jogador.alcance >= AJUSTES.maxAlcance) return 0.3;
      return jogador.alcance < 5 ? 3 : 1.2;
    case ITEM.TENIS:
      return jogador.tenis < AJUSTES.maxTenis ? 2.5 : 0.3;
    case ITEM.ESCUDO:
    case ITEM.ESCUDO2:
      return jogador.escudo ? 0.3 : 3;
    case ITEM.PERFURANTE:
      return jogador.perfurante ? 0.3 : 2.5;
    case ITEM.FANTASMA:
    case ITEM.IMA:
      return 1;
    case ITEM.DETONADOR:
      if (jogador.detonador) return 0.3;
      return jogador.bombasMax === 1 ? 2.5 : 0;
    // Robots do not kick, throw ice nor take shortcuts: these are only worth keeping from the others.
    case ITEM.CHUTE:
    case ITEM.GELO:
    case ITEM.ATALHO:
      return 0.3;
    default:
      return 0;
  }
}

// What a bomb dropped at `origem` would achieve right now: fresh crates (not already doomed by another bomb),
// enemies in the blast (alvos), minus items it would burn.
function valorDaBomba(partida, perigo, jogador, origem, bombas, inimigas, pesoCaca) {
  let valor = 0;
  let alvos = 0;
  const atingidas = [origem];
  for (const [dx, dy] of BRACOS) {
    for (let passo = 1; passo <= jogador.alcance; passo++) {
      const i = indice(xDe(origem) + dx * passo, yDe(origem) + dy * passo);
      const celula = partida.grade[i];
      if (celula === PAREDE || celula === undefined) break;
      atingidas.push(i);
      if (ehCaixa(celula)) {
        if (perigo.ini[i] === Infinity) valor += 1;
        if (jogador.perfurante) continue;
        break;
      }
      if (ITENS.has(celula)) {
        valor -= 0.5;
        break;
      }
      if (bombas.has(i)) break;
    }
  }
  for (const i of atingidas) alvos += inimigas.get(i) ?? 0;
  return { valor: valor + alvos * 2 * pesoCaca, alvos };
}

// True when a bomb (already in `perigo`) leaves this enemy without any way out.
function semSaida(partida, perigo, extras, inimigo) {
  const rota = rotaDeFuga(partida, perigo, celulaDe(inimigo), { passo: 1 / velocidade(inimigo.tenis), extras, margem: 0 });
  return rota === null;
}

function direcaoEntre(de, para) {
  return PASSOS.find(([delta]) => de + delta === para)?.[1] ?? DIRECAO.NENHUMA;
}

function centralizar(jogador) {
  const dx = Math.round(jogador.x) - jogador.x;
  const dy = Math.round(jogador.y) - jogador.y;
  if (Math.abs(dx) > 0.06) return { ...PARADO, d: dx > 0 ? DIRECAO.DIREITA : DIRECAO.ESQUERDA };
  if (Math.abs(dy) > 0.06) return { ...PARADO, d: dy > 0 ? DIRECAO.BAIXO : DIRECAO.CIMA };
  return PARADO;
}

const centrado = jogador => Math.abs(Math.round(jogador.x) - jogador.x) < 0.25 && Math.abs(Math.round(jogador.y) - jogador.y) < 0.25;

// One danger map per robot and step (remote bombs look different to their owner).
const mapasDoPasso = new WeakMap();
function perigoDoPasso(partida, id) {
  let visto = mapasDoPasso.get(partida);
  if (visto?.tempo !== partida.tempo) {
    visto = { tempo: partida.tempo, mapas: new Map() };
    mapasDoPasso.set(partida, visto);
  }
  if (!visto.mapas.has(id)) visto.mapas.set(id, mapaDePerigo(partida, [], { eu: id }));
  return visto.mapas.get(id);
}

// One robot brain. pensar(partida, dt) runs once per simulation step (before partida.passo) and returns the
// input for the robot's player: { d, d2, bomba }.
// Hands one robot decision to the match, as a person's input would arrive. A robot's bomb press never waits
// for a later cell: its way out was planned from where it decided.
export function aplicarAcaoDoRobo(partida, id, { d, d2, bomba, gelo, portal }) {
  partida.definirEntrada(id, d, d2);
  if (bomba) partida.pedirBomba(id, { espera: 0 });
  if (gelo) partida.jogarGelo(id);
  if (portal) partida.atravessar(id, portal);
}

const DIRECOES_BRACOS = [DIRECAO.CIMA, DIRECAO.BAIXO, DIRECAO.ESQUERDA, DIRECAO.DIREITA];

// With the kick: the direction of a still bomb right next to us whose slide ends with an enemy in its blast,
// while we stay out of it (we are behind it, so far enough along the line). The fuse must outlast the slide.
export function chuteContra(partida, eu, origem) {
  if (!eu.chute) return null;
  const inimigas = new Set(partida.jogadores.filter(j => j.vivo && j !== eu).map(celulaDe));
  const ocupada = (x, y) => partida.jogadores.some(j => j.vivo && Math.abs(j.x - x) < 0.99 && Math.abs(j.y - y) < 0.99);
  const solida = (x, y) => {
    const celula = partida.grade[indice(x, y)];
    return celula === undefined || celula === PAREDE || ehCaixa(celula) || ITENS.has(celula) || partida.bombas.some(b => b.x === x && b.y === y);
  };
  for (const [k, [dx, dy]] of BRACOS.entries()) {
    const bx = xDe(origem) + dx;
    const by = yDe(origem) + dy;
    const bomba = partida.bombas.find(b => b.x === bx && b.y === by && !b.deslize);
    if (!bomba) continue;
    let x = bx;
    let y = by;
    let casas = 0;
    while (casas < MAX_DESLIZE && !solida(x + dx, y + dy) && !ocupada(x + dx, y + dy)) {
      x += dx;
      y += dy;
      casas++;
    }
    if (casas === 0 || casas + 1 <= bomba.alcance) continue;
    // Never a bomb that could go off while sliding: we stand right behind it.
    if (bomba.remota || Math.max(0, bomba.congelada ?? 0) + bomba.restante < casas / AJUSTES.velocidadeChute + 1) continue;
    // The blast at the stop cell, as a cross that crates and walls cut.
    let acerta = inimigas.has(indice(x, y));
    for (const [ax, ay] of BRACOS) {
      for (let passo = 1; passo <= bomba.alcance && !acerta; passo++) {
        const i = indice(x + ax * passo, y + ay * passo);
        const celula = partida.grade[i];
        if (celula === undefined || celula === PAREDE) break;
        if (inimigas.has(i)) acerta = true;
        if (ehCaixa(celula) && !bomba.perfurante) break;
      }
    }
    if (acerta) return DIRECOES_BRACOS[k];
  }
  return null;
}

// With shortcut charges and no safe way out: the direction of the crates right next to us whose far side
// stays quiet long enough, when we survive pushing in place for the moment a shortcut takes.
export function atalhoQueSalva(partida, eu, origem, perigo, margem = MARGEM_S) {
  if (!(eu.atalhos > 0) || eu.fantasma > 0) return null;
  const empurrar = AJUSTES.empurrarAtalhoS + 0.1;
  if (!livre(perigo, origem, 0, empurrar, margem)) return null;
  const caixaNoMapa = (x, y) => ehCaixa(partida.grade[indice(x, y)]);
  const livreParaPousar = (x, y) => {
    const celula = partida.grade[indice(x, y)];
    return celula !== undefined && celula !== PAREDE && !ehCaixa(celula) && !partida.bombas.some(b => b.x === x && b.y === y);
  };
  const centro = { x: xDe(origem), y: yDe(origem) };
  for (const direcao of DIRECOES_BRACOS) {
    const ehParede = (x, y) => x >= 0 && y >= 0 && x < COLUNAS && y < LINHAS && partida.grade[indice(x, y)] === PAREDE;
    const destino = destinoAtalho(centro, direcao, eu.atalhos, caixaNoMapa, livreParaPousar, undefined, ehParede);
    if (destino && livre(perigo, indice(destino.x, destino.y), empurrar, empurrar + SEGURO_S, margem)) return direcao;
  }
  return null;
}

// With ice and no safe way out: the direction of a bomb in line that, frozen, leaves a way out (or none).
// The shot must get there before the fuse runs out; a bomb right next to us is skipped when we can kick,
// because facing it would kick it instead.
export function geloQueSalva(partida, eu, origem, passo, margem = MARGEM_S) {
  // One shot at a time: the one in flight has not frozen anything yet.
  if (!(eu.gelo > 0) || partida.gelos?.some(tiro => tiro.dono === eu.id)) return null;
  for (const [dx, dy, direcao] of BRACOS.map(([dx, dy], k) => [dx, dy, [DIRECAO.CIMA, DIRECAO.BAIXO, DIRECAO.ESQUERDA, DIRECAO.DIREITA][k]])) {
    for (let k = 1; k <= AJUSTES.alcanceGelo; k++) {
      const x = xDe(origem) + dx * k;
      const y = yDe(origem) + dy * k;
      const i = indice(x, y);
      const celula = partida.grade[i];
      if (celula === PAREDE || ehCaixa(celula) || celula === undefined) break;
      const bomba = partida.bombas.find(b => b.x === x && b.y === y);
      if (!bomba) {
        if (partida.jogadores.some(j => j.vivo && j !== eu && Math.abs(j.x - x) < 0.99 && Math.abs(j.y - y) < 0.99)) break;
        continue;
      }
      const chega = (k - 0.5) / AJUSTES.velocidadeGelo + margem;
      if (bomba.congelada > 0 || bomba.restante <= chega || (k === 1 && eu.chute)) break;
      const simulada = { ...partida, bombas: partida.bombas.map(b => (b === bomba ? { ...b, congelada: AJUSTES.congelarS } : b)) };
      const perigo = mapaDePerigo(simulada, [], { eu: eu.id });
      if (livre(perigo, origem, 0, SEGURO_S, margem) || rotaDeFuga(simulada, perigo, origem, { passo, margem })) return direcao;
      break;
    }
  }
  return null;
}

export function criarRobo({ id, nivel = 'medio', sorteio = Math.random } = {}) {
  const ajustes = NIVEIS[nivel] ?? NIVEIS.medio;
  const margem = MARGEM_S;
  let plano = []; // [{ celula, apos }]: cells to walk into, in order, and the match time to leave toward each one
  let modo = 'parado'; // 'fuga' (running from fire), 'andar' (going to a goal) or 'parado'
  let arriscando = false; // the plan is the best of no safe way out: only fire already burning stops it
  let objetivo = -1;
  let relogio = sorteio() * ajustes.reacao; // robots do not all think on the same step
  let gelo = DIRECAO.NENHUMA; // facing this way for one step throws ice
  let empurrar = { d: DIRECAO.NENHUMA, ate: 0 }; // walking into a bomb this way kicks it
  let atravessar = { d: DIRECAO.NENHUMA, ate: 0, atalhos: 0 }; // pushing crates this way takes a shortcut
  let pausa = 0;

  const adotar = (rota, agora) => rota.map(({ celula, saida }) => ({ celula, apos: agora + saida }));

  function decidir(partida, eu, perigo, passo) {
    const origem = celulaDe(eu);
    const meio = passo / 2;
    const inimigos = partida.jogadores.filter(j => j.vivo && j.id !== id);
    const janela = janelaDe(partida);
    // The hunters kick a bomb next to them at an enemy down the line (which also sends it away from them).
    const chute = ajustes.caca && livre(perigo, origem, 0, 0.5, margem) ? chuteContra(partida, eu, origem) : null;
    if (chute) {
      plano = [];
      modo = 'parado';
      empurrar = { d: chute, ate: partida.tempo + 0.25 };
      return false;
    }
    if (!livre(perigo, origem, -meio, SEGURO_S, margem)) {
      if (modo === 'fuga' && planoServe(partida, eu, perigo, passo)) return false;
      modo = 'fuga';
      objetivo = -1;
      // The careful ones first look for a way out that keeps clear of the enemies nearby; while the arena
      // closes, a place that stays open longer is better.
      const respostas = ajustes.cautela ? respostasDe(partida, inimigos, origem, ajustes.cautela) : [];
      const comRespostas = respostas.length ? mapaDePerigo(partida, respostas, { eu: id }) : null;
      const rota = (comRespostas ? rotaDeFuga(partida, comRespostas, origem, { passo, extras: respostas, margem, janela }) : null)
        ?? (janela > SEGURO_S ? rotaDeFuga(partida, perigo, origem, { passo, margem, janela }) : null)
        ?? rotaDeFuga(partida, perigo, origem, { passo, margem });
      arriscando = !rota;
      plano = adotar(rota ?? rotaMenosRuim(partida, perigo, origem, passo), partida.tempo);
      if (!rota) {
        // Out through the crates if we can, else freeze the bomb.
        const atalho = atalhoQueSalva(partida, eu, origem, perigo, margem);
        if (atalho) atravessar = { d: atalho, ate: partida.tempo + AJUSTES.empurrarAtalhoS + 0.25, atalhos: eu.atalhos };
        else gelo = geloQueSalva(partida, eu, origem, passo, margem) ?? DIRECAO.NENHUMA;
      }
      return false;
    }
    arriscando = false;
    if (eu.detonador && podeDetonar(partida, eu, origem, meio)) {
      plano = [];
      modo = 'parado';
      return true;
    }
    if (pausa > 0) {
      plano = [];
      modo = 'parado';
      return false;
    }

    const { dist, anterior, alcancadas } = mapaDeDistancias(partida, perigo, origem, passo, ajustes.raio, margem, janela);
    const inimigas = new Map();
    for (const inimigo of inimigos) inimigas.set(celulaDe(inimigo), (inimigas.get(celulaDe(inimigo)) ?? 0) + 1);
    const bombas = new Set(partida.bombas.map(bomba => indice(bomba.x, bomba.y)));
    const podeBombar = partida.bombas.filter(bomba => bomba.dono === id).length < eu.bombasMax;
    // Once the arena starts closing, waiting it out ends in a draw: every level goes after the others.
    const caca = ajustes.caca + (partida.tempo >= partida.morteSubitaS ? CACA_NA_SUBITA : 0);
    const notar = (valor, celula) => {
      const ruido = 1 + (sorteio() - 0.5) * ajustes.ruido;
      return (valor * ruido * (celula === objetivo ? INSISTENCIA : 1)) / (1 + dist[celula] * 0.3);
    };

    const itens = [];
    const pontosDeBomba = [];
    for (const celula of alcancadas) {
      const conteudo = partida.grade[celula];
      if (ITENS.has(conteudo)) {
        const valor = valorDoItem(conteudo, eu) * ajustes.itens;
        if (valor > 0) itens.push({ celula, nota: notar(valor, celula) });
      }
      if (bombas.has(celula) || partida.chamas.has(celula)) continue;
      const { valor, alvos } = valorDaBomba(partida, perigo, eu, celula, bombas, inimigas, caca);
      if (valor > 0) pontosDeBomba.push({ celula, valor, alvos, nota: notar(valor, celula) * (podeBombar ? 1 : 0.5) });
    }

    // Only the most promising bomb spots get the full check: a way out after the bomb, and for the hardest
    // level whether it corners someone. The careful levels prefer a way out that survives the enemies nearby
    // answering with bombs; for crates they insist on it, attacks and the closing arena are worth the risk.
    pontosDeBomba.sort((a, b) => b.nota - a.nota);
    const bombasValidas = [];
    let melhorFuga = null;
    const arriscar = partida.tempo >= partida.morteSubitaS;
    for (const ponto of pontosDeBomba.slice(0, BOMBAS_TESTADAS)) {
      const outras = ajustes.cautela ? respostasDe(partida, inimigos, ponto.celula, ajustes.cautela) : [];
      let { rota, bomba } = fugaDepoisDaBomba(partida, eu, ponto.celula, { margem, outras });
      if (!rota && outras.length && (ponto.alvos || arriscar)) ({ rota, bomba } = fugaDepoisDaBomba(partida, eu, ponto.celula, { margem }));
      if (!rota) continue;
      if (ajustes.armadilha) {
        const comBomba = mapaDePerigo(partida, [bomba]);
        let bonus = 0;
        for (const inimigo of inimigos) {
          if (distancia(celulaDe(inimigo), ponto.celula) > eu.alcance + 3) continue;
          if (semSaida(partida, comBomba, [bomba], inimigo)) bonus += BONUS_ARMADILHA * (inimigo.escudo ? 0.4 : 1);
        }
        if (bonus) ponto.nota = notar(ponto.valor + bonus, ponto.celula) * (podeBombar ? 1 : 0.5);
      }
      if (ponto.celula === origem) melhorFuga = rota;
      bombasValidas.push(ponto);
    }

    const melhor = [...itens, ...bombasValidas].sort((a, b) => b.nota - a.nota)[0];
    if (melhor?.celula === origem && melhorFuga) {
      plano = [];
      modo = 'parado';
      if (!podeBombar) return false;
      if (!centrado(eu)) {
        // Drop it only from the middle of the cell, where the flight was planned from.
        relogio = Math.min(relogio, 0.05);
        return false;
      }
      plano = adotar(melhorFuga, partida.tempo);
      modo = 'fuga';
      objetivo = -1;
      return true;
    }
    if (melhor) {
      objetivo = melhor.celula;
      plano = adotar(caminho(anterior, origem, melhor.celula), partida.tempo);
      modo = 'andar';
      return false;
    }

    // Nothing in reach: the hunters walk toward the closest enemy, the others wander around. Where the arena
    // is about to close, staying is not an option.
    const fechando = !livre(perigo, origem, -meio, janela, margem);
    const opcoes = fechando && alcancadas.length > 1 ? alcancadas.slice(1) : alcancadas;
    let destino = opcoes[0];
    if (caca && inimigos.length) {
      const longe = celula => Math.min(...inimigos.map(inimigo => distancia(celula, celulaDe(inimigo)))) * 10 + dist[celula];
      for (const celula of opcoes) if (longe(celula) < longe(destino)) destino = celula;
    } else {
      const perto = opcoes.filter(celula => dist[celula] <= 5);
      destino = perto[Math.floor(sorteio() * perto.length)] ?? destino;
    }
    objetivo = destino;
    plano = adotar(caminho(anterior, origem, destino), partida.tempo);
    modo = plano.length ? 'andar' : 'parado';
    return false;
  }

  // With the detonator, a press that cannot drop a bomb sets off the oldest armed remote one. Do it from a cell
  // its blast (chain reactions included) does not reach. With bombs still to drop, a press would drop one
  // instead, so the remote ones wait for their own time.
  function podeDetonar(partida, eu, origem, meio) {
    const minhas = partida.bombas.filter(bomba => bomba.dono === id);
    if (minhas.length < eu.bombasMax) return false;
    const armada = minhas.find(bomba => bomba.remota && !bomba.congelada && AJUSTES.detonadorS - bomba.restante >= AJUSTES.armarDetonadorS);
    if (!armada) return false;
    return livre(mapaDePerigo(partida, [], { eu: id, detonar: armada }), origem, -meio, SEGURO_S, margem);
  }

  // True when the current flight plan, timed from the robot's real position and with its planned waits, still
  // ends somewhere safe without crossing fire. Keeping it avoids switching routes halfway (the search starts
  // from cell centers, the robot rarely is at one).
  function planoServe(partida, eu, perigo, passo) {
    const agora = partida.tempo;
    if (!plano.length || !direcaoEntre(celulaDe(eu), plano[0].celula)) return false;
    const bloqueia = criarBloqueio(partida);
    if (plano.some(({ celula }) => bloqueia(celula))) return false;
    let x = eu.x;
    let y = eu.y;
    let chegada = 0;
    let celula = celulaDe(eu);
    let desde = 0;
    for (const passoDoPlano of plano) {
      const sai = Math.max(chegada, passoDoPlano.apos - agora);
      const falta = Math.abs(x - xDe(passoDoPlano.celula)) + Math.abs(y - yDe(passoDoPlano.celula));
      const entra = sai + Math.max(0, falta - 0.5) * passo;
      if (!livre(perigo, celula, desde, entra, margem)) return false;
      chegada = sai + falta * passo;
      celula = passoDoPlano.celula;
      x = xDe(celula);
      y = yDe(celula);
      desde = entra;
    }
    return livre(perigo, celula, desde, desde + janelaDe(partida), margem);
  }

  function seguir(partida, eu, perigo, passo) {
    const atual = celulaDe(eu);
    while (plano.length && plano[0].celula === atual) plano.shift();
    if (!plano.length) {
      if (modo === 'andar' && sorteio() < ajustes.pausa) pausa = 0.4 + sorteio() * 0.8;
      // Arrived: decide what comes next soon.
      if (modo !== 'parado') relogio = Math.min(relogio, 0.05);
      modo = 'parado';
      return centralizar(eu);
    }
    const { celula: proxima, apos } = plano[0];
    const direcao = direcaoEntre(atual, proxima);
    if (!direcao) {
      // Pushed off the path (for instance, corrected by the rules): plan again.
      plano = [];
      modo = 'parado';
      relogio = Math.min(relogio, 0.05);
      return centralizar(eu);
    }
    // Something now stands in the way (a bomb dropped or kicked there): never walk into it, plan again.
    if (criarBloqueio(partida)(proxima)) {
      plano = [];
      modo = 'parado';
      relogio = 0;
      return PARADO;
    }
    // A planned wait (a flame ahead is still burning): stand in the middle of the cell until it is time.
    if (partida.tempo < apos) return centralizar(eu);
    // When the robot gets into the next cell and out of it, measured from where it really is.
    const falta = Math.abs(eu.x - xDe(proxima)) + Math.abs(eu.y - yDe(proxima));
    const entra = Math.max(0, falta - 0.5) * passo;
    const sai = (falta + 0.5) * passo;
    // Never step into fire that was not in the plan. If waiting here is not safe either, plan again. With no
    // safe way out (inside a remote bomb's reach, say), waiting is worse: only fire already burning stops it.
    const barrada = arriscando ? partida.chamas.has(proxima) : !livre(perigo, proxima, entra, sai, margem);
    if (barrada) {
      if (!livre(perigo, atual, 0, sai, margem)) relogio = 0;
      return PARADO;
    }
    // While calm, do not walk into a blast that showed up after planning.
    if (modo === 'andar' && !livre(perigo, proxima, entra, entra + janelaDe(partida), margem)) {
      plano = [];
      modo = 'parado';
      return centralizar(eu);
    }
    return { d: direcao, d2: DIRECAO.NENHUMA, bomba: false };
  }

  return {
    id,
    nivel: NIVEIS[nivel] ? nivel : 'medio',
    pensar(partida, dt) {
      const eu = partida.jogadores.find(j => j.id === id);
      if (!eu?.vivo || eu.atordoado > 0) return PARADO;
      const perigo = perigoDoPasso(partida, id);
      const passo = 1 / velocidade(eu.tenis);
      relogio -= dt;
      pausa = Math.max(0, pausa - dt);
      if (relogio <= 0) {
        relogio = ajustes.reacao * (0.75 + sorteio() * 0.5);
        if (decidir(partida, eu, perigo, passo)) return { ...PARADO, bomba: true };
      }
      if (gelo) {
        const direcao = gelo;
        gelo = DIRECAO.NENHUMA;
        return { d: direcao, d2: DIRECAO.NENHUMA, bomba: false, gelo: true };
      }
      // Push the crates until the shortcut is taken (a charge is spent).
      if (atravessar.d && partida.tempo < atravessar.ate && eu.atalhos === atravessar.atalhos) {
        return { d: atravessar.d, d2: DIRECAO.NENHUMA, bomba: false, portal: atravessar.d };
      }
      atravessar.d = DIRECAO.NENHUMA;
      // Push until the bomb starts sliding, never after it: following it would walk into its line.
      const [ex, ey] = VETOR[empurrar.d];
      const aindaParada = empurrar.d && partida.bombas.some(b => !b.deslize && b.x === Math.round(eu.x) + ex && b.y === Math.round(eu.y) + ey);
      if (aindaParada && partida.tempo < empurrar.ate && livre(perigo, celulaDe(eu), 0, 0.5, margem)) {
        return { d: empurrar.d, d2: DIRECAO.NENHUMA, bomba: false };
      }
      empurrar.d = DIRECAO.NENHUMA;
      return seguir(partida, eu, perigo, passo);
    },
  };
}
