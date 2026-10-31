// The grey slice played end to end through the test hook, on the design front's sandbox (site/rts/dados/missoes/
// caixa-de-areia.json): the match starts with the player's base and the enemy camp, harvesters bring Carga, the
// headquarters builds and places buildings, a producer trains a unit, the army fights, and both end conditions
// are reached, defeat and victory, with the play-test log (C15) closing with that result and readable by the pacing
// checker. Orders go through the same commands the interface sends; the worker fast-forwards between them.
import { test, expect } from '@playwright/test';
import { validarRegistro, conferirRegistro } from '../../ferramentas/rts/ritmo/ritmo.mjs';

const SEGUNDO = 30;
const MINUTO = 60 * SEGUNDO;

/** Opens the sandbox with the hook and the clock paused; skips while the page does not open the sandbox yet. */
async function abrirCaixa(page) {
  await page.goto('/rts/?partida=caixa-de-areia&teste=1&atlas=0');
  await page.waitForFunction(() => window.__rts?.estado?.atual, null, { timeout: 30000 });
  await page.waitForFunction(() => window.__rts.versaoGancho >= 1, null, { timeout: 5000 }).catch(() => {});
  test.skip(!(await page.evaluate(() => window.__rts.versaoGancho >= 1)), 'a página ainda não liga o gancho (rts-interface)');
  await page.evaluate(() => window.__rts.pronto);
  await page.evaluate(() => window.__rts.pausar(true));
  const temQg = await page.evaluate(() => window.__rts.entidades(e => e.dono === 0 && e.nome === 'escritorio-regional').length > 0);
  test.skip(!temQg, 'a página ainda não abre a caixa de areia (rts-interface e rts-motor-economia)');
  const cargaInicial = await page.evaluate(() => window.__rts.retrato().recursos[0]);
  test.skip(cargaInicial === 0, 'a Carga inicial, a vitória e a derrota vêm dos gatilhos da missão, que entram com o avaliador da rts-motor-combate');
}

const retrato = page => page.evaluate(() => window.__rts.retrato());
const minhas = (r, nome) => r.entidades.filter(e => e.dono === 0 && e.nome === nome);
const deles = (r, nome) => r.entidades.filter(e => e.dono === 1 && (nome === undefined || e.nome === nome));
const comando = (page, ordem) => page.evaluate(o => window.__rts.comando({ ...o, tipo: window.__rts.TIPO_COMANDO[o.tipo] }), ordem);
const avancar = (page, passos) => page.evaluate(n => window.__rts.avancar(n), passos);
const tipoDe = (page, nome) => page.evaluate(n => window.__rts.tipoDe(n), nome);
const eventos = (page, nome) => page.evaluate(n => window.__rts.eventosDo(n), nome);
/** Deaths of one faction's entities so far (MORTE carries the dead entity's kind in arg). */
const mortesDa = (page, faccao) => page.evaluate(f => window.__rts.eventosDo('MORTE').filter(e => window.__rts.estado.mapa.tipos[e.arg]?.faccao === f).length, faccao);

/** Fast-forwards in steps until `condicao(retrato)` holds, or fails after `limite` ticks. */
async function avancarAte(page, condicao, limite, passo = 5 * SEGUNDO, descricao = 'a condição') {
  let r = await retrato(page);
  const fim = r.tick + limite;
  while (!condicao(r)) {
    if (r.tick >= fim) throw new Error(`${descricao} não aconteceu em ${Math.round(limite / SEGUNDO)} s de jogo`);
    r = await avancar(page, passo);
  }
  return r;
}

/** Queues a building at the headquarters, waits until it is ready and places it at the first free spot near the base. */
async function construir(page, nome, limite = 2 * MINUTO) {
  const tipo = await tipoDe(page, nome);
  expect(tipo, `tipo ${nome}`).toBeGreaterThanOrEqual(0);
  const qg = minhas(await retrato(page), 'escritorio-regional')[0];
  await comando(page, { tipo: 'PRODUZIR', unidades: [qg.id], arg: tipo });
  await avancarAte(page, r => r.filas.some(f => f.produtor === qg.id && f.faixas.CONSTRUCAO.estado === 'PRONTO'), limite, 5 * SEGUNDO, `${nome} pronto para pôr`);
  const antes = minhas(await retrato(page), nome).length;
  // a ring of spots around the headquarters, inside its network radius
  const cx = Math.floor(qg.x / 1024);
  const cy = Math.floor(qg.y / 1024);
  const lugares = [[4, -6], [5, -1], [-2, -7], [5, 3], [-6, -6], [1, -10], [8, -5], [8, 0], [-4, 3], [3, 6]];
  for (const [dx, dy] of lugares) {
    await comando(page, { tipo: 'CONSTRUIR', unidades: [qg.id], arg: tipo, x: (cx + dx) * 1024 + 512, y: (cy + dy) * 1024 + 512 });
    const r = await avancar(page, 2);
    if (minhas(r, nome).length > antes) return minhas(r, nome).at(-1);
  }
  throw new Error(`nenhum dos ${lugares.length} lugares perto do escritório aceitou ${nome}`);
}

