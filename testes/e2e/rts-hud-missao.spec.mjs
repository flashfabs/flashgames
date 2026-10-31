// The interface of the "Morro Aceso" mission in a real page (interface front): the start screen with the difficulty,
// the briefing (skipping it goes to the playtest log), objectives, the radio with subtitles, the re-powering
// countdown, the maintenance crew repairing through the command card and the context click (the overturned truck it
// brings back pays the rescue objective), the scripted camera, the end screen and playing the phase again without
// reloading the page.
// The match runs paused and is moved ahead by the test hook (window.__rts.avancar), so every order lands on the same
// tick on every run.

import { test, expect } from '@playwright/test';

const MISSAO = '/rts/?partida=morro-aceso&dificuldade=facil&teste=1&atlas=0';
const SEGUNDO = 30;
const TECLAS = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyA', 'KeyS', 'KeyD', 'KeyF'];

async function abrirMissao(page, consulta = '') {
  await page.goto(MISSAO + consulta);
  await page.waitForFunction(() => window.__rts?.estado.atual?.n > 0 && window.__rts.versaoGancho && window.__rts.catalogo.tamanho > 0);
}

const ultimoComando = page => page.evaluate(() => window.__rts.comandos.at(-1));
const tecla = (page, code) => page.evaluate(c => dispatchEvent(new KeyboardEvent('keydown', { code: c, key: c, bubbles: true, cancelable: true })), code);
const doTipo = (page, nome) => page.evaluate(n => window.__rts.entidades(e => e.nome === n && e.dono === 0).map(e => e.id), nome);
const etiquetada = (page, nome) => page.evaluate(n => window.__rts.entidades(e => e.nome === n).map(e => e.id), nome);

/** Selects these ids as the player would, and refreshes the card. */
async function selecionar(page, ids) {
  await page.evaluate(lista => {
    const { selecionadas, controles } = window.__rts;
    selecionadas.clear();
    for (const id of lista) selecionadas.add(id);
    controles.executar({ acao: 'cancelar' });
  }, ids);
}

/** Centres the camera on an entity, waits two frames and returns its client pixel. */
async function naTela(page, id) {
  await page.evaluate(i => Object.assign(window.__rts.camera, window.__rts.indice.centro([i])), id);
  await page.evaluate(() => new Promise(pronto => requestAnimationFrame(() => requestAnimationFrame(pronto))));
  return page.evaluate(i => window.__rts.naTela(i), id);
}

/** Whether the cell of an entity was ever seen by the player (piles and structures can be targeted only then). */
const jaVista = (page, id) => page.evaluate(i => {
  const r = window.__rts;
  const a = r.estado.atual;
  const k = r.indice.k(i);
  return k >= 0 && a.visao[Math.floor(a.y[k] / r.FP) * r.estado.mapa.largura + Math.floor(a.x[k] / r.FP)] !== 0;
}, id);

