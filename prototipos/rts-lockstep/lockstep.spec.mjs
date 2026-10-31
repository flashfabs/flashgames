// Soak of the lockstep spike: one page per engine in LOCKSTEP_MOTORES (the first one hosts), each with the robot
// playing and the artificial delay on, for LOCKSTEP_MINUTOS minutes of game. It fails on any checksum mismatch, page
// error or member left behind, and at the end compares the checksums of every page tick by tick, independently of
// the host's own comparison. The report (bytes per turn, latency, engines) goes to lockstep.json in the output folder.
// Two tests: "curto" plays 1 minute (a smoke run, -g curto), "inteiro" plays LOCKSTEP_MINUTOS (-g inteiro; not "longo",
// which scripts/rtx-testes.sh would take for a performance step and hold the GPU lock for).
//   LOCKSTEP_MINUTOS     minutes of game of the whole one (10)
//   LOCKSTEP_MOTORES     engines in order, one page each, host first (chromium,firefox,webkit,chromium,firefox)
//   LOCKSTEP_PAGINAS     pages to fill from that list, skipping engines without WebRTC (4, the most the page allows)
//   LOCKSTEP_EXIGIR      engines that must have WebRTC (chromium,firefox); any other one without it is left out
//   LOCKSTEP_PARAMETROS  page address parameters (robot, delay, units), see pagina.js

import { test, expect, chromium, firefox, webkit } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const MINUTOS = Number(process.env.LOCKSTEP_MINUTOS ?? 10);
const lista = texto => texto.split(',').map(s => s.trim()).filter(Boolean);
const MOTORES = lista(process.env.LOCKSTEP_MOTORES ?? 'chromium,firefox,webkit,chromium,firefox');
const PAGINAS = Number(process.env.LOCKSTEP_PAGINAS ?? 4);
const EXIGIR = lista(process.env.LOCKSTEP_EXIGIR ?? 'chromium,firefox');
const PARAMETROS = process.env.LOCKSTEP_PARAMETROS ?? 'robo=1&rede=peerjs&atraso=60&variacao=40&pico=0.01&picoms=250&unidades=250';
const INTERVALO_MS = 15000;

const lancadores = { chromium, firefox, webkit };
const opcoesDeLancamento = {
  // real local addresses instead of mDNS names, and no throttling of pages that are not in front
  chromium: { args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] },
  firefox: { firefoxUserPrefs: { 'media.peerconnection.ice.obfuscate_host_addresses': false } },
  webkit: {},
};

const relatorioDe = pagina => pagina.evaluate(() => window.__lockstep.relatorio());

for (const [nome, minutos] of [['curto', 1], ['inteiro', MINUTOS]]) {
  test(`lockstep ${nome}: ${minutos} min of game on up to ${PAGINAS} pages without a desync`, async ({}, testInfo) => {
    test.setTimeout((minutos + 6) * 60_000);
    await jogar(minutos, testInfo);
  });
}

