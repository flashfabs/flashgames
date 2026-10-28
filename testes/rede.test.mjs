import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { modoDaRede, criarFonteIce, MODO_PADRAO } from '../site/js/rede.js';
import ice, { semPorta53, enderecoCloudflare } from '../netlify/functions/ice.mjs';

const RESPOSTA_CLOUDFLARE = {
  iceServers: [
    { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
    {
      urls: [
        'turn:turn.cloudflare.com:3478?transport=udp',
        'turn:turn.cloudflare.com:53?transport=udp',
        'turns:turn.cloudflare.com:5349?transport=tcp',
        'turns:turn.cloudflare.com:443?transport=tcp',
      ],
      username: 'usuario',
      credential: 'segredo',
    },
  ],
};

const respostaJson = (dados, status = 200) => new Response(JSON.stringify(dados), { status, headers: { 'content-type': 'application/json' } });
const silenciar = () => {
  const original = console.warn;
  console.warn = () => {};
  return () => {
    console.warn = original;
  };
};

test('network mode comes from the address, defaulting to Cloudflare', () => {
  assert.equal(modoDaRede(''), MODO_PADRAO);
  assert.equal(modoDaRede('?rede=peerjs'), 'peerjs');
  assert.equal(modoDaRede('?x=1&rede=retransmissor'), 'retransmissor');
  assert.equal(modoDaRede('?rede=qualquer'), MODO_PADRAO);
});

test('peerjs mode keeps PeerJS defaults and never asks for TURN', async () => {
  let chamadas = 0;
  const configuracao = criarFonteIce({ buscar: async () => { chamadas++; return respostaJson(RESPOSTA_CLOUDFLARE); } });
  assert.equal(await configuracao('peerjs'), null);
  assert.equal(chamadas, 0);
});

test('Cloudflare mode uses the credentials and caches them until close to expiry', async () => {
  let chamadas = 0;
  let agora = 0;
  const configuracao = criarFonteIce({
    buscar: async endereco => {
      chamadas++;
      assert.equal(endereco, '/api/ice');
      return respostaJson({ iceServers: RESPOSTA_CLOUDFLARE.iceServers, validade: 3600 });
    },
    agora: () => agora,
  });
  assert.deepEqual((await configuracao('cloudflare')).iceServers, RESPOSTA_CLOUDFLARE.iceServers);
  agora = 40 * 60 * 1000;
  await configuracao('cloudflare');
  assert.equal(chamadas, 1);
  agora = 55 * 60 * 1000;
  await configuracao('cloudflare');
  assert.equal(chamadas, 2);
});

test('without the function, links fall back to public STUN; relay mode keeps the relay policy', async () => {
  const restaurar = silenciar();
  try {
    let chamadas = 0;
    let agora = 0;
    const configuracao = criarFonteIce({
      buscar: async () => { chamadas++; return respostaJson({ erro: 'TURN não configurado' }, 503); },
      agora: () => agora,
    });
    const normal = await configuracao('cloudflare');
    assert.ok(normal.iceServers.length > 0);
    assert.ok(normal.iceServers.every(servidor => [servidor.urls].flat().every(url => url.startsWith('stun:'))));
    assert.deepEqual(await configuracao('retransmissor'), { iceServers: [], iceTransportPolicy: 'relay' });
    assert.equal(chamadas, 1, 'a failure is remembered for a while, so reconnections do not wait on it again');
    agora = 2 * 60 * 1000;
    await configuracao('cloudflare');
    assert.equal(chamadas, 2);
    const quebrada = criarFonteIce({ buscar: async () => { throw new TypeError('offline'); } });
    assert.ok((await quebrada('cloudflare')).iceServers.length > 0);
  } finally {
    restaurar();
  }
});

test('port 53 URLs are dropped, other ports kept', () => {
  const filtrado = semPorta53(RESPOSTA_CLOUDFLARE.iceServers);
  const urls = filtrado.flatMap(servidor => servidor.urls);
  assert.ok(urls.every(url => !/:53(\?|$)/.test(url)));
  assert.ok(urls.includes('turns:turn.cloudflare.com:5349?transport=tcp'));
  assert.equal(filtrado[1].username, 'usuario');
  assert.deepEqual(semPorta53([{ urls: 'stun:exemplo:53' }]), []);
});

let fetchOriginal;
let ambiente;

beforeEach(() => {
  fetchOriginal = globalThis.fetch;
  ambiente = {};
  globalThis.Netlify = { env: { get: nome => ambiente[nome] } };
});

afterEach(() => {
  globalThis.fetch = fetchOriginal;
  delete globalThis.Netlify;
});

test('function answers 503 until the TURN key is configured', async () => {
  const resposta = await ice(new Request('https://salinha.test/api/ice'));
  assert.equal(resposta.status, 503);
  assert.equal(resposta.headers.get('cache-control'), 'no-store');
});

test('function only answers GET', async () => {
  const resposta = await ice(new Request('https://salinha.test/api/ice', { method: 'POST' }));
  assert.equal(resposta.status, 405);
});

test('function asks Cloudflare for credentials and hands them over without port 53', async () => {
  ambiente = { CLOUDFLARE_TURN_KEY_ID: 'chave-1', CLOUDFLARE_TURN_API_TOKEN: 'token-1' };
  let pedido = null;
  globalThis.fetch = async (endereco, opcoes) => {
    pedido = { endereco, opcoes };
    return respostaJson(RESPOSTA_CLOUDFLARE, 201);
  };
  const resposta = await ice(new Request('https://salinha.test/api/ice'));
  assert.equal(resposta.status, 200);
  assert.equal(pedido.endereco, enderecoCloudflare('chave-1'));
  assert.equal(pedido.opcoes.method, 'POST');
  assert.equal(pedido.opcoes.headers.authorization, 'Bearer token-1');
  assert.ok(JSON.parse(pedido.opcoes.body).ttl > 0);
  const dados = await resposta.json();
  assert.ok(dados.validade > 0);
  assert.ok(dados.iceServers.flatMap(servidor => servidor.urls).every(url => !/:53(\?|$)/.test(url)));
  assert.ok(!JSON.stringify(dados).includes('token-1'));
});

test('function reports a Cloudflare failure as 502', async () => {
  ambiente = { CLOUDFLARE_TURN_KEY_ID: 'chave-1', CLOUDFLARE_TURN_API_TOKEN: 'token-1' };
  globalThis.fetch = async () => respostaJson({ errors: ['unauthorized'] }, 401);
  const original = console.error;
  console.error = () => {};
  try {
    const resposta = await ice(new Request('https://salinha.test/api/ice'));
    assert.equal(resposta.status, 502);
  } finally {
    console.error = original;
  }
});
