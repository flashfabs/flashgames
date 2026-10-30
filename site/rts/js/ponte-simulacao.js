// Main-thread side of the simulation worker (the local command source): starts it, stamps commands with the local
// player and a sequence number, forwards pause and speed, pauses while the tab is hidden, saves and loads, and keeps
// the last two snapshots so the presentation can interpolate between them. The message formats are in sim/contratos.js.
import { PARA_TRABALHADOR, DO_TRABALHADOR, VISAO, SEM_ENTIDADE, criarComando } from './sim/contratos.js';

export function criarPonteSimulacao() {
  // mapa: MapaEstatico; anterior and atual: the last two Retrato
  const estado = { mapa: null, anterior: null, atual: null, chegadaAtual: 0, tickMs: [], soma: 0, tick: 0, jogadorLocal: 0 };
  let trabalhador = null;
  let seq = 0;
  let salvando = null;

  // Starts the worker; aoReceberMapa gets the static map once, aoReceberEstado every snapshot.
  function iniciar({ semente, unidadesPorTime, avancar, jogadorLocal = 0, aoReceberMapa, aoReceberEstado }) {
    estado.jogadorLocal = jogadorLocal;
    trabalhador = new Worker(new URL('./trabalhador.js', import.meta.url), { type: 'module' });
    trabalhador.postMessage({ t: PARA_TRABALHADOR.INICIAR, opcoes: { semente, unidadesPorTime, avancar, jogadorLocal } });
    trabalhador.onmessage = ({ data }) => {
      if (data.t === DO_TRABALHADOR.PRONTO) {
        estado.mapa = data;
        aoReceberMapa(data);
        return;
      }
      if (data.t === DO_TRABALHADOR.RETRATO) {
        estado.anterior = estado.atual;
        estado.atual = data;
        estado.chegadaAtual = performance.now();
        estado.tickMs.push(data.msPasso);
        estado.soma = data.soma;
        estado.tick = data.tick;
        aoReceberEstado(data);
        return;
      }
      if (data.t === DO_TRABALHADOR.SALVO) {
        salvando?.(data);
        salvando = null;
        return;
      }
      if (data.t === DO_TRABALHADOR.ERRO) console.error('simulação:', data.mensagem);
    };
    // a single-player match stops while nobody can see it
    document.addEventListener('visibilitychange', () => pausar(document.hidden, 'visibilidade'));
    if (document.hidden) pausar(true, 'visibilidade');
  }

  /** Pauses or resumes for one reason; the match runs only when no reason is left. */
  function pausar(valor, motivo = 'jogador') {
    trabalhador?.postMessage({ t: PARA_TRABALHADOR.PAUSAR, valor: Boolean(valor), motivo });
  }

  /** Whole state and the replay so far: Promise<{ tick, bytes, replay }>. */
  function salvar() {
    return new Promise((resolver, rejeitar) => {
      if (!trabalhador) return rejeitar(new Error('a simulação não começou'));
      salvando = resolver;
      trabalhador.postMessage({ t: PARA_TRABALHADOR.SALVAR });
    });
  }

  /**
   * Sends an order of the local player; the worker schedules it for the next tick.
   * @param {{tipo: number, unidades?: number[], alvo?: number, x?: number, y?: number, arg?: number, fila?: number}} ordem
   */
  function enviarComando({ tipo, unidades = [], alvo = SEM_ENTIDADE, x = 0, y = 0, arg = 0, fila = 0 }) {
    if (!trabalhador) return;
    const comando = criarComando({ jogador: estado.jogadorLocal, seq: seq++, tipo, unidades, alvo, x, y, arg, fila });
    delete comando.tick;
    trabalhador.postMessage({ t: PARA_TRABALHADOR.COMANDO, comando });
  }

  // Whether a map cell (in cell units, fractional allowed) is visible to the local player in the latest snapshot.
  function visivel(x, y) {
    const m = estado.mapa;
    const atual = estado.atual;
    if (!m || !atual) return false;
    const cx = x | 0;
    const cy = y | 0;
    if (cx < 0 || cy < 0 || cx >= m.largura || cy >= m.altura) return false;
    return atual.visao[cy * m.largura + cx] === VISAO.VISIVEL;
  }

  return {
    estado,
    iniciar,
    visivel,
    enviarComando,
    pausar,
    velocidade: percentual => trabalhador?.postMessage({ t: PARA_TRABALHADOR.VELOCIDADE, percentual }),
    salvar,
    carregar: bytes => trabalhador?.postMessage({ t: PARA_TRABALHADOR.CARREGAR, bytes }, [bytes]),
  };
}
