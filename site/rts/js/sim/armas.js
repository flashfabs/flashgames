// Combat rules (C5, armas.json): damage kinds against armour classes, cover, height advantage, veterancy and the
// weapons, validated once and converted from design units (tenths of a cell, milliseconds, percent) to the
// simulation's integers (world units, ticks, percent). The numbers belong to the design front; the tables an
// armas.json leaves out take the plan's starting numbers of REGRAS_COMBATE_PADRAO, which goes through the same
// validator. The data compiler (dados.js) gives each kind the index of its weapon in this file's list.
import { FP, PASSOS_POR_SEGUNDO, DONO_NEUTRO, CATEGORIA } from './contratos.js';

export const TIPO_DANO = Object.freeze({ BALA: 0, PERFURANTE: 1, EXPLOSIVO: 2, PANE: 3 });
export const NOMES_TIPO_DANO = Object.freeze(['bala', 'perfurante', 'explosivo', 'pane']);
export const BLINDAGEM = Object.freeze({ PESSOAL: 0, LEVE: 1, PESADA: 2, ESTRUTURA: 3 });
export const NOMES_BLINDAGEM = Object.freeze(['pessoal', 'leve', 'pesada', 'estrutura']);
/** Cover class of a map cell (the map's `cobertura` layer); only personal armour benefits from it. */
export const COBERTURA = Object.freeze({ NENHUMA: 0, MATO: 1, RUINA: 2 });
export const NOMES_COBERTURA = Object.freeze(['nenhuma', 'mato', 'ruina']);
/** Veterancy levels above the recruit (0). */
export const NIVEIS_VETERANIA = 3;
/** Levels of harvesters (by trips) and support units (by health repaired). */
export const NIVEIS_VETERANIA_ESPECIAL = 2;
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
  cobertura: { mato: [85, 90, 100, 100], ruina: [75, 85, 100, 100] },
  elevacao: { danoAcima: 15, danoAbaixo: 25, alcanceAcima: 5 },
  veterania: {
    limiares: [100, 250, 500],
    dano: [0, 5, 10, 15],
    resistencia: [0, 5, 10, 13],
    recarga: [0, 0, 5, 10],
    coletor: { viagens: [12, 30], velocidade: [10, 20] },
    suporte: { vidaReparada: [1500, 4000] },
  },
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
  dispersao: [0, 50], // an arcing shell lands up to this percent of the distance away from its aim
});
const OPCIONAIS_ARMA = Object.freeze({ alcanceMinimo: 0, raioArea: 0, emArco: 0, velocidadeProjetil: 0, dispersao: 0 });
const ESQUEMA_LENTIDAO = Object.freeze({ porcento: [0, 90], duracaoMs: [0, 60000], raio: [0, 80], noChao: [0, 1], soVeiculo: [0, 1] });
const CAMPOS_REGRAS = ['versao', 'matriz', 'cobertura', 'elevacao', 'veterania', 'armas'];
const CAMPOS_VETERANIA = ['limiares', 'dano', 'resistencia', 'recarga', 'coletor', 'suporte'];

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

const crescente = lista => Array.isArray(lista) && lista.every((v, k) => k === 0 || v > lista[k - 1]);

// The slow a hit leaves (on the target, or on the ground around the blast with noChao), in simulation units.
function validarEfeito(erros, onde, efeito) {
  if (efeito === undefined || efeito === null) return null;
  if (efeito?.tipo !== 'lentidao') {
    erros.push(`${onde}.tipo: só lentidao`);
    return null;
  }
  const valores = { raio: 0, noChao: 0, soVeiculo: 0, ...efeito };
  for (const [campo, [minimo, maximo]] of Object.entries(ESQUEMA_LENTIDAO)) conferirInteiro(erros, `${onde}.${campo}`, valores[campo], minimo, maximo);
  for (const campo of Object.keys(efeito)) if (campo !== 'tipo' && !(campo in ESQUEMA_LENTIDAO)) erros.push(`${onde}.${campo}: campo desconhecido`);
  return Object.freeze({ porcento: valores.porcento, duracao: msParaPassos(valores.duracaoMs), raio: decimosParaMundo(valores.raio), noChao: valores.noChao, soVeiculo: valores.soVeiculo });
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
  for (const campo of Object.keys(arma)) if (!['nome', 'tipoDano', 'efeito'].includes(campo) && !(campo in ESQUEMA_ARMA)) erros.push(`${onde}.${campo}: campo desconhecido`);
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
    dispersao: valores.dispersao,
    lentidao: validarEfeito(erros, `${onde}.efeito`, arma.efeito),
  });
}

