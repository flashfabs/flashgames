// Test hook for the end-to-end tests, loaded by principal.js only with ?teste=1, so the normal page never has it.
// It extends the window.__rts object the page already exposes with: decoded snapshots, every presentation event
// since the page opened, commands sent straight to the simulation, pause, and fast-forward by ticks.
// Reading goes through CAMPOS_RETRATO, so per-entity fields added to the snapshot show up here without a change.
import { CAMPOS_RETRATO, TIPO_COMANDO, EVENTO, FP, PASSOS_POR_SEGUNDO, SEM_ENTIDADE, TAMANHO_EVENTO, E_TIPO, E_TICK, E_ENTIDADE, E_ALVO, E_X, E_Y, E_ALVO_X, E_ALVO_Y, E_ARG } from '../sim/contratos.js';

/** Version of this hook's interface; bump it when a function changes meaning. */
export const VERSAO_GANCHO = 1;

const NOMES_EVENTO = Object.fromEntries(Object.entries(EVENTO).map(([nome, valor]) => [valor, nome]));
const CAMPOS_ENTIDADE = new Set(CAMPOS_RETRATO.map(([nome]) => nome));
// snapshot arrays that are neither per entity nor per player
const CAMPOS_FORA = new Set(['visao', 'eventos']);
// the most ticks one fast-forward may ask for: one hour of play
const MAX_AVANCAR = 3600 * PASSOS_POR_SEGUNDO;

/** Events of a snapshot as plain objects, in the order the simulation wrote them. */
export function decodificarEventos(eventos) {
  const lista = [];
  for (let k = 0; k + TAMANHO_EVENTO <= eventos.length; k += TAMANHO_EVENTO) {
    const tipo = eventos[k + E_TIPO];
    lista.push({
      tipo,
      nome: NOMES_EVENTO[tipo] ?? `EVENTO_${tipo}`,
      tick: eventos[k + E_TICK],
      entidade: eventos[k + E_ENTIDADE],
      alvo: eventos[k + E_ALVO],
      x: eventos[k + E_X],
      y: eventos[k + E_Y],
      alvoX: eventos[k + E_ALVO_X],
      alvoY: eventos[k + E_ALVO_Y],
      arg: eventos[k + E_ARG],
    });
  }
  return lista;
}

/**
 * A snapshot as plain data a test can return from page.evaluate: one object per entity with every per-entity
 * field, and every other typed array (resources per player and whatever the economy adds) as a plain array.
 */
export function decodificarRetrato(retrato) {
  if (!retrato) return null;
  const entidades = [];
  for (let k = 0; k < retrato.n; k++) {
    const entidade = {};
    for (const nome of CAMPOS_ENTIDADE) if (retrato[nome]) entidade[nome] = retrato[nome][k];
    entidades.push(entidade);
  }
  const resultado = { tick: retrato.tick, versao: retrato.versao, soma: retrato.soma, tickSoma: retrato.tickSoma, n: retrato.n, entidades };
  for (const [nome, valor] of Object.entries(retrato)) {
    if (CAMPOS_ENTIDADE.has(nome) || CAMPOS_FORA.has(nome) || nome in resultado) continue;
    if (ArrayBuffer.isView(valor)) resultado[nome] = Array.from(valor);
  }
  return resultado;
}

/**
 * Extends the page's window.__rts in place.
 * @param {object} rts the object principal.js exposes with ?teste=1
 * @param {{simulacao: object, estado: object, opcoes?: object, dados?: object, hud?: object, obterRegistro?: () => object|null}} contexto
 *   simulacao is the worker bridge (ponte-simulacao.js) and estado its shared state; obterRegistro returns the play-test
 *   log (C15) as an object, without downloading it
 */
