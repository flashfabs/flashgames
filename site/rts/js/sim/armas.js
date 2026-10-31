// Combat rules (C5, armas.json): damage kinds against armour classes, cover, height advantage, veterancy and the
// weapons, validated once and converted from design units (tenths of a cell, milliseconds, percent) to the
// simulation's integers (world units, ticks, percent). The numbers belong to the design front; REGRAS_COMBATE_PADRAO
// holds the plan's starting numbers until armas.json exists, written in the same shape so it goes through the same
// validator.
import { FP, PASSOS_POR_SEGUNDO } from './contratos.js';

export const TIPO_DANO = Object.freeze({ BALA: 0, PERFURANTE: 1, EXPLOSIVO: 2, PANE: 3 });
export const NOMES_TIPO_DANO = Object.freeze(['bala', 'perfurante', 'explosivo', 'pane']);
export const BLINDAGEM = Object.freeze({ PESSOAL: 0, LEVE: 1, PESADA: 2, ESTRUTURA: 3 });
export const NOMES_BLINDAGEM = Object.freeze(['pessoal', 'leve', 'pesada', 'estrutura']);
/** Cover class of a map cell (the map's `cobertura` layer); only personal armour benefits from it. */
export const COBERTURA = Object.freeze({ NENHUMA: 0, MATO: 1, RUINA: 2 });
export const NOMES_COBERTURA = Object.freeze(['nenhuma', 'mato', 'ruina']);
/** Veterancy levels above the recruit (0). */
export const NIVEIS_VETERANIA = 3;
export const VERSAO_ARMAS = 1;

const N_DANO = NOMES_TIPO_DANO.length;
const N_BLINDAGEM = NOMES_BLINDAGEM.length;
// the plan keeps every unit useful: no damage multiplier below 25%
const MINIMO_MATRIZ = 25;
// default flight speed of an arcing shell, tenths of a cell per second
const VELOCIDADE_ARCO_PADRAO = 80;

/** Design tenths of a cell to world units. */
export const decimosParaMundo = decimos => Math.trunc((decimos * FP) / 10);
/** Milliseconds to ticks, to the nearest tick. */
export const msParaPassos = ms => Math.trunc((ms * PASSOS_POR_SEGUNDO + 500) / 1000);
// tenths of a cell per second to world units per tick
const velocidadeParaMundo = decimos => Math.trunc((decimos * FP) / (10 * PASSOS_POR_SEGUNDO));

/** The plan's starting numbers (matrix, cover, height, veterancy), in the armas.json shape, with no weapons. */
export const REGRAS_COMBATE_PADRAO = Object.freeze({
  versao: VERSAO_ARMAS,
  matriz: {
    bala: [100, 60, 25, 25],
    perfurante: [40, 125, 150, 60],
    explosivo: [125, 90, 60, 150],
    pane: [25, 100, 75, 50],
  },
  cobertura: { mato: [80, 80, 90, 100], ruina: [60, 60, 75, 100] },
  elevacao: { danoAcima: 15, danoAbaixo: 25, alcanceAcima: 5 },
  veterania: { limiares: [100, 250, 500], dano: [0, 5, 10, 15], resistencia: [0, 5, 10, 13], recarga: [0, 0, 5, 10] },
  armas: [],
});

// field: [minimum, maximum] in design units
const ESQUEMA_ARMA = Object.freeze({
  dano: [0, 100000],
  recargaMs: [100, 60000],
  alcance: [0, 320], // tenths of a cell
  alcanceMinimo: [0, 320],
  raioArea: [0, 80],
  emArco: [0, 1], // 1: a shell that flies to a point on the ground and hits around it
  velocidadeProjetil: [0, 600], // tenths of a cell per second; 0 with emArco takes the default
});
const OPCIONAIS_ARMA = Object.freeze({ alcanceMinimo: 0, raioArea: 0, emArco: 0, velocidadeProjetil: 0 });

function conferirInteiro(erros, onde, valor, minimo, maximo) {
  if (!Number.isInteger(valor)) erros.push(`${onde}: ${valor} não é inteiro`);
  else if (valor < minimo || valor > maximo) erros.push(`${onde}: ${valor} fora de ${minimo}..${maximo}`);
}

function conferirLista(erros, onde, lista, tamanho, minimo, maximo) {
  if (!Array.isArray(lista) || lista.length !== tamanho) {
    erros.push(`${onde}: esperava uma lista de ${tamanho} inteiros`);
    return;
  }
  lista.forEach((valor, k) => conferirInteiro(erros, `${onde}[${k}]`, valor, minimo, maximo));
}

