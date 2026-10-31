// RTS renderer performance in 4K: the game's own benchmark (?bench=1) with 2,000 units and the buildings of a match
// (&predios=60: offices, garages, poles with cables, some under construction), and a mission's match with 2,000 units
// on its map (&partida=...&tropas=2000), at a 3840x2160 canvas (a 1920x1080
// window at twice the pixel density), the render scale pinned at 100% and the camera orbiting the battle. Runs in the
// performance project, with the GPU (Metal on the Mac, the NVIDIA card through ANGLE on the RTX 4090 PC); every run
// prints the measured JSON (frame interval percentiles, frames over 20 ms, CPU time per frame, GPU time per frame where
// the timer query is exposed, terrain mode, screen and browser).
// The limits are a regression guard for a busy machine; the targets (under 1% of frames over 20 ms in 4K) are measured
// on a quiet machine and recorded in docs/rts/ESTADO.md.
// The terrain comparison runs the same battle with the frame rate unlocked (no vsync, no frame limit), once with the
// procedural ground and once splatted from the art's tiles by soil, so the frame time shows what each costs.
// The last test opens the atlas viewer of the style gate with two versions side by side.

import { test, expect } from '@playwright/test';

const PREDIOS = 60;
// the mission measured with 2,000 units on its map: the sandbox until the phase 1 mission's map is in
const MISSAO = 'caixa-de-areia';
const CENARIOS = [
  { nome: '2000 unidades e prédios, zoom padrão', consulta: `unidades=2000&predios=${PREDIOS}` },
  { nome: '2000 unidades e prédios, zoom afastado', consulta: `unidades=2000&predios=${PREDIOS}&zoom=0.75` },
  { nome: `missão ${MISSAO} com 2000 unidades`, consulta: `partida=${MISSAO}&inicio=0&tropas=2000` },
];
const LIMITES = { fracaoAcimaDe20ms: 0.05, quadroP50Ms: 20, cpuQuadroP95Ms: 8 };

test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });

async function lerBench(page, consulta) {
  const erros = [];
  page.on('pageerror', erro => erros.push(erro.message));
  await page.goto(`/rts/?bench=1&seg=10&avancar=600&${consulta}`);
  await page.waitForFunction(() => window.__bench, null, { timeout: 120_000 });
  return { resultado: await page.evaluate(() => window.__bench), erros };
}

async function medir(page, cenario, canvas) {
  test.setTimeout(150_000);
  const { resultado, erros } = await lerBench(page, cenario.consulta);
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
  test(`RTS em 4K: ${cenario.nome}`, async ({ page }) => {
    await medir(page, cenario, '3840x2160');
  });
}

// The same battle at 1920x1080 (a quarter of the pixels): the hd baseline.
test.describe('1080p', () => {
  test.use({ deviceScaleFactor: 1 });
  test('RTS em 1080p: 2000 unidades e prédios, zoom padrão', async ({ page }) => medir(page, { nome: '2000 unidades e prédios, 1080p', consulta: `unidades=2000&predios=${PREDIOS}` }, '1920x1080'));
});

// The project's launch arguments plus an unlocked frame rate; a browser of its own, since launch options cannot change
// inside a file.
const ANGLE = process.env.SALINHA_ANGLE ?? (process.platform === 'win32' ? 'd3d11' : 'metal');
const SEM_TRAVA = [
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  `--use-angle=${ANGLE}`,
  '--enable-gpu',
  '--ignore-gpu-blocklist',
  '--enable-gpu-rasterization',
  '--disable-gpu-vsync',
  '--disable-frame-rate-limit',
];

test('terreno procedural contra ladrilhos por solo, em 4K com o quadro destravado', async ({ playwright, browserName }, testInfo) => {
  test.skip(browserName !== 'chromium', 'só o Chromium destrava o quadro por argumento');
  test.setTimeout(300_000);
  const navegador = await playwright.chromium.launch({ args: SEM_TRAVA });
  const resultados = {};
  try {
    for (const terreno of ['procedural', 'ladrilhos']) {
      const contexto = await navegador.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, baseURL: testInfo.project.use.baseURL });
      const page = await contexto.newPage();
      const { resultado, erros } = await lerBench(page, `unidades=2000&predios=${PREDIOS}&terreno=${terreno}`);
      await contexto.close();
      console.log(JSON.stringify({ cenario: `terreno ${terreno}, quadro destravado`, ...resultado }));
      expect(erros).toEqual([]);
      expect(resultado.terreno).toBe(terreno);
      expect(resultado.canvas).toBe('3840x2160');
      expect(resultado.escalaMedia).toBe(1);
      resultados[terreno] = resultado;
    }
  } finally {
    await navegador.close();
  }
  const resumo = Object.fromEntries(Object.entries(resultados).map(([t, r]) => [t, { qps: r.qpsMedio, quadroP50: r.quadroP50, quadroP95: r.quadroP95, gpuP50: r.gpuP50, gpuP95: r.gpuP95 }]));
  console.log(JSON.stringify({ comparacaoTerreno: resumo, placa: resultados.ladrilhos?.placa }));
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
