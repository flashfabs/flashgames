import { test, expect } from '@playwright/test';
test('joga contra o computador', async ({ page }) => {
  await page.goto('/dama.html'); await page.locator('#tempo-inicial').selectOption('0'); await page.locator('#solo').click();
  await expect(page.locator('#tabuleiro .casa')).toHaveCount(64);
  await page.locator('[data-casa="40"]').click(); await page.locator('[data-casa="33"]').click();
  await expect(page.locator('#historico li')).toHaveCount(2, { timeout: 10000 });
  await expect(page.locator('#titulo-vez')).toHaveText('Sua vez de jogar');
});
test('duas pessoas jogam na mesma sala', async ({ browser }) => {
  const a = await browser.newContext(), b = await browser.newContext();
  try {
    const anfitriao = await a.newPage(), convidado = await b.newPage();
    await anfitriao.goto('/dama.html'); await anfitriao.locator('#criar').click();
    await expect(anfitriao.locator('#codigo-sala')).not.toBeEmpty({ timeout: 30000 });
    await convidado.goto(anfitriao.url()); await convidado.locator('#entrar button').click();
    await expect(convidado.locator('#tabuleiro .casa')).toHaveCount(64, { timeout: 30000 });
    await anfitriao.locator('[data-casa="40"]').click(); await anfitriao.locator('[data-casa="33"]').click();
    await expect(convidado.locator('#historico')).toContainText('a3–b4');
    await expect(convidado.locator('#titulo-vez')).toHaveText('Sua vez de jogar');
  } finally { await a.close(); await b.close(); }
});
test('tabuleiro e relógios cabem na janela em computador e celular', async ({ page }) => {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport); await page.goto('/dama.html'); await page.locator('#solo').click();
    const topo = await page.locator('#jogador-cima').boundingBox(), baixo = await page.locator('#jogador-baixo').boundingBox();
    expect(topo.y).toBeGreaterThanOrEqual(0); expect(baixo.y + baixo.height).toBeLessThanOrEqual(viewport.height);
  }
});
