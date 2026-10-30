// Captures true 3840x2160 screenshots of the prototype with Playwright's Chromium (GPU through Metal on the Mac).
//   node prototipos/rts-4k/capturar.mjs http://localhost:8811 <output dir>
import { chromium } from '@playwright/test';

const [base = 'http://localhost:8811', destino = '.'] = process.argv.slice(2);
const cenas = [
  { nome: 'batalha-4k', consulta: '?unidades=3000&zoom=40&avancar=2100', espera: 7000, camera: 'frente' },
  { nome: 'aproximado-4k', consulta: '?unidades=2000&zoom=96&avancar=2100', espera: 7000, camera: 'frente' },
  { nome: 'base-neblina-4k', consulta: '?unidades=1200&zoom=24&avancar=300', espera: 4000, camera: 'base' },
];

const navegador = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
for (const cena of cenas) {
  const pagina = await navegador.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  const erros = [];
  pagina.on('pageerror', e => erros.push(e.message));
  await pagina.goto(`${base}/${cena.consulta}`);
  await pagina.waitForTimeout(cena.espera);
  await pagina.evaluate(onde => {
    const { camera, estado } = window.__prototipo;
    if (onde === 'frente') {
      // centre on the busiest fight: the visible enemy unit closest to the most team-0 units
      const { x, y, vida, alvo } = estado.atual;
      let soma = [0, 0];
      let n = 0;
      for (let i = 0; i < x.length; i++) {
        if (vida[i] > 0 && alvo[i] >= 0 && estado.mapa.time[i] === 0) {
          soma = [soma[0] + x[i], soma[1] + y[i]];
          n++;
        }
      }
      if (n > 0) {
        camera.x = soma[0] / n / 1024;
        camera.y = soma[1] / n / 1024;
      }
    } else {
      camera.x = estado.mapa.bases[0].x + 22;
      camera.y = estado.mapa.bases[0].y - 16;
    }
    document.getElementById('painel').hidden = true;
  }, cena.camera);
  await pagina.waitForTimeout(600);
  const placa = await pagina.evaluate(() => window.__prototipo.info.placa);
  await pagina.screenshot({ path: `${destino}/${cena.nome}.png` });
  console.log(`${cena.nome}: ${placa}${erros.length ? ` · erros: ${erros.join(' | ')}` : ''}`);
  await pagina.close();
}
await navegador.close();
