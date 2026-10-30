// The key battery in prototipos/teclas, opened straight from disk as the Victor opens it on the Windows PC: it records
// what reaches the page, blames a lost focus on the armed shortcut, and reads pinches and right clicks on its test pad.

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test, expect } from '@playwright/test';

const PAGINA = pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../prototipos/teclas/index.html')).href;

const chip = (page, item, rotulo) => page.locator(`[data-item="${item}"] .chip[data-chip="${rotulo}"]`);

test.beforeEach(async ({ page }) => {
  await page.goto(PAGINA);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('h1').click();
});

test('Ctrl with every digit reaches the page and lands in the copied text', async ({ page }) => {
  for (const digito of '123456789') await page.keyboard.press(`Control+Digit${digito}`);
  await expect(page.locator('[data-item="ctrl-digitos"] .chip[data-status="chegou"]')).toHaveCount(9);
  await expect(page.locator('#saida')).toHaveValue(/\| (Ctrl|Control) \+ 1 a 9 \| normal \| chegou em todos \| key "1" "2" "3" "4" "5" "6" "7" "8" "9"; keyup chegou \|/);
  await expect(page.locator('#saida')).toHaveValue(/- (Ctrl|Control) \+ 1 a 9: serve para guardar grupo neste navegador \(9 de 9 chegaram limpos\)\./);
});

test('losing focus right after the modifier marks the armed digit as taken; the next one still arrives', async ({ page }) => {
  await page.locator('[data-item="alt-digitos"] [data-acao="armar"]').click();
  await page.keyboard.down('Alt');
  await page.evaluate(() => dispatchEvent(new Event('blur')));
  await page.keyboard.up('Alt');
  await expect(chip(page, 'alt-digitos', '1')).toHaveAttribute('data-status', 'tomado');
  await page.keyboard.press('Alt+Digit2');
  await expect(chip(page, 'alt-digitos', '2')).toHaveAttribute('data-status', 'chegou');
});

test('a ctrlKey wheel on the pad counts as a pinch, and a right click as an order', async ({ page }) => {
  await page.locator('[data-item="pinca"] [data-acao="armar"]').click();
  await expect(page.locator('#pad')).toBeVisible();
  const caixa = await page.locator('#pad').boundingBox();
  await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
  await page.keyboard.down('Control');
  for (let i = 0; i < 4; i += 1) await page.mouse.wheel(0, -40);
  await page.keyboard.up('Control');
  await expect(chip(page, 'pinca', 'roda com ctrlKey')).toHaveAttribute('data-status', 'chegou');
  // Chromium has no GestureEvent, which is what the page says.
  await expect(chip(page, 'pinca', 'GestureEvent')).toHaveAttribute('data-status', 'nao-existe');

  await page.locator('[data-item="contexto"] [data-acao="armar"]').click();
  await page.mouse.click(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2, { button: 'right' });
  await expect(chip(page, 'contexto', 'unico')).toHaveAttribute('data-status', 'chegou');
});
