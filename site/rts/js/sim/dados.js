// Game data schema (C5) and its validator: every number the simulation reads from data must be an integer inside a
// known range, checked once at load, so no float or typo reaches the deterministic state. The design front writes the
// numbers in site/rts/dados/{unidades,predios,economia,pesquisas,armas}.json in readable integer units (milliseconds
// in multiples of 100, tenths of a cell, hundredths of a cell per second, percent, enums as text, references by name);
// compilarDados() checks them and turns them into the simulation's kinds, in ticks and world units.
// Kind indices: the units in file order, then the buildings in file order, then the built-in neutral kinds (a battery
// pile and a spark of spilled charge). DADOS_PROTOTIPO keeps the prototype's two vehicles for the old benches.
// Runs in the worker, in Node and on the page (plain ES module, no Node API).
import { FP, CATEGORIA } from './contratos.js';
import { validarRegrasCombate } from './armas.js';

/** Movement classes: who fits where and who collides with whom. */
export const CLASSE = Object.freeze({ INFANTARIA: 0, VEICULO: 1, VEICULO_GRANDE: 2 });
/** Armour classes of the damage matrix (combat module). */
export const BLINDAGEM = Object.freeze({ PESSOAL: 0, LEVE: 1, PESADA: 2, ESTRUTURA: 3 });
/** How a building gets built: in the headquarters' construction lane, or raised on site by a unit. */
export const CONSTRUIDO_POR = Object.freeze({ FILA: 0, UNIDADE: 1 });

const CLASSES = { infantaria: CLASSE.INFANTARIA, veiculo: CLASSE.VEICULO, veiculoGrande: CLASSE.VEICULO_GRANDE };
const BLINDAGENS = { pessoal: BLINDAGEM.PESSOAL, leve: BLINDAGEM.LEVE, pesada: BLINDAGEM.PESADA, estrutura: BLINDAGEM.ESTRUTURA };
const FACCOES = ['religadores', 'desligados', 'faccao-3', 'neutro'];
const POR = { fila: CONSTRUIDO_POR.FILA, unidade: CONSTRUIDO_POR.UNIDADE };

// ---------- conversions from the file units ----------

// 30 ticks per second: 100 ms are exactly 3 ticks
const passosDeMs = ms => Math.trunc((ms * 3) / 100);
const mundoDeDecimos = d => Math.trunc((d * FP) / 10);
const mundoPorPassoDeCentesimos = v => Math.trunc((v * FP) / 3000);

// ---------- a small declarative checker ----------

// Field rules: ['int', min, max] (with an optional default as 4th item), ['ms', min, max] (multiple of 100),
// ['enum', table], ['texto'], ['nome'] (a reference, checked later), ['nomes'] (list of references), ['pegada'],
// ['bloco', rules] (an optional object). A rule wrapped in opcional(...) may be missing (or null) and takes its default.
const opcional = (regra, padrao) => ({ regra, padrao });

function conferir(objeto, regras, rotulo, erros) {
  const saida = {};
  if (!objeto || typeof objeto !== 'object' || Array.isArray(objeto)) {
    erros.push(`${rotulo}: não é um objeto`);
    return saida;
  }
  for (const campo of Object.keys(objeto)) if (!(campo in regras)) erros.push(`${rotulo}.${campo}: campo desconhecido`);
  for (const [campo, entrada] of Object.entries(regras)) {
    const ehOpcional = entrada && !Array.isArray(entrada) && 'regra' in entrada;
    const regra = ehOpcional ? entrada.regra : entrada;
    const valor = objeto[campo];
    if (valor === undefined || valor === null) {
      if (ehOpcional) saida[campo] = entrada.padrao;
      else erros.push(`${rotulo}.${campo}: falta`);
      continue;
    }
    saida[campo] = conferirValor(valor, regra, `${rotulo}.${campo}`, erros);
  }
  return saida;
}

