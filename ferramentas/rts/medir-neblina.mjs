// Measures the fog update with 2,000 units in 4 teams (500 each, one per quadrant) that all march to the far side
// and back, so units change cell all the time; weapons do no damage, so all 2,000 stay alive for the whole run.
// Prints JSON with the mean and worst fog update per tick.
//   node ferramentas/rts/medir-neblina.mjs [ticks=3000]
import { cpus, loadavg } from 'node:os';
import { criarSimulacao, agendarComando, REGRAS_LIVRES, ETAPAS_DO_PASSO } from '../../site/rts/js/sim/simulacao.js';
import { TIPO_COMANDO, FP, criarComando, idDe } from '../../site/rts/js/sim/contratos.js';
import { gerarMapa } from '../../site/rts/js/sim/mapa.js';
import { DADOS_PROTOTIPO } from '../../site/rts/js/sim/dados.js';
import { avancarCaminhos } from '../../site/rts/js/sim/caminhos.js';
import { atualizarNeblina } from '../../site/rts/js/sim/neblina.js';
import { montarBaldes, mover } from '../../site/rts/js/sim/movimento.js';
import { combater } from '../../site/rts/js/sim/combate.js';

const passos = Number(process.argv[2] ?? 3000);
const LADO = 192;
const mapa = gerarMapa(LADO, LADO, 7);
const cantos = [[40, 40], [LADO - 40, 40], [40, LADO - 40], [LADO - 40, LADO - 40]];
const unidades = [];
cantos.forEach(([cx, cy], time) => {
  for (let k = 0; unidades.filter(u => u.time === time).length < 500 && k < 5000; k++) {
    const x = (cx - 15 + (k % 31)) * FP + 512;
    const y = (cy - 15 + Math.trunc(k / 31)) * FP + 512;
    if (!mapa.bloqueado[(y >> 10) * LADO + (x >> 10)]) unidades.push({ tipo: k % 10 < 7 ? 0 : 1, time, x, y });
  }
});
const tipos = DADOS_PROTOTIPO.map(tipo => ({ ...tipo, dano: 0 }));
const sim = criarSimulacao({ mapa: { largura: LADO, altura: LADO, bloqueado: mapa.bloqueado, nivel: mapa.nivel, relevo: mapa.relevo, bases: mapa.bases }, unidades, tipos, regras: REGRAS_LIVRES });

// every team patrols between its corner and the opposite one
for (let time = 0; time < 4; time++) {
  const [ox, oy] = cantos[3 - time];
  const ids = [];
  for (let i = 0; i < sim.capacidade; i++) if (sim.ativo[i] && sim.time[i] === time) ids.push(idDe(i, sim.geracao[i]));
  agendarComando(sim, criarComando({ tick: 1, jogador: time, seq: 0, tipo: TIPO_COMANDO.PATRULHAR, unidades: ids, x: ox * FP, y: oy * FP }));
}

const tempos = [];
for (let k = 0; k < passos; k++) {
  sim.tick++;
  sim.eventos.length = 0;
  ETAPAS_DO_PASSO.find(([nome]) => nome === 'comandos')[1](sim);
  avancarCaminhos(sim.caminhos, sim.expansoesPorPasso);
  montarBaldes(sim);
  combater(sim);
  mover(sim);
  const t0 = performance.now();
  atualizarNeblina(sim);
  tempos.push(performance.now() - t0);
}
const ordenados = [...tempos].sort((a, b) => a - b);
let vivos = 0;
for (let i = 0; i < sim.capacidade; i++) vivos += sim.ativo[i];
console.log(JSON.stringify({
  node: process.version,
  cpu: cpus()[0].model,
  cargaDaMaquina: loadavg().map(v => +v.toFixed(1)),
  unidades: sim.capacidade,
  vivasNoFim: vivos,
  times: sim.times,
  passos,
  neblinaMedia: +(tempos.reduce((a, b) => a + b, 0) / tempos.length).toFixed(3),
  neblinaP99: +ordenados[Math.floor(0.99 * ordenados.length)].toFixed(3),
  neblinaMax: +ordenados.at(-1).toFixed(3),
}));
