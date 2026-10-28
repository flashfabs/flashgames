// Phone in portrait: during the match the room list steps aside (it sat under the stick and the bomb button) and the arena stays above the touch controls; the list comes back after the match.

import { devices } from '@playwright/test';
import { test, expect } from './mesa.mjs';

const { defaultBrowserType, ...CELULAR } = devices['Pixel 7'];

test('on a phone in portrait the room list steps aside during the match and the arena stays above the touch controls', async ({ mesa }) => {
  const ana = await mesa.novoJogador('Ana', { contexto: CELULAR });
  const pagina = ana.pagina;
  await pagina.goto('/?teste=1');
  await pagina.locator('#campo-nome').fill('Ana');
  await pagina.getByRole('button', { name: 'Criar sala' }).click();
  await expect(pagina.locator('#sala')).toBeVisible({ timeout: 30_000 });
  const painel = pagina.locator('.painel');
  await expect(painel).toBeVisible();

  const lobby = pagina.locator('.pavio-aviso');
  await lobby.getByRole('button', { name: '+ Robô' }).click();
  await ana.ficarPronto();
  await ana.esperarFase('jogo');
  await expect(pagina.locator('.pavio-toque')).toBeVisible();
  await expect(painel).toBeHidden();
  const folga = () => pagina.evaluate(() => {
    const topo = seletor => document.querySelector(seletor).getBoundingClientRect().top;
    return Math.min(topo('.pavio-base'), topo('.pavio-dica-bomba')) - document.querySelector('.pavio-arena').getBoundingClientRect().bottom;
  });
  await expect.poll(folga, { message: 'gap between the arena and the touch controls' }).toBeGreaterThan(0);

  await ana.soltarBomba();
  await ana.esperarFase('resultado', 20_000);
  await expect(painel).toBeVisible();
});
