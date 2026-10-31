// The simulation step timed stage by stage, for the measurement tools: it runs ETAPAS_DO_PASSO exactly as passo()
// does and adds each stage's wall time to its group (commands, economy, paths, combat and movement, fog, the rest),
// plus the whole step's wall and CPU time. Wall time suffers when the machine is busy; CPU time much less.
import { ETAPAS_DO_PASSO } from '../../site/rts/js/sim/simulacao.js';

const GRUPOS = Object.freeze({
  classificar: 'comandos',
  comandos: 'comandos',
  missao: 'comandos',
  equipes: 'comandos',
  economia: 'economia',
  obras: 'economia',
  rede: 'economia',
  producao: 'economia',
  derrames: 'economia',
  fantasmas: 'economia',
  caminhos: 'caminhos',
  baldes: 'combateMovimento',
  combate: 'combateMovimento',
  movimento: 'combateMovimento',
  neblina: 'neblina',
});
const NOMES_GRUPOS = ['comandos', 'economia', 'caminhos', 'combateMovimento', 'neblina', 'outros'];

const agora = () => performance.now();
const cpu = () => {
  const { user, system } = process.cpuUsage();
  return (user + system) / 1000;
};

/** A recorder of timed steps: medidor.passo(sim) advances one tick; medidor.tempos holds one list per measure. */
export function criarMedidor() {
  const tempos = { passo: [], cpu: [], ...Object.fromEntries(NOMES_GRUPOS.map(g => [g, []])) };
  const parcial = Object.fromEntries(NOMES_GRUPOS.map(g => [g, 0]));
  function passo(sim) {
    for (const g of NOMES_GRUPOS) parcial[g] = 0;
    const inicio = agora();
    const inicioCpu = cpu();
    sim.tick++;
    sim.eventos.length = 0;
    for (const [nome, etapa] of ETAPAS_DO_PASSO) {
      const t0 = agora();
      etapa(sim);
      parcial[GRUPOS[nome] ?? 'outros'] += agora() - t0;
    }
    tempos.passo.push(agora() - inicio);
    tempos.cpu.push(cpu() - inicioCpu);
    for (const g of NOMES_GRUPOS) tempos[g].push(parcial[g]);
  }
  return { tempos, passo };
}

const ordenar = lista => [...lista].sort((a, b) => a - b);
export const quantil = (lista, q) => +ordenar(lista)[Math.min(lista.length - 1, Math.floor(q * lista.length))].toFixed(2);
export const media = lista => +(lista.reduce((a, b) => a + b, 0) / lista.length).toFixed(3);
export const maximo = lista => +Math.max(...lista).toFixed(2);

/** p50, p99 and max of the step and of the CPU time after `aquecimento` ticks, the worst steps with their groups. */
export function resumir({ tempos }, aquecimento = 30) {
  const depois = lista => lista.slice(aquecimento);
  return {
    passoP50: quantil(tempos.passo, 0.5),
    passoP99: quantil(tempos.passo, 0.99),
    passoMax: maximo(tempos.passo),
    passoMaxDepoisDoAquecimento: maximo(depois(tempos.passo)),
    cpuP50: quantil(tempos.cpu, 0.5),
    cpuP99: quantil(tempos.cpu, 0.99),
    cpuMax: maximo(depois(tempos.cpu)),
    campoMax: maximo(tempos.caminhos),
    campoP99: quantil(tempos.caminhos, 0.99),
    neblinaMedia: media(tempos.neblina),
    neblinaMax: maximo(depois(tempos.neblina)),
    economiaMedia: media(tempos.economia),
    economiaP99: quantil(tempos.economia, 0.99),
    piores: tempos.passo
      .map((ms, k) => [ms, k])
      .slice(aquecimento)
      .sort((a, b) => b[0] - a[0])
      .slice(0, 3)
      .map(([ms, k]) => ({ passo: k + 1, ms: +ms.toFixed(2), ...Object.fromEntries(NOMES_GRUPOS.map(g => [g, +tempos[g][k].toFixed(2)])) })),
  };
}
