// Presentation-only effects: tracers, bolts, electric arcs, shells in flight, flashes, explosions in three sizes,
// sparks, smoke, steam, dust, scorch marks and the order marker, spawned from the simulation events of each snapshot
// (Math.random is fine here) by the weapon's damage kind, and kept in fixed pools of typed arrays, so neither the
// events nor the frame loop allocate. When a pool is full the oldest effect makes room. The LUZ event goes to the
// lighting (luz.js).
import { FLOATS_INSTANCIA } from './backend-webgl2.js';
import { FP, EVENTO, CATEGORIA, TAMANHO_EVENTO, E_TIPO, E_X, E_Y, E_ALVO_X, E_ALVO_Y, E_ARG } from '../sim/contratos.js';

/** Effect kinds, as the effect shader draws them. */
export const EFEITO = Object.freeze({
  TRACADO: 0, // bullet tracer from a to b
  CLARAO: 1, // muzzle flash
  EXPLOSAO: 2, // fireball, size in cells
  FUMACA: 3, // dark smoke drifting along b
  MARCA: 4, // scorch on the ground
  ORDEM: 5, // order marker on the ground
  LUZ_NO_CHAO: 6, // pool of light around a lamp (drawn by unidades.js)
  CONE: 7, // searchlight cone from a along b (drawn by unidades.js)
  OBUS: 8, // shell in flight along an arc from a to b
  FAISCAS: 9, // burst of sparks
  VAPOR: 10, // white steam drifting up along b
  ELETRICO: 11, // jagged electric arc from a to b
  POEIRA: 12, // dust puff of a bullet hitting
  RAIO: 13, // thick bolt of a piercing weapon from a to b
});

/** Damage kinds of armas.json, and the look each one's shots and hits get. */
export const DANO = Object.freeze({ BALA: 'bala', PERFURANTE: 'perfurante', EXPLOSIVO: 'explosivo', PANE: 'pane' });

const CAPACIDADE = 4096;
const CAPACIDADE_MARCAS = 600;
const DURACAO_MARCA_MS = 45000;
// pool record: kind, ax, ay, bx, by, start, duration, size, seed
const CAMPOS = 9;
// what goes in each draw: marks under everything, alpha-blended clouds, additive light
const NO_CHAO = new Set([EFEITO.MARCA, EFEITO.ORDEM]);
const NUVENS = new Set([EFEITO.FUMACA, EFEITO.VAPOR, EFEITO.POEIRA]);
// steam machines puff when they fire
const A_VAPOR = /locomovel|caldeira|vapor|pressao/;

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

/**
 * How each kind fights and dies, from the static map: its weapon's damage kind and whether it arcs, its size class
 * (0 soldier, 1 vehicle, 2 building), and whether it is a steam machine.
 * @param {{ nome: string, categoria: number, pegada: number[], arma?: number, lotacao?: number, asset?: string }[]} tipos
 * @param {{ tipoDano: string, raioArea: number, emArco: number }[]} armas
 */
export function perfisDosTipos(tipos, armas) {
  return tipos.map(t => {
    const arma = armas?.[t.arma ?? -1] ?? null;
    const predio = t.categoria !== CATEGORIA.UNIDADE && t.categoria !== CATEGORIA.FAISCA;
    const infantaria = /infantaria/.test(t.asset ?? '') || /infantaria|turma|chapa|arpoador|religador|soldador/.test(t.nome);
    return {
      dano: arma?.tipoDano ?? DANO.BALA,
      emArco: Boolean(arma?.emArco),
      porte: predio ? 2 : infantaria ? 0 : 1,
      vapor: A_VAPOR.test(t.nome),
      tamanhoPredio: predio ? Math.max(...t.pegada) : 0,
    };
  });
}

/**
 * Size of the fireball of an area weapon, in cells: three sizes by its blast radius, in world units as
 * MapaEstatico.armas gives it (1/1,024 of a cell).
 */
export function tamanhoDaExplosao(raioArea) {
  const celulas = raioArea / FP;
  return celulas >= 1.15 ? 1.6 : celulas >= 0.75 ? 1.1 : 0.7;
}

