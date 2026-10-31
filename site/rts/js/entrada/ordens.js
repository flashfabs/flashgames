// Orders of the local player: turns an action and a map point into a command (C1) for the simulation, and answers at
// once, before the simulation has seen it: a marker on the ground, a provisional sound, the queued points and a
// latency sample for the frame that draws the marker. Training, building, placing, harvesting and rally points go
// through here too, so every command the page sends has one door.
import { FP, TIPO_COMANDO, SEM_ENTIDADE } from '../sim/contratos.js';
import { EFEITO } from '../render/renderizador.js';
import { ACAO } from './teclas.js';

const TIPO_DA_ACAO = Object.freeze({
  [ACAO.ATACAR_MOVENDO]: TIPO_COMANDO.ATACAR_MOVENDO,
  [ACAO.MOVER]: TIPO_COMANDO.MOVER,
  [ACAO.PATRULHAR]: TIPO_COMANDO.PATRULHAR,
});

const DURACAO_DA_MARCA_MS = 600;
/** Units one command may carry (C1 v1, MAX_UNIDADES_POR_COMANDO of the simulation front); a bigger selection goes in parts. */
export const MAXIMO_POR_COMANDO = 1024;

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
    let comando = null;
    for (let inicio = 0; inicio < ids.length; inicio += MAXIMO_POR_COMANDO) {
      comando = { tipo, unidades: ids.slice(inicio, inicio + MAXIMO_POR_COMANDO), alvo, x: destino ? Math.floor(destino.x * FP) : 0, y: destino ? Math.floor(destino.y * FP) : 0, fila: naFila ? 1 : 0 };
      simulacao.enviarComando(comando);
    }
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

  // Building commands carry no queue points and answer with a click sound instead of an order bark.
  function enviarDePredio(tipo, ids, { arg = 0, x = 0, y = 0, alvo = SEM_ENTIDADE, naFila = false, timeStamp, quantidade = 1 }) {
    if (ids.length === 0 || ids[0] < 0 || !estado.mapa) {
      som.tocar('recusa');
      return null;
    }
    let comando = null;
    for (let i = 0; i < quantidade; i++) {
      comando = { tipo, unidades: ids, alvo, x, y, arg, fila: naFila ? 1 : 0 };
      simulacao.enviarComando(comando);
    }
    som.tocar('clique');
    latencia.anotar(timeStamp, 'predio');
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
    /** Harvesters to a resource node (or back to a depot, by the target). */
    coletar(ids, alvo, ponto, naFila, timeStamp) {
      return enviar(TIPO_COMANDO.COLETAR, ids, { ponto, alvo, naFila, timeStamp });
    },
    /** `quantidade` items of `tipo` (a unit, or a building at the headquarters); the simulation picks the shortest queue among `predios`. */
    produzir(predios, tipo, quantidade, timeStamp) {
      return enviarDePredio(TIPO_COMANDO.PRODUZIR, predios, { arg: tipo, timeStamp, quantidade });
    },
    /** Research `indice` (MapaEstatico.pesquisas) in one of the buildings. */
    pesquisar(predios, indice, timeStamp) {
      return enviarDePredio(TIPO_COMANDO.PESQUISAR, predios.slice(0, 1), { arg: indice, timeStamp });
    },
    /** Takes item `posicao` out of lane `faixa` (FAIXA.*) of a building's queue. */
    cancelar(predio, faixa, posicao, timeStamp) {
      return enviarDePredio(TIPO_COMANDO.CANCELAR, [predio], { x: faixa, arg: posicao, timeStamp });
    },
    /**
     * Places a building of `tipo` with its top-left cell at (cx, cy): construtores is [the headquarters holding it
     * ready] or the units that raise it on site. The point sent is the centre of that cell.
     */
    construir(construtores, tipo, cx, cy, naFila, timeStamp) {
      const comando = enviarDePredio(TIPO_COMANDO.CONSTRUIR, construtores, { arg: tipo, x: cx * FP + (FP >> 1), y: cy * FP + (FP >> 1), naFila, timeStamp });
      if (comando) efeitos.adicionar(EFEITO.ORDEM, cx + 0.5, cy + 0.5, 0, 0, DURACAO_DA_MARCA_MS, 1.3);
      return comando;
    },
    /** Where the units of these buildings gather; a target entity makes them follow or harvest it. */
    encontro(predios, ponto, alvo, timeStamp) {
      const destino = prender(ponto);
      const comando = enviarDePredio(TIPO_COMANDO.PONTO_DE_ENCONTRO, predios, { x: Math.floor(destino.x * FP), y: Math.floor(destino.y * FP), alvo, timeStamp });
      if (comando) efeitos.adicionar(EFEITO.ORDEM, destino.x, destino.y, 0, 0, DURACAO_DA_MARCA_MS, 0.9);
      return comando;
    },
  };
}
