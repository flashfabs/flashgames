// End of the match for the playtest kit: victory, defeat or "Encerrar e responder" from the menu opens a screen with
// a short summary (time, objectives, veterans, harvesters lost), the two questions of the milestone (fun from 1 to 5,
// and "would play the next phase?" in a mission with a briefing, "would play again?" elsewhere) and an optional
// comment; "Baixar registro" writes the answers into the playtest log (C15) and saves it as a JSON file, with no
// network, and Recomeçar plays the phase again. The match stays paused behind it.
import { EVENTO, TAMANHO_EVENTO, E_TIPO, E_ARG } from '../sim/contratos.js';
import { relogio } from './hud.js';

/** File name of the saved log: registro-rts-2026-10-31-1530.json, local time. */
export function nomeDoArquivo(data = new Date()) {
  const dois = n => String(n).padStart(2, '0');
  return `registro-rts-${data.getFullYear()}-${dois(data.getMonth() + 1)}-${dois(data.getDate())}-${dois(data.getHours())}${dois(data.getMinutes())}.json`;
}

/**
 * Answers of the form, or null for questions left blank; the yes or no goes under jogariaProximaFase when the
 * screen asked about the next phase, else under jogariaDeNovo.
 */
export function lerRespostas(formulario, { proximaFase = false } = {}) {
  const dados = new FormData(formulario);
  const diversao = Number(dados.get('diversao'));
  const jogaria = dados.get('jogaria');
  const sim = jogaria === 'sim' ? true : jogaria === 'nao' ? false : null;
  return {
    diversao: diversao >= 1 && diversao <= 5 ? diversao : null,
    [proximaFase ? 'jogariaProximaFase' : 'jogariaDeNovo']: sim,
    comentario: String(dados.get('comentario') ?? '').trim(),
  };
}

/** 'vitoria' or 'derrota' when an event of this snapshot ends the match for the player, else null. */
export function resultadoDosEventos(eventos, jogador) {
  for (let o = 0; o + TAMANHO_EVENTO <= eventos.length; o += TAMANHO_EVENTO) {
    const tipo = eventos[o + E_TIPO];
    if (tipo !== EVENTO.VITORIA && tipo !== EVENTO.DERROTA) continue;
    // The mission's evaluator puts the player the result is about in arg.
    if (eventos[o + E_ARG] !== jogador) continue;
    return tipo === EVENTO.VITORIA ? 'vitoria' : 'derrota';
  }
  return null;
}

/**
 * Lines of the summary, as C11 ids with their values.
 * @param {{tick: number, objetivos?: {principais: {feitos: number, total: number}, opcionais: {feitos: number, total: number}} | null, veteranos?: number, coletoresPerdidos?: number | null}} dados
 * @returns {[string, object][]}
 */
export function linhasDoResumo({ tick, objetivos = null, veteranos = 0, coletoresPerdidos = null }) {
  const linhas = [['resultado.tempo', { tempo: relogio(tick) }]];
  if (objetivos && objetivos.principais.total + objetivos.opcionais.total > 0) {
    linhas.push(['resultado.objetivos', { feitos: objetivos.principais.feitos, total: objetivos.principais.total, opcionais: objetivos.opcionais.feitos, totalOpcionais: objetivos.opcionais.total }]);
  }
  linhas.push(['resultado.veteranos', { n: veteranos }]);
  if (coletoresPerdidos !== null) linhas.push(['resultado.coletores_perdidos', { n: coletoresPerdidos }]);
  return linhas;
}

/**
 * @param {object} opcoes
 * @param {() => {objetivos?: object | null, veteranos?: number, coletoresPerdidos?: number | null}} [opcoes.resumo] what the summary counts, read when the screen opens
 * @param {boolean} [opcoes.proximaFase] ask "jogaria a próxima fase?" instead of "jogaria de novo?"
 * @param {() => void} [opcoes.aoRecomecar] plays the phase again (the page restarts the match)
 * @param {string} [opcoes.subtitulo] the line under the title (the mission's name)
 */
export function criarFim({ raiz, texto, simulacao, estado, obterRegistro, aoAbrir = () => {}, resumo = () => ({}), proximaFase = false, aoRecomecar = () => location.reload(), subtitulo = '' }) {
  const formulario = raiz.querySelector('form');
  const titulo = raiz.querySelector('h2');
  const tempo = raiz.querySelector('[data-fim="tempo"]');
  const listaDoResumo = raiz.querySelector('[data-fim="resumo"]');
  const situacao = raiz.querySelector('[data-fim="estado"]');
  raiz.querySelector('[data-fim="pergunta-jogaria"]').textContent = texto(proximaFase ? 'fim.jogaria_proxima' : 'fim.jogaria');
  let aberto = false;
  let resultado = null;

  function abrir(qual) {
    if (aberto) return;
    aberto = true;
    resultado = qual;
    raiz.dataset.resultado = qual;
    titulo.textContent = texto(qual === 'vitoria' ? 'fim.vitoria' : qual === 'derrota' ? 'fim.derrota' : 'fim.encerrada');
    tempo.textContent = subtitulo;
    tempo.hidden = !subtitulo;
    listaDoResumo.innerHTML = '';
    for (const [id, valores] of linhasDoResumo({ tick: estado.tick, ...resumo() })) {
      const item = document.createElement('li');
      item.textContent = texto(id, valores);
      listaDoResumo.append(item);
    }
    situacao.textContent = '';
    raiz.hidden = false;
    simulacao.pausar(true, 'fim');
    obterRegistro()?.anotar('fim', { resultado: qual, tick: estado.tick });
    aoAbrir();
    raiz.querySelector('input')?.focus();
  }

  /** Closes the screen and clears the form (the phase starts again); the caller lets the match run. */
  function fechar() {
    if (!aberto) return;
    aberto = false;
    resultado = null;
    raiz.hidden = true;
    formulario.reset();
    simulacao.pausar(false, 'fim');
  }

  function baixar() {
    const registro = obterRegistro();
    if (!registro) {
      situacao.textContent = texto('fim.sem_registro');
      return;
    }
    registro.anotar('respostas', lerRespostas(formulario, { proximaFase }));
    const dados = registro.exportar();
    const json = typeof dados === 'string' ? dados : JSON.stringify(dados, null, 2);
    const arquivo = nomeDoArquivo();
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: arquivo });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    situacao.textContent = texto('fim.baixado', { arquivo });
  }

  formulario.addEventListener('submit', e => {
    e.preventDefault();
    baixar();
  });
  raiz.querySelector('[data-fim="recomecar"]').addEventListener('click', () => aoRecomecar());

  return {
    abrir,
    fechar,
    /** Checks one snapshot's events for the end of the match. */
    verificar(eventos) {
      const qual = resultadoDosEventos(eventos, estado.jogadorLocal);
      if (qual) abrir(qual);
    },
    get aberto() {
      return aberto;
    },
    /** 'vitoria', 'derrota' or 'encerrada' while the screen is open, else null. */
    get resultado() {
      return resultado;
    },
  };
}