function validarArma(erros, arma, indice) {
  const onde = `armas[${indice}]${typeof arma?.nome === 'string' ? ` (${arma.nome})` : ''}`;
  if (!arma || typeof arma !== 'object') {
    erros.push(`${onde}: não é um objeto`);
    return null;
  }
  if (typeof arma.nome !== 'string' || !/^[a-z0-9-]+$/.test(arma.nome)) erros.push(`${onde}: nome inválido`);
  const tipoDano = NOMES_TIPO_DANO.indexOf(arma.tipoDano);
  if (tipoDano < 0) erros.push(`${onde}.tipoDano: ${arma.tipoDano} não é ${NOMES_TIPO_DANO.join(', ')}`);
  const valores = { ...OPCIONAIS_ARMA, ...arma };
  for (const [campo, [minimo, maximo]] of Object.entries(ESQUEMA_ARMA)) conferirInteiro(erros, `${onde}.${campo}`, valores[campo], minimo, maximo);
  for (const campo of Object.keys(arma)) if (campo !== 'nome' && campo !== 'tipoDano' && !(campo in ESQUEMA_ARMA)) erros.push(`${onde}.${campo}: campo desconhecido`);
  if (valores.alcanceMinimo > valores.alcance) erros.push(`${onde}.alcanceMinimo: maior que o alcance`);
  const velocidade = valores.emArco ? valores.velocidadeProjetil || VELOCIDADE_ARCO_PADRAO : 0;
  return Object.freeze({
    nome: arma.nome,
    tipoDano,
    dano: valores.dano,
    recarga: Math.max(1, msParaPassos(valores.recargaMs)),
    alcance: decimosParaMundo(valores.alcance),
    alcanceMinimo: decimosParaMundo(valores.alcanceMinimo),
    raioArea: decimosParaMundo(valores.raioArea),
    emArco: valores.emArco,
    velocidade: velocidade > 0 ? Math.max(1, velocidadeParaMundo(velocidade)) : 0,
  });
}

/**
 * Checks armas.json (or REGRAS_COMBATE_PADRAO) and returns the rules in simulation units:
 * matriz[tipoDano * 4 + blindagem] and cobertura[classe * 4 + tipoDano] in percent (row 0 of cobertura is 100),
 * height bonuses in percent per level and world units, veterancy thresholds in percent of the unit's cost and the
 * per-level bonuses, and the weapons with ranges in world units and reload in ticks.
 * @param {object} dados
 */
export function validarRegrasCombate(dados) {
  const erros = [];
  if (!dados || typeof dados !== 'object') throw new Error('armas: os dados de combate não são um objeto');
  if (dados.versao !== VERSAO_ARMAS) erros.push(`versao: ${dados.versao}, esperava ${VERSAO_ARMAS}`);
  const matriz = new Int16Array(N_DANO * N_BLINDAGEM);
  NOMES_TIPO_DANO.forEach((nome, td) => {
    const linha = dados.matriz?.[nome];
    conferirLista(erros, `matriz.${nome}`, linha, N_BLINDAGEM, MINIMO_MATRIZ, 400);
    if (Array.isArray(linha)) for (let bl = 0; bl < N_BLINDAGEM; bl++) matriz[td * N_BLINDAGEM + bl] = linha[bl] | 0;
  });
  const cobertura = new Int16Array(NOMES_COBERTURA.length * N_DANO).fill(100);
  NOMES_COBERTURA.slice(1).forEach((nome, k) => {
    const linha = dados.cobertura?.[nome];
    conferirLista(erros, `cobertura.${nome}`, linha, N_DANO, 0, 100);
    if (Array.isArray(linha)) for (let td = 0; td < N_DANO; td++) cobertura[(k + 1) * N_DANO + td] = linha[td] | 0;
  });
  const elevacao = dados.elevacao ?? {};
  conferirInteiro(erros, 'elevacao.danoAcima', elevacao.danoAcima, 0, 100);
  conferirInteiro(erros, 'elevacao.danoAbaixo', elevacao.danoAbaixo, 0, 30);
  conferirInteiro(erros, 'elevacao.alcanceAcima', elevacao.alcanceAcima, 0, 40);
  const vet = dados.veterania ?? {};
  conferirLista(erros, 'veterania.limiares', vet.limiares, NIVEIS_VETERANIA, 1, 10000);
  if (Array.isArray(vet.limiares) && vet.limiares.some((v, k) => k > 0 && v <= vet.limiares[k - 1])) erros.push('veterania.limiares: precisam crescer');
  conferirLista(erros, 'veterania.dano', vet.dano, NIVEIS_VETERANIA + 1, 0, 100);
  conferirLista(erros, 'veterania.resistencia', vet.resistencia, NIVEIS_VETERANIA + 1, 0, 80);
  conferirLista(erros, 'veterania.recarga', vet.recarga, NIVEIS_VETERANIA + 1, 0, 80);
  if (!Array.isArray(dados.armas)) erros.push('armas: esperava uma lista');
  const armas = (dados.armas ?? []).map((arma, k) => validarArma(erros, arma, k));
  const nomes = new Set();
  for (const arma of armas) {
    if (!arma) continue;
    if (nomes.has(arma.nome)) erros.push(`armas: nome repetido ${arma.nome}`);
    nomes.add(arma.nome);
  }
  for (const campo of Object.keys(dados)) if (!['versao', 'matriz', 'cobertura', 'elevacao', 'veterania', 'armas'].includes(campo)) erros.push(`${campo}: campo desconhecido`);
  if (erros.length > 0) throw new Error(`armas inválidas:\n${erros.join('\n')}`);
  return Object.freeze({
    matriz,
    cobertura,
    danoAcima: elevacao.danoAcima,
    danoAbaixo: elevacao.danoAbaixo,
    alcanceAcima: decimosParaMundo(elevacao.alcanceAcima),
    limiares: Int32Array.from(vet.limiares),
    bonusDano: Int16Array.from(vet.dano),
    resistencia: Int16Array.from(vet.resistencia),
    reducaoRecarga: Int16Array.from(vet.recarga),
    armas: Object.freeze(armas),
  });
}

