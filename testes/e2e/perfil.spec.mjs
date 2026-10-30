// Device profile on the home screen: the nickname and color are kept, the room honors the color, and a finished
// match shows up in the numbers. Locally the profile API does not exist, so this also covers conta.js offline.

import { test, expect } from './mesa.mjs';

test('the profile keeps name and color, the room uses the color, and a match adds to the numbers', async ({ mesa }) => {
  const ana = await mesa.novoJogador('Ana');
  const pagina = ana.pagina;
  await pagina.goto('/?teste=1');
  await expect(pagina.locator('#perfil-numeros [aria-label="Partidas: 0"]')).toBeVisible();
  await expect(pagina.locator('.perfil-cores-dica')).toHaveText('automática: a sala escolhe uma livre');

  await pagina.getByRole('radio', { name: 'amarelo' }).click();
  await pagina.locator('#campo-nome').fill('Ana Lúcia');
  await pagina.locator('#campo-nome').blur();
  await pagina.reload();
  await expect(pagina.locator('#campo-nome')).toHaveValue('Ana Lúcia');
  await expect(pagina.getByRole('radio', { name: 'amarelo' })).toHaveAttribute('aria-checked', 'true');

  // The room gives Ana her color, then a guest that also wants it gets another one.
  await pagina.getByRole('button', { name: 'Criar sala' }).click();
  await expect(pagina.locator('#sala')).toBeVisible({ timeout: 30_000 });
  const { link, meuId } = await ana.sala();
  expect((await ana.jogo()).cores[meuId]).toBe(3);
  const gil = await mesa.novoJogador('Gil');
  const endereco = new URL(link);
  endereco.search = '?teste=1';
  await gil.pagina.goto(endereco.toString());
  await gil.pagina.getByRole('radio', { name: 'amarelo' }).click();
  await gil.pagina.locator('#campo-nome').fill('Gil');
  await gil.pagina.getByRole('button', { name: 'Entrar na sala' }).click();
  await expect(pagina.locator('#contagem-membros')).toHaveText('2/8');
  const idGil = (await gil.sala()).meuId;
  await expect.poll(async () => (await ana.jogo()).cores[idGil]).not.toBe(undefined);
  expect((await ana.jogo()).cores[idGil]).not.toBe(3);

  // Gil leaves; Ana plays one match against a robot by sitting on her own bomb, then goes home.
  await gil.pagina.getByRole('button', { name: 'Sair' }).click();
  await expect(pagina.locator('#contagem-membros')).toHaveText('1/8');
  const lobby = pagina.locator('.pavio-aviso');
  await lobby.getByRole('button', { name: 'Fácil', exact: true }).click();
  await lobby.getByRole('button', { name: '+ Robô' }).click();
  await ana.ficarPronto();
  await ana.esperarFase('jogo');
  await ana.soltarBomba();
  await ana.esperarFase('resultado', 20_000);
  await pagina.getByRole('button', { name: 'Sair' }).click();
  await expect(pagina.locator('#inicio')).toBeVisible();
  await expect(pagina.locator('#perfil-numeros [aria-label="Partidas: 1"]')).toBeVisible();
  // The latest matches list the one just played.
  await pagina.getByText('Últimas partidas').click();
  await expect(pagina.locator('#perfil-historico-lista li')).toHaveText([/🎮 Pátio · ⭐ 0 pontos\s*👥 contra 1 robô · 🕒 agora/]);
  // Locally there is no ranking server: the list says so instead of failing.
  await pagina.getByText('Partidas com amigos').click();
  await expect(pagina.locator('#perfil-ranking-lista li')).toHaveCount(1);
  await expect(pagina.locator('#perfil-ranking-lista li')).not.toHaveText('Carregando…');
});
