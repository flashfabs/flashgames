// The interface of the "Morro Aceso" mission in a real page (interface front): the maintenance crew repairs through
// the command card and the context click, and the overturned truck it brings back pays the rescue objective.
// The match runs paused and is moved ahead by the test hook (window.__rts.avancar), so every order lands on the same
// tick on every run.

import { test, expect } from '@playwright/test';

const MISSAO = '/rts/?partida=morro-aceso&dificuldade=facil&teste=1&atlas=0';
const SEGUNDO = 30;
const TECLAS = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyA', 'KeyS', 'KeyD', 'KeyF'];

async function abrirMissao(page, consulta = '') {
  await page.goto(MISSAO + consulta);
  await page.waitForFunction(() => window.__rts?.estado.atual?.n > 0 && window.__rts.versaoGancho && window.__rts.catalogo.tamanho > 0);
}

const ultimoComando = page => page.evaluate(() => window.__rts.comandos.at(-1));
const tecla = (page, code) => page.evaluate(c => dispatchEvent(new KeyboardEvent('keydown', { code: c, key: c, bubbles: true, cancelable: true })), code);
const doTipo = (page, nome) => page.evaluate(n => window.__rts.entidades(e => e.nome === n && e.dono === 0).map(e => e.id), nome);
const etiquetada = (page, nome) => page.evaluate(n => window.__rts.entidades(e => e.nome === n).map(e => e.id), nome);

/** Selects these ids as the player would, and refreshes the card. */
async function selecionar(page, ids) {
  await page.evaluate(lista => {
    const { selecionadas, controles } = window.__rts;
    selecionadas.clear();
    for (const id of lista) selecionadas.add(id);
    controles.executar({ acao: 'cancelar' });
  }, ids);
}

/** Centres the camera on an entity, waits two frames and returns its client pixel. */
async function naTela(page, id) {
  await page.evaluate(i => Object.assign(window.__rts.camera, window.__rts.indice.centro([i])), id);
  await page.evaluate(() => new Promise(pronto => requestAnimationFrame(() => requestAnimationFrame(pronto))));
  return page.evaluate(i => window.__rts.naTela(i), id);
}

/** Whether the cell of an entity was ever seen by the player (piles and structures can be targeted only then). */
const jaVista = (page, id) => page.evaluate(i => {
  const r = window.__rts;
  const a = r.estado.atual;
  const k = r.indice.k(i);
  return k >= 0 && a.visao[Math.floor(a.y[k] / r.FP) * r.estado.mapa.largura + Math.floor(a.x[k] / r.FP)] !== 0;
}, id);

test('the maintenance crew repairs from the card and the context click, and rescues the overturned truck', async ({ page }) => {
  await abrirMissao(page);
  await page.evaluate(() => window.__rts.pausar(true));
  // The convoy reaches the base, and the two Turmas clear the ambush around the truck.
  await page.evaluate(n => window.__rts.avancar(n), 20 * SEGUNDO);
  const turmas = await doTipo(page, 'turma-de-linha');
  const [equipe] = await doTipo(page, 'equipe-de-manutencao');
  const [caminhao] = await etiquetada(page, 'caminhao-tombado');
  expect(turmas.length).toBe(2);
  expect(equipe).toBeGreaterThan(0);
  expect(caminhao).toBeGreaterThan(0);
  await page.evaluate(ids => {
    const r = window.__rts;
    r.comando({ tipo: r.TIPO_COMANDO.ATACAR_MOVENDO, unidades: ids, x: r.celula(12), y: r.celula(58) });
  }, turmas);
  await expect.poll(async () => {
    await page.evaluate(() => window.__rts.avancar(150));
    return jaVista(page, caminhao);
  }, { timeout: 60_000, intervals: [100] }).toBe(true);
  await page.evaluate(n => window.__rts.avancar(n), 15 * SEGUNDO);

  // The card of the crew offers Reparar next to the forward post; its key aims, and Esc lets go.
  await selecionar(page, [equipe]);
  const casa = await page.evaluate(() => window.__rts.hud.cartao.slots.findIndex(s => s?.modo === 'reparar'));
  expect(casa).toBeGreaterThanOrEqual(0);
  await expect(page.locator(`#comandos .grade [data-slot="${casa}"]`)).toContainText('Reparar');
  await page.locator('#tela').focus();
  await tecla(page, TECLAS[casa]);
  await expect.poll(() => page.evaluate(() => window.__rts.controles.reparoArmado)).toBe(true);
  await expect(page.locator('#comandos .grade [data-slot="' + casa + '"]')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__rts.controles.reparoArmado)).toBe(false);

  // A context click of the crew on the truck sends REPARAR at it.
  let p = await naTela(page, caminhao);
  await page.mouse.click(p.x, p.y, { button: 'right' });
  expect(await ultimoComando(page)).toMatchObject({ tipo: 12, alvo: caminhao, unidades: [equipe] });

  // The card's Reparar and a click on the truck send the same.
  await tecla(page, TECLAS[casa]);
  p = await naTela(page, caminhao);
  await page.mouse.click(p.x, p.y);
  expect(await ultimoComando(page)).toMatchObject({ tipo: 12, alvo: caminhao, unidades: [equipe] });
  await expect.poll(() => page.evaluate(() => window.__rts.controles.reparoArmado)).toBe(false);

  // The mission turns that repair into re-powering: the truck comes over, and out of it a veteran Cesto.
  await expect.poll(async () => {
    await page.evaluate(() => window.__rts.avancar(150));
    return (await doTipo(page, 'cesto-blindado')).length;
  }, { timeout: 60_000, intervals: [100] }).toBe(1);
  const cesto = await page.evaluate(() => window.__rts.entidades(e => e.nome === 'cesto-blindado' && e.dono === 0)[0]);
  expect(cesto.veterania).toBe(2);
  await expect(page.locator('#objetivos')).toContainText('caminhão tombado');
  await expect(page.locator('#objetivos li[data-estado="2"]')).toContainText('caminhão tombado');
  expect(await page.evaluate(() => window.__rts.registro().eventos.filter(e => e.tipo === 'comando' && e.comando === 12).length)).toBeGreaterThanOrEqual(2);

  // A damaged unit of the player's is repaired by a context click of the crew.
  const ferida = await page.evaluate(() => window.__rts.entidades(e => e.dono === 0 && e.nome === 'turma-de-linha' && e.vida < 255)[0]?.id ?? 0);
  if (ferida) {
    await selecionar(page, [equipe]);
    p = await naTela(page, ferida);
    await page.mouse.click(p.x, p.y, { button: 'right' });
    expect(await ultimoComando(page)).toMatchObject({ tipo: 12, alvo: ferida, unidades: [equipe] });
  }
});
