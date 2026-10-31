// Play-test log of the RTS (contract C15): an in-memory list of what the pace criteria need, filled on the page from
// the commands the player sends and from the snapshots and presentation events the worker posts, never touching the
// simulation. The player exports it as JSON with a copy button; nothing goes to the network.
// The pace checker reads `resumo`; the raw `eventos` let it recount with other rules.

import { EVENTO, TAMANHO_EVENTO, E_TIPO, E_TICK, E_ENTIDADE, E_ALVO, E_X, E_Y, E_ALVO_X, E_ALVO_Y, E_ARG, PASSOS_POR_SEGUNDO, BITS_SLOT, MAX_JOGADORES, FP, ITEM_PESQUISA } from '../sim/contratos.js';
import { rotulosDaMissao } from '../sim/gatilhos.js';

export const VERSAO_REGISTRO = 1;
/** Window for the "no command" ratio: 15 s of game time, the same as the pace checker's. */
export const JANELA_PASSOS = 15 * PASSOS_POR_SEGUNDO;
// A shot joins an open fight whose centre is within this distance and which saw a shot in the last LUTA_PAUSA ticks.
const LUTA_RAIO = 10 * FP;
const LUTA_PAUSA = 5 * PASSOS_POR_SEGUNDO;
const MASCARA_SLOT = (1 << BITS_SLOT) - 1;
// the local player's units are checked against the map's areas this often, for the "entered an area" entries
const AREAS_PASSOS = PASSOS_POR_SEGUNDO >> 1;

/**
 * Labels of the mission in the order AVISO_ATAQUE and ONDA count them: the trigger evaluator's own list
 * (rotulosDaMissao), with the unions' members first, then every group the triggers name, then the computer teams'.
 */
export function nomesDosGrupos(missao) {
  return missao && typeof missao === 'object' ? rotulosDaMissao(missao) : [];
}

/**
 * @param {object} opcoes
 * @param {string} opcoes.missao        mission id
 * @param {number} [opcoes.jogadorLocal]
 * @param {string} [opcoes.dificuldade]
 * @param {{ unidades: object[], predios: object[] }} [opcoes.dados] C5 lists; kinds are indexed units first, then buildings
 * @param {object[]} [opcoes.tipos]    kind descriptors in index order ({ nome, coletor }), when the motor indexes otherwise
 * @param {object} [opcoes.mapa]       entidades.json of the map, to count piles per node
 * @param {object} [opcoes.missaoDados] the mission file, to name the groups of the warnings
 * @param {object} [opcoes.versoes]    contract versions to stamp (simulacao, comandos, unidades, predios, armas, economia, missao)
 * @param {string} [opcoes.commit]
 * @param {() => string} [opcoes.agora] wall clock, informative only
 * @param {{ AVISO_ATAQUE?: number, ONDA?: number }} [opcoes.codigos] codes of the mission warning events while the
 *   C3 enum does not carry them yet
 */