export function ligarGancho(rts, { simulacao, estado, opcoes = {}, dados = null, hud = null, obterRegistro = null }) {
  const eventos = [];
  const esperas = [];
  let primeiro = null;
  const pronto = new Promise(resolver => (primeiro = resolver));

  // Every snapshot passes through estado.atual, so a setter there sees each one without touching the bridge.
  let atual = estado.atual;
  Object.defineProperty(estado, 'atual', {
    configurable: true,
    enumerable: true,
    get: () => atual,
    set(retrato) {
      atual = retrato;
      if (retrato) aoReceber(retrato);
    },
  });

  function aoReceber(retrato) {
    if (retrato.eventos) for (const evento of decodificarEventos(retrato.eventos)) eventos.push(evento);
    primeiro?.();
    primeiro = null;
    for (let k = esperas.length - 1; k >= 0; k--) {
      if (retrato.tick < esperas[k].tick) continue;
      clearTimeout(esperas[k].relogio);
      esperas[k].resolver(decodificarRetrato(retrato));
      esperas.splice(k, 1);
    }
  }

  /** Resolves with the first snapshot at or past `tick`; rejects after `limiteMs` of wall time. */
  function esperarTick(tick, limiteMs = 30000) {
    if (atual && atual.tick >= tick) return Promise.resolve(decodificarRetrato(atual));
    return new Promise((resolver, rejeitar) => {
      const espera = { tick, resolver, relogio: 0 };
      esperas.push(espera);
      espera.relogio = setTimeout(() => {
        const k = esperas.indexOf(espera);
        if (k < 0) return;
        esperas.splice(k, 1);
        rejeitar(new Error(`gancho: o tick ${tick} não chegou em ${limiteMs} ms (último ${atual?.tick ?? 'nenhum'})`));
      }, limiteMs);
    });
  }

  /**
   * Runs `passos` ticks at once in the worker and resolves with the snapshot after them; works while paused and in a
   * background tab. Needs the worker's AVANCAR message, which only a match started with ?teste=1 accepts.
   */
  function avancar(passos, limiteMs = 120000) {
    if (!Number.isInteger(passos) || passos < 1 || passos > MAX_AVANCAR) throw new Error(`gancho: passos entre 1 e ${MAX_AVANCAR}`);
    if (typeof simulacao.avancar !== 'function') throw new Error('gancho: a ponte da simulação ainda não tem avancar (mensagem AVANCAR do worker)');
    const alvo = (atual?.tick ?? 0) + passos;
    const espera = esperarTick(alvo, limiteMs);
    simulacao.avancar(passos);
    return espera;
  }

  /**
   * Sends an order as the local player, the same path the input uses. Positions are world units (1 cell = FP);
   * celula() gives the centre of a cell.
   */
  function comando({ tipo, unidades = [], alvo = SEM_ENTIDADE, x = 0, y = 0, arg = 0, fila = 0 }) {
    simulacao.enviarComando({ tipo, unidades, alvo, x, y, arg, fila });
  }

  Object.assign(rts, {
    versaoGancho: VERSAO_GANCHO,
    FP,
    PASSOS_POR_SEGUNDO,
    TIPO_COMANDO,
    EVENTO,
    opcoes,
    dados,
    hud,
    /** Resolves once the first snapshot arrived. */
    pronto,
    /** Every presentation event since the hook was wired, decoded, oldest first. */
    eventos,
    eventosDo: nome => eventos.filter(evento => evento.nome === nome),
    limparEventos: () => void (eventos.length = 0),
    retrato: () => decodificarRetrato(atual),
    entidades: (filtro = () => true) => (decodificarRetrato(atual)?.entidades ?? []).filter(filtro),
    celula: n => n * FP + (FP >> 1),
    /** The play-test log (C15) as plain data, or null while the page has none. */
    registro: () => {
      const registro = obterRegistro?.() ?? null;
      return registro === null ? null : JSON.parse(JSON.stringify(registro));
    },
    comando,
    /** Pauses or resumes for the tests' own reason; the player's pause and the hidden tab are separate reasons. */
    pausar: (valor = true) => simulacao.pausar(valor, 'teste'),
    avancar,
    esperarTick,
  });
  if (atual) aoReceber(atual);
  return rts;
}