test('the sandbox starts with the player base and the enemy camp', async ({ page }) => {
  await abrirCaixa(page);
  const r = await retrato(page);
  expect(minhas(r, 'escritorio-regional')).toHaveLength(1);
  expect(minhas(r, 'guincho-de-celulas')).toHaveLength(2);
  expect(minhas(r, 'equipe-de-manutencao')).toHaveLength(1);
  expect(minhas(r, 'turma-de-linha')).toHaveLength(4);
  for (const nome of ['carrocao-mae', 'barracao', 'ferraria-a-vapor']) expect(deles(r, nome), nome).toHaveLength(1);
  expect(r.recursos[0]).toBeGreaterThan(0);
});

test('a match: collect, build, produce and fight', async ({ page }) => {
  test.setTimeout(5 * 60 * 1000);
  await abrirCaixa(page);

  await test.step('harvesters bring Carga to the headquarters', async () => {
    const r = await retrato(page);
    const guinchos = minhas(r, 'guincho-de-celulas').map(e => e.id);
    const qg = minhas(r, 'escritorio-regional')[0];
    const pilhas = r.entidades.filter(e => e.nome === 'pilha').sort((a, b) => Math.hypot(a.x - qg.x, a.y - qg.y) - Math.hypot(b.x - qg.x, b.y - qg.y));
    expect(pilhas.length).toBeGreaterThan(0);
    await comando(page, { tipo: 'COLETAR', unidades: guinchos, alvo: pilhas[0].id });
    const inicio = r.recursos[0];
    const depois = await avancarAte(page, x => x.recursos[0] > inicio, 2 * MINUTO, 5 * SEGUNDO, 'a primeira carga entregue');
    expect(depois.recursos[0]).toBeGreaterThan(inicio);
    const pilha = depois.entidades.find(e => e.id === pilhas[0].id);
    expect(pilha?.carga ?? 0).toBeLessThan(255);
  });

  await test.step('the headquarters builds an accumulator and a barracks', async () => {
    const acumulador = await construir(page, 'acumulador');
    expect(acumulador.dono).toBe(0);
    const alojamento = await construir(page, 'alojamento-da-turma');
    await avancarAte(page, r => r.entidades.find(e => e.id === alojamento.id)?.progresso === 255, MINUTO, 5 * SEGUNDO, 'o alojamento terminado');
  });

  await test.step('the barracks trains a squad', async () => {
    const r = await retrato(page);
    const alojamento = minhas(r, 'alojamento-da-turma')[0];
    const antes = minhas(r, 'turma-de-linha').length;
    await comando(page, { tipo: 'PRODUZIR', unidades: [alojamento.id], arg: await tipoDe(page, 'turma-de-linha') });
    await avancarAte(page, x => minhas(x, 'turma-de-linha').length > antes, MINUTO, 2 * SEGUNDO, 'a turma nova');
    expect((await eventos(page, 'PRODUCAO_CONCLUIDA')).length).toBeGreaterThan(0);
    expect((await eventos(page, 'CONSTRUCAO_CONCLUIDA')).length).toBeGreaterThan(0);
  });

  await test.step('the army attacks the camp and kills an enemy', async () => {
    const r = await retrato(page);
    const exercito = r.entidades.filter(e => e.dono === 0 && ['turma-de-linha', 'soldador'].includes(e.nome)).map(e => e.id);
    const barracao = deles(r, 'barracao')[0];
    await comando(page, { tipo: 'ATACAR_MOVENDO', unidades: exercito, x: barracao.x, y: barracao.y });
    const antes = await mortesDa(page, 'desligados');
    let tick = r.tick;
    const fim = tick + 4 * MINUTO;
    while ((await mortesDa(page, 'desligados')) === antes && tick < fim) tick = (await avancar(page, 5 * SEGUNDO)).tick;
    expect((await eventos(page, 'TIRO')).length).toBeGreaterThan(0);
    expect(await mortesDa(page, 'desligados'), 'um inimigo morto em até 4 min de jogo').toBeGreaterThan(antes);
  });
});

