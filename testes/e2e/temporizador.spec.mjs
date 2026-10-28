import { test, expect, semCaixas } from './mesa.mjs';

test('a normal bomb keeps its real-time fuse even after a short browser stall', async ({ mesa }) => {
  const host = await mesa.novoJogador('Faisca', { iniciar: [semCaixas] });
  await host.criarSala();
  const lobby = host.pagina.locator('.pavio-aviso');
  await lobby.getByRole('button', { name: 'Fácil', exact: true }).click();
  await lobby.getByRole('button', { name: '+ Robô' }).click();
  await host.ficarPronto();
  await host.esperarFase('jogo');
  const posicao = await host.minhaPosicao();
  const x = Math.round(posicao.x), y = Math.round(posicao.y);
  const minhaBomba = async () => (await host.bombas()).some(([bx, by]) => bx === x && by === y);
  const comeco = Date.now();
  await host.soltarBomba();
  await expect.poll(minhaBomba, { intervals: [20], timeout: 2000 }).toBe(true);
  await host.pagina.evaluate(() => {
    const ate = performance.now() + 1200;
    while (performance.now() < ate) { /* Simulate a temporarily blocked host. */ }
  });
  await expect.poll(minhaBomba, { intervals: [20], timeout: 7000 }).toBe(false);
  const decorrido = Date.now() - comeco;
  expect(decorrido, 'normal bomb should keep its original 2.4-second fuse').toBeGreaterThan(2100);
  expect(decorrido, 'normal bomb should not lose the time spent in the stall').toBeLessThan(3300);
});
