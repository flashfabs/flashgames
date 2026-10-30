// The three zoom levels (far, default, near), so sprites stay crisp: the wheel, the pinch and the + and − keys step
// between them, keeping the map point under the pointer still. Pinches arrive as a stream of small ctrlKey wheel
// deltas (Chrome, Firefox, Safari) or as Safari's GestureEvent scale; both are summed into whole steps here.
import { paraMundo, definirZoom } from './camera.js';

/** Default levels when no projection is given; the page passes the ones of projecao.json. */
export const NIVEIS_ZOOM = Object.freeze([0.75, 1, 1.25]);
export const NIVEL_PADRAO = 1;
/** Summed ctrlKey wheel deltaY that makes one pinch step. */
export const PASSO_DA_PINCA = 40;
/** GestureEvent scale ratio that makes one pinch step. */
export const PASSO_DO_GESTO = 1.2;
/** A pause this long in the ctrlKey wheel stream starts a new pinch. */
const FIM_DA_PINCA_MS = 250;

/**
 * niveis are the zoom factors far to near (projecao.json's afastado, padrao and aproximado); fatorInicial picks the
 * nearest level to start from without changing the camera, so a benchmark with ?zoom= keeps its view.
 */
export function criarZoom({ canvas, camera, niveis = NIVEIS_ZOOM, fatorInicial = 1, reajustar = () => {} }) {
  let nivel = niveis.reduce((melhor, fator, i) => (Math.abs(fator - fatorInicial) < Math.abs(niveis[melhor] - fatorInicial) ? i : melhor), NIVEL_PADRAO);
  let somaDaPinca = 0;
  let ultimaPinca = -Infinity;
  let escalaDoGesto = 1;

  /** Goes to level alvo keeping (clienteX, clienteY) on the same map point; false when already there. */
  function irPara(alvo, clienteX, clienteY) {
    const destino = Math.max(0, Math.min(niveis.length - 1, alvo));
    if (destino === nivel) return false;
    const antes = paraMundo(canvas, camera, clienteX, clienteY);
    nivel = destino;
    definirZoom(camera, niveis[nivel]);
    reajustar();
    const depois = paraMundo(canvas, camera, clienteX, clienteY);
    camera.x += antes.x - depois.x;
    camera.y += antes.y - depois.y;
    return true;
  }

  return {
    get nivel() {
      return nivel;
    },
    get fator() {
      return niveis[nivel];
    },
    /** One level nearer (+1) or farther (-1). */
    passo(sentido, clienteX, clienteY) {
      return irPara(nivel + sentido, clienteX, clienteY);
    },
    irPara,
    /** A ctrlKey wheel event of a pinch; negative deltaY spreads the fingers (nearer). */
    pinca(deltaY, quando, clienteX, clienteY) {
      if (quando - ultimaPinca > FIM_DA_PINCA_MS || Math.sign(deltaY) !== Math.sign(somaDaPinca)) somaDaPinca = 0;
      ultimaPinca = quando;
      somaDaPinca += deltaY;
      if (Math.abs(somaDaPinca) < PASSO_DA_PINCA) return false;
      const sentido = somaDaPinca < 0 ? 1 : -1;
      somaDaPinca = 0;
      return irPara(nivel + sentido, clienteX, clienteY);
    },
    comecarGesto() {
      escalaDoGesto = 1;
    },
    /** A gesturechange scale (1 at the gesture start). */
    gesto(escala, clienteX, clienteY) {
      const razao = escala / escalaDoGesto;
      if (razao < PASSO_DO_GESTO && razao > 1 / PASSO_DO_GESTO) return false;
      escalaDoGesto = escala;
      return irPara(nivel + (razao > 1 ? 1 : -1), clienteX, clienteY);
    },
  };
}
