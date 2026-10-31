// Lists the runs the phase packer must pack: every sprite manifest under site/rts/assets/sprites that belongs
// to the phase, with the run recorded in its provenance, printed as asset/run pairs joined by "+".
// Usage: node ferramentas/arte/fase.mjs <phase>
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('../../', import.meta.url));
const fase = process.argv[2];
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fase ?? '')) {
  console.error('usage: node ferramentas/arte/fase.mjs <phase>');
  process.exit(2);
}

const pastaSprites = join(raiz, 'site/rts/assets/sprites');
const pares = [];
const faltando = [];
for (const categoria of readdirSync(pastaSprites, { withFileTypes: true })) {
  if (!categoria.isDirectory() || categoria.name === fase) continue;
  for (const arquivo of readdirSync(join(pastaSprites, categoria.name))) {
    if (!arquivo.endsWith('.json')) continue;
    const manifesto = JSON.parse(readFileSync(join(pastaSprites, categoria.name, arquivo), 'utf8'));
    if (!manifesto.asset || !(manifesto.fases ?? []).includes(fase)) continue;
    const caminho = join(raiz, 'arte/procedencia', `${manifesto.asset}.json`);
    const execucao = existsSync(caminho) ? JSON.parse(readFileSync(caminho, 'utf8')).execucao : null;
    if (execucao) pares.push(`${manifesto.asset}/${execucao}`);
    else faltando.push(manifesto.asset);
  }
}
if (faltando.length) {
  console.error(`no run recorded in the provenance of: ${faltando.join(', ')} (render or repack them first)`);
  process.exit(1);
}
if (!pares.length) {
  console.error(`no sprite asset in phase ${fase}`);
  process.exit(1);
}
console.log(pares.sort().join('+'));