export function criarRegistro({ missao, jogadorLocal = 0, dificuldade = 'normal', dados, tipos, mapa, missaoDados, versoes = {}, commit = null, agora = () => new Date().toISOString(), codigos = {} }) {
  const AVISO_ATAQUE = EVENTO.AVISO_ATAQUE ?? codigos.AVISO_ATAQUE ?? -1;
  const ONDA = EVENTO.ONDA ?? codigos.ONDA ?? -1;
  const listaTipos = tipos ?? [...(dados?.unidades ?? []), ...(dados?.predios ?? [])];
  const nomeTipo = tipo => listaTipos[tipo]?.nome ?? `tipo-${tipo}`;
  const ehColetor = tipo => listaTipos[tipo]?.coletor === 1;
  const nos = mapa?.nos ?? [];
  const pilhasPorNo = nos.map((_, k) => (mapa.entidades ?? []).filter(e => e.tipo === 'pilha' && e.no === k).length);
  const esgotadasPorNo = nos.map(() => 0);
  const grupos = nomesDosGrupos(missaoDados);

  // last known owner, kind and id of every slot, so events about entities that just died still resolve
  const donoPorSlot = new Int16Array(1 << BITS_SLOT).fill(-1);
  const tipoPorSlot = new Int32Array(1 << BITS_SLOT).fill(-1);
  const idPorSlot = new Int32Array(1 << BITS_SLOT);
  const veteraniaPorSlot = new Uint8Array(1 << BITS_SLOT);
  // the map's named areas (rectangles in cells), and the ones the local player already entered
  const areas = Object.entries(mapa?.areas ?? {});
  const areasVisitadas = new Set();
  let proximaConferenciaDeAreas = 0;

  const eventos = [];
  const comandos = [];
  const lutasAbertas = [];
  const lutas = [];
  const ataques = new Map();
  const idsDaOnda = new Map();
  const cemiteriosEsgotados = [];
  let passo = 0;
  let primeiroTiroPasso = null;
  let coletoresPerdidos = 0;
  let resultado = null;
  let respostas = null;
  let proximaLuta = 1;
  const criadoEm = agora();

  // Free-form entries from the page (pause, speed, hidden tab, hints, latency, the end screen answers); `tick` is
  // accepted as an alias of `passo`.
  const anotar = (tipo, campos = {}) => {
    const { tick, ...resto } = campos;
    const registro = { ...resto, passo: campos.passo ?? tick ?? passo, tipo };
    eventos.push(registro);
    if (tipo === 'fim' && campos.resultado) resultado ??= campos.resultado;
    if (tipo === 'respostas') respostas = resto;
    return registro;
  };

  const donoDe = id => (id > 0 && idPorSlot[id & MASCARA_SLOT] === id ? donoPorSlot[id & MASCARA_SLOT] : -1);
  const inimigos = (a, b) => a >= 0 && b >= 0 && a < MAX_JOGADORES && b < MAX_JOGADORES && a !== b;

  function fecharLuta(luta) {
    const lados = {};
    for (const [dono, ids] of luta.lados) lados[dono] = { unidades: ids.size, mortes: luta.mortes.get(dono) ?? 0 };
    const resumo = { luta: luta.id, inicioPasso: luta.inicio, fimPasso: luta.ultimo, duracaoPassos: luta.ultimo - luta.inicio, x: Math.trunc(luta.sx / luta.n / FP), y: Math.trunc(luta.sy / luta.n / FP), lados };
    lutas.push(resumo);
    anotar('lutaFim', { passo: luta.ultimo, luta: luta.id, duracaoPassos: resumo.duracaoPassos, x: resumo.x, y: resumo.y, lados });
  }

  function fecharLutasParadas(agoraPasso) {
    for (let i = lutasAbertas.length - 1; i >= 0; i--) {
      if (agoraPasso - lutasAbertas[i].ultimo > LUTA_PAUSA) fecharLuta(lutasAbertas.splice(i, 1)[0]);
    }
  }

  function tiro(t, atirador, alvo, x, y, ax, ay) {
    const da = donoDe(atirador);
    const db = donoDe(alvo);
    if (!inimigos(da, db)) return;
    if (primeiroTiroPasso === null) {
      primeiroTiroPasso = t;
      anotar('tiro', { passo: t, primeiro: 1, atirador: da, alvo: db, x: Math.trunc(x / FP), y: Math.trunc(y / FP) });
    }
    for (const [grupo, ids] of idsDaOnda) {
      const ataque = ataques.get(grupo);
      if (ataque.primeiroTiroPasso === null && (ids.has(atirador) || ids.has(alvo))) ataque.primeiroTiroPasso = t;
    }
    const mx = (x + ax) >> 1;
    const my = (y + ay) >> 1;
    let escolhida = null;
    let melhor = LUTA_RAIO * LUTA_RAIO;
    for (const luta of lutasAbertas) {
      const dx = luta.sx / luta.n - mx;
      const dy = luta.sy / luta.n - my;
      const d2 = dx * dx + dy * dy;
      if (d2 <= melhor) {
        melhor = d2;
        escolhida = luta;
      }
    }
    if (!escolhida) {
      escolhida = { id: proximaLuta++, inicio: t, ultimo: t, sx: 0, sy: 0, n: 0, lados: new Map(), mortes: new Map() };
      lutasAbertas.push(escolhida);
      anotar('lutaInicio', { passo: t, luta: escolhida.id, x: Math.trunc(mx / FP), y: Math.trunc(my / FP) });
      anotar('tiro', { passo: t, luta: escolhida.id, atirador: da, alvo: db, x: Math.trunc(x / FP), y: Math.trunc(y / FP) });
    }
    escolhida.ultimo = t;
    escolhida.sx += mx;
    escolhida.sy += my;
    escolhida.n++;
    for (const [id, dono] of [[atirador, da], [alvo, db]]) {
      if (!escolhida.lados.has(dono)) escolhida.lados.set(dono, new Set());
      escolhida.lados.get(dono).add(id);
    }
  }

  function morte(t, id, tipo, x, y) {
    const dono = donoDe(id);
    const coletor = ehColetor(tipo) ? 1 : 0;
    anotar('morte', { passo: t, tipoUnidade: nomeTipo(tipo), dono, coletor, x: Math.trunc(x / FP), y: Math.trunc(y / FP) });
    if (coletor && dono === jogadorLocal) coletoresPerdidos++;
    for (const luta of lutasAbertas) {
      if (luta.lados.get(dono)?.has(id)) luta.mortes.set(dono, (luta.mortes.get(dono) ?? 0) + 1);
    }
  }

  function recursoEsgotado(t, indiceNo) {
    if (indiceNo < 0 || indiceNo >= nos.length) return;
    esgotadasPorNo[indiceNo]++;
    if (esgotadasPorNo[indiceNo] !== pilhasPorNo[indiceNo]) return;
    cemiteriosEsgotados.push({ no: nos[indiceNo].id, passo: t });
    anotar('noEsgotado', { passo: t, no: nos[indiceNo].id });
  }

  const ataqueDe = indice => {
    const grupo = grupos[indice] ?? `grupo-${indice}`;
    if (!ataques.has(grupo)) ataques.set(grupo, { grupo, avisoPasso: null, ondaPasso: null, unidades: 0, avisoSegundos: null, primeiroTiroPasso: null });
    return ataques.get(grupo);
  };

  // kind name and veterancy of a live entity the log has seen, by id
  const conhecido = id => Number.isInteger(id) && id > 0 && idPorSlot[id & MASCARA_SLOT] === id;
  const tipoDoId = id => (conhecido(id) ? nomeTipo(tipoPorSlot[id & MASCARA_SLOT]) : null);
  const veteraniaDoId = id => (conhecido(id) ? veteraniaPorSlot[id & MASCARA_SLOT] : 0);

  /**
   * Records an order the local player sent; the worker runs it on the next tick. Besides the kind, the count and the
   * queue flag, it keeps the argument (an ability's code), the target's kind and veterancy, and the highest veterancy
   * among the units, so a lesson can ask for "a harvester sent to a spark" or "a veteran pulled back".
   */
  function anotarComando(comando, origem = 'mouse') {
    const t = passo + 1;
    comandos.push(t);
    const registro = { passo: t, comando: comando.tipo, n: comando.unidades?.length ?? 0, fila: comando.fila ?? 0, origem };
    if (Number.isInteger(comando.arg)) registro.arg = comando.arg;
    const alvoTipo = tipoDoId(comando.alvo);
    if (alvoTipo) {
      registro.alvoTipo = alvoTipo;
      registro.alvoVeterania = veteraniaDoId(comando.alvo);
    }
    registro.veterania = (comando.unidades ?? []).reduce((maior, id) => Math.max(maior, veteraniaDoId(id)), 0);
    anotar('comando', registro);
  }

  // first entry of a local unit or building into each named area of the map ("took the gorge", "reached the Hill")
  function conferirAreas(retrato) {
    if (areas.length === 0 || !retrato.x || !retrato.y || retrato.tick < proximaConferenciaDeAreas) return;
    proximaConferenciaDeAreas = retrato.tick + AREAS_PASSOS;
    for (let k = 0; k < retrato.n; k++) {
      if (retrato.dono[k] !== jogadorLocal) continue;
      const cx = Math.trunc(retrato.x[k] / FP);
      const cy = Math.trunc(retrato.y[k] / FP);
      for (const [nome, a] of areas) {
        if (areasVisitadas.has(nome) || cx < a.x || cy < a.y || cx >= a.x + a.largura || cy >= a.y + a.altura) continue;
        areasVisitadas.add(nome);
        anotar('area', { passo: retrato.tick, area: nome, tipoUnidade: nomeTipo(retrato.tipo[k]) });
      }
    }
  }

  /** Reads one snapshot (C2) and its events (C3). */
  function anotarRetrato(retrato) {
    passo = Math.max(passo, retrato.tick);
    for (let k = 0; k < retrato.n; k++) {
      const id = retrato.id[k];
      const slot = id & MASCARA_SLOT;
      idPorSlot[slot] = id;
      donoPorSlot[slot] = retrato.dono[k];
      tipoPorSlot[slot] = retrato.tipo[k];
      veteraniaPorSlot[slot] = retrato.veterania?.[k] ?? 0;
    }
    const ev = retrato.eventos;
    const surgidos = [];
    for (let o = 0; o + TAMANHO_EVENTO <= (ev?.length ?? 0); o += TAMANHO_EVENTO) {
      const tipo = ev[o + E_TIPO];
      const t = ev[o + E_TICK];
      fecharLutasParadas(t);
      if (tipo === EVENTO.TIRO) tiro(t, ev[o + E_ENTIDADE], ev[o + E_ALVO], ev[o + E_X], ev[o + E_Y], ev[o + E_ALVO_X], ev[o + E_ALVO_Y]);
      else if (tipo === EVENTO.MORTE) morte(t, ev[o + E_ENTIDADE], ev[o + E_ARG], ev[o + E_X], ev[o + E_Y]);
      else if (tipo === EVENTO.RECURSO_ESGOTADO) recursoEsgotado(t, ev[o + E_ARG]);
      else if (tipo === EVENTO.SURGIMENTO) surgidos.push([t, ev[o + E_ENTIDADE]]);
      else if (tipo === EVENTO.CONSTRUCAO_CONCLUIDA && donoDe(ev[o + E_ENTIDADE]) === jogadorLocal) {
        anotar('construcao', { passo: t, tipoUnidade: nomeTipo(ev[o + E_ARG]), x: Math.trunc(ev[o + E_X] / FP), y: Math.trunc(ev[o + E_Y] / FP) });
      } else if (tipo === EVENTO.PRODUCAO_CONCLUIDA && ev[o + E_ARG] < ITEM_PESQUISA && donoDe(ev[o + E_ENTIDADE]) === jogadorLocal) {
        anotar('producao', { passo: t, tipoUnidade: nomeTipo(ev[o + E_ARG]) });
      } else if (tipo === EVENTO.RELIGADO && donoDe(ev[o + E_ENTIDADE]) === jogadorLocal) {
        // the structure is the local player's now; alvo is the unit that did it
        anotar('religado', { passo: t, tipoUnidade: nomeTipo(tipoPorSlot[ev[o + E_ENTIDADE] & MASCARA_SLOT]), por: tipoDoId(ev[o + E_ALVO]) });
      } else if (tipo === EVENTO.PROMOCAO && donoDe(ev[o + E_ENTIDADE]) === jogadorLocal) {
        anotar('promocao', { passo: t, tipoUnidade: tipoDoId(ev[o + E_ENTIDADE]), nivel: ev[o + E_ARG] });
      }
      else if (tipo === AVISO_ATAQUE) {
        const ataque = ataqueDe(ev[o + E_ARG]);
        ataque.avisoPasso ??= t;
        anotar('aviso', { passo: t, grupo: ataque.grupo, x: Math.trunc(ev[o + E_X] / FP), y: Math.trunc(ev[o + E_Y] / FP) });
      } else if (tipo === ONDA) {
        const ataque = ataqueDe(ev[o + E_ARG]);
        ataque.ondaPasso = t;
        const ids = new Set(surgidos.filter(([ts, id]) => ts === t && inimigos(donoDe(id), jogadorLocal)).map(([, id]) => id));
        // units of the wave may be reported after the wave event in the same tick
        for (let p = o + TAMANHO_EVENTO; p + TAMANHO_EVENTO <= ev.length; p += TAMANHO_EVENTO) {
          if (ev[p + E_TIPO] === EVENTO.SURGIMENTO && ev[p + E_TICK] === t && inimigos(donoDe(ev[p + E_ENTIDADE]), jogadorLocal)) ids.add(ev[p + E_ENTIDADE]);
        }
        // a team that forms the wave from units already on the map reports their number in alvo, with no SURGIMENTO
        ataque.unidades = ev[o + E_ALVO] > 0 ? ev[o + E_ALVO] : ids.size;
        idsDaOnda.set(ataque.grupo, ids);
        if (ataque.avisoPasso !== null) ataque.avisoSegundos = Math.trunc((t - ataque.avisoPasso) / PASSOS_POR_SEGUNDO);
        anotar('onda', { passo: t, grupo: ataque.grupo, unidades: ataque.unidades });
      } else if (tipo === EVENTO.VITORIA || tipo === EVENTO.DERROTA) {
        // arg is the player who won (VITORIA) or lost (DERROTA)
        const local = ev[o + E_ARG] === jogadorLocal;
        anotar('fim', { passo: t, resultado: (tipo === EVENTO.VITORIA) === local ? 'vitoria' : 'derrota' });
      }
    }
    fecharLutasParadas(passo);
    conferirAreas(retrato);
  }

  function janelas() {
    const total = Math.trunc(passo / JANELA_PASSOS);
    const comComando = new Uint8Array(total);
    for (const t of comandos) {
      const k = Math.trunc(t / JANELA_PASSOS);
      if (k < total) comComando[k] = 1;
    }
    const semComando = total - comComando.reduce((a, b) => a + b, 0);
    return { total, semComando, porcentoSemComando: total ? Math.round((semComando * 1000) / total) / 10 : 0 };
  }

  // the pace target counts battery yards ("cemiterio-*" nodes) when the map names them so; a map whose starter rubble
  // or scrap runs dry first (the first mission) keeps that in cemiteriosEsgotados
  const temCemiterios = nos.some(no => no.id?.startsWith('cemiterio'));
  const primeiroCemiterio = () => (temCemiterios ? cemiteriosEsgotados.find(c => c.no.startsWith('cemiterio')) : cemiteriosEsgotados[0]);

  /** The whole log as a plain object; open fights are closed at their last shot. */
  function exportar() {
    while (lutasAbertas.length) fecharLuta(lutasAbertas.shift());
    const listaAtaques = [...ataques.values()];
    return {
      versao: VERSAO_REGISTRO,
      tipo: 'registro-rts',
      missao,
      mapa: missaoDados?.mapa ?? null,
      dificuldade,
      jogadorLocal,
      passosPorSegundo: PASSOS_POR_SEGUNDO,
      versoes,
      commit,
      criadoEm,
      duracaoPassos: passo,
      resultado,
      respostas,
      janelaPassos: JANELA_PASSOS,
      resumo: {
        primeiroTiroPasso,
        lutas: [...lutas].sort((a, b) => a.inicioPasso - b.inicioPasso || a.luta - b.luta),
        janelas: janelas(),
        cemiteriosEsgotados: [...cemiteriosEsgotados],
        primeiroCemiterioEsgotadoPasso: primeiroCemiterio()?.passo ?? null,
        coletoresPerdidos,
        ataques: listaAtaques,
      },
      eventos: [...eventos].sort((a, b) => a.passo - b.passo),
    };
  }

  const exportarTexto = () => JSON.stringify(exportar());

  /** Copies the JSON to the clipboard; resolves false when the browser refuses, so the page can show the text. */
  async function copiar() {
    const texto = exportarTexto();
    try {
      await globalThis.navigator.clipboard.writeText(texto);
      return true;
    } catch (erro) {
      console.warn('registro: a área de transferência recusou', erro);
      return false;
    }
  }

  return { anotarComando, anotarRetrato, anotar, exportar, exportarTexto, copiar };
}
