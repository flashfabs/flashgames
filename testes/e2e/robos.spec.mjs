// Robots: the host fills the room with computer players from the lobby, and they play on both screens.

import { test, expect } from './mesa.mjs';

// Robot players of the lineup with their index, as the given page sees them.
async function robosNaPartida(jogador) {
  const jogo = await jogador.jogo();
  return (jogo?.escalacao ?? []).map((item, n) => ({ ...item, n, j: jogo.vista?.j?.[n] ?? null })).filter(item => item.robo);
}

test('the host adds robots of every level, a guest sees them, and they play the match', async ({ mesa }) => {
  const { host, convidados: [gil] } = await mesa.montar(['Ana', 'Gil']);
  const lobby = host.pagina.locator('.pavio-aviso');

  // One robot per level: pick the level, then add.
  for (const nivel of ['Fácil', 'Médio', 'Difícil']) {
    await lobby.getByRole('button', { name: nivel, exact: true }).click();
    await lobby.getByRole('button', { name: '+ Robô' }).click();
  }
  // A fourth one, taken out again.
  await lobby.getByRole('button', { name: '+ Robô' }).click();
  await expect(lobby.locator('.pavio-prontos-robo')).toHaveCount(4);
  await lobby.getByRole('button', { name: 'Tirar 🤖 Chip' }).click();
  await expect(lobby.locator('.pavio-prontos-robo')).toHaveCount(3);
  // The level button of a robot cycles fácil → médio → difícil.
  await lobby.getByRole('button', { name: '🤖 Parafuso: Fácil. Trocar a dificuldade' }).click();
  await expect(lobby.getByRole('button', { name: '🤖 Parafuso: Médio. Trocar a dificuldade' })).toBeVisible();
  await lobby.getByRole('button', { name: '🤖 Parafuso: Médio. Trocar a dificuldade' }).click();
  await lobby.getByRole('button', { name: '🤖 Parafuso: Difícil. Trocar a dificuldade' }).click();
  expect((await host.jogo()).robos.map(robo => [robo.nome, robo.nivel])).toEqual([
    ['🤖 Parafuso', 'facil'], ['🤖 Rebite', 'medio'], ['🤖 Bobina', 'dificil'],
  ]);

  // The guest sees the robots, always ready, without the host's buttons.
  const lobbyGil = gil.pagina.locator('.pavio-aviso');
  await expect(lobbyGil.locator('.pavio-prontos-robo')).toHaveText([/🤖 Parafuso\s*robô fácil/, /🤖 Rebite\s*robô médio/, /🤖 Bobina\s*robô difícil/]);
  await expect(lobbyGil.locator('.pavio-robo-tirar, .pavio-robos')).toHaveCount(0);

  // Only the people need to get ready.
  await mesa.todosProntos([host, gil]);
  await host.esperarFase('jogo');
  await gil.esperarFase('jogo');
  const inicio = await robosNaPartida(host);
  expect(inicio.map(robo => [robo.nome, robo.robo])).toEqual([['🤖 Parafuso', 'facil'], ['🤖 Rebite', 'medio'], ['🤖 Bobina', 'dificil']]);

  // The robots walk, drop bombs and break crates on the host's simulation...
  await expect.poll(async () => (await robosNaPartida(host)).filter(robo => robo.j.cx > 0).length, {
    message: 'robots break crates', timeout: 25_000,
  }).toBeGreaterThan(0);
  const andaram = (await robosNaPartida(host)).filter(robo => {
    const antes = inicio.find(item => item.id === robo.id).j;
    return Math.abs(robo.j.x - antes.x) + Math.abs(robo.j.y - antes.y) > 0.5 || !robo.j.v;
  });
  expect(andaram.length, 'robots left their spawn').toBeGreaterThan(0);

  // ...and the guest sees them move too.
  const vistosPeloGil = await robosNaPartida(gil);
  expect(vistosPeloGil.map(robo => robo.nome)).toEqual(['🤖 Parafuso', '🤖 Rebite', '🤖 Bobina']);
  expect(vistosPeloGil.some(robo => robo.j.cx > 0)).toBe(true);
});
