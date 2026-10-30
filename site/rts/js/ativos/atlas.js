// The prototype's Blender tank (one horizontal strip of N directions, colour and team mask), read into the same
// shape as a sprite manifest (C9) so it goes through the regular sheet path until the art front replaces it.
import { lerManifesto } from './manifesto.js';

export const ATLAS_PROTOTIPO = new URL('../../assets/prototipo/', import.meta.url);

// The prototype's camera: orthographic, 8.4 m across the frame, 55 degrees up, aimed 0.9 m above the pivot.
const LARGURA_VISTA_METROS = 8.4;
const ALVO_ACIMA_METROS = 0.9;
const ELEVACAO = (55 * Math.PI) / 180;
const METROS_POR_CELULA = 4;

/**
 * Turns the prototype's small manifest into a v1 manifest.
 * @param {{ cor: string, time: string, direcoes: number, quadro: number }} antigo
 * @param {string | URL} base
 */
export function manifestoDoPrototipo(antigo, base) {
  const { direcoes, quadro } = antigo;
  const pxPorMetro = quadro / LARGURA_VISTA_METROS;
  // the frame centre is the aim point, which shows above the ground anchor
  const desce = ALVO_ACIMA_METROS * Math.cos(ELEVACAO) * pxPorMetro;
  const quadros = [];
  for (let k = 0; k < direcoes; k++) quadros.push([0, k * quadro, 0, quadro, quadro, -quadro / 2, -(quadro / 2 + desce)]);
  return lerManifesto(
    {
      versao: 1,
      asset: 'prototipo-tanque',
      tipo: 'unidade',
      direcoes,
      animacoes: { parado: { quadros: 1, fps: 0 } },
      paginas: { uhd: [{ cor: antigo.cor, time: antigo.time, largura: quadro * direcoes, altura: quadro }] },
      quadros: { uhd: quadros },
      pxPorCelula: { uhd: pxPorMetro * METROS_POR_CELULA },
    },
    base,
  );
}

/** Reads the prototype's manifest; resolves to null when it is missing or broken. */
export async function carregarPrototipo(base = ATLAS_PROTOTIPO) {
  try {
    const url = new URL('manifesto.json', base);
    const resposta = await fetch(url);
    if (!resposta.ok) return null;
    return manifestoDoPrototipo(await resposta.json(), url);
  } catch (erro) {
    console.warn('atlas do protótipo indisponível, usando as fichas', erro);
    return null;
  }
}