function conferirValor(valor, regra, rotulo, erros) {
  const [tipo, a, b] = regra;
  switch (tipo) {
    case 'int':
    case 'ms':
      if (!Number.isInteger(valor)) erros.push(`${rotulo}: ${valor} não é inteiro`);
      else if (valor < a || valor > b) erros.push(`${rotulo}: ${valor} fora de ${a}..${b}`);
      else if (tipo === 'ms' && valor % 100 !== 0) erros.push(`${rotulo}: ${valor} ms não é múltiplo de 100`);
      return valor;
    case 'enum':
      if (typeof valor !== 'string' || !(valor in a)) erros.push(`${rotulo}: "${valor}" não é um de ${Object.keys(a).join(', ')}`);
      return a[valor] ?? 0;
    case 'faccao':
      if (!FACCOES.includes(valor)) erros.push(`${rotulo}: facção "${valor}" desconhecida`);
      return valor;
    case 'texto':
      if (typeof valor !== 'string') erros.push(`${rotulo}: não é texto`);
      return String(valor);
    case 'nome':
      if (typeof valor !== 'string' || !/^[a-z0-9-]+$/.test(valor)) erros.push(`${rotulo}: nome inválido "${valor}"`);
      return valor;
    case 'nomes':
      if (!Array.isArray(valor)) {
        erros.push(`${rotulo}: não é uma lista`);
        return [];
      }
      valor.forEach((nome, k) => conferirValor(nome, ['nome'], `${rotulo}[${k}]`, erros));
      return valor.slice();
    case 'pegada':
      if (!Array.isArray(valor) || valor.length !== 2 || !valor.every(v => Number.isInteger(v) && v >= 1 && v <= 8)) erros.push(`${rotulo}: pegada deve ser [largura, altura] de 1 a 8 células`);
      return Array.isArray(valor) ? valor.slice(0, 2) : [1, 1];
    case 'bloco':
      return conferir(valor, a, rotulo, erros);
    case 'livre':
      // passed through untouched for another module (combat abilities, terrain modifiers)
      return JSON.parse(JSON.stringify(valor));
    default:
      throw new Error(`dados: regra desconhecida ${tipo}`);
  }
}

function lerArquivo(arquivo, lista, rotulo, erros) {
  if (!arquivo || typeof arquivo !== 'object') {
    erros.push(`${rotulo}: falta o arquivo`);
    return [];
  }
  if (arquivo.versao !== 1) erros.push(`${rotulo}: versão ${arquivo.versao}, o validador lê a 1`);
  if (!Array.isArray(arquivo[lista])) {
    erros.push(`${rotulo}: falta a lista "${lista}"`);
    return [];
  }
  return arquivo[lista];
}

// ---------- file schemas ----------

const ESQUEMA_COLETA = {
  carga: ['int', 1, 10000],
  carregarMs: ['ms', 0, 60000],
  descarregarMs: ['ms', 0, 60000],
  recolherFaiscaMs: ['ms', 0, 60000],
};

const ESQUEMA_UNIDADE_ARQUIVO = {
  nome: ['nome'],
  faccao: ['faccao'],
  papel: opcional(['texto'], ''),
  asset: opcional(['texto'], ''),
  classe: ['enum', CLASSES],
  blindagem: ['enum', BLINDAGENS],
  eletrico: opcional(['int', 0, 1], 0),
  custo: ['int', 0, 100000],
  tempoMs: ['ms', 100, 600000],
  lotacao: ['int', 0, 20],
  nivel: opcional(['int', 1, 3], 1),
  limite: opcional(['int', 0, 100], 0),
  vida: ['int', 1, 100000],
  velocidade: ['int', 3, 3000], // hundredths of a cell per second
  raio: ['int', 1, 40], // collision radius, tenths of a cell
  visao: ['int', 1, 15],
  giroCorpo: ['int', 1, 128], // angle units per tick
  giroTorre: ['int', 1, 128],
  arma: opcional(['nome'], null),
  coletor: opcional(['int', 0, 1], 0),
  coleta: opcional(['bloco', ESQUEMA_COLETA], null),
  reparo: opcional(['livre'], null),
  ergue: opcional(['nomes'], []),
  religa: opcional(['int', 0, 1], 0),
  habilidade: opcional(['livre'], null),
  terreno: opcional(['livre'], null),
  naRede: opcional(['livre'], null),
};

