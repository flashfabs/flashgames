// Screenshots of the home screen and the lobby on three devices. Whatever moves or changes on its own (the canvas,
// the room code, ping numbers, toasts) is masked, so a difference means the layout or the styles changed.

import { devices } from '@playwright/test';
import { test, expect } from './mesa.mjs';

const semNavegador = ({ defaultBrowserType, ...resto }) => resto;
const APARELHOS = {
  desktop: {},
  ipad: semNavegador(devices['iPad (gen 7) landscape']),
  celular: semNavegador(devices['Pixel 7']),
};

const mascaras = pagina => [pagina.locator('canvas'), pagina.locator('#sala-codigo'), pagina.locator('.etiqueta--ping'), pagina.locator('#avisos')];

async function prontaParaFoto(pagina) {
  await pagina.evaluate(() => document.fonts.ready);
  await expect(pagina.locator('#avisos > *')).toHaveCount(0, { timeout: 10_000 });
}

for (const [aparelho, contexto] of Object.entries(APARELHOS)) {
  test(`home screen and lobby look the same on ${aparelho}`, async ({ mesa }) => {
    const host = await mesa.novoJogador('Ana', { contexto });
    await host.pagina.goto('/?teste=1');
    await host.pagina.locator('#campo-nome').fill('Ana');
    await prontaParaFoto(host.pagina);
    await expect(host.pagina).toHaveScreenshot(`inicio-${aparelho}.png`, { fullPage: true, mask: mascaras(host.pagina) });

    const { link } = await host.criarSala();
    const convidado = await mesa.novoJogador('Bento');
    await convidado.entrarPeloLink(link);
    await expect(host.pagina.locator('#contagem-membros')).toHaveText('2/8');
    await prontaParaFoto(host.pagina);
    await expect(host.pagina).toHaveScreenshot(`lobby-${aparelho}.png`, { mask: mascaras(host.pagina) });
  });
}
