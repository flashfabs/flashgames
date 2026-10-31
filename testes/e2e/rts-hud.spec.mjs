// HUD of the RTS grey slice in a real page: the start screen holds the match until Começar, F10 opens and closes the
// menu (Esc only closes it) and the match stands still behind it, the end screen asks the playtest questions, the
// command card follows the selection on Q W E R / A S D F, and alerts from a fight can be followed with V.
// Runs on the prototype match (?unidades=40); the parts that need the sandbox data (building, training, harvesters)
// join when the design front's match is on rts/base.

import { test, expect } from '@playwright/test';

const PAGINA = '/rts/?unidades=40&teste=1&atlas=0';
const tick = page => page.evaluate(() => window.__rts.estado.tick);

async function abrir(page, consulta = '') {
  await page.goto(PAGINA + consulta);
  await page.waitForFunction(() => window.__rts?.estado.atual?.n > 0 && window.__rts.versaoGancho);
}

// Behind the start screen the match has not run yet: only the static map is there.
async function abrirNoInicio(page) {
  await page.goto(`${PAGINA}&inicio=1`);
  await page.waitForFunction(() => window.__rts?.estado.mapa && window.__rts.versaoGancho);
}

test('the start screen holds the match until Começar, and the menu stops it while open', async ({ page }) => {
  await abrirNoInicio(page);
  const comecar = page.getByRole('button', { name: 'Começar' });
  await expect(comecar).toBeEnabled();
  const antes = await tick(page);
  await page.waitForTimeout(400);
  expect(await tick(page)).toBe(antes);
  // Keys do nothing to the battlefield behind the start screen.
  await page.keyboard.press('KeyB');
  await comecar.click();
  await expect(page.locator('#inicio')).toBeHidden();
  await expect.poll(() => tick(page)).toBeGreaterThan(antes + 5);

  // Esc never opens the menu; F10 does, and the match stands still behind it.
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu')).toBeHidden();
  await page.keyboard.press('F10');
  await expect(page.locator('#menu')).toBeVisible();
  const parado = await tick(page);
  await page.waitForTimeout(400);
  expect(await tick(page)).toBe(parado);
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu')).toBeHidden();
  await expect.poll(() => tick(page)).toBeGreaterThan(parado);
  await page.getByRole('button', { name: /Menu/ }).click();
  await expect(page.locator('#menu')).toBeVisible();
  await page.keyboard.press('F10');
  await expect(page.locator('#menu')).toBeHidden();
});