/**
 * Checks armas.json (tables it leaves out come from REGRAS_COMBATE_PADRAO) and returns the rules in simulation units:
 * matriz[tipoDano * 4 + blindagem] and cobertura[classe * 4 + tipoDano] in percent (row 0 of cobertura is 100),
 * height bonuses in percent per level and world units, veterancy thresholds in percent of the unit's cost and the
 * per-level bonuses, and the weapons with ranges in world units and reload in ticks.
 * @param {object} dados
 */
export function validarRegrasCombate(dados) {
  const erros = [];
  if (!dados || typeof dados !== 'object') throw new Error('armas: os dados de combate não são um objeto');
  if (dados.versao !== VERSAO_ARMAS) erros.push(`versao: ${dados.versao}, esperava ${VERSAO_ARMAS}`);
  const tabela = nome => dados[nome] ?? REGRAS_COMBATE_PADRAO[nome];
  const matriz = new Int16Array(N_DANO * N_BLINDAGEM);
  NOMES_TIPO_DANO.forEach((nome, td) => {
    const linha = tabela('matriz')?.[nome];
    conferirLista(erros, `matriz.${nome}`, linha, N_BLINDAGEM, MINIMO_MATRIZ, 400);
    if (Array.isArray(linha)) for (let bl = 0; bl < N_BLINDAGEM; bl++) matriz[td * N_BLINDAGEM + bl] = linha[bl] | 0;
  });
  const cobertura = new Int16Array(NOMES_COBERTURA.length * N_DANO).fill(100);
  NOMES_COBERTURA.slice(1).forEach((nome, k) => {
    const linha = tabela('cobertura')?.[nome];
    conferirLista(erros, `cobertura.${nome}`, linha, N_DANO, 0, 100);
    if (Array.isArray(linha)) for (let td = 0; td < N_DANO; td++) cobertura[(k + 1) * N_DANO + td] = linha[td] | 0;
  });
  const elevacao = tabela('elevacao') ?? {};
  conferirInteiro(erros, 'elevacao.danoAcima', elevacao.danoAcima, 0, 100);
  conferirInteiro(erros, 'elevacao.danoAbaixo', elevacao.danoAbaixo, 0, 30);
  conferirInteiro(erros, 'elevacao.alcanceAcima', elevacao.alcanceAcima, 0, 40);
  const vet = { ...REGRAS_COMBATE_PADRAO.veterania, ...tabela('veterania') };
  conferirLista(erros, 'veterania.limiares', vet.limiares, NIVEIS_VETERANIA, 1, 10000);
  if (!crescente(vet.limiares)) erros.push('veterania.limiares: precisam crescer');
  conferirLista(erros, 'veterania.dano', vet.dano, NIVEIS_VETERANIA + 1, 0, 100);
  conferirLista(erros, 'veterania.resistencia', vet.resistencia, NIVEIS_VETERANIA + 1, 0, 80);
  conferirLista(erros, 'veterania.recarga', vet.recarga, NIVEIS_VETERANIA + 1, 0, 80);
  conferirLista(erros, 'veterania.coletor.viagens', vet.coletor?.viagens, NIVEIS_VETERANIA_ESPECIAL, 1, 10000);
  conferirLista(erros, 'veterania.coletor.velocidade', vet.coletor?.velocidade, NIVEIS_VETERANIA_ESPECIAL, 0, 100);
  conferirLista(erros, 'veterania.suporte.vidaReparada', vet.suporte?.vidaReparada, NIVEIS_VETERANIA_ESPECIAL, 1, 10000000);
  if (!crescente(vet.coletor?.viagens) || !crescente(vet.suporte?.vidaReparada)) erros.push('veterania.coletor e suporte: os limiares precisam crescer');
  for (const campo of Object.keys(vet)) if (!CAMPOS_VETERANIA.includes(campo)) erros.push(`veterania.${campo}: campo desconhecido`);
  if (!Array.isArray(dados.armas)) erros.push('armas: esperava uma lista');
  const armas = (dados.armas ?? []).map((arma, k) => validarArma(erros, arma, k));
  const nomes = new Set();
  for (const arma of armas) {
    if (!arma) continue;
    if (nomes.has(arma.nome)) erros.push(`armas: nome repetido ${arma.nome}`);
    nomes.add(arma.nome);
  }
  for (const campo of Object.keys(dados)) if (!CAMPOS_REGRAS.includes(campo)) erros.push(`${campo}: campo desconhecido`);
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
    viagensColetor: Int32Array.from(vet.coletor.viagens),
    velocidadeColetor: Int16Array.from(vet.coletor.velocidade),
    vidaReparadaSuporte: Int32Array.from(vet.suporte.vidaReparada),
    armas: Object.freeze(armas),
  });
}

/**
 * Per-match combat tables, derived from the rules (the match's armas.json, or the defaults) and the kinds: each
 * kind's weapon, armour, cost, whether it can be targeted and what veterancy it follows, and each weapon's numbers in
 * flat arrays for the hot loop. A kind's `arma` is the index of its weapon in armas.json (or its name; null for none),
 * and a kind with -1 there but its own `dano` (the prototype's form) fires that as bullets; a kind without
 * `blindagem` gets it from its movement class. Rebuilt from the data after a load, so it is not part of the state.
 */
