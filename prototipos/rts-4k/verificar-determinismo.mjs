// Runs the same scripted match and prints checksums, so different JS engines can be compared:
//   node prototipos/rts-4k/verificar-determinismo.mjs
//   jsc -m prototipos/rts-4k/verificar-determinismo.mjs   (JavaScriptCore, Safari's engine)
import { criarSimulacao, passo, agendarComando, somaDeVerificacao } from './simulacao.js';

const escrever = globalThis.print ?? console.log;
const agora = () => globalThis.performance?.now?.() ?? (globalThis.preciseTime ? globalThis.preciseTime() * 1000 : Date.now());
const motor = globalThis.process?.versions?.v8 ? `V8 ${globalThis.process.versions.v8} (Node ${globalThis.process.version})` : 'JavaScriptCore (jsc)';

const PASSOS = 3600; // two minutes of game time
const sim = criarSimulacao({ semente: 7, unidadesPorTime: 1000 });
const roteiro = [
  { tick: 150, tipo: 'mover', time: 0, unidades: Array.from({ length: 300 }, (_, k) => k * 3), cx: 60, cy: 70 },
  { tick: 900, tipo: 'mover', time: 0, unidades: Array.from({ length: 500 }, (_, k) => k * 2 + 1), cx: 150, cy: 140 },
  { tick: 2100, tipo: 'mover', time: 0, unidades: Array.from({ length: 1000 }, (_, k) => k), cx: 168, cy: 24 },
];
for (const comando of roteiro) agendarComando(sim, comando);

const somas = [];
const inicio = agora();
let maisLento = 0;
for (let k = 0; k < PASSOS; k++) {
  const t0 = agora();
  passo(sim);
  maisLento = Math.max(maisLento, agora() - t0);
  if (sim.tick % 600 === 0) somas.push(somaDeVerificacao(sim).toString(16).padStart(8, '0'));
}
const totalMs = agora() - inicio;
escrever(JSON.stringify({
  motor,
  unidades: sim.total,
  passos: PASSOS,
  somas,
  final: somaDeVerificacao(sim).toString(16).padStart(8, '0'),
  msPorPasso: +(totalMs / PASSOS).toFixed(3),
  passoMaisLentoMs: +maisLento.toFixed(2),
}));
