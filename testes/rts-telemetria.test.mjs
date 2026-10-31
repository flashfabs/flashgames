// Play-test log (contract C15): a scripted match of snapshots and events goes through the log and comes out with the
// pace numbers stage E3 checks. The same match is the example the pace checker is written against
// (testes/rts-registro-exemplo.json); refresh it with ATUALIZAR_EXEMPLO=1 node --test testes/rts-telemetria.test.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { criarRegistro, nomesDosGrupos, JANELA_PASSOS, VERSAO_REGISTRO } from '../site/rts/js/telemetria/registro.js';
import { EVENTO, TAMANHO_EVENTO, FP, TIPO_COMANDO } from '../site/rts/js/sim/contratos.js';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const ler = caminho => JSON.parse(readFileSync(raiz + caminho, 'utf8'));
const dados = { unidades: ler('site/rts/dados/unidades.json').unidades, predios: ler('site/rts/dados/predios.json').predios };
const mapa = ler('site/rts/dados/mapas/caixa-de-areia/entidades.json');
const missao = ler('site/rts/dados/missoes/caixa-de-areia.json');
const caminhoExemplo = `${raiz}testes/rts-registro-exemplo.json`;

// provisional codes for the warning events until the C3 enum carries them
const CODIGOS = { AVISO_ATAQUE: EVENTO.AVISO_ATAQUE ?? 101, ONDA: EVENTO.ONDA ?? 102 };
const tipo = nome => [...dados.unidades, ...dados.predios].findIndex(t => t.nome === nome);
const grupo = nome => nomesDosGrupos(missao).indexOf(nome);

// A tiny world: entities by id with owner and kind, and a list of events per tick.
function criarMundo() {
  const vivos = new Map();
  let proximo = 1;
  const nascer = (dono, nomeTipo) => {
    const id = proximo++;
    vivos.set(id, { dono, tipo: tipo(nomeTipo) });
    return id;
  };
  const retrato = (tick, eventos = []) => {
    const ids = [...vivos.keys()];
    const r = { tick, n: ids.length, id: Int32Array.from(ids), dono: Uint8Array.from(ids.map(i => vivos.get(i).dono)), tipo: Uint16Array.from(ids.map(i => vivos.get(i).tipo)), eventos: new Int32Array(eventos.length * TAMANHO_EVENTO) };
    eventos.forEach((e, k) => r.eventos.set(e, k * TAMANHO_EVENTO));
    return r;
  };
  return { vivos, nascer, retrato };
}

const ev = (tipoEvento, tick, entidade = -1, alvo = -1, x = 0, y = 0, ax = 0, ay = 0, arg = 0) => [tipoEvento, tick, entidade, alvo, x * FP, y * FP, ax * FP, ay * FP, arg];

