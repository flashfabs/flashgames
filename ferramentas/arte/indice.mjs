// Rebuilds site/rts/assets/indice.json (contract C9) from the sprite manifests under site/rts/assets:
// every asset with its manifest path, type, phases and bytes per level, and the assets of each phase.
// Run by rtx.sh after each fetch; deterministic, so an unchanged tree gives an unchanged file.
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('../../', import.meta.url));
const pastaAssets = join(raiz, 'site/rts/assets');
const PASTAS_DA_ARTE = ['sprites', 'terreno', 'interface', 'video'];

function arquivos(pasta) {
  let lista = [];
  let entradas = [];
  try {
    entradas = readdirSync(pasta, { withFileTypes: true });
  } catch {
    return lista;
  }
  for (const entrada of entradas) {
    const caminho = join(pasta, entrada.name);
    if (entrada.isDirectory()) lista = lista.concat(arquivos(caminho));
    else lista.push(caminho);
  }
  return lista;
}

const assets = {};
for (const pasta of PASTAS_DA_ARTE) {
  for (const caminho of arquivos(join(pastaAssets, pasta))) {
    if (!caminho.endsWith('.json')) continue;
    const manifesto = JSON.parse(readFileSync(caminho, 'utf8'));
    if (!manifesto.asset || !manifesto.paginas) continue;
    const pastaDoManifesto = join(caminho, '..');
    const bytes = {};
    for (const [nivel, paginas] of Object.entries(manifesto.paginas)) {
      bytes[nivel] = paginas.reduce((soma, pagina) => {
        for (const passe of manifesto.passes) soma += statSync(join(pastaDoManifesto, pagina[passe])).size;
        return soma;
      }, 0);
    }
    assets[manifesto.asset] = {
      manifesto: relative(pastaAssets, caminho).split('\\').join('/'),
      tipo: manifesto.tipo,
      categoria: manifesto.categoria,
      fases: manifesto.fases ?? [],
      bytes,
    };
  }
}

const ordenados = Object.fromEntries(Object.keys(assets).sort().map(id => [id, assets[id]]));
const fases = {};
for (const [id, asset] of Object.entries(ordenados)) {
  for (const fase of asset.fases) (fases[fase] ??= []).push(id);
}
const indice = { versao: 1, assets: ordenados, fases };
writeFileSync(join(pastaAssets, 'indice.json'), JSON.stringify(indice, null, 2) + '\n');
console.log(`INDICE ${Object.keys(ordenados).length} assets`);
