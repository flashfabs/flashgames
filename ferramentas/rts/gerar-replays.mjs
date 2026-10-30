// Generates the golden replays in testes/rts-replays/: three scripted matches of 18,000 ticks (ten minutes of game)
// with combat, orders of every kind and fog, recorded as seed, options and commands, plus the checksums they must give.
// The checksums come from playing the saved JSON back, so the files prove themselves. Run after a deliberate change to
// the simulation (with VERSAO_SIMULACAO bumped when the formats change) and commit the output:
//   node ferramentas/rts/gerar-replays.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { criarSimulacao, passo, agendarComando, somaDeVerificacao, REGRAS_LIVRES, REGRAS_PROTOTIPO } from '../../site/rts/js/sim/simulacao.js';
import { executarReplay, criarGravador } from '../../site/rts/js/sim/replay.js';
import { TIPO_COMANDO, FP, criarComando, idDe } from '../../site/rts/js/sim/contratos.js';
import { criarSorteio, sortear } from '../../site/rts/js/sim/matematica.js';
import { gerarMapa } from '../../site/rts/js/sim/mapa.js';

const PASSOS = 18000;
const A_CADA = 600;
const destino = fileURLToPath(new URL('../../testes/rts-replays/', import.meta.url));

// Command kinds the scripted players use, with weights.
const CARDAPIO = [
  [TIPO_COMANDO.MOVER, 4],
  [TIPO_COMANDO.ATACAR_MOVENDO, 4],
  [TIPO_COMANDO.PATRULHAR, 1],
  [TIPO_COMANDO.ATACAR, 2],
  [TIPO_COMANDO.PARAR, 1],
  [TIPO_COMANDO.SEGURAR_POSICAO, 1],
];

function escolherTipo(sorteio) {
  const total = CARDAPIO.reduce((s, [, peso]) => s + peso, 0);
  let n = sortear(sorteio, total);
  for (const [tipo, peso] of CARDAPIO) {
    if (n < peso) return tipo;
    n -= peso;
  }
  return TIPO_COMANDO.MOVER;
}

// One scripted order for `jogador`, read from the state after the previous tick, as a player would from a snapshot.
function inventarComando(sim, sorteio, jogador, seq) {
  const minhas = [];
  const inimigas = [];
  for (let i = 0; i < sim.capacidade; i++) {
    if (!sim.ativo[i]) continue;
    (sim.time[i] === jogador ? minhas : inimigas).push(i);
  }
  if (minhas.length === 0) return null;
  // a contiguous run of the player's units, like a box selection
  const quantos = Math.min(minhas.length, 10 + sortear(sorteio, 110));
  const inicio = sortear(sorteio, minhas.length - quantos + 1);
  const unidades = minhas.slice(inicio, inicio + quantos).map(i => idDe(i, sim.geracao[i]));
  const tipo = escolherTipo(sorteio);
  const { largura, altura, bloqueado } = sim.mapa;
  let x = 0;
  let y = 0;
  for (let tentativa = 0; tentativa < 50; tentativa++) {
    const cx = 2 + sortear(sorteio, largura - 4);
    const cy = 2 + sortear(sorteio, altura - 4);
    if (bloqueado[cy * largura + cx]) continue;
    x = cx * FP + sortear(sorteio, FP);
    y = cy * FP + sortear(sorteio, FP);
    break;
  }
  const alvo = tipo === TIPO_COMANDO.ATACAR && inimigas.length > 0 ? inimigas[sortear(sorteio, inimigas.length)] : -1;
  return criarComando({
    tick: sim.tick + 1,
    jogador,
    seq,
    tipo: alvo < 0 && tipo === TIPO_COMANDO.ATACAR ? TIPO_COMANDO.ATACAR_MOVENDO : tipo,
    unidades,
    alvo: alvo >= 0 ? idDe(alvo, sim.geracao[alvo]) : -1,
    x,
    y,
    fila: sortear(sorteio, 5) === 0 ? 1 : 0,
  });
}

