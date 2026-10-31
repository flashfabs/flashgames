// The combat module's hooks in the core (fronts F1b and F1a): a raised basket sees farther, an ambusher standing still
// drops out of the enemy's view and snapshot until someone comes close, and a reader shows the enemy building's queue
// as if it were the reader's. With the design data, on a small open map.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { criarSimulacao, passo, agendarComando, REGRAS_LIVRES } from '../site/rts/js/sim/simulacao.js';
import { TIPO_COMANDO, FP, FL_PRODUTOR, TAMANHO_REGISTRO_FILA, criarComando, idDe } from '../site/rts/js/sim/contratos.js';
import { HABILIDADE } from '../site/rts/js/sim/habilidades.js';
import { celulaVisivel } from '../site/rts/js/sim/neblina.js';
import { vistaDoTime } from '../site/rts/js/sim/vista.js';
import { montarRetrato, montarMapaEstatico } from '../site/rts/js/sim/retrato.js';
import { salvar, carregar } from '../site/rts/js/sim/persistencia.js';
import { usarComportamentos } from '../site/rts/js/sim/equipes.js';
import { combateDe } from '../site/rts/js/sim/armas.js';

const dadosUrl = new URL('../site/rts/dados/', import.meta.url);
const dados = () => Object.fromEntries(['unidades', 'predios', 'economia', 'pesquisas', 'armas'].map(n => [n, JSON.parse(readFileSync(new URL(`${n}.json`, dadosUrl), 'utf8'))]));
const LARGURA = 40;
const ALTURA = 30;

// An open 40 x 30 map with rock only on the border, and the given entities at cell centres.
function partida(entidades) {
  const bloqueado = new Uint8Array(LARGURA * ALTURA);
  for (let x = 0; x < LARGURA; x++) bloqueado[x] = bloqueado[(ALTURA - 1) * LARGURA + x] = 1;
  for (let y = 0; y < ALTURA; y++) bloqueado[y * LARGURA] = bloqueado[y * LARGURA + LARGURA - 1] = 1;
  const base = criarSimulacao({ dados: dados(), mapa: { largura: LARGURA, altura: ALTURA, bloqueado, bases: [{ x: 5, y: 15 }, { x: 35, y: 15 }] }, unidades: [], regras: REGRAS_LIVRES, capacidade: 8 });
  const tipoDe = nome => base.tipos.findIndex(t => t.nome === nome);
  const unidades = entidades.map(([nome, time, cx, cy]) => ({ tipo: tipoDe(nome), time, x: cx * FP + 512, y: cy * FP + 512 }));
  return criarSimulacao({ dados: dados(), mapa: { largura: LARGURA, altura: ALTURA, bloqueado, bases: [{ x: 5, y: 15 }, { x: 35, y: 15 }] }, unidades, regras: REGRAS_LIVRES, capacidade: 64 });
}
const id = (sim, i) => idDe(i, sim.geracao[i]);
const rodar = (sim, passos) => {
  for (let k = 0; k < passos; k++) passo(sim);
};
const ordenar = (sim, campos) => agendarComando(sim, criarComando({ tick: sim.tick + 1, jogador: 0, seq: sim.tick, ...campos }));

test('a raised basket sees two cells farther, and its sight shrinks back when lowered', () => {
  const sim = partida([['cesto-blindado', 0, 10, 15]]);
  const celula = 15 * LARGURA + 18; // 8 cells east: past the basket's 7, within 7 + 2
  rodar(sim, 2);
  assert.equal(celulaVisivel(sim, 0, celula), false);
  ordenar(sim, { tipo: TIPO_COMANDO.HABILIDADE, unidades: [id(sim, 0)], arg: HABILIDADE.ERGUER });
  rodar(sim, 90);
  assert.equal(celulaVisivel(sim, 0, celula), true);
  ordenar(sim, { tipo: TIPO_COMANDO.HABILIDADE, unidades: [id(sim, 0)], arg: HABILIDADE.ERGUER });
  rodar(sim, 90);
  assert.equal(celulaVisivel(sim, 0, celula), false);
});

