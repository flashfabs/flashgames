// The grey slice end to end through the test hook (window.__rts, only with ?teste=1, site/rts/js/teste/gancho.js):
// the normal page carries none of it; with the hook a test reads snapshots, gives orders as the player and
// fast-forwards the match in the worker, paused and even in a background tab, so minutes of play take seconds.
import { test, expect } from '@playwright/test';

/**
 * Opens the RTS with the hook, waits for the first snapshot and pauses the clock, so only the test moves time.
 * Skips the test while the page does not wire the hook module yet.
 */
async function abrir(page, parametros = '') {
  await page.goto(`/rts/?teste=1&atlas=0${parametros}`);
  await page.waitForFunction(() => window.__rts?.estado?.atual, null, { timeout: 30000 });
  // the page imports the hook module after its first frame; give it a moment
  await page.waitForFunction(() => window.__rts.versaoGancho >= 1, null, { timeout: 5000 }).catch(() => {});
  test.skip(!(await page.evaluate(() => window.__rts.versaoGancho >= 1)), 'a página ainda não liga site/rts/js/teste/gancho.js (rts-interface)');
  await page.evaluate(() => window.__rts.pronto);
  await page.evaluate(() => window.__rts.pausar(true));
}

const temAvancar = page => page.evaluate(() => typeof window.__rts.avancar === 'function');

test('the normal page has no test hook and never loads it', async ({ page }) => {
  const pedidos = [];
  page.on('request', pedido => pedidos.push(new URL(pedido.url()).pathname));
  await page.goto('/rts/?atlas=0', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => typeof window.__rts)).toBe('undefined');
  expect(pedidos.filter(caminho => caminho.includes('/js/teste/'))).toEqual([]);
});

test('the hook reads the snapshot, orders a unit and fast-forwards the worker', async ({ page }) => {
  await abrir(page, '&unidades=40');
  expect(await temAvancar(page)).toBe(true);
  const antes = await page.evaluate(() => window.__rts.retrato());
  expect(antes.n).toBeGreaterThan(0);
  expect(antes.entidades[0]).toHaveProperty('id');
  const minha = antes.entidades.find(e => e.dono === 0);
  const destino = { x: minha.x + 6 * 1024, y: minha.y };
  await page.evaluate(({ id, x, y }) => window.__rts.comando({ tipo: window.__rts.TIPO_COMANDO.MOVER, unidades: [id], x, y }), { id: minha.id, ...destino });
  const depois = await page.evaluate(() => window.__rts.avancar(10 * window.__rts.PASSOS_POR_SEGUNDO));
  expect(depois.tick).toBe(antes.tick + 300);
  const agora = depois.entidades.find(e => e.id === minha.id);
  expect(Math.abs(agora.x - destino.x)).toBeLessThan(Math.abs(minha.x - destino.x));
  // the clock stayed paused: no tick passes on its own
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__rts.retrato().tick)).toBe(depois.tick);
});

test('fast-forward works while the hidden tab holds the clock', async ({ page }) => {
  await abrir(page, '&unidades=40');
  expect(await temAvancar(page)).toBe(true);
  // what a background tab does: the bridge pauses the match for the "visibilidade" reason
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    window.__rts.pausar(false);
  });
  const inicio = await page.evaluate(() => window.__rts.retrato().tick);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__rts.retrato().tick)).toBe(inicio);
  const depois = await page.evaluate(() => window.__rts.avancar(3000));
  expect(depois.tick).toBe(inicio + 3000);
  expect(await page.evaluate(() => window.__rts.eventosDo('TIRO').length)).toBeGreaterThan(0);
});
