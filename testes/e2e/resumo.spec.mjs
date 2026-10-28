// Match and round summaries: highlights and the eliminations of a match, the vote to skip the wait, and
// "Jogar de novo" bringing a guest back to the lobby already ready.

import { test, expect, semCaixas } from './mesa.mjs';

test('the result shows highlights and eliminations, and both voting to skip starts the next match', async ({ mesa }) => {
  const { host, convidados: [iris] } = await mesa.montar(['Hugo', 'Íris'], { anfitriao: { iniciar: [semCaixas] } });
  await mesa.todosProntos([host, iris]);
  await host.esperarFase('jogo');
  // Hugo sits on his own bomb: Íris wins and stays alive longer.
  await host.soltarBomba();
  for (const jogador of [host, iris]) await jogador.esperarFase('resultado', 15_000);

  const cartao = iris.pagina.locator('.pavio-aviso');
  await expect(cartao.locator('.pavio-destaque', { hasText: 'Mais tempo vivo' })).toContainText('Íris');
  await cartao.locator('.pavio-linha-tempo summary').click();
  await expect(cartao.locator('.pavio-linha-tempo li')).toHaveText([/Hugo explodiu com a própria bomba/]);

  await expect(host.pagina.getByRole('button', { name: 'Pular para a próxima (0/2)' })).toBeVisible();
  await host.pagina.getByRole('button', { name: 'Pular para a próxima (0/2)' }).click();
  await expect(host.pagina.getByRole('button', { name: 'Esperando os outros (1/2)' })).toBeDisabled();
  await expect(cartao.getByRole('button', { name: 'Pular para a próxima (1/2)' })).toBeVisible();
  const antes = Date.now();
  await cartao.getByRole('button', { name: 'Pular para a próxima (1/2)' }).click();
  for (const jogador of [host, iris]) await jogador.esperarFase('contagem', 4000);
  expect(Date.now() - antes, 'the next match starts well before the 7 s of the result screen').toBeLessThan(4000);
});

test('"Jogar de novo" at the end of the round brings a guest back to the lobby already ready', async ({ mesa }) => {
  test.setTimeout(150_000);
  const { host, convidados: [iris] } = await mesa.montar(['Hugo', 'Íris'], { anfitriao: { iniciar: [semCaixas] } });
  await mesa.todosProntos([host, iris]);
  for (let partida = 1; partida <= 5; partida++) {
    await host.esperarFase('jogo', 15_000);
    await host.soltarBomba();
    if (partida === 5) break;
    for (const jogador of [host, iris]) await jogador.esperarFase('resultado', 15_000);
    await host.pagina.getByRole('button', { name: /Pular para a próxima/ }).click();
    await iris.pagina.getByRole('button', { name: /Pular para a próxima/ }).click();
  }
  for (const jogador of [host, iris]) await jogador.esperarFase('final', 15_000);
  await expect(iris.pagina.locator('.pavio-conquista').first()).toBeVisible();

  await iris.pagina.getByRole('button', { name: 'Jogar de novo' }).click();
  await expect(iris.pagina.getByRole('button', { name: 'Combinado: você volta pronto' })).toBeDisabled();
  await host.pagina.getByRole('button', { name: 'Voltar ao lobby agora' }).click();
  await host.esperarFase('lobby');
  const idIris = (await iris.sala()).meuId;
  await expect.poll(async () => (await host.jogo()).prontos).toContain(idIris);
  await expect(iris.pagina.getByRole('button', { name: 'Cancelar pronto' })).toBeVisible();
});