const ESQUEMA_PREDIO_ARQUIVO = {
  nome: ['nome'],
  faccao: ['faccao'],
  papel: opcional(['texto'], ''),
  asset: opcional(['texto'], ''),
  pegada: ['pegada'],
  custo: ['int', 0, 100000],
  tempoMs: ['ms', 0, 600000],
  vida: ['int', 1, 1000000],
  blindagem: opcional(['enum', BLINDAGENS], BLINDAGEM.ESTRUTURA),
  eletrico: opcional(['int', 0, 1], 0),
  visao: ['int', 0, 15],
  raioRede: opcional(['int', 0, 32], 0),
  raizRede: opcional(['int', 0, 1], null), // defaults to filaConstrucao: the headquarters powers its own network
  raioConstrucao: opcional(['int', 0, 32], 0),
  deposito: opcional(['int', 0, 1], 0),
  filaConstrucao: opcional(['int', 0, 1], 0),
  constroi: opcional(['nomes'], []),
  produz: opcional(['nomes'], []),
  arma: opcional(['nome'], null),
  nivel: opcional(['int', 1, 3], 1),
  requer: opcional(['nomes'], []),
  ventosa: opcional(['int', 0, 1], 0),
  construidoPor: opcional(['enum', POR], CONSTRUIDO_POR.FILA),
  religavel: opcional(['int', 0, 1], 0),
  tempoReligarMs: opcional(['ms', 0, 600000], 0),
  destrutivel: opcional(['int', 0, 1], 1),
  limite: opcional(['int', 0, 100], 0),
  holofote: opcional(['livre'], null), // read by the combat module
};

const ESQUEMA_ECONOMIA = {
  versao: ['int', 1, 1],
  lotacaoMaxima: ['int', 1, 1000],
  saturacao: ['int', 1, 16],
  cargaDerramada: ['bloco', { porcento: ['int', 0, 100], duracaoMs: ['ms', 100, 600000] }],
  vento: ['bloco', { intervaloMs: ['ms', 1000, 3600000], lote: ['int', 0, 100000], avisoMs: ['ms', 0, 600000], primeiraMs: opcional(['ms', 0, 3600000], null) }],
  foraDaRede: ['bloco', { producaoPorcento: ['int', 0, 100], defesasParam: ['int', 0, 1] }],
  reciclarPorcento: ['int', 0, 100],
  reparoCustoPorcento: ['int', 0, 100],
  faiscaCarga: ['int', 1, 10000],
  pilhaCarga: opcional(['int', 1, 1000000], 1500),
  cargaInicial: opcional(['int', 0, 1000000], 0),
  distanciaMinimaPilha: opcional(['int', 0, 32], 0),
};

const ESQUEMA_PESQUISA = {
  nome: ['nome'],
  predio: ['nome'],
  custo: ['int', 0, 100000],
  tempoMs: ['ms', 100, 600000],
  papel: opcional(['texto'], ''),
  efeito: opcional(['livre'], null), // read by the research module
  requer: opcional(['nomes'], []),
};

/** Economy rules when the data has no economia.json (the prototype and the old replays). */
export const ECONOMIA_PADRAO = Object.freeze({
  lotacaoMaxima: 60,
  saturacao: 3,
  derramadaPorcento: 100,
  duracaoFaisca: passosDeMs(90000),
  intervaloRajada: passosDeMs(120000),
  loteRajada: 80,
  avisoRajada: passosDeMs(15000),
  primeiraRajada: passosDeMs(120000),
  producaoForaDaRede: 50,
  defesasParamForaDaRede: 1,
  reciclarPorcento: 50,
  reparoCustoPorcento: 50,
  faiscaCarga: 25,
  pilhaCarga: 1500,
  cargaInicial: 0,
  distanciaMinimaPilha: 0,
});

// ---------- the simulation's kinds ----------

