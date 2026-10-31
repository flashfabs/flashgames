// Converts a Tiled source map into the C6 files the game loads, validating it against the C5 data first.
// Usage: node ferramentas/mapas/converter.mjs arte/mapas-fonte/<id>.tmj [site/rts/dados/mapas/<id>]

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { converterTiled, validarMapa } from './formato.mjs';

const raiz = fileURLToPath(new URL('../../', import.meta.url));

/** Reads the .tmj and the tileset it points to. */
export function lerFonte(caminhoTmj) {
  const tmj = JSON.parse(readFileSync(caminhoTmj, 'utf8'));
  const tsj = JSON.parse(readFileSync(join(dirname(caminhoTmj), tmj.tilesets[0].source), 'utf8'));
  return { tmj, tsj };
}

/** C5 kinds the validation needs. */
export function lerDados() {
  const ler = nome => JSON.parse(readFileSync(join(raiz, 'site/rts/dados', nome), 'utf8'));
  return { unidades: ler('unidades.json').unidades, predios: ler('predios.json').predios };
}

// JSON with the top two levels expanded and everything deeper on one line, so diffs of the outputs stay readable.
export function formatarJson(valor, nivel = 0) {
  const expandir = nivel <= 1 && valor !== null && typeof valor === 'object' && !(Array.isArray(valor) && valor.every(v => typeof v === 'number'));
  if (!expandir) return JSON.stringify(valor) + (nivel === 0 ? '\n' : '');
  const recuo = '  '.repeat(nivel + 1);
  const fim = '  '.repeat(nivel);
  const corpo = Array.isArray(valor)
    ? valor.map(v => recuo + formatarJson(v, nivel + 1))
    : Object.entries(valor).map(([k, v]) => `${recuo}${JSON.stringify(k)}: ${formatarJson(v, nivel + 1)}`);
  const texto = corpo.length === 0 ? (Array.isArray(valor) ? '[]' : '{}') : `${Array.isArray(valor) ? '[' : '{'}\n${corpo.join(',\n')}\n${fim}${Array.isArray(valor) ? ']' : '}'}`;
  return texto + (nivel === 0 ? '\n' : '');
}

/** File name to contents of the C6 output. */
export function saidas({ mapa, camadas, entidades }) {
  return {
    'mapa.json': formatarJson(mapa),
    'camadas.bin': Buffer.from(camadas.buffer, camadas.byteOffset, camadas.byteLength),
    'entidades.json': formatarJson(entidades),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fonte = process.argv[2];
  if (!fonte) {
    console.error('uso: node ferramentas/mapas/converter.mjs <fonte.tmj> [pasta de saída]');
    process.exit(2);
  }
  const { tmj, tsj } = lerFonte(fonte);
  const convertido = converterTiled(tmj, tsj);
  const erros = validarMapa(convertido, lerDados());
  if (erros.length > 0) {
    console.error(`mapa inválido (${erros.length} problemas):\n${erros.slice(0, 40).join('\n')}`);
    process.exit(1);
  }
  const saida = process.argv[3] ?? join(raiz, 'site/rts/dados/mapas', basename(fonte, '.tmj'));
  mkdirSync(saida, { recursive: true });
  for (const [nome, conteudo] of Object.entries(saidas(convertido))) writeFileSync(join(saida, nome), conteudo);
  console.log(`${convertido.mapa.id}: ${convertido.mapa.largura} × ${convertido.mapa.altura}, ${convertido.entidades.entidades.length} entidades, escrito em ${saida}`);
}
