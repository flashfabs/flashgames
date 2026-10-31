// Alerts from the presentation events of each snapshot (C3): under attack (base, harvester, any unit), production and
// construction finished, resource exhausted and refused commands. Attacks are grouped by place and time, so a long
// fight raises one alert, not one per shot; the last alert with a place is kept for the "go to last alert" key.
// Pure: no DOM; the caller answers who owns an entity and what kind of thing a type is.
import { EVENTO, TAMANHO_EVENTO, E_TIPO, E_ENTIDADE, E_ALVO, E_X, E_Y, E_ALVO_X, E_ALVO_Y, E_ARG, FP } from '../sim/contratos.js';

export const ALERTA = Object.freeze({
  SOB_ATAQUE: 'sobAtaque',
  BASE_SOB_ATAQUE: 'baseSobAtaque',
  COLETOR_SOB_ATAQUE: 'coletorSobAtaque',
  PRODUCAO: 'producao',
  CONSTRUCAO: 'construcao',
  RECURSO_ESGOTADO: 'recursoEsgotado',
  RECUSA: 'recusa',
});

/** Kinds that mean danger: they ping the minimap and sound the alarm. */
export const ALERTAS_DE_PERIGO = new Set([ALERTA.SOB_ATAQUE, ALERTA.BASE_SOB_ATAQUE, ALERTA.COLETOR_SOB_ATAQUE]);

/** Attacks closer than this (cells) to an alert still running join it instead of raising a new one. */
export const RAIO_DO_ATAQUE = 12;
/** An attack alert stays running this long after its last hit (ms); after that the same place alerts again. */
export const SILENCIO_DO_ATAQUE_MS = 8000;

/**
 * @param {object} opcoes
 * @param {number} opcoes.jogador local player
 * @param {(id: number) => number} opcoes.donoDe owner of an entity in the latest snapshot, -1 when it is gone
 * @param {(id: number) => number} opcoes.tipoDe kind of an entity in the latest snapshot, -1 when it is gone
 * @param {(tipo: number) => string} opcoes.categoria 'predio', 'coletor', 'unidade' or 'recurso'
 */
export function criarAlertas({ jogador, donoDe, tipoDe, categoria }) {
  // running attack alerts: { x, y, ate }
  const ataques = [];
  let ultimo = null;
  // Once the simulation sends SOB_ATAQUE, shots stop being read as attacks (they were only the stand-in).
  let temSobAtaque = false;

  function ataque(id, x, y, agora, novos) {
    if (donoDe(id) !== jogador) return;
    const cx = x / FP;
    const cy = y / FP;
    for (const a of ataques) {
      if (a.ate < agora) continue;
      if ((a.x - cx) ** 2 + (a.y - cy) ** 2 <= RAIO_DO_ATAQUE * RAIO_DO_ATAQUE) {
        a.ate = agora + SILENCIO_DO_ATAQUE_MS;
        return;
      }
    }
    const qual = categoria(tipoDe(id));
    const tipo = qual === 'predio' ? ALERTA.BASE_SOB_ATAQUE : qual === 'coletor' ? ALERTA.COLETOR_SOB_ATAQUE : ALERTA.SOB_ATAQUE;
    ataques.push({ x: cx, y: cy, ate: agora + SILENCIO_DO_ATAQUE_MS });
    novos.push({ tipo, x: cx, y: cy, entidade: id, arg: 0, quando: agora });
  }

  /** Reads the events of one snapshot and returns the new alerts, oldest first. */
  function registrar(eventos, agora) {
    const novos = [];
    for (let o = 0; o + TAMANHO_EVENTO <= eventos.length; o += TAMANHO_EVENTO) {
      const tipo = eventos[o + E_TIPO];
      const entidade = eventos[o + E_ENTIDADE];
      const x = eventos[o + E_X];
      const y = eventos[o + E_Y];
      const arg = eventos[o + E_ARG];
      if (tipo === EVENTO.SOB_ATAQUE) {
        temSobAtaque = true;
        ataque(entidade, x, y, agora, novos);
      } else if (tipo === EVENTO.TIRO && !temSobAtaque) {
        if (donoDe(entidade) !== jogador) ataque(eventos[o + E_ALVO], eventos[o + E_ALVO_X], eventos[o + E_ALVO_Y], agora, novos);
      } else if (tipo === EVENTO.PRODUCAO_CONCLUIDA || tipo === EVENTO.CONSTRUCAO_CONCLUIDA) {
        if (donoDe(entidade) !== jogador) continue;
        novos.push({ tipo: tipo === EVENTO.PRODUCAO_CONCLUIDA ? ALERTA.PRODUCAO : ALERTA.CONSTRUCAO, x: x / FP, y: y / FP, entidade, arg, quando: agora });
      } else if (tipo === EVENTO.RECURSO_ESGOTADO) {
        novos.push({ tipo: ALERTA.RECURSO_ESGOTADO, x: x / FP, y: y / FP, entidade, arg, quando: agora });
      } else if (EVENTO.COMANDO_RECUSADO !== undefined && tipo === EVENTO.COMANDO_RECUSADO) {
        // a refused command carries its player where an entity would be
        if (entidade !== jogador) continue;
        novos.push({ tipo: ALERTA.RECUSA, x: x / FP, y: y / FP, entidade: -1, arg, quando: agora });
      }
    }
    for (let i = ataques.length - 1; i >= 0; i--) if (ataques[i].ate < agora) ataques.splice(i, 1);
    for (const alerta of novos) if (alerta.tipo !== ALERTA.RECUSA) ultimo = alerta;
    return novos;
  }

  return {
    registrar,
    /** The latest alert with a place on the map, or null. */
    get ultimo() {
      return ultimo;
    },
    /** Attack alerts still running, for the minimap pings. */
    ataquesAtivos(agora) {
      return ataques.filter(a => a.ate >= agora);
    },
  };
}
