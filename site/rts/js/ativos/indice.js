// Art index (contract C9, site/rts/assets/indice.json, written by the art pipeline): which manifest each asset has.
// The renderer asks it for the manifests of the kinds a match uses; an asset the index does not list keeps its
// placeholder.

export const INDICE = new URL('../../assets/indice.json', import.meta.url);

/**
 * Reads the index; resolves to an empty one when it is missing, so a match without art still starts.
 * @param {string | URL} [url]
 * @returns {Promise<{ urlDo: (asset: string) => URL | null, nomes: string[] }>}
 */
export async function carregarIndice(url = INDICE) {
  let assets = {};
  try {
    const resposta = await fetch(url);
    if (resposta.ok) assets = (await resposta.json()).assets ?? {};
    else console.warn(`índice de arte: HTTP ${resposta.status}, usando as fichas`);
  } catch (erro) {
    console.warn('índice de arte indisponível, usando as fichas', erro);
  }
  return lerIndice(assets, url);
}

/**
 * @param {Record<string, { manifesto: string, tipo?: string }>} assets the index's `assets`
 * @param {string | URL} base
 */
export function lerIndice(assets, base) {
  return {
    nomes: Object.keys(assets),
    /** Sprite assets (not interface pieces nor ground tiles) the index lists for a phase. */
    daFase(fase) {
      return Object.entries(assets)
        .filter(([, e]) => (e.fases ?? []).includes(fase) && e.tipo !== 'interface' && e.tipo !== 'terreno' && e.manifesto)
        .map(([nome]) => nome);
    },
    /** Manifest URL of a sprite asset, or null when the index does not list it. */
    urlDo(asset) {
      const entrada = assets[asset];
      return entrada?.manifesto ? new URL(entrada.manifesto, base) : null;
    },
  };
}
