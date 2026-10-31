// Countdown of a structure being re-powered (the substation of the climax), at the top of the screen: the snapshot
// gives how far each neutral structure got (Retrato.progresso, 0..254, 255 when nobody is at it), and the mission the
// time it set for that structure in this difficulty (its religavel action), so the page shows the seconds left, and
// says the countdown stopped when the progress has not moved for a moment (the re-powering unit walked away).
import { DONO_NEUTRO, PASSOS_POR_SEGUNDO } from '../sim/contratos.js';

/** Retrato.progresso of a structure nobody is re-powering. */
const NINGUEM = 255;
/** Ticks without progress after which the countdown reads as stopped. */
export const PARADA_APOS_PASSOS = Math.round(1.5 * PASSOS_POR_SEGUNDO);
/** Structures shown at once. */
const MAXIMO = 2;

/**
 * Seconds to re-power each structure kind in this difficulty: the mission's religavel actions on the map's labels,
 * else the kind's tempoReligarMs in the C5 building list.
 * @param {object | null | undefined} missao C7
 * @param {{entidades?: {tipo: string, etiqueta?: string}[]} | null | undefined} entidadesDoMapa C6 entidades.json
 * @param {string} dificuldade facil | normal | dificil
 * @param {{nome: string, tempoReligarMs?: number}[]} [prediosDoC5]
 * @returns {Map<string, number>}
 */
export function temposDeReligar(missao, entidadesDoMapa, dificuldade, prediosDoC5 = []) {
  const tempos = new Map();
  for (const predio of prediosDoC5) if (predio.tempoReligarMs > 0) tempos.set(predio.nome, predio.tempoReligarMs / 1000);
  const porGrupo = new Map();
  for (const gatilho of missao?.gatilhos ?? []) {
    for (const acao of gatilho.acoes ?? gatilho.faz ?? []) {
      if (acao?.faz !== 'religavel' || !acao.grupo || acao.segundos === undefined) continue;
      const segundos = typeof acao.segundos === 'number' ? acao.segundos : acao.segundos[dificuldade];
      if (Number.isFinite(segundos)) porGrupo.set(acao.grupo, segundos);
    }
  }
  for (const entidade of entidadesDoMapa?.entidades ?? []) if (entidade.etiqueta && porGrupo.has(entidade.etiqueta)) tempos.set(entidade.tipo, porGrupo.get(entidade.etiqueta));
  return tempos;
}

/** Seconds left of a re-powering `progresso` (0..254) of a `total`-second job, rounded up. */
export function segundosRestantes(progresso, total) {
  return Math.max(0, Math.ceil(total * (1 - progresso / NINGUEM)));
}

/**
 * @param {object} opcoes
 * @param {HTMLElement} opcoes.raiz the countdown box (#contagem)
 * @param {(id: string, valores?: object) => string} opcoes.texto
 * @param {() => ReturnType<typeof import('./catalogo.js').criarCatalogo>} opcoes.catalogo
 * @param {() => Map<string, number>} opcoes.tempos seconds by kind name (temposDeReligar)
 */
export function criarContagem({ raiz, texto, catalogo, tempos }) {
  // id -> { progresso, desde }: the last progress seen and the tick it last moved
  const vistos = new Map();
  let assinatura = '';

  /** Reads one snapshot; returns the structures counting down, for the tests. */
  function atualizar(retrato) {
    const cat = catalogo();
    const linhas = [];
    const vivos = new Set();
    for (let k = 0; k < retrato.n; k++) {
      if (retrato.dono[k] !== DONO_NEUTRO || retrato.progresso[k] >= NINGUEM || cat.categoria(retrato.tipo[k]) !== 'estrutura') continue;
      const id = retrato.id[k];
      const progresso = retrato.progresso[k];
      vivos.add(id);
      const antes = vistos.get(id);
      if (!antes || antes.progresso !== progresso) vistos.set(id, { progresso, desde: retrato.tick });
      const parada = retrato.tick - vistos.get(id).desde > PARADA_APOS_PASSOS;
      const total = tempos().get(cat.info(retrato.tipo[k]).id) ?? 0;
      linhas.push({ id, nome: cat.nome(retrato.tipo[k]), progresso, parada, segundos: total > 0 ? segundosRestantes(progresso, total) : null });
    }
    for (const id of vistos.keys()) if (!vivos.has(id)) vistos.delete(id);
    linhas.sort((a, b) => b.progresso - a.progresso);
    desenhar(linhas.slice(0, MAXIMO));
    return linhas;
  }

  function desenhar(linhas) {
    const nova = linhas.map(l => `${l.id}:${l.progresso}:${l.parada}:${l.segundos}`).join('|');
    if (nova === assinatura) return;
    assinatura = nova;
    raiz.hidden = linhas.length === 0;
    raiz.innerHTML = linhas
      .map(l => {
        const pct = Math.floor((l.progresso / NINGUEM) * 100);
        const frase = l.parada ? texto('hud.religacao_parada', { nome: l.nome, pct }) : l.segundos === null ? `${l.nome}: ${texto('hud.religando', { pct })}` : texto('hud.religacao', { nome: l.nome, s: l.segundos });
        return `<div class="contagem-linha" data-parada="${l.parada}"><span>${frase}</span><i class="contagem-barra"><b style="width:${pct}%"></b></i></div>`;
      })
      .join('');
  }

  return {
    atualizar,
    /** Nothing counting down (a restarted match). */
    limpar() {
      vistos.clear();
      desenhar([]);
    },
  };
}
