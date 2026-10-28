// Bad network: every WebRTC data channel of both players delivers late and with jitter, and the fast channel
// (unordered, no retransmission) also loses packets. The game must stay playable: the guest moves without
// being pulled back, the host sees the move and the bomb in the right cell, and the guest sees the host move.

import { test, expect, semCaixas } from './mesa.mjs';

const REDE = { atrasoMs: 120, variacaoMs: 80, perda: 0.1 };

// Init script (runs before semCaixas, so it keeps the real Math.random): wraps RTCDataChannel.send.
// Ordered channels keep their order; the unordered one drops a share of its messages.
function redeRuim({ atrasoMs, variacaoMs, perda }) {
  const sorteio = Math.random;
  const enviar = RTCDataChannel.prototype.send;
  const ultimaEntrega = new WeakMap();
  RTCDataChannel.prototype.send = function (dados) {
    if (!this.ordered && sorteio() < perda) return;
    const agora = performance.now();
    let quando = agora + atrasoMs + sorteio() * variacaoMs;
    if (this.ordered) {
      quando = Math.max(quando, ultimaEntrega.get(this) ?? 0);
      ultimaEntrega.set(this, quando);
    }
    setTimeout(() => {
      if (this.readyState === 'open') enviar.call(this, dados);
    }, quando - agora);
  };
}

// Init script: records the guest's own position every frame, to catch corrections that pull it back.
function gravarTrajeto() {
  window.__trajeto = [];
  const passo = () => {
    const jogo = window.__salinha?.jogo();
    const meuId = window.__salinha?.sala()?.meuId;
    const n = jogo?.escalacao?.findIndex(item => item.id === meuId) ?? -1;
    const eu = jogo?.fase === 'jogo' && n >= 0 ? jogo.vista?.j?.[n] : null;
    if (eu) window.__trajeto.push([eu.x, eu.y]);
    requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}

test('with 120-200 ms delay and 10% loss the round stays playable for both players', async ({ mesa }) => {
  const ruim = [redeRuim, REDE];
  const { host, convidados: [gui] } = await mesa.montar(['Hana', 'Gui'], {
    anfitriao: { iniciar: [ruim, semCaixas] },
    convidado: () => ({ iniciar: [ruim, gravarTrajeto] }),
  });

  // The host's member list shows the slow link (round trip at least twice the one-way delay).
  await expect.poll(async () => {
    const texto = await host.pagina.locator('#lista-membros li').nth(1).locator('.etiqueta--ping').textContent();
    return Number(texto?.match(/(\d+)\s*ms/)?.[1] ?? 0);
  }, { message: 'the ping shows the delay', timeout: 20_000 }).toBeGreaterThanOrEqual(2 * REDE.atrasoMs);

  await mesa.todosProntos([host, gui]);
  await host.esperarFase('jogo', 30_000);
  await gui.esperarFase('jogo', 30_000);

  // The guest walks from (19, 13) up to (19, 9) and left to (15, 9), turning once.
  await gui.pagina.evaluate(() => {
    window.__trajeto = [];
  });
  await gui.andarAte([15, 9]);
  const trajeto = await gui.pagina.evaluate(() => window.__trajeto);
  expect(trajeto.length, 'frames recorded while walking').toBeGreaterThan(60);
  // Walking up then left, x and y only ever go down; a correction from the host would push one of them back up.
  // Samples near the target are left out: the walking helper may step back there if it overshot the cell.
  const longe = trajeto.filter(([x, y]) => Math.abs(x - 15) + Math.abs(y - 9) > 0.6);
  const recuos = longe.slice(1).map(([x, y], k) => Math.max(x - longe[k][0], y - longe[k][1]));
  expect(Math.max(...recuos), 'largest step back of the guest on its own screen').toBeLessThan(0.3);
  await expect.poll(async () => {
    const { x, y } = await host.posicaoDe(gui);
    return [Math.round(x), Math.round(y)];
  }, { message: 'the host sees the guest arrive' }).toEqual([15, 9]);

  await gui.soltarBomba();
  await expect.poll(async () => (await host.bombas()).map(([x, y]) => `${x},${y}`), { message: 'the bomb lands where the guest is' }).toEqual(['15,9']);
  // Out of both arms of the blast: (16, 11) is off column 15 and off row 9.
  await gui.andarAte([16, 11]);

  // The host walks right along the top row and the guest sees it, despite the delay.
  await host.andarAte([5, 1]);
  await expect.poll(async () => Math.round((await gui.posicaoDe(host)).x), { message: 'the guest sees the host move' }).toBe(5);
  await expect.poll(async () => (await host.bombas()).length, { message: 'the bomb goes off', timeout: 5_000 }).toBe(0);
  expect((await host.posicaoDe(gui)).v, 'the guest got away from its bomb').toBe(1);
});
