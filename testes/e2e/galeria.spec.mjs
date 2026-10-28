// Screenshot gallery (only with SALINHA_GALERIA=<folder>): the main screens on an iPad and a phone, with the
// canvas drawn by the GPU, for a person to look at. It asserts nothing beyond reaching each screen.

import { devices } from '@playwright/test';
import { test, expect } from './mesa.mjs';

const PASTA = process.env.SALINHA_GALERIA;
test.skip(!PASTA, 'gallery: set SALINHA_GALERIA to the output folder');

const semNavegador = ({ defaultBrowserType, ...resto }) => resto;
const IPAD = semNavegador(devices['iPad (gen 7) landscape']);
const CELULAR = semNavegador(devices['Pixel 7']);

async function foto(jogador, nome) {
  await jogador.pagina.waitForTimeout(400);
  await jogador.pagina.screenshot({ path: `${PASTA}/${nome}.jpg`, type: 'jpeg', quality: 80 });
}

test('gallery of the main screens', async ({ mesa }) => {
  test.setTimeout(10 * 60_000);
  const ipad = await mesa.novoJogador('Victor', { contexto: IPAD });
  await ipad.pagina.goto('/?teste=1');
  await ipad.pagina.locator('#campo-nome').fill('Victor');
  await foto(ipad, '01-inicio-ipad');
  const { link } = await ipad.criarSala();

  const celular = await mesa.novoJogador('Naire', { contexto: CELULAR });
  const endereco = new URL(link);
  endereco.search = '?teste=1';
  await celular.pagina.goto(endereco.toString());
  await foto(celular, '02-convite-celular');
  await celular.pagina.locator('#campo-nome').fill('Naire');
  await celular.pagina.getByRole('button', { name: 'Entrar na sala' }).click();
  await expect(celular.pagina.locator('#sala')).toBeVisible({ timeout: 30_000 });

  const aviso = ipad.pagina.locator('.pavio-aviso');
  for (const nivel of ['Fácil', 'Difícil']) {
    await aviso.getByRole('button', { name: nivel, exact: true }).click();
    await aviso.getByRole('button', { name: '+ Robô' }).click();
  }
  await aviso.getByRole('button', { name: 'QR code' }).click();
  await foto(ipad, '03-lobby-com-qr-ipad');
  await foto(celular, '04-lobby-celular');

  await mesa.todosProntos([ipad, celular]);
  await expect(ipad.pagina.locator('.pavio-mapa')).toBeVisible();
  await foto(ipad, '05-contagem-ipad');
  await ipad.esperarFase('jogo');
  await ipad.pagina.waitForTimeout(4000);
  await foto(ipad, '06-partida-ipad');
  await foto(celular, '07-partida-celular');
  // Both people blow themselves up so the match ends quickly; the robots finish it.
  await ipad.soltarBomba();
  await celular.soltarBomba();
  await ipad.esperarFase('resultado', 4 * 60_000);
  await ipad.pagina.waitForTimeout(1500);
  await foto(ipad, '08-resumo-ipad');
  await foto(celular, '09-resumo-celular');

  // Play the rest of the round the same way, to reach the podium.
  for (let numero = 2; numero <= 5; numero++) {
    await ipad.esperarFase('jogo', 60_000);
    if (numero === 3) await foto(ipad, '10-partida-muralhas-ipad');
    await ipad.soltarBomba();
    await celular.soltarBomba();
    await ipad.esperarFase(numero < 5 ? 'resultado' : 'final', 4 * 60_000);
  }
  await ipad.pagina.waitForTimeout(2000);
  await foto(ipad, '11-podio-ipad');
  await foto(celular, '12-podio-celular');
});
