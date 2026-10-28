// Accessibility: axe-core (WCAG 2.1 A and AA rules) on the home screen and on the room lobby, on a desktop and
// on a phone. Serious and critical problems fail the test, except the ones listed in CONHECIDOS, which are
// already reported to the owner of the screen and printed on every run until they are fixed.

import AxeBuilder from '@axe-core/playwright';
import { devices } from '@playwright/test';
import { test, expect } from './mesa.mjs';

const { defaultBrowserType, ...CELULAR } = devices['Pixel 7'];
const REGRAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
// Rule id -> why it is tolerated for now (owner and date). Empty when everything is fixed.
const CONHECIDOS = {};

async function verificar(pagina, onde) {
  const { violations: problemas } = await new AxeBuilder({ page: pagina }).withTags(REGRAS).analyze();
  const graves = problemas.filter(problema => ['serious', 'critical'].includes(problema.impact));
  const resumo = graves.map(problema => `${onde}: ${problema.id} (${problema.impact}, ${problema.nodes.length}x) ${problema.help}: ${problema.nodes.slice(0, 3).map(no => no.target.join(' ')).join(' | ')}`);
  console.log(`${onde}: ${problemas.length} axe rule(s) with problems, ${graves.length} serious or critical`);
  if (resumo.length) console.log(resumo.join('\n'));
  await test.info().attach(`axe-${onde}.json`, { body: JSON.stringify(problemas, null, 2), contentType: 'application/json' });
  expect(graves.filter(problema => !CONHECIDOS[problema.id]).map(problema => `${problema.id}: ${problema.help}`), `serious or critical problems on ${onde}`).toEqual([]);
}

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
