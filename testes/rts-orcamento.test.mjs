// Contract C12: memory and download budgets of the RTS per phase and level (testes/rts-orcamento.json). The texture
// estimate of each manifest is recomputed from its pages (4 bytes per pixel for colour, 1 for every other pass, as
// the packer counts), the download adds the code and data under site/rts, and no file in the repository goes over
// the size limit. A phase marked obrigatorio false is measured and reported, not enforced.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const RAIZ = new URL('../', import.meta.url).pathname;
const ASSETS = join(RAIZ, 'site/rts/assets');
const MIB = 1024 * 1024;
const NIVEIS = ['uhd', 'hd'];

const lerJson = caminho => JSON.parse(readFileSync(caminho, 'utf8'));
const orcamento = lerJson(join(RAIZ, 'testes/rts-orcamento.json'));
const indice = lerJson(join(ASSETS, 'indice.json'));
const entradas = Object.entries(indice.assets ?? {});
const manifestos = new Map(entradas.map(([nome, entrada]) => [nome, lerJson(join(ASSETS, entrada.manifesto))]));

function listarArquivos(pasta) {
  if (!existsSync(pasta)) return [];
  return readdirSync(pasta, { withFileTypes: true }).flatMap(item => (item.isDirectory() ? listarArquivos(join(pasta, item.name)) : [join(pasta, item.name)]));
}

/** Bytes of the page's code and data every player downloads: site/rts without the art and the developer tools. */
function bytesDoCodigo() {
  const fora = [join(RAIZ, 'site/rts/assets'), join(RAIZ, 'site/rts/ferramentas')];
  return listarArquivos(join(RAIZ, 'site/rts'))
    .filter(arquivo => !fora.some(pasta => arquivo.startsWith(pasta + '/')))
    .reduce((soma, arquivo) => soma + statSync(arquivo).size, 0);
}

/** Texture bytes of one level of a manifest, recomputed from its pages. */
function texturaRecalculada(m, nivel) {
  const paginas = m.paginas?.[nivel] ?? [];
  const bytesPorPixel = 4 + Math.max(0, (m.passes ?? ['cor']).length - 1);
  return paginas.reduce((soma, pagina) => soma + pagina.largura * pagina.altura * bytesPorPixel, 0);
}

/** Totals of one phase and level in bytes: { textura, assets, codigo, download, porAsset }. */
function totais(fase, nivel, codigo) {
  let textura = 0;
  let assets = 0;
  const porAsset = [];
  for (const [nome, entrada] of entradas) {
    if (!entrada.fases?.includes(fase)) continue;
    const m = manifestos.get(nome);
    const t = m.orcamento?.[nivel]?.bytesGpuEstimados ?? 0;
    textura += t;
    assets += m.orcamento?.[nivel]?.bytesArquivos ?? 0;
    porAsset.push([nome, t]);
  }
  porAsset.sort((a, b) => b[1] - a[1]);
  return { textura, assets, codigo, download: assets + codigo, porAsset };
}

const emMiB = bytes => (bytes / MIB).toFixed(1);

test('the budget file has a version, a file limit and a texture and download budget per phase and level', () => {
  assert.equal(orcamento.versao, 1);
  assert.ok(orcamento.arquivoMaximoMiB > 0);
  for (const [fase, f] of Object.entries(orcamento.fases)) {
    assert.equal(typeof f.obrigatorio, 'boolean', fase);
    for (const nivel of NIVEIS) {
      assert.ok(f.niveis[nivel].texturaMiB > 0, `${fase} ${nivel}: texturaMiB`);
      assert.ok(f.niveis[nivel].downloadMiB > 0, `${fase} ${nivel}: downloadMiB`);
    }
  }
});

test('each manifest texture estimate matches its pages', () => {
  for (const [nome] of entradas) {
    const m = manifestos.get(nome);
    for (const nivel of NIVEIS) {
      if (!m.paginas?.[nivel]) continue;
      assert.equal(m.orcamento?.[nivel]?.bytesGpuEstimados, texturaRecalculada(m, nivel), `${nome}: orcamento.${nivel}.bytesGpuEstimados`);
    }
  }
});

test(`no file in the repository is larger than the limit`, () => {
  const limite = orcamento.arquivoMaximoMiB * MIB;
  const arquivos = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: RAIZ, encoding: 'utf8' }).split('\0').filter(Boolean);
  const grandes = arquivos.filter(arquivo => existsSync(join(RAIZ, arquivo)) && statSync(join(RAIZ, arquivo)).size > limite);
  assert.deepEqual(grandes, [], `acima de ${orcamento.arquivoMaximoMiB} MiB`);
});

test('every phase fits its texture and download budget (reported only where not yet enforced)', t => {
  const codigo = bytesDoCodigo();
  for (const [fase, f] of Object.entries(orcamento.fases)) {
    for (const nivel of NIVEIS) {
      const total = totais(fase, nivel, codigo);
      const limite = f.niveis[nivel];
      const maiores = total.porAsset.slice(0, 3).map(([nome, bytes]) => `${nome} ${emMiB(bytes)}`).join(', ');
      t.diagnostic(`${fase} ${nivel}: textura ${emMiB(total.textura)} de ${limite.texturaMiB} MiB, download ${emMiB(total.download)} de ${limite.downloadMiB} MiB (assets ${emMiB(total.assets)}, código e dados ${emMiB(total.codigo)}); maiores: ${maiores}`);
      if (!f.obrigatorio) continue;
      assert.ok(total.textura <= limite.texturaMiB * MIB, `${fase} ${nivel}: textura ${emMiB(total.textura)} MiB acima de ${limite.texturaMiB}`);
      assert.ok(total.download <= limite.downloadMiB * MIB, `${fase} ${nivel}: download ${emMiB(total.download)} MiB acima de ${limite.downloadMiB}`);
    }
  }
});
