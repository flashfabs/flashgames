// Generates the golden replays in testes/rts-replays/: four scripted matches of 18,000 ticks (ten minutes of game)
// with combat, orders of every kind, fog and, in the sandbox one, the whole economy (harvesting, building, production,
// spilled charge, gusts), recorded as seed, options and commands, plus the checksums they must give.
// The checksums come from playing the saved JSON back, so the files prove themselves. Run after a deliberate change to
// the simulation (with VERSAO_SIMULACAO bumped when the formats change) and commit the output:
//   node ferramentas/rts/gerar-replays.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { criarSimulacao, passo, agendarComando, somaDeVerificacao, REGRAS_LIVRES, REGRAS_PROTOTIPO } from '../../site/rts/js/sim/simulacao.js';
import { executarReplay, criarGravador } from '../../site/rts/js/sim/replay.js';
import { TIPO_COMANDO, FP, FAIXA, CATEGORIA, criarComando, idDe } from '../../site/rts/js/sim/contratos.js';
import { criarSorteio, sortear } from '../../site/rts/js/sim/matematica.js';
import { gerarMapa, camadasEmTexto } from '../../site/rts/js/sim/mapa.js';
import { motivoPosicaoNaSimulacao } from '../../site/rts/js/sim/construcao.js';
import { cabecaDaFaixa } from '../../site/rts/js/sim/producao.js';
import { dadosExemplo, mapaExemplo } from '../../testes/rts-sim-exemplo.mjs';

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

// One scripted economy order for `jogador` in the sandbox, read from the state like a player reads a snapshot: send
// harvesters to a pile, queue something, place a ready building, set a rally point, attack, cancel, recycle or raise
// a forward post.
function inventarEconomia(sim, sorteio, jogador, seq) {
  const vivas = [];
  for (let i = 0; i < sim.capacidade; i++) if (sim.ativo[i] && sim.time[i] === jogador) vivas.push(i);
  const de = filtro => vivas.filter(filtro);
  const um = lista => lista[sortear(sorteio, lista.length)];
  const t = i => sim.tipos[sim.tipo[i]];
  const ids = lista => lista.map(i => idDe(i, sim.geracao[i]));
  const base = { tick: sim.tick + 1, jogador, seq };
  const produtores = de(i => t(i).categoria === CATEGORIA.PREDIO && sim.obra[i] === 0 && (t(i).produz.length > 0 || t(i).constroi.length > 0));
  const coletores = de(i => t(i).coletor === 1);
  const combatentes = de(i => t(i).categoria === CATEGORIA.UNIDADE && t(i).dano > 0);
  const pilhas = [];
  for (let i = 0; i < sim.capacidade; i++) if (sim.ativo[i] && sim.categoriaPorTipo[sim.tipo[i]] === CATEGORIA.RECURSO && sim.carga[i] > 0) pilhas.push(i);
  // a spot near one of the player's buildings where the kind may stand, or null
  const lugar = tipo => {
    const perto = de(i => t(i).categoria === CATEGORIA.PREDIO);
    if (perto.length === 0) return null;
    for (let tentativa = 0; tentativa < 30; tentativa++) {
      const ancora = um(perto);
      const cx = (sim.x[ancora] >> 10) - 9 + sortear(sorteio, 19);
      const cy = (sim.y[ancora] >> 10) - 9 + sortear(sorteio, 19);
      if (motivoPosicaoNaSimulacao(sim, jogador, tipo, cx, cy) === 0) return { x: cx * FP + 512, y: cy * FP + 512 };
    }
    return null;
  };
  const r = sortear(sorteio, 12);
  if (r < 2 && coletores.length > 0 && pilhas.length > 0) return criarComando({ ...base, tipo: TIPO_COMANDO.COLETAR, unidades: ids(coletores), alvo: ids([um(pilhas)])[0] });
  if (r < 5 && produtores.length > 0) {
    const p = um(produtores);
    const opcoes = [...t(p).produz, ...t(p).constroi];
    return criarComando({ ...base, tipo: TIPO_COMANDO.PRODUZIR, unidades: ids([p]), arg: um(opcoes) });
  }
  if (r < 7) {
    for (const p of produtores) {
      const cabeca = cabecaDaFaixa(sim, p, FAIXA.CONSTRUCAO);
      if (!cabeca.pronta) continue;
      const onde = lugar(cabeca.item);
      if (onde) return criarComando({ ...base, tipo: TIPO_COMANDO.CONSTRUIR, unidades: ids([p]), arg: cabeca.item, ...onde, fila: sortear(sorteio, 3) === 0 ? 1 : 0 });
    }
  }
  if (r === 7 && produtores.length > 0) {
    const alvo = pilhas.length > 0 && sortear(sorteio, 2) === 0 ? ids([um(pilhas)])[0] : -1;
    return criarComando({ ...base, tipo: TIPO_COMANDO.PONTO_DE_ENCONTRO, unidades: ids(produtores), alvo, x: (4 + sortear(sorteio, sim.mapa.largura - 8)) * FP, y: (4 + sortear(sorteio, sim.mapa.altura - 8)) * FP });
  }
  if (r < 10 && combatentes.length > 0) {
    const inimiga = sim.mapa.bases[(jogador + 1) % sim.mapa.bases.length];
    return criarComando({ ...base, tipo: TIPO_COMANDO.ATACAR_MOVENDO, unidades: ids(combatentes), x: inimiga.x * FP + 512, y: inimiga.y * FP + 512 });
  }
  if (r === 10 && produtores.length > 0) return criarComando({ ...base, tipo: TIPO_COMANDO.CANCELAR, unidades: ids([um(produtores)]), x: sortear(sorteio, 2), arg: sortear(sorteio, 3) });
  const equipes = de(i => t(i).ergue.length > 0);
  if (equipes.length > 0) {
    const tipo = t(equipes[0]).ergue[0];
    const onde = lugar(tipo);
    if (onde) return criarComando({ ...base, tipo: TIPO_COMANDO.CONSTRUIR, unidades: ids(equipes), arg: tipo, ...onde });
  }
  const postes = de(i => t(i).nome === 'poste');
  if (postes.length > 2) return criarComando({ ...base, tipo: TIPO_COMANDO.RECICLAR, unidades: ids([um(postes)]) });
  return null;
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
  {
    nome: 'caixa-economia',
    descricao: 'The example sandbox (testes/rts-sim-exemplo.mjs) with its data and map embedded: both players harvest, queue units and buildings, place them, raise a forward post, set rally points, cancel, recycle and attack every 1.5 s, so harvesters die, charge spills, gusts pay and the network grows and breaks.',
    opcoes: (() => {
      const mapa = mapaExemplo();
      return { semente: 5, dados: dadosExemplo(), arquivosMapa: { ...mapa, camadas: camadasEmTexto(mapa.camadas) }, cargaInicial: 3000 };
    })(),
    jogadores: [0, 1],
    intervalo: 45,
    inventar: inventarEconomia,
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
        const comando = (cenario.inventar ?? inventarComando)(sim, sorteio, jogador, seq);
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
  replay.somas = esperado.somas;
  replay.final = esperado.final;
  writeFileSync(`${destino}${cenario.nome}.json`, `${JSON.stringify(replay)}\n`);
  console.log(`${cenario.nome}: ${replay.comandos.length} comandos, final ${esperado.final}, ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
}
