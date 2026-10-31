// Pacing checker for stage E3: reads the play-test log exported by the game (contract C15, owned by the design front:
// { versao, tipo: 'registro-rts', jogadorLocal, passosPorSegundo, duracaoPassos, resultado, eventos: [{ passo, tipo, ... }] })
// and computes, for each pacing criterion, the number and whether it passed. It recomputes everything from the events
// instead of trusting the log's own "resumo", so the two can be compared. Pure functions, no I/O; the command line is
// conferir-ritmo.mjs. Times come from simulation ticks, so paused time and hidden-tab time never count.

export const VERSOES_ACEITAS = Object.freeze([1]);
const PASSOS_POR_SEGUNDO_PADRAO = 30;
/** Window length for "windows without a command" (design synthesis, pillar P2). */
export const JANELA_SEGUNDOS = 15;
/** Units per side that count as a 10 against 10 fight. */
export const LUTA_MIN = 8;
export const LUTA_MAX = 12;

/** E3 targets (plan, stage E3), in seconds or counts. */
export const METAS = Object.freeze({
  duracao: { min: 15 * 60, max: 25 * 60 },
  primeiroTiro: { min: 150, max: 240 },
  luta10contra10: { min: 8, max: 20 },
  janelasSemComando: { maxExclusivo: 0.2 },
  primeiroCemiterio: { min: 10 * 60, max: 13 * 60 },
  coletoresPerdidos: { min: 1, max: 4 },
  diversao: { min: 4, max: 5 },
});

/** Results that count as a defined end; a match the player closed from the menu ("encerrada") does not. */
export const RESULTADOS_DE_FIM = Object.freeze(['vitoria', 'derrota']);

/** Seconds of warning every attack of 6 or more units needs (stage E4, checked here too because the sandbox has waves). */
export const AVISO_MINIMO_SEGUNDOS = 10;
export const ONDA_COM_AVISO = 6;

// Event names of C15 version 1.
const NOMES = Object.freeze({
  tiro: ['tiro'],
  lutaInicio: ['lutaInicio'],
  lutaFim: ['lutaFim'],
  comando: ['comando'],
  noEsgotado: ['noEsgotado'],
  morte: ['morte'],
  aviso: ['aviso'],
  onda: ['onda'],
  fim: ['fim'],
});
const eh = (evento, chave) => NOMES[chave].includes(evento.tipo);
const passoDe = evento => evento.passo ?? evento.tick;

/** Checks the shape and returns a list of problems; an empty list means the log can be read. */
export function validarRegistro(registro) {
  const problemas = [];
  if (!registro || typeof registro !== 'object') return ['o registro não é um objeto JSON'];
  if (registro.tipo !== undefined && registro.tipo !== 'registro-rts') problemas.push(`tipo "${registro.tipo}" não é um registro do RTS`);
  if (!VERSOES_ACEITAS.includes(registro.versao)) problemas.push(`versão ${registro.versao} desconhecida (aceitas: ${VERSOES_ACEITAS.join(', ')})`);
  if (!Array.isArray(registro.eventos)) problemas.push('falta a lista "eventos"');
  else {
    let anterior = -1;
    registro.eventos.forEach((evento, k) => {
      const passo = evento ? passoDe(evento) : undefined;
      if (!evento || typeof evento.tipo !== 'string') problemas.push(`evento ${k} sem "tipo"`);
      else if (!Number.isInteger(passo) || passo < 0) problemas.push(`evento ${k} (${evento.tipo}) sem "passo" inteiro`);
      else if (passo < anterior) problemas.push(`evento ${k} (${evento.tipo}) fora de ordem: passo ${passo} depois de ${anterior}`);
      else anterior = passo;
    });
  }
  return problemas;
}

const segundosDe = (ticks, pps) => ticks / pps;
const dentro = (valor, { min, max }) => valor >= min && valor <= max;

/** Median of a list of numbers, or null when empty. */
export function mediana(valores) {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = ordenados.length >> 1;
  return ordenados.length % 2 ? ordenados[meio] : (ordenados[meio - 1] + ordenados[meio]) / 2;
}

/** Last tick of the match: the end event, else the declared length, else the last event. */
function tickFinal(registro) {
  const fim = registro.eventos.find(evento => eh(evento, 'fim'));
  if (fim) return passoDe(fim);
  if (Number.isInteger(registro.duracaoPassos)) return registro.duracaoPassos;
  const ultimo = registro.eventos.at(-1);
  return ultimo ? passoDe(ultimo) : 0;
}

function resultadoDe(registro) {
  const fim = registro.eventos.find(evento => eh(evento, 'fim'));
  return fim?.resultado ?? registro.resultado ?? null;
}

/** Seconds from the start to the first shot between enemies. */
function primeiroTiro(registro, pps) {
  const tiro = registro.eventos.find(evento => eh(evento, 'tiro'));
  return tiro ? segundosDe(passoDe(tiro), pps) : null;
}

