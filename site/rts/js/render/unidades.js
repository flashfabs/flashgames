// Units for the renderer: interpolation between the last two simulation snapshots, matched by id with generation,
// body and turret facing interpolated along the shortest turn, culling to the camera and to the fog, packed into the
// instance buffer.
import { FLOATS_UNIDADE } from './renderizador.js';
import { FP, PASSOS_POR_SEGUNDO, VOLTA, slotDe } from '../sim/contratos.js';

const PASSO_MS = 1000 / PASSOS_POR_SEGUNDO;
const RADIANOS = (2 * Math.PI) / VOLTA;

// Angle in radians between two integer facings (0..255), along the shortest turn.
function interpolarAngulo(a, b, alfa) {
  const d = ((b - a + 128) & 255) - 128;
  return (a + d * alfa) * RADIANOS;
}

export function criarMontagemUnidades({ estado, camera, canvas, selecionadas, visivel }) {
  let buffer = new Float32Array(8192 * FLOATS_UNIDADE);

  function montar(agora) {
    const { anterior, atual, mapa } = estado;
    if (!atual || !mapa) return 0;
    const alfa = Math.min(1, (agora - estado.chegadaAtual) / PASSO_MS);
    if (buffer.length < atual.n * FLOATS_UNIDADE) buffer = new Float32Array(atual.n * FLOATS_UNIDADE);
    const margem = 2;
    const meiaL = canvas.width / camera.zoom / 2 + margem;
    const meiaA = canvas.height / camera.zoom / 2 + margem;
    let n = 0;
    let j = 0; // walks the previous snapshot alongside the current one, both in slot order
    for (let k = 0; k < atual.n; k++) {
      const id = atual.id[k];
      let x = atual.x[k] / FP;
      let y = atual.y[k] / FP;
      let corpo = atual.dirCorpo[k] * RADIANOS;
      let torre = atual.dirTorre[k] * RADIANOS;
      if (anterior) {
        const slot = slotDe(id);
        while (j < anterior.n && slotDe(anterior.id[j]) < slot) j++;
        if (j < anterior.n && anterior.id[j] === id) {
          const px = anterior.x[j] / FP;
          const py = anterior.y[j] / FP;
          if (Math.abs(x - px) < 3 && Math.abs(y - py) < 3) {
            x = px + (x - px) * alfa;
            y = py + (y - py) * alfa;
          }
          corpo = interpolarAngulo(anterior.dirCorpo[j], atual.dirCorpo[k], alfa);
          torre = interpolarAngulo(anterior.dirTorre[j], atual.dirTorre[k], alfa);
        }
      }
      if (Math.abs(x - camera.x) > meiaL || Math.abs(y - camera.y) > meiaA) continue;
      if (atual.dono[k] !== estado.jogadorLocal && !visivel(x, y)) continue;
      const o = n * FLOATS_UNIDADE;
      buffer[o] = x;
      buffer[o + 1] = y;
      buffer[o + 2] = corpo;
      buffer[o + 3] = torre;
      buffer[o + 4] = atual.dono[k];
      buffer[o + 5] = atual.tipo[k];
      buffer[o + 6] = atual.vida[k] / 255;
      buffer[o + 7] = selecionadas.has(id) ? 1 : 0;
      n++;
    }
    return n;
  }

  return {
    montar,
    // the buffer grows with the unit count, so read it after montar()
    get buffer() {
      return buffer;
    },
  };
}
