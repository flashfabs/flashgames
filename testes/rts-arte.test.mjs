// Producer side of the art contracts: sprite manifests (C9), provenance (C13) and the phase atlas budget (C12),
// read from what the art pipeline put in site/rts/assets and arte/procedencia; the renderer's own consumer test is
// in rts-render.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('../', import.meta.url));
const pastaAssets = join(raiz, 'site/rts/assets');
const indice = JSON.parse(readFileSync(join(pastaAssets, 'indice.json'), 'utf8'));
const PASSES = ['cor', 'time', 'normal', 'sombra'];
const MIB = 1024 * 1024;
// Phase budget of texture memory (renderer allocation estimate), in line with the plan's E5 ceilings.
const TETO_GPU = { uhd: 256 * MIB, hd: 96 * MIB };
const LICENCAS = new Set(['GPL-3.0-or-later']);

function lerJson(caminho) {
  return JSON.parse(readFileSync(caminho, 'utf8'));
}

function arquivos(pasta) {
  if (!existsSync(pasta)) return [];
  return readdirSync(pasta, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? arquivos(join(pasta, e.name)) : [join(pasta, e.name)]));
}

const manifestos = Object.entries(indice.assets).map(([id, entrada]) => {
  const caminho = join(pastaAssets, entrada.manifesto);
  return { id, entrada, caminho, pasta: join(caminho, '..'), dados: lerJson(caminho) };
});

function blocosRiff(caminho) {
  const dados = readFileSync(caminho);
  assert.equal(dados.toString('latin1', 0, 4), 'RIFF', `${caminho} is not RIFF`);
  assert.equal(dados.toString('latin1', 8, 12), 'WEBP', `${caminho} is not WebP`);
  const blocos = [];
  for (let i = 12; i + 8 <= dados.length; ) {
    const tamanho = dados.readUInt32LE(i + 4);
    blocos.push({ nome: dados.toString('latin1', i, i + 4), inicio: i + 8 });
    i += 8 + tamanho + (tamanho & 1);
  }
  return { dados, blocos };
}

test('the index lists every manifest under site/rts/assets, each under its own id', () => {
  const noDisco = new Set();
  for (const pasta of ['sprites', 'terreno', 'interface', 'video']) {
    for (const caminho of arquivos(join(pastaAssets, pasta))) {
      if (!caminho.endsWith('.json')) continue;
      const dados = lerJson(caminho);
      if (dados.asset) noDisco.add(dados.asset);
    }
  }
  assert.deepEqual([...noDisco].sort(), Object.keys(indice.assets).sort());
  for (const { id, dados } of manifestos) assert.equal(dados.asset, id);
});

test('every sprite manifest follows C9: frames inside existing pages, one entry and one point per frame, even frames', () => {
  for (const { id, dados, pasta } of manifestos) {
    if (dados.tipo === 'terreno') continue;
    const total = Object.values(dados.animacoes).reduce((soma, a) => soma + (a.direcoes ?? dados.direcoes) * a.quadros, 0);
    let base = 0;
    for (const [nome, a] of Object.entries(dados.animacoes)) {
      assert.equal(a.base, base, `${id}: base of ${nome}`);
      assert.ok(dados.camadas.includes(a.camada), `${id}: animation ${nome} in unknown layer ${a.camada}`);
      base += (a.direcoes ?? dados.direcoes) * a.quadros;
    }
    for (const [camada, porNivel] of Object.entries(dados.quadroPorCamada)) {
      const { quadro, ancora } = porNivel.uhd;
      assert.ok([...quadro, ...ancora].every(v => v % 2 === 0), `${id}: layer ${camada} frame and anchor must be even`);
      assert.deepEqual(porNivel.hd.quadro, quadro.map(v => v / 2), `${id}: hd frame of ${camada}`);
    }
    for (const [nivel, quadros] of Object.entries(dados.quadros)) {
      const paginas = dados.paginas[nivel];
      assert.equal(quadros.length, total, `${id}: ${nivel} frame count`);
      for (const [i, [pagina, x, y, w, h]] of quadros.entries()) {
        const p = paginas[pagina];
        assert.ok(p, `${id}: ${nivel} frame ${i} on missing page ${pagina}`);
        assert.ok(x >= 0 && y >= 0 && x + w <= p.largura && y + h <= p.altura, `${id}: ${nivel} frame ${i} leaves its page`);
      }
      for (const p of paginas) {
        for (const passe of PASSES) if (p[passe]) assert.ok(existsSync(join(pasta, p[passe])), `${id}: ${p[passe]} missing`);
      }
    }
    for (const [nome, lista] of Object.entries(dados.pontos?.uhd ?? {})) assert.equal(lista.length, total, `${id}: point ${nome}`);
  }
});