export function criarEfeitos({ visivel, aoLuz = () => {} }) {
  const vivos = criarPool(CAPACIDADE);
  const marcas = criarPool(CAPACIDADE_MARCAS);
  const decalques = new Float32Array((CAPACIDADE_MARCAS + CAPACIDADE) * FLOATS_INSTANCIA);
  const fumaca = new Float32Array(CAPACIDADE * FLOATS_INSTANCIA);
  const brilho = new Float32Array(CAPACIDADE * FLOATS_INSTANCIA);
  const contagem = { nD: 0, nF: 0, nB: 0 };
  // per kind: damage, arc, size class, steam; and the weapons, for hits and blasts
  let perfis = [];
  let armas = [];

  function adicionar(tipo, ax, ay, bx, by, duracao, tamanho) {
    inserir(vivos, tipo, ax, ay, bx, by, performance.now(), duracao, tamanho, Math.random());
  }

  const perfilPadrao = { dano: DANO.BALA, emArco: false, porte: 1, vapor: false, tamanhoPredio: 0 };

  function explosao(agora, x, y, tamanho, fumacas) {
    inserir(vivos, EFEITO.EXPLOSAO, x, y, 0, 0, agora, 450 + tamanho * 220, tamanho, Math.random());
    inserir(vivos, EFEITO.FAISCAS, x, y, 0, 0, agora, 420, tamanho * 0.9, Math.random());
    for (let s = 0; s < fumacas; s++) {
      inserir(vivos, EFEITO.FUMACA, x + (Math.random() - 0.5) * 0.5 * tamanho, y + (Math.random() - 0.5) * 0.5 * tamanho, (Math.random() - 0.5) * 0.6, -0.5 - Math.random() * 0.6, agora, 1800 + Math.random() * 1200, (0.5 + Math.random() * 0.5) * tamanho, Math.random());
    }
    inserir(marcas, EFEITO.MARCA, x, y, 0, 0, agora, DURACAO_MARCA_MS, 0.6 * tamanho + Math.random() * 0.3, Math.random());
  }

  function tiro(agora, perfil, ax, ay, bx, by) {
    const distancia = Math.hypot(bx - ax, by - ay);
    if (perfil.emArco) {
      inserir(vivos, EFEITO.OBUS, ax, ay, bx, by, agora, 500 + distancia * 70, 0.16, Math.random());
      inserir(vivos, EFEITO.CLARAO, ax, ay, 0, 0, agora, 120, 0.4, Math.random());
      inserir(vivos, EFEITO.FUMACA, ax, ay, (Math.random() - 0.5) * 0.4, -0.6, agora, 1400, 0.45, Math.random());
    } else if (perfil.dano === DANO.PANE) {
      inserir(vivos, EFEITO.ELETRICO, ax, ay, bx, by, agora, 180, 0, Math.random());
    } else if (perfil.dano === DANO.PERFURANTE) {
      inserir(vivos, EFEITO.RAIO, ax, ay, bx, by, agora, 170, 0, Math.random());
      inserir(vivos, EFEITO.CLARAO, ax, ay, 0, 0, agora, 90, 0.3, Math.random());
    } else {
      inserir(vivos, EFEITO.TRACADO, ax, ay, bx, by, agora, perfil.porte >= 1 ? 120 : 80, 0, Math.random());
      inserir(vivos, EFEITO.CLARAO, ax, ay, 0, 0, agora, 70, perfil.porte >= 1 ? 0.26 : 0.16, Math.random());
    }
    if (perfil.vapor) inserir(vivos, EFEITO.VAPOR, ax, ay, (Math.random() - 0.5) * 0.3, -0.8, agora, 1600, 0.5, Math.random());
  }

  function impacto(agora, dano, x, y) {
    if (dano === DANO.EXPLOSIVO) explosao(agora, x, y, 0.55, 1);
    else if (dano === DANO.PANE) inserir(vivos, EFEITO.ELETRICO, x - 0.3, y - 0.2, x + 0.3, y + 0.1, agora, 220, 0, Math.random());
    else if (dano === DANO.PERFURANTE) inserir(vivos, EFEITO.FAISCAS, x, y, 0, 0, agora, 300, 0.45, Math.random());
    else {
      inserir(vivos, EFEITO.POEIRA, x, y, (Math.random() - 0.5) * 0.3, -0.2, agora, 500, 0.25, Math.random());
      if (Math.random() < 0.4) inserir(vivos, EFEITO.FAISCAS, x, y, 0, 0, agora, 200, 0.22, Math.random());
    }
  }

  function morte(agora, perfil, x, y) {
    if (perfil.porte === 2) explosao(agora, x, y, 1.2 + perfil.tamanhoPredio * 0.25, 6);
    else if (perfil.porte === 1) explosao(agora, x, y, 0.9, 3);
    else {
      inserir(vivos, EFEITO.POEIRA, x, y, 0, -0.3, agora, 900, 0.5, Math.random());
      inserir(vivos, EFEITO.FAISCAS, x, y, 0, 0, agora, 250, 0.3, Math.random());
    }
  }

  function registrarEventos({ eventos }) {
    const agora = performance.now();
    for (let k = 0; k < eventos.length; k += TAMANHO_EVENTO) {
      const tipo = eventos[k + E_TIPO];
      const ax = eventos[k + E_X] / FP;
      const ay = eventos[k + E_Y] / FP;
      const arg = eventos[k + E_ARG];
      if (tipo === EVENTO.LUZ) {
        aoLuz(arg, ax, ay);
        continue;
      }
      if (tipo === EVENTO.TIRO) {
        const bx = eventos[k + E_ALVO_X] / FP;
        const by = eventos[k + E_ALVO_Y] / FP;
        if (!visivel(ax, ay) && !visivel(bx, by)) continue;
        tiro(agora, perfis[arg] ?? perfilPadrao, ax, ay, bx, by);
      } else if (tipo === EVENTO.IMPACTO) {
        if (!visivel(ax, ay)) continue;
        impacto(agora, armas[arg]?.tipoDano ?? DANO.BALA, ax, ay);
      } else if (tipo === EVENTO.EXPLOSAO) {
        if (!visivel(ax, ay)) continue;
        explosao(agora, ax, ay, tamanhoDaExplosao(armas[arg]?.raioArea ?? 0), 2);
      } else if (tipo === EVENTO.MORTE) {
        if (!visivel(ax, ay)) continue;
        morte(agora, perfis[arg] ?? perfilPadrao, ax, ay);
      } else if (tipo === EVENTO.CARGA_DERRAMADA || tipo === EVENTO.REDE_CORTADA || tipo === EVENTO.RELIGADO) {
        if (!visivel(ax, ay)) continue;
        inserir(vivos, EFEITO.FAISCAS, ax, ay, 0, 0, agora, 500, tipo === EVENTO.RELIGADO ? 0.9 : 0.5, Math.random());
        if (tipo === EVENTO.RELIGADO) inserir(vivos, EFEITO.CLARAO, ax, ay, 0, 0, agora, 300, 0.9, Math.random());
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
      if (NO_CHAO.has(tipo)) escrever(decalques, nD++, d, o, idade, tamanho);
      else if (NUVENS.has(tipo)) escrever(fumaca, nF++, d, o, idade, tamanho * (0.7 + idade));
      else escrever(brilho, nB++, d, o, idade, tipo === EFEITO.EXPLOSAO ? tamanho * (0.6 + idade * 0.8) : tamanho);
    }
    contagem.nD = nD;
    contagem.nF = nF;
    contagem.nB = nB;
    return contagem;
  }

  return {
    adicionar,
    registrarEventos,
    montar,
    /** Kinds and weapons of the match (MapaEstatico.tipos and .armas): what each shot, hit and death looks like. */
    definirTipos(tipos, listaArmas) {
      armas = listaArmas ?? [];
      perfis = perfisDosTipos(tipos, armas);
    },
    decalques,
    fumaca,
    brilho,
    contagem,
  };
}