test('the maintenance crew repairs from the card and the context click, and rescues the overturned truck', async ({ page }) => {
  await abrirMissao(page);
  await page.evaluate(() => window.__rts.pausar(true));
  // The convoy reaches the base, and the two Turmas clear the ambush around the truck.
  await page.evaluate(n => window.__rts.avancar(n), 20 * SEGUNDO);
  const turmas = await doTipo(page, 'turma-de-linha');
  const [equipe] = await doTipo(page, 'equipe-de-manutencao');
  const [caminhao] = await etiquetada(page, 'caminhao-tombado');
  expect(turmas.length).toBe(2);
  expect(equipe).toBeGreaterThan(0);
  expect(caminhao).toBeGreaterThan(0);
  await page.evaluate(ids => {
    const r = window.__rts;
    r.comando({ tipo: r.TIPO_COMANDO.ATACAR_MOVENDO, unidades: ids, x: r.celula(12), y: r.celula(58) });
  }, turmas);
  await expect.poll(async () => {
    await page.evaluate(() => window.__rts.avancar(150));
    return jaVista(page, caminhao);
  }, { timeout: 60_000, intervals: [100] }).toBe(true);
  await page.evaluate(n => window.__rts.avancar(n), 15 * SEGUNDO);

  // The card of the crew offers Reparar next to the forward post; its key aims, and Esc lets go.
  await selecionar(page, [equipe]);
  const casa = await page.evaluate(() => window.__rts.hud.cartao.slots.findIndex(s => s?.modo === 'reparar'));
  expect(casa).toBeGreaterThanOrEqual(0);
  await expect(page.locator(`#comandos .grade [data-slot="${casa}"]`)).toContainText('Reparar');
  await page.locator('#tela').focus();
  await tecla(page, TECLAS[casa]);
  await expect.poll(() => page.evaluate(() => window.__rts.controles.reparoArmado)).toBe(true);
  await expect(page.locator('#comandos .grade [data-slot="' + casa + '"]')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__rts.controles.reparoArmado)).toBe(false);

  // A context click of the crew on the truck sends REPARAR at it.
  let p = await naTela(page, caminhao);
  await page.mouse.click(p.x, p.y, { button: 'right' });
  expect(await ultimoComando(page)).toMatchObject({ tipo: 12, alvo: caminhao, unidades: [equipe] });

  // The card's Reparar and a click on the truck send the same.
  await tecla(page, TECLAS[casa]);
  p = await naTela(page, caminhao);
  await page.mouse.click(p.x, p.y);
  expect(await ultimoComando(page)).toMatchObject({ tipo: 12, alvo: caminhao, unidades: [equipe] });
  await expect.poll(() => page.evaluate(() => window.__rts.controles.reparoArmado)).toBe(false);

  // The mission turns that repair into re-powering, with its countdown at the top; the truck comes over, and out of it
  // a veteran Cesto.
  await expect.poll(async () => {
    await page.evaluate(() => window.__rts.avancar(30));
    return page.locator('#contagem').textContent();
  }, { timeout: 60_000, intervals: [100] }).toMatch(/Caminhão tombado: religando, faltam \d+ s/);
  await expect.poll(async () => {
    await page.evaluate(() => window.__rts.avancar(150));
    return (await doTipo(page, 'cesto-blindado')).length;
  }, { timeout: 60_000, intervals: [100] }).toBe(1);
  const cesto = await page.evaluate(() => window.__rts.entidades(e => e.nome === 'cesto-blindado' && e.dono === 0)[0]);
  expect(cesto.veterania).toBe(2);
  await expect(page.locator('#objetivos')).toContainText('caminhão tombado');
  await expect(page.locator('#objetivos li[data-estado="2"]')).toContainText('caminhão tombado');
  expect(await page.evaluate(() => window.__rts.registro().eventos.filter(e => e.tipo === 'comando' && e.comando === 12).length)).toBeGreaterThanOrEqual(2);
  await expect(page.locator('#contagem')).toBeHidden();
  // the Supervisora says so on the radio
  await expect.poll(() => page.evaluate(() => [window.__rts.radio.noAr?.id, ...window.__rts.radio.fila])).toContain('radio.supervisora.morro_resgate_ok');

  // A damaged unit of the player's is repaired by a context click of the crew.
  const ferida = await page.evaluate(() => window.__rts.entidades(e => e.dono === 0 && e.nome === 'turma-de-linha' && e.vida < 255)[0]?.id ?? 0);
  if (ferida) {
    await selecionar(page, [equipe]);
    p = await naTela(page, ferida);
    await page.mouse.click(p.x, p.y, { button: 'right' });
    expect(await ultimoComando(page)).toMatchObject({ tipo: 12, alvo: ferida, unidades: [equipe] });
  }
});