// The scripted sandbox match: harassment at 2:46 kills a harvester, a warned wave of 5, a warned wave of 10 that meets
// 10 of the player's in a 13 s fight, the base yard running dry at 11:30 and a win at 20:00.
function jogarPartida() {
  const registro = criarRegistro({ missao: 'caixa-de-areia', jogadorLocal: 0, dados, mapa, missaoDados: missao, versoes: { registro: VERSAO_REGISTRO }, agora: () => '2026-10-31T00:00:00.000Z', codigos: CODIGOS });
  const mundo = criarMundo();
  const guinchos = [mundo.nascer(0, 'guincho-de-celulas'), mundo.nascer(0, 'guincho-de-celulas')];
  const turmas = Array.from({ length: 10 }, () => mundo.nascer(0, 'turma-de-linha'));
  registro.anotarRetrato(mundo.retrato(0));

  // the player gives an order every 4 s for the first 3 minutes, then every 8 s, with a 60 s lull at 12:00
  let tick = 0;
  let ultimoComando = 0;
  const avancarAte = alvo => {
    while (tick < alvo) {
      tick += 30;
      const intervalo = tick < 5400 ? 120 : 240;
      const calmaria = tick >= 21600 && tick < 23400;
      if (tick - ultimoComando >= intervalo && !calmaria) {
        ultimoComando = tick;
        registro.anotarComando({ tipo: TIPO_COMANDO.MOVER, unidades: turmas.slice(0, 3), fila: 0 }, 'mouse');
      }
      registro.anotarRetrato(mundo.retrato(tick));
    }
  };

  avancarAte(4980);
  const rolimas = [mundo.nascer(1, 'rolima'), mundo.nascer(1, 'rolima')];
  registro.anotarRetrato(mundo.retrato(4980, [ev(CODIGOS.ONDA, 4980, -1, -1, 64, 17, 64, 17, grupo('onda-1')), ...rolimas.map(id => ev(EVENTO.SURGIMENTO, 4980, id, -1, 62, 16, 62, 16, tipo('rolima')))]));
  tick = 4980;
  avancarAte(5790);
  // the scouts shoot a harvester for 20 s until it dies, then the infantry kills them
  for (let t = 5790; t <= 6390; t += 18) registro.anotarRetrato(mundo.retrato(t, rolimas.map(r => ev(EVENTO.TIRO, t, r, guinchos[0], 20, 66, 22, 69))));
  mundo.vivos.delete(guinchos[0]);
  registro.anotarRetrato(mundo.retrato(6400, [ev(EVENTO.MORTE, 6400, guinchos[0], rolimas[0], 22, 69, 22, 69, tipo('guincho-de-celulas'))]));
  for (let t = 6420; t <= 6600; t += 30) registro.anotarRetrato(mundo.retrato(t, turmas.slice(0, 4).map(a => ev(EVENTO.TIRO, t, a, rolimas[0], 20, 70, 21, 67))));
  for (const r of rolimas) mundo.vivos.delete(r);
  registro.anotarRetrato(mundo.retrato(6610, rolimas.map(r => ev(EVENTO.MORTE, 6610, r, turmas[0], 21, 67, 21, 67, tipo('rolima')))));
  tick = 6610;

  avancarAte(9990);
  registro.anotarRetrato(mundo.retrato(10000, [ev(CODIGOS.AVISO_ATAQUE, 10000, -1, -1, 14, 62, 14, 62, grupo('onda-2'))]));
  tick = 10000;
  avancarAte(10440);
  const onda2 = Array.from({ length: 5 }, (_, k) => mundo.nascer(1, k < 4 ? 'chapa' : 'rolima'));
  registro.anotarRetrato(mundo.retrato(10450, [ev(CODIGOS.ONDA, 10450, -1, -1, 81, 31, 81, 31, grupo('onda-2')), ...onda2.map(id => ev(EVENTO.SURGIMENTO, 10450, id, -1, 81, 31, 81, 31, 0))]));
  tick = 10450;
  avancarAte(12000);
  for (const id of onda2) mundo.vivos.delete(id);
  registro.anotarRetrato(mundo.retrato(12010, onda2.map(id => ev(EVENTO.MORTE, 12010, id, turmas[1], 40, 66, 40, 66, tipo('chapa')))));
  tick = 12010;

  // the base yard: five piles of node 0 run dry between 9:00 and 11:30
  avancarAte(16200);
  const indiceNo = mapa.nos.findIndex(n => n.id === 'cemiterio-sudoeste');
  for (const [k, t] of [16200, 17400, 18600, 19800, 20700].entries()) {
    avancarAte(t);
    registro.anotarRetrato(mundo.retrato(t + k * 0, [ev(EVENTO.RECURSO_ESGOTADO, t, 9000 + k, -1, 23, 72, 23, 72, indiceNo)]));
  }

  avancarAte(21000);
  registro.anotarRetrato(mundo.retrato(21000, [ev(CODIGOS.AVISO_ATAQUE, 21000, -1, -1, 14, 62, 14, 62, grupo('onda-4'))]));
  tick = 21000;
  avancarAte(21450);
  const onda4 = Array.from({ length: 10 }, (_, k) => mundo.nascer(1, k < 6 ? 'chapa' : k < 8 ? 'arpoador' : 'carro-vela'));
  registro.anotarRetrato(mundo.retrato(21450, [ev(CODIGOS.ONDA, 21450, -1, -1, 81, 31, 81, 31, grupo('onda-4')), ...onda4.map(id => ev(EVENTO.SURGIMENTO, 21450, id, -1, 81, 31, 81, 31, 0))]));
  tick = 21450;
  avancarAte(22500);
  // 10 against 10 at the north ramp, 13 s of shots both ways; the wave dies, the player loses 4
  for (let t = 22500; t <= 22890; t += 30) {
    const vivos4 = onda4.filter(id => mundo.vivos.has(id));
    const vivosT = turmas.filter(id => mundo.vivos.has(id));
    const tiros = [...vivosT.map((a, k) => ev(EVENTO.TIRO, t, a, vivos4[k % vivos4.length], 14, 66, 14, 62)), ...vivos4.map((a, k) => ev(EVENTO.TIRO, t, a, vivosT[k % vivosT.length], 14, 62, 14, 66))];
    const mortes = [];
    if (t % 90 === 0 && vivos4.length > 1) {
      mundo.vivos.delete(vivos4[0]);
      mortes.push(ev(EVENTO.MORTE, t, vivos4[0], vivosT[0], 14, 62, 14, 62, tipo('chapa')));
    }
    if (t % 270 === 0 && vivosT.length > 6) {
      mundo.vivos.delete(vivosT[0]);
      mortes.push(ev(EVENTO.MORTE, t, vivosT[0], vivos4[0], 14, 66, 14, 66, tipo('turma-de-linha')));
    }
    registro.anotarRetrato(mundo.retrato(t, [...tiros, ...mortes]));
  }
  const restantes = onda4.filter(id => mundo.vivos.has(id));
  for (const id of restantes) mundo.vivos.delete(id);
  registro.anotarRetrato(mundo.retrato(22890, restantes.map(id => ev(EVENTO.MORTE, 22890, id, turmas[9], 14, 62, 14, 62, tipo('chapa')))));
  tick = 22890;

  avancarAte(36000);
  registro.anotarRetrato(mundo.retrato(36000, [ev(EVENTO.VITORIA, 36000, -1, -1, 0, 0, 0, 0, 0)]));
  registro.anotar('respostas', { diversao: 4, jogariaDeNovo: true, comentario: '' });
  return registro.exportar();
}

