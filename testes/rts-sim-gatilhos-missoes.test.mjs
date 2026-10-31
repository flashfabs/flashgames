// The design front's missions (site/rts/dados/missoes/) compile against the real game data and their map's places
// and nodes, at every difficulty, with every group, text and warning resolved.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { compilarDados } from '../site/rts/js/sim/dados.js';
import { lerMapaDeArquivos } from '../site/rts/js/sim/mapa.js';
import { compilarMissao, textosDaMissao, rotulosDaMissao } from '../site/rts/js/sim/gatilhos.js';
import { nomesDosGrupos } from '../site/rts/js/telemetria/registro.js';

const dadosUrl = new URL('../site/rts/dados/', import.meta.url);
const lerJson = url => JSON.parse(readFileSync(url, 'utf8'));
const pastaMissoes = new URL('missoes/', dadosUrl);
const missoes = existsSync(pastaMissoes) ? readdirSync(pastaMissoes).filter(nome => nome.endsWith('.json')) : [];

function dadosReais() {
  const arquivo = nome => lerJson(new URL(`${nome}.json`, dadosUrl));
  return compilarDados({ unidades: arquivo('unidades'), predios: arquivo('predios'), economia: arquivo('economia'), pesquisas: arquivo('pesquisas'), armas: arquivo('armas') });
}

function mapaReal(id, dados) {
  const pasta = new URL(`mapas/${id}/`, dadosUrl);
  const cabecalho = lerJson(new URL('mapa.json', pasta));
  const camadas = new Uint8Array(readFileSync(new URL(cabecalho.camadas.arquivo, pasta)));
  return lerMapaDeArquivos({ cabecalho, camadas, entidades: lerJson(new URL('entidades.json', pasta)) }, dados);
}

test('there is a mission to check', () => {
  assert.ok(missoes.length >= 1, 'site/rts/dados/missoes/ has the sandbox mission');
});

for (const nome of missoes) {
  test(`mission ${nome} compiles against the data and its map at every difficulty`, () => {
    const missao = lerJson(new URL(nome, pastaMissoes));
    const dados = dadosReais();
    const mapa = mapaReal(missao.mapa, dados);
    const contexto = {
      tipos: dados.tipos,
      pesquisas: dados.pesquisas,
      lugares: { areas: mapa.areas, pontos: mapa.pontos, rotas: mapa.rotas },
      nos: mapa.nomesNos,
      times: mapa.camadas.bases.length,
      largura: mapa.camadas.largura,
      altura: mapa.camadas.altura,
    };
    for (const dificuldade of [0, 1, 2]) {
      const m = compilarMissao(missao, { ...contexto, dificuldade });
      assert.equal(m.gatilhos.length, missao.gatilhos.length);
    }
    // every map label the mission groups name exists on the map
    const etiquetas = new Set(mapa.entidades.map(e => e.etiqueta).filter(Boolean));
    for (const [grupo, uniao] of Object.entries(missao.grupos ?? {})) for (const etiqueta of uniao.etiquetas ?? uniao) assert.ok(etiquetas.has(etiqueta), `${grupo}: ${etiqueta} is on the map`);
    // the warning events count labels exactly as the play-test log does
    const rotulos = rotulosDaMissao(missao);
    assert.ok(rotulos.length > 0);
    assert.deepEqual(nomesDosGrupos(missao), rotulos);
    for (const g of missao.gatilhos) for (const a of g.acoes ?? g.faz ?? []) if (a.faz === 'aviso' || a.faz === 'criar') assert.ok(rotulos.includes(a.grupo), a.grupo);
    // every text id is listed once, objectives first
    const textos = textosDaMissao(missao);
    assert.equal(new Set(textos).size, textos.length);
    (missao.objetivos ?? []).forEach((o, k) => assert.equal(textos.indexOf(o.texto) <= k, true, o.texto));
  });
}
