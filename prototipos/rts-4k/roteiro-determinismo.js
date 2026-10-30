// The scripted match behind the cross-engine determinism check: the same seed and orders must give the same checksums in every JavaScript engine.
// verificar-determinismo.mjs runs it in Node and jsc, and the Worker of prototipos/diagnostico runs it in browsers.
import { criarSimulacao, passo, agendarComando, somaDeVerificacao } from './simulacao.js';

export const PASSOS = 3600; // two minutes of game time
// Checksums every 600 steps, the same in Node 22, Chromium 151, Firefox 153, WebKit 26.5 and jsc on 30/10/2026.
export const SOMAS_DE_REFERENCIA = ['195ec511', 'dcd7309b', '48b484a1', '52c2673a', '6f05c7da', '897f4ba5'];

const hex = (soma) => soma.toString(16).padStart(8, '0');

export function executarRoteiro(agora) {
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
    if (sim.tick % 600 === 0) somas.push(hex(somaDeVerificacao(sim)));
  }
  const totalMs = agora() - inicio;
  return {
    unidades: sim.total,
    passos: PASSOS,
    somas,
    final: hex(somaDeVerificacao(sim)),
    msPorPasso: +(totalMs / PASSOS).toFixed(3),
    passoMaisLentoMs: +maisLento.toFixed(2),
  };
}
