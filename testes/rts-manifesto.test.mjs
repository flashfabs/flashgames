// Contract C9 from the delivery side: the art index (site/rts/assets/indice.json) and every sprite and terrain
// manifest it lists agree with each other and with the files on disk. Names follow the convention, every page file
// exists and carries the hash of its own content, frames fit their pages, the index's byte counts are the real
// sizes, and no file under the art folders is left out of a manifest. The renderer's own reading of the same
// manifests is in rts-render.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

const RAIZ = new URL('../', import.meta.url).pathname;
const ASSETS = join(RAIZ, 'site/rts/assets');
const PASTAS_DE_ARTE = ['sprites', 'terreno', 'interface', 'video'];
const NIVEIS = ['uhd', 'hd'];
const PASSES = ['cor', 'time', 'normal', 'sombra'];
// the first word of an asset name: a faction, or a kind that belongs to nobody
const PREFIXOS = ['religadores', 'desligados', 'faccao3', 'neutro', 'efeito', 'interface', 'terreno', 'teste'];
const NOME_ASSET = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ARQUIVO_PAGINA = /^(?<asset>[a-z0-9-]+)@(?<nivel>uhd|hd)(?:-p(?<pagina>\d+))?\.(?<passe>[a-z]+)\.(?<hash>[0-9a-f]{6})\.webp$/;

const lerJson = caminho => JSON.parse(readFileSync(caminho, 'utf8'));
const indice = lerJson(join(ASSETS, 'indice.json'));
const entradas = Object.entries(indice.assets ?? {});
const manifestos = new Map(entradas.map(([nome, entrada]) => [nome, lerJson(join(ASSETS, entrada.manifesto))]));
const projecao = lerJson(join(RAIZ, 'site/rts/dados/projecao.json'));
// Phase packages (the phase atlas): pages shared by the sprites of a phase, named after the phase, with their own
// manifest and byte counts; a sprite manifest with a pacote field lists the shared pages it uses.
const pacotes = Object.entries(indice.pacotes ?? {}).map(([fase, p]) => ({ fase, caminho: join(ASSETS, p.arquivo), entrada: p, dados: lerJson(join(ASSETS, p.arquivo)) }));
const faseDoPacote = new Map(pacotes.map(p => [relative(ASSETS, p.caminho), p.fase]));

/** Page files of a manifest by level: [{ arquivo, passe }] with paths relative to the assets folder. */
function arquivosDasPaginas(nome) {
  const m = manifestos.get(nome);
  const pasta = join(ASSETS, indice.assets[nome].manifesto, '..');
  const porNivel = {};
  for (const nivel of NIVEIS) {
    porNivel[nivel] = [];
    for (const pagina of m.paginas?.[nivel] ?? []) {
      for (const passe of PASSES) if (pagina[passe]) porNivel[nivel].push({ arquivo: join(pasta, pagina[passe]), passe, pagina });
    }
  }
  return porNivel;
}

function listarArquivos(pasta) {
  if (!existsSync(pasta)) return [];
  return readdirSync(pasta, { withFileTypes: true }).flatMap(item => (item.isDirectory() ? listarArquivos(join(pasta, item.name)) : [join(pasta, item.name)]));
}

test('the art index has a version and lists assets', () => {
  assert.equal(indice.versao, 1);
  assert.ok(entradas.length > 0);
});

test('asset names follow <faction or kind>-<category>-<name>, lowercase ASCII with hyphens', () => {
  for (const [nome, entrada] of entradas) {
    assert.match(nome, NOME_ASSET, nome);
    const [prefixo, segundo] = nome.split('-');
    assert.ok(PREFIXOS.includes(prefixo), `${nome}: começa com "${prefixo}", fora de ${PREFIXOS.join(', ')}`);
    if (['religadores', 'desligados', 'faccao3', 'neutro', 'teste'].includes(prefixo)) assert.equal(segundo, entrada.categoria, `${nome}: a categoria vem depois da facção`);
    assert.ok(entrada.manifesto.endsWith(`/${nome}.json`), `${nome}: manifesto ${entrada.manifesto}`);
  }
});

test('every manifest agrees with its index entry and with the projection', () => {
  for (const [nome, entrada] of entradas) {
    const m = manifestos.get(nome);
    assert.equal(m.versao, 1, nome);
    assert.equal(m.asset, nome);
    assert.equal(m.tipo, entrada.tipo, `${nome}: tipo`);
    assert.equal(m.categoria, entrada.categoria, `${nome}: categoria`);
    assert.deepEqual(m.fases, entrada.fases, `${nome}: fases`);
    assert.ok(Array.isArray(m.fases) && m.fases.length > 0, `${nome}: sem fase`);
    for (const passe of m.passes ?? []) assert.ok(PASSES.includes(passe), `${nome}: passe ${passe}`);
    assert.equal(m.procedencia, `arte/procedencia/${nome}.json`, `${nome}: procedência`);
    if (m.pxPorCelula) {
      for (const nivel of NIVEIS) {
        if (m.pxPorCelula[nivel] === undefined) continue;
        // a big set piece may ship hd frames in uhd too (the renderer scales by pxPorCelula), never sharper than the level
        assert.ok(Object.values(projecao.pxPorCelula).includes(m.pxPorCelula[nivel]) && m.pxPorCelula[nivel] <= projecao.pxPorCelula[nivel],
          `${nome}: pxPorCelula ${nivel} ${m.pxPorCelula[nivel]} fora dos níveis do projecao.json`);
      }
    }
  }
});

