// The E3 pacing checker (ferramentas/rts/ritmo/) on synthetic play-test logs in the C15 version 1 format, its command
// line, and, once the design front ships it, the example log the game itself exports.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { conferirRegistro, conferirVarios, conferirE4, grupoDoArquivo, validarRegistro, mediana, JANELA_SEGUNDOS } from '../ferramentas/rts/ritmo/ritmo.mjs';

const PPS = 30;
const s = segundos => Math.round(segundos * PPS);
const CLI = new URL('../ferramentas/rts/ritmo/conferir-ritmo.mjs', import.meta.url).pathname;
const EXEMPLO = new URL('./rts-registro-exemplo.json', import.meta.url).pathname;

/** A 20-minute victory that meets every target unless an option changes it. */
function registro({ duracao = 20 * 60, tiro = 200, luta = 12, lados = [10, 10], comandoACada = 7, cemiterio = 11.5 * 60, coletores = 2, aviso = 15, resultado = 'vitoria', respostas = { diversao: 4, jogariaDeNovo: true, comentario: '' } } = {}) {
  const eventos = [];
  for (let t = 3; t < duracao; t += comandoACada) eventos.push({ passo: s(t), tipo: 'comando', comando: 1, n: 3, fila: 0, origem: 'mouse' });
  if (tiro !== null) eventos.push({ passo: s(tiro), tipo: 'tiro', atirador: 5, alvo: 9, x: 1, y: 1 });
  eventos.push({ passo: s(400), tipo: 'lutaInicio', luta: 1, x: 40, y: 40 });
  const ladosFim = Object.fromEntries(lados.map((n, k) => [String(k), { unidades: n, mortes: 3 }]));
  eventos.push({ passo: s(400 + luta + 5), tipo: 'lutaFim', luta: 1, x: 40, y: 40, lados: ladosFim, mortes: 6, duracaoPassos: s(luta) });
  eventos.push({ passo: s(500), tipo: 'aviso', grupo: 'onda-2', x: 10, y: 10 });
  eventos.push({ passo: s(500 + aviso), tipo: 'onda', grupo: 'onda-2', unidades: 8 });
  if (cemiterio !== null) eventos.push({ passo: s(cemiterio), tipo: 'noEsgotado', no: 'cemiterio-sul' });
  for (let k = 0; k < coletores; k++) eventos.push({ passo: s(600 + k), tipo: 'morte', tipoUnidade: 'religadores-coletor', dono: 0, coletor: 1 });
  eventos.push({ passo: s(610), tipo: 'morte', dono: 1, coletor: 1 });
  if (resultado) eventos.push({ passo: s(duracao), tipo: 'fim', resultado });
  eventos.sort((a, b) => a.passo - b.passo);
  return { versao: 1, tipo: 'registro-rts', missao: 'caixa-de-areia', jogadorLocal: 0, passosPorSegundo: PPS, duracaoPassos: s(duracao), resultado, janelaPassos: 300, respostas, eventos };
}

const criterio = (resultado, id) => resultado.criterios.find(c => c.id === id);

test('a match inside every band passes every criterion', () => {
  const r = conferirRegistro(registro());
  assert.equal(r.valido, true);
  for (const c of r.criterios) assert.equal(c.passou, true, `${c.id}: ${c.texto}`);
  assert.equal(criterio(r, 'primeiroTiro').texto, '3:20');
  assert.equal(criterio(r, 'luta10contra10').valor, 12);
  assert.equal(criterio(r, 'coletoresPerdidos').valor, 2, 'only the local player collectors');
  assert.equal(criterio(r, 'janelasSemComando').valor, 0);
});

test('each band edge fails on the right side', () => {
  assert.equal(criterio(conferirRegistro(registro({ tiro: 149 })), 'primeiroTiro').passou, false);
  assert.equal(criterio(conferirRegistro(registro({ tiro: 241 })), 'primeiroTiro').passou, false);
  assert.equal(criterio(conferirRegistro(registro({ tiro: 150 })), 'primeiroTiro').passou, true);
  assert.equal(criterio(conferirRegistro(registro({ luta: 21 })), 'luta10contra10').passou, false);
  assert.equal(criterio(conferirRegistro(registro({ luta: 7 })), 'luta10contra10').passou, false);
  assert.equal(criterio(conferirRegistro(registro({ cemiterio: 9 * 60 })), 'primeiroCemiterio').passou, false);
  assert.equal(criterio(conferirRegistro(registro({ coletores: 0 })), 'coletoresPerdidos').passou, false);
  assert.equal(criterio(conferirRegistro(registro({ coletores: 5 })), 'coletoresPerdidos').passou, false);
  assert.equal(criterio(conferirRegistro(registro({ duracao: 14 * 60, cemiterio: 11 * 60 })), 'duracao').passou, false);
  assert.equal(criterio(conferirRegistro(registro({ resultado: null })), 'duracao').passou, false, 'no end condition reached');
  assert.equal(criterio(conferirRegistro(registro({ resultado: 'encerrada' })), 'duracao').passou, false, 'closed from the menu');
  assert.equal(criterio(conferirRegistro(registro({ aviso: 9 })), 'avisoDeAtaque').passou, false);
});

