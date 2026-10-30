// Scoring: an explosion eliminates a player and the result screen shows the right points.

import { test, expect, semCaixas } from './mesa.mjs';
import { verificarAcessibilidade } from './axe.mjs';

test('a guest bomb eliminates the host and the result screen shows the right score', async ({ mesa }) => {
  const { host, convidados: [iris] } = await mesa.montar(['Hugo', 'Íris'], { anfitriao: { iniciar: [semCaixas] } });
  await mesa.todosProntos([host, iris]);
  await host.esperarFase('jogo');
  await iris.esperarFase('jogo');

  // Crate-free arena, slots in join order: Hugo starts at (1, 1) and Íris at (38, 28). They meet on the top row.
  expect(await host.posicaoDe(host)).toMatchObject({ x: 1, y: 1 });
  expect(await host.posicaoDe(iris)).toMatchObject({ x: 38, y: 28 });
  await Promise.all([host.andarAte([10, 1]), iris.andarAte([11, 1])]);
  await expect.poll(async () => Math.round((await host.posicaoDe(iris)).x), { message: 'the host sees Íris arrive' }).toBe(11);

  // Range 1 from (11, 1) reaches (10, 1), where Hugo stays; Íris runs to (15, 1), out of reach.
  await iris.soltarBomba();
  await expect.poll(async () => (await host.bombas()).length, { message: 'the bomb reaches the host' }).toBe(1);
  await iris.andarAte([15, 1]);

  for (const jogador of [host, iris]) await jogador.esperarFase('resultado', 10_000);
  const jogo = await host.jogo();
  const idIris = (await iris.sala()).meuId;
  expect(jogo.resultado.vencedor).toBe(idIris);
  expect(jogo.placar[idIris]).toEqual({ vitorias: 1, caixas: 0, eliminacoes: 1 });

  // Match statistics (contract in docs/plano-noite-2026-10-28.md, section 5), as the guest received them.
  const idHugo = (await host.sala()).meuId;
  const estatisticas = Object.fromEntries((await iris.jogo()).estatisticas.map(linha => [linha.id, linha]));
  expect(estatisticas[idIris]).toMatchObject({ caixas: 0, eliminacoes: 1, bombas: 1, morte: null, maiorCadeia: expect.any(Number) });
  expect(estatisticas[idIris].distancia, 'Íris walked 20 cells to the top row and 4 to escape').toBeGreaterThan(22);
  expect(estatisticas[idHugo]).toMatchObject({ caixas: 0, eliminacoes: 0, bombas: 0, morte: { por: idIris, causa: 'bomba' } });
  expect(estatisticas[idHugo].distancia).toBeGreaterThan(7);
  expect(estatisticas[idHugo].tempoVivo).toBe(estatisticas[idHugo].morte.tempo);
  expect(estatisticas[idIris].tempoVivo).toBeGreaterThan(estatisticas[idHugo].tempoVivo);

  await expect(host.pagina.locator('.pavio-aviso h2')).toHaveText('Íris venceu a partida! 🏆');
  await expect(iris.pagina.locator('.pavio-aviso h2')).toHaveText('Você venceu a partida! 🏆');
  // Columns: position, player, wins, crates, eliminations, points. Elimination 5 + win 15 = 20, all of it
  // earned in this match, so the points cell also shows the "+20" gain.
  const esperado = [['1', 'Íris', '1', '0', '1', '20+20'], ['2', 'Hugo', '0', '0', '0', '0']];
  for (const jogador of [host, iris]) {
    const linhas = jogador.pagina.locator('.pavio-placar tbody tr');
    await expect(linhas).toHaveCount(2);
    for (const [n, celulas] of esperado.entries()) {
      await expect(linhas.nth(n).locator('td')).toHaveText(celulas);
    }
    await expect(jogador.pagina.locator('.pavio-regra-pontos')).toHaveText('📦 caixa destruída = 1 ponto · 💀 eliminação = 5 · 🏆 partida vencida = 15');
    await expect(jogador.pagina.locator('#lista-membros li').nth(1)).toContainText('⭐ 20');
  }

  await verificarAcessibilidade(iris.pagina, 'resultado');

  // The next match of the round starts by itself after the result screen.
  for (const jogador of [host, iris]) {
    await expect.poll(async () => (await jogador.jogo()).numero, { timeout: 12_000 }).toBe(2);
    expect((await jogador.jogo()).mapa).toBe(1);
  }
});
