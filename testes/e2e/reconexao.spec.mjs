// Reconnection: a member whose network drops keeps its place for 10 s. A short cut must not end the round and the
// member plays on afterwards; a cut longer than the tolerance ends the round with the reason, as if they had left.

import { test, expect, semCaixas } from './mesa.mjs';
import { instalarCaos } from './caos.mjs';

// Init script: window.__cortarRede(ms) silences every WebRTC data channel of this page, both ways, for ms
// milliseconds (sends are dropped and incoming messages ignored), like a Wi-Fi drop. Signaling stays up.
function tesouraDeRede() {
  let cortadoAte = 0;
  const cortado = () => performance.now() < cortadoAte;
  window.__cortarRede = ms => {
    cortadoAte = performance.now() + ms;
  };
  const enviar = RTCDataChannel.prototype.send;
  RTCDataChannel.prototype.send = function (dados) {
    if (!cortado()) enviar.call(this, dados);
  };
  const filtrar = funcao => function (evento) {
    if (!cortado()) return funcao.call(this, evento);
    return undefined;
  };
  const descritor = Object.getOwnPropertyDescriptor(RTCDataChannel.prototype, 'onmessage');
  Object.defineProperty(RTCDataChannel.prototype, 'onmessage', {
    configurable: true,
    enumerable: descritor.enumerable,
    get() {
      return descritor.get.call(this);
    },
    set(funcao) {
      descritor.set.call(this, typeof funcao === 'function' ? filtrar(funcao) : funcao);
    },
  });
  const ouvir = RTCDataChannel.prototype.addEventListener;
  RTCDataChannel.prototype.addEventListener = function (tipo, funcao, opcoes) {
    return ouvir.call(this, tipo, tipo === 'message' && typeof funcao === 'function' ? filtrar(funcao) : funcao, opcoes);
  };
}

const membro = async (jogador, id) => (await jogador.sala()).membros.find(item => item.id === id);

test('a 6 s network drop keeps the place; a drop longer than 10 s ends the round with the reason', async ({ mesa }) => {
  const { host, convidados: [bia, caio] } = await mesa.montar(['Ana', 'Bia', 'Caio'], {
    anfitriao: { iniciar: [semCaixas] },
    convidado: () => ({ iniciar: [tesouraDeRede] }),
  });
  await mesa.todosProntos([host, bia, caio]);
  for (const jogador of [host, bia, caio]) await jogador.esperarFase('jogo');
  const idBia = (await bia.sala()).meuId;
  const idCaio = (await caio.sala()).meuId;

  // Short drop: the host marks Bia as away, she comes back on her own and the match goes on.
  await bia.pagina.evaluate(() => window.__cortarRede(6000));
  await expect.poll(async () => (await membro(host, idBia))?.fora, { message: 'the host marks Bia as away', timeout: 10_000 }).toBe(true);
  await expect.poll(async () => (await membro(host, idBia))?.fora, { message: 'Bia comes back', timeout: 20_000 }).toBe(false);
  expect(await host.fase()).toBe('jogo');
  expect((await host.jogo()).motivo).toBeNull();
  expect((await bia.sala()).meuId, 'Bia keeps her id').toBe(idBia);
  await expect(bia.pagina.locator('#queda')).toBeHidden();
  // She still plays: the host sees her walk.
  await bia.andarAte([17, 13]);
  const { x: xBia } = await bia.minhaPosicao();
  await expect.poll(async () => (await host.posicaoDe(bia)).x, { message: 'the host sees Bia move after coming back' }).toBeCloseTo(xBia, 1);

  // Long drop: past the tolerance Caio is out, the round ends with the reason and Caio is told he lost the room.
  await caio.pagina.evaluate(() => window.__cortarRede(20_000));
  await host.esperarFase('final', 25_000);
  await expect(host.pagina.locator('.pavio-motivo')).toContainText('Caio');
  await expect(bia.pagina.locator('.pavio-motivo')).toContainText('Caio');
  expect((await host.sala()).membros.map(item => item.id)).not.toContain(idCaio);
  await expect(caio.pagina.locator('#queda')).toBeVisible({ timeout: 15_000 });
});

test('the host drops for 5 s: the guests wait, reconnect, and the match goes on', async ({ mesa }) => {
  const { host, convidados: [bia, caio] } = await mesa.montar(['Ana', 'Bia', 'Caio'], { anfitriao: { iniciar: [instalarCaos, semCaixas] } });
  await mesa.todosProntos([host, bia, caio]);
  for (const jogador of [host, bia, caio]) await jogador.esperarFase('jogo');
  const ids = await Promise.all([bia, caio].map(async jogador => (await jogador.sala()).meuId));

  await host.pagina.evaluate(() => window.__caos.cair(5000));
  for (const jogador of [bia, caio]) {
    await expect(jogador.pagina.locator('#queda-titulo'), `${jogador.nome} is told the link dropped`).toHaveText('Reconectando…', { timeout: 10_000 });
  }
  for (const jogador of [bia, caio]) {
    await expect(jogador.pagina.locator('#queda'), `${jogador.nome} gets back in`).toBeHidden({ timeout: 25_000 });
  }
  // Same people, same places, same round: nobody was dropped and nothing ended.
  await expect.poll(async () => (await host.sala()).membros.filter(item => ids.includes(item.id) && !item.fora).length, {
    message: 'the host has both guests back', timeout: 15_000,
  }).toBe(2);
  expect(['jogo', 'resultado']).toContain(await host.fase());
  expect((await host.jogo()).motivo).toBeNull();
  for (const [n, jogador] of [bia, caio].entries()) expect((await jogador.sala()).meuId).toBe(ids[n]);
  // The game still flows both ways after the reconnection.
  if ((await host.fase()) === 'jogo' && (await bia.minhaPosicao())?.v) {
    await bia.andarAte([17, 13]);
    const { x } = await bia.minhaPosicao();
    await expect.poll(async () => (await host.posicaoDe(bia)).x, { message: 'the host sees Bia move after the drop' }).toBeCloseTo(x, 1);
  }
});

test('the host gone for good: past the tolerance the guests are told the room is lost', async ({ mesa }) => {
  const { host, convidados: [bia] } = await mesa.montar(['Ana', 'Bia'], { anfitriao: { iniciar: [instalarCaos] } });
  await mesa.todosProntos([host, bia]);
  await bia.esperarFase('jogo');
  await host.pagina.evaluate(() => window.__caos.cair(120_000));
  await expect(bia.pagina.locator('#queda-titulo')).toHaveText('Reconectando…', { timeout: 10_000 });
  await expect(bia.pagina.locator('#queda-titulo')).toHaveText('Conexão perdida', { timeout: 40_000 });
  await expect(bia.pagina.locator('#queda-motivo')).not.toBeEmpty();
});
