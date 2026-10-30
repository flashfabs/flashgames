// Measures the simulation step with 2,000 units (prototype rules, seed 7) over a scripted match with bursts of 20
// simultaneous orders: p50, p99 and worst step, the worst flow-field slice and the mean fog update. Prints JSON.
// Wall time suffers when the machine is busy (the process gets descheduled), so CPU time per step is reported too;
// run it on a quiet machine for the wall numbers and say which ones a result quotes.
//   node ferramentas/rts/medir-passo.mjs [ticks=9000]
import { cpus, loadavg } from 'node:os';
import { criarSimulacao, agendarComando } from '../../site/rts/js/sim/simulacao.js';
import { TIPO_COMANDO, FP, criarComando, idDe } from '../../site/rts/js/sim/contratos.js';
import { avancarCaminhos } from '../../site/rts/js/sim/caminhos.js';
import { atualizarNeblina } from '../../site/rts/js/sim/neblina.js';
import { montarBaldes, mover } from '../../site/rts/js/sim/movimento.js';
import { combater } from '../../site/rts/js/sim/combate.js';
import * as simulacao from '../../site/rts/js/sim/simulacao.js';

const passos = Number(process.argv[2] ?? 9000);
const sim = criarSimulacao({ semente: 7, unidadesPorTime: 1000 });

// the step, unrolled so each part can be timed (same order as passo())
const internos = simulacao.__internos;
const tempos = { passo: [], cpu: [], caminhos: [], neblina: [] };
const agora = () => performance.now();
const cpu = () => {
  const { user, system } = process.cpuUsage();
  return (user + system) / 1000;
};

function ordensEmRajada() {
  const { largura, altura, bloqueado } = sim.mapa;
  const minhas = [];
  for (let i = 0; i < sim.capacidade; i++) if (sim.ativo[i] && sim.time[i] === 0) minhas.push(idDe(i, sim.geracao[i]));
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
  const inicio = agora();
  const inicioCpu = cpu();
  sim.tick++;
  sim.eventos.length = 0;
  internos.aplicarComandos(sim);
  internos.conduzirComputador(sim);
  internos.renascer(sim);
  const c0 = agora();
  avancarCaminhos(sim.caminhos, sim.expansoesPorPasso);
  tempos.caminhos.push(agora() - c0);
  montarBaldes(sim);
  combater(sim);
  mover(sim);
  const n0 = agora();
  atualizarNeblina(sim);
  tempos.neblina.push(agora() - n0);
  tempos.passo.push(agora() - inicio);
  tempos.cpu.push(cpu() - inicioCpu);
}

const ordenar = lista => [...lista].sort((a, b) => a - b);
const quantil = (lista, q) => +ordenar(lista)[Math.min(lista.length - 1, Math.floor(q * lista.length))].toFixed(2);
const media = lista => +(lista.reduce((a, b) => a + b, 0) / lista.length).toFixed(3);
console.log(JSON.stringify({
  node: process.version,
  cpu: cpus()[0].model,
  cargaDaMaquina: loadavg().map(v => +v.toFixed(1)),
  unidades: sim.capacidade,
  passos,
  passoP50: quantil(tempos.passo, 0.5),
  passoP99: quantil(tempos.passo, 0.99),
  passoMax: +Math.max(...tempos.passo).toFixed(2),
  passoMaxDepoisDoAquecimento: +Math.max(...tempos.passo.slice(30)).toFixed(2),
  cpuP50: quantil(tempos.cpu, 0.5),
  cpuP99: quantil(tempos.cpu, 0.99),
  cpuMax: +Math.max(...tempos.cpu.slice(30)).toFixed(2),
  campoMax: +Math.max(...tempos.caminhos).toFixed(2),
  campoP99: quantil(tempos.caminhos, 0.99),
  neblinaMedia: media(tempos.neblina),
}));
