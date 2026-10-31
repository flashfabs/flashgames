// Robot player for the soak: random commands at a steady average rate, the way a busy person would click, plus kinds
// the simulation does not know yet (relayed like any other, then dropped by every peer alike) and, every 25 to 35 s,
// a burst of three commands with the most units the envelope allows, which makes the turn packet bigger than one
// message and exercises the slicing. Its timing is not deterministic on purpose: only the turn packets are.

import { TIPO_COMANDO, FP } from '../../site/rts/js/sim/contratos.js';
import { criarTique } from '../../site/js/relogio.js';
import { MAX_UNIDADES_ENVELOPE } from './protocolo.js';

const INTERVALO_MS = 50;
const PRIMEIRO_TIPO_DESCONHECIDO = 100; // well above the kinds the simulation knows

export function criarRobo({ comandar, porSegundo = 3, largura, altura, sortear = Math.random, agora = () => performance.now() }) {
  let proprios = [];
  let inimigos = [];
  let proximaRajada = agora() + 25000 + sortear() * 10000;
  let relogio = null;

  const inteiro = limite => Math.floor(sortear() * limite);
  const ponto = () => ({ x: inteiro(largura * FP), y: inteiro(altura * FP) });

  function escolher(quantos) {
    const escolhidos = [];
    for (let k = 0; k < quantos; k++) escolhidos.push(proprios[inteiro(proprios.length)]);
    return [...new Set(escolhidos)];
  }

  function umComando() {
    const unidades = escolher(1 + Math.floor(sortear() * sortear() * 40));
    const r = sortear();
    if (r < 0.38) return comandar({ tipo: TIPO_COMANDO.MOVER, unidades, ...ponto() });
    if (r < 0.58) return comandar({ tipo: TIPO_COMANDO.ATACAR_MOVENDO, unidades, ...ponto() });
    if (r < 0.66) return comandar({ tipo: TIPO_COMANDO.PATRULHAR, unidades, ...ponto() });
    if (r < 0.74 && inimigos.length) return comandar({ tipo: TIPO_COMANDO.ATACAR, unidades, alvo: inimigos[inteiro(inimigos.length)] });
    if (r < 0.8) return comandar({ tipo: sortear() < 0.5 ? TIPO_COMANDO.PARAR : TIPO_COMANDO.SEGURAR_POSICAO, unidades });
    if (r < 0.88) return comandar({ tipo: TIPO_COMANDO.MOVER, unidades, ...ponto(), fila: 1 });
    if (r < 0.93) {
      const tipo = sortear() < 0.5 ? TIPO_COMANDO.CONSTRUIR : TIPO_COMANDO.PRODUZIR;
      return comandar({ tipo, unidades: unidades.slice(0, 1), ...ponto(), arg: 1 + inteiro(20) });
    }
    const alvo = inimigos.length ? inimigos[inteiro(inimigos.length)] : -1;
    return comandar({ tipo: PRIMEIRO_TIPO_DESCONHECIDO + inteiro(40), unidades, alvo, ...ponto(), arg: inteiro(100000) });
  }

  // The same ids repeated up to the envelope's limit: the simulation ignores repeats, the wire carries them all.
  function rajada() {
    for (let k = 0; k < 3; k++) {
      const unidades = Array.from({ length: MAX_UNIDADES_ENVELOPE }, (_, i) => proprios[i % proprios.length]);
      comandar({ tipo: TIPO_COMANDO.ATACAR_MOVENDO, unidades, ...ponto() });
    }
  }

  function tique() {
    if (proprios.length === 0) return;
    if (agora() >= proximaRajada) {
      proximaRajada = agora() + 25000 + sortear() * 10000;
      rajada();
    }
    if (sortear() < (porSegundo * INTERVALO_MS) / 1000) umComando();
  }

  return {
    atualizar(relatorio) {
      proprios = relatorio.proprios;
      inimigos = relatorio.inimigos;
    },
    ligar() {
      relogio ??= criarTique(INTERVALO_MS, tique);
    },
    desligar() {
      relogio?.parar();
      relogio = null;
    },
  };
}
