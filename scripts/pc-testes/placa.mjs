// Which ANGLE backend lets headless Chromium draw with the real GPU on this machine; prints one JSON line.
// On the Windows PC the tests run in session 0 (SSH and WMI), where a backend can silently fall back to WARP or SwiftShader, so performance numbers are only taken with a backend whose renderer is the NVIDIA card.
//   node scripts/pc-testes/placa.mjs [d3d11,gl,vulkan,d3d11on12] [file to also write the JSON to]
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const candidatos = (process.argv[2] ?? 'd3d11,gl,vulkan,d3d11on12').split(',');
const POR_SOFTWARE = /swiftshader|llvmpipe|warp|basic render|microsoft basic|software/i;

const resultados = [];
for (const angle of candidatos) {
  const navegador = await chromium.launch({ args: [`--use-angle=${angle}`, '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
  try {
    const pagina = await navegador.newPage();
    const placa = await pagina.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return null;
      const depuracao = gl.getExtension('WEBGL_debug_renderer_info');
      return depuracao ? gl.getParameter(depuracao.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    });
    resultados.push({ angle, placa, naPlaca: Boolean(placa) && !POR_SOFTWARE.test(placa) });
  } finally {
    await navegador.close();
  }
}
const escolhido = resultados.find((r) => r.naPlaca && /nvidia/i.test(r.placa)) ?? null;
const resposta = JSON.stringify({ escolhido: escolhido?.angle ?? null, resultados });
console.log(resposta);
if (process.argv[3]) writeFileSync(process.argv[3], resposta);
