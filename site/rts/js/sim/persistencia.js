// Save and load: the whole simulation state in one ArrayBuffer (a JSON header with the scalars, then every typed
// array), so a loaded match continues bit for bit like the original. Flow fields are not stored; their keys and
// progress are, and the fields are recomputed on load to the same point.
import { VERSAO_SIMULACAO, comandoParaArray, comandoDeArray } from './contratos.js';
import { montarMapa, NOMES_CAMADAS_EXTRAS } from './mapa.js';
import { camposDoPrototipo } from './dados.js';
import { carregarDados } from './simulacao.js';
import { CAMPOS_ENTIDADE, criarEstado } from './estado.js';
import { resumoDosCaminhos, refazerCaminhos } from './caminhos.js';

const FORMATO = 'rts-estado';
const ASSINATURA = 0x52545345; // "RTSE"

const TIPOS_ARRAY = { Uint8Array, Uint16Array, Int16Array, Int32Array };
// every array starts on an 8-byte boundary
const alinhar = n => (n + 7) & ~7;

// Every typed array of the state, by a stable name.
function arraysDoEstado(sim) {
  const lista = [
    ['mapa.bloqueado', sim.mapa.bloqueado],
    ['mapa.relevo', sim.mapa.relevo],
    ['mapa.nivel', sim.mapa.nivel],
    ...NOMES_CAMADAS_EXTRAS.map(nome => [`mapa.${nome}`, sim.mapa[nome]]),
  ];
  for (const [nome] of CAMPOS_ENTIDADE) lista.push([`entidade.${nome}`, sim[nome]]);
  for (const [nome, valor] of Object.entries(sim.ordens)) lista.push([`ordens.${nome}`, valor]);
  for (let t = 0; t < sim.times; t++) {
    lista.push([`neblina.contagem.${t}`, sim.neblina.contagem[t]]);
    lista.push([`neblina.explorado.${t}`, sim.neblina.explorado[t]]);
  }
  return lista;
}

/** Serialises the state to an ArrayBuffer. */
export function salvar(sim) {
  const arrays = arraysDoEstado(sim);
  const indice = [];
  let deslocamento = 0;
  for (const [nome, array] of arrays) {
    indice.push([nome, array.constructor.name, deslocamento, array.length]);
    deslocamento += alinhar(array.byteLength);
  }
  const cabecalho = {
    formato: FORMATO,
    versao: VERSAO_SIMULACAO,
    tick: sim.tick,
    opcoes: sim.opcoes,
    // with design data the options carry the files; otherwise the kinds go in the prototype's form
    tipos: sim.opcoes.dados ? null : sim.tipos.map(camposDoPrototipo),
    regras: sim.regras,
    capacidade: sim.capacidade,
    times: sim.times,
    largura: sim.mapa.largura,
    altura: sim.mapa.altura,
    bases: sim.mapa.bases,
    nos: sim.mapa.nos,
    sorteio: sim.sorteio.estado,
    expansoesPorPasso: sim.expansoesPorPasso,
    onda: sim.onda,
    comandos: sim.comandos.map(comandoParaArray),
    caminhos: resumoDosCaminhos(sim.caminhos),
    indice,
  };
  const texto = new TextEncoder().encode(JSON.stringify(cabecalho));
  const inicioDados = alinhar(8 + texto.length);
  const buffer = new ArrayBuffer(inicioDados + deslocamento);
  const vista = new DataView(buffer);
  vista.setUint32(0, ASSINATURA, true);
  vista.setUint32(4, texto.length, true);
  new Uint8Array(buffer, 8, texto.length).set(texto);
  arrays.forEach(([, array], k) => {
    new Uint8Array(buffer, inicioDados + indice[k][2], array.byteLength).set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
  });
  return buffer;
}

/** Rebuilds a simulation from salvar()'s output. */
export function carregar(buffer) {
  const vista = new DataView(buffer);
  if (buffer.byteLength < 8 || vista.getUint32(0, true) !== ASSINATURA) throw new Error('carregar: não é um estado salvo do jogo');
  const tamanho = vista.getUint32(4, true);
  const cabecalho = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 8, tamanho)));
  if (cabecalho.formato !== FORMATO) throw new Error('carregar: formato desconhecido');
  if (cabecalho.versao !== VERSAO_SIMULACAO) throw new Error(`carregar: estado da versão ${cabecalho.versao}, a simulação é a ${VERSAO_SIMULACAO}`);
  const inicioDados = alinhar(8 + tamanho);
  const ler = new Map(
    cabecalho.indice.map(([nome, tipo, deslocamento, comprimento]) => {
      const Tipo = TIPOS_ARRAY[tipo];
      if (!Tipo) throw new Error(`carregar: tipo de array inesperado ${tipo}`);
      // copy out, so the state never aliases the caller's buffer
      return [nome, new Tipo(buffer.slice(inicioDados + deslocamento, inicioDados + deslocamento + comprimento * Tipo.BYTES_PER_ELEMENT))];
    }),
  );
  const mapa = montarMapa({
    largura: cabecalho.largura,
    altura: cabecalho.altura,
    bloqueado: ler.get('mapa.bloqueado'),
    relevo: ler.get('mapa.relevo'),
    nivel: ler.get('mapa.nivel'),
    ...Object.fromEntries(NOMES_CAMADAS_EXTRAS.map(nome => [nome, ler.get(`mapa.${nome}`)])),
    bases: cabecalho.bases,
    nos: cabecalho.nos,
  });
  const sim = criarEstado({
    opcoes: { ...cabecalho.opcoes, expansoesPorPasso: cabecalho.expansoesPorPasso },
    mapa,
    dados: carregarDados(cabecalho.opcoes.dados ? cabecalho.opcoes : { tipos: cabecalho.tipos }),
    regras: cabecalho.regras,
    capacidade: cabecalho.capacidade,
    times: cabecalho.times,
    semente: 0,
  });
  sim.tick = cabecalho.tick;
  sim.sorteio.estado = cabecalho.sorteio;
  sim.onda = cabecalho.onda;
  sim.comandos = cabecalho.comandos.map(comandoDeArray);
  for (const [nome, array] of arraysDoEstado(sim)) {
    if (nome.startsWith('mapa.')) continue;
    const salvo = ler.get(nome);
    if (!salvo || salvo.length !== array.length) throw new Error(`carregar: falta ou não confere ${nome}`);
    array.set(salvo);
  }
  refazerCaminhos(sim.caminhos, cabecalho.caminhos);
  return sim;
}
