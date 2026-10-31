// RTS renderer performance in 4K: the game's own benchmark (?bench=1) with 2,000 units at a 3840x2160 canvas
// (a 1920x1080 window at twice the pixel density), the render scale pinned at 100% and the camera orbiting the
// battle. Runs in the performance project, with the Mac's GPU through Metal; every run prints the measured JSON
// (frame interval percentiles, frames over 20 ms, CPU time per frame, GPU time when exposed, screen and browser).
// The limits are a regression guard for a busy machine; the E1 target (under 1% of frames over 20 ms on the
// M5 Pro, Chrome and Safari) is measured on a quiet machine and recorded in docs/rts/ESTADO.md.
// The last test opens the atlas viewer of the style gate with two versions side by side (a 404 for the art index,
// which does not exist yet, is expected).

import { test, expect } from '@playwright/test';

const CENARIOS = [
  { nome: '2000 unidades, zoom padrão', consulta: 'unidades=2000' },
  { nome: '2000 unidades, zoom afastado', consulta: 'unidades=2000&zoom=0.75' },
];
const LIMITES = { fracaoAcimaDe20ms: 0.05, quadroP50Ms: 20, cpuQuadroP95Ms: 8 };

test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });

async function medir(page, cenario, canvas) {
  test.setTimeout(150_000);
  const erros = [];
  page.on('pageerror', erro => erros.push(erro.message));
  await page.goto(`/rts/?bench=1&seg=10&avancar=600&${cenario.consulta}`);
  await page.waitForFunction(() => window.__bench, null, { timeout: 120_000 });
  const resultado = await page.evaluate(() => window.__bench);
  console.log(JSON.stringify({ cenario: cenario.nome, ...resultado }));
  expect(erros).toEqual([]);
  expect(resultado.canvas).toBe(canvas);
  expect(resultado.escalaMedia).toBe(1);
  expect(resultado.unidades).toBeGreaterThan(1500);
  expect(resultado.fracaoAcimaDe20ms).toBeLessThan(LIMITES.fracaoAcimaDe20ms);
  expect(resultado.quadroP50).toBeLessThan(LIMITES.quadroP50Ms);
  expect(resultado.cpuQuadroP95).toBeLessThan(LIMITES.cpuQuadroP95Ms);
}

for (const cenario of CENARIOS) {
  test(`RTS em 4K: ${cenario.nome}`, async ({ page }) => medir(page, cenario, '3840x2160'));
}

// The same battle at 1920x1080 (a quarter of the pixels): the hd baseline, and a check of how much of the
// simulation step measured in the page comes from sharing the machine with the 4K render.
test.describe('1080p', () => {
  test.use({ deviceScaleFactor: 1 });
  test('RTS em 1080p: 2000 unidades, zoom padrão', async ({ page }) => medir(page, { nome: '2000 unidades, 1080p', consulta: 'unidades=2000' }, '1920x1080'));
});

test('visualizador de atlas compara duas versões sem erro', async ({ page }) => {
  const erros = [];
  page.on('pageerror', erro => erros.push(erro.message));
  page.on('console', mensagem => mensagem.type() === 'error' && !/404/.test(mensagem.text()) && erros.push(mensagem.text()));
  await page.goto('/rts/ferramentas/visualizador.html?a=prototipo&b=ficha-tanque&modo=todas&zoom=2');
  await page.waitForFunction(() => window.__visualizador?.lados.every(l => l.folha));
  await expect(page.locator('#lado-a .legenda')).toContainText('prototipo-tanque');
  await expect(page.locator('#lado-b .legenda')).toContainText('ficha-tanque');
  const sprites = await page.evaluate(() => window.__visualizador.lados.map(l => l.render.estatisticas.sprites));
  expect(sprites[0]).toBe(16);
  expect(sprites[1]).toBe(32);
  expect(erros).toEqual([]);
});