test('every page file exists, is named after its asset and level, and carries the hash of its content', () => {
  for (const [nome] of entradas) {
    const m = manifestos.get(nome);
    for (const [nivel, arquivos] of Object.entries(arquivosDasPaginas(nome))) {
      for (const { arquivo, passe, pagina } of arquivos) {
        assert.ok(existsSync(arquivo), `${nome}: falta ${relative(RAIZ, arquivo)}`);
        const partes = ARQUIVO_PAGINA.exec(arquivo.split('/').at(-1));
        assert.ok(partes, `${nome}: nome fora do padrão ${arquivo}`);
        assert.equal(partes.groups.asset, m.pacote ? faseDoPacote.get(m.pacote) : nome);
        assert.equal(partes.groups.nivel, nivel);
        assert.equal(partes.groups.passe, passe);
        const hash = createHash('sha256').update(readFileSync(arquivo)).digest('hex').slice(0, 6);
        assert.equal(partes.groups.hash, hash, `${nome}: ${relative(RAIZ, arquivo)} mudou depois de empacotado`);
        assert.ok(Number.isInteger(pagina.largura) && Number.isInteger(pagina.altura) && pagina.largura > 0 && pagina.altura > 0, `${nome}: tamanho da página`);
        if (m.tipo !== 'terreno') for (const p of m.passes) assert.ok(pagina[p], `${nome}: página ${nivel} sem o passe ${p}`);
      }
    }
  }
});

test('frames fit inside their pages and every level has the same frames', () => {
  for (const [nome] of entradas) {
    const m = manifestos.get(nome);
    if (m.tipo === 'terreno') continue;
    const contagens = NIVEIS.filter(n => m.quadros?.[n]).map(n => m.quadros[n].length);
    assert.ok(contagens.length > 0, `${nome}: sem quadros`);
    assert.ok(contagens.every(c => c === contagens[0]), `${nome}: níveis com quadros diferentes`);
    for (const nivel of NIVEIS) {
      for (const [k, quadro] of (m.quadros?.[nivel] ?? []).entries()) {
        const [pagina, x, y, largura, altura] = quadro;
        const folha = m.paginas[nivel][pagina];
        assert.ok(folha, `${nome} ${nivel} quadro ${k}: página ${pagina} não existe`);
        assert.ok(x >= 0 && y >= 0 && x + largura <= folha.largura && y + altura <= folha.altura, `${nome} ${nivel} quadro ${k}: fora da página`);
      }
    }
    for (const [animacao, a] of Object.entries(m.animacoes ?? {})) assert.ok(m.camadas.includes(a.camada ?? 'corpo'), `${nome}: ${animacao} usa a camada ${a.camada}`);
  }
});

test('the byte counts in the index and in each manifest are the real file sizes', () => {
  for (const { fase, caminho, entrada, dados } of pacotes) {
    for (const nivel of NIVEIS) {
      const bytes = (dados.paginas[nivel] ?? []).reduce((soma, p) => soma + PASSES.filter(passe => p[passe]).reduce((s, passe) => s + statSync(join(caminho, '..', p[passe])).size, 0), 0);
      assert.equal(dados.orcamento[nivel].bytesArquivos, bytes, `${fase}: orcamento.${nivel}.bytesArquivos`);
      assert.equal(entrada.bytes?.[nivel], bytes, `${fase}: bytes.${nivel} do pacote no índice`);
    }
  }
  for (const [nome, entrada] of entradas) {
    const m = manifestos.get(nome);
    // shared pages are counted once, in their package
    if (m.pacote) continue;
    for (const [nivel, arquivos] of Object.entries(arquivosDasPaginas(nome))) {
      if (arquivos.length === 0) continue;
      const bytes = arquivos.reduce((soma, { arquivo }) => soma + statSync(arquivo).size, 0);
      assert.equal(m.orcamento?.[nivel]?.bytesArquivos, bytes, `${nome}: orcamento.${nivel}.bytesArquivos`);
      assert.equal(entrada.bytes?.[nivel], bytes, `${nome}: bytes.${nivel} no índice`);
    }
  }
});

test('no file in the art folders is left out of the index', () => {
  const usados = new Set();
  for (const { caminho, dados } of pacotes) {
    usados.add(caminho);
    for (const paginas of Object.values(dados.paginas)) for (const p of paginas) for (const passe of PASSES) if (p[passe]) usados.add(join(caminho, '..', p[passe]));
  }
  for (const [nome, entrada] of entradas) {
    usados.add(join(ASSETS, entrada.manifesto));
    for (const arquivos of Object.values(arquivosDasPaginas(nome))) for (const { arquivo } of arquivos) usados.add(arquivo);
  }
  const soltos = PASTAS_DE_ARTE.flatMap(pasta => listarArquivos(join(ASSETS, pasta))).filter(arquivo => !usados.has(arquivo) && !arquivo.endsWith('.DS_Store'));
  assert.deepEqual(soltos.map(arquivo => relative(RAIZ, arquivo)), []);
});
