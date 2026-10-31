// Game data (C5) and map files (C6): the validator turns the design front's readable integers into ticks and world
// units, refuses floats, typos and broken references, and every data set and map under site/rts/dados/ passes it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { compilarDados, CLASSE, BLINDAGEM, CONSTRUIDO_POR, tipoEstatico } from '../site/rts/js/sim/dados.js';
import { lerMapaDeArquivos, montarMapa, camadasEmTexto } from '../site/rts/js/sim/mapa.js';
import { CATEGORIA, FP } from '../site/rts/js/sim/contratos.js';
import { dadosExemplo, mapaExemplo } from './rts-sim-exemplo.mjs';

const pastaDados = new URL('../site/rts/dados/', import.meta.url);
const lerJson = url => JSON.parse(readFileSync(url, 'utf8'));

// ---------- C5 ----------

test('the example data compiles into ticks and world units', () => {
  const { tipos, economia, pesquisas, indice } = compilarDados(dadosExemplo());
  const guincho = tipos[indice.get('guincho-de-celulas')];
  assert.equal(guincho.categoria, CATEGORIA.UNIDADE);
  assert.equal(guincho.tempo, 600, '20 000 ms are 600 ticks');
  assert.equal(guincho.velocidade, Math.trunc((160 * FP) / 3000), '1.6 cells per second');
  assert.equal(guincho.raio, Math.trunc((4 * FP) / 10));
  assert.equal(guincho.classe, CLASSE.VEICULO);
  assert.equal(guincho.capacidade, 100);
  assert.equal(guincho.carregar, 120);
  const turma = tipos[indice.get('turma-de-linha')];
  assert.equal(turma.alcance, 4 * FP, 'range from its weapon, 40 tenths');
  assert.equal(turma.recarga, 30);
  assert.equal(turma.blindagem, BLINDAGEM.PESSOAL);
  const qg = tipos[indice.get('escritorio-regional')];
  assert.equal(qg.categoria, CATEGORIA.PREDIO);
  assert.deepEqual(qg.produz, [indice.get('guincho-de-celulas'), indice.get('equipe-de-manutencao')]);
  assert.equal(qg.raizRede, 1, 'the headquarters powers its own network');
  assert.equal(tipos[indice.get('poste')].raizRede, 0);
  assert.equal(tipos[indice.get('poste-avancado')].construidoPor, CONSTRUIDO_POR.UNIDADE);
  assert.deepEqual(tipos[indice.get('equipe-de-manutencao')].ergue, [indice.get('poste-avancado')]);
  assert.equal(tipos[indice.get('pilha')].categoria, CATEGORIA.RECURSO, 'built-in kinds come last');
  assert.equal(tipos.at(-1).categoria, CATEGORIA.FAISCA);
  assert.equal(indice.get('guincho-de-celulas'), 0, 'units first, in file order');
  assert.equal(economia.duracaoFaisca, 2700);
  assert.equal(economia.intervaloRajada, 3600);
  assert.equal(pesquisas[0].predio, indice.get('escritorio-regional'));
  assert.ok(Object.isFrozen(tipos[0]) && Object.isFrozen(tipos[0].produz));
  assert.deepEqual(Object.keys(tipoEstatico(qg)).sort(), ['capacidade', 'categoria', 'coletor', 'constroi', 'custo', 'deposito', 'ergue', 'exigeVentosa', 'faccao', 'filaConstrucao', 'limite', 'lotacao', 'nome', 'pegada', 'precisaRede', 'produz', 'raioConstrucao', 'raioRede', 'raizRede', 'requer', 'tempo', 'vida', 'visao', 'asset', 'arma'].sort());
});

test('the data validator refuses floats, ranges, unknown fields, odd milliseconds and broken references', () => {
  const caso = (mudar, padrao) => {
    const dados = dadosExemplo();
    mudar(dados);
    assert.throws(() => compilarDados(dados), padrao);
  };
  caso(d => (d.unidades.unidades[0].custo = 300.5), /custo: 300.5 não é inteiro/);
  caso(d => (d.unidades.unidades[0].visao = 40), /visao: 40 fora de/);
  caso(d => (d.unidades.unidades[0].cor = 'azul'), /cor: campo desconhecido/);
  caso(d => (d.unidades.unidades[0].tempoMs = 20050), /não é múltiplo de 100/);
  caso(d => (d.unidades.unidades[0].classe = 'tanque'), /classe: "tanque" não é um de/);
  caso(d => (d.predios.predios[0].produz = ['nave']), /"nave" não é uma unidade/);
  caso(d => (d.unidades.unidades[1].arma = 'laser'), /"laser" não está em armas.json/);
  caso(d => d.predios.predios.push({ ...d.predios.predios[1] }), /"poste" aparece duas vezes/);
  caso(d => delete d.unidades.unidades[0].coleta, /coletor sem o bloco coleta/);
  caso(d => (d.predios.predios[1].pegada = [0, 1]), /pegada/);
  caso(d => (d.economia.vento.avisoMs = 200000), /aviso da rajada/);
  caso(d => (d.unidades.versao = 2), /unidades.json: versão 2/);
  caso(d => (d.unidades.unidades[2].ergue = ['poste']), /"poste" não é construído por unidade/);
});

