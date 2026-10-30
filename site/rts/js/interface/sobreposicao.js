// SVG layer over the canvas with the queued points of the selected units: a dot per point and a line between them,
// colored by order kind, so Shift-queued orders are visible on the ground. Redrawn every frame from a cheap string,
// and the DOM is touched only when that string changes.
import { TIPO_COMANDO } from '../sim/contratos.js';
import { paraTela } from '../entrada/camera.js';

const CORES = {
  [TIPO_COMANDO.MOVER]: '#6dff8a',
  [TIPO_COMANDO.ATACAR]: '#ff6a4d',
  [TIPO_COMANDO.ATACAR_MOVENDO]: '#ff6a4d',
  [TIPO_COMANDO.PATRULHAR]: '#5ab8ff',
};

export function criarSobreposicao({ svg, canvas, camera, fila, selecionadas }) {
  let anterior = '';
  const p = { x: 0, y: 0 };

  function desenhar() {
    const caixa = svg.getBoundingClientRect();
    const partes = [];
    for (const rota of fila.rotas(selecionadas)) {
      const pontos = rota.map(ponto => {
        paraTela(canvas, camera, ponto.x, ponto.y, p);
        return { x: Math.round(p.x - caixa.left), y: Math.round(p.y - caixa.top), cor: CORES[ponto.tipo] ?? '#ffffff' };
      });
      for (let i = 1; i < pontos.length; i++) {
        partes.push(`<line x1="${pontos[i - 1].x}" y1="${pontos[i - 1].y}" x2="${pontos[i].x}" y2="${pontos[i].y}" stroke="${pontos[i].cor}" />`);
      }
      for (const ponto of pontos) partes.push(`<circle class="ponto-da-fila" cx="${ponto.x}" cy="${ponto.y}" r="5" fill="${ponto.cor}" />`);
    }
    const html = partes.join('');
    if (html === anterior) return;
    anterior = html;
    svg.innerHTML = html;
  }

  return { desenhar };
}
