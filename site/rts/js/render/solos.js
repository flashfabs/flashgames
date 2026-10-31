// Ground soils for the splatted terrain: which soil each cell has (the map's soil layer, or one made up from the
// relief for the generated maps) and how each soil looks (its own tile when the art has one, else the packed earth
// tile tinted). The soil names are the design front's table (mapa.json `solos`); the shader reads the result.
import { MAX_SOLOS } from './shaders.js';

/** Soils of the design front's maps, in their usual order, with the tint used while only the base tile exists. */
export const SOLOS_PADRAO = Object.freeze([
  ['terra-batida', [1, 1, 1]],
  ['capim', [0.84, 0.9, 0.66]],
  ['cascalho', [0.8, 0.79, 0.76]],
  ['asfalto-velho', [0.42, 0.42, 0.44]],
  ['entulho', [0.74, 0.68, 0.62]],
  ['lama', [0.56, 0.45, 0.35]],
  ['agua-rasa', [0.46, 0.62, 0.68]],
  ['agua-funda', [0.22, 0.36, 0.48]],
  ['rocha', [0.68, 0.64, 0.6]],
  ['capim-alto', [0.72, 0.82, 0.52]],
]);
const TINTAS = new Map(SOLOS_PADRAO);
export const LADRILHO_BASE = 'terra-batida';
export const prefixoLadrilho = nome => `terreno-${nome}`;

/**
 * Soil per cell and the soil names. A map with a soil layer (any nonzero cell, or a `solos` table) keeps it; a
 * generated map gets packed earth, grass in the mid relief, gravel on the high ground and rock on blocked cells.
 * The soil table may hold names or the map's { nome, passagem, cobertura } entries.
 * @param {{ largura: number, altura: number, bloqueado: Uint8Array, relevo: Uint8Array, nivel?: Uint8Array, solo?: Uint8Array, solos?: (string | { nome: string })[] }} mapa
 */
export function soloDoMapa(mapa) {
  const total = mapa.largura * mapa.altura;
  const temCamada = mapa.solo && (mapa.solos?.length > 0 || mapa.solo.some(v => v !== 0));
  if (temCamada) {
    const nomes = mapa.solos?.length ? mapa.solos.slice(0, MAX_SOLOS).map(s => (typeof s === 'string' ? s : s.nome)) : SOLOS_PADRAO.map(([nome]) => nome);
    const grade = Uint8Array.from(mapa.solo, v => Math.min(v, nomes.length - 1));
    return { grade, nomes };
  }
  const nomes = SOLOS_PADRAO.map(([nome]) => nome);
  const indice = nome => nomes.indexOf(nome);
  const grade = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    const r = mapa.relevo[i];
    if (mapa.bloqueado[i]) grade[i] = indice('rocha');
    else if (r > 184) grade[i] = indice('cascalho');
    else if (r > 112 && r < 132) grade[i] = indice('capim');
    else grade[i] = indice('terra-batida');
  }
  return { grade, nomes };
}

/** Cells whose soil is water: blocked water stays at its own level instead of rising like rock. */
export function mascaraDeAgua(grade, nomes) {
  const agua = nomes.map(nome => /^agua/.test(nome));
  return Uint8Array.from(grade, s => (agua[s] ? 1 : 0));
}

/**
 * Shader table, MAX_SOLOS entries of (tint r, g, b, tile layer): a soil with its own tile shows it untinted, the
 * others show the base tile with their tint.
 * @param {string[]} nomes soil names by index
 * @param {Map<string, number>} camadas tile layer of each soil that has its own tile
 */
export function tabelaDeSolos(nomes, camadas) {
  const tabela = new Float32Array(MAX_SOLOS * 4);
  const base = camadas.get(LADRILHO_BASE) ?? 0;
  for (let i = 0; i < MAX_SOLOS; i++) {
    const nome = nomes[i] ?? LADRILHO_BASE;
    const propria = camadas.get(nome);
    const tinta = propria === undefined ? (TINTAS.get(nome) ?? [1, 1, 1]) : [1, 1, 1];
    tabela.set([tinta[0], tinta[1], tinta[2], propria ?? base], i * 4);
  }
  return tabela;
}
