// iPad: the touch layer shows up during the game, the stick and the bomb tap work, and the page neither
// scrolls nor zooms. Touch gestures go through the Chrome DevTools Protocol, like a finger on the screen.

import { devices } from '@playwright/test';
import { test, expect, semCaixas } from './mesa.mjs';

const { defaultBrowserType, ...IPAD } = devices['iPad (gen 7) landscape'];

async function gestos(jogador) {
  const cdp = await jogador.contexto.newCDPSession(jogador.pagina);
  return {
    pinca: (x, y) => cdp.send('Input.synthesizePinchGesture', { x, y, scaleFactor: 2.5, relativeSpeed: 600, gestureSourceType: 'touch' }),
    rolar: (x, y) => cdp.send('Input.synthesizeScrollGesture', { x, y, yDistance: -500, speed: 1200, gestureSourceType: 'touch' }),
    async arrastar([x, y], [x2, y2], seguraMs) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      for (let passo = 1; passo <= 6; passo++) {
        const t = passo / 6;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (x2 - x) * t, y: y + (y2 - y) * t, id: 1 }] });
      }
      await jogador.pagina.waitForTimeout(seguraMs);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    },
  };
}

const vistaDaPagina = pagina => pagina.evaluate(() => ({
  zoom: visualViewport.scale,
  rolagem: Math.max(window.scrollY, document.documentElement.scrollTop, visualViewport.pageTop),
  sobra: document.documentElement.scrollHeight - innerHeight,
}));

test('on an iPad the touch layer appears, the stick and bomb tap work, and the page neither scrolls nor zooms', async ({ mesa }) => {
  // Control: in this browser the same gestures do zoom and scroll an ordinary page, so the checks below mean something.
  const controle = await mesa.novoJogador('controle', { contexto: IPAD });
  await controle.pagina.setContent('<meta name="viewport" content="width=device-width, initial-scale=1"><div style="height: 4000px">página comum</div>');
  const gestosControle = await gestos(controle);
  await gestosControle.rolar(300, 500);
  await gestosControle.pinca(300, 300);
  const vistaControle = await vistaDaPagina(controle.pagina);
  expect(vistaControle.zoom, 'pinch zooms an ordinary page').toBeGreaterThan(1.2);
  expect(vistaControle.rolagem, 'a swipe scrolls an ordinary page').toBeGreaterThan(100);
  await controle.contexto.close();

  const { host, convidados: [ipad] } = await mesa.montar(['Mesa', 'iPad'], {
    anfitriao: { iniciar: [semCaixas] },
    convidado: () => ({ contexto: IPAD }),
  });
  const toque = ipad.pagina.locator('.pavio-toque');
  const dedo = await gestos(ipad);
  const { width: largura, height: altura } = IPAD.viewport;

  // Lobby: touch instructions, no touch layer yet, and the room screen is locked in place.
  await expect(ipad.pagina.locator('.pavio-legenda')).toContainText('Arraste o dedo no lado esquerdo da tela');
  await expect(toque).toBeHidden();
  expect(await ipad.pagina.evaluate(() => document.documentElement.classList.contains('em-sala'))).toBe(true);
  await dedo.rolar(largura / 2, altura / 2);
  await dedo.pinca(largura / 2, altura / 2);
  expect(await vistaDaPagina(ipad.pagina)).toEqual({ zoom: 1, rolagem: 0, sobra: 0 });

  await mesa.todosProntos([host, ipad]);
  await expect(toque).toBeVisible();
  await expect(ipad.pagina.locator('.pavio-dica-bomba')).toBeVisible();
  await expect(host.pagina.locator('.pavio-toque'), 'no touch layer on a desktop').toBeHidden();
  await ipad.esperarFase('jogo');

  // The stick appears where the finger lands on the left half; dragging left walks left from (19, 13).
  expect(await host.posicaoDe(ipad)).toMatchObject({ x: 19, y: 13 });
  await dedo.arrastar([largura * 0.2, altura * 0.6], [largura * 0.2 - 90, altura * 0.6], 700);
  const depois = await ipad.minhaPosicao();
  expect(depois.x, 'the stick moved the player left').toBeLessThan(18);
  expect(depois.y).toBe(13);
  await expect.poll(async () => (await host.posicaoDe(ipad)).x, { message: 'the host sees the move' }).toBeCloseTo(depois.x, 1);

  // A tap on the right half drops a bomb where the player stands.
  await ipad.pagina.touchscreen.tap(largura * 0.8, altura * 0.5);
  await expect.poll(async () => (await host.bombas()).map(([x, y]) => `${x},${y}`), { message: 'the tap dropped a bomb' })
    .toEqual([`${Math.round(depois.x)},13`]);

  // Neither a swipe nor a pinch on the game moves or zooms the page.
  await dedo.rolar(largura * 0.75, altura * 0.5);
  await dedo.pinca(largura * 0.5, altura * 0.5);
  expect(await vistaDaPagina(ipad.pagina)).toEqual({ zoom: 1, rolagem: 0, sobra: 0 });
});
