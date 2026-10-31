// SVG layer over the canvas: the queued points of the selected units (a dot per point and a line between them,
// colored by order kind, so Shift-queued orders are visible on the ground) and the rally points of the selected
// buildings. Redrawn every frame from a cheap string, and the DOM is touched only when that string changes.
import { TIPO_COMANDO } from '../sim/contratos.js';
import { paraTela } from '../entrada/camera.js';

const CORES = {
  [TIPO_COMANDO.MOVER]: '#6dff8a',
  [TIPO_COMANDO.ATACAR]: '#ff6a4d',
  [TIPO_COMANDO.ATACAR_MOVENDO]: '#ff6a4d',
  [TIPO_COMANDO.PATRULHAR]: '#5ab8ff',
  [TIPO_COMANDO.COLETAR]: '#ffcf7a',
};

/**
 * @param {object} opcoes
 * @param {() => {de: {x: number, y: number}, para: {x: number, y: number}}[]} [opcoes.encontros] rally lines, in cells
 */
export function criarSobreposicao({ svg, canvas, camera, fila, selecionadas, encontros = () => [] }) {
  let anterior = '';
  const p = { x: 0, y: 0 };

  function naCaixa(caixa, x, y) {
    paraTela(canvas, camera, x, y, p);
    return { x: Math.round(p.x - caixa.left), y: Math.round(p.y - caixa.top) };
  }

  function desenhar() {
    const caixa = svg.getBoundingClientRect();
    const partes = [];
    for (const rota of fila.rotas(selecionadas)) {
      const pontos = rota.map(ponto => ({ ...naCaixa(caixa, ponto.x, ponto.y), cor: CORES[ponto.tipo] ?? '#ffffff' }));
      for (let i = 1; i < pontos.length; i++) {
        partes.push(`<line x1="${pontos[i - 1].x}" y1="${pontos[i - 1].y}" x2="${pontos[i].x}" y2="${pontos[i].y}" stroke="${pontos[i].cor}" />`);
      }
      for (const ponto of pontos) partes.push(`<circle class="ponto-da-fila" cx="${ponto.x}" cy="${ponto.y}" r="5" fill="${ponto.cor}" />`);
    }
    for (const { de, para } of encontros()) {
      const a = naCaixa(caixa, de.x, de.y);
      const b = naCaixa(caixa, para.x, para.y);
      partes.push(`<line class="encontro" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" /><rect class="encontro" x="${b.x - 5}" y="${b.y - 5}" width="10" height="10" />`);
    }
    const html = partes.join('');
    if (html === anterior) return;
    anterior = html;
    svg.innerHTML = html;
  }

  return { desenhar };
}
