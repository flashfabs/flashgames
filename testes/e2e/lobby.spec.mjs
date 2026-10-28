// Lobby and match screens: colors with a full arena, scrolling kept on a short screen, the countdown fitting a
// phone, and a dropped guest shown as reconnecting.

import { devices } from '@playwright/test';
import { test, expect } from './mesa.mjs';

const CELULAR_DEITADO = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

async function adicionarRobos(jogador, niveis) {
  const lobby = jogador.pagina.locator('.pavio-aviso');
  for (const nivel of niveis) {
    await lobby.getByRole('button', { name: nivel, exact: true }).click();
    await lobby.getByRole('button', { name: '+ Robô' }).click();
  }
  await expect(lobby.locator('.pavio-prontos-robo')).toHaveCount(niveis.length);
}

test('someone joining while robots fill the arena never takes another player\'s color', async ({ mesa }) => {
  const ana = await mesa.novoJogador('Ana');
  const { link } = await ana.criarSala();
  await adicionarRobos(ana, Array(7).fill('Fácil'));
  await ana.ficarPronto();
  await ana.esperarFase('jogo');

  const gil = await mesa.novoJogador('Gil');
  await gil.entrarPeloLink(link);
  await expect(ana.pagina.locator('#contagem-membros')).toHaveText('2/8');
  const idGil = (await gil.sala()).meuId;
  const { cores, escalacao } = await ana.jogo();
  const corGil = cores[idGil];
  // The arena holds 8: Gil only watches, without a color until a robot makes room.
  expect(corGil === undefined || (corGil < 8 && !escalacao.some(item => item.cor === corGil))).toBe(true);
  for (const cor of Object.values(cores)) expect(cor).toBeLessThan(8);
});

test('on a short screen the lobby keeps its scroll when someone gets ready', async ({ mesa }) => {
  const { host, convidados: [gil] } = await mesa.montar(['Ana', 'Gil'], { anfitriao: { contexto: CELULAR_DEITADO } });
  await adicionarRobos(host, ['Fácil', 'Médio', 'Difícil', 'Fácil', 'Médio', 'Difícil']);
  const aviso = host.pagina.locator('.pavio-aviso');
  const fundo = await aviso.evaluate(elemento => {
    elemento.scrollTop = elemento.scrollHeight;
    return elemento.scrollTop;
  });
  expect(fundo, 'the lobby card needs scrolling on this screen').toBeGreaterThan(40);
  await gil.ficarPronto();
  await expect(host.pagina.locator('.pavio-prontos li').nth(1)).toHaveClass(/pronto/);
  expect(await aviso.evaluate(elemento => elemento.scrollTop)).toBeGreaterThan(fundo - 5);
});

test('on a phone the countdown with two new powers fits the arena', async ({ mesa }) => {
  const ana = await mesa.novoJogador('Ana', { contexto: devices['iPhone 13'] });
  await ana.criarSala();
  // Ana sits on her own bomb, so the first match ends in seconds; the second one unlocks two powers.
  await adicionarRobos(ana, ['Fácil']);
  await ana.pagina.getByRole('button', { name: 'Estou pronto' }).tap();
  await ana.esperarFase('jogo');
  await ana.soltarBomba();
  await expect(ana.pagina.locator('.pavio-aviso--contagem .pavio-sobretitulo')).toHaveText('Partida 2 de 5', { timeout: 30_000 });
  await expect(ana.pagina.locator('.pavio-aviso--contagem .pavio-poder')).toHaveCount(2);
  const arena = await ana.pagina.locator('.pavio-arena').boundingBox();
  for (const seletor of ['.pavio-sobretitulo', '.pavio-mapa', '.pavio-numero']) {
    const caixa = await ana.pagina.locator(`.pavio-aviso--contagem ${seletor}`).boundingBox();
    expect(caixa.y, `${seletor} top`).toBeGreaterThanOrEqual(arena.y - 1);
    expect(caixa.y + caixa.height, `${seletor} bottom`).toBeLessThanOrEqual(arena.y + arena.height + 1);
  }
});

test('a guest whose link drops shows as reconnecting and holds the start until it is back', async ({ mesa }) => {
  const { host, convidados: [gil, iris] } = await mesa.montar(['Ana', 'Gil', 'Íris']);
  await gil.ficarPronto();
  await iris.ficarPronto();
  // Gil's page freezes for 9 s (under the 10 s the room waits): no answer to pings, like a phone losing its signal.
  const congelado = gil.pagina.evaluate(() => {
    const fim = Date.now() + 9000;
    while (Date.now() < fim);
  }).catch(() => {});
  const lobby = host.pagina.locator('.pavio-aviso');
  await expect(lobby.locator('.pavio-prontos li', { hasText: 'Gil' })).toContainText('📶 reconectando', { timeout: 8000 });
  await host.ficarPronto();
  await expect(lobby.locator('.pavio-dica')).toHaveText('Esperando Gil reconectar.');
  expect(await host.fase()).toBe('lobby');
  await congelado;
  await host.esperarFase('contagem', 15_000);
});
