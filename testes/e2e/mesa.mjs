// Shared helpers for the end-to-end tests: a "table" of players, each in its own browser context, and a way
// to walk a player around the arena with the arrow keys. Game state is read through window.__salinha, the
// read-only hook that app.js installs when the address has ?teste=1.

import { test as base, expect } from '@playwright/test';

export { expect };

export const COLUNAS = 40;
export const LINHAS = 30;
export const VIEWPORT_PADRAO = { width: 1280, height: 800 };
const TECLAS = { direita: 'ArrowRight', esquerda: 'ArrowLeft', baixo: 'ArrowDown', cima: 'ArrowUp' };
const PASSOS = [[1, 0, 'direita'], [-1, 0, 'esquerda'], [0, 1, 'baixo'], [0, -1, 'cima']];
const TEMPO_SALA_MS = 30_000;
const TEMPO_PASSO_MS = 4_000;

// Init script for the host page: Math.random always lands in [0.9, 1). The arena then has no crates and no
// items on any map (densities are below 0.9) and the slot shuffle keeps the join order (slot n = n-th member),
// so a test can plan where everyone stands. Randomness itself still varies, so ids and tokens stay unique.
export function semCaixas() {
  const original = Math.random;
  Math.random = () => 0.9 + 0.0999 * original();
}

export class Jogador {
  constructor(mesa, nome, contexto, pagina) {
    this.mesa = mesa;
    this.nome = nome;
    this.contexto = contexto;
    this.pagina = pagina;
  }

  sala() {
    return this.pagina.evaluate(() => window.__salinha.sala());
  }

  jogo() {
    return this.pagina.evaluate(() => window.__salinha.jogo());
  }

  async fase() {
    return (await this.jogo())?.fase ?? null;
  }

  async esperarFase(fase, timeout = 20_000) {
    await expect.poll(() => this.fase(), { message: `${this.nome} esperando a fase ${fase}`, timeout }).toBe(fase);
  }

  // This player's own character as this page sees it: { x, y, v, g (grid), b (bombs) }.
  minhaPosicao() {
    return this.pagina.evaluate(lerMinhaPosicao);
  }

  // Someone else's character as this page sees it (on the host page, that is the authoritative copy).
  async posicaoDe(outro) {
    const meuId = (await outro.sala()).meuId;
    return this.pagina.evaluate(id => {
      const jogo = window.__salinha.jogo();
      const n = jogo?.escalacao.findIndex(item => item.id === id) ?? -1;
      return n >= 0 ? jogo.vista?.j?.[n] ?? null : null;
    }, meuId);
  }

  async bombas() {
    return (await this.jogo())?.vista?.b ?? [];
  }

  async criarSala() {
    await this.pagina.goto('/?teste=1');
    await this.pagina.locator('#campo-nome').fill(this.nome);
    await this.pagina.getByRole('button', { name: 'Criar sala' }).click();
    await expect(this.pagina.locator('#sala')).toBeVisible({ timeout: TEMPO_SALA_MS });
    return this.sala();
  }

  // Opens the invitation link the way a friend would, keeping ?teste=1 so the hook is there.
  async entrarPeloLink(link) {
    const endereco = new URL(link);
    endereco.search = '?teste=1';
    const codigo = endereco.hash.slice(1);
    await this.pagina.goto(endereco.toString());
    await expect(this.pagina.locator('#convite')).toBeVisible();
    await expect(this.pagina.locator('#convite-codigo')).toHaveText(codigo);
    await this.pagina.locator('#campo-nome').fill(this.nome);
    await this.pagina.getByRole('button', { name: 'Entrar na sala' }).click();
    await expect(this.pagina.locator('#sala')).toBeVisible({ timeout: TEMPO_SALA_MS });
    await expect(this.pagina.locator('#sala-codigo')).toHaveText(codigo);
  }

  async ficarPronto() {
    await this.pagina.getByRole('button', { name: 'Estou pronto' }).click();
  }

  async soltarBomba() {
    await this.pagina.keyboard.press('Space');
  }

  // Walks to cell (x, y) along free cells, holding the arrow keys like a person would. Only crates, walls and
  // bombs block the way; the route prefers straight lines so the player turns as little as possible.
  async andarAte([alvoX, alvoY], tentativas = 3) {
    const inicio = await this.minhaPosicao();
    if (!inicio) throw new Error(`${this.nome} is not playing`);
    const origem = [Math.round(inicio.x), Math.round(inicio.y)];
    const caminho = buscarCaminho(inicio.g, inicio.b, origem, [alvoX, alvoY]);
    if (!caminho) throw new Error(`${this.nome} has no way from ${origem} to ${[alvoX, alvoY]}`);
    const teclado = this.pagina.keyboard;
    let tecla = null;
    try {
      for (const [n, [x, y, sentido]] of caminho.entries()) {
        const nova = TECLAS[sentido];
        if (nova !== tecla) {
          // Press the new key before letting go of the old one, so the player never stops at a turn.
          await teclado.down(nova);
          if (tecla) await teclado.up(tecla);
          tecla = nova;
        }
        // On the last cell, let go a little early: the key-up takes a moment to reach the page.
        const folga = n === caminho.length - 1 ? 0.3 : 0.12;
        await this.pagina.waitForFunction(chegou, { x, y, sentido, folga }, { polling: 'raf', timeout: TEMPO_PASSO_MS });
      }
    } finally {
      if (tecla) await teclado.up(tecla);
    }
    // A busy machine can still overshoot into the next cell; walk back when that happens.
    await this.pagina.waitForTimeout(80);
    const fim = await this.minhaPosicao();
    if (fim && (Math.round(fim.x) !== alvoX || Math.round(fim.y) !== alvoY)) {
      if (tentativas <= 1) throw new Error(`${this.nome} stopped at ${[fim.x, fim.y]} instead of ${[alvoX, alvoY]}`);
      await this.andarAte([alvoX, alvoY], tentativas - 1);
    }
  }
}

