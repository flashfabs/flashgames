// Orders of the local player: turns an action and a map point into a command (C1) for the simulation, and answers at
// once, before the simulation has seen it: a marker on the ground, a provisional sound, the queued points and a
// latency sample for the frame that draws the marker.
import { FP, TIPO_COMANDO, SEM_ENTIDADE } from '../sim/contratos.js';
import { EFEITO } from '../render/renderizador.js';
import { ACAO } from './teclas.js';

const TIPO_DA_ACAO = Object.freeze({
  [ACAO.ATACAR_MOVENDO]: TIPO_COMANDO.ATACAR_MOVENDO,
  [ACAO.MOVER]: TIPO_COMANDO.MOVER,
  [ACAO.PATRULHAR]: TIPO_COMANDO.PATRULHAR,
});

const DURACAO_DA_MARCA_MS = 600;

export function criarOrdens({ simulacao, estado, efeitos, fila, som, latencia }) {
  // Points outside the map still order the units to its edge instead of being dropped by the simulation.
  function prender(ponto) {
    const { largura, altura } = estado.mapa;
    return { x: Math.min(Math.max(ponto.x, 0), largura - 0.01), y: Math.min(Math.max(ponto.y, 0), altura - 0.01) };
  }

  function enviar(tipo, ids, { ponto = null, alvo = SEM_ENTIDADE, naFila = false, timeStamp }) {
    if (ids.length === 0 || !estado.mapa) {
      som.tocar('recusa');
      return null;
    }
    const destino = ponto ? prender(ponto) : null;
    const comando = { tipo, unidades: ids, alvo, x: destino ? Math.floor(destino.x * FP) : 0, y: destino ? Math.floor(destino.y * FP) : 0, fila: naFila ? 1 : 0 };
    simulacao.enviarComando(comando);
    if (destino) {
      efeitos.adicionar(EFEITO.ORDEM, destino.x, destino.y, 0, 0, DURACAO_DA_MARCA_MS, tipo === TIPO_COMANDO.MOVER ? 0.9 : 1.15);
      fila.ordenar(ids, destino, tipo, naFila, estado.tick);
    } else {
      fila.limpar(ids);
    }
    som.tocar(tipo === TIPO_COMANDO.ATACAR || tipo === TIPO_COMANDO.ATACAR_MOVENDO ? 'ataque' : 'ordem');
    latencia.anotar(timeStamp, 'ordem');
    return comando;
  }

  return {
    /** Right click or two-finger click: attack the enemy under the pointer, or move to the ground point. */
    deContexto(ids, ponto, alvo, naFila, timeStamp) {
      return enviar(alvo === SEM_ENTIDADE ? TIPO_COMANDO.MOVER : TIPO_COMANDO.ATACAR, ids, { ponto, alvo, naFila, timeStamp });
    },
    /** A, M or R followed by a click; A on a visible enemy attacks that enemy. */
    comAlvo(acao, ids, ponto, alvo, naFila, timeStamp) {
      const tipo = acao === ACAO.ATACAR_MOVENDO && alvo !== SEM_ENTIDADE ? TIPO_COMANDO.ATACAR : TIPO_DA_ACAO[acao];
      return enviar(tipo, ids, { ponto, alvo: tipo === TIPO_COMANDO.ATACAR ? alvo : SEM_ENTIDADE, naFila, timeStamp });
    },
    parar: (ids, timeStamp) => enviar(TIPO_COMANDO.PARAR, ids, { timeStamp }),
    segurar: (ids, timeStamp) => enviar(TIPO_COMANDO.SEGURAR_POSICAO, ids, { timeStamp }),
  };
}
