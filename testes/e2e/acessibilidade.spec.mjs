// Accessibility: axe-core (WCAG 2.1 A and AA rules, see axe.mjs) on the home screen and on the room lobby, on a
// desktop and on a phone. The result screen is checked inside pontos.spec.mjs, which already gets there.

import { devices } from '@playwright/test';
import { test, expect } from './mesa.mjs';
import { verificarAcessibilidade as verificar } from './axe.mjs';

const { defaultBrowserType, ...CELULAR } = devices['Pixel 7'];

for (const [aparelho, contexto] of [['desktop', {}], ['celular', CELULAR]]) {
  test(`home screen and lobby pass axe on ${aparelho}`, async ({ mesa }) => {
    const host = await mesa.novoJogador('Ana', { contexto });
    await host.pagina.goto('/?teste=1');
    await verificar(host.pagina, `inicio-${aparelho}`);
    const { link } = await host.criarSala();
    const convidado = await mesa.novoJogador('Bento', { contexto });
    await convidado.entrarPeloLink(link);
    await expect(host.pagina.locator('#contagem-membros')).toHaveText('2/8');
    await verificar(host.pagina, `lobby-anfitriao-${aparelho}`);
    await verificar(convidado.pagina, `lobby-convidado-${aparelho}`);
  });
}
