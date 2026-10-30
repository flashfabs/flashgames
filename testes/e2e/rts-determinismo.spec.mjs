// Determinism barrier across engines: the same match must give the same checksums in Node and inside a Worker of Chromium, Firefox and WebKit.
// It runs the prototype's scripted match and every golden replay in testes/rts-replays/, comparing each with Node and with the stored checksums.
// Locally, an engine whose browser is not installed is skipped with a note; on CI (CI=true) a missing browser fails.

import { test, expect, chromium, firefox, webkit } from '@playwright/test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('../../', import.meta.url));
const pastaReplays = `${raiz}testes/rts-replays/`;
const replays = existsSync(pastaReplays) ? readdirSync(pastaReplays).filter((nome) => nome.endsWith('.json')).sort() : [];
const motores = { chromium, firefox, webkit };

test.skip(({ browserName }) => !process.env.CI && !existsSync(motores[browserName].executablePath()), 'this engine is not installed here (npx playwright install firefox webkit needs the Victor approval)');

// Any same-origin document will do: the Worker is what runs the match.
async function rodarNoWorker(page, pedido) {
  await page.goto('/testes/e2e/');
  const resposta = await page.evaluate((pedidoNoNavegador) => new Promise((resolve, reject) => {
    const trabalhador = new Worker('/testes/e2e/rts-determinismo-trabalhador.js', { type: 'module' });
    trabalhador.onmessage = ({ data }) => {
      trabalhador.terminate();
      resolve(data);
    };
    trabalhador.onerror = (evento) => reject(new Error(evento.message || 'the Worker did not load'));
    trabalhador.postMessage(pedidoNoNavegador);
  }), pedido);
  expect(resposta.erro).toBeUndefined();
  return resposta;
}

test('the prototype scripted match gives the reference checksums inside a Worker, the same as in Node', async ({ page }) => {
  const { executarRoteiro, SOMAS_DE_REFERENCIA } = await import('../../prototipos/rts-4k/roteiro-determinismo.js');
  const noNode = executarRoteiro(() => performance.now());
  expect(noNode.somas).toEqual(SOMAS_DE_REFERENCIA);
  const noNavegador = await rodarNoWorker(page, { tipo: 'roteiro' });
  expect(noNavegador.somas).toEqual(noNode.somas);
  expect(noNavegador.final).toBe(noNode.final);
});

for (const nome of replays) {
  test(`golden replay ${nome} gives the stored checksums inside a Worker, the same as in Node`, async ({ page }) => {
    test.setTimeout(300_000);
    const replay = JSON.parse(readFileSync(`${pastaReplays}${nome}`, 'utf8'));
    const { executarReplay } = await import('../../site/rts/js/sim/replay.js');
    const noNode = executarReplay(structuredClone(replay));
    expect({ somas: noNode.somas, final: noNode.final }).toEqual({ somas: replay.somas, final: replay.final });
    const noNavegador = await rodarNoWorker(page, { tipo: 'replay', replay });
    expect({ somas: noNavegador.somas, final: noNavegador.final }).toEqual({ somas: replay.somas, final: replay.final });
  });
}