const exportado = jogarPartida();

test('the log carries its contract header', () => {
  assert.equal(exportado.versao, VERSAO_REGISTRO);
  assert.equal(exportado.tipo, 'registro-rts');
  assert.equal(exportado.missao, 'caixa-de-areia');
  assert.equal(exportado.mapa, 'caixa-de-areia');
  assert.equal(exportado.passosPorSegundo, 30);
  assert.equal(exportado.janelaPassos, JANELA_PASSOS);
  assert.equal(exportado.duracaoPassos, 36000);
  assert.equal(exportado.resultado, 'vitoria');
  assert.deepEqual(exportado.respostas, { diversao: 4, jogariaDeNovo: true, comentario: '' });
  for (let k = 1; k < exportado.eventos.length; k++) assert.ok(exportado.eventos[k].passo >= exportado.eventos[k - 1].passo, 'eventos fora de ordem');
});

test('first shot between enemies, not counting anything earlier', () => {
  assert.equal(exportado.resumo.primeiroTiroPasso, 5790);
  const segundos = exportado.resumo.primeiroTiroPasso / 30;
  assert.ok(segundos >= 150 && segundos <= 240, 'o exemplo cai na faixa de 2:30 a 4:00');
});

test('fights are clustered in space and time, with units and deaths per side', () => {
  const { lutas } = exportado.resumo;
  assert.equal(lutas.length, 2);
  const grande = lutas.find(l => l.lados[0]?.unidades === 10 && l.lados[1]?.unidades === 10);
  assert.ok(grande, 'a luta de 10 contra 10 está no resumo');
  assert.equal(grande.duracaoPassos, 390);
  assert.ok(grande.lados[1].mortes >= 4 && grande.lados[0].mortes >= 1);
  // the harassment is one fight: two scouts on a harvester, then four rifles on the scouts within 5 s and 10 cells
  assert.deepEqual(lutas[0].lados, { 0: { unidades: 5, mortes: 1 }, 1: { unidades: 2, mortes: 2 } });
  assert.equal(grande.lados[1].mortes, 10);
});

test('harvesters lost, yard dry, warned attacks', () => {
  const { resumo } = exportado;
  assert.equal(resumo.coletoresPerdidos, 1);
  assert.deepEqual(resumo.cemiteriosEsgotados, [{ no: 'cemiterio-sudoeste', passo: 20700 }]);
  assert.equal(resumo.primeiroCemiterioEsgotadoPasso, 20700);
  const porGrupo = Object.fromEntries(resumo.ataques.map(a => [a.grupo, a]));
  assert.deepEqual(porGrupo['onda-2'], { grupo: 'onda-2', avisoPasso: 10000, ondaPasso: 10450, unidades: 5, avisoSegundos: 15, primeiroTiroPasso: null });
  assert.equal(porGrupo['onda-4'].unidades, 10);
  assert.equal(porGrupo['onda-4'].avisoSegundos, 15);
  assert.equal(porGrupo['onda-4'].primeiroTiroPasso, 22500);
  assert.equal(porGrupo['onda-1'].avisoPasso, null, 'o assédio de 2 não tem aviso');
});

test('windows without a command count whole 15 s windows of game time', () => {
  const { janelas } = exportado.resumo;
  assert.equal(janelas.total, 80);
  // one window during the scripted harassment and three of the 60 s lull (the order sent at its last tick runs on the
  // next one, inside the fourth window)
  assert.equal(janelas.semComando, 4);
  assert.equal(janelas.porcentoSemComando, 5);
});

test('group indexes follow the mission: declared groups first, then created ones in trigger order', () => {
  assert.deepEqual(nomesDosGrupos(missao).slice(0, 5), ['acampamento', 'guarnicao', 'canhao-fixo', 'onda-1', 'onda-2']);
});

test('the committed example is this match', () => {
  const texto = JSON.stringify(exportado, null, 1) + '\n';
  if (process.env.ATUALIZAR_EXEMPLO) writeFileSync(caminhoExemplo, texto);
  assert.equal(readFileSync(caminhoExemplo, 'utf8'), texto, 'rode ATUALIZAR_EXEMPLO=1 node --test testes/rts-telemetria.test.mjs');
});
