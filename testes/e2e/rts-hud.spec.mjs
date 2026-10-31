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
