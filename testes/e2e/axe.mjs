// axe-core check shared by the scenarios: WCAG 2.1 A and AA rules; serious and critical problems fail, except the
// rule ids in CONHECIDOS (owner and reason), which are printed on every run until fixed.

import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './mesa.mjs';

const REGRAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
// Rule id -> why it is tolerated for now (owner and date). Empty when everything is fixed.
export const CONHECIDOS = {};

export async function verificarAcessibilidade(pagina, onde) {
  const { violations: problemas } = await new AxeBuilder({ page: pagina }).withTags(REGRAS).analyze();
  const graves = problemas.filter(problema => ['serious', 'critical'].includes(problema.impact));
  const resumo = graves.map(problema => `${onde}: ${problema.id} (${problema.impact}, ${problema.nodes.length}x) ${problema.help}: ${problema.nodes.slice(0, 3).map(no => no.target.join(' ')).join(' | ')}`);
  console.log(`${onde}: ${problemas.length} axe rule(s) with problems, ${graves.length} serious or critical`);
  if (resumo.length) console.log(resumo.join('\n'));
  await test.info().attach(`axe-${onde}.json`, { body: JSON.stringify(problemas, null, 2), contentType: 'application/json' });
  expect(graves.filter(problema => !CONHECIDOS[problema.id]).map(problema => `${problema.id}: ${problema.help}`), `serious or critical problems on ${onde}`).toEqual([]);
}