// Every field a compiled kind has, with the value a kind gets when its source says nothing. The simulation and the
// presentation read kinds only through these names.
const PADRAO_TIPO = Object.freeze({
  categoria: CATEGORIA.UNIDADE,
  faccao: '',
  asset: '',
  pegada: [1, 1],
  custo: 0,
  tempo: 0,
  lotacao: 0,
  nivel: 1,
  limite: 0,
  vida: 1,
  velocidade: 0,
  raio: 64,
  visao: 0,
  giroCorpo: 8,
  giroTorre: 8,
  classe: CLASSE.VEICULO,
  blindagem: BLINDAGEM.LEVE,
  eletrico: 0,
  arma: -1,
  alcance: 0,
  dano: 0,
  recarga: 1,
  coletor: 0,
  capacidade: 0,
  carregar: 0,
  descarregar: 0,
  recolher: 0,
  produz: [],
  constroi: [],
  ergue: [],
  requer: [],
  raioRede: 0,
  raizRede: 0,
  precisaRede: 0,
  raioConstrucao: 0,
  exigeVentosa: 0,
  deposito: 0,
  filaConstrucao: 0,
  construidoPor: CONSTRUIDO_POR.FILA,
  religavel: 0,
  tempoReligar: 0,
  destrutivel: 1,
  extras: null,
});

function congelarTipo(tipo) {
  const final = { ...PADRAO_TIPO, ...tipo };
  for (const campo of ['pegada', 'produz', 'constroi', 'ergue', 'requer']) final[campo] = Object.freeze(final[campo].slice());
  if (final.extras) final.extras = Object.freeze(final.extras);
  return Object.freeze(final);
}

/** Built-in neutral kinds every compiled data set ends with. */
export const NOME_PILHA = 'pilha';
export const NOME_FAISCA = 'faisca';
const TIPOS_EMBUTIDOS = Object.freeze([
  { nome: NOME_PILHA, categoria: CATEGORIA.RECURSO, faccao: 'neutro', pegada: [1, 1], vida: 1, raio: 400, destrutivel: 0, blindagem: BLINDAGEM.ESTRUTURA },
  { nome: NOME_FAISCA, categoria: CATEGORIA.FAISCA, faccao: 'neutro', pegada: [1, 1], vida: 1, raio: 128, destrutivel: 0, blindagem: BLINDAGEM.ESTRUTURA },
]);

// The weapon fields the kind takes from armas.json; the combat module validates the rest of that file (the damage
// matrix, cover, height, veterancy) itself.
function lerArmas(arquivo, erros) {
  if (!arquivo) return { lista: [], indice: new Map(), bruto: null };
  const lista = lerArquivo(arquivo, 'armas', 'armas.json', erros);
  const indice = new Map();
  lista.forEach((arma, k) => {
    if (!arma || typeof arma.nome !== 'string') erros.push(`armas.json: arma ${k} sem nome`);
    else if (indice.has(arma.nome)) erros.push(`armas.json: arma "${arma.nome}" repetida`);
    else indice.set(arma.nome, k);
    for (const campo of ['dano', 'recargaMs', 'alcance']) {
      if (arma && arma[campo] !== undefined && !Number.isInteger(arma[campo])) erros.push(`armas.json: ${arma.nome}.${campo} não é inteiro`);
    }
  });
  return { lista, indice, bruto: JSON.parse(JSON.stringify(arquivo)) };
}

/**
 * Validates the design data and compiles it into the simulation's kinds.
 * @param {{unidades: object, predios: object, economia?: object, pesquisas?: object, armas?: object}} dados the JSON files
 * @returns {{tipos: readonly object[], economia: object, pesquisas: readonly object[], armas: object|null, indice: Map<string, number>}}
 */
