// RTS renderer performance in 4K: the game's own benchmark (?bench=1) with 2,000 units at a 3840x2160 canvas
// (a 1920x1080 window at twice the pixel density), the render scale pinned at 100% and the camera orbiting the
// battle. Runs in the performance project, with the Mac's GPU through Metal; every run prints the measured JSON
// (frame interval percentiles, frames over 20 ms, CPU time per frame, GPU time when exposed, screen and browser).
// The limits are a regression guard for a busy machine; the E1 target (under 1% of frames over 20 ms on the
// M5 Pro, Chrome and Safari) is measured on a quiet machine and recorded in docs/rts/ESTADO.md.

import { test, expect } from '@playwright/test';

const CENARIOS = [
  { nome: '2000 unidades, zoom padrão', consulta: 'unidades=2000' },
  { nome: '2000 unidades, zoom afastado', consulta: 'unidades=2000&zoom=0.75' },
];
const LIMITES = { fracaoAcimaDe20ms: 0.05, quadroP50Ms: 20, cpuQuadroP95Ms: 8 };

test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });

for (const cenario of CENARIOS) {
  test(`RTS em 4K: ${cenario.nome}`, async ({ page }) => {
    test.setTimeout(150_000);
    const erros = [];
    page.on('pageerror', erro => erros.push(erro.message));
    await page.goto(`/rts/?bench=1&seg=10&avancar=600&${cenario.consulta}`);
    await page.waitForFunction(() => window.__bench, null, { timeout: 120_000 });
    const resultado = await page.evaluate(() => window.__bench);
    console.log(JSON.stringify({ cenario: cenario.nome, ...resultado }));
    expect(erros).toEqual([]);
    expect(resultado.canvas).toBe('3840x2160');
    expect(resultado.escalaMedia).toBe(1);
    expect(resultado.unidades).toBeGreaterThan(1500);
    expect(resultado.fracaoAcimaDe20ms).toBeLessThan(LIMITES.fracaoAcimaDe20ms);
    expect(resultado.quadroP50).toBeLessThan(LIMITES.quadroP50Ms);
    expect(resultado.cpuQuadroP95).toBeLessThan(LIMITES.cpuQuadroP95Ms);
  });
}
