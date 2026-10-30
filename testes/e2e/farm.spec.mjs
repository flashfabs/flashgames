import { test, expect } from '@playwright/test';

test('a solo game opens the standard board and rolls automatically', async ({ page }) => {
  await page.goto('/farm.html');
  await page.locator('#nome').fill('Ana');
  await page.locator('#limite').selectOption('1');
  await page.locator('#criar').click();
  await expect(page.locator('.tabuleiro')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.hex')).toHaveCount(19);
  for (let i=0; i<2; i++) {
    await page.locator('[aria-label="Construir fazenda"]').first().click();
    await page.locator('[aria-label="Construir estrada"]').first().click();
  }
  await expect(page.getByRole('button',{name:'Rolar dados'})).toBeVisible();
  await expect(page.locator('.contador-dados')).toContainText('Rolagem automática');
  await expect(page.locator('.historico-lista')).toContainText('rolou', {timeout: 10000});
  await expect(page.locator('.dados-visuais')).toBeDisabled();
});

test('a new player chooses which bot to replace in an ongoing game', async ({ browser }) => {
  const a=await browser.newContext(), b=await browser.newContext();
  try {
    const host=await a.newPage(), convidado=await b.newPage();
    await host.goto('/farm.html');await host.locator('#nome').fill('Ana');
    await host.locator('#limite').selectOption('3');await host.locator('#bot-quantidade').selectOption('2');
    await host.locator('#criar').click();await expect(host.locator('.tabuleiro')).toBeVisible({timeout:30000});
    const codigo=await host.locator('#sala-codigo').textContent();
    await convidado.goto(`/farm.html#${codigo}`);await convidado.locator('#nome').fill('Bia');await convidado.locator('#criar').click();
    await expect(convidado.getByRole('heading',{name:'Escolha uma fazenda'})).toBeVisible({timeout:30000});
    await convidado.getByRole('button',{name:/Margarida/}).click();
    await expect(convidado.locator('.placar')).toContainText('Bia');
    await expect(host.locator('.placar')).toContainText('Bia');
    await expect(host.locator('.placar')).toContainText('Bento');
    await expect(host.locator('.placar')).not.toContainText('Margarida');
  } finally {await a.close();await b.close();}
});

test('turn timer defaults to 60 seconds and can be disabled', async ({ page }) => {
  await page.goto('/farm.html');
  await expect(page.locator('#tempo-turno')).toHaveValue('60');
  await page.locator('#tempo-turno').selectOption('0');
  await page.locator('#nome').fill('Ana');
  await page.locator('#limite').selectOption('1');
  await page.locator('#criar').click();
  await expect(page.locator('.tabuleiro')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.contador-turno')).toHaveCount(0);
});

test('an expired setup turn completes the mandatory placements', async ({ page }) => {
  await page.clock.install();
  await page.goto('/farm.html');
  await page.locator('#nome').fill('Ana');
  await page.locator('#limite').selectOption('1');
  await page.locator('#criar').click();
  await expect(page.locator('.tabuleiro')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.contador-turno')).toContainText('60s');
  await page.clock.fastForward(45000);
  await expect(page.locator('.contador-turno')).toContainText('15s');
  await expect(page.locator('.contador-turno')).toHaveClass(/urgente/);
  await expect(page.locator('body')).toHaveClass(/tempo-urgente/);
  await page.clock.fastForward(5000);
  await expect(page.locator('.contador-turno')).toContainText('10s');
  await expect(page.locator('.contador-turno')).toHaveClass(/urgente/);
  await expect(page.locator('body')).toHaveClass(/tempo-urgente/);
  await page.clock.fastForward(10000);
  await expect(page.locator('.historico-lista')).toContainText('construiu uma estrada');
  await expect(page.locator('.contador-turno')).toContainText('60s');
  await expect(page.locator('body')).not.toHaveClass(/tempo-urgente/);
});