test('the start screen offers the difficulty, the briefing has subtitles, and skipping it goes to the playtest log', async ({ page }) => {
  await page.goto(`${MISSAO}&inicio=1`);
  await page.waitForFunction(() => window.__rts?.estado.mapa && window.__rts.versaoGancho);
  const inicio = page.locator('#inicio');
  await expect(inicio).toBeVisible();
  await expect(inicio.locator('.cortina-sub')).toHaveText('Morro Aceso');
  await expect(inicio.getByRole('button', { name: 'Fácil' })).toHaveAttribute('aria-pressed', 'true');
  await inicio.getByRole('button', { name: 'Difícil' }).click();
  await expect(inicio.getByRole('button', { name: 'Difícil' })).toHaveAttribute('aria-pressed', 'true');
  await inicio.getByRole('button', { name: 'Começar' }).click();

  // The briefing holds the match: one line at a time, with who speaks and the subtitle; Esc never skips it.
  const briefing = page.locator('#briefing');
  await expect(briefing).toBeVisible();
  await expect(briefing.locator('[data-nome]')).toHaveText('Supervisora da Regional');
  await expect(briefing.locator('[data-legenda]')).toContainText('Equipe 14, aqui é a Regional');
  await expect(briefing.locator('[data-contador]')).toHaveText('1/5');
  await page.keyboard.press('Escape');
  await page.keyboard.press('F10');
  await expect(briefing).toBeVisible();
  await expect(page.locator('#menu')).toBeHidden();
  await briefing.getByRole('button', { name: 'Próxima' }).click();
  await expect(briefing.locator('[data-contador]')).toHaveText('2/5');
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__rts.estado.tick)).toBe(0);
  await briefing.getByRole('button', { name: 'Pular' }).click();
  await expect(briefing).toBeHidden();

  // The match runs in the difficulty chosen, the URL keeps it, and the log says the briefing was skipped.
  await expect.poll(() => page.evaluate(() => window.__rts.estado.tick)).toBeGreaterThan(5);
  expect(await page.evaluate(() => window.__rts.dificuldade)).toBe('dificil');
  expect(new URL(page.url()).searchParams.get('dificuldade')).toBe('dificil');
  const registro = await page.evaluate(() => window.__rts.registro());
  expect(registro.dificuldade).toBe('dificil');
  const pulado = registro.eventos.filter(e => e.tipo === 'briefingPulado');
  expect(pulado).toHaveLength(1);
  expect(pulado[0]).toMatchObject({ passo: 0, falas: 2, total: 5 });
  expect(pulado[0].segundos).toBeGreaterThan(0);
  // the Carga of the hard difficulty, from the mission's start trigger
  await expect.poll(() => page.evaluate(() => window.__rts.hud.carga)).toBe(1200);
});

test('objectives and the radio follow the mission, and the menu plays the phase again without reloading', async ({ page }) => {
  await abrirMissao(page);
  await page.evaluate(() => window.__rts.pausar(true));
  await page.evaluate(() => (window.__semRecarga = true));
  await page.evaluate(() => window.__rts.avancar(30));
  const objetivos = page.locator('#objetivos');
  await expect(objetivos).toContainText('Monte a operação');
  await expect(objetivos).toContainText('Religue a Subestação do Morro');
  await expect(objetivos.locator('li[data-estado="1"]')).toHaveCount(2);
  await expect(objetivos.locator('li[data-novo="true"]')).toHaveCount(2);

  // The two opening lines: the Supervisora on the air with her subtitle, the Locutor waiting his turn.
  const radio = page.locator('#radio');
  await expect(radio).toBeVisible();
  await expect(radio.locator('[data-nome]')).toHaveText('Supervisora da Regional');
  await expect(radio.locator('[data-legenda]')).toContainText('comboio está entrando pela estrada velha do sul');
  expect(await page.evaluate(() => window.__rts.radio.fila)).toEqual(['radio.locutor.morro_abertura']);
  await expect(page.locator('#alertas')).not.toContainText('comboio');

  // Recomeçar from the menu: the same page, a new match from its first tick, the old one forgotten.
  await page.evaluate(() => window.__rts.avancar(300));
  const tickAntes = await page.evaluate(() => window.__rts.estado.tick);
  await page.locator('#tela').focus();
  await page.keyboard.press('F10');
  await page.locator('#menu').getByRole('button', { name: 'Recomeçar' }).click();
  await expect(page.locator('#menu')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__rts.tentativa)).toBe(2);
  expect(await page.evaluate(() => window.__rts.estado.atual)).toBeNull();
  expect(await page.evaluate(() => window.__semRecarga)).toBe(true);
  await page.evaluate(() => window.__rts.avancar(30));
  expect(await page.evaluate(() => window.__rts.estado.tick)).toBeLessThan(tickAntes);
  await expect(objetivos.locator('li[data-estado="1"]')).toHaveCount(2);
  await expect(radio.locator('[data-legenda]')).toContainText('comboio está entrando pela estrada velha do sul');
  const registro = await page.evaluate(() => window.__rts.registro());
  const reinicio = registro.eventos.find(e => e.tipo === 'reiniciar');
  expect(reinicio).toMatchObject({ passo: 0, tickAnterior: tickAntes, resultadoAnterior: 'em-andamento', tentativa: 2 });
  expect(registro.eventos.filter(e => e.tipo === 'comando')).toHaveLength(0);
});

