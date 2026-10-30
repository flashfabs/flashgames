// Runs the prototype benchmark (?bench=1) at 3840x2160 and prints one JSON line per scenario.
//   node prototipos/rts-4k/medir.mjs http://localhost:8811 [chromium|webkit|firefox] [number of scenarios]
import { chromium, webkit, firefox } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:8811';
const motor = { chromium, webkit, firefox }[process.argv[3] ?? 'chromium'];
const limite = Number(process.argv[4] ?? 99);
const todos = [
  { nome: '2000 unidades, formas procedurais', consulta: 'unidades=2000&atlas=0' },
  { nome: '2000 unidades, sprites do Blender', consulta: 'unidades=2000' },
  { nome: '6000 unidades, sprites do Blender', consulta: 'unidades=6000&zoom=30' },
  { nome: '10000 unidades, sprites do Blender', consulta: 'unidades=10000&zoom=24' },
];
const cenarios = todos.slice(0, limite);

const navegador = await motor.launch(motor === chromium ? { args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] } : {});
for (const cenario of cenarios) {
  const pagina = await navegador.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  const erros = [];
  pagina.on('pageerror', e => erros.push(e.message));
  await pagina.goto(`${base}/?bench=1&res=nativa&seg=10&avancar=1500&${cenario.consulta}`);
  await pagina.waitForFunction(() => window.__bench, null, { timeout: 150000 });
  const resultado = await pagina.evaluate(() => window.__bench);
  console.log(JSON.stringify({ cenario: cenario.nome, ...resultado, erros }));
  await pagina.close();
}
await navegador.close();
