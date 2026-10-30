// Main-thread side of the simulation worker: starts it, forwards commands and pause, and keeps the last two
// snapshots so the presentation can interpolate between them. The worker protocol lives here and in trabalhador.js.
import { NEBLINA_VISIVEL } from './sim/simulacao.js';

export function criarPonteSimulacao() {
  const estado = { mapa: null, anterior: null, atual: null, chegadaAtual: 0, tickMs: [], soma: 0, tick: 0 };
  let trabalhador = null;

  // Starts the worker; aoReceberMapa gets the static map once, aoReceberEstado every snapshot.
  function iniciar({ semente, unidadesPorTime, avancar, aoReceberMapa, aoReceberEstado }) {
    trabalhador = new Worker(new URL('./trabalhador.js', import.meta.url), { type: 'module' });
    trabalhador.postMessage({ t: 'iniciar', opcoes: { semente, unidadesPorTime, avancar } });
    trabalhador.onmessage = ({ data }) => {
      if (data.t === 'mapa') {
        estado.mapa = data;
        aoReceberMapa(data);
        return;
      }
      if (data.t === 'estado') {
        estado.anterior = estado.atual;
        estado.atual = data;
        estado.chegadaAtual = performance.now();
        estado.tickMs.push(data.ms);
        estado.soma = data.soma;
        estado.tick = data.tick;
        aoReceberEstado(data);
      }
    };
  }

  // Whether a map cell (in cell units, fractional allowed) is visible to the local player in the latest snapshot.
  function visivel(x, y) {
    const m = estado.mapa;
    const atual = estado.atual;
    if (!m || !atual) return false;
    const cx = x | 0;
    const cy = y | 0;
    if (cx < 0 || cy < 0 || cx >= m.largura || cy >= m.altura) return false;
    return atual.neblina[cy * m.largura + cx] === NEBLINA_VISIVEL;
  }

  return {
    estado,
    iniciar,
    visivel,
    enviarComando: comando => trabalhador?.postMessage({ t: 'comando', comando }),
    pausar: valor => trabalhador?.postMessage({ t: 'pausa', valor }),
  };
}
