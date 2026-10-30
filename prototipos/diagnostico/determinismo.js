// Module Worker that runs the prototype's scripted match, so the checksums come from where the game simulates: a Worker.
import { executarRoteiro, SOMAS_DE_REFERENCIA } from '../rts-4k/roteiro-determinismo.js';

const resultado = executarRoteiro(() => performance.now());
postMessage({ ...resultado, referencia: SOMAS_DE_REFERENCIA, igualAReferencia: resultado.somas.join() === SOMAS_DE_REFERENCIA.join() });