export function combateDe(sim) {
  if (sim.regrasCombate) return sim.regrasCombate;
  const regras = validarRegrasCombate(sim.armas ?? sim.opcoes?.armas ?? REGRAS_COMBATE_PADRAO);
  const armas = regras.armas.slice();
  const n = sim.tipos.length;
  const armaDoTipo = new Int16Array(n).fill(-1);
  const blindagemDoTipo = new Uint8Array(n);
  const custoDoTipo = new Int32Array(n);
  const vidaDoTipo = new Int32Array(n);
  const alvejavel = new Uint8Array(n);
  const coletorDoTipo = new Uint8Array(n);
  const suporteDoTipo = new Uint8Array(n);
  const veiculoDoTipo = new Uint8Array(n);
  const tocaiaDoTipo = new Uint8Array(n);
  // half the footprint of buildings and structures, world units: reach is measured to their edge
  const meiaLargura = new Int32Array(n);
  const meiaAltura = new Int32Array(n);
  sim.tipos.forEach((tipo, t) => {
    armaDoTipo[t] = armaDoTipoDeUnidade(tipo, armas);
    blindagemDoTipo[t] = blindagemDoTipoDeUnidade(tipo);
    custoDoTipo[t] = Math.max(1, tipo.custo || tipo.vida);
    vidaDoTipo[t] = tipo.vida;
    const categoria = tipo.categoria ?? CATEGORIA.UNIDADE;
    // piles, sparks and indestructible kinds are never targets
    alvejavel[t] = tipo.destrutivel !== 0 && categoria !== CATEGORIA.RECURSO && categoria !== CATEGORIA.FAISCA ? 1 : 0;
    coletorDoTipo[t] = tipo.coletor === 1 ? 1 : 0;
    suporteDoTipo[t] = tipo.extras?.reparo ? 1 : 0;
    veiculoDoTipo[t] = categoria === CATEGORIA.UNIDADE && tipo.classe !== 0 ? 1 : 0;
    tocaiaDoTipo[t] = tipo.extras?.habilidade?.tipo === 'tocaia' ? 1 : 0;
    if ((categoria === CATEGORIA.PREDIO || categoria === CATEGORIA.ESTRUTURA) && tipo.pegada) {
      meiaLargura[t] = (tipo.pegada[0] * FP) >> 1;
      meiaAltura[t] = (tipo.pegada[1] * FP) >> 1;
    }
  });
  const coluna = campo => Int32Array.from(armas, arma => arma[campo]);
  sim.regrasCombate = Object.freeze({
    ...regras,
    armas: Object.freeze(armas),
    armaDoTipo,
    blindagemDoTipo,
    custoDoTipo,
    vidaDoTipo,
    alvejavel,
    coletorDoTipo,
    suporteDoTipo,
    veiculoDoTipo,
    tocaiaDoTipo,
    meiaLargura,
    meiaAltura,
    meiaMaxima: Math.max(0, ...meiaLargura, ...meiaAltura),
    // the neutral side (piles, sparks, dead structures waiting to be re-powered) neither shoots nor is shot
    neutro: DONO_NEUTRO,
    tipoDano: coluna('tipoDano'),
    dano: coluna('dano'),
    recarga: coluna('recarga'),
    alcance: coluna('alcance'),
    alcanceMinimo: coluna('alcanceMinimo'),
    raioArea: coluna('raioArea'),
    velocidade: coluna('velocidade'),
    dispersao: coluna('dispersao'),
  });
  return sim.regrasCombate;
}

// Index of the kind's weapon in `armas`, appending the kind's own bullets when it names none but does damage.
function armaDoTipoDeUnidade(tipo, armas) {
  const arma = tipo.arma;
  if (arma === null) return -1;
  if (typeof arma === 'string') {
    const k = armas.findIndex(a => a.nome === arma);
    if (k < 0) throw new Error(`armas: o tipo ${tipo.nome} usa a arma ${arma}, que não existe`);
    return k;
  }
  if (Number.isInteger(arma) && arma >= 0) {
    if (arma >= armas.length) throw new Error(`armas: o tipo ${tipo.nome} usa a arma ${arma}, que não existe`);
    return arma;
  }
  if (!(tipo.dano > 0)) return -1;
  armas.push(Object.freeze({ nome: tipo.nome, tipoDano: TIPO_DANO.BALA, dano: tipo.dano, recarga: tipo.recarga, alcance: tipo.alcance, alcanceMinimo: 0, raioArea: 0, emArco: 0, velocidade: 0, dispersao: 0, lentidao: null }));
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
