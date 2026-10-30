// Minimap on a 2D canvas, redrawn at most every 150 ms: terrain background drawn once, fog overlay, unit dots and the
// camera rectangle; clicking moves the camera.
import { FP, VISAO } from '../sim/contratos.js';

export function criarMinimapa({ minimapa, canvas, camera, estado }) {
  const ctxMini = minimapa.getContext('2d');
  const fundoMini = document.createElement('canvas');
  const neblinaMini = document.createElement('canvas');
  let ultimoMini = 0;

  function preparar() {
    const { largura, altura, bloqueado, relevo } = estado.mapa;
    for (const c of [fundoMini, neblinaMini]) {
      c.width = largura;
      c.height = altura;
    }
    const imagem = fundoMini.getContext('2d').createImageData(largura, altura);
    for (let i = 0; i < largura * altura; i++) {
      const v = relevo[i] / 255;
      const [r, g, b] = bloqueado[i] ? [92 + v * 40, 80 + v * 34, 70 + v * 28] : [150 + v * 40, 124 + v * 30, 88 + v * 20];
      imagem.data.set([r, g, b, 255], i * 4);
    }
    fundoMini.getContext('2d').putImageData(imagem, 0, 0);
  }

  function desenhar(agora) {
    if (!estado.mapa || !estado.atual || agora - ultimoMini < 150) return;
    ultimoMini = agora;
    const { largura, altura } = estado.mapa;
    const { visao, x, y, dono, n } = estado.atual;
    const ctxN = neblinaMini.getContext('2d');
    const imagem = ctxN.createImageData(largura, altura);
    for (let i = 0; i < visao.length; i++) imagem.data[i * 4 + 3] = visao[i] === VISAO.VISIVEL ? 0 : visao[i] === VISAO.VISTA ? 130 : 245;
    ctxN.putImageData(imagem, 0, 0);
    const escala = minimapa.width / largura;
    ctxMini.imageSmoothingEnabled = true;
    ctxMini.drawImage(fundoMini, 0, 0, minimapa.width, minimapa.height);
    ctxMini.drawImage(neblinaMini, 0, 0, minimapa.width, minimapa.height);
    for (let k = 0; k < n; k++) {
      const ux = x[k] / FP;
      const uy = y[k] / FP;
      const local = dono[k] === estado.jogadorLocal;
      if (!local && visao[(uy | 0) * largura + (ux | 0)] !== VISAO.VISIVEL) continue;
      ctxMini.fillStyle = local ? '#3fd6e0' : '#f0662a';
      ctxMini.fillRect(ux * escala - 1, uy * escala - 1, 2, 2);
    }
    const meiaL = canvas.width / camera.zoom / 2;
    const meiaA = canvas.height / camera.zoom / 2;
    ctxMini.strokeStyle = '#fff';
    ctxMini.lineWidth = 1;
    ctxMini.strokeRect((camera.x - meiaL) * escala, (camera.y - meiaA) * escala, meiaL * 2 * escala, meiaA * 2 * escala);
  }

  minimapa.addEventListener('pointerdown', e => {
    if (!estado.mapa) return;
    const r = minimapa.getBoundingClientRect();
    camera.x = ((e.clientX - r.left) / r.width) * estado.mapa.largura;
    camera.y = ((e.clientY - r.top) / r.height) * estado.mapa.altura;
  });

  return { preparar, desenhar };
}
