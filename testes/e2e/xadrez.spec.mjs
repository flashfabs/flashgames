import { test, expect } from '@playwright/test';
test('duas pessoas jogam e acompanham o relógio e o histórico', async ({ browser }) => {
  const a=await browser.newContext(), b=await browser.newContext();
  try { const anfitriao=await a.newPage(), convidado=await b.newPage();
    await anfitriao.goto('/xadrez.html'); await anfitriao.locator('#nome').fill('Ana'); await anfitriao.locator('#criar').click(); await expect(anfitriao.locator('#codigo-sala')).not.toBeEmpty({timeout:30000});
    await convidado.goto(anfitriao.url()); await convidado.locator('#nome').fill('Bia'); await convidado.locator('#entrar button').click();
    await expect(convidado.locator('#tabuleiro .casa')).toHaveCount(64,{timeout:30000}); await expect(anfitriao.locator('#tempo-baixo')).not.toHaveText('—');
    await anfitriao.locator('[data-casa="52"]').click(); await anfitriao.locator('[data-casa="36"]').click();
    await expect(convidado.locator('#historico')).toContainText('e2–e4'); await expect(convidado.locator('#titulo-vez')).toHaveText('Sua vez de jogar');
    await convidado.locator('[data-casa="11"]').click(); await convidado.locator('[data-casa="27"]').click(); await expect(anfitriao.locator('#historico')).toContainText('d7–d5');
    await anfitriao.locator('[data-casa="36"]').click(); await anfitriao.locator('[data-casa="27"]').click();
    await expect(anfitriao.locator('#capturas-suas')).toContainText('♟'); await expect(convidado.locator('#capturas-adversario')).toContainText('♟');
  } finally { await a.close(); await b.close(); }
});
test('joga sozinho contra o computador em cada nível', async ({ page }) => {
  for (const dificuldade of ['facil','medio','dificil']) {
    await page.goto('/xadrez.html'); await page.locator('#tempo-inicial').selectOption('0'); await page.locator('#dificuldade').selectOption(dificuldade); await page.locator('#solo').click();
    await expect(page.locator('#codigo-sala')).toHaveText('COMPUTADOR'); await expect(page.locator('#tempo-baixo')).toHaveText('—');
    await page.locator('[data-casa="52"]').click(); await page.locator('[data-casa="36"]').click();
    await expect(page.locator('#historico li')).toHaveCount(2,{timeout:10000}); await expect(page.locator('#titulo-vez')).toHaveText('Sua vez de jogar');
  }
});
test('anima a jogada e identifica o autor, respeitando movimento reduzido', async ({ page }) => {
  await page.goto('/xadrez.html'); await page.locator('#tempo-inicial').selectOption('0'); await page.locator('#solo').click();
  await page.locator('[data-casa="52"]').click(); await page.locator('[data-casa="36"]').click();
  await expect(page.locator('#ultima-jogada')).toHaveText('Você jogou e2–e4');
  await expect(page.locator('[data-casa="36"]')).toHaveClass(/em-movimento/);
  await expect(page.locator('#ultima-jogada')).toContainText('Computador jogou', {timeout:10000});
  await page.emulateMedia({ reducedMotion:'reduce' }); await page.goto('/xadrez.html'); await page.locator('#solo').click();
  await page.locator('[data-casa="52"]').click(); await page.locator('[data-casa="36"]').click();
  await expect(page.locator('#historico')).toContainText('e2–e4'); await expect(page.locator('.em-movimento')).toHaveCount(0);
});
test('mostra modelos 3D para as peças dos dois jogadores', async ({ page }) => {
  await page.goto('/xadrez.html'); await page.locator('#solo').click();
  await expect(page.locator('#tabuleiro .peca-3d')).toHaveCount(32);
  await expect(page.locator('[data-casa="4"] .peca-3d')).toHaveCSS('background-image', /data:image\/png/);
  await expect(page.locator('[data-casa="60"] .peca-3d')).toHaveCSS('background-image', /data:image\/png/);
});
