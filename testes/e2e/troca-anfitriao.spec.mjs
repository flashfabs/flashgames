// Host hand-over: when the host leaves on purpose, the oldest guest takes the room (same code), the others follow
// it, the game goes back to the lobby and a new round can start; the old host can come back by the same link.

import { test, expect } from './mesa.mjs';

test('the host leaves on purpose: the oldest guest takes over, the others follow and a new round starts', async ({ mesa }) => {
  const { host: ana, convidados: [bia, caio], link } = await mesa.montar(['Ana', 'Bia', 'Caio']);
  const { codigo } = await ana.sala();
  const idBia = (await bia.sala()).meuId;
  const idCaio = (await caio.sala()).meuId;

  // Leaving asks first and names who gets the room.
  await ana.pagina.locator('#botao-sair').click();
  await expect(ana.pagina.locator('#confirmar-saida')).toBeVisible();
  await expect(ana.pagina.locator('#confirmar-texto')).toContainText('Bia');
  await ana.pagina.locator('#botao-confirmar-saida').click();
  await expect(ana.pagina.locator('#inicio')).toBeVisible();

  // Bia is the host now, under the same code, and Caio is with her; nobody changed id.
  await expect.poll(async () => (await bia.sala())?.souAnfitriao, { message: 'Bia becomes the host', timeout: 25_000 }).toBe(true);
  for (const jogador of [bia, caio]) {
    await expect.poll(async () => (await jogador.sala())?.membros.map(item => item.id).sort(), {
      message: `${jogador.nome} sees Bia and Caio only`, timeout: 25_000,
    }).toEqual([idBia, idCaio].sort());
    await expect(jogador.pagina.locator('#queda')).toBeHidden({ timeout: 20_000 });
    expect((await jogador.sala()).codigo).toBe(codigo);
    await jogador.esperarFase('lobby');
  }
  expect((await caio.sala()).meuId).toBe(idCaio);
  // Bia wears the crown on both screens.
  for (const jogador of [bia, caio]) {
    await expect(jogador.pagina.locator('#lista-membros li', { hasText: 'Bia' })).toContainText('👑');
  }
  await expect(caio.pagina.locator('#contagem-membros')).toHaveText('2/8');

  // A new round under the new host.
  await mesa.todosProntos([bia, caio]);
  await bia.esperarFase('jogo');
  await caio.esperarFase('jogo');
  expect((await bia.jogo()).escalacao.map(item => item.id).sort()).toEqual([idBia, idCaio].sort());

  // Ana comes back through the same link and watches the round in progress.
  await ana.entrarPeloLink(link);
  await expect(bia.pagina.locator('#contagem-membros')).toHaveText('3/8');
  await ana.esperarFase('jogo');
  expect((await ana.sala()).souAnfitriao).toBe(false);
  expect((await ana.jogo()).escalacao.map(item => item.nome)).not.toContain('Ana');
});