// Units of `times` teams spread around one open spot each, for the free-rules scenario.
function exercitosLivres(semente, largura, altura, times, porTime) {
  const mapa = gerarMapa(largura, altura, semente);
  const sorteio = criarSorteio(semente ^ 0x5bd1e995);
  const unidades = [];
  for (let t = 0; t < times; t++) {
    let cx;
    let cy;
    do {
      cx = 20 + sortear(sorteio, largura - 40);
      cy = 20 + sortear(sorteio, altura - 40);
    } while (mapa.bloqueado[cy * largura + cx]);
    for (let k = 0; k < porTime; k++) {
      const x = (cx - 6 + sortear(sorteio, 13)) * FP + sortear(sorteio, FP);
      const y = (cy - 6 + sortear(sorteio, 13)) * FP + sortear(sorteio, FP);
      if (mapa.bloqueado[(y >> 10) * largura + (x >> 10)]) continue;
      unidades.push({ tipo: k % 10 < 7 ? 0 : 1, time: t, x, y });
    }
  }
  return { largura, altura, unidades };
}

const CENARIOS = [
  {
    nome: 'prototipo-um-comandante',
    descricao: 'Prototype rules (respawn, computer waves, team default orders) with 2 x 300 units on seed 7; player 0 gives an order every 10 s.',
    opcoes: { semente: 7, unidadesPorTime: 300, regras: REGRAS_PROTOTIPO },
    jogadores: [0],
    intervalo: 300,
  },
  {
    nome: 'prototipo-dois-comandantes',
    descricao: 'Prototype rules with 2 x 400 units on seed 11; both players give orders on the same ticks every 15 s, testing the (jogador, seq) order.',
    opcoes: { semente: 11, unidadesPorTime: 400, regras: REGRAS_PROTOTIPO },
    jogadores: [1, 0],
    intervalo: 450,
  },
  {
    nome: 'livre-tres-times',
    descricao: 'Free rules plus respawn on a 160 x 160 map of seed 23 with three teams of about 200 units and fog for each; the three players give orders every 12 s.',
    opcoes: (() => {
      const { largura, altura, unidades } = exercitosLivres(23, 160, 160, 3, 200);
      return { semente: 23, largura, altura, unidades, regras: { ...REGRAS_LIVRES, renascer: true, esperaRenascer: 150 } };
    })(),
    jogadores: [2, 0, 1],
    intervalo: 360,
  },
];

mkdirSync(destino, { recursive: true });
for (const cenario of CENARIOS) {
  const inicio = Date.now();
  const sim = criarSimulacao(cenario.opcoes);
  const gravador = criarGravador(cenario.opcoes);
  const sorteio = criarSorteio(0x2f6b3a1d ^ cenario.opcoes.semente);
  const seqs = new Map();
  for (let k = 0; k < PASSOS; k++) {
    if ((sim.tick + 1) % cenario.intervalo === 0) {
      for (const jogador of cenario.jogadores) {
        const seq = seqs.get(jogador) ?? 0;
        const comando = inventarComando(sim, sorteio, jogador, seq);
        if (!comando) continue;
        seqs.set(jogador, seq + 1);
        agendarComando(sim, comando);
        gravador.registrar(comando);
      }
    }
    passo(sim);
  }
  const replay = { nome: cenario.nome, descricao: cenario.descricao, aCada: A_CADA, ...gravador.replay(PASSOS) };
  const esperado = executarReplay(JSON.parse(JSON.stringify(replay)));
  const original = somaDeVerificacao(sim).toString(16).padStart(8, '0');
  if (esperado.final !== original) throw new Error(`${cenario.nome}: o replay deu ${esperado.final}, a partida original ${original}`);
  replay.esperado = esperado;
  writeFileSync(`${destino}${cenario.nome}.json`, `${JSON.stringify(replay)}\n`);
  console.log(`${cenario.nome}: ${replay.comandos.length} comandos, final ${esperado.final}, ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
}