/**
 * Per-match combat tables, derived from the rules (opcoes.armas, or the defaults) and the unit kinds: each kind's
 * weapon, armour and cost, and each weapon's numbers in flat arrays for the hot loop. Kinds name their weapon in
 * `arma` (name or index; -1 or null for none) and their armour in `blindagem` (name or index); a kind without `arma`
 * fires its own `dano`, `recarga` and `alcance` as bullets, and a kind without `blindagem` gets it from its movement
 * class. Rebuilt from the saved options after a load, so it is not part of the state.
 */
export function combateDe(sim) {
  if (sim.regrasCombate) return sim.regrasCombate;
  const regras = validarRegrasCombate(sim.opcoes?.armas ?? REGRAS_COMBATE_PADRAO);
  const armas = regras.armas.slice();
  const n = sim.tipos.length;
  const armaDoTipo = new Int16Array(n).fill(-1);
  const blindagemDoTipo = new Uint8Array(n);
  const custoDoTipo = new Int32Array(n);
  const vidaDoTipo = new Int32Array(n);
  sim.tipos.forEach((tipo, t) => {
    armaDoTipo[t] = armaDoTipoDeUnidade(tipo, armas);
    blindagemDoTipo[t] = blindagemDoTipoDeUnidade(tipo);
    custoDoTipo[t] = Math.max(1, tipo.custo ?? tipo.vida);
    vidaDoTipo[t] = tipo.vida;
  });
  const coluna = campo => Int32Array.from(armas, arma => arma[campo]);
  sim.regrasCombate = Object.freeze({
    ...regras,
    armas: Object.freeze(armas),
    armaDoTipo,
    blindagemDoTipo,
    custoDoTipo,
    vidaDoTipo,
    tipoDano: coluna('tipoDano'),
    dano: coluna('dano'),
    recarga: coluna('recarga'),
    alcance: coluna('alcance'),
    alcanceMinimo: coluna('alcanceMinimo'),
    raioArea: coluna('raioArea'),
    velocidade: coluna('velocidade'),
  });
  return sim.regrasCombate;
}

// Index of the kind's weapon in `armas`, appending the kind's own bullets when it names none.
function armaDoTipoDeUnidade(tipo, armas) {
  const arma = tipo.arma;
  if (arma === null || arma === -1) return -1;
  if (typeof arma === 'string') {
    const k = armas.findIndex(a => a.nome === arma);
    if (k < 0) throw new Error(`armas: o tipo ${tipo.nome} usa a arma ${arma}, que não existe`);
    return k;
  }
  if (Number.isInteger(arma)) {
    if (arma < 0 || arma >= armas.length) throw new Error(`armas: o tipo ${tipo.nome} usa a arma ${arma}, que não existe`);
    return arma;
  }
  if (!(tipo.dano > 0)) return -1;
  armas.push(Object.freeze({ nome: tipo.nome, tipoDano: TIPO_DANO.BALA, dano: tipo.dano, recarga: tipo.recarga, alcance: tipo.alcance, alcanceMinimo: 0, raioArea: 0, emArco: 0, velocidade: 0 }));
  return armas.length - 1;
}

// movement classes (dados.js CLASSE: infantry, vehicle, large vehicle) to armour when a kind names none
const BLINDAGEM_DA_CLASSE = [BLINDAGEM.PESSOAL, BLINDAGEM.LEVE, BLINDAGEM.PESADA];

function blindagemDoTipoDeUnidade(tipo) {
  const b = tipo.blindagem;
  if (typeof b === 'string') {
    const k = NOMES_BLINDAGEM.indexOf(b);
    if (k < 0) throw new Error(`armas: o tipo ${tipo.nome} tem a blindagem ${b}, que não existe`);
    return k;
  }
  if (Number.isInteger(b)) {
    if (b < 0 || b >= N_BLINDAGEM) throw new Error(`armas: o tipo ${tipo.nome} tem a blindagem ${b}, que não existe`);
    return b;
  }
  return BLINDAGEM_DA_CLASSE[tipo.classe] ?? BLINDAGEM.LEVE;
}
