// Measures the engine on a mission-sized map: loading (data compile, C6 read, match start), whole flow fields for
// every place of the map in both movement classes, the fog, the team view (C4) the behaviours read, the step, and save
// and load with the same checksums, at the mission's scale and at a stress scale. Prints one JSON line.
// The map is the design front's when `--mapa <id>` names one in site/rts/dados/mapas/ (its mission rides along when
// site/rts/dados/missoes/<id>.json exists), else the 128 x 96 stand-in of mapa-128.mjs.
//   node ferramentas/rts/medir-mapa.mjs [--mapa <id>] [--passos 3000]
import { cpus, loadavg } from 'node:os';
import { existsSync, readFileSync } from 'node:fs';
import { criarSimulacao, agendarComando, somaDeVerificacao } from '../../site/rts/js/sim/simulacao.js';
import { TIPO_COMANDO, FP, CATEGORIA, criarComando, idDe } from '../../site/rts/js/sim/contratos.js';
import { compilarDados } from '../../site/rts/js/sim/dados.js';
import { lerMapaDeArquivos, celulaLivreMaisProxima } from '../../site/rts/js/sim/mapa.js';
import { criarCaminhos, pedirCampo, avancarCaminhos, CLASSE_CAMPO, EXPANSOES_POR_PASSO } from '../../site/rts/js/sim/caminhos.js';
import { criarEntidade } from '../../site/rts/js/sim/entidades.js';
import { vistaDoTime } from '../../site/rts/js/sim/vista.js';
import { salvar, carregar } from '../../site/rts/js/sim/persistencia.js';
import { mapa128 } from './mapa-128.mjs';
import { criarMedidor, resumir, media, maximo } from './passo-medido.mjs';

const argumento = (nome, padrao) => {
  const k = process.argv.indexOf(nome);
  return k >= 0 ? process.argv[k + 1] : padrao;
};
const idMapa = argumento('--mapa', null);
const passos = Number(argumento('--passos', 3000));
const dadosUrl = new URL('../../site/rts/dados/', import.meta.url);
const lerJson = url => JSON.parse(readFileSync(url, 'utf8'));
const arquivosDados = () => Object.fromEntries(['unidades', 'predios', 'economia', 'pesquisas', 'armas'].map(nome => [nome, lerJson(new URL(`${nome}.json`, dadosUrl))]));

function arquivosDoMapa() {
  if (!idMapa) return mapa128();
  const pasta = new URL(`mapas/${idMapa}/`, dadosUrl);
  const cabecalho = lerJson(new URL('mapa.json', pasta));
  return { cabecalho, camadas: new Uint8Array(readFileSync(new URL(cabecalho.camadas.arquivo, pasta))), entidades: lerJson(new URL('entidades.json', pasta)) };
}
const urlMissao = idMapa ? new URL(`missoes/${idMapa}.json`, dadosUrl) : null;
const missao = urlMissao && existsSync(urlMissao) ? lerJson(urlMissao) : null;

const agora = () => performance.now();
const cronometrar = (vezes, fn) => {
  const tempos = [];
  let resultado;
  for (let k = 0; k < vezes; k++) {
    const t0 = agora();
    resultado = fn();
    tempos.push(agora() - t0);
  }
  return { resultado, media: media(tempos), max: maximo(tempos) };
};

// Loading, as the worker does it: compile the data, read the map files, start the match.
const arquivos = arquivosDoMapa();
const carga = {
  dados: cronometrar(5, () => compilarDados(arquivosDados())),
  mapa: cronometrar(5, () => lerMapaDeArquivos(arquivos, compilarDados(arquivosDados()))),
  partida: cronometrar(5, () => criarSimulacao({ dados: arquivosDados(), arquivosMapa: arquivos, missao, dificuldade: 'normal' })),
};
const novaPartida = capacidade => criarSimulacao({ dados: arquivosDados(), arquivosMapa: arquivos, missao, dificuldade: 'normal', capacidade, cargaInicial: missao ? undefined : 2000 });

// Whole fields to every place of the map (bases, nodes, points, route ends) in both classes, one at a time, on the
// match's grid (terrain plus the starting footprints): heap pops, ticks at the per-tick budget, wall time.
function medirCampos(sim) {
  const { largura } = sim.grade;
  const destinos = new Set();
  const lugar = (x, y) => {
    const c = celulaLivreMaisProxima(sim.grade, x, y);
    if (c >= 0) destinos.add(c);
  };
  for (const base of sim.mapa.bases) lugar(base.x, base.y);
  for (const no of sim.mapa.nos ?? []) lugar(no.x, no.y);
  const lugares = sim.opcoes.lugares ?? {};
  for (const [x, y] of Object.values(lugares.pontos ?? {})) lugar(x, y);
  for (const rota of Object.values(lugares.rotas ?? {})) lugar(...rota.at(-1));
  const resultado = {};
  for (const [nome, classe] of Object.entries(CLASSE_CAMPO)) {
    const cam = criarCaminhos(sim.grade, 1);
    // the toll the match uses around rock and pinches
    cam.custoEntrada.set(sim.caminhos.custoEntrada);
    cam.custoVeiculo.set(sim.caminhos.custoVeiculo);
    const expansoes = [];
    const passosPorCampo = [];
    const ms = [];
    let celulasAlcancadas = 0;
    for (const destino of destinos) {
      const e = pedirCampo(cam, destino, 0, classe);
      const t0 = agora();
      let n = 0;
      while (!cam.pronto[e]) {
        avancarCaminhos(cam, EXPANSOES_POR_PASSO);
        n++;
      }
      ms.push(agora() - t0);
      expansoes.push(cam.expansoes[e]);
      passosPorCampo.push(n);
      celulasAlcancadas = Math.max(celulasAlcancadas, cam.dist[e].filter(d => d !== 0x7fffffff).length);
      cam.destino[e] = -1;
    }
    resultado[nome.toLowerCase()] = { campos: destinos.size, expansoesMax: Math.max(...expansoes), passosMax: Math.max(...passosPorCampo), msMedia: media(ms), msMax: maximo(ms), celulasAlcancadas, celulas: largura * sim.grade.altura };
  }
  return resultado;
}

