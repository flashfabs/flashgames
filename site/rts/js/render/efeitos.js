// Presentation-only effects: tracers, flashes, explosions, smoke, scorch marks and the order marker, spawned from
// the simulation events of each snapshot (Math.random is fine here) and kept in fixed pools of typed arrays, so
// neither the events nor the frame loop allocate. When a pool is full the oldest effect makes room.
import { FLOATS_INSTANCIA } from './backend-webgl2.js';
import { FP, EVENTO, TAMANHO_EVENTO, E_TIPO, E_X, E_Y, E_ALVO_X, E_ALVO_Y, E_ARG } from '../sim/contratos.js';

export const EFEITO = Object.freeze({ TRACADO: 0, CLARAO: 1, EXPLOSAO: 2, FUMACA: 3, MARCA: 4, ORDEM: 5 });

// unit kind 1 is the heavy one in the prototype's data: bigger tracer and explosion
const TIPO_GRANDE = 1;
const CAPACIDADE = 4096;
const CAPACIDADE_MARCAS = 600;
const DURACAO_MARCA_MS = 45000;
// pool record: kind, ax, ay, bx, by, start, duration, size, seed
const CAMPOS = 9;

function criarPool(capacidade) {
  return { dados: new Float64Array(capacidade * CAMPOS), capacidade, inicio: 0, n: 0 };
}

function inserir(pool, tipo, ax, ay, bx, by, inicio, duracao, tamanho, semente) {
  let indice;
  if (pool.n < pool.capacidade) indice = (pool.inicio + pool.n++) % pool.capacidade;
  else {
    indice = pool.inicio;
    pool.inicio = (pool.inicio + 1) % pool.capacidade;
  }
  const o = indice * CAMPOS;
  const d = pool.dados;
  d[o] = tipo;
  d[o + 1] = ax;
  d[o + 2] = ay;
  d[o + 3] = bx;
  d[o + 4] = by;
  d[o + 5] = inicio;
  d[o + 6] = duracao;
  d[o + 7] = tamanho;
  d[o + 8] = semente;
}

export function criarEfeitos({ visivel }) {
  const vivos = criarPool(CAPACIDADE);
  const marcas = criarPool(CAPACIDADE_MARCAS);
  const decalques = new Float32Array((CAPACIDADE_MARCAS + CAPACIDADE) * FLOATS_INSTANCIA);
  const fumaca = new Float32Array(CAPACIDADE * FLOATS_INSTANCIA);
  const brilho = new Float32Array(CAPACIDADE * FLOATS_INSTANCIA);
  const contagem = { nD: 0, nF: 0, nB: 0 };

  function adicionar(tipo, ax, ay, bx, by, duracao, tamanho) {
    inserir(vivos, tipo, ax, ay, bx, by, performance.now(), duracao, tamanho, Math.random());
  }

  function registrarEventos({ eventos }) {
    const agora = performance.now();
    for (let k = 0; k < eventos.length; k += TAMANHO_EVENTO) {
      const tipo = eventos[k + E_TIPO];
      const ax = eventos[k + E_X] / FP;
      const ay = eventos[k + E_Y] / FP;
      const grande = eventos[k + E_ARG] === TIPO_GRANDE;
      if (tipo === EVENTO.TIRO) {
        const bx = eventos[k + E_ALVO_X] / FP;
        const by = eventos[k + E_ALVO_Y] / FP;
        if (!visivel(ax, ay) && !visivel(bx, by)) continue;
        inserir(vivos, EFEITO.TRACADO, ax, ay, bx, by, agora, grande ? 160 : 90, 0, Math.random());
        inserir(vivos, EFEITO.CLARAO, ax, ay, 0, 0, agora, 80, grande ? 0.32 : 0.18, Math.random());
      } else if (tipo === EVENTO.MORTE) {
        if (!visivel(ax, ay)) continue;
        inserir(vivos, EFEITO.EXPLOSAO, ax, ay, 0, 0, agora, 650, grande ? 1.1 : 0.8, Math.random());
        for (let s = 0; s < 3; s++) {
          inserir(vivos, EFEITO.FUMACA, ax + (Math.random() - 0.5) * 0.4, ay + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.6, -0.5 - Math.random() * 0.6, agora, 1800 + Math.random() * 900, 0.6 + Math.random() * 0.5, Math.random());
        }
        inserir(marcas, EFEITO.MARCA, ax, ay, 0, 0, agora, DURACAO_MARCA_MS, 0.7 + Math.random() * 0.4, Math.random());
      }
    }
  }

  function escrever(destino, n, d, o, idade, tamanho) {
    const p = n * FLOATS_INSTANCIA;
    destino[p] = d[o + 1];
    destino[p + 1] = d[o + 2];
    destino[p + 2] = d[o + 3];
    destino[p + 3] = d[o + 4];
    destino[p + 4] = d[o];
    destino[p + 5] = idade;
    destino[p + 6] = tamanho;
    destino[p + 7] = d[o + 8];
  }

  // Drops expired records from the front of a pool (they expire roughly in insertion order).
  function podar(pool, agora) {
    while (pool.n > 0) {
      const o = pool.inicio * CAMPOS;
      if (agora - pool.dados[o + 5] < pool.dados[o + 6]) break;
      pool.inicio = (pool.inicio + 1) % pool.capacidade;
      pool.n--;
    }
  }

  function montar(agora) {
    podar(vivos, agora);
    podar(marcas, agora);
    let nD = 0;
    let nF = 0;
    let nB = 0;
    for (let i = 0; i < marcas.n; i++) {
      const o = ((marcas.inicio + i) % marcas.capacidade) * CAMPOS;
      const idade = (agora - marcas.dados[o + 5]) / marcas.dados[o + 6];
      if (idade < 1) escrever(decalques, nD++, marcas.dados, o, idade, marcas.dados[o + 7]);
    }
    const d = vivos.dados;
    for (let i = 0; i < vivos.n; i++) {
      const o = ((vivos.inicio + i) % vivos.capacidade) * CAMPOS;
      const idade = (agora - d[o + 5]) / d[o + 6];
      if (idade >= 1 || idade < 0) continue;
      const tipo = d[o];
      const tamanho = d[o + 7];
      if (tipo === EFEITO.ORDEM) escrever(decalques, nD++, d, o, idade, tamanho);
      else if (tipo === EFEITO.FUMACA) escrever(fumaca, nF++, d, o, idade, tamanho * (0.7 + idade));
      else escrever(brilho, nB++, d, o, idade, tipo === EFEITO.EXPLOSAO ? tamanho * (0.6 + idade * 0.8) : tamanho);
    }
    contagem.nD = nD;
    contagem.nF = nF;
    contagem.nB = nB;
    return contagem;
  }

  return { adicionar, registrarEventos, montar, decalques, fumaca, brilho, contagem };
}
