// A whole round: 5 matches in map order, the final screen with the champion and the scoreboard, and back to the
// lobby. The host plays against one robot and blows itself up in every match, so each one ends in seconds.

import { test, expect } from './mesa.mjs';
import { MAPAS } from '../../site/js/pavio/regras.js';

test('a full round goes through the 5 maps to the final screen and back to the lobby', async ({ mesa }) => {
  test.setTimeout(240_000);
  const lia = await mesa.novoJogador('Lia');
  await lia.criarSala();
  const aviso = lia.pagina.locator('.pavio-aviso');
  await aviso.getByRole('button', { name: '+ Robô' }).click();
  await expect(aviso.locator('.pavio-prontos-robo')).toHaveCount(1);
  await lia.ficarPronto();

  const total = MAPAS.length;
  for (let numero = 1; numero <= total; numero++) {
    await expect(lia.pagina.locator('.pavio-sobretitulo')).toHaveText(`Partida ${numero} de ${total}`, { timeout: 20_000 });
    await expect(lia.pagina.locator('.pavio-mapa')).toHaveText(MAPAS[numero - 1].nome);
    await lia.esperarFase('jogo');
    // A bomb at her own feet: the match ends a few seconds later, whoever survives.
    await lia.soltarBomba();
    await lia.esperarFase(numero < total ? 'resultado' : 'final', 30_000);
    expect((await lia.jogo()).numero).toBe(numero);
  }

  await expect(lia.pagina.locator('.pavio-sobretitulo')).toHaveText('Fim da rodada');
  await expect(aviso.locator('h2')).toHaveText(/campeão da rodada|Empate/);
  await expect(aviso.locator('.pavio-placar tbody tr')).toHaveCount(2);
  const { placar, escalacao } = await lia.jogo();
  const idLia = escalacao.find(item => item.nome === 'Lia').id;
  // Blowing yourself up never scores an elimination, and there are at most 5 wins to share.
  expect(placar[idLia].eliminacoes).toBe(0);
  expect(Object.values(placar).reduce((soma, linha) => soma + linha.vitorias, 0)).toBeLessThanOrEqual(total);

  await aviso.getByRole('button', { name: 'Voltar ao lobby agora' }).click();
  await lia.esperarFase('lobby');
  await expect(aviso.getByRole('button', { name: 'Estou pronto' })).toBeVisible();
  await expect(aviso.locator('.pavio-prontos-robo'), 'the robot stays for the next round').toHaveCount(1);
});
