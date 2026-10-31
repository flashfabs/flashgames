// Measures the simulation step with 2,000 units (prototype rules, seed 7) over a scripted match with bursts of 20
// simultaneous orders: p50, p99 and worst step, the worst flow-field slice and the mean fog update. Prints JSON.
// Wall time suffers when the machine is busy (the process gets descheduled), so CPU time per step is reported too;
// run it on a quiet machine for the wall numbers and say which ones a result quotes. The step is timed stage by stage
// by passo-medido.mjs, over the simulation's own list of stages.
// With --retrato it also builds the per-tick snapshot after each step, as the worker does, so the garbage the snapshot
// leaves behind is collected during the steps like in the game. With --caixa the match is the design front's sandbox
// (site/rts/dados/ and its map) with about 2,000 units: both sides' armies, harvesters at work on every node, and the
// starting buildings, so the economy, the network and the ghosts are timed under the same load.
//   node ferramentas/rts/medir-passo.mjs [ticks=9000] [--retrato] [--caixa]
import { cpus, loadavg } from 'node:os';
import { readFileSync } from 'node:fs';
import { criarSimulacao, agendarComando } from '../../site/rts/js/sim/simulacao.js';
import { TIPO_COMANDO, FP, CATEGORIA, EVENTO, MOTIVO, TAMANHO_EVENTO, criarComando, idDe } from '../../site/rts/js/sim/contratos.js';
import { criarEntidade } from '../../site/rts/js/sim/entidades.js';
import { celulaLivreMaisProxima } from '../../site/rts/js/sim/mapa.js';
import { colocarPredio, motivoPosicaoNaSimulacao } from '../../site/rts/js/sim/construcao.js';
import * as simulacao from '../../site/rts/js/sim/simulacao.js';
import { montarRetrato } from '../../site/rts/js/sim/retrato.js';
import { criarMedidor, resumir, media, quantil } from './passo-medido.mjs';

const passos = Number(process.argv.find(a => /^\d+$/.test(a)) ?? 9000);
const comRetrato = process.argv.includes('--retrato');
const naCaixa = process.argv.includes('--caixa');
const sim = naCaixa ? caixaCheia() : criarSimulacao({ semente: 7, unidadesPorTime: 1000 });

// The sandbox with ~1,000 units per side: 50 harvesters by the base sent to the pile nearest it, a depot by that pile
// (the Religadores start without one), and the rest of the army a third of the way to the centre, about one unit per
// cell, as the prototype spreads its armies.
function caixaCheia() {
  const ler = caminho => readFileSync(new URL(`../../site/rts/dados/${caminho}`, import.meta.url));
  const json = caminho => JSON.parse(ler(caminho).toString('utf8'));
  const dados = Object.fromEntries(['unidades', 'predios', 'economia', 'pesquisas', 'armas'].map(nome => [nome, json(`${nome}.json`)]));
  const pasta = 'mapas/caixa-de-areia/';
  const cabecalho = json(`${pasta}mapa.json`);
  const arquivosMapa = { cabecalho, camadas: new Uint8Array(ler(pasta + cabecalho.camadas.arquivo)), entidades: json(`${pasta}entidades.json`) };
  const caixa = criarSimulacao({ dados, arquivosMapa, capacidade: 2600, cargaInicial: 100000 });
  const deTipo = filtro => caixa.tipos.map((t, k) => [t, k]).filter(([t]) => filtro(t));
  const { largura } = caixa.grade;
  const colocar = (tipo, time, cx, cy) => {
    const celula = celulaLivreMaisProxima(caixa.grade, cx, cy);
    if (celula >= 0) criarEntidade(caixa, tipo, time, (celula % largura) * FP + 512, Math.trunc(celula / largura) * FP + 512, 64);
  };
  const centro = { x: caixa.mapa.largura >> 1, y: caixa.mapa.altura >> 1 };
  for (let time = 0; time < 2; time++) {
    const base = caixa.mapa.bases[time];
    const faccao = caixa.faccoes[time];
    const exercito = deTipo(t => t.faccao === faccao && t.categoria === CATEGORIA.UNIDADE && t.dano > 0);
    const coleta = deTipo(t => t.faccao === faccao && t.coletor === 1);
    let pilha = -1;
    const distancia = i => Math.abs(caixa.x[i] - base.x * FP) + Math.abs(caixa.y[i] - base.y * FP);
    for (let i = 0; i < caixa.capacidade; i++) if (caixa.ativo[i] && caixa.categoriaPorTipo[caixa.tipo[i]] === CATEGORIA.RECURSO && (pilha < 0 || distancia(i) < distancia(pilha))) pilha = i;
    const deposito = deTipo(t => t.faccao === faccao && t.deposito === 1 && t.categoria === CATEGORIA.PREDIO && t.custo > 0)[0];
    const px = caixa.x[pilha] >> 10;
    const py = caixa.y[pilha] >> 10;
    for (let r = 3; r < 12 && deposito; r++) {
      const cx = px + (base.x < px ? -r : r);
      if (cabeDeposito(caixa, deposito[1], cx, py)) {
        colocarPredio(caixa, deposito[1], time, cx, py);
        break;
      }
    }
    for (let k = 0; k < 50; k++) colocar(coleta[k % coleta.length][1], time, base.x - 3 + (k % 7), base.y - 3 + Math.trunc(k / 7));
    const frente = { x: base.x + Math.trunc((centro.x - base.x) / 3), y: base.y + Math.trunc((centro.y - base.y) / 3) };
    for (let k = 0; k < 950; k++) colocar(exercito[k % exercito.length][1], time, frente.x - 15 + (k % 31), frente.y - 15 + Math.trunc(k / 31));
    const ids = [];
    for (let i = 0; i < caixa.capacidade; i++) if (caixa.ativo[i] && caixa.time[i] === time && caixa.coletorPorTipo[caixa.tipo[i]]) ids.push(idDe(i, caixa.geracao[i]));
    agendarComando(caixa, criarComando({ tick: 1, jogador: time, seq: 0, tipo: TIPO_COMANDO.COLETAR, unidades: ids, alvo: idDe(pilha, caixa.geracao[pilha]) }));
  }
  return caixa;
}
// A spot a benchmark depot may take: free ground, inside the building area or not (the Desligados have none).
function cabeDeposito(caixa, tipo, cx, cy) {
  const motivo = motivoPosicaoNaSimulacao(caixa, 0, tipo, cx, cy);
  return motivo === 0 || motivo === MOTIVO.FORA_DA_AREA;
}

