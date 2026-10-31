// Mission briefing before the match: the C11 lines briefing.<missao>.<n>.<quem> (n from 1, in order), one at a time
// with the speaker's portrait frame, name and subtitle, each advancing on its own after its reading time or with
// Próxima, and Pular to skip the rest. The match waits paused behind it (the caller holds it); the end says whether
// it was skipped and how long it was watched, for the playtest log (briefingPulado, C15).
import { duracaoDaFala, mostrarFala, quemFala } from './radio.js';

const PADRAO = /^briefing\.([a-z0-9-]+)\.(\d+)\.([a-z0-9-]+)$/;

/**
 * The briefing lines of a mission, in order, from the C11 ids.
 * @param {string} missao mission id
 * @param {Iterable<string>} ids every C11 id
 * @returns {{id: string, n: number, quem: string}[]}
 */
export function falasDoBriefing(missao, ids) {
  const falas = [];
  for (const id of ids) {
    const partes = PADRAO.exec(id);
    if (partes && partes[1] === missao) falas.push({ id, n: Number(partes[2]), quem: partes[3] });
  }
  return falas.sort((a, b) => a.n - b.n);
}

/**
 * @param {object} opcoes
 * @param {HTMLElement} opcoes.raiz the briefing curtain (#briefing)
 * @param {((id: string, valores?: object) => string) & {tem: (id: string) => boolean}} opcoes.texto
 * @param {{id: string, quem: string}[]} opcoes.falas
 * @param {(fim: {pulado: boolean, segundos: number, vistas: number, total: number}) => void} opcoes.aoTerminar
 * @param {() => number} [opcoes.agora]
 */
export function criarBriefing({ raiz, texto, falas, aoTerminar, agora = () => performance.now() }) {
  const partes = { retrato: raiz.querySelector('[data-retrato]'), nome: raiz.querySelector('[data-nome]'), legenda: raiz.querySelector('[data-legenda]') };
  const contador = raiz.querySelector('[data-contador]');
  const proxima = raiz.querySelector('[data-briefing="proxima"]');
  const pular = raiz.querySelector('[data-briefing="pular"]');
  let aberto = false;
  let indice = -1;
  let restante = 0;
  let inicio = 0;

  function mostrar(i) {
    indice = i;
    const fala = falas[i];
    const conteudo = texto(fala.id);
    mostrarFala(partes, { quem: fala.quem ?? quemFala(fala.id), conteudo }, texto);
    contador.textContent = `${i + 1}/${falas.length}`;
    proxima.textContent = texto(i === falas.length - 1 ? 'briefing.comecar' : 'briefing.proxima');
    restante = duracaoDaFala(conteudo);
  }

  function terminar(pulado) {
    if (!aberto) return;
    aberto = false;
    raiz.hidden = true;
    aoTerminar({ pulado, segundos: Math.round((agora() - inicio) / 100) / 10, vistas: indice + 1, total: falas.length });
  }

  function avancar() {
    if (indice + 1 < falas.length) mostrar(indice + 1);
    else terminar(false);
  }

  proxima.addEventListener('click', () => {
    avancar();
    if (aberto) proxima.focus();
  });
  pular.addEventListener('click', () => terminar(true));

  return {
    /** Opens on the first line; returns false (and stays closed) when the mission has no briefing. */
    abrir() {
      if (aberto || falas.length === 0) return false;
      aberto = true;
      raiz.hidden = false;
      inicio = agora();
      mostrar(0);
      proxima.focus();
      return true;
    },
    /** Called every frame: the line on screen moves on after its reading time. */
    atualizar(dt) {
      if (!aberto) return;
      restante -= dt;
      if (restante <= 0) avancar();
    },
    proxima: avancar,
    pular: () => terminar(true),
    get aberto() {
      return aberto;
    },
    /** Index of the line on screen, -1 before it opens. */
    get indice() {
      return indice;
    },
    get total() {
      return falas.length;
    },
  };
}
