// The profiles API against an in-memory store, and the browser client (conta.js) talking to it through a fake fetch.

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { criarApi } from '../netlify/functions/perfil.mjs';

const ORIGEM = 'https://salinha-jogos.netlify.app';

function armazemNaMemoria() {
  const dados = new Map();
  let versao = 0;
  return {
    dados,
    async getWithMetadata(chave) {
      const entrada = dados.get(chave);
      return entrada ? { data: structuredClone(entrada.valor), etag: entrada.etag, metadata: {} } : null;
    },
    async setJSON(chave, valor, { onlyIfMatch, onlyIfNew } = {}) {
      const atual = dados.get(chave);
      if (onlyIfNew && atual) return { modified: false };
      if (onlyIfMatch !== undefined && atual?.etag !== onlyIfMatch) return { modified: false };
      const etag = `"${++versao}"`;
      dados.set(chave, { valor: structuredClone(valor), etag });
      return { modified: true, etag };
    },
  };
}

function montar() {
  let agora = Date.UTC(2026, 9, 28, 4, 0, 0);
  const armazem = armazemNaMemoria();
  const api = criarApi({ armazem, agora: () => agora });
  const chamar = async (metodo, caminho, { corpo, credencial, origem = ORIGEM, cabecalhos = {} } = {}) => {
    const resposta = await api(new Request(`${ORIGEM}${caminho}`, {
      method: metodo,
      headers: {
        ...(origem ? { origin: origem } : {}),
        ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(credencial ? { authorization: `Perfil ${credencial.id}.${credencial.segredo}` } : {}),
        ...cabecalhos,
      },
      body: corpo === undefined ? undefined : typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
    }));
    return { status: resposta.status, dados: await resposta.json() };
  };
  return { armazem, chamar, passar: ms => { agora += ms; } };
}

const partida = (campos = {}) => ({ jogadores: 3, robos: 0, caixas: 4, eliminacoes: 1, venceu: false, mapa: 'patio', ...campos });

test('creates a profile and keeps only a hash of its secret', async () => {
  const { chamar, armazem } = montar();
  const { status, dados } = await chamar('POST', '/api/perfil', { corpo: { nome: 'Vic', cor: 2, simbolo: '🔥', estatisticas: { pontos: 999 } } });
  assert.equal(status, 201);
  assert.equal(dados.perfil.nome, 'Vic');
  assert.equal(dados.perfil.estatisticas.pontos, 0, 'statistics cannot be set by the client');
  assert.match(dados.credencial.id, /^[A-Z0-9]{10}$/);
  assert.match(dados.credencial.segredo, /^[A-Z0-9]{20}$/);
  const guardado = armazem.dados.get(`perfil/${dados.credencial.id}`).valor;
  assert.match(guardado.segredoHash, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(guardado).includes(dados.credencial.segredo));
  assert.ok(!('segredoHash' in dados.perfil));
});

test('writes need the site origin; reading my profile needs my secret', async () => {
  const { chamar } = montar();
  assert.equal((await chamar('POST', '/api/perfil', { corpo: {}, origem: 'https://outro-site.com' })).status, 403);
  assert.equal((await chamar('POST', '/api/perfil', { corpo: {}, origem: null })).status, 403);
  assert.equal((await chamar('POST', '/api/perfil', { corpo: {}, origem: 'https://abc123--salinha-jogos.netlify.app' })).status, 201);
  const { dados } = await chamar('POST', '/api/perfil', { corpo: { nome: 'Eu' } });
  assert.equal((await chamar('GET', '/api/perfil')).status, 401);
  const errado = { ...dados.credencial, segredo: 'A'.repeat(20) };
  assert.equal((await chamar('GET', '/api/perfil', { credencial: errado })).status, 401);
  const lido = await chamar('GET', '/api/perfil', { credencial: dados.credencial });
  assert.equal(lido.status, 200);
  assert.equal(lido.dados.perfil.nome, 'Eu');
});

test('matches are validated, rate limited and capped per request', async () => {
  const { chamar, passar } = montar();
  const { dados } = await chamar('POST', '/api/perfil', { corpo: { nome: 'Eu' } });
  const credencial = dados.credencial;
  const ok = await chamar('POST', '/api/perfil/partidas', { credencial, corpo: { partidas: [partida({ venceu: true }), partida()] } });
  assert.equal(ok.status, 200);
  assert.equal(ok.dados.perfil.estatisticas.partidas, 2);
  assert.equal(ok.dados.perfil.estatisticas.pontos, (4 + 5 + 15) + (4 + 5));
  assert.equal((await chamar('POST', '/api/perfil/partidas', { credencial, corpo: { partidas: [partida()] } })).status, 429);
  passar(5000);
  assert.equal((await chamar('POST', '/api/perfil/partidas', { credencial, corpo: { partidas: [partida({ eliminacoes: 9 })] } })).status, 400);
  assert.equal((await chamar('POST', '/api/perfil/partidas', { credencial, corpo: { partidas: Array(11).fill(partida()) } })).status, 400);
  assert.equal((await chamar('POST', '/api/perfil/partidas', { credencial, corpo: 'x'.repeat(9000) })).status, 413);
  assert.equal((await chamar('POST', '/api/perfil/partidas', { credencial, corpo: '{not json' })).status, 400);
});

