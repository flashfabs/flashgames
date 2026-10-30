// Debug HUD panel, refreshed every 400 ms: frame rate, CPU per frame, simulation step time, resolution, live units,
// tick and checksum, GPU and atlas, and the click-to-marker latency.
import { percentil } from '../render/medicao.js';

export function criarPainel({ painel, canvas, estado, resolucao, info, atlasInfo }) {
  const campo = nome => painel.querySelector(`[data-campo=${nome}]`);
  let ultimoHud = 0;
  let quadrosHud = [];

  function atualizar(agora, dt, cpu, nVisiveis, cliques) {
    quadrosHud.push(dt);
    if (agora - ultimoHud < 400) return;
    ultimoHud = agora;
    const media = quadrosHud.reduce((a, b) => a + b, 0) / quadrosHud.length;
    const ticks = estado.tickMs.slice(-60);
    const vivos = [0, 0];
    if (estado.atual) for (let k = 0; k < estado.atual.n; k++) vivos[estado.atual.dono[k]]++;
    campo('fps').textContent = `${(1000 / media).toFixed(0)} qps · ${media.toFixed(1)} ms (p95 ${percentil(quadrosHud, 95).toFixed(1)})`;
    campo('cpu').textContent = `${cpu.toFixed(2)} ms CPU no quadro`;
    campo('sim').textContent = `${percentil(ticks, 50).toFixed(2)} ms por passo (p95 ${percentil(ticks, 95).toFixed(2)}) · 30 passos/s`;
    campo('res').textContent = `${canvas.width}×${canvas.height} (${resolucao}, dpr ${window.devicePixelRatio})`;
    campo('unidades').textContent = `${vivos[0]} × ${vivos[1]} vivas · ${nVisiveis} na tela`;
    campo('soma').textContent = `passo ${estado.tick} · soma ${estado.soma.toString(16).padStart(8, '0')} no passo ${estado.tickSoma}`;
    if (cliques?.n) campo('clique').textContent = `clique até a marca: ${cliques.p50.toFixed(0)} ms (p95 ${cliques.p95.toFixed(0)}, máx ${cliques.maximo.toFixed(0)}) · ${cliques.acimaDaMeta} de ${cliques.n} acima de 100 ms`;
    campo('placa').textContent = `${info.placa}${atlasInfo.descricao ? ` · atlas: ${atlasInfo.descricao}` : ''}`;
    quadrosHud = [];
  }

  return { atualizar };
}