// Each side's army spread around its base, plus harvesters on the nearest pile; then bursts of orders across the map
// every 30 s for both sides, as a busy mission moment would give.
function povoar(sim, porTime) {
  const { largura } = sim.grade;
  for (let time = 0; time < Math.min(2, sim.times); time++) {
    const base = sim.mapa.bases[time];
    const faccao = sim.faccoes[time];
    const exercito = sim.tipos.map((t, k) => [t, k]).filter(([t]) => t.faccao === faccao && t.categoria === CATEGORIA.UNIDADE && t.dano > 0);
    for (let k = 0; k < porTime; k++) {
      const lado = Math.ceil(Math.sqrt(porTime));
      const c = celulaLivreMaisProxima(sim.grade, base.x - (lado >> 1) + (k % lado), base.y - (lado >> 1) + Math.trunc(k / lado));
      if (c >= 0) criarEntidade(sim, exercito[k % exercito.length][1], time, (c % largura) * FP + 512, Math.trunc(c / largura) * FP + 512, 64);
    }
  }
}

function ordensEmRajada(sim, rodada) {
  const { largura, altura, bloqueado } = sim.grade;
  for (let time = 0; time < Math.min(2, sim.times); time++) {
    const minhas = [];
    for (let i = 0; i < sim.capacidade; i++) if (sim.ativo[i] && sim.time[i] === time && sim.categoriaPorTipo[sim.tipo[i]] === CATEGORIA.UNIDADE) minhas.push(idDe(i, sim.geracao[i]));
    const grupos = 10;
    const porGrupo = Math.max(1, Math.ceil(minhas.length / grupos));
    for (let g = 0; g < grupos; g++) {
      let cx = 4 + ((g * 37 + rodada * 11 + time * 53) % (largura - 8));
      let cy = 4 + ((g * 53 + rodada * 29 + time * 17) % (altura - 8));
      while (bloqueado[cy * largura + cx]) cx = 4 + ((cx + 7) % (largura - 8));
      const tipo = g % 2 ? TIPO_COMANDO.MOVER : TIPO_COMANDO.ATACAR_MOVENDO;
      agendarComando(sim, criarComando({ tick: sim.tick + 1, jogador: time, seq: rodada * 64 + g, tipo, unidades: minhas.slice(g * porGrupo, (g + 1) * porGrupo), x: cx * FP + 512, y: cy * FP + 512 }));
    }
  }
}

function medirEscala(porTime) {
  const sim = novaPartida(2 * porTime + 1100);
  povoar(sim, porTime);
  const medidor = criarMedidor();
  const vistas = [];
  for (let k = 0; k < passos; k++) {
    if (k % 900 === 0) ordensEmRajada(sim, k / 900);
    medidor.passo(sim);
    // the view a behaviour reads, as often as a team decides
    if (k % 10 === 1) {
      const t0 = agora();
      vistaDoTime(sim, 1);
      vistas.push(agora() - t0);
    }
  }
  let vivas = 0;
  for (let i = 0; i < sim.capacidade; i++) if (sim.ativo[i]) vivas++;
  // save and load at the end of the run, and both go on together
  const s0 = agora();
  const bytes = salvar(sim);
  const msSalvar = agora() - s0;
  const c0 = agora();
  const carregada = carregar(bytes);
  const msCarregar = agora() - c0;
  for (let k = 0; k < 300; k++) {
    if (k === 150) {
      ordensEmRajada(sim, 99);
      ordensEmRajada(carregada, 99);
    }
    medidor.passo(sim);
    criarMedidor().passo(carregada);
  }
  return {
    porTime,
    entidadesVivas: vivas,
    ...resumir(medidor),
    vistaMedia: media(vistas),
    vistaMax: maximo(vistas),
    salvar: { bytes: bytes.byteLength, ms: +msSalvar.toFixed(1), msCarregar: +msCarregar.toFixed(1), somasIguaisDepoisDe300Passos: somaDeVerificacao(carregada) === somaDeVerificacao(sim) },
  };
}

const referencia = novaPartida();
console.log(JSON.stringify({
  node: process.version,
  cpu: cpus()[0].model,
  cargaDaMaquina: loadavg().map(v => +v.toFixed(1)),
  mapa: arquivos.cabecalho.id,
  largura: arquivos.cabecalho.largura,
  altura: arquivos.cabecalho.altura,
  missao: missao ? idMapa : null,
  bytesCamadas: arquivos.camadas.byteLength,
  carregar: { dadosMs: carga.dados.media, mapaMs: carga.mapa.media, partidaMs: carga.partida.media, partidaMax: carga.partida.max },
  campos: medirCampos(referencia),
  missaoEscala: medirEscala(150),
  estresse: medirEscala(1000),
}));
