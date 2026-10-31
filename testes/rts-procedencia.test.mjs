// Contract C13: every asset of the art index has a provenance record in arte/procedencia/ (authors, method, script,
// tools, AI models with licence, prompt and seed, outside sources, human edits), and every licence in it is on the
// allowed list of testes/rts-licencas.json. No record is left without its asset. Prompt texts also go through the
// originality test, like every other text in the repository.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = new URL('../', import.meta.url).pathname;
const PROCEDENCIA = join(RAIZ, 'arte/procedencia');
const lerJson = caminho => JSON.parse(readFileSync(caminho, 'utf8'));
const licencas = lerJson(join(RAIZ, 'testes/rts-licencas.json'));
const indice = lerJson(join(RAIZ, 'site/rts/assets/indice.json'));
const assets = Object.keys(indice.assets ?? {});
const registros = readdirSync(PROCEDENCIA)
  .filter(arquivo => arquivo.endsWith('.json'))
  .map(arquivo => ({ arquivo, json: lerJson(join(PROCEDENCIA, arquivo)) }));

const textoCheio = valor => typeof valor === 'string' && valor.trim().length > 0;

test('the licence list has the allowed licences per use', () => {
  assert.equal(licencas.versao, 1);
  for (const lista of ['ferramentas', 'ia', 'fontesExternas', 'pedemAtribuicao']) assert.ok(Array.isArray(licencas[lista]) && licencas[lista].length > 0, lista);
  for (const licenca of licencas.pedemAtribuicao) assert.ok(licencas.fontesExternas.includes(licenca), `${licenca} pede atribuição mas não está nas fontes permitidas`);
  for (const pendente of Object.keys(licencas.pendentes ?? {})) {
    for (const lista of ['ferramentas', 'ia', 'fontesExternas']) assert.ok(!licencas[lista].includes(pendente), `${pendente} está pendente e permitida ao mesmo tempo`);
  }
});

test('every indexed asset has its provenance record, and every record its asset', () => {
  const nomes = new Set(registros.map(({ arquivo }) => arquivo.replace(/\.json$/, '')));
  assert.deepEqual(assets.filter(nome => !nomes.has(nome)), [], 'assets sem procedência');
  assert.deepEqual([...nomes].filter(nome => !assets.includes(nome)), [], 'procedência sem asset no índice');
});

test('each record has authors, method, tools and human edits, and its script exists', () => {
  for (const { arquivo, json } of registros) {
    assert.equal(json.versao, 1, arquivo);
    assert.equal(`${json.asset}.json`, arquivo, `${arquivo}: campo asset`);
    assert.ok(textoCheio(json.autoria), `${arquivo}: autoria`);
    assert.ok(textoCheio(json.metodo), `${arquivo}: metodo`);
    assert.ok(textoCheio(json.edicaoHumana), `${arquivo}: edicaoHumana (diga "nenhuma" quando não houver)`);
    if (json.script !== undefined) assert.ok(existsSync(join(RAIZ, json.script)), `${arquivo}: script ${json.script} não existe`);
    if (json.commit !== undefined) assert.match(json.commit, /^[0-9a-f]{7,40}$/, `${arquivo}: commit`);
    assert.ok(Array.isArray(json.ferramentas) && json.ferramentas.length > 0, `${arquivo}: ferramentas`);
    assert.ok(Array.isArray(json.ia), `${arquivo}: ia (lista vazia quando não houver)`);
    assert.ok(Array.isArray(json.fontesExternas), `${arquivo}: fontesExternas (lista vazia quando não houver)`);
  }
});

test('every licence in the records is on the allowed list', () => {
  for (const { arquivo, json } of registros) {
    for (const ferramenta of json.ferramentas ?? []) {
      assert.ok(textoCheio(ferramenta.nome) && textoCheio(ferramenta.versao), `${arquivo}: ferramenta sem nome ou versão`);
      assert.ok(licencas.ferramentas.includes(ferramenta.licenca), `${arquivo}: ${ferramenta.nome} com licença ${ferramenta.licenca}, fora da lista`);
    }
    for (const modelo of json.ia ?? []) {
      assert.ok(textoCheio(modelo.modelo), `${arquivo}: modelo de IA sem nome`);
      assert.ok(licencas.ia.includes(modelo.licenca), `${arquivo}: ${modelo.modelo} com licença ${modelo.licenca}, fora da lista`);
      assert.ok(textoCheio(modelo.prompt), `${arquivo}: ${modelo.modelo} sem prompt`);
      assert.ok(Number.isInteger(modelo.semente), `${arquivo}: ${modelo.modelo} sem semente inteira`);
    }
    for (const fonte of json.fontesExternas ?? []) {
      assert.ok(textoCheio(fonte.nome) || textoCheio(fonte.url), `${arquivo}: fonte externa sem nome nem endereço`);
      assert.ok(licencas.fontesExternas.includes(fonte.licenca), `${arquivo}: fonte ${fonte.nome ?? fonte.url} com licença ${fonte.licenca}, fora da lista`);
      if (licencas.pedemAtribuicao.includes(fonte.licenca)) assert.ok(textoCheio(fonte.autor) && textoCheio(fonte.atribuicao), `${arquivo}: ${fonte.licenca} pede autor e texto de atribuição`);
    }
  }
});

test('AI output that enters the game says what the human edit was', () => {
  for (const { arquivo, json } of registros) {
    if ((json.ia ?? []).length === 0) continue;
    assert.ok(!/^nenhuma/i.test(json.edicaoHumana), `${arquivo}: saída de IA sem edição humana substancial`);
  }
});
