// End of the match for the playtest kit: victory, defeat or "Encerrar e responder" from the menu opens a screen with
// the two questions of the milestone (fun from 1 to 5, would play again) and an optional comment; "Baixar registro"
// writes the answers into the playtest log (C15) and saves it as a JSON file, with no network. The match stays paused
// behind it.
import { EVENTO, TAMANHO_EVENTO, E_TIPO, E_ARG, PASSOS_POR_SEGUNDO } from '../sim/contratos.js';

/** File name of the saved log: registro-rts-2026-10-31-1530.json, local time. */
export function nomeDoArquivo(data = new Date()) {
  const dois = n => String(n).padStart(2, '0');
  return `registro-rts-${data.getFullYear()}-${dois(data.getMonth() + 1)}-${dois(data.getDate())}-${dois(data.getHours())}${dois(data.getMinutes())}.json`;
}

/** Answers of the form, or null for questions left blank. */
export function lerRespostas(formulario) {
  const dados = new FormData(formulario);
  const diversao = Number(dados.get('diversao'));
  const jogaria = dados.get('jogaria');
  return {
    diversao: diversao >= 1 && diversao <= 5 ? diversao : null,
    jogariaDeNovo: jogaria === 'sim' ? true : jogaria === 'nao' ? false : null,
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

export function criarFim({ raiz, texto, simulacao, estado, obterRegistro, aoAbrir = () => {} }) {
  const formulario = raiz.querySelector('form');
  const titulo = raiz.querySelector('h2');
  const tempo = raiz.querySelector('[data-fim="tempo"]');
  const situacao = raiz.querySelector('[data-fim="estado"]');
  let aberto = false;

  function abrir(resultado) {
    if (aberto) return;
    aberto = true;
    raiz.dataset.resultado = resultado;
    titulo.textContent = texto(resultado === 'vitoria' ? 'fim.vitoria' : resultado === 'derrota' ? 'fim.derrota' : 'fim.encerrada');
    tempo.textContent = texto('fim.tempo', { min: Math.max(1, Math.round(estado.tick / PASSOS_POR_SEGUNDO / 60)) });
    raiz.hidden = false;
    simulacao.pausar(true, 'fim');
    obterRegistro()?.anotar('fim', { resultado, tick: estado.tick });
    aoAbrir();
    raiz.querySelector('input')?.focus();
  }

  function baixar() {
    const registro = obterRegistro();
    if (!registro) {
      situacao.textContent = texto('fim.sem_registro');
      return;
    }
    registro.anotar('respostas', lerRespostas(formulario));
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
  raiz.querySelector('[data-fim="recomecar"]').addEventListener('click', () => location.reload());

  return {
    abrir,
    /** Checks one snapshot's events for the end of the match. */
    verificar(eventos) {
      const resultado = resultadoDosEventos(eventos, estado.jogadorLocal);
      if (resultado) abrir(resultado);
    },
    get aberto() {
      return aberto;
    },
  };
}