// Runs in the page.
function lerMinhaPosicao() {
  const jogo = window.__salinha.jogo();
  const meuId = window.__salinha.sala()?.meuId;
  const n = jogo?.escalacao.findIndex(item => item.id === meuId) ?? -1;
  const eu = n >= 0 ? jogo.vista?.j?.[n] : null;
  return eu ? { x: eu.x, y: eu.y, v: eu.v, g: jogo.vista.g, b: jogo.vista.b } : null;
}

// Runs in the page: true once the player reached the cell along the direction it is walking.
function chegou({ x, y, sentido, folga }) {
  const jogo = window.__salinha.jogo();
  const meuId = window.__salinha.sala()?.meuId;
  const n = jogo?.escalacao.findIndex(item => item.id === meuId) ?? -1;
  const eu = n >= 0 ? jogo.vista?.j?.[n] : null;
  if (!eu) return false;
  if (sentido === 'direita') return eu.x >= x - folga;
  if (sentido === 'esquerda') return eu.x <= x + folga;
  if (sentido === 'baixo') return eu.y >= y - folga;
  return eu.y <= y + folga;
}

// Cheapest route on the grid string, counting each turn as a small extra cost. Returns [[x, y, direction]]
// for every cell after the origin, or null when the target cannot be reached.
export function buscarCaminho(grade, bombas, [ox, oy], [ax, ay]) {
  const livre = (x, y) => {
    if (x < 0 || y < 0 || x >= COLUNAS || y >= LINHAS) return false;
    const celula = grade[y * COLUNAS + x];
    if (celula === '#' || celula === '+' || celula === '?') return false;
    return !bombas.some(([bx, by]) => bx === x && by === y);
  };
  const chave = (x, y, d) => `${x},${y},${d}`;
  const custos = new Map([[chave(ox, oy, -1), 0]]);
  const anterior = new Map();
  const fila = [[0, ox, oy, -1]];
  while (fila.length) {
    fila.sort((a, b) => a[0] - b[0]);
    const [custo, x, y, d] = fila.shift();
    if (x === ax && y === ay) {
      const caminho = [];
      let atual = chave(x, y, d);
      while (anterior.has(atual)) {
        const [cx, cy, cd] = atual.split(',').map(Number);
        caminho.unshift([cx, cy, PASSOS[cd][2]]);
        atual = anterior.get(atual);
      }
      return caminho;
    }
    if (custo > custos.get(chave(x, y, d))) continue;
    PASSOS.forEach(([dx, dy], nd) => {
      const nx = x + dx;
      const ny = y + dy;
      if (!livre(nx, ny)) return;
      const novo = custo + 10 + (d >= 0 && d !== nd ? 1 : 0);
      const k = chave(nx, ny, nd);
      if (novo >= (custos.get(k) ?? Infinity)) return;
      custos.set(k, novo);
      anterior.set(k, chave(x, y, d));
      fila.push([novo, nx, ny, nd]);
    });
  }
  return null;
}

// A set of players for one test. Every player gets a fresh browser context, so each one has its own page in
// front (a page in the background stops requestAnimationFrame) and its own storage.
export class Mesa {
  constructor(navegador, info) {
    this.navegador = navegador;
    this.info = info;
    this.jogadores = [];
    this.errosDePagina = [];
    this.registro = [];
  }

  // preparar(ctx) runs before the page opens, for routes and the like.
  async novoJogador(nome, { contexto = {}, iniciar = [], navegador = this.navegador, preparar = null } = {}) {
    const ctx = await navegador.newContext({ viewport: VIEWPORT_PADRAO, ...contexto });
    if (preparar) await preparar(ctx);
    // Each init script is a function, or [function, argument].
    for (const script of iniciar) await ctx.addInitScript(...[script].flat());
    const pagina = await ctx.newPage();
    pagina.on('pageerror', erro => this.errosDePagina.push(`${nome}: ${erro.message}`));
    pagina.on('console', mensagem => this.registro.push(`[${nome}] ${mensagem.type()}: ${mensagem.text()}`));
    const jogador = new Jogador(this, nome, ctx, pagina);
    this.jogadores.push(jogador);
    return jogador;
  }

  // Host plus guests that join through the invitation link, one after the other.
  async montar(nomes, { anfitriao = {}, convidado = () => ({}) } = {}) {
    const [primeiro, ...outros] = nomes;
    const host = await this.novoJogador(primeiro, anfitriao);
    const { link } = await host.criarSala();
    const convidados = [];
    for (const [n, nome] of outros.entries()) {
      const jogador = await this.novoJogador(nome, convidado(n));
      await jogador.entrarPeloLink(link);
      convidados.push(jogador);
    }
    await expect(host.pagina.locator('#contagem-membros')).toHaveText(`${nomes.length}/8`);
    return { host, convidados, link };
  }

  async todosProntos(jogadores) {
    for (const jogador of jogadores) await jogador.ficarPronto();
  }

  async fechar() {
    await Promise.all(this.jogadores.map(jogador => jogador.contexto.close().catch(() => {})));
  }
}

export const test = base.extend({
  mesa: async ({ browser }, use, info) => {
    const mesa = new Mesa(browser, info);
    await use(mesa);
    if (info.status !== info.expectedStatus) {
      await info.attach('console', { body: mesa.registro.join('\n'), contentType: 'text/plain' });
    }
    await mesa.fechar();
    expect(mesa.errosDePagina, 'JavaScript errors on the pages').toEqual([]);
  },
});
