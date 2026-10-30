// Units for the renderer: interpolation between the last two simulation snapshots, smoothed body and turret
// angles, culling to the camera and to the fog, packed into the instance buffer.
import { FLOATS_UNIDADE } from './renderizador.js';
import { FP, PASSOS_POR_SEGUNDO, TIPOS } from '../sim/simulacao.js';

const PASSO_MS = 1000 / PASSOS_POR_SEGUNDO;

function suavizarAngulo(atual, alvo, maximo) {
  let d = alvo - atual;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return atual + Math.max(-maximo, Math.min(maximo, d));
}

export function criarMontagemUnidades({ estado, camera, canvas, selecionadas, visivel }) {
  let anguloCorpo = null;
  let anguloTorre = null;
  let buffer = new Float32Array(8192 * FLOATS_UNIDADE);

  function iniciarAngulos(mapa) {
    anguloCorpo = new Float32Array(mapa.time.length);
    anguloTorre = new Float32Array(mapa.time.length);
    for (let i = 0; i < mapa.time.length; i++) anguloCorpo[i] = anguloTorre[i] = mapa.time[i] === 0 ? -Math.PI / 4 : (3 * Math.PI) / 4;
  }

  function montar(agora, dt) {
    const { anterior, atual, mapa } = estado;
    if (!atual || !mapa) return 0;
    const alfa = Math.min(1, (agora - estado.chegadaAtual) / PASSO_MS);
    const total = mapa.time.length;
    if (buffer.length < total * FLOATS_UNIDADE) buffer = new Float32Array(total * FLOATS_UNIDADE);
    const giro = dt * 0.006;
    const margem = 2;
    const meiaL = canvas.width / camera.zoom / 2 + margem;
    const meiaA = canvas.height / camera.zoom / 2 + margem;
    let n = 0;
    for (let i = 0; i < total; i++) {
      if (atual.vida[i] <= 0) continue;
      let x = atual.x[i] / FP;
      let y = atual.y[i] / FP;
      if (anterior && anterior.vida[i] > 0) {
        const px = anterior.x[i] / FP;
        const py = anterior.y[i] / FP;
        if (Math.abs(x - px) < 3 && Math.abs(y - py) < 3) {
          const dx = x - px;
          const dy = y - py;
          if (dx * dx + dy * dy > 0.0004) anguloCorpo[i] = suavizarAngulo(anguloCorpo[i], Math.atan2(dy, dx), giro);
          x = px + dx * alfa;
          y = py + dy * alfa;
        }
      }
      const alvo = atual.alvo[i];
      const alvoTorre = alvo >= 0 ? Math.atan2(atual.y[alvo] - atual.y[i], atual.x[alvo] - atual.x[i]) : anguloCorpo[i];
      anguloTorre[i] = suavizarAngulo(anguloTorre[i], alvoTorre, giro * 1.6);
      if (Math.abs(x - camera.x) > meiaL || Math.abs(y - camera.y) > meiaA) continue;
      if (mapa.time[i] !== 0 && !visivel(x, y)) continue;
      const o = n * FLOATS_UNIDADE;
      buffer[o] = x;
      buffer[o + 1] = y;
      buffer[o + 2] = anguloCorpo[i];
      buffer[o + 3] = anguloTorre[i];
      buffer[o + 4] = mapa.time[i];
      buffer[o + 5] = mapa.tipo[i];
      buffer[o + 6] = atual.vida[i] / TIPOS[mapa.tipo[i]].vida;
      buffer[o + 7] = selecionadas.has(i) ? 1 : 0;
      n++;
    }
    return n;
  }

  return {
    iniciarAngulos,
    montar,
    // the buffer grows with the unit count, so read it after montar()
    get buffer() {
      return buffer;
    },
  };
}
