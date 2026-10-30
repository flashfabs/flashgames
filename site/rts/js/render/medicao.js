// Automated benchmark (?bench=1&seg=N): after a warm-up the camera orbits the centre of the map while frame times,
// CPU time per frame and simulation step times are collected; the result lands in window.__bench and on the page.
import { PASSOS_POR_SEGUNDO } from '../sim/simulacao.js';

export function percentil(lista, p) {
  if (lista.length === 0) return 0;
  const ordenada = [...lista].sort((a, b) => a - b);
  return ordenada[Math.min(ordenada.length - 1, Math.floor((p / 100) * ordenada.length))];
}

export function criarMedicao({ ativa, segundos, estado, camera, canvas, info, atlasInfo, saida }) {
  const medidas = { quadros: [], cpu: [], inicioBench: 0, fimBench: 0, coletando: false };

  function conduzir(agora) {
    if (!ativa || !estado.mapa) return;
    if (!medidas.inicioBench) {
      medidas.inicioBench = agora + 4000; // warm-up: armies reach the centre and the JIT settles
      medidas.fimBench = medidas.inicioBench + segundos * 1000;
    }
    const t = (agora - medidas.inicioBench) / 1000;
    const centroX = estado.mapa.largura / 2;
    const centroY = estado.mapa.altura / 2;
    camera.x = centroX + Math.cos(t * 0.5) * 10;
    camera.y = centroY + Math.sin(t * 0.5) * 7;
    medidas.coletando = agora >= medidas.inicioBench && agora < medidas.fimBench;
    if (agora >= medidas.fimBench && !window.__bench) {
      const q = medidas.quadros;
      const ticks = estado.tickMs.slice(-Math.round(segundos * PASSOS_POR_SEGUNDO));
      window.__bench = {
        resolucao: `${canvas.width}x${canvas.height}`,
        unidades: estado.mapa.time.length,
        placa: info.placa,
        quadros: q.length,
        qpsMedio: +(1000 / (q.reduce((a, b) => a + b, 0) / q.length)).toFixed(1),
        quadroP50: +percentil(q, 50).toFixed(2),
        quadroP95: +percentil(q, 95).toFixed(2),
        quadroP99: +percentil(q, 99).toFixed(2),
        quadrosAcimaDe20ms: q.filter(v => v > 20).length,
        cpuQuadroP50: +percentil(medidas.cpu, 50).toFixed(2),
        cpuQuadroP95: +percentil(medidas.cpu, 95).toFixed(2),
        passoSimP50: +percentil(ticks, 50).toFixed(2),
        passoSimP95: +percentil(ticks, 95).toFixed(2),
        atlas: Boolean(atlasInfo.descricao),
      };
      saida.hidden = false;
      saida.textContent = JSON.stringify(window.__bench, null, 2);
    }
  }

  function registrarQuadro(dt, cpu) {
    if (!medidas.coletando) return;
    medidas.quadros.push(dt);
    medidas.cpu.push(cpu);
  }

  return { conduzir, registrarQuadro };
}