test('defeat: without headquarters, forward post and maintenance crew the player loses', async ({ page }) => {
  test.setTimeout(5 * 60 * 1000);
  await abrirCaixa(page);
  const r = await retrato(page);
  const qg = minhas(r, 'escritorio-regional')[0];
  const equipe = minhas(r, 'equipe-de-manutencao')[0];
  const carrocao = deles(r, 'carrocao-mae')[0];
  // take the headquarters down and send the crew into the camp, the last two things that keep the player alive
  await comando(page, { tipo: 'RECICLAR', unidades: [qg.id] });
  await comando(page, { tipo: 'MOVER', unidades: [equipe.id], x: carrocao.x, y: carrocao.y });
  const fim = r.tick + 10 * MINUTO;
  let tick = r.tick;
  while ((await eventos(page, 'DERROTA')).length === 0 && tick < fim) tick = (await avancar(page, 10 * SEGUNDO)).tick;
  expect((await eventos(page, 'DERROTA')).length, 'DERROTA em até 10 min de jogo').toBeGreaterThan(0);
  expect(await eventos(page, 'VITORIA')).toHaveLength(0);
  const registro = await page.evaluate(() => window.__rts.registro());
  if (registro) {
    expect(validarRegistro(registro)).toEqual([]);
    expect(registro.eventos.find(e => e.tipo === 'fim')?.resultado ?? registro.resultado).toBe('derrota');
  }
});

test('victory: an army built at the base takes the camp down, and the log reads in the pacing checker', async ({ page }) => {
  test.setTimeout(10 * 60 * 1000);
  await abrirCaixa(page);
  const inicio = await retrato(page);
  const guinchos = minhas(inicio, 'guincho-de-celulas').map(e => e.id);
  const qg = minhas(inicio, 'escritorio-regional')[0];
  const pilhas = inicio.entidades.filter(e => e.nome === 'pilha').sort((a, b) => Math.hypot(a.x - qg.x, a.y - qg.y) - Math.hypot(b.x - qg.x, b.y - qg.y));
  await comando(page, { tipo: 'COLETAR', unidades: guinchos, alvo: pilhas[0].id });
  await construir(page, 'acumulador');
  const alojamento = await construir(page, 'alojamento-da-turma');
  const turma = await tipoDe(page, 'turma-de-linha');
  const guarda = { x: qg.x + 6 * 1024, y: qg.y - 6 * 1024 };
  await comando(page, { tipo: 'PONTO_DE_ENCONTRO', unidades: [alojamento.id], x: guarda.x, y: guarda.y });
  const acampamento = ['barracao', 'ferraria-a-vapor', 'carrocao-mae'];
  // a plain plan: keep the barracks busy, gather a dozen squads at the guard point, then take the camp building by building
  const fim = inicio.tick + 25 * MINUTO;
  let atacando = false;
  let r = await retrato(page);
  while ((await eventos(page, 'VITORIA')).length === 0 && (await eventos(page, 'DERROTA')).length === 0 && r.tick < fim) {
    const fila = r.filas.find(f => f.produtor === alojamento.id);
    if (fila && fila.faixas.UNIDADES.itens.length < 2 && r.recursos[0] >= 100) await comando(page, { tipo: 'PRODUZIR', unidades: [alojamento.id], arg: turma });
    const exercito = minhas(r, 'turma-de-linha');
    atacando ||= exercito.length >= 12 || r.tick - inicio.tick > 12 * MINUTO;
    const alvo = acampamento.map(nome => deles(r, nome)[0]).find(Boolean);
    const paradas = exercito.filter(e => e.bandeiras & 1).map(e => e.id);
    if (atacando && alvo && paradas.length > 0) await comando(page, { tipo: 'ATACAR', unidades: paradas, alvo: alvo.id });
    else if (!atacando && paradas.length > 0) await comando(page, { tipo: 'ATACAR_MOVENDO', unidades: paradas, x: guarda.x, y: guarda.y });
    r = await avancar(page, 10 * SEGUNDO);
  }
  expect((await eventos(page, 'DERROTA')).length, 'derrota antes da vitória').toBe(0);
  expect((await eventos(page, 'VITORIA')).length, 'VITORIA em até 25 min de jogo').toBeGreaterThan(0);
  const registro = await page.evaluate(() => window.__rts.registro());
  test.skip(registro === null, 'a página ainda não entrega o registro ao gancho');
  expect(validarRegistro(registro)).toEqual([]);
  const conferido = conferirRegistro(registro);
  expect(conferido.valido).toBe(true);
  expect(conferido.criterios.find(c => c.id === 'duracao').texto).toContain('vitoria');
  for (const c of conferido.criterios) test.info().annotations.push({ type: `ritmo: ${c.nome}`, description: `${c.texto} (${c.passou === null ? 'sem dado' : c.passou ? 'passou' : 'não passou'})` });
});