test('windows without a command are counted in 15 s of simulation time, ignoring the last partial window', () => {
  assert.equal(JANELA_SEGUNDOS, 15);
  // one command every 20 s: windows 0..79, commands land in 60 of them
  const r = criterio(conferirRegistro(registro({ comandoACada: 20 })), 'janelasSemComando');
  assert.equal(r.valor, 20 / 80);
  assert.equal(r.passou, false);
  const quase = criterio(conferirRegistro(registro({ comandoACada: 16 })), 'janelasSemComando');
  assert.ok(quase.valor < 0.2, quase.texto);
});

test('fights outside 8 to 12 units a side are not a 10 against 10', () => {
  assert.equal(criterio(conferirRegistro(registro({ lados: [20, 10] })), 'luta10contra10').passou, null);
  assert.equal(criterio(conferirRegistro(registro({ lados: [8, 12] })), 'luta10contra10').passou, true);
  assert.equal(criterio(conferirRegistro(registro({ lados: [10, 10, 10] })), 'luta10contra10').passou, null);
});

test('missing data is "sem dado", except a long match that never emptied a graveyard', () => {
  assert.equal(criterio(conferirRegistro(registro({ tiro: null })), 'primeiroTiro').passou, null);
  assert.equal(criterio(conferirRegistro(registro({ cemiterio: null })), 'primeiroCemiterio').passou, false);
  assert.equal(criterio(conferirRegistro(registro({ cemiterio: null, duracao: 12 * 60 })), 'primeiroCemiterio').passou, null);
});

test('a wave without its warning fails the warning check', () => {
  const r = registro();
  r.eventos = r.eventos.filter(e => e.tipo !== 'aviso');
  const c = criterio(conferirRegistro(r), 'avisoDeAtaque');
  assert.equal(c.passou, false);
  assert.equal(c.texto, 'onda sem aviso');
});

test('the end-screen answers give the fun median and "would play again" from everyone', () => {
  assert.equal(criterio(conferirRegistro(registro({ respostas: null })), 'diversao').passou, null);
  assert.equal(criterio(conferirRegistro(registro({ respostas: { diversao: 3, jogariaDeNovo: true } })), 'diversao').passou, false);
  assert.equal(criterio(conferirRegistro(registro({ respostas: { diversao: 9, jogariaDeNovo: true } })), 'diversao').valor, null);
  const { resumo } = conferirVarios([registro({ respostas: { diversao: 3, jogariaDeNovo: true } }), registro({ respostas: { diversao: 4, jogariaDeNovo: true } }), registro({ respostas: { diversao: 5, jogariaDeNovo: false } })]);
  const diversao = resumo.find(c => c.id === 'diversao');
  assert.equal(diversao.valor, 4);
  assert.equal(diversao.passou, true);
  assert.equal(resumo.find(c => c.id === 'jogariaDeNovo').passou, false, 'one "no" fails it');
});

test('rejects logs it cannot read', () => {
  assert.deepEqual(validarRegistro(null), ['o registro não é um objeto JSON']);
  assert.match(validarRegistro({ versao: 2, eventos: [] })[0], /versão 2/);
  assert.match(validarRegistro({ versao: 1, tipo: 'outra-coisa', eventos: [] })[0], /não é um registro/);
  assert.match(validarRegistro({ versao: 1, eventos: [{ tipo: 'tiro' }] })[0], /sem "passo"/);
  assert.match(validarRegistro({ versao: 1, eventos: [{ tipo: 'a', passo: 5 }, { tipo: 'b', passo: 4 }] })[0], /fora de ordem/);
  assert.equal(conferirRegistro({ versao: 9 }).valido, false);
});

