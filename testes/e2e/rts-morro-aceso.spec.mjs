// The first mission, Morro Aceso (site/rts/dados/missoes/morro-aceso.json), played end to end in the page through the
// test hook, as the grey slice is in rts-fatia-partida.spec.mjs: defeat in every difficulty (the headquarters
// recycled, and 90 s with no base), and victory on Normal with the scripted player of rts-roteiro.mjs, which holds
// the base, escorts the Religador to the substation and holds it there while it re-powers; the replay of the whole
// match ends on the worker's checksum, and the play-test log (C15) reads in the pacing checker and in the lessons
// checker with the mission's own lessons. Victory in Easy and Hard is played in Node by rts-missoes-node.spec.mjs.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { validarRegistro, conferirRegistro } from '../../ferramentas/rts/ritmo/ritmo.mjs';
import { conferirLicoes, validarLicoes } from '../../ferramentas/rts/ritmo/licoes.mjs';
import { criarRoteiro, decidir, opcoesDaMissao, DECISAO_SEGUNDOS } from './rts-roteiro.mjs';

const SEGUNDO = 30;
const MINUTO = 60 * SEGUNDO;
const ler = caminho => JSON.parse(readFileSync(new URL(`../../site/rts/dados/${caminho}`, import.meta.url), 'utf8'));
const MISSAO = ler('missoes/morro-aceso.json');
const ENTIDADES_DO_MAPA = ler(`mapas/${MISSAO.mapa}/entidades.json`);
// the mission's dusk, the latest a match can last, in minutes per difficulty
const ANOITECER = { facil: 45, normal: 40, dificil: 35 };

/** Opens the mission with the hook and the clock paused. */
async function abrirMissao(page, dificuldade) {
  await page.goto(`/rts/?partida=morro-aceso&dificuldade=${dificuldade}&teste=1&atlas=0`);
  await page.waitForFunction(() => window.__rts?.estado?.atual, null, { timeout: 30000 });
  await page.evaluate(() => window.__rts.pronto);
  await page.evaluate(() => window.__rts.pausar(true));
  expect(await page.evaluate(() => window.__rts.entidades(e => e.dono === 0 && e.nome === 'escritorio-regional').length), 'the regional office').toBe(1);
}

const retrato = page => page.evaluate(() => window.__rts.retrato());
const minhas = (r, nome) => r.entidades.filter(e => e.dono === 0 && e.nome === nome);
const comando = (page, ordem) => page.evaluate(o => window.__rts.comando({ ...o, tipo: window.__rts.TIPO_COMANDO[o.tipo] }), ordem);
const avancar = (page, passos) => page.evaluate(n => window.__rts.avancar(n), passos);
const eventos = (page, nome) => page.evaluate(n => window.__rts.eventosDo(n), nome);
const terminou = async page => (await eventos(page, 'VITORIA')).length + (await eventos(page, 'DERROTA')).length > 0;

for (const dificuldade of ['facil', 'normal', 'dificil']) {
  test(`morro-aceso, ${dificuldade}: without headquarters, forward post or garage for 90 s the player loses`, async ({ page }) => {
    test.setTimeout(5 * 60 * 1000);
    await abrirMissao(page, dificuldade);
    const r = await retrato(page);
    await comando(page, { tipo: 'RECICLAR', unidades: [minhas(r, 'escritorio-regional')[0].id] });
    const fim = r.tick + 5 * MINUTO;
    let tick = r.tick;
    while (!(await terminou(page)) && tick < fim) tick = (await avancar(page, 10 * SEGUNDO)).tick;
    const derrota = await eventos(page, 'DERROTA');
    expect(derrota.length, 'DERROTA em até 5 min de jogo').toBeGreaterThan(0);
    expect(derrota[0].arg, 'a derrota é do jogador 0').toBe(0);
    expect(await eventos(page, 'VITORIA')).toHaveLength(0);
    const registro = await page.evaluate(() => window.__rts.registro());
    expect(validarRegistro(registro)).toEqual([]);
    expect(registro.eventos.find(e => e.tipo === 'fim')?.resultado ?? registro.resultado).toBe('derrota');
  });
}

test('morro-aceso, normal: escorting the Religador to the substation wins, its replay matches, and the log reads in both checkers', async ({ page }) => {
  test.setTimeout(15 * 60 * 1000);
  await abrirMissao(page, 'normal');
  const mapa = await page.evaluate(() => ({ tipos: window.__rts.estado.mapa.tipos.map(({ nome, custo, categoria }) => ({ nome, custo, categoria })) }));
  const roteiro = criarRoteiro(opcoesDaMissao('morro-aceso', ENTIDADES_DO_MAPA));
  let r = await retrato(page);
  const fim = r.tick + ANOITECER.normal * MINUTO;
  while (!(await terminou(page)) && r.tick < fim) {
    for (const ordem of decidir(r, roteiro, mapa)) await comando(page, ordem);
    r = await avancar(page, DECISAO_SEGUNDOS * SEGUNDO);
  }
  expect((await eventos(page, 'DERROTA')).length, 'derrota antes da vitória').toBe(0);
  const vitoria = await eventos(page, 'VITORIA');
  expect(vitoria.length, `VITORIA antes do anoitecer (${ANOITECER.normal} min)`).toBeGreaterThan(0);
  expect(vitoria[0].arg, 'a vitória é do jogador 0').toBe(0);
  test.info().annotations.push({ type: 'vitória', description: `aos ${(vitoria[0].tick / MINUTO).toFixed(1)} min de jogo` });
  const replay = await page.evaluate(() => window.__rts.conferirReplay());
  expect(replay.soma, 'a soma do worker no último passo').not.toBeNull();
  expect(replay.final, `o replay de ${(replay.tick / MINUTO).toFixed(1)} min dá a soma do worker`).toBe(replay.soma);
  const registro = await page.evaluate(() => window.__rts.registro());
  expect(validarRegistro(registro)).toEqual([]);
  const conferido = conferirRegistro(registro);
  expect(conferido.valido).toBe(true);
  expect(conferido.criterios.find(c => c.id === 'duracao').texto).toContain('vitoria');
  expect(conferido.criterios.find(c => c.id === 'avisoDeAtaque').passou, 'todo ataque de 6 ou mais avisado 10 s antes').toBe(true);
  for (const c of conferido.criterios) test.info().annotations.push({ type: `ritmo: ${c.nome}`, description: `${c.texto} (${c.passou === null ? 'sem dado' : c.passou ? 'passou' : 'não passou'})` });
  const licoes = { versao: 1, licoes: MISSAO.licoes };
  expect(validarLicoes(licoes)).toEqual([]);
  const resultado = conferirLicoes(registro, licoes);
  // what the scripted player does has to show in the log as the lessons it stands for: harvesting, taking the open
  // route through the floodplain and re-powering
  for (const id of ['coletar', 'escolher-rota', 'religar']) expect(resultado.find(l => l.id === id)?.aprendeu, `lição ${id} no registro`).toBe(true);
  test.info().annotations.push({ type: 'lições', description: resultado.map(l => `${l.id} ${l.aprendeu ? 'sim' : 'não'}`).join(', ') });
});