export function compilarDados(dados) {
  const erros = [];
  const unidades = lerArquivo(dados?.unidades, 'unidades', 'unidades.json', erros).map((u, k) => conferir(u, ESQUEMA_UNIDADE_ARQUIVO, `unidades.json[${u?.nome ?? k}]`, erros));
  const predios = lerArquivo(dados?.predios, 'predios', 'predios.json', erros).map((p, k) => conferir(p, ESQUEMA_PREDIO_ARQUIVO, `predios.json[${p?.nome ?? k}]`, erros));
  const armas = lerArmas(dados?.armas, erros);
  if (armas.bruto) try { validarRegrasCombate(armas.bruto); } catch (erro) { erros.push(erro.message); } // the rest of armas.json, by the combat module
  const economiaArquivo = dados?.economia ? conferir(dados.economia, ESQUEMA_ECONOMIA, 'economia.json', erros) : null;
  const pesquisasArquivo = dados?.pesquisas ? lerArquivo(dados.pesquisas, 'pesquisas', 'pesquisas.json', erros).map((p, k) => conferir(p, ESQUEMA_PESQUISA, `pesquisas.json[${p?.nome ?? k}]`, erros)) : [];

  // one index space for every kind
  const indice = new Map();
  const nomes = [...unidades.map(u => u.nome), ...predios.map(p => p.nome), ...TIPOS_EMBUTIDOS.map(t => t.nome)];
  nomes.forEach((nome, k) => {
    if (indice.has(nome)) erros.push(`dados: o nome "${nome}" aparece duas vezes`);
    else indice.set(nome, k);
  });
  const numPredios = new Set(predios.map(p => p.nome));
  const numUnidades = new Set(unidades.map(u => u.nome));
  const referencia = (nome, rotulo, conjunto, oQue) => {
    if (!conjunto.has(nome)) {
      erros.push(`${rotulo}: "${nome}" não é ${oQue}`);
      return -1;
    }
    return indice.get(nome);
  };
  const referencias = (lista, rotulo, conjunto, oQue) => lista.map(nome => referencia(nome, rotulo, conjunto, oQue));
  const daArma = (nome, rotulo) => {
    if (nome === null) return { arma: -1, alcance: 0, dano: 0, recarga: 1 };
    const k = armas.indice.get(nome);
    if (k === undefined) {
      erros.push(`${rotulo}.arma: "${nome}" não está em armas.json`);
      return { arma: -1, alcance: 0, dano: 0, recarga: 1 };
    }
    const a = armas.lista[k];
    return { arma: k, alcance: mundoDeDecimos(a.alcance ?? 0), dano: a.dano ?? 0, recarga: Math.max(1, passosDeMs(a.recargaMs ?? 0)) };
  };

  const tipos = [];
  for (const u of unidades) {
    const rotulo = `unidades.json[${u.nome}]`;
    if (u.coletor === 1 && !u.coleta) erros.push(`${rotulo}: coletor sem o bloco coleta`);
    const coleta = u.coleta ?? { carga: 0, carregarMs: 0, descarregarMs: 0, recolherFaiscaMs: 0 };
    tipos.push({
      nome: u.nome,
      categoria: CATEGORIA.UNIDADE,
      faccao: u.faccao,
      asset: u.asset,
      custo: u.custo,
      tempo: passosDeMs(u.tempoMs),
      lotacao: u.lotacao,
      nivel: u.nivel,
      limite: u.limite,
      vida: u.vida,
      velocidade: Math.max(1, mundoPorPassoDeCentesimos(u.velocidade)),
      raio: Math.max(64, mundoDeDecimos(u.raio)),
      visao: u.visao,
      giroCorpo: u.giroCorpo,
      giroTorre: u.giroTorre,
      classe: u.classe,
      blindagem: u.blindagem,
      eletrico: u.eletrico,
      ...daArma(u.arma, rotulo),
      coletor: u.coletor,
      capacidade: coleta.carga,
      carregar: passosDeMs(coleta.carregarMs),
      descarregar: passosDeMs(coleta.descarregarMs),
      recolher: passosDeMs(coleta.recolherFaiscaMs),
      ergue: referencias(u.ergue, `${rotulo}.ergue`, numPredios, 'um prédio'),
      extras: { reparo: u.reparo, religa: u.religa, habilidade: u.habilidade, terreno: u.terreno, naRede: u.naRede, papel: u.papel },
    });
  }
  for (const p of predios) {
    const rotulo = `predios.json[${p.nome}]`;
    const neutro = p.faccao === 'neutro';
    tipos.push({
      nome: p.nome,
      categoria: neutro && p.religavel ? CATEGORIA.ESTRUTURA : CATEGORIA.PREDIO,
      faccao: p.faccao,
      asset: p.asset,
      pegada: p.pegada,
      custo: p.custo,
      tempo: passosDeMs(p.tempoMs),
      nivel: p.nivel,
      limite: p.limite,
      vida: p.vida,
      raio: Math.trunc((Math.max(p.pegada[0], p.pegada[1]) * FP) / 2),
      visao: p.visao,
      blindagem: p.blindagem,
      eletrico: p.eletrico,
      ...daArma(p.arma, rotulo),
      produz: referencias(p.produz, `${rotulo}.produz`, numUnidades, 'uma unidade'),
      constroi: referencias(p.constroi, `${rotulo}.constroi`, numPredios, 'um prédio'),
      requer: referencias(p.requer, `${rotulo}.requer`, numPredios, 'um prédio'),
      raioRede: p.raioRede,
      raizRede: p.raizRede ?? p.filaConstrucao,
      precisaRede: p.eletrico,
      raioConstrucao: p.raioConstrucao,
      exigeVentosa: p.ventosa,
      deposito: p.deposito,
      filaConstrucao: p.filaConstrucao,
      construidoPor: p.construidoPor,
      religavel: p.religavel,
      tempoReligar: passosDeMs(p.tempoReligarMs),
      destrutivel: p.destrutivel,
      extras: { papel: p.papel, holofote: p.holofote },
    });
    if (p.constroi.length > 0 && !p.filaConstrucao) erros.push(`${rotulo}: constrói prédios sem filaConstrucao`);
  }
  for (const u of unidades) for (const nome of u.ergue) if (numPredios.has(nome) && predios.find(p => p.nome === nome).construidoPor !== CONSTRUIDO_POR.UNIDADE) erros.push(`unidades.json[${u.nome}].ergue: "${nome}" não é construído por unidade`);
  for (const t of TIPOS_EMBUTIDOS) tipos.push(t);

  const pesquisas = pesquisasArquivo.map(p => ({
    nome: p.nome,
    predio: referencia(p.predio, `pesquisas.json[${p.nome}].predio`, numPredios, 'um prédio'),
    custo: p.custo,
    tempo: passosDeMs(p.tempoMs),
    requer: referencias(p.requer, `pesquisas.json[${p.nome}].requer`, numPredios, 'um prédio'),
    efeito: p.efeito,
  }));

  let economia = ECONOMIA_PADRAO;
  if (economiaArquivo) {
    const e = economiaArquivo;
    economia = Object.freeze({
      lotacaoMaxima: e.lotacaoMaxima,
      saturacao: e.saturacao,
      derramadaPorcento: e.cargaDerramada.porcento,
      duracaoFaisca: passosDeMs(e.cargaDerramada.duracaoMs),
      intervaloRajada: passosDeMs(e.vento.intervaloMs),
      loteRajada: e.vento.lote,
      avisoRajada: passosDeMs(e.vento.avisoMs),
      primeiraRajada: passosDeMs(e.vento.primeiraMs ?? e.vento.intervaloMs),
      producaoForaDaRede: e.foraDaRede.producaoPorcento,
      defesasParamForaDaRede: e.foraDaRede.defesasParam,
      reciclarPorcento: e.reciclarPorcento,
      reparoCustoPorcento: e.reparoCustoPorcento,
      faiscaCarga: e.faiscaCarga,
      pilhaCarga: e.pilhaCarga,
      cargaInicial: e.cargaInicial,
      distanciaMinimaPilha: e.distanciaMinimaPilha,
    });
    if (economia.avisoRajada >= economia.intervaloRajada) erros.push('economia.json: o aviso da rajada precisa ser menor que o intervalo');
  }

  if (erros.length > 0) throw new Error(`dados inválidos:\n${erros.join('\n')}`);
  return {
    tipos: Object.freeze(tipos.map(congelarTipo)),
    economia,
    pesquisas: Object.freeze(pesquisas.map(p => Object.freeze(p))),
    armas: armas.bruto,
    indice,
  };
}

