// The play-test log (C15) sizes every attack wave, also one a computer team forms from units already on the map:
// that wave has no SURGIMENTO events, so the ONDA event carries the number of units in its alvo field. Without the
// number, a wave of 8 would count as 0 and slip past the stage E4 check (every attack of 6 or more warned 10 s ahead).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarRegistro } from '../site/rts/js/telemetria/registro.js';
import { EVENTO, TAMANHO_EVENTO, PASSOS_POR_SEGUNDO, SEM_ENTIDADE, alocarCamposRetrato } from '../site/rts/js/sim/contratos.js';
import { conferirRegistro } from '../ferramentas/rts/ritmo/ritmo.mjs';

const missao = { id: 'teste-ondas', grupos: {}, gatilhos: [{ id: 'a', quando: { se: 'tempo', segundos: 0 }, acoes: [{ faz: 'aviso', grupo: 'onda-1' }] }] };

function retrato(tick, eventos) {
  const registros = new Int32Array(eventos.length * TAMANHO_EVENTO);
  eventos.forEach((e, k) => registros.set(e, k * TAMANHO_EVENTO));
  return { t: 'retrato', tick, n: 0, ...alocarCamposRetrato(0), recursos: new Int32Array(2), lotacao: new Int32Array(4), filas: new Int32Array(0), eventos: registros };
}
// [tipo, tick, entidade, alvo, x, y, alvoX, alvoY, arg]
const aviso = tick => [EVENTO.AVISO_ATAQUE, tick, SEM_ENTIDADE, SEM_ENTIDADE, 0, 0, 0, 0, 0];
const onda = (tick, unidades) => [EVENTO.ONDA, tick, SEM_ENTIDADE, unidades, 0, 0, 0, 0, 0];

function registroCom(eventos) {
  const r = criarRegistro({ missao: missao.id, missaoDados: missao, tipos: [], agora: () => 'teste' });
  for (const [tick, lista] of eventos) r.anotarRetrato(retrato(tick, lista));
  return r.exportar();
}

test('a wave a team forms from the map is sized by the count in its ONDA event', () => {
  const s = PASSOS_POR_SEGUNDO;
  const exportado = registroCom([[10 * s, [aviso(10 * s)]], [22 * s, [onda(22 * s, 8)]]]);
  const evento = exportado.eventos.find(e => e.tipo === 'onda');
  assert.equal(evento.unidades, 8);
  const c = conferirRegistro({ ...exportado, eventos: [...exportado.eventos, { passo: 30 * s, tipo: 'fim', resultado: 'vitoria' }] }).criterios.find(x => x.id === 'avisoDeAtaque');
  assert.equal(c.passou, true, c.texto);
  assert.match(c.texto, /12\.0 s em 1 onda/);
});

test('a wave of 6 or more with a short warning fails, also when formed from the map', () => {
  const s = PASSOS_POR_SEGUNDO;
  const exportado = registroCom([[10 * s, [aviso(10 * s)]], [15 * s, [onda(15 * s, 7)]]]);
  const c = conferirRegistro(exportado).criterios.find(x => x.id === 'avisoDeAtaque');
  assert.equal(c.passou, false);
});

test('without a count the wave is still sized by its SURGIMENTO events, as missions spawn them', () => {
  const s = PASSOS_POR_SEGUNDO;
  const exportado = registroCom([[10 * s, [aviso(10 * s)]], [22 * s, [onda(22 * s, SEM_ENTIDADE)]]]);
  assert.equal(exportado.eventos.find(e => e.tipo === 'onda').unidades, 0);
});