test('ranking lists profiles with matches among friends and follows nickname changes', async () => {
  const { chamar, passar } = montar();
  const a = (await chamar('POST', '/api/perfil', { corpo: { nome: 'Ana' } })).dados.credencial;
  const b = (await chamar('POST', '/api/perfil', { corpo: { nome: 'Bia' } })).dados.credencial;
  const c = (await chamar('POST', '/api/perfil', { corpo: { nome: 'Solo' } })).dados.credencial;
  await chamar('POST', '/api/perfil/partidas', { credencial: a, corpo: { partidas: [partida({ caixas: 2 })] } });
  await chamar('POST', '/api/perfil/partidas', { credencial: b, corpo: { partidas: [partida({ venceu: true })] } });
  await chamar('POST', '/api/perfil/partidas', { credencial: c, corpo: { partidas: [partida({ jogadores: 4, robos: 3, venceu: true })] } });
  passar(5000);
  await chamar('PUT', '/api/perfil', { credencial: a, corpo: { nome: 'Ana Maria' } });
  const { status, dados } = await chamar('GET', '/api/ranking', { origem: null });
  assert.equal(status, 200);
  assert.deepEqual(dados.linhas.map(linha => linha.nome), ['Bia', 'Ana Maria']);
  assert.equal(dados.linhas[0].pontos, 4 + 5 + 15);
});

test('the recovery code opens the same profile; a wrong one does not', async () => {
  const { chamar } = montar();
  const { dados } = await chamar('POST', '/api/perfil', { corpo: { nome: 'Leva' } });
  const codigo = `${dados.credencial.id}${dados.credencial.segredo}`.match(/.{5}/g).join('-');
  const recuperado = await chamar('POST', '/api/perfil/recuperar', { corpo: { codigo: codigo.toLowerCase() } });
  assert.equal(recuperado.status, 200);
  assert.deepEqual(recuperado.dados.credencial, dados.credencial);
  assert.equal(recuperado.dados.perfil.nome, 'Leva');
  const errado = codigo.slice(0, -1) + (codigo.endsWith('A') ? 'B' : 'A');
  assert.equal((await chamar('POST', '/api/perfil/recuperar', { corpo: { codigo: errado } })).status, 404);
  assert.equal((await chamar('POST', '/api/perfil/recuperar', { corpo: { codigo: 'curto' } })).status, 400);
});

test('conta.js works offline, then moves everything to the server, and the code restores it elsewhere', async () => {
  const relogio = mock.timers;
  relogio.enable({ apis: ['Date'], now: Date.UTC(2026, 9, 28, 5, 0, 0) });
  const armazem = armazemNaMemoria();
  const api = criarApi({ armazem });
  const guardado = new Map();
  globalThis.localStorage = {
    getItem: chave => (guardado.has(chave) ? guardado.get(chave) : null),
    setItem: (chave, valor) => guardado.set(chave, String(valor)),
    removeItem: chave => guardado.delete(chave),
  };
  let servidorNoAr = false;
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async (caminho, { cache, signal, ...opcoes } = {}) => {
    if (!servidorNoAr) throw new TypeError('Failed to fetch');
    return api(new Request(`http://localhost:8804${caminho}`, { ...opcoes, headers: { ...opcoes.headers, origin: 'http://localhost:8804' } }));
  };
  const avisoOriginal = console.warn;
  console.warn = () => {};
  try {
    const conta = await import('../site/js/conta.js');
    const local = await conta.obterPerfil();
    assert.equal(local.local, true);
    assert.match(local.id, /^local-/);
    await conta.registrarPartida(partida({ venceu: true, em: Date.now() }));
    await conta.registrarPartida(partida({ em: Date.now() + 1 }));
    assert.equal(await conta.codigoDeRecuperacao(), null, 'no code while the profile only exists here');

    servidorNoAr = true;
    relogio.tick(61_000);
    const noServidor = await conta.obterPerfil();
    assert.equal(noServidor.local, false);
    assert.match(noServidor.id, /^[A-Z0-9]{10}$/);
    assert.equal(noServidor.estatisticas.partidas, 2, 'offline matches were sent');
    assert.equal(JSON.parse(guardado.get('salinha:conta')).pendentes.length, 0);

    relogio.tick(5_000);
    const depois = await conta.registrarPartida(partida({ caixas: 10, em: Date.now() }));
    assert.equal(depois.estatisticas.partidas, 3);
    assert.equal((await conta.salvarPerfil({ nome: 'Novo Nome', cor: 5 })).nome, 'Novo Nome');
    const linhas = await conta.ranking();
    assert.equal(linhas[0].eu, true);
    assert.equal(linhas[0].nome, 'Novo Nome');
    assert.equal((await conta.historico()).length, 3);

    const codigo = await conta.codigoDeRecuperacao();
    assert.match(codigo, /^([A-Z0-9]{5}-){5}[A-Z0-9]{5}$/);
    guardado.clear(); // another device
    const outro = await conta.recuperar(codigo);
    assert.equal(outro.id, noServidor.id);
    assert.equal(outro.estatisticas.partidas, 3);
    await assert.rejects(conta.recuperar('AAAAA-AAAAA-AAAAA-AAAAA-AAAAA-AAAAA'), /não abre nenhum perfil/);
    await assert.rejects(conta.recuperar('123'), /Código inválido/);

    armazem.dados.clear(); // the server lost its store
    const semServidor = await conta.obterPerfil();
    assert.equal(semServidor.local, true, 'an unknown credential is dropped');
    const refeito = await conta.obterPerfil();
    assert.equal(refeito.local, false, 'and a new server profile is created');
  } finally {
    console.warn = avisoOriginal;
    globalThis.fetch = fetchOriginal;
    delete globalThis.localStorage;
    relogio.reset();
  }
});