/** Units of each side of a fight, from { "0": { unidades }, "1": { unidades } } (or a list of sides). */
function contagensDosLados(lados) {
  const lista = Array.isArray(lados) ? lados : Object.values(lados ?? {});
  return lista.map(lado => (Array.isArray(lado?.unidades) ? lado.unidades.length : lado?.unidades ?? 0));
}

/**
 * Fights whose two sides each had LUTA_MIN..LUTA_MAX units, counted at the end (the units that shot or were shot);
 * the duration is the end's duracaoPassos (first to last shot), else end minus start.
 */
function lutas10contra10(registro, pps) {
  const inicios = new Map();
  const duracoes = [];
  for (const evento of registro.eventos) {
    if (eh(evento, 'lutaInicio')) inicios.set(evento.luta, passoDe(evento));
    else if (eh(evento, 'lutaFim')) {
      const contagens = contagensDosLados(evento.lados);
      const passos = evento.duracaoPassos ?? passoDe(evento) - (inicios.get(evento.luta) ?? passoDe(evento));
      if (contagens.length === 2 && contagens.every(n => n >= LUTA_MIN && n <= LUTA_MAX)) duracoes.push(segundosDe(passos, pps));
    }
  }
  return duracoes;
}

/** Share of complete JANELA_SEGUNDOS windows in which the local player gave no command. */
function janelasSemComando(registro, pps, final) {
  const tamanho = JANELA_SEGUNDOS * pps;
  const total = Math.floor(final / tamanho);
  if (total === 0) return { total: 0, vazias: 0, fracao: null };
  const comJogador = new Set();
  const local = registro.jogadorLocal ?? 0;
  for (const evento of registro.eventos) {
    if (!eh(evento, 'comando') || (evento.jogador ?? local) !== local) continue;
    const janela = Math.floor(passoDe(evento) / tamanho);
    if (janela < total) comJogador.add(janela);
  }
  const vazias = total - comJogador.size;
  return { total, vazias, fracao: vazias / total };
}

/** Seconds to the first depleted battery graveyard (every pile of the node ran out). */
function primeiroCemiterio(registro, pps) {
  const evento = registro.eventos.find(e => eh(e, 'noEsgotado'));
  return evento ? segundosDe(passoDe(evento), pps) : null;
}

/** Collectors of the local player that died. */
function coletoresPerdidos(registro) {
  const local = registro.jogadorLocal ?? 0;
  return registro.eventos.filter(e => eh(e, 'morte') && e.dono === local && (e.coletor === 1 || e.coletor === true)).length;
}

/** Waves of ONDA_COM_AVISO or more units and the seconds between their warning (same "grupo") and the wave. */
function avisosDeAtaque(registro, pps) {
  const avisos = new Map();
  const ondas = [];
  for (const evento of registro.eventos) {
    if (eh(evento, 'aviso') && !avisos.has(evento.grupo)) avisos.set(evento.grupo, passoDe(evento));
    else if (eh(evento, 'onda') && (Array.isArray(evento.unidades) ? evento.unidades.length : evento.unidades ?? 0) >= ONDA_COM_AVISO) {
      const aviso = avisos.get(evento.grupo);
      ondas.push(aviso === undefined ? null : segundosDe(passoDe(evento) - aviso, pps));
    }
  }
  return ondas;
}

/** The player's own answers from the end screen (C15 "respostas"), when the log has them. */
function respostaDiversao(respostas) {
  const valor = Number.isInteger(respostas?.diversao) && respostas.diversao >= 1 && respostas.diversao <= 5 ? respostas.diversao : null;
  return { id: 'diversao', nome: 'Diversão', meta: 'mediana de pelo menos 4 em 5', valor, texto: valor === null ? 'sem resposta' : `${valor} de 5`, passou: valor === null ? null : valor >= METAS.diversao.min };
}

function respostaJogariaDeNovo(respostas) {
  const valor = typeof respostas?.jogariaDeNovo === 'boolean' ? (respostas.jogariaDeNovo ? 1 : 0) : null;
  return { id: 'jogariaDeNovo', nome: 'Jogaria de novo?', meta: 'sim de todos', valor, texto: valor === null ? 'sem resposta' : valor ? 'sim' : 'não', passou: valor === null ? null : valor === 1 };
}

const relogio = segundos => `${Math.floor(segundos / 60)}:${String(Math.floor(segundos % 60)).padStart(2, '0')}`;

/**
 * Every E3 pacing number of one log.
 * @returns {{ valido: boolean, problemas: string[], criterios: {id: string, nome: string, meta: string, valor: number|null, texto: string, passou: boolean|null}[] }}
 *   passou is null when the log has no data for that criterion
 */
