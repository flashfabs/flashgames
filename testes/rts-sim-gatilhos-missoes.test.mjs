// The design front's missions (site/rts/dados/missoes/) compile against the real game data and their map's places
// and nodes, at every difficulty, with every group, text and warning resolved, and play 20 minutes on their map with
// nobody at the controls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { compilarDados } from '../site/rts/js/sim/dados.js';
import { lerMapaDeArquivos } from '../site/rts/js/sim/mapa.js';
import { criarSimulacao, passo, REGRAS_LIVRES } from '../site/rts/js/sim/simulacao.js';
import { FP, EVENTO, TAMANHO_EVENTO, E_TIPO, E_ARG, DONO_NEUTRO } from '../site/rts/js/sim/contratos.js';
import { compilarMissao, textosDaMissao, rotulosDaMissao, rotular, resultadoDaMissao, RESULTADO } from '../site/rts/js/sim/gatilhos.js';
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

// The map's starting entities placed by hand, the neutral ones left out, until the core loads the C6 files itself.
function partidaDaMissao(missao, dificuldade) {
  const arquivos = Object.fromEntries(['unidades', 'predios', 'economia', 'pesquisas', 'armas'].map(nome => [nome, lerJson(new URL(`${nome}.json`, dadosUrl))]));
  const dados = compilarDados(arquivos);
  const mapa = mapaReal(missao.mapa, dados);
  const c = mapa.camadas;
  const iniciais = mapa.entidades.filter(e => e.dono >= 0 && e.dono !== DONO_NEUTRO);
  const sim = criarSimulacao({
    mapa: { largura: c.largura, altura: c.altura, bloqueado: c.bloqueado, relevo: c.relevo, nivel: c.nivel, bases: c.bases },
    dados: arquivos,
    missao,
    lugares: { areas: mapa.areas, pontos: mapa.pontos, rotas: mapa.rotas },
    dificuldade,
    regras: REGRAS_LIVRES,
    capacidade: 400,
    unidades: iniciais.map(e => ({ tipo: e.tipo, time: e.dono, x: e.cx * FP + FP / 2, y: e.cy * FP + FP / 2, direcao: 0 })),
  });
  sim.mapa.cobertura = c.cobertura;
  sim.mapa.nomesNos = mapa.nomesNos;
  iniciais.forEach((e, k) => e.etiqueta && rotular(sim, k, e.etiqueta));
  return sim;
}

for (const nome of missoes) {
  test(`mission ${nome} runs 20 minutes with nobody playing, every wave after its warning`, () => {
    const missao = lerJson(new URL(nome, pastaMissoes));
    const rotulos = rotulosDaMissao(missao);
    for (const dificuldade of ['facil', 'dificil']) {
      const sim = partidaDaMissao(missao, dificuldade);
      const avisos = new Map();
      let ondas = 0;
      let mensagens = 0;
      while (sim.tick < 20 * 60 * 30 && resultadoDaMissao(sim).every(r => r === RESULTADO.JOGANDO)) {
        passo(sim);
        for (let k = 0; k < sim.eventos.length; k += TAMANHO_EVENTO) {
          const tipo = sim.eventos[k + E_TIPO];
          const grupo = rotulos[sim.eventos[k + E_ARG]];
          if (tipo === EVENTO.MENSAGEM_MISSAO) mensagens++;
          if (tipo === EVENTO.AVISO_ATAQUE) avisos.set(grupo, sim.tick);
          if (tipo !== EVENTO.ONDA) continue;
          ondas++;
          if (avisos.has(grupo)) assert.ok(sim.tick - avisos.get(grupo) >= 10 * 30, `${dificuldade}: ${grupo} at least 10 s after its warning`);
        }
      }
      assert.ok(mensagens > 0, 'the radio talks');
      if (EVENTO.ONDA) assert.ok(ondas > 0, `${dificuldade}: waves came`);
    }
  });
}
