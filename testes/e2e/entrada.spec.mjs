// Coming and going: the invitation in the lobby, leaving with or without a confirmation, joining mid-round,
// and a page that is older than the site.

import { test, expect } from './mesa.mjs';

test('the lobby invites with the code, a link button and a QR code, and shows each guest\'s connection', async ({ mesa }) => {
  const { host } = await mesa.montar(['Ana', 'Gil']);
  const { codigo } = await host.sala();
  const convite = host.pagina.locator('.pavio-convite');
  await expect(convite.locator('.pavio-convite-titulo')).toHaveText(`Chame a galera · sala ${codigo}`);
  await expect(convite.getByRole('button', { name: 'Copiar link do convite' })).toBeVisible();
  await convite.getByRole('button', { name: 'QR code' }).click();
  const qr = convite.getByRole('img', { name: `QR code com o link da sala ${codigo}` });
  await expect(qr).toBeVisible();
  await expect.poll(() => qr.evaluate(canvas => canvas.width)).toBeGreaterThan(100);
  // Gil's row on the host's lobby carries his ping to the host.
  await expect(host.pagina.locator('.pavio-prontos li', { hasText: 'Gil' }).locator('.pavio-conexao')).toHaveText(/\d+ ms|…/);
});

test('the host is asked before leaving with guests in the room; a guest in the lobby just leaves', async ({ mesa }) => {
  const { host, convidados: [gil] } = await mesa.montar(['Ana', 'Gil']);
  await host.pagina.locator('#botao-sair').click();
  await expect(host.pagina.locator('#confirmar-texto')).toHaveText('Você é o anfitrião: se sair, a sala passa para Gil.');
  await host.pagina.getByRole('button', { name: 'Ficar' }).click();
  await expect(host.pagina.locator('#confirmar-saida')).toBeHidden();
  await expect(host.pagina.locator('#sala')).toBeVisible();

  await gil.pagina.locator('#botao-sair').click();
  await expect(gil.pagina.locator('#inicio')).toBeVisible();
  await expect(host.pagina.locator('#contagem-membros')).toHaveText('1/8');
});

test('someone arriving mid-round is told they watch now and play the next round', async ({ mesa }) => {
  const ana = await mesa.novoJogador('Ana');
  const { link } = await ana.criarSala();
  const lobby = ana.pagina.locator('.pavio-aviso');
  await lobby.getByRole('button', { name: 'Fácil', exact: true }).click();
  await lobby.getByRole('button', { name: '+ Robô' }).click();
  await ana.ficarPronto();
  await ana.esperarFase('jogo');

  const gil = await mesa.novoJogador('Gil');
  await gil.entrarPeloLink(link);
  await expect(gil.pagina.locator('.pavio-faixa')).toHaveText('A rodada já começou: você assiste agora e entra na próxima.');
});

test('a page older than the site says so instead of "room not found", with a reload button', async ({ mesa }) => {
  const ana = await mesa.novoJogador('Ana');
  let publicada = 'aaaaaaa';
  await ana.pagina.route('**/versao.json', rota => rota.fulfill({ json: { commit: publicada } }));
  await ana.pagina.goto('/?teste=1');
  await ana.pagina.locator('#campo-nome').fill('Ana');
  await ana.pagina.waitForTimeout(500);
  publicada = 'bbbbbbb';
  await ana.pagina.locator('#campo-codigo').fill('ZZZZZ');
  await ana.pagina.locator('#botao-entrar-codigo').click();
  await expect(ana.pagina.locator('#mensagem-inicio')).toHaveText(/Esta página está desatualizada/, { timeout: 30_000 });
  await expect(ana.pagina.getByRole('button', { name: 'Recarregar' })).toBeVisible();
  mesa.registro.length = 0;
});