async function jogar(minutos, testInfo) {
  const TURNOS = minutos * 600;
  const { baseURL } = testInfo.project.use;
  const navegadores = new Map();
  const jogadores = [];
  const deixados = [];
  try {
    for (const motor of MOTORES) {
      if (jogadores.length === PAGINAS) break;
      if (deixados.some(d => d.motor === motor)) continue;
      if (!navegadores.has(motor)) navegadores.set(motor, await lancadores[motor].launch(opcoesDeLancamento[motor]));
      const navegador = navegadores.get(motor);
      const pagina = await (await navegador.newContext({ baseURL })).newPage();
      const falhas = [];
      pagina.on('pageerror', erro => falhas.push(String(erro)));
      pagina.on('console', mensagem => {
        if (mensagem.type() === 'error') falhas.push(mensagem.text());
      });
      await pagina.goto('/prototipos/rts-lockstep/');
      const webrtc = await pagina.evaluate(() => typeof RTCPeerConnection === 'function');
      if (!webrtc) {
        expect(EXIGIR.includes(motor), `${motor} has no RTCPeerConnection`).toBe(false);
        deixados.push({ motor, versao: navegador.version(), motivo: 'sem RTCPeerConnection' });
        testInfo.annotations.push({ type: 'deixado de fora', description: `${motor} ${navegador.version()}: sem RTCPeerConnection` });
        continue;
      }
      jogadores.push({ motor, versao: navegador.version(), pagina, falhas });
    }
    expect(jogadores.length, 'at least two pages with WebRTC').toBeGreaterThanOrEqual(2);

    const [anfitriao, ...membros] = jogadores;
    await anfitriao.pagina.goto(`/prototipos/rts-lockstep/?${PARAMETROS}&criar=1&jogadores=${jogadores.length}`);
    await expect.poll(async () => (await relatorioDe(anfitriao.pagina)).codigo, { timeout: 45_000 }).not.toBeNull();
    const { codigo } = await relatorioDe(anfitriao.pagina);
    for (const membro of membros) await membro.pagina.goto(`/prototipos/rts-lockstep/?${PARAMETROS}#${codigo}`);
    for (const jogador of jogadores) {
      await expect.poll(async () => (await relatorioDe(jogador.pagina)).estado, { timeout: 90_000, message: `${jogador.motor} starts playing` }).toBe('jogando');
    }
    const inicio = Date.now();
    console.log(`room ${codigo}: ${jogadores.map(j => `${j.motor} ${j.versao}`).join(', ')}`);

    // play, with a progress line every 15 s; stop early on a desync or an error
    let atual = await relatorioDe(anfitriao.pagina);
    while (atual.turno < TURNOS) {
      await anfitriao.pagina.waitForTimeout(INTERVALO_MS);
      const relatorios = await Promise.all(jogadores.map(j => relatorioDe(j.pagina)));
      atual = relatorios[0];
      const segundos = Math.round((Date.now() - inicio) / 1000);
      console.log(`${segundos}s turn ${atual.turno}: ${relatorios.map((r, k) => `${jogadores[k].motor} ${r.estado} t${r.turno}`).join(', ')}; compared ${atual.contagem.comparacoes}, desyncs ${atual.dessincronias.length}, late ${atual.contagem.atrasados}, waits ${atual.contagem.esperas}`);
      const problema = relatorios.find(r => r.estado !== 'jogando');
      if (problema) break;
      expect(Date.now() - inicio, 'the match falls far behind wall time').toBeLessThan((minutos + 3) * 60_000);
    }
    await anfitriao.pagina.waitForTimeout(3000);

    const relatorios = await Promise.all(jogadores.map(j => relatorioDe(j.pagina)));
    const somas = await Promise.all(jogadores.map(j => j.pagina.evaluate(() => window.__lockstep.somas())));
    // ticks every page reached, compared across all of them
    const comuns = Object.keys(somas[0]).filter(tick => somas.every(s => tick in s)).map(Number).sort((a, b) => a - b);
    const divergentes = comuns.filter(tick => somas.some(s => s[tick] !== somas[0][tick]));
    const resultado = {
      minutos: minutos,
      parametros: PARAMETROS,
      codigo,
      segundosReais: Math.round((Date.now() - inicio) / 1000),
      deixados,
      somasComuns: comuns.length,
      ultimaSomaComum: comuns.at(-1) ?? null,
      divergentes: divergentes.slice(0, 10),
      jogadores: jogadores.map((j, k) => ({ motor: j.motor, versao: j.versao, falhas: j.falhas.slice(0, 20), relatorio: relatorios[k] })),
    };
    writeFileSync(testInfo.outputPath('lockstep.json'), JSON.stringify(resultado, null, 2));
    await testInfo.attach('lockstep.json', { path: testInfo.outputPath('lockstep.json'), contentType: 'application/json' });
    const host = relatorios[0];
    console.log(`RESULT ${JSON.stringify({ turnos: host.turno, comparacoes: host.contagem.comparacoes, dessincronias: host.dessincronias.length, somasComuns: comuns.length, divergentes: divergentes.length, bytesTurno: host.bytes.turno, bytesTurnoComComandos: host.bytes.turnoComComandos, maiorMensagem: Math.max(...relatorios.map(r => r.bytes.maiorMensagem)), fatiadas: relatorios.map(r => r.bytes.fatiadas), latencia: relatorios.map(r => r.latencia?.p50), latenciaP95: relatorios.map(r => r.latencia?.p95) })}`);

    for (const [k, r] of relatorios.entries()) {
      expect(r.erro, `${jogadores[k].motor} error`).toBeNull();
      expect(r.estado, `${jogadores[k].motor} state`).toBe('jogando');
      expect(r.turno, `${jogadores[k].motor} kept up with the host`).toBeGreaterThanOrEqual(host.turno - 50);
      expect(r.bytes.maiorMensagem, 'every message under the limit').toBeLessThan(16000);
    }
    expect(host.dessincronias).toEqual([]);
    expect(host.turno).toBeGreaterThanOrEqual(TURNOS);
    expect(divergentes, 'checksums equal on every page at every common tick').toEqual([]);
    // one comparison per member every second of game, give or take the last few
    expect(host.contagem.comparacoes).toBeGreaterThanOrEqual(membros.length * (minutos * 60 - 10));
    expect(comuns.length).toBeGreaterThanOrEqual(minutos * 60 - 10);
  } finally {
    for (const navegador of navegadores.values()) await navegador.close();
  }
}