test('three logs pass on the median, and the warning on the worst match', () => {
  const { individuais, resumo } = conferirVarios([registro({ tiro: 140 }), registro({ tiro: 200 }), registro({ tiro: 230, aviso: 8 })]);
  assert.equal(individuais.length, 3);
  const tiro = resumo.find(c => c.id === 'primeiroTiro');
  assert.equal(tiro.valor, 200);
  assert.equal(tiro.passou, true);
  const aviso = resumo.find(c => c.id === 'avisoDeAtaque');
  assert.equal(aviso.valor, 8);
  assert.equal(aviso.passou, false);
  assert.equal(mediana([4, 1, 3, 2]), 2.5);
  assert.equal(mediana([]), null);
});

test('command line: exit 0 when all pass, 1 when one fails, 2 when unreadable', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'rts-ritmo-'));
  const bom = join(pasta, 'bom.json');
  const ruim = join(pasta, 'ruim.json');
  writeFileSync(bom, JSON.stringify(registro()));
  writeFileSync(ruim, JSON.stringify(registro({ tiro: 60 })));
  const rodar = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
  const ok = rodar(bom);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /Primeiro tiro: 3:20 \(meta 2:30 a 4:00\) passou/);
  assert.equal(rodar(ruim).status, 1);
  assert.equal(rodar(join(pasta, 'nao-existe.json')).status, 2);
  const varios = rodar(bom, bom, ruim, '--json');
  assert.equal(varios.status, 0, 'the median of 3:20, 3:20 and 1:00 passes');
  assert.equal(JSON.parse(varios.stdout).resumo.length, 9);
});

test('the example log the game exports reads clean', { skip: !existsSync(EXEMPLO) && 'testes/rts-registro-exemplo.json ainda não chegou da rts-design' }, () => {
  const r = conferirRegistro(JSON.parse(readFileSync(EXEMPLO, 'utf8')));
  assert.deepEqual(r.problemas, []);
  assert.equal(r.valido, true);
});

test('stage E4: novices and veterans by file name, briefings skipped, next phase and fun', () => {
  assert.equal(grupoDoArquivo('/x/novato-ana.json'), 'novato');
  assert.equal(grupoDoArquivo('C:\\x\\Veterana-bia.json'), 'veterano');
  assert.equal(grupoDoArquivo('registro-rts.json'), null);
  const comBriefing = r => ({ ...r, eventos: [{ passo: 1, tipo: 'briefingPulado', segundos: 3 }, ...r.eventos] });
  const proxima = (r, sim) => ({ ...r, respostas: { diversao: 4, jogariaProximaFase: sim } });
  const itens = [
    { nome: 'novato-a.json', registro: comBriefing(proxima(registro({ duracao: 21 * 60 }), true)) },
    { nome: 'novato-b.json', registro: proxima(registro({ duracao: 23 * 60 }), true) },
    { nome: 'novato-c.json', registro: proxima(registro({ duracao: 26 * 60, cemiterio: 11 * 60 }), false) },
    { nome: 'veterano-a.json', registro: proxima(registro({ duracao: 16 * 60 }), true) },
    { nome: 'veterano-b.json', registro: proxima(registro({ duracao: 17 * 60 }), true) },
    { nome: 'veterano-c.json', registro: proxima(registro({ duracao: 20 * 60 }), true) },
  ];
  const { criterios, semGrupo } = conferirE4(itens);
  const c = id => criterios.find(x => x.id === id);
  assert.equal(c('duracao-novato').valor, 23 * 60);
  assert.equal(c('duracao-novato').passou, true);
  assert.equal(c('duracao-veterano').valor, 17 * 60);
  assert.equal(c('duracao-veterano').passou, true);
  assert.equal(c('briefings').valor, 1);
  assert.equal(c('briefings').passou, true);
  assert.equal(c('proximaFase').valor, 5);
  assert.equal(c('proximaFase').passou, true, '5 of 6 is enough');
  assert.equal(c('diversao').passou, true);
  assert.deepEqual(semGrupo, []);
  const doisPularam = conferirE4([...itens.slice(0, 5), { ...itens[5], registro: comBriefing(itens[5].registro) }]);
  assert.equal(doisPularam.criterios.find(x => x.id === 'briefings').passou, false);
  const doisNao = conferirE4([...itens.slice(0, 5), { ...itens[5], registro: proxima(itens[5].registro, false) }]);
  assert.equal(doisNao.criterios.find(x => x.id === 'proximaFase').passou, false);
});
