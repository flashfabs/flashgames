// Mission radio with subtitles: the lines a MENSAGEM_MISSAO event brings (C3, by the index of the mission's texts) and
// whose C11 id names a speaker (radio.<quem>.<...>) play one at a time, with the speaker's name and portrait frame,
// each up for its reading time while the match runs, and a click goes to the place the line points at. Other mission
// texts (attack warnings, hints) stay in the alert list. The portrait is a neutral frame until the art front delivers
// the grey portraits; data-quem on it lets the art style it.

/** Reading time of a line on screen: a base plus a little per letter, within limits (ms). */
export const FALA_MINIMA_MS = 4000;
export const FALA_MAXIMA_MS = 12000;
const BASE_MS = 1800;
const POR_LETRA_MS = 55;
/** Lines waiting behind the one on air; past this the oldest waiting one is dropped, so the radio never lags far behind the match. */
export const MAXIMO_NA_FILA = 4;

/** How long a line stays up, by its length. */
export function duracaoDaFala(conteudo) {
  return Math.min(FALA_MAXIMA_MS, Math.max(FALA_MINIMA_MS, BASE_MS + POR_LETRA_MS * String(conteudo).length));
}

/**
 * Who speaks a line, by its C11 id: radio.<quem>.<...> or briefing.<missao>.<n>.<quem>; null for texts nobody speaks
 * (attack warnings, objectives, hints).
 */
export function quemFala(id) {
  const radio = /^radio\.([a-z0-9-]+)\./.exec(id ?? '');
  if (radio) return radio[1];
  const briefing = /^briefing\.[a-z0-9-]+\.\d+\.([a-z0-9-]+)$/.exec(id ?? '');
  return briefing ? briefing[1] : null;
}

/** Name of a speaker for the subtitle: the C11 text falante.<quem>, or the id with a capital letter. */
export function nomeDoFalante(quem, texto) {
  const id = `falante.${quem}`;
  return texto?.tem?.(id) ? texto(id) : String(quem).charAt(0).toUpperCase() + String(quem).slice(1);
}

/**
 * Fills a portrait frame, a name line and a subtitle line for one speaker (the radio and the briefing share it).
 * @param {{retrato: HTMLElement, nome: HTMLElement, legenda: HTMLElement}} partes
 */
export function mostrarFala(partes, { quem, conteudo }, texto) {
  const nome = nomeDoFalante(quem, texto);
  partes.retrato.dataset.quem = quem;
  partes.retrato.textContent = nome.charAt(0);
  partes.nome.textContent = nome;
  partes.legenda.textContent = conteudo;
}

/**
 * @param {object} opcoes
 * @param {HTMLElement} opcoes.raiz the radio box (#radio), with [data-retrato], [data-nome] and [data-legenda]
 * @param {((id: string, valores?: object) => string) & {tem: (id: string) => boolean}} opcoes.texto
 * @param {(fala: {x: number, y: number}) => void} [opcoes.aoEscolher] a click on a line that points at a place
 */
export function criarRadio({ raiz, texto, aoEscolher = () => {} }) {
  const partes = { retrato: raiz.querySelector('[data-retrato]'), nome: raiz.querySelector('[data-nome]'), legenda: raiz.querySelector('[data-legenda]') };
  const fila = [];
  let noAr = null;
  let restante = 0;
  let ditas = 0;

  raiz.addEventListener('click', () => {
    if (noAr && !noAr.semLugar) aoEscolher(noAr);
  });

  function tocarProxima() {
    noAr = fila.shift() ?? null;
    raiz.hidden = !noAr;
    if (!noAr) return;
    mostrarFala(partes, noAr, texto);
    raiz.dataset.lugar = String(!noAr.semLugar);
    restante = duracaoDaFala(noAr.conteudo);
    ditas += 1;
  }

  /**
   * Queues a line of the mission by its C11 id; returns false for an id nobody speaks (the caller lists it as an
   * alert instead).
   * @param {{id: string, x?: number, y?: number, semLugar?: boolean}} fala
   */
  function falar({ id, x = 0, y = 0, semLugar = true }) {
    const quem = quemFala(id);
    if (!quem) return false;
    fila.push({ id, quem, conteudo: texto(id), x, y, semLugar });
    while (fila.length > MAXIMO_NA_FILA) fila.shift();
    if (!noAr) tocarProxima();
    return true;
  }

  return {
    falar,
    /** Called every frame: the line on air counts down only while the match runs (parado: paused, menu, end screen). */
    atualizar(dt, parado) {
      if (!noAr || parado) return;
      restante -= dt;
      if (restante <= 0) tocarProxima();
    },
    /** Off the air and nothing waiting (a restarted match). */
    limpar() {
      fila.length = 0;
      noAr = null;
      raiz.hidden = true;
    },
    /** The line on air, or null. */
    get noAr() {
      return noAr ? { id: noAr.id, quem: noAr.quem, conteudo: noAr.conteudo } : null;
    },
    /** Ids waiting behind the line on air. */
    get fila() {
      return fila.map(f => f.id);
    },
    /** Lines aired since the page opened. */
    get ditas() {
      return ditas;
    },
  };
}
