// Rebuilds site/rts/assets/indice.json (contract C9) from the sprite manifests under site/rts/assets:
// every asset with its manifest path, type, brief, finish, phases and bytes per level, the assets of each phase
// and the phase packages (shared atlas pages, whose bytes count once for the package, not per asset).
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

const PASSES = ['cor', 'time', 'normal', 'sombra'];

function bytesDasPaginas(paginasPorNivel, pasta) {
  const bytes = {};
  for (const [nivel, paginas] of Object.entries(paginasPorNivel)) {
    bytes[nivel] = paginas.reduce((soma, pagina) => {
      for (const passe of PASSES) if (pagina[passe]) soma += statSync(join(pasta, pagina[passe])).size;
      return soma;
    }, 0);
  }
  return bytes;
}

const assets = {};
const pacotes = {};
for (const pasta of PASTAS_DA_ARTE) {
  for (const caminho of arquivos(join(pastaAssets, pasta))) {
    if (!caminho.endsWith('.json')) continue;
    const manifesto = JSON.parse(readFileSync(caminho, 'utf8'));
    const relativo = relative(pastaAssets, caminho).split('\\').join('/');
    if (manifesto.fase && manifesto.paginas && !manifesto.asset) {
      pacotes[manifesto.fase] = {
        manifesto: relativo,
        bytes: bytesDasPaginas(manifesto.paginas, join(caminho, '..')),
        bytesGpuEstimados: Object.fromEntries(Object.entries(manifesto.orcamento).map(([nivel, o]) => [nivel, o.bytesGpuEstimados])),
        camadas: Object.fromEntries(Object.entries(manifesto.orcamento).map(([nivel, o]) => [nivel, o.camadas])),
      };
      continue;
    }
    if (!manifesto.asset || !manifesto.paginas) continue;
    assets[manifesto.asset] = {
      manifesto: relativo,
      tipo: manifesto.tipo,
      categoria: manifesto.categoria,
      ...(manifesto.brief ? { brief: manifesto.brief } : {}),
      acabamento: manifesto.acabamento ?? 'portao',
      fases: manifesto.fases ?? [],
      // pages shared by a phase package count once, in pacotes
      ...(manifesto.pacote ? { pacote: manifesto.pacote } : { bytes: bytesDasPaginas(manifesto.paginas, join(caminho, '..')) }),
    };
  }
}

const ordenados = Object.fromEntries(Object.keys(assets).sort().map(id => [id, assets[id]]));
const fases = {};
for (const [id, asset] of Object.entries(ordenados)) {
  for (const fase of asset.fases) (fases[fase] ??= []).push(id);
}
const indice = { versao: 1, assets: ordenados, fases, pacotes: Object.fromEntries(Object.keys(pacotes).sort().map(f => [f, pacotes[f]])) };
writeFileSync(join(pastaAssets, 'indice.json'), JSON.stringify(indice, null, 2) + '\n');
console.log(`INDICE ${Object.keys(ordenados).length} assets`);
