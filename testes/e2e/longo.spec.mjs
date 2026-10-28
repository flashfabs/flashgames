// Long run (only with SALINHA_LONGO=1, several minutes): a host with 7 hard robots plays a whole round, and the
// JavaScript heap, DOM size and frame rate are read after every match. Memory that keeps growing from match to
// match points to effects, particles or listeners that are never released.

import { test, expect } from './mesa.mjs';

test.skip(!process.env.SALINHA_LONGO, 'long run: set SALINHA_LONGO=1');

async function medirPagina(pagina, cdp) {
  await cdp.send('HeapProfiler.collectGarbage');
  const { usedSize } = await cdp.send('Runtime.getHeapUsage');
  const contagem = await pagina.evaluate(() => new Promise(resolver => {
    let quadros = 0;
    const inicio = performance.now();
    const passo = () => {
      quadros++;
      if (performance.now() - inicio < 2000) requestAnimationFrame(passo);
      else resolver({ nos: document.getElementsByTagName('*').length, fps: Math.round(quadros / ((performance.now() - inicio) / 1000)) });
    };
    requestAnimationFrame(passo);
  }));
  return { heapMB: Math.round(usedSize / 1e5) / 10, ...contagem };
}

test('a whole round with 7 hard robots: memory, DOM size and frame rate after each match', async ({ mesa }) => {
  test.setTimeout(30 * 60_000);
  const host = await mesa.novoJogador('Anfitrião');
  await host.criarSala();
  const aviso = host.pagina.locator('.pavio-aviso');
  await aviso.getByRole('button', { name: 'Difícil', exact: true }).click();
  for (let n = 0; n < 7; n++) await aviso.getByRole('button', { name: '+ Robô' }).click();
  await host.ficarPronto();
  const cdp = await host.contexto.newCDPSession(host.pagina);
  await host.esperarFase('jogo');
  const medidas = [{ momento: 'partida 1 começando', ...(await medirPagina(host.pagina, cdp)) }];

  for (let numero = 1; numero <= 5; numero++) {
    await host.esperarFase('jogo', 60_000);
    // The host leaves the fight to the robots: a bomb at its own feet.
    await host.soltarBomba();
    await expect.poll(() => host.fase(), { timeout: 6 * 60_000, intervals: [2_000] }).toBe(numero < 5 ? 'resultado' : 'final');
    medidas.push({ momento: `fim da partida ${numero}`, ...(await medirPagina(host.pagina, cdp)) });
  }
  console.log(`Rodada longa com 7 robôs:\n${medidas.map(m => `${m.momento}: heap ${m.heapMB} MB, ${m.nos} nós, ${m.fps} fps`).join('\n')}`);
  await test.info().attach('longo.json', { body: JSON.stringify(medidas, null, 2), contentType: 'application/json' });

  const [primeira, ...resto] = medidas;
  const ultima = resto.at(-1);
  expect(ultima.heapMB, 'heap after the round compared with the start').toBeLessThan(primeira.heapMB * 2 + 20);
  expect(ultima.nos, 'DOM nodes after the round compared with the start').toBeLessThan(primeira.nos * 2 + 200);
});