test('the end screen asks the playtest questions and keeps the match paused', async ({ page }) => {
  await abrir(page);
  await page.keyboard.press('F10');
  await page.getByRole('button', { name: 'Encerrar e responder' }).click();
  const fim = page.locator('#fim');
  await expect(fim).toBeVisible();
  await expect(fim.locator('h2')).toHaveText('Partida encerrada');
  const parado = await tick(page);
  await fim.getByText('4', { exact: true }).click();
  await fim.getByText('Sim', { exact: true }).click();
  await fim.locator('textarea').fill('Gostei da grade de comandos.');
  const temRegistro = await page.evaluate(() => Boolean(window.__rts.obterRegistro?.()));
  if (temRegistro) {
    const baixado = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Baixar registro' }).click();
    expect((await baixado).suggestedFilename()).toMatch(/^registro-rts-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
  } else {
    await page.getByRole('button', { name: 'Baixar registro' }).click();
    await expect(fim.locator('[data-fim="estado"]')).toContainText('anote as respostas');
  }
  // Typing in the comment box never reaches the game keys, and the match stays paused.
  expect(await tick(page)).toBe(parado);
  await expect(page.locator('#menu')).toBeHidden();
});

test('the command card follows the selection, and its keys arm the orders', async ({ page }) => {
  await abrir(page);
  await page.evaluate(() => window.__rts.pausar(true));
  const grade = page.locator('#comandos .grade');
  await expect(grade.locator('[data-slot="0"]')).toHaveAttribute('data-vazio', 'true');
  await page.evaluate(() => {
    const { estado, selecionadas, controles } = window.__rts;
    const atual = estado.atual;
    for (let k = 0; k < atual.n; k++) if (atual.dono[k] === estado.jogadorLocal) selecionadas.add(atual.id[k]);
    controles.executar({ acao: 'cancelar' });
  });
  await expect(grade.locator('[data-slot="0"]')).toContainText('Mover');
  await expect(grade.locator('[data-slot="3"]')).toContainText('Patrulhar');
  await expect(grade.locator('[data-slot="4"]')).toContainText('Atacar-mover');
  await expect(grade.locator('[data-slot="5"]')).toContainText('Parar');
  await expect(grade.locator('[data-slot="6"]')).toContainText('Segurar');
  await page.locator('#tela').focus();
  await page.keyboard.press('KeyQ');
  await expect.poll(() => page.evaluate(() => window.__rts.controles.modo)).toBe('mover');
  await page.keyboard.press('Escape');
  await page.keyboard.press('KeyD');
  await expect.poll(() => page.evaluate(() => window.__rts.comandos.at(-1)?.tipo)).toBe(5);
  await expect(page.locator('#selecao')).toContainText('selecionadas');
});

test('a fight raises an alert, the minimap rings and V brings the camera to it', async ({ page }) => {
  await abrir(page);
  await page.evaluate(() => window.__rts.pausar(true));
  // The prototype's armies march to the middle and fight; run the match ahead until the player is hit.
  await expect.poll(async () => {
    await page.evaluate(() => window.__rts.avancar(300));
    return page.evaluate(() => window.__rts.alertas.ultimo !== null);
  }, { timeout: 60_000, intervals: [200] }).toBe(true);
  await expect(page.locator('#alertas li').first()).toBeVisible();
  await expect(page.locator('[data-atalho="alerta"]')).toBeEnabled();
  await page.evaluate(() => Object.assign(window.__rts.camera, { x: 5, y: 5 }));
  await page.locator('#tela').focus();
  await page.keyboard.press('KeyV');
  const { camera, alerta } = await page.evaluate(() => ({ camera: { ...window.__rts.camera }, alerta: window.__rts.alertas.ultimo }));
  expect(Math.hypot(camera.x - alerta.x, camera.y - alerta.y)).toBeLessThan(1);
});

test('the top bar shows Carga and population as the snapshot says', async ({ page }) => {
  await abrir(page);
  const esperado = await page.evaluate(() => {
    const { estado } = window.__rts;
    const r = estado.atual;
    const j = estado.jogadorLocal;
    return { carga: r.recursos[j], teto: r.lotacao[2 * j + 1] || 60 };
  });
  await expect.poll(() => page.evaluate(() => window.__rts.hud.carga)).toBe(esperado.carga);
  await expect.poll(() => page.evaluate(() => window.__rts.hud.lotacao.teto)).toBe(esperado.teto);
});

// The sandbox played only through the HUD: the headquarters builds and the player places an accumulator (the depot),
// trains a harvester on the grid's second page, and sends the idle harvester to a pile with a context click.
// ?carga=3000 starts with Carga while the mission's start trigger is not in the simulation yet.
test('the sandbox through the HUD: build, place, train and harvest', async ({ page }) => {
  await page.goto('/rts/?partida=caixa-de-areia&teste=1&carga=3000');
  await page.waitForFunction(() => window.__rts?.estado.atual?.n > 0 && window.__rts.versaoGancho && window.__rts.catalogo.tamanho > 0);
  await page.evaluate(() => window.__rts.pausar(true));
  const tipoDe = nome => page.evaluate(n => window.__rts.estado.mapa.tipos.findIndex(t => t.nome === n), nome);
  const acumulador = await tipoDe('acumulador');
  const guincho = await tipoDe('guincho-de-celulas');
  const tecla = code => page.evaluate(c => dispatchEvent(new KeyboardEvent('keydown', { code: c, key: c, bubbles: true, cancelable: true })), code);
  const ultimoComando = () => page.evaluate(() => window.__rts.comandos.at(-1));

  // B centres on the headquarters and selects it; its card opens with the buildings.
  await page.locator('#tela').focus();
  await page.keyboard.press('KeyB');
  await expect.poll(() => page.evaluate(() => window.__rts.hud.cartao.tipo)).toBe('predio');
  const slotDo = tipo => page.evaluate(t => window.__rts.hud.cartao.slots.findIndex(s => s && s.tipo === t), tipo);
  const casa = await slotDo(acumulador);
  expect(casa).toBeGreaterThanOrEqual(0);
  const teclaDaCasa = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyA', 'KeyS', 'KeyD', 'KeyF'][casa];
  await tecla(teclaDaCasa);
  expect(await ultimoComando()).toMatchObject({ tipo: 8, arg: acumulador });

  // Built in the construction lane, then placed where the simulation's own rule allows.
  await expect.poll(async () => {
    await page.evaluate(() => window.__rts.avancar(150));
    return page.evaluate(() => window.__rts.hud.filaDoSelecionado?.pronto);
  }, { timeout: 60_000, intervals: [100] }).toBe(acumulador);
  await expect(page.locator('#alertas')).toContainText('pronto para posicionar');
  await tecla(teclaDaCasa);
  await expect.poll(() => page.evaluate(() => window.__rts.controles.modo)).toBe('colocar');
  const lugar = await page.evaluate(async tipo => {
    const { motivoPosicao } = await import('/rts/js/sim/construcao.js');
    const r = window.__rts;
    const base = document.getElementById('base').getBoundingClientRect().top;
    for (let y = 120; y < base - 40; y += 12) {
      for (let x = 200; x < innerWidth - 200; x += 12) {
        const p = r.paraMundo(x, y);
        const [largura, altura] = r.estado.mapa.tipos[tipo].pegada;
        const cx = Math.floor(p.x - largura / 2 + 0.5);
        const cy = Math.floor(p.y - altura / 2 + 0.5);
        if (motivoPosicao(r.estado.mapa, r.estado.atual, 0, tipo, cx, cy) === 0) return { x, y };
      }
    }
    return null;
  }, acumulador);
  expect(lugar).not.toBeNull();
  await page.mouse.move(lugar.x, lugar.y);
  await page.mouse.click(lugar.x, lugar.y);
  expect(await ultimoComando()).toMatchObject({ tipo: 7, arg: acumulador });
  await expect.poll(async () => {
    await page.evaluate(() => window.__rts.avancar(300));
    return page.evaluate(t => window.__rts.entidades(e => e.tipo === t && e.dono === 0 && !(e.bandeiras & 8)).length, acumulador);
  }, { timeout: 60_000, intervals: [100] }).toBe(1);
  expect(await page.evaluate(() => window.__rts.eventosDo('COMANDO_RECUSADO').length)).toBe(0);

  // F turns the headquarters' card to the units; Q trains a harvester.
  await page.keyboard.press('KeyB');
  await tecla('KeyF');
  await expect.poll(() => slotDo(guincho)).toBe(0);
  await tecla('KeyQ');
  expect(await ultimoComando()).toMatchObject({ tipo: 8, arg: guincho });
  await expect.poll(async () => {
    await page.evaluate(() => window.__rts.avancar(300));
    return page.evaluate(() => window.__rts.eventosDo('PRODUCAO_CONCLUIDA').length);
  }, { timeout: 60_000, intervals: [100] }).toBeGreaterThan(0);
  await expect(page.locator('#alertas')).toContainText('Guincho de Células pronto');

  // The period picks an idle harvester; a context click on a pile sends it to harvest there.
  await expect.poll(() => page.evaluate(() => window.__rts.hud.coletoresOciosos)).toBeGreaterThan(0);
  await tecla('Period');
  const coletor = await page.evaluate(() => [...window.__rts.selecionadas][0]);
  const pilha = await page.evaluate(id => {
    const r = window.__rts;
    const a = r.estado.atual;
    const c = r.indice.centro([id]);
    let melhor = -1;
    let d2 = Infinity;
    for (let k = 0; k < a.n; k++) {
      if (r.catalogo.categoria(a.tipo[k]) !== 'recurso') continue;
      const d = (a.x[k] / r.FP - c.x) ** 2 + (a.y[k] / r.FP - c.y) ** 2;
      if (d < d2) [melhor, d2] = [a.id[k], d];
    }
    Object.assign(r.camera, r.indice.centro([melhor]));
    return melhor;
  }, coletor);
  await page.evaluate(() => new Promise(pronto => requestAnimationFrame(() => requestAnimationFrame(pronto))));
  const naPilha = await page.evaluate(id => window.__rts.naTela(id), pilha);
  await page.mouse.click(naPilha.x, naPilha.y, { button: 'right' });
  expect(await ultimoComando()).toMatchObject({ tipo: 11, alvo: pilha, unidades: [coletor] });
  await expect.poll(async () => {
    await page.evaluate(() => window.__rts.avancar(300));
    return page.evaluate(id => window.__rts.entidades(e => e.id === id)[0]?.carga ?? 0, coletor);
  }, { timeout: 60_000, intervals: [100] }).toBeGreaterThan(0);
});
