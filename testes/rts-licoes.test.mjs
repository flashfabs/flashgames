// The stage E4 lessons checker (ferramentas/rts/ritmo/licoes.mjs) on synthetic play-test logs and a sample list in
// the format the design front writes next to each mission; the real list of a mission is checked once it exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { validarLicoes, conferirLicoes, conferirLicoesVarias, minimoDePessoas } from '../ferramentas/rts/ritmo/licoes.mjs';
import { TIPO_COMANDO } from '../site/rts/js/sim/contratos.js';

const PPS = 30;
const LISTA = {
  versao: 1,
  licoes: [
    { id: 'acumulador-cedo', texto: 'Construir na rede', momento: 'M1', se: { evento: 'construcao', campos: { tipoUnidade: 'acumulador' }, antesDeSegundos: 120 } },
    { id: 'atacar-mover', texto: 'Atacar-mover em grupo', momento: 'M2', se: { evento: 'comando', campos: { comando: TIPO_COMANDO.ATACAR_MOVENDO }, minimos: { n: 3 } } },
    { id: 'reuniao-e-fila', texto: 'Ponto de reunião e fila', momento: 'M1', se: { todas: [{ evento: 'comando', campos: { comando: TIPO_COMANDO.PONTO_DE_ENCONTRO } }, { evento: 'comando', campos: { comando: TIPO_COMANDO.PRODUZIR }, vezes: 2 }] } },
    { id: 'religar', texto: 'Religar estrutura', momento: 'M3', se: { alguma: [{ evento: 'religado' }, { evento: 'comando', campos: { comando: TIPO_COMANDO.HABILIDADE, arg: 1 } }] } },
  ],
};
const evento = (segundos, tipo, campos = {}) => ({ passo: Math.round(segundos * PPS), tipo, ...campos });
const registro = eventos => ({ versao: 1, tipo: 'registro-rts', passosPorSegundo: PPS, eventos });

test('a lesson list in the documented format is valid; broken ones are not', () => {
  assert.deepEqual(validarLicoes(LISTA), []);
  assert.match(validarLicoes({ versao: 2, licoes: [] })[0], /versao 1/);
  assert.match(validarLicoes({ versao: 1, licoes: [{ id: 'a', se: {} }, { id: 'a', se: { evento: 'x' } }] }).join(' '), /falta "evento".*repetido|repetido.*falta "evento"/);
});

test('each lesson is found by its condition, with the time it first showed', () => {
  const r = registro([
    evento(80, 'construcao', { tipoUnidade: 'acumulador' }),
    evento(90, 'comando', { comando: TIPO_COMANDO.PONTO_DE_ENCONTRO, n: 1 }),
    evento(100, 'comando', { comando: TIPO_COMANDO.PRODUZIR, n: 1 }),
    evento(130, 'comando', { comando: TIPO_COMANDO.ATACAR_MOVENDO, n: 2 }),
    evento(140, 'comando', { comando: TIPO_COMANDO.PRODUZIR, n: 1 }),
    evento(200, 'comando', { comando: TIPO_COMANDO.ATACAR_MOVENDO, n: 5 }),
  ]);
  const licoes = Object.fromEntries(conferirLicoes(r, LISTA).map(l => [l.id, l]));
  assert.equal(licoes['acumulador-cedo'].aprendeu, true);
  assert.equal(licoes['acumulador-cedo'].segundos, 80);
  assert.equal(licoes['atacar-mover'].segundos, 200, 'the 2-unit order does not count');
  assert.equal(licoes['reuniao-e-fila'].segundos, 140, 'both parts, the later one');
  assert.equal(licoes.religar.aprendeu, false);
  const tarde = conferirLicoes(registro([evento(121, 'construcao', { tipoUnidade: 'acumulador' })]), LISTA);
  assert.equal(tarde[0].aprendeu, false, 'after 2 min it does not count');
  const religou = conferirLicoes(registro([evento(500, 'comando', { comando: TIPO_COMANDO.HABILIDADE, arg: 1 })]), LISTA);
  assert.equal(religou[3].aprendeu, true);
});

test('a lesson passes when it shows in the logs of at least 4 of 6 people', () => {
  assert.equal(minimoDePessoas(6), 4);
  assert.equal(minimoDePessoas(3), 2);
  const aprendeu = registro([evento(60, 'construcao', { tipoUnidade: 'acumulador' })]);
  const nao = registro([]);
  const quatro = conferirLicoesVarias([aprendeu, aprendeu, aprendeu, aprendeu, nao, nao], LISTA);
  assert.equal(quatro[0].pessoas, 4);
  assert.equal(quatro[0].passou, true);
  assert.equal(quatro[1].passou, false);
  assert.equal(conferirLicoesVarias([aprendeu, aprendeu, aprendeu, nao, nao, nao], LISTA)[0].passou, false);
});

test('every lesson list of a mission in the repository is valid', () => {
  const pasta = new URL('../site/rts/dados/missoes/', import.meta.url);
  if (!existsSync(pasta)) return;
  for (const arquivo of readdirSync(pasta).filter(nome => nome.endsWith('.licoes.json'))) {
    assert.deepEqual(validarLicoes(JSON.parse(readFileSync(new URL(arquivo, pasta), 'utf8'))), [], arquivo);
  }
});
