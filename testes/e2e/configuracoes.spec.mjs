// Settings and first-time tips: the choices stay on the device, the performance counter shows in the match, and
// the tips go away once the player walks and drops a bomb (and come back on request).

import { test, expect } from './mesa.mjs';

test('settings stay on the device and the first-time tips go away once used', async ({ mesa }) => {
  const ana = await mesa.novoJogador('Ana');
  const pagina = ana.pagina;
  await pagina.goto('/?teste=1');
  await pagina.getByRole('button', { name: /Configurações de som/ }).click();
  const dialogo = pagina.getByRole('dialog', { name: 'Configurações' });
  await expect(dialogo).toBeVisible();
  await dialogo.getByLabel('Volume dos efeitos').fill('40');
  await expect(dialogo.locator('#config-efeitos-valor')).toHaveText('40%');
  await dialogo.getByLabel('Mostrar quadros por segundo durante a partida').check();
  await dialogo.getByRole('button', { name: 'Fechar' }).click();
  await expect(dialogo).toBeHidden();
  await pagina.reload();
  await pagina.getByRole('button', { name: /Configurações de som/ }).click();
  await expect(dialogo.getByLabel('Volume dos efeitos')).toHaveValue('40');
  await expect(dialogo.getByLabel('Mostrar quadros por segundo durante a partida')).toBeChecked();
  await pagina.keyboard.press('Escape');
  await expect(dialogo).toBeHidden();

  // A match against a robot: the walking tip, then the bomb tip, then nothing.
  await pagina.locator('#campo-nome').fill('Ana');
  await pagina.getByRole('button', { name: 'Criar sala' }).click();
  await expect(pagina.locator('#sala')).toBeVisible({ timeout: 30_000 });
  const lobby = pagina.locator('.pavio-aviso');
  await lobby.getByRole('button', { name: 'Fácil', exact: true }).click();
  await lobby.getByRole('button', { name: '+ Robô' }).click();
  await ana.ficarPronto();
  await ana.esperarFase('jogo');
  const dica = pagina.locator('.pavio-dica-jogo');
  await expect(dica).toHaveText('Ande com WASD ou as setas');
  await expect(pagina.locator('.pavio-hud')).toContainText('qps');
  await pagina.keyboard.down('ArrowRight');
  await expect(dica).toHaveText(/Espaço solta uma bomba/);
  await pagina.keyboard.up('ArrowRight');
  await ana.soltarBomba();
  await expect(dica).toBeHidden();

  // The settings bring the tips back.
  await pagina.locator('#botao-config').click();
  await dialogo.getByRole('button', { name: 'Mostrar as dicas de novo' }).click();
  await expect(dialogo.locator('#config-dicas-aviso')).toHaveText('As dicas aparecem de novo na próxima partida.');
  expect(await pagina.evaluate(() => localStorage.getItem('salinha:dicas'))).toBeNull();
});