test('atlas pages carry no metadata chunk (EXIF, XMP, ICC)', () => {
  const vistos = new Set();
  for (const { dados, pasta } of manifestos) {
    for (const paginas of Object.values(dados.paginas)) {
      for (const p of paginas) {
        for (const passe of PASSES) {
          if (!p[passe]) continue;
          const caminho = join(pasta, p[passe]);
          if (vistos.has(caminho)) continue;
          vistos.add(caminho);
          const { dados: bytes, blocos } = blocosRiff(caminho);
          for (const bloco of blocos) {
            assert.ok(['VP8 ', 'VP8L', 'VP8X', 'ALPH'].includes(bloco.nome), `${caminho}: chunk ${bloco.nome}`);
            // VP8X flags: ICC 0x20, EXIF 0x08, XMP 0x04
            if (bloco.nome === 'VP8X') assert.equal(bytes[bloco.inicio] & 0x2c, 0, `${caminho}: VP8X announces metadata`);
          }
        }
      }
    }
  }
  assert.ok(vistos.size > 0);
});

test('every asset has provenance: its script exists, the tools have allowed licences and no generative AI is used', () => {
  for (const { id, dados } of manifestos) {
    const caminho = join(raiz, dados.procedencia ?? `arte/procedencia/${id}.json`);
    assert.ok(existsSync(caminho), `${id}: no provenance at ${caminho}`);
    const procedencia = lerJson(caminho);
    assert.equal(procedencia.asset, id);
    assert.ok(existsSync(join(raiz, procedencia.script)), `${id}: script ${procedencia.script} not in the repository`);
    assert.ok(procedencia.ferramentas.length > 0, `${id}: no tools`);
    for (const ferramenta of procedencia.ferramentas) assert.ok(LICENCAS.has(ferramenta.licenca), `${id}: ${ferramenta.nome} under ${ferramenta.licenca}`);
    assert.deepEqual(procedencia.ia, [], `${id}: generative AI in a shipped asset (decision D04)`);
    assert.deepEqual(procedencia.fontesExternas, [], `${id}: external sources need their own licence review`);
  }
});

test('the phase atlas fits the phase budget, with the estimate the renderer allocation gives', () => {
  for (const [fase, pacote] of Object.entries(indice.pacotes ?? {})) {
    const caminho = join(pastaAssets, pacote.arquivo);
    const dados = lerJson(caminho);
    for (const [nivel, paginas] of Object.entries(dados.paginas)) {
      const pixels = paginas.reduce((soma, p) => soma + p.largura * p.altura, 0);
      // one layer in each of three texture arrays (RGBA8, R8, R8) per page, plus a full mip chain
      assert.equal(dados.orcamento[nivel].bytesGpuEstimados, Math.floor((pixels * 6 * 4) / 3), `${fase} ${nivel}: estimate`);
      assert.equal(dados.orcamento[nivel].camadas, paginas.length);
      assert.ok(dados.orcamento[nivel].bytesGpuEstimados <= TETO_GPU[nivel], `${fase} ${nivel}: ${dados.orcamento[nivel].bytesGpuEstimados / MIB} MiB over budget`);
      for (const p of paginas) for (const passe of PASSES) if (p[passe]) assert.ok(existsSync(join(caminho, '..', p[passe])), `${fase}: ${p[passe]} missing`);
    }
    for (const id of Object.keys(dados.assets)) {
      const { dados: m, pasta } = manifestos.find(item => item.id === id) ?? {};
      assert.ok(m, `${fase}: ${id} is in the package but not in the index`);
      assert.equal(m.pacote, pacote.arquivo, `${id}: manifest does not point at the package`);
      for (const paginas of Object.values(m.paginas)) {
        for (const p of paginas) assert.ok(join(pasta, p.cor).startsWith(join(caminho, '..')), `${id}: page ${p.cor} outside the package`);
      }
    }
  }
});

test('every sprite of the gray kit in phase 1 is in the phase package', () => {
  if (!indice.pacotes?.['fase-1']) return;
  for (const { id, dados } of manifestos) {
    if (dados.acabamento !== 'cinza' || !dados.fases.includes('fase-1') || ['terreno', 'interface'].includes(dados.tipo)) continue;
    assert.equal(dados.pacote, indice.pacotes['fase-1'].arquivo, `${id}: not packed with the phase`);
  }
});

test('every asset the design data names is in the index, in phase 1', () => {
  for (const [arquivo, lista] of [['unidades.json', 'unidades'], ['predios.json', 'predios']]) {
    const caminho = join(raiz, 'site/rts/dados', arquivo);
    if (!existsSync(caminho)) continue;
    for (const item of lerJson(caminho)[lista]) {
      const entrada = indice.assets[item.asset];
      assert.ok(entrada, `${arquivo}: ${item.nome} names ${item.asset}, which the art index does not have`);
      assert.ok(entrada.fases.includes('fase-1'), `${item.asset} is not in phase 1`);
    }
  }
});
