// Input of the RTS with 40 units: selection by box, click, Shift and double click, attack-move and the other orders,
// the Shift queue with its points on the ground, control groups, camera and zoom, and the click answer under 100 ms.
// The simulation is paused (P) while positions are read, so units do not walk out of a box between reading and dragging.

import { test, expect } from '@playwright/test';

const TIPO = { MOVER: 1, ATACAR_MOVENDO: 3, PARAR: 4, SEGURAR_POSICAO: 5, PATRULHAR: 6 };

async function abrir(page) {
  await page.goto('/rts/?unidades=40&teste=1&atlas=0');
  await page.waitForFunction(() => window.__rts?.estado.atual?.n > 0);
  await page.mouse.move(640, 300);
  await page.keyboard.press('KeyP');
  await expect.poll(() => page.evaluate(() => window.__rts.controles.pausado)).toBe(true);
  // Centre the camera on the player's units and wait two frames for the new view.
  return page.evaluate(async () => {
    const { estado, indice, camera } = window.__rts;
    const atual = estado.atual;
    const ids = [];
    for (let k = 0; k < atual.n; k++) if (atual.dono[k] === estado.jogadorLocal) ids.push(atual.id[k]);
    Object.assign(camera, indice.centro(ids));
    await new Promise(pronto => requestAnimationFrame(() => requestAnimationFrame(pronto)));
    return ids;
  });
}

// Screen positions of the player's units inside the canvas and away from the command bar, by id.
function naTela(page) {
  return page.evaluate(() => {
    const { estado } = window.__rts;
    const atual = estado.atual;
    const barra = document.getElementById('comandos').getBoundingClientRect();
    const lista = [];
    for (let k = 0; k < atual.n; k++) {
      if (atual.dono[k] !== estado.jogadorLocal) continue;
      const p = window.__rts.naTela(atual.id[k]);
      if (p.x < 40 || p.y < 40 || p.x > innerWidth - 40 || p.y > barra.top - 20) continue;
      lista.push({ id: atual.id[k], tipo: atual.tipo[k], x: p.x, y: p.y });
    }
    return lista;
  });
}

const selecao = page => page.evaluate(() => [...window.__rts.selecionadas].sort((a, b) => a - b));
const comandos = page => page.evaluate(() => window.__rts.comandos.map(({ tipo, unidades, x, y, fila, alvo }) => ({ tipo, unidades: [...unidades].sort((a, b) => a - b), x, y, fila, alvo })));
const ordenados = ids => [...ids].sort((a, b) => a - b);

// An empty spot of ground: far from every unit and inside the canvas.
async function chaoVazio(page) {
  const unidades = await page.evaluate(() => {
    const { estado } = window.__rts;
    const atual = estado.atual;
    const lista = [];
    for (let k = 0; k < atual.n; k++) lista.push(window.__rts.naTela(atual.id[k]));
    return lista;
  });
  for (let y = 80; y < 520; y += 40) {
    for (let x = 80; x < 1200; x += 40) {
      if (unidades.every(p => Math.hypot(p.x - x, p.y - y) > 60)) return { x, y };
    }
  }
  throw new Error('no empty ground on screen');
}

async function caixa(page, unidades, { shift = false } = {}) {
  const x0 = Math.min(...unidades.map(u => u.x)) - 12;
  const y0 = Math.min(...unidades.map(u => u.y)) - 12;
  const x1 = Math.max(...unidades.map(u => u.x)) + 12;
  const y1 = Math.max(...unidades.map(u => u.y)) + 12;
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 3 });
  await page.mouse.move(x1, y1, { steps: 3 });
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
  return { x0, y0, x1, y1 };
}

const dentro = (u, { x0, y0, x1, y1 }) => u.x >= x0 && u.x <= x1 && u.y >= y0 && u.y <= y1;

test('box, click, Shift and double click select what is on screen; the empty ground deselects', async ({ page }) => {
  const minhas = await abrir(page);
  const visiveis = await naTela(page);
  expect(visiveis.length).toBeGreaterThan(3);

  const metade = visiveis.slice(0, Math.ceil(visiveis.length / 2));
  const area = await caixa(page, metade);
  const esperadas = visiveis.filter(u => dentro(u, area)).map(u => u.id);
  await expect.poll(() => selecao(page)).toEqual(ordenados(esperadas));
  expect(esperadas.every(id => minhas.includes(id))).toBe(true);

  const fora = visiveis.find(u => !esperadas.includes(u.id));
  if (fora) {
    await caixa(page, [fora], { shift: true });
    await expect.poll(() => selecao(page)).toContain(fora.id);
  }

  const alvo = visiveis[0];
  await page.keyboard.down('Shift');
  await page.mouse.click(alvo.x, alvo.y);
  await page.keyboard.up('Shift');
  await expect.poll(() => selecao(page)).not.toContain(alvo.id);

  const vazio = await chaoVazio(page);
  await page.mouse.click(vazio.x, vazio.y);
  await expect.poll(() => selecao(page)).toEqual([]);

  await page.mouse.click(alvo.x, alvo.y);
  await expect.poll(() => selecao(page)).toEqual([alvo.id]);
  await page.waitForTimeout(400);
  await page.mouse.dblclick(alvo.x, alvo.y);
  const doMesmoTipo = await page.evaluate(tipo => {
    const { estado } = window.__rts;
    const atual = estado.atual;
    const lista = [];
    for (let k = 0; k < atual.n; k++) {
      if (atual.dono[k] !== estado.jogadorLocal || atual.tipo[k] !== tipo) continue;
      const p = window.__rts.naTela(atual.id[k]);
      if (p.x >= 0 && p.y >= 0 && p.x <= innerWidth && p.y <= innerHeight) lista.push(atual.id[k]);
    }
    return lista;
  }, alvo.tipo);
  await expect.poll(() => selecao(page)).toEqual(ordenados(doMesmoTipo));
});