export function conferirRegistro(registro) {
  const problemas = validarRegistro(registro);
  if (problemas.length > 0) return { valido: false, problemas, criterios: [] };
  const pps = registro.passosPorSegundo ?? PASSOS_POR_SEGUNDO_PADRAO;
  const final = tickFinal(registro);
  const duracao = segundosDe(final, pps);
  const tiro = primeiroTiro(registro, pps);
  const lutas = lutas10contra10(registro, pps);
  const lutaMediana = mediana(lutas);
  const janelas = janelasSemComando(registro, pps, final);
  const cemiterio = primeiroCemiterio(registro, pps);
  const coletores = coletoresPerdidos(registro);
  const resultado = resultadoDe(registro);
  const avisos = avisosDeAtaque(registro, pps);
  const piorAviso = avisos.length === 0 ? null : avisos.includes(null) ? -1 : Math.min(...avisos);

  const criterios = [
    { id: 'duracao', nome: 'Duração da partida', meta: '15:00 a 25:00, com fim definido', valor: duracao, texto: `${relogio(duracao)}${resultado ? `, ${resultado}` : ', sem fim registrado'}`, passou: dentro(duracao, METAS.duracao) && RESULTADOS_DE_FIM.includes(resultado) },
    { id: 'primeiroTiro', nome: 'Primeiro tiro', meta: '2:30 a 4:00', valor: tiro, texto: tiro === null ? 'nenhum tiro no registro' : relogio(tiro), passou: tiro === null ? null : dentro(tiro, METAS.primeiroTiro) },
    { id: 'luta10contra10', nome: '10 contra 10', meta: '8 a 20 s (mediana)', valor: lutaMediana, texto: lutaMediana === null ? `nenhuma luta com ${LUTA_MIN} a ${LUTA_MAX} de cada lado` : `${lutaMediana.toFixed(1)} s (${lutas.length} luta${lutas.length > 1 ? 's' : ''})`, passou: lutaMediana === null ? null : dentro(lutaMediana, METAS.luta10contra10) },
    { id: 'janelasSemComando', nome: 'Janelas sem comando', meta: `menos de 20% das janelas de ${JANELA_SEGUNDOS} s`, valor: janelas.fracao, texto: janelas.fracao === null ? 'partida curta demais' : `${(janelas.fracao * 100).toFixed(1)}% (${janelas.vazias} de ${janelas.total})`, passou: janelas.fracao === null ? null : janelas.fracao < METAS.janelasSemComando.maxExclusivo },
    { id: 'primeiroCemiterio', nome: 'Primeiro cemitério esgotado', meta: '10:00 a 13:00', valor: cemiterio, texto: cemiterio === null ? 'nenhum cemitério esgotou' : relogio(cemiterio), passou: cemiterio === null ? (duracao >= METAS.primeiroCemiterio.max ? false : null) : dentro(cemiterio, METAS.primeiroCemiterio) },
    { id: 'coletoresPerdidos', nome: 'Coletores perdidos', meta: '1 a 4', valor: coletores, texto: String(coletores), passou: dentro(coletores, METAS.coletoresPerdidos) },
    respostaDiversao(registro.respostas),
    respostaJogariaDeNovo(registro.respostas),
    { id: 'avisoDeAtaque', nome: 'Aviso de ataque (E4)', meta: `toda onda de ${ONDA_COM_AVISO} ou mais com ${AVISO_MINIMO_SEGUNDOS} s de aviso`, valor: piorAviso, texto: piorAviso === null ? `nenhuma onda de ${ONDA_COM_AVISO} ou mais` : piorAviso < 0 ? 'onda sem aviso' : `pior aviso ${piorAviso.toFixed(1)} s em ${avisos.length} onda${avisos.length > 1 ? 's' : ''}`, passou: piorAviso === null ? null : piorAviso >= AVISO_MINIMO_SEGUNDOS },
  ];
  return { valido: true, problemas: [], criterios };
}

/**
 * Several logs (one per person): each one's numbers and, per criterion, the median and whether it passes.
 * A criterion passes on the median of the logs that have data for it.
 */
export function conferirVarios(registros) {
  const individuais = registros.map(conferirRegistro);
  const validos = individuais.filter(r => r.valido);
  const ids = validos[0]?.criterios.map(c => c.id) ?? [];
  const resumo = ids.map(id => {
    const deste = validos.map(r => r.criterios.find(c => c.id === id));
    const comDado = deste.filter(c => c.valor !== null);
    // the attack warning is about the worst wave of any match, the rest about the typical match
    const valor = id === 'avisoDeAtaque' ? (comDado.length ? Math.min(...comDado.map(c => c.valor)) : null) : mediana(comDado.map(c => c.valor));
    const modelo = deste[0];
    // without data, a criterion fails only when some log already failed it (a long match with no graveyard depleted)
    let passou = deste.some(c => c.passou === false) && comDado.length === 0 ? false : null;
    if (comDado.length > 0) {
      if (id === 'duracao' || id === 'avisoDeAtaque' || id === 'jogariaDeNovo') passou = deste.every(c => c.passou !== false);
      else if (id === 'janelasSemComando') passou = valor < METAS.janelasSemComando.maxExclusivo;
      else passou = dentro(valor, METAS[id]);
    }
    return { id, nome: modelo.nome, meta: modelo.meta, valor, comDado: comDado.length, total: deste.length, passou };
  });
  return { individuais, resumo };
}

export { relogio };