// ---------- the prototype's internal kinds ----------

// field: [minimum, maximum]; all integers, in world units, ticks or angle units as noted
const ESQUEMA_UNIDADE = Object.freeze({
  velocidade: [1, FP], // world units per tick
  vida: [1, 100000],
  alcance: [0, 32 * FP], // world units
  dano: [0, 100000],
  recarga: [1, 3000], // ticks between shots
  raio: [64, 4 * FP], // collision radius, world units
  visao: [1, 15], // sight radius, cells
  giroCorpo: [1, 128], // angle units per tick
  giroTorre: [1, 128],
  classe: [0, 2], // CLASSE.*
  coletor: [0, 1], // 1: harvesters of the same kind do not collide with each other
});

/**
 * Checks a list of unit kinds already in the simulation's units (the prototype's form) and returns them frozen, with
 * every other kind field at its default.
 * @param {object[]} tipos
 * @returns {readonly object[]}
 */
export function validarTiposUnidade(tipos) {
  if (!Array.isArray(tipos) || tipos.length === 0) throw new Error('dados: a lista de tipos de unidade está vazia');
  const erros = [];
  tipos.forEach((tipo, indice) => {
    if (typeof tipo.nome !== 'string' || !/^[a-z0-9-]+$/.test(tipo.nome)) erros.push(`tipo ${indice}: nome inválido`);
    for (const [campo, [minimo, maximo]] of Object.entries(ESQUEMA_UNIDADE)) {
      const valor = tipo[campo];
      if (!Number.isInteger(valor)) erros.push(`${tipo.nome ?? indice}.${campo}: ${valor} não é inteiro`);
      else if (valor < minimo || valor > maximo) erros.push(`${tipo.nome ?? indice}.${campo}: ${valor} fora de ${minimo}..${maximo}`);
    }
    // a kind that already went through here (or through compilarDados) carries every compiled field
    for (const campo of Object.keys(tipo)) if (campo !== 'nome' && !(campo in ESQUEMA_UNIDADE) && !(campo in PADRAO_TIPO)) erros.push(`${tipo.nome ?? indice}.${campo}: campo desconhecido`);
  });
  if (erros.length > 0) throw new Error(`dados inválidos:\n${erros.join('\n')}`);
  return Object.freeze(tipos.map(tipo => congelarTipo({ categoria: CATEGORIA.UNIDADE, ...tipo })));
}

