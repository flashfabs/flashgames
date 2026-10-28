// Journey edge cases: a mistyped code, a room that no longer exists, and someone arriving mid-match. The checks
// look at what the person can do next (an explanation on screen, still on the home screen, watching instead of
// playing) rather than at exact wording, which the journey front is rewriting.

import { test, expect } from './mesa.mjs';

test('a mistyped code and a room that no longer exists keep the person on the home screen with an explanation', async ({ mesa }) => {
  const ana = await mesa.novoJogador('Ana');
  await ana.pagina.goto('/?teste=1');
  await ana.pagina.locator('#campo-codigo').fill('AB1');
  await ana.pagina.locator('#campo-codigo').press('Enter');
  const mensagem = ana.pagina.locator('#mensagem-inicio');
  await expect(mensagem).toBeVisible();
  await expect(mensagem).not.toBeEmpty();
  await expect(ana.pagina.locator('#sala')).toBeHidden();

  // A well-formed code nobody is using: the signaling server says the host does not exist.
  await ana.pagina.goto('/?teste=1#ZZZZZ');
  await expect(ana.pagina.locator('#convite')).toBeVisible();
  await ana.pagina.getByRole('button', { name: 'Entrar na sala' }).click();
  await expect(mensagem).toContainText(/sala/i, { timeout: 25_000 });
  await expect(ana.pagina.locator('#sala')).toBeHidden();
  // From there, creating a new room still works.
  await ana.pagina.locator('#botao-ignorar-convite').click();
  await ana.pagina.getByRole('button', { name: 'Criar sala' }).click();
  await expect(ana.pagina.locator('#sala')).toBeVisible({ timeout: 30_000 });
});

test('someone who arrives mid-match watches and is not in the lineup', async ({ mesa }) => {
  const { host, convidados: [bia], link } = await mesa.montar(['Caio', 'Bia']);
  await mesa.todosProntos([host, bia]);
  await host.esperarFase('jogo');

  const duda = await mesa.novoJogador('Duda');
  await duda.entrarPeloLink(link);
  await duda.esperarFase('jogo');
  const idDuda = (await duda.sala()).meuId;
  expect((await duda.jogo()).escalacao.map(item => item.id)).not.toContain(idDuda);
  expect((await host.jogo()).escalacao).toHaveLength(2);
  // Duda sees the match being played and is told they are watching; the host's list says so too.
  await expect.poll(async () => (await duda.jogo()).vista?.j?.length ?? 0, { message: 'Duda receives the match' }).toBe(2);
  await expect(duda.pagina.locator('.pavio-aviso')).toContainText(/assist/i);
  await expect(host.pagina.locator('#lista-membros li', { hasText: 'Duda' })).toContainText(/assist/i);
  // Watching gives no touch layer and no bombs.
  await duda.soltarBomba();
  await host.pagina.waitForTimeout(300);
  expect(await host.bombas()).toEqual([]);
});
