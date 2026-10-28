// Smoke test against the published site: the version is the expected commit, the functions answer (read-only
// calls only, so no profile is created), and two players start a round over the real signaling server.

import { execFileSync } from 'node:child_process';
import { test, expect, semCaixas } from './mesa.mjs';

const ESPERA_VERSAO_MS = 120_000;

const PUBLICADOS = ['netlify.toml', 'site', 'netlify', 'package.json', 'package-lock.json'];

// Full hash of the commit that should be live: COMMIT if given, otherwise the tip of main.
function commitEsperado() {
  return execFileSync('git', ['rev-parse', '--verify', `${process.env.COMMIT ?? 'main'}^{commit}`], { encoding: 'utf8' }).trim();
}

// True when both commits publish the same files (main may be ahead with docs or tests only).
function mesmoConteudo(publicado, esperado) {
  try {
    execFileSync('git', ['diff', '--quiet', publicado, esperado, '--', ...PUBLICADOS]);
    return true;
  } catch {
    return false;
  }
}

test('the published versao.json matches the expected commit', async ({ request }) => {
  const esperado = commitEsperado();
  // The CDN may take a little while to serve a new deploy everywhere.
  await expect.poll(async () => {
    const resposta = await request.get(`/versao.json?t=${Date.now()}`, { headers: { 'cache-control': 'no-cache' } });
    if (!resposta.ok()) return `HTTP ${resposta.status()}`;
    const { commit } = await resposta.json();
    return commit === esperado || mesmoConteudo(commit, esperado) ? esperado : commit;
  }, { message: `versao.json should show ${esperado} or a commit with the same published files`, timeout: ESPERA_VERSAO_MS, intervals: [2_000, 5_000] }).toBe(esperado);
});

test('the Netlify Functions answer', async ({ request }) => {
  const ice = await request.get('/api/ice');
  // 503 is expected until the Cloudflare TURN key is set in Netlify; then it is 200 with servers.
  expect([200, 503], '/api/ice status').toContain(ice.status());
  const corpo = await ice.json();
  if (ice.status() === 200) expect(corpo.iceServers.length).toBeGreaterThan(0);
  else expect(corpo.erro).toBe('TURN não configurado');
});

test('the profile API answers without touching any profile', async ({ request }) => {
  const ranking = await request.get('/api/ranking');
  expect(ranking.status(), '/api/ranking status').toBe(200);
  expect(Array.isArray((await ranking.json()).linhas)).toBe(true);
  // Without credentials the profile route must refuse, not crash.
  const semCredencial = await request.get('/api/perfil');
  expect(semCredencial.status(), '/api/perfil without credentials').toBe(401);
});

test('two players start a round in production and see each other move', async ({ mesa }) => {
  const { host, convidados: [convidado] } = await mesa.montar(['Fumaça A', 'Fumaça B'], { anfitriao: { iniciar: [semCaixas] } });
  await mesa.todosProntos([host, convidado]);
  await host.esperarFase('jogo');
  await convidado.esperarFase('jogo');
  expect(await host.posicaoDe(convidado)).toMatchObject({ x: 19, y: 13, v: 1 });
  await convidado.andarAte([17, 13]);
  await expect.poll(async () => Math.round((await host.posicaoDe(convidado)).x), { message: 'the host sees the guest move' }).toBe(17);
});