const medidor = criarMedidor();
let entregas = 0;
const tempoRetrato = [];

function ordensEmRajada() {
  const { largura, altura, bloqueado } = sim.mapa;
  const minhas = [];
  for (let i = 0; i < sim.capacidade; i++) if (sim.ativo[i] && sim.time[i] === 0 && !sim.coletorPorTipo[sim.tipo[i]] && sim.categoriaPorTipo[sim.tipo[i]] === CATEGORIA.UNIDADE) minhas.push(idDe(i, sim.geracao[i]));
  const porGrupo = Math.max(1, Math.trunc(minhas.length / 20));
  for (let g = 0; g < 20; g++) {
    let cx = 10 + ((g * 37 + sim.tick) % (largura - 20));
    let cy = 10 + ((g * 53 + sim.tick * 3) % (altura - 20));
    while (bloqueado[cy * largura + cx]) cx = 10 + ((cx + 7) % (largura - 20));
    agendarComando(sim, criarComando({ tick: sim.tick + 1, jogador: 0, seq: sim.tick * 20 + g, tipo: g % 2 ? TIPO_COMANDO.MOVER : TIPO_COMANDO.ATACAR_MOVENDO, unidades: minhas.slice(g * porGrupo, (g + 1) * porGrupo), x: cx * FP, y: cy * FP }));
  }
}

for (let k = 0; k < passos; k++) {
  if ((sim.tick + 1) % 900 === 0) ordensEmRajada();
  medidor.passo(sim);
  for (let e = 0; e < sim.eventos.length; e += TAMANHO_EVENTO) if (sim.eventos[e] === EVENTO.DESCARGA) entregas++;
  if (comRetrato) {
    const r0 = performance.now();
    montarRetrato(sim, { soma: simulacao.somaDeVerificacao(sim) });
    tempoRetrato.push(performance.now() - r0);
  }
}

console.log(JSON.stringify({
  node: process.version,
  cpu: cpus()[0].model,
  cargaDaMaquina: loadavg().map(v => +v.toFixed(1)),
  unidades: sim.capacidade,
  passos,
  ...resumir(medidor),
  cenario: naCaixa ? 'caixa-de-areia' : 'prototipo',
  entregas,
  // harvesters by task (estado.js TAREFA) at the end
  tarefas: (() => {
    const contagem = {};
    for (let i = 0; i < sim.capacidade; i++) if (sim.ativo[i] && sim.coletorPorTipo[sim.tipo[i]]) contagem[sim.tarefa[i]] = (contagem[sim.tarefa[i]] ?? 0) + 1;
    return contagem;
  })(),
  ...(comRetrato ? { retratoMedia: media(tempoRetrato), retratoP99: quantil(tempoRetrato, 0.99) } : {}),
}));
