// Presentation-only effects: tracers, flashes, explosions, smoke, scorch marks and the order marker, spawned from the
// simulation events of each snapshot and packed into instance buffers every frame. Math.random is fine here.
import { FLOATS_EFEITO, EFEITO } from './renderizador.js';
import { FP, EVENTO, TAMANHO_EVENTO, E_TIPO, E_X, E_Y, E_ALVO_X, E_ALVO_Y, E_ARG } from '../sim/contratos.js';

// unit kind 1 is the heavy one in the prototype's data: bigger tracer and explosion
const TIPO_GRANDE = 1;

export function criarEfeitos({ visivel }) {
  const efeitos = [];
  const marcas = [];
  const decalques = new Float32Array(1024 * FLOATS_EFEITO);
  let fumaca = new Float32Array(4096 * FLOATS_EFEITO);
  let brilho = new Float32Array(4096 * FLOATS_EFEITO);

  function adicionar(tipo, ax, ay, bx, by, duracao, tamanho) {
    efeitos.push({ tipo, ax, ay, bx, by, inicio: performance.now(), duracao, tamanho, semente: Math.random() });
  }

  function registrarEventos({ eventos }) {
    for (let k = 0; k < eventos.length; k += TAMANHO_EVENTO) {
      const tipo = eventos[k + E_TIPO];
      const ax = eventos[k + E_X] / FP;
      const ay = eventos[k + E_Y] / FP;
      const grande = eventos[k + E_ARG] === TIPO_GRANDE;
      if (tipo === EVENTO.TIRO) {
        const bx = eventos[k + E_ALVO_X] / FP;
        const by = eventos[k + E_ALVO_Y] / FP;
        if (!visivel(ax, ay) && !visivel(bx, by)) continue;
        adicionar(EFEITO.TRACADO, ax, ay, bx, by, grande ? 160 : 90, 0);
        adicionar(EFEITO.CLARAO, ax, ay, 0, 0, 80, grande ? 0.32 : 0.18);
      } else if (tipo === EVENTO.MORTE) {
        if (!visivel(ax, ay)) continue;
        adicionar(EFEITO.EXPLOSAO, ax, ay, 0, 0, 650, grande ? 1.1 : 0.8);
        for (let s = 0; s < 3; s++) {
          adicionar(EFEITO.FUMACA, ax + (Math.random() - 0.5) * 0.4, ay + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.6, -0.5 - Math.random() * 0.6, 1800 + Math.random() * 900, 0.6 + Math.random() * 0.5);
        }
        marcas.push({ x: ax, y: ay, inicio: performance.now(), semente: Math.random(), tamanho: 0.7 + Math.random() * 0.4 });
        if (marcas.length > 600) marcas.shift();
      }
    }
  }

  function montar(agora) {
    let nD = 0;
    for (const m of marcas) {
      const idade = (agora - m.inicio) / 45000;
      if (idade >= 1 || nD >= 1000) continue;
      decalques.set([m.x, m.y, 0, 0, EFEITO.MARCA, idade, m.tamanho, m.semente], nD++ * FLOATS_EFEITO);
    }
    for (const e of efeitos) {
      if (e.tipo !== EFEITO.ORDEM) continue;
      const idade = (agora - e.inicio) / e.duracao;
      if (idade < 1) decalques.set([e.ax, e.ay, 0, 0, e.tipo, idade, e.tamanho, e.semente], nD++ * FLOATS_EFEITO);
    }
    let nF = 0;
    let nB = 0;
    let escrita = 0;
    for (const e of efeitos) {
      const idade = (agora - e.inicio) / e.duracao;
      if (idade >= 1) continue;
      efeitos[escrita++] = e;
      if (e.tipo === EFEITO.ORDEM) continue;
      const linha = [e.ax, e.ay, e.bx, e.by, e.tipo, idade, e.tamanho * (e.tipo === EFEITO.EXPLOSAO ? 0.6 + idade * 0.8 : e.tipo === EFEITO.FUMACA ? 0.7 + idade : 1), e.semente];
      if (e.tipo === EFEITO.FUMACA) {
        if ((nF + 1) * FLOATS_EFEITO > fumaca.length) fumaca = Float32Array.from({ length: fumaca.length * 2 }, (_, i) => fumaca[i] ?? 0);
        fumaca.set(linha, nF++ * FLOATS_EFEITO);
      } else {
        if ((nB + 1) * FLOATS_EFEITO > brilho.length) brilho = Float32Array.from({ length: brilho.length * 2 }, (_, i) => brilho[i] ?? 0);
        brilho.set(linha, nB++ * FLOATS_EFEITO);
      }
    }
    efeitos.length = escrita;
    return { nD, nF, nB };
  }

  return {
    adicionar,
    registrarEventos,
    montar,
    decalques,
    // smoke and glow grow on demand, so read them after montar()
    get fumaca() {
      return fumaca;
    },
    get brilho() {
      return brilho;
    },
  };
}