/** The kind fields a saved state or a prototype replay carries: the prototype's form. */
export const camposDoPrototipo = tipo => Object.fromEntries(['nome', ...Object.keys(ESQUEMA_UNIDADE)].map(campo => [campo, tipo[campo]]));

/** The prototype's vehicles: a fast fragile buggy and a slow tough tank. */
export const DADOS_PROTOTIPO = validarTiposUnidade([
  { nome: 'buggy', velocidade: 88, vida: 60, alcance: 4 * FP, dano: 9, recarga: 18, raio: 330, visao: 7, giroCorpo: 8, giroTorre: 13, classe: CLASSE.VEICULO, coletor: 0 },
  { nome: 'tanque', velocidade: 52, vida: 160, alcance: 6 * FP, dano: 26, recarga: 42, raio: 440, visao: 7, giroCorpo: 8, giroTorre: 13, classe: CLASSE.VEICULO, coletor: 0 },
]);

/** What MapaEstatico.tipos carries of each kind (contratos.js, TipoEstatico). */
export function tipoEstatico(tipo) {
  return {
    nome: tipo.nome,
    categoria: tipo.categoria,
    faccao: tipo.faccao,
    asset: tipo.asset,
    pegada: tipo.pegada.slice(),
    custo: tipo.custo,
    tempo: tipo.tempo,
    lotacao: tipo.lotacao,
    vida: tipo.vida,
    visao: tipo.visao,
    produz: tipo.produz.slice(),
    constroi: tipo.constroi.slice(),
    ergue: tipo.ergue.slice(),
    requer: tipo.requer.slice(),
    raioRede: tipo.raioRede,
    raizRede: tipo.raizRede,
    precisaRede: tipo.precisaRede,
    raioConstrucao: tipo.raioConstrucao,
    exigeVentosa: tipo.exigeVentosa,
    filaConstrucao: tipo.filaConstrucao,
    deposito: tipo.deposito,
    coletor: tipo.coletor,
    capacidade: tipo.capacidade,
    limite: tipo.limite,
    holofote: tipo.extras?.holofote ?? null,
    arma: tipo.arma, // index of its weapon in armas.json, -1 none
  };
}
