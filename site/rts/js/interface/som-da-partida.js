// Which provisional sound each presentation event (C3) makes, and how loud by distance from the camera: shots and
// deaths are heard where the player is looking and fade out a little beyond the screen, so a battle far away does not
// drown the one on screen. Alerts make their own sounds through the alert list.
import { EVENTO, TAMANHO_EVENTO, E_TIPO, E_X, E_Y, E_ARG, FP } from '../sim/contratos.js';
import { SOM } from '../audio/provisorio.js';

/** Beyond this many cells from the camera centre an event is not heard. */
export const ALCANCE_DO_SOM = 34;
/** Within this many cells it plays at full loudness. */
const PERTO = 14;

/** Loudness 0..1 of a sound at (x, y) cells for a camera at (cx, cy). */
export function volumePelaDistancia(x, y, cx, cy) {
  const d = Math.hypot(x - cx, y - cy);
  if (d <= PERTO) return 1;
  return Math.max(0, 1 - (d - PERTO) / (ALCANCE_DO_SOM - PERTO));
}

export function criarSomDaPartida({ som, camera, catalogo }) {
  /** Plays the sounds of one snapshot's events. */
  function tocarEventos(eventos) {
    for (let o = 0; o + TAMANHO_EVENTO <= eventos.length; o += TAMANHO_EVENTO) {
      const tipo = eventos[o + E_TIPO];
      let nome = null;
      if (tipo === EVENTO.TIRO) nome = SOM.TIRO;
      else if (tipo === EVENTO.EXPLOSAO) nome = SOM.EXPLOSAO;
      // Until explosions come as events of their own, a vehicle or building that dies blows up.
      else if (tipo === EVENTO.MORTE && catalogo().categoria(eventos[o + E_ARG]) !== 'recurso') nome = SOM.EXPLOSAO;
      if (!nome) continue;
      const volume = volumePelaDistancia(eventos[o + E_X] / FP, eventos[o + E_Y] / FP, camera.x, camera.y);
      if (volume > 0) som.tocar(nome, { volume });
    }
  }

  return { tocarEventos };
}