test('an ambusher standing still leaves the enemy view and snapshot, and shows again to a unit that comes close', () => {
  // a harvester (no weapon) 5 cells from the ambusher: it sees that far, the ambusher does not shoot that far
  const sim = partida([['guincho-de-celulas', 0, 10, 15], ['chapa', 1, 15, 15]]);
  const chapa = 1;
  const visto = () => ({
    vista: Array.from(vistaDoTime(sim, 0).inimigas.id).includes(id(sim, chapa)),
    retrato: Array.from(montarRetrato(sim, { jogadorLocal: 0 }).id).includes(id(sim, chapa)),
  });
  rodar(sim, 10);
  assert.deepEqual(visto(), { vista: true, retrato: true });
  rodar(sim, 100);
  assert.deepEqual(visto(), { vista: false, retrato: false }, 'hidden after standing still for 3 s');
  assert.equal(Array.from(montarRetrato(sim, { jogadorLocal: 1 }).id).includes(id(sim, chapa)), true, 'its own side still sees it');
  sim.x[0] = 14 * FP + 512;
  rodar(sim, 1);
  assert.deepEqual(visto(), { vista: true, retrato: true });
});

test('a reader shows the enemy building it reads in the queues of its own snapshot', () => {
  const sim = partida([['leiturista', 0, 20, 15], ['barracao', 1, 27, 15]]);
  const barracao = 1;
  const produtores = () => {
    const filas = montarRetrato(sim, { jogadorLocal: 0 }).filas;
    const lista = [];
    for (let k = 0; k < filas.length; k += TAMANHO_REGISTRO_FILA) lista.push(filas[k + FL_PRODUTOR]);
    return lista;
  };
  rodar(sim, 5);
  assert.deepEqual(produtores(), []);
  ordenar(sim, { tipo: TIPO_COMANDO.HABILIDADE, unidades: [id(sim, 0)], arg: HABILIDADE.LEITURA, alvo: id(sim, barracao) });
  rodar(sim, 30);
  assert.deepEqual(produtores(), [id(sim, barracao)]);
});

test('the static map names the weapons the effect events count, each kind its searchlight, and the light scenes', () => {
  const sim = partida([['cesto-blindado', 0, 10, 15]]);
  const mapa = montarMapaEstatico(sim, 0);
  const armas = JSON.parse(readFileSync(new URL('armas.json', dadosUrl), 'utf8')).armas;
  assert.deepEqual(mapa.armas.slice(0, armas.length).map(a => a.nome), armas.map(a => a.nome));
  assert.ok(mapa.armas.every(a => ['bala', 'perfurante', 'explosivo', 'pane'].includes(a.tipoDano) && Number.isInteger(a.raioArea) && (a.emArco === 0 || a.emArco === 1)));
  const predios = JSON.parse(readFileSync(new URL('predios.json', dadosUrl), 'utf8')).predios;
  for (const p of predios) assert.deepEqual(mapa.tipos.find(t => t.nome === p.nome).holofote, p.holofote ?? null, p.nome);
  assert.deepEqual(mapa.cenasLuz, [], 'no mission, no scenes');
});

test('a team deciding right after a load sees an ambusher exactly as the match that never stopped', () => {
  // team 1 records what its view shows of a player's ambusher; its cart stands 3 cells off, so it sees the ambusher's
  // cell but not the ambusher, then steps next to it between two ticks, right before the save
  const vistas = { original: [], carregada: [] };
  let destino = vistas.original;
  const anterior = usarComportamentos({ ativo: (_sim, time) => time === 1, decidir: ctx => destino.push(Array.from(ctx.vista.inimigas.id)) });
  try {
    const sim = partida([['chapa', 0, 15, 15], ['carroca-de-pedal', 1, 18, 15]]);
    // without its weapon the ambusher never shoots the cart, which would show it anyway
    const desarmar = s => (combateDe(s).armaDoTipo[s.tipo[0]] = -1);
    desarmar(sim);
    rodar(sim, 120);
    while (sim.tick % 10 !== 0) passo(sim);
    assert.equal(vistas.original.at(-1).includes(id(sim, 0)), false, 'hidden from 3 cells');
    sim.x[1] = 16 * FP + 512;
    const copia = carregar(salvar(sim));
    desarmar(copia);
    rodar(sim, 20);
    destino = vistas.carregada;
    rodar(copia, 20);
    assert.equal(vistas.carregada.length, 2);
    assert.deepEqual(vistas.carregada, vistas.original.slice(-2));
    assert.ok(vistas.carregada[0].includes(id(sim, 0)), 'the ambusher is seen from next to it');
  } finally {
    usarComportamentos(anterior);
  }
});