test('the design data under site/rts/dados/ passes the validator', t => {
  const arquivos = ['unidades', 'predios', 'economia', 'pesquisas', 'armas'];
  if (!existsSync(new URL('unidades.json', pastaDados))) return t.skip('the design data is not in the repository yet');
  const dados = {};
  for (const nome of arquivos) {
    const url = new URL(`${nome}.json`, pastaDados);
    if (existsSync(url)) dados[nome] = lerJson(url);
  }
  const { tipos } = compilarDados(dados);
  assert.ok(tipos.length > 2);
});

// ---------- C6 ----------

test('the example sandbox map reads into layers, nodes and starting entities', () => {
  const dados = compilarDados(dadosExemplo());
  const lido = lerMapaDeArquivos(mapaExemplo(), dados);
  const { camadas } = lido;
  assert.equal(camadas.largura, 48);
  assert.equal(camadas.nos.length, 2);
  assert.equal(camadas.ventosa[19 * 48 + 23], 1);
  assert.equal(camadas.nivel[19 * 48 + 23], 2);
  assert.equal(camadas.bloqueado[10 * 48 + 24], 1, 'the spur');
  assert.deepEqual(lido.faccoes, ['religadores', 'desligados']);
  assert.equal(lido.entidades.filter(e => e.tipo === dados.indice.get('pilha')).length, 6);
  const qg = lido.entidades.find(e => e.etiqueta === 'qg-sul');
  assert.deepEqual([qg.cx, qg.cy, qg.dono], [6, 31, 0]);
  const mapa = montarMapa(camadas);
  assert.equal(mapa.ventosa.length, 48 * 40);
  // the layers survive the base64 form replays and saves use
  const texto = { ...mapaExemplo(), camadas: camadasEmTexto(mapaExemplo().camadas) };
  assert.deepEqual(lerMapaDeArquivos(texto, dados).camadas.nivel, camadas.nivel);
});

test('the map validator refuses broken map files', () => {
  const dados = compilarDados(dadosExemplo());
  const caso = (mudar, padrao) => {
    const arquivos = mapaExemplo();
    mudar(arquivos);
    assert.throws(() => lerMapaDeArquivos(arquivos, dados), padrao);
  };
  caso(a => (a.camadas = a.camadas.subarray(10)), /camadas.bin: \d+ bytes/);
  caso(a => (a.cabecalho.camadas.ordem = ['solo', 'altura']), /falta a camada "passagem"/);
  caso(a => (a.camadas[48 * 40 + 20 * 48 + 20] = 3), /degrau de 2 níveis/);
  caso(a => (a.camadas[48 * 40 + 5 * 48 + 5] = 4), /altura = 4/);
  caso(a => a.entidades.entidades.push({ tipo: 'nave', dono: 0, x: 3, y: 3 }), /tipo "nave" não está nos dados/);
  caso(a => a.entidades.entidades.push({ tipo: 'poste', dono: 0, x: 7, y: 32 }), /já ocupada/);
  caso(a => a.entidades.entidades.push({ tipo: 'poste', dono: 0, x: 24, y: 8 }), /bloqueada/);
  caso(a => a.entidades.entidades.push({ tipo: 'pilha', dono: -1, x: 3, y: 3, no: 9 }), /nó 9 não existe/);
  caso(a => a.entidades.entidades.push({ tipo: 'poste', dono: 5, x: 3, y: 3 }), /dono 5/);
  caso(a => a.entidades.ventosas.push([5, 5]), /célula ventosa no nível 0/);
  caso(a => (a.cabecalho.jogadores[1].faccao = 'piratas'), /facção "piratas"/);
  caso(a => (a.entidades.entidades.at(-1).etiqueta = 'qg-sul'), /etiqueta repetida/);
  caso(a => (a.entidades.rotas.leste = [[99, 2]]), /rota leste/);
});

test('every map under site/rts/dados/mapas/ passes the map validator with the design data', t => {
  const pastaMapas = new URL('mapas/', pastaDados);
  if (!existsSync(pastaMapas) || !existsSync(new URL('unidades.json', pastaDados))) return t.skip('no maps or design data in the repository yet');
  const dados = {};
  for (const nome of ['unidades', 'predios', 'economia', 'pesquisas', 'armas']) {
    const url = new URL(`${nome}.json`, pastaDados);
    if (existsSync(url)) dados[nome] = lerJson(url);
  }
  const compilados = compilarDados(dados);
  const ids = readdirSync(pastaMapas).filter(nome => existsSync(new URL(`${nome}/mapa.json`, pastaMapas)));
  assert.ok(ids.length > 0, 'a map folder without mapa.json');
  for (const id of ids) {
    const pasta = new URL(`${id}/`, pastaMapas);
    const cabecalho = lerJson(new URL('mapa.json', pasta));
    assert.equal(cabecalho.id, id, `${id}: the id in mapa.json is the folder name`);
    const camadas = new Uint8Array(readFileSync(new URL(cabecalho.camadas.arquivo, pasta)));
    const entidades = lerJson(new URL('entidades.json', pasta));
    const lido = lerMapaDeArquivos({ cabecalho, camadas, entidades }, compilados);
    assert.equal(lido.camadas.bases.length, cabecalho.jogadores.length, id);
  }
});