test('A and a click attack-moves, the marker answers under 100 ms, and Esc or the button work too', async ({ page }) => {
  await abrir(page);
  const visiveis = await naTela(page);
  await caixa(page, visiveis);
  const escolhidas = await selecao(page);
  expect(escolhidas.length).toBeGreaterThan(0);

  const vazio = await chaoVazio(page);
  await page.keyboard.press('KeyA');
  await expect.poll(() => page.evaluate(() => window.__rts.controles.modo)).toBe('atacarMovendo');
  await page.mouse.click(vazio.x, vazio.y);
  await expect.poll(() => comandos(page)).toHaveLength(1);
  const [ataque] = await comandos(page);
  expect(ataque).toMatchObject({ tipo: TIPO.ATACAR_MOVENDO, unidades: escolhidas, fila: 0 });
  // The command goes to the ground point under the click.
  const pontoNoChao = await page.evaluate(({ x, y }) => {
    const { x: cx, y: cy } = window.__rts.paraMundo(x, y);
    return { x: Math.floor(cx * 1024), y: Math.floor(cy * 1024) };
  }, vazio);
  expect(Math.abs(ataque.x - pontoNoChao.x)).toBeLessThan(64);
  expect(Math.abs(ataque.y - pontoNoChao.y)).toBeLessThan(64);
  expect(await page.evaluate(() => window.__rts.controles.modo)).toBe(null);

  await expect.poll(() => page.evaluate(() => window.__rts.latencia.resumo().n)).toBeGreaterThan(1);
  const resumo = await page.evaluate(() => window.__rts.latencia.resumo());
  expect(resumo.p50).toBeLessThan(100);
  await expect(page.locator('[data-campo="clique"]')).toContainText('clique até a marca:');

  await page.keyboard.press('KeyM');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__rts.controles.modo)).toBe(null);
  await page.mouse.click(vazio.x, vazio.y);
  expect(await comandos(page)).toHaveLength(1);
  await caixa(page, visiveis);

  await page.getByRole('button', { name: /Patrulhar/ }).click();
  await page.mouse.click(vazio.x, vazio.y);
  await page.keyboard.press('KeyS');
  await page.keyboard.press('KeyH');
  await expect.poll(async () => (await comandos(page)).map(c => c.tipo)).toEqual([TIPO.ATACAR_MOVENDO, TIPO.PATRULHAR, TIPO.PARAR, TIPO.SEGURAR_POSICAO]);
});

test('Shift queues orders and shows their points on the ground until stop clears them', async ({ page }) => {
  await abrir(page);
  await caixa(page, await naTela(page));
  const vazio = await chaoVazio(page);
  const pontos = [[vazio.x, vazio.y], [vazio.x + 90, vazio.y], [vazio.x + 90, vazio.y + 90]];

  await page.mouse.click(...pontos[0], { button: 'right' });
  await page.keyboard.down('Shift');
  await page.mouse.click(...pontos[1], { button: 'right' });
  await page.mouse.click(...pontos[2], { button: 'right' });
  await page.keyboard.up('Shift');
  await expect.poll(async () => (await comandos(page)).map(c => [c.tipo, c.fila])).toEqual([[TIPO.MOVER, 0], [TIPO.MOVER, 1], [TIPO.MOVER, 1]]);
  await expect(page.locator('#sobreposicao circle')).toHaveCount(3);

  // Shift held keeps attack-move armed for more points; letting Shift go ends it.
  await page.keyboard.down('Shift');
  await page.keyboard.press('KeyA');
  await page.mouse.click(vazio.x, vazio.y + 90);
  await page.mouse.click(vazio.x + 45, vazio.y + 45);
  expect(await page.evaluate(() => window.__rts.controles.modo)).toBe('atacarMovendo');
  await page.keyboard.up('Shift');
  expect(await page.evaluate(() => window.__rts.controles.modo)).toBe(null);
  await expect(page.locator('#sobreposicao circle')).toHaveCount(5);
  expect((await comandos(page)).slice(3).map(c => [c.tipo, c.fila])).toEqual([[TIPO.ATACAR_MOVENDO, 1], [TIPO.ATACAR_MOVENDO, 1]]);

  await page.keyboard.press('KeyS');
  await expect(page.locator('#sobreposicao circle')).toHaveCount(0);
});

