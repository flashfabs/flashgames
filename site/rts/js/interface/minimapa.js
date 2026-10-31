// Minimap on a 2D canvas, redrawn at most every 100 ms: terrain background drawn once, fog overlay, buildings as
// squares and units as dots, pulsing rings where the player is under attack, and the camera rectangle. A click (or a
// drag) moves the camera; a context click sends the selected units there, as on the battlefield.
import { FP, VISAO } from '../sim/contratos.js';

const INTERVALO_MS = 100;
const PERIODO_DO_PULSO_MS = 900;

export function criarMinimapa({ minimapa, camera, estado, render, catalogo, alertas, aoOrdenar }) {
  const ctxMini = minimapa.getContext('2d');
  const fundoMini = document.createElement('canvas');
  const neblinaMini = document.createElement('canvas');
  let imagemNeblina = null;
  let ultimoMini = 0;
  let arrastando = false;

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
    imagemNeblina = neblinaMini.getContext('2d').createImageData(largura, altura);
  }

  function desenhar(agora) {
    if (!estado.mapa || !estado.atual || agora - ultimoMini < INTERVALO_MS) return;
    ultimoMini = agora;
    const { largura } = estado.mapa;
    const { visao, x, y, dono, tipo, n } = estado.atual;
    const dados = imagemNeblina.data;
    for (let i = 0; i < visao.length; i++) dados[i * 4 + 3] = visao[i] === VISAO.VISIVEL ? 0 : visao[i] === VISAO.VISTA ? 130 : 245;
    neblinaMini.getContext('2d').putImageData(imagemNeblina, 0, 0);
    const escala = minimapa.width / largura;
    ctxMini.imageSmoothingEnabled = true;
    ctxMini.drawImage(fundoMini, 0, 0, minimapa.width, minimapa.height);
    ctxMini.drawImage(neblinaMini, 0, 0, minimapa.width, minimapa.height);
    const cat = catalogo();
    for (let k = 0; k < n; k++) {
      const ux = x[k] / FP;
      const uy = y[k] / FP;
      const local = dono[k] === estado.jogadorLocal;
      const recurso = cat.ehRecurso(tipo[k]);
      if (!local && visao[(uy | 0) * largura + (ux | 0)] === VISAO.NUNCA) continue;
      if (!local && !recurso && visao[(uy | 0) * largura + (ux | 0)] !== VISAO.VISIVEL) continue;
      ctxMini.fillStyle = recurso ? '#ffcf7a' : local ? '#3fd6e0' : '#f0662a';
      if (cat.ehPredio(tipo[k]) || recurso) {
        const [w, h] = cat.info(tipo[k]).pegada;
        ctxMini.fillRect((ux - w / 2) * escala, (uy - h / 2) * escala, Math.max(4, w * escala), Math.max(4, h * escala));
      } else {
        ctxMini.fillRect(ux * escala - 1.5, uy * escala - 1.5, 3, 3);
      }
    }
    // Under attack: a ring that pulses where it happens, for as long as the fight goes on.
    const fase = (agora % PERIODO_DO_PULSO_MS) / PERIODO_DO_PULSO_MS;
    ctxMini.lineWidth = 3;
    for (const a of alertas.ataquesAtivos(agora)) {
      ctxMini.strokeStyle = `rgba(255, 70, 50, ${1 - fase})`;
      ctxMini.beginPath();
      ctxMini.arc(a.x * escala, a.y * escala, 6 + fase * 26, 0, Math.PI * 2);
      ctxMini.stroke();
    }
    const [x0, y0, x1, y1] = render.areaVisivel();
    ctxMini.strokeStyle = '#fff';
    ctxMini.lineWidth = 2;
    ctxMini.strokeRect(x0 * escala, y0 * escala, (x1 - x0) * escala, (y1 - y0) * escala);
  }

  const noMapa = e => {
    const r = minimapa.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * estado.mapa.largura, y: ((e.clientY - r.top) / r.height) * estado.mapa.altura };
  };

  minimapa.addEventListener('contextmenu', e => e.preventDefault());
  minimapa.addEventListener('pointerdown', e => {
    if (!estado.mapa) return;
    const ponto = noMapa(e);
    if (e.button === 2) {
      aoOrdenar(ponto, e);
      return;
    }
    if (e.button !== 0) return;
    arrastando = true;
    minimapa.setPointerCapture(e.pointerId);
    Object.assign(camera, ponto);
  });
  minimapa.addEventListener('pointermove', e => {
    if (arrastando && estado.mapa) Object.assign(camera, noMapa(e));
  });
  minimapa.addEventListener('pointerup', () => {
    arrastando = false;
  });

  return { preparar, desenhar };
}