test('the end screen sums up the phase, asks about the next one, and Recomeçar plays again', async ({ page }) => {
  await abrirMissao(page);
  await page.evaluate(() => window.__rts.pausar(true));
  await page.evaluate(() => (window.__semRecarga = true));
  await page.evaluate(n => window.__rts.avancar(n), 20 * SEGUNDO);
  // a victory event of the mission opens the screen (the evaluator's VITORIA, with the player in arg)
  await page.evaluate(() => window.__rts.fim.verificar(Int32Array.of(window.__rts.EVENTO.VITORIA, 0, -1, -1, 0, 0, 0, 0, 0)));
  const fim = page.locator('#fim');
  await expect(fim).toBeVisible();
  await expect(fim.locator('h2')).toHaveText('Vitória');
  await expect(fim.locator('[data-fim="tempo"]')).toHaveText('Morro Aceso');
  await expect(fim.locator('[data-fim="resumo"]')).toContainText('Tempo: 0:20');
  await expect(fim.locator('[data-fim="resumo"]')).toContainText('Objetivos: 0 de 5 principais, 0 de 5 opcionais');
  await expect(fim.locator('legend').nth(1)).toHaveText('Jogaria a próxima fase?');
  await fim.getByText('5', { exact: true }).click();
  await fim.getByText('Sim', { exact: true }).click();
  const baixado = page.waitForEvent('download');
  await fim.getByRole('button', { name: 'Baixar registro' }).click();
  await baixado;
  const respostas = await page.evaluate(() => window.__rts.registro().respostas);
  expect(respostas).toMatchObject({ diversao: 5, jogariaProximaFase: true });

  await fim.getByRole('button', { name: 'Recomeçar' }).click();
  await expect(fim).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__rts.tentativa)).toBe(2);
  // the old match's snapshot is gone at once, so the hook counts ticks from the new match
  expect(await page.evaluate(() => window.__rts.estado.atual)).toBeNull();
  await page.evaluate(() => window.__rts.avancar(30));
  expect(await page.evaluate(() => window.__semRecarga)).toBe(true);
  expect(await page.evaluate(() => window.__rts.estado.tick)).toBeLessThan(60);
  const registro = await page.evaluate(() => window.__rts.registro());
  expect(registro.eventos.find(e => e.tipo === 'reiniciar')).toMatchObject({ passo: 0, resultadoAnterior: 'vitoria', tentativa: 2 });
  expect(registro.respostas).toBeNull();
});

test('the mission camera eases to where the mission points, arrows wait for it, and B lets go of it', async ({ page }) => {
  await abrirMissao(page, '&camera=animar');
  await page.evaluate(() => window.__rts.pausar(true));
  const base = await page.evaluate(() => ({ ...window.__rts.camera }));
  await page.evaluate(() => window.__rts.avancar(6));
  await expect.poll(() => page.evaluate(() => window.__rts.render.cameraAnimando)).toBe(true);
  const alvo = await page.evaluate(() => {
    const [evento] = window.__rts.eventosDo('CAMERA');
    return { x: evento.x / window.__rts.FP, y: evento.y / window.__rts.FP };
  });
  expect(Math.hypot(alvo.x - base.x, alvo.y - base.y)).toBeGreaterThan(5);
  await page.locator('#tela').focus();
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(300);
  await page.keyboard.up('ArrowUp');
  await expect.poll(() => page.evaluate(() => window.__rts.render.cameraAnimando), { timeout: 10_000 }).toBe(false);
  const camera = await page.evaluate(() => ({ ...window.__rts.camera }));
  expect(Math.hypot(camera.x - alvo.x, camera.y - alvo.y)).toBeLessThan(0.5);
  // a jump of the player's (B, the base) stops a move that is still running
  await page.evaluate(({ x, y }) => window.__rts.render.animarCamera({ x, y, duracaoMs: 5000 }), base);
  await page.keyboard.press('KeyB');
  expect(await page.evaluate(() => window.__rts.render.cameraAnimando)).toBe(false);
});
