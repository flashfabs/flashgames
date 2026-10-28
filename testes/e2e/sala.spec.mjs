// Room flow: joining through the link, ready checks, moving and dropping bombs, and someone leaving mid-round.

import { test, expect, semCaixas } from './mesa.mjs';

test('host creates a room, 4 guests join by link, everyone gets ready and the round starts', async ({ mesa }) => {
  const nomes = ['Anfitriã', 'Bia', 'Caio', 'Duda', 'Edu'];
  const { host, convidados } = await mesa.montar(nomes, { anfitriao: { iniciar: [semCaixas] } });
  const todos = [host, ...convidados];

  // Everyone sees the same five people, and only the host has the crown.
  for (const jogador of todos) {
    await expect(jogador.pagina.locator('#contagem-membros')).toHaveText('5/8');
    await expect(jogador.pagina.locator('#lista-membros li')).toHaveText(nomes.map(nome => new RegExp(nome)));
    await expect(jogador.pagina.locator('#lista-membros li').first()).toContainText('👑');
  }

  await mesa.todosProntos(convidados);
  await expect(host.pagina.locator('.pavio-dica')).toHaveText('Só falta você.');
  await expect.poll(async () => (await host.jogo()).prontos.length).toBe(4);
  expect(await host.fase()).toBe('lobby');

  await host.ficarPronto();
  for (const jogador of todos) {
    await expect(jogador.pagina.locator('.pavio-sobretitulo')).toHaveText('Partida 1 de 5');
    await expect(jogador.pagina.locator('.pavio-mapa')).toHaveText('Pátio');
  }
  for (const jogador of todos) await jogador.esperarFase('jogo');
  const jogo = await host.jogo();
  expect(jogo.escalacao.map(item => item.nome)).toEqual(nomes);

  // With the crate-free arena the slots follow the join order: Bia starts in the bottom right corner.
  const bia = convidados[0];
  expect(await host.posicaoDe(bia)).toMatchObject({ x: 19, y: 13, v: 1 });
  await bia.andarAte([17, 13]);
  await expect.poll(async () => {
    const { x, y } = await host.posicaoDe(bia);
    return Math.round(x) === 17 && y === 13;
  }, { message: 'the host sees Bia two cells to the left' }).toBe(true);

  await bia.soltarBomba();
  const bombaEm = jogador => async () => (await jogador.bombas()).some(([x, y]) => x === 17 && y === 13);
  await expect.poll(bombaEm(host), { message: 'the bomb shows up for the host' }).toBe(true);
  await expect.poll(bombaEm(convidados[1]), { message: 'the bomb shows up for another guest' }).toBe(true);

  // Out of the blast: back to the corner and one cell up, off both arms of the explosion.
  await bia.andarAte([19, 12]);
  await expect.poll(bombaEm(host), { message: 'the bomb goes off', timeout: 5_000 }).toBe(false);
  await expect.poll(async () => (await host.jogo()).vista.c.length, { message: 'the flames die out' }).toBe(0);
  expect(await host.posicaoDe(bia)).toMatchObject({ v: 1 });
  expect(await host.fase()).toBe('jogo');
});

test('someone leaving mid-round ends it with the reason, then everyone goes back to the lobby', async ({ mesa }) => {
  const { host, convidados } = await mesa.montar(['Anfitrião', 'Fê', 'Gabi']);
  const [fe, gabi] = convidados;
  await mesa.todosProntos([host, fe, gabi]);
  for (const jogador of [host, fe, gabi]) await jogador.esperarFase('jogo');

  await gabi.pagina.locator('#botao-sair').click();
  await expect(gabi.pagina.locator('#inicio')).toBeVisible();

  const motivo = 'Gabi saiu da sala, então a rodada acabou.';
  for (const jogador of [host, fe]) {
    await jogador.esperarFase('final');
    await expect(jogador.pagina.locator('.pavio-sobretitulo')).toHaveText('Rodada interrompida');
    await expect(jogador.pagina.locator('.pavio-motivo')).toHaveText(motivo);
    await expect(jogador.pagina.locator('#contagem-membros')).toHaveText('2/8');
  }
  expect((await host.jogo()).motivo).toBe(motivo);

  // The final scoreboard lists who played the round, including whoever left.
  await expect(host.pagina.locator('.pavio-placar tbody tr')).toHaveCount(3);

  await host.pagina.getByRole('button', { name: 'Voltar ao lobby agora' }).click();
  for (const jogador of [host, fe]) {
    await jogador.esperarFase('lobby');
    await expect(jogador.pagina.getByRole('button', { name: 'Estou pronto' })).toBeVisible();
  }
});