test('groups store with Ctrl or Option/Alt, recall with the digit, add with Shift and centre on a double press', async ({ page }) => {
  await abrir(page);
  const visiveis = await naTela(page);
  const [primeira, ...resto] = visiveis;
  await caixa(page, resto);
  const grupoUm = await selecao(page);
  await page.keyboard.press('Control+Digit1');
  await page.mouse.click(primeira.x, primeira.y);
  await page.keyboard.press('Alt+Digit2');
  await expect(page.locator('#comandos [data-grupo="2"]')).toContainText('·1');

  const vazio = await chaoVazio(page);
  await page.mouse.click(vazio.x, vazio.y);
  await page.keyboard.press('Digit1');
  await expect.poll(() => selecao(page)).toEqual(grupoUm);
  await page.keyboard.press('Digit2');
  await expect.poll(() => selecao(page)).toEqual([primeira.id]);
  await page.keyboard.press('Shift+Digit1');
  await page.mouse.click(vazio.x, vazio.y);

  // Move the camera away, then press 1 twice: the group comes back to the middle of the screen.
  // The two presses are dispatched inside the page: on a busy machine two driver key presses can be more than the
  // 350 ms of a double press apart.
  await page.evaluate(() => {
    Object.assign(window.__rts.camera, { x: 20, y: 20 });
    for (let vez = 0; vez < 2; vez++) dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1', key: '1', bubbles: true, cancelable: true }));
  });
  await expect.poll(() => selecao(page)).toEqual(ordenados(new Set([...grupoUm, primeira.id])));
  const camera = await page.evaluate(() => ({ ...window.__rts.camera }));
  expect(Math.hypot(camera.x - 20, camera.y - 20)).toBeGreaterThan(5);

  await page.locator('#comandos [data-grupo="2"]').click();
  await expect.poll(() => selecao(page)).toEqual([primeira.id]);
});

test('pinch, wheel and keys step through three zoom levels; two-finger scroll and arrows move the camera', async ({ page }) => {
  await abrir(page);
  const nivel = () => page.evaluate(() => window.__rts.nivelZoom);
  expect(await nivel()).toBe(1);
  await page.mouse.move(640, 300);
  // A real pinch is a stream of small ctrlKey wheel deltas 16 ms apart; a busy machine can space the test's events
  // beyond one pinch, so a single event carries the whole step.
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -50);
  await page.keyboard.up('Control');
  await expect.poll(nivel).toBe(2);
  expect(await page.evaluate(() => window.visualViewport.scale)).toBe(1);
  await page.keyboard.press('Minus');
  await expect.poll(nivel).toBe(1);
  await page.waitForTimeout(250);
  await page.mouse.wheel(0, 100);
  await expect.poll(nivel).toBe(0);

  await page.waitForTimeout(250);
  const antes = await page.evaluate(() => ({ ...window.__rts.camera }));
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 8);
  await expect.poll(() => page.evaluate(() => window.__rts.camera.y)).toBeGreaterThan(antes.y);
  expect(await nivel()).toBe(0);

  const x = await page.evaluate(() => window.__rts.camera.x);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(300);
  await page.keyboard.up('ArrowRight');
  expect(await page.evaluate(() => window.__rts.camera.x)).toBeGreaterThan(x);
});

test('the browser keeps its own shortcuts, and the units really obey a move order', async ({ page }) => {
  await abrir(page);
  const cancelados = await page.evaluate(() => [['KeyW', true, false], ['KeyT', false, true], ['KeyR', true, false], ['Tab', true, false], ['Digit1', false, true]].map(([code, ctrlKey, metaKey]) => {
    const evento = new KeyboardEvent('keydown', { code, ctrlKey, metaKey, bubbles: true, cancelable: true });
    dispatchEvent(evento);
    return evento.defaultPrevented;
  }));
  expect(cancelados).toEqual([false, false, false, false, false]);

  await page.keyboard.press('Control+KeyA');
  const todas = await selecao(page);
  expect(todas.length).toBe(20);
  const vazio = await chaoVazio(page);
  const distancia = () => page.evaluate(() => {
    const { indice, selecionadas, comandos } = window.__rts;
    const centro = indice.centro(selecionadas);
    const [ordem] = comandos;
    return Math.hypot(centro.x - ordem.x / 1024, centro.y - ordem.y / 1024);
  });
  await page.mouse.click(vazio.x, vazio.y, { button: 'right' });
  await page.keyboard.press('KeyP');
  const inicial = await distancia();
  await expect.poll(distancia, { timeout: 10_000 }).toBeLessThan(inicial - 1);
});
