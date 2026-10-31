// Mission triggers (C7): conditions and actions in JSON from site/rts/dados/missoes/, compiled once against the unit
// kinds and the map's places, and evaluated inside the deterministic step right after the commands. The mission and
// the map's places come in the simulation options (opcoes.missao, opcoes.lugares), so saves and replays carry them;
// a mission that names its map (`mapa`) runs only on a match that says it is on that map (opcoes.lugares.mapa);
// the evaluator's state (fired triggers, variables, timers, objectives, labels, result) lives in sim.extras.missao.
//
// Mission format, integers only, positions in cells, times in seconds; any number may instead be
// { "facil": a, "normal": b, "dificil": c }, picked by opcoes.dificuldade ('facil', 'normal' or 'dificil', or 0, 1 or
// 2; normal by default):
//   { "versao": 1, "id": "caixa-de-areia", "mapa"?, "titulo"?, "jogadores"? (read by the match setup),
//     "objetivos": [{ "id": "montar", "texto": "<C11 id>", "tipo": "principal" | "opcional" }],
//     "areas": { "<nome>": { "x", "y", "largura", "altura" } | { "x", "y", "raio" } }, "pontos": { "<nome>": [x, y] },
//     "rotas": { "<nome>": [[x, y], ...] },          (looked up in the mission first, then in the map's places)
//     "grupos": { "<nome>": { "etiquetas": ["<rotulo>", ...] } },   (unions of labels under one name; a plain list too)
//     "variaveis": [{ "nome", "valor" }],            (or { "<nome>": <valor> })
//     "gatilhos": [{ "id", "quando": <condição>, "faz": [<ação>, ...], "repete": 0 | 1, "intervaloSegundos": 0,
//                    "ativo": 1 }] }                 ("acoes" works for "faz", and true and false for 1 and 0)
// A label (rótulo) names entities: the `etiqueta` of map entities (several may share one) and the `grupo` of a
// criar action; each entity has one label at most. A "grupo" in a condition or action is a label or a union name, and
// "etiqueta" works wherever "grupo" does.
// Conditions, { "se": <tipo>, ... }:
//   todas | alguma { condicoes: [...] }; nao { condicao }; tempo { segundos } since the start;
//   depoisDe { gatilho, segundos } since that trigger last fired; cronometro { nome } ran out;
//   contagem { jogador?, tipos?, area?, grupo?, minimo?, maximo? } live entities; vivos and grupo { grupo, jogador?,
//   minimo? | vivosMinimo?, maximo? | vivosMaximo? }; dono { grupo, jogador } every live member owned by the player;
//   vida { grupo, maximoPorcento } some live member at or below that health; religando { grupo, jogador? };
//   recursos { jogador | no, minimo?, maximo? } a player's Carga or what a resource node has left;
//   coletores { jogador, minimo | perdidosMinimo } harvesters working, or lost in combat; objetivo { objetivo, estado };
//   atingido { grupo, segundos } some member took damage in the last N s; perto { grupo, jogador, celulas, minimo? }
//   units of the player within N cells of some member; religacao { grupo, jogador?, minimoPorcento? | faltamSegundos? }
//   how far some member's re-powering went;
//   disparou and gatilho { gatilho }; variavel { nome, minimo?,
//   maximo?, igual? }; parado { jogador, segundos } without a command; visto { jogador, area } some cell visible now;
//   pesquisa { jogador, pesquisa }; dificuldade { minimo?, maximo? }.
// Actions, { "faz": <tipo>, ... }:
//   mensagem { texto, area? }; aviso { grupo, area, texto? } (AVISO_ATAQUE); objetivo { objetivo, estado: ativo |
//   cumprido | falhou }; criar { jogador, unidades: [{ tipo, quantos }], area | ponto, grupo?, veterania? } (ONDA with
//   a group, SURGIMENTO per unit); ordenar { grupo, ordem: mover | atacarMovendo | patrulhar | parar | segurar,
//   rota | area | ponto, fila? } (fila 1 queues after what the group is doing); atacar { grupo, alvo }; variavel { nome, valor | somar }; cronometro { nome, segundos |
//   parar }; liberar | bloquear { jogador, tipos }; revelar { jogador, area }; recursos { jogador, somar };
//   dono { grupo, jogador }; destruir { grupo }; gatilho { gatilho, ativo }; religavel { grupo, segundos,
//   por?: religa | reparo };
//   pesquisa { jogador, pesquisa }; veterania { grupo, nivel }; luz { cena }; camera { area | ponto };
//   empacotar { grupo, em: <unit kind>, segundos } each building of the group becomes, after N s standing still, a unit
//   of that kind with the same label; desempacotar { grupo, area?, segundos } packed members (inside the area) turn
//   back into their building after N s (empacotar.js);
//   vitoria { jogador }; derrota { jogador }.
// Events (C3): MENSAGEM_MISSAO arg = index in textosDaMissao(missao), x and y at the area's centre (0 without one);
// OBJETIVO arg = objective index * 4 + state (1 active, 2 done, 3 failed); AVISO_ATAQUE and ONDA arg = index in
// rotulosDaMissao(missao); LUZ arg = index in cenasDaMissao(missao); VITORIA and DERROTA arg = player.
import { EVENTO, FP, FP_BITS, PASSOS_POR_SEGUNDO, TIPO_COMANDO, CATEGORIA } from './contratos.js';
import { criarEntidade, emitirEvento, matar, slotVivo, idDoSlot } from './entidades.js';
import { ordenarGrupo, ordenarPatrulha, limparOrdens } from './ordens.js';
import { celulaVisivel } from './neblina.js';
import * as estado from './estado.js';
import { emitirEventoNoPonto, atingidoEm } from './combate.js';
import { definirVeterania } from './veterania.js';
import { trocarDono, sendoReligada, definirTempoReligar, avancarReligar, progressoReligar, POR } from './religar.js';
import { avancarReparo } from './reparo.js';
import { iniciarEmpacotar, iniciarDesempacotar, avancarEmpacotar, faseDe, FASE } from './empacotar.js';
import { pesquisaFeita, concluirPesquisa, liberarTipos, avancarPesquisas } from './pesquisas.js';

export const VERSAO_MISSAO = 1;
/** Triggers are evaluated on every this many ticks, starting at tick 1. */
export const INTERVALO_GATILHOS = 3;
export const ESTADO_OBJETIVO = Object.freeze({ OCULTO: 0, ATIVO: 1, CUMPRIDO: 2, FALHOU: 3 });
export const RESULTADO = Object.freeze({ JOGANDO: 0, VITORIA: 1, DERROTA: 2 });
const NOMES_ESTADO = { ativo: ESTADO_OBJETIVO.ATIVO, cumprido: ESTADO_OBJETIVO.CUMPRIDO, falhou: ESTADO_OBJETIVO.FALHOU };
const ORDENS = { mover: TIPO_COMANDO.MOVER, atacarMovendo: TIPO_COMANDO.ATACAR_MOVENDO, patrulhar: TIPO_COMANDO.PATRULHAR, parar: TIPO_COMANDO.PARAR, segurar: TIPO_COMANDO.SEGURAR_POSICAO };
const DIFICULDADES = ['facil', 'normal', 'dificil'];
/** Difficulty index 0..2 from its name or index; normal for anything else. */
export function indiceDificuldade(d) {
  const k = typeof d === 'string' ? DIFICULDADES.indexOf(d) : Number.isInteger(d) && d >= 0 && d <= 2 ? d : -1;
  return k < 0 ? 1 : k;
}
const MAX_VALOR = 0x3fffffff;
const segundosParaPassos = s => s * PASSOS_POR_SEGUNDO;

// ---------- names the presentation needs, from the mission JSON alone ----------

const acoesDe = gatilho => (Array.isArray(gatilho?.faz) ? gatilho.faz : Array.isArray(gatilho?.acoes) ? gatilho.acoes : []);
const unioesDe = missao => (missao?.grupos && typeof missao.grupos === 'object' ? missao.grupos : {});
const membrosDaUniao = uniao => (Array.isArray(uniao) ? uniao : Array.isArray(uniao?.etiquetas) ? uniao.etiquetas : []);
// "etiqueta" works wherever "grupo" does
const nomeDoGrupo = item => item?.grupo ?? item?.etiqueta;

// Walks every condition and action of the mission in file order.
function percorrer(missao, naCondicao, naAcao) {
  const condicao = c => {
    if (!c || typeof c !== 'object') return;
    naCondicao(c);
    if (Array.isArray(c.condicoes)) c.condicoes.forEach(condicao);
    if (c.condicao) condicao(c.condicao);
  };
  for (const g of Array.isArray(missao?.gatilhos) ? missao.gatilhos : []) {
    condicao(g?.quando);
    for (const a of acoesDe(g)) if (a && typeof a === 'object') naAcao(a);
  }
}

/** C11 text ids in the order MENSAGEM_MISSAO counts them: objectives first, then messages and warnings. */
export function textosDaMissao(missao) {
  const textos = [];
  const somar = t => {
    if (typeof t === 'string' && !textos.includes(t)) textos.push(t);
  };
  for (const o of Array.isArray(missao?.objetivos) ? missao.objetivos : []) somar(o?.texto);
  percorrer(missao, () => {}, a => {
    if (a.faz === 'mensagem' || a.faz === 'aviso') somar(a.texto);
  });
  return textos;
}

/**
 * Labels entities can carry, in the order AVISO_ATAQUE and ONDA count them (the play-test log walks the same way):
 * the unions' members first, then every other group or label the triggers name, conditions before actions.
 */
export function rotulosDaMissao(missao) {
  const unioes = unioesDe(missao);
  const rotulos = [];
  const somar = nome => {
    if (typeof nome === 'string' && !(nome in unioes) && !rotulos.includes(nome)) rotulos.push(nome);
  };
  for (const uniao of Object.values(unioes)) membrosDaUniao(uniao).forEach(somar);
  const doItem = item => {
    somar(nomeDoGrupo(item));
    if (item.faz === 'atacar') somar(item.alvo);
  };
  percorrer(missao, doItem, doItem);
  return rotulos;
}

/** Timer names in the order the evaluator keeps them: as conditions and actions first name them. */
export function cronometrosDaMissao(missao) {
  const nomes = [];
  const somar = item => {
    if ((item.se === 'cronometro' || item.faz === 'cronometro') && !nomes.includes(item.nome)) nomes.push(item.nome);
  };
  percorrer(missao, somar, somar);
  return nomes;
}

/**
 * Sizes and starting values of the evaluator's state, from the mission JSON alone (no kinds, places or nodes), so the
 * state can be made before the map is in: triggers and whether each starts active, variables' starting values at the
 * difficulty, timers and objectives. compilarMissao checks the same file in full.
 */
export function formaDaMissao(missao, dificuldade) {
  const indice = indiceDificuldade(dificuldade);
  const gatilhos = Array.isArray(missao?.gatilhos) ? missao.gatilhos : [];
  const declaradas = Array.isArray(missao?.variaveis) ? missao.variaveis : Object.entries(missao?.variaveis ?? {}).map(([nome, valor]) => ({ nome, valor }));
  const valor = v => {
    const escolhido = v && typeof v === 'object' ? v[DIFICULDADES[indice]] : v;
    return Number.isInteger(escolhido) ? escolhido : 0;
  };
  return {
    gatilhos: gatilhos.length,
    ativos: gatilhos.map(g => (g?.ativo === false || g?.ativo === 0 ? 0 : 1)),
    variaveis: declaradas.map(v => valor(v?.valor ?? 0)),
    cronometros: cronometrosDaMissao(missao).length,
    objetivos: Array.isArray(missao?.objetivos) ? missao.objetivos.length : 0,
  };
}

/** Light scenes in the order LUZ counts them. */
export function cenasDaMissao(missao) {
  const cenas = [];
  percorrer(missao, () => {}, a => {
    if (a.faz === 'luz' && typeof a.cena === 'string' && !cenas.includes(a.cena)) cenas.push(a.cena);
  });
  return cenas;
}

// ---------- compilation ----------

/**
 * Validates a mission and turns it into the evaluator's form: numbers picked by difficulty and converted to ticks and
 * world units, names resolved to indices. Throws one error listing every problem.
 * @param {object} missao
 * @param {{ tipos: readonly object[], lugares?: object, dificuldade?: number, times: number, largura: number, altura: number }} contexto
 */
export function compilarMissao(missao, contexto) {
  const erros = [];
  const { tipos, times, largura, altura } = contexto;
  const lugares = contexto.lugares ?? {};
  const dificuldade = indiceDificuldade(contexto.dificuldade);
  if (!missao || typeof missao !== 'object') throw new Error('missão: não é um objeto');
  if (missao.versao !== VERSAO_MISSAO) erros.push(`versao: ${missao.versao}, esperava ${VERSAO_MISSAO}`);

  const numero = (onde, v, minimo = -MAX_VALOR, maximo = MAX_VALOR) => {
    let valor = v;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (!DIFICULDADES.every(d => d in v)) {
        erros.push(`${onde}: o valor por dificuldade precisa de ${DIFICULDADES.join(', ')}`);
        return 0;
      }
      valor = v[DIFICULDADES[dificuldade]];
    }
    if (!Number.isInteger(valor)) {
      erros.push(`${onde}: ${JSON.stringify(v)} não é inteiro`);
      return 0;
    }
    if (valor < minimo || valor > maximo) erros.push(`${onde}: ${valor} fora de ${minimo}..${maximo}`);
    return valor;
  };
  const opcional = (onde, v, padrao, minimo, maximo) => (v === undefined ? padrao : numero(onde, v, minimo, maximo));
  const jogador = (onde, v) => numero(onde, v, 0, times - 1);
  const segundos = (onde, v) => segundosParaPassos(numero(onde, v, 0, 24 * 3600));

  const textos = textosDaMissao(missao);
  const rotulos = rotulosDaMissao(missao);
  const cenas = cenasDaMissao(missao);
  const unioes = unioesDe(missao);
  const grupo = (onde, nome) => {
    if (typeof nome !== 'string') {
      erros.push(`${onde}: falta o nome do grupo`);
      return new Uint8Array(rotulos.length);
    }
    const membros = new Uint8Array(rotulos.length);
    for (const r of nome in unioes ? membrosDaUniao(unioes[nome]) : [nome]) membros[rotulos.indexOf(r)] = 1;
    return membros;
  };
  const nos = contexto.nos ?? [];
  const indiceDoNo = (onde, nome) => {
    const k = nos.indexOf(nome);
    if (k < 0) erros.push(`${onde}: nó ${nome} não existe no mapa`);
    return k;
  };
  const indiceDoTipo = (onde, nome) => {
    const k = tipos.findIndex(t => t.nome === nome);
    if (k < 0) erros.push(`${onde}: tipo ${nome} não existe`);
    return k;
  };
  const listaDeTipos = (onde, lista) => {
    if (lista === undefined) return null;
    if (!Array.isArray(lista) || lista.length === 0) {
      erros.push(`${onde}: esperava uma lista de tipos`);
      return null;
    }
    const marcados = new Uint8Array(tipos.length);
    lista.forEach((nome, k) => {
      const t = indiceDoTipo(`${onde}[${k}]`, nome);
      if (t >= 0) marcados[t] = 1;
    });
    return marcados;
  };
  const celula = (onde, x, y) => {
    const cx = numero(`${onde}.x`, x, 0, largura - 1);
    const cy = numero(`${onde}.y`, y, 0, altura - 1);
    return { x: cx * FP + (FP >> 1), y: cy * FP + (FP >> 1), cx, cy };
  };
  const procurarLugar = (colecao, nome) => missao[colecao]?.[nome] ?? lugares[colecao]?.[nome];
  const area = (onde, nome) => {
    const a = procurarLugar('areas', nome);
    if (!a) {
      erros.push(`${onde}: área ${nome} não existe na missão nem no mapa`);
      return null;
    }
    if (a.raio !== undefined) {
      // a disc of cells around (x, y)
      const cx = numero(`${onde}.x`, a.x, 0, largura - 1);
      const cy = numero(`${onde}.y`, a.y, 0, altura - 1);
      const raio = numero(`${onde}.raio`, a.raio, 0, 64);
      return { cx0: Math.max(0, cx - raio), cy0: Math.max(0, cy - raio), cx1: Math.min(largura, cx + raio + 1), cy1: Math.min(altura, cy + raio + 1), ccx: cx, ccy: cy, raio, x: cx * FP + (FP >> 1), y: cy * FP + (FP >> 1) };
    }
    const x0 = numero(`${onde}.x`, a.x, 0, largura - 1);
    const y0 = numero(`${onde}.y`, a.y, 0, altura - 1);
    const x1 = x0 + numero(`${onde}.largura`, a.largura, 1, largura - x0);
    const y1 = y0 + numero(`${onde}.altura`, a.altura, 1, altura - y0);
    return { cx0: x0, cy0: y0, cx1: x1, cy1: y1, ccx: 0, ccy: 0, raio: -1, x: ((x0 + x1) * FP) >> 1, y: ((y0 + y1) * FP) >> 1 };
  };
  const ponto = (onde, nome) => {
    const p = procurarLugar('pontos', nome);
    if (!Array.isArray(p) || p.length !== 2) {
      erros.push(`${onde}: ponto ${nome} não existe na missão nem no mapa`);
      return null;
    }
    return celula(onde, p[0], p[1]);
  };
  const rota = (onde, nome) => {
    const r = procurarLugar('rotas', nome);
    if (!Array.isArray(r) || r.length === 0) {
      erros.push(`${onde}: rota ${nome} não existe na missão nem no mapa`);
      return [];
    }
    return r.map((p, k) => celula(`${onde}[${k}]`, p?.[0], p?.[1]));
  };
  const destino = (onde, item) => {
    if (item.rota !== undefined) return { rota: rota(`${onde}.rota`, item.rota) };
    if (item.area !== undefined) return { area: area(`${onde}.area`, item.area) };
    if (item.ponto !== undefined) return { ponto: ponto(`${onde}.ponto`, item.ponto) };
    erros.push(`${onde}: falta rota, área ou ponto`);
    return {};
  };
  const limites = (onde, item) => ({ minimo: opcional(`${onde}.minimo`, item.minimo, -MAX_VALOR), maximo: opcional(`${onde}.maximo`, item.maximo, MAX_VALOR) });

  const objetivos = (Array.isArray(missao.objetivos) ? missao.objetivos : []).map((o, k) => {
    if (typeof o?.id !== 'string') erros.push(`objetivos[${k}]: falta o id`);
    if (typeof o?.texto !== 'string') erros.push(`objetivos[${k}]: falta o texto`);
    if (o?.tipo !== 'principal' && o?.tipo !== 'opcional') erros.push(`objetivos[${k}].tipo: principal ou opcional`);
    return { id: o?.id, texto: textos.indexOf(o?.texto), principal: o?.tipo === 'principal' ? 1 : 0 };
  });
  const indiceDoObjetivo = (onde, id) => {
    const k = objetivos.findIndex(o => o.id === id);
    if (k < 0) erros.push(`${onde}: objetivo ${id} não existe`);
    return k;
  };
  const declaradas = Array.isArray(missao.variaveis) ? missao.variaveis : Object.entries(missao.variaveis ?? {}).map(([nome, valor]) => ({ nome, valor }));
  const variaveis = declaradas.map(v => v?.nome);
  const valoresIniciais = declaradas.map((v, k) => numero(`variaveis[${v?.nome ?? k}]`, v?.valor ?? 0));
  const indiceDaVariavel = (onde, nome) => {
    const k = variaveis.indexOf(nome);
    if (k < 0) erros.push(`${onde}: variável ${nome} não declarada`);
    return k;
  };
  const cronometros = cronometrosDaMissao(missao);
  const indiceDoCronometro = nome => cronometros.indexOf(nome);
  const listaGatilhos = Array.isArray(missao.gatilhos) ? missao.gatilhos : [];
  if (!Array.isArray(missao.gatilhos)) erros.push('gatilhos: esperava uma lista');
  const ids = listaGatilhos.map(g => g?.id);
  ids.forEach((id, k) => {
    if (typeof id !== 'string') erros.push(`gatilhos[${k}]: falta o id`);
    else if (ids.indexOf(id) !== k) erros.push(`gatilhos[${k}]: id repetido ${id}`);
  });
  const indiceDoGatilho = (onde, id) => {
    const k = ids.indexOf(id);
    if (k < 0) erros.push(`${onde}: gatilho ${id} não existe`);
    return k;
  };
  const pesquisas = contexto.pesquisas ?? [];
  const indiceDaPesquisa = (onde, nome) => {
    const k = pesquisas.findIndex(p => p.nome === nome);
    if (k < 0) erros.push(`${onde}: pesquisa ${nome} não existe`);
    return k;
  };

  const compilarCondicao = (onde, c) => {
    if (!c || typeof c !== 'object') {
      erros.push(`${onde}: condição ausente`);
      return { se: 'nunca' };
    }
    switch (c.se) {
      case 'todas':
      case 'alguma':
        if (!Array.isArray(c.condicoes) || c.condicoes.length === 0) erros.push(`${onde}.condicoes: esperava uma lista`);
        return { se: c.se, condicoes: (c.condicoes ?? []).map((x, k) => compilarCondicao(`${onde}.condicoes[${k}]`, x)) };
      case 'nao':
        return { se: 'nao', condicao: compilarCondicao(`${onde}.condicao`, c.condicao) };
      case 'tempo':
        return { se: 'tempo', passos: segundos(`${onde}.segundos`, c.segundos) };
      case 'depoisDe':
        return { se: 'depoisDe', gatilho: indiceDoGatilho(`${onde}.gatilho`, c.gatilho), passos: segundos(`${onde}.segundos`, c.segundos) };
      case 'cronometro':
        return { se: 'cronometro', cronometro: indiceDoCronometro(c.nome) };
      case 'contagem':
      case 'vivos':
      case 'grupo': {
        const nome = nomeDoGrupo(c);
        if (c.se !== 'contagem' && nome === undefined) erros.push(`${onde}: ${c.se} precisa do grupo`);
        const faixa = { minimo: c.minimo ?? c.vivosMinimo, maximo: c.maximo ?? c.vivosMaximo };
        if (faixa.minimo === undefined && faixa.maximo === undefined) erros.push(`${onde}: falta minimo ou maximo`);
        return {
          se: 'contagem',
          jogador: c.jogador === undefined ? -1 : jogador(`${onde}.jogador`, c.jogador),
          tipos: listaDeTipos(`${onde}.tipos`, c.tipos),
          area: c.area === undefined ? null : area(`${onde}.area`, c.area),
          grupo: nome === undefined ? null : grupo(`${onde}.grupo`, nome),
          ...limites(onde, faixa),
        };
      }
      case 'dono':
        return { se: 'dono', grupo: grupo(`${onde}.grupo`, nomeDoGrupo(c)), jogador: jogador(`${onde}.jogador`, c.jogador) };
      case 'vida':
        return { se: 'vida', grupo: grupo(`${onde}.grupo`, nomeDoGrupo(c)), porcento: numero(`${onde}.maximoPorcento`, c.maximoPorcento, 0, 100) };
      case 'religando':
        return { se: 'religando', grupo: grupo(`${onde}.grupo`, nomeDoGrupo(c)), jogador: c.jogador === undefined ? -1 : jogador(`${onde}.jogador`, c.jogador) };
      case 'atingido':
        return { se: 'atingido', grupo: grupo(`${onde}.grupo`, nomeDoGrupo(c)), passos: segundos(`${onde}.segundos`, c.segundos) };
      case 'perto': {
        const celulas = numero(`${onde}.celulas`, c.celulas, 0, 64);
        return { se: 'perto', grupo: grupo(`${onde}.grupo`, nomeDoGrupo(c)), jogador: jogador(`${onde}.jogador`, c.jogador), alcance: celulas * FP, minimo: opcional(`${onde}.minimo`, c.minimo, 1, 1) };
      }
      case 'religacao':
        if ((c.minimoPorcento === undefined) === (c.faltamSegundos === undefined)) erros.push(`${onde}: minimoPorcento ou faltamSegundos`);
        return {
          se: 'religacao',
          grupo: grupo(`${onde}.grupo`, nomeDoGrupo(c)),
          jogador: c.jogador === undefined ? -1 : jogador(`${onde}.jogador`, c.jogador),
          porcento: c.minimoPorcento === undefined ? -1 : numero(`${onde}.minimoPorcento`, c.minimoPorcento, 0, 100),
          faltam: c.faltamSegundos === undefined ? -1 : segundos(`${onde}.faltamSegundos`, c.faltamSegundos),
        };
      case 'recursos':
        if (c.no !== undefined) return { se: 'recursosDoNo', no: indiceDoNo(`${onde}.no`, c.no), ...limites(onde, c) };
        return { se: 'recursos', jogador: jogador(`${onde}.jogador`, c.jogador), ...limites(onde, c) };
      case 'coletores':
        if (c.perdidosMinimo !== undefined) return { se: 'coletoresPerdidos', jogador: jogador(`${onde}.jogador`, c.jogador), minimo: numero(`${onde}.perdidosMinimo`, c.perdidosMinimo, 0) };
        return { se: 'coletores', jogador: jogador(`${onde}.jogador`, c.jogador), minimo: numero(`${onde}.minimo`, c.minimo, 0) };
      case 'objetivo':
        if (!(c.estado in NOMES_ESTADO)) erros.push(`${onde}.estado: ativo, cumprido ou falhou`);
        return { se: 'objetivo', objetivo: indiceDoObjetivo(`${onde}.objetivo`, c.objetivo), estado: NOMES_ESTADO[c.estado] ?? 0 };
      case 'disparou':
      case 'gatilho':
        return { se: 'disparou', gatilho: indiceDoGatilho(`${onde}.gatilho`, c.gatilho) };
      case 'variavel':
        return {
          se: 'variavel',
          variavel: indiceDaVariavel(`${onde}.nome`, c.nome),
          minimo: opcional(`${onde}.minimo`, c.igual ?? c.minimo, -MAX_VALOR),
          maximo: opcional(`${onde}.maximo`, c.igual ?? c.maximo, MAX_VALOR),
        };
      case 'parado':
        return { se: 'parado', jogador: jogador(`${onde}.jogador`, c.jogador), passos: segundos(`${onde}.segundos`, c.segundos) };
      case 'visto':
        return { se: 'visto', jogador: jogador(`${onde}.jogador`, c.jogador), area: area(`${onde}.area`, c.area) };
      case 'pesquisa':
        return { se: 'pesquisa', jogador: jogador(`${onde}.jogador`, c.jogador), pesquisa: indiceDaPesquisa(`${onde}.pesquisa`, c.pesquisa) };
      case 'dificuldade': {
        const { minimo, maximo } = limites(onde, c);
        return { se: dificuldade >= minimo && dificuldade <= maximo ? 'sempre' : 'nunca' };
      }
      default:
        erros.push(`${onde}.se: condição desconhecida ${c.se}`);
        return { se: 'nunca' };
    }
  };

  const compilarAcao = (onde, a) => {
    switch (a?.faz) {
      case 'mensagem':
        if (typeof a.texto !== 'string') erros.push(`${onde}: falta o texto`);
        return { faz: 'mensagem', texto: textos.indexOf(a.texto), area: a.area === undefined ? null : area(`${onde}.area`, a.area) };
      case 'aviso':
        return { faz: 'aviso', grupo: grupo(`${onde}.grupo`, nomeDoGrupo(a)).indexOf(1), texto: a.texto === undefined ? -1 : textos.indexOf(a.texto), area: area(`${onde}.area`, a.area) };
      case 'objetivo':
        if (!(a.estado in NOMES_ESTADO)) erros.push(`${onde}.estado: ativo, cumprido ou falhou`);
        return { faz: 'objetivo', objetivo: indiceDoObjetivo(`${onde}.objetivo`, a.objetivo), estado: NOMES_ESTADO[a.estado] ?? 0 };
      case 'criar': {
        if (!Array.isArray(a.unidades) || a.unidades.length === 0) erros.push(`${onde}.unidades: esperava uma lista`);
        const unidades = (a.unidades ?? []).map((u, k) => ({ tipo: indiceDoTipo(`${onde}.unidades[${k}].tipo`, u?.tipo), quantos: numero(`${onde}.unidades[${k}].quantos`, u?.quantos, 0, 200) }));
        const lugar = a.area !== undefined ? { area: area(`${onde}.area`, a.area) } : { ponto: ponto(`${onde}.ponto`, a.ponto) };
        if (typeof a.grupo === 'string' && a.grupo in unioes) erros.push(`${onde}.grupo: criar precisa de um rótulo, não de uma união`);
        return {
          faz: 'criar',
          jogador: jogador(`${onde}.jogador`, a.jogador),
          unidades,
          ...lugar,
          rotulo: typeof a.grupo === 'string' ? rotulos.indexOf(a.grupo) : -1,
          veterania: opcional(`${onde}.veterania`, a.veterania, 0, 0, 3),
        };
      }
      case 'ordenar':
        if (!(a.ordem in ORDENS)) erros.push(`${onde}.ordem: ${Object.keys(ORDENS).join(', ')}`);
        return { faz: 'ordenar', grupo: grupo(`${onde}.grupo`, nomeDoGrupo(a)), ordem: ORDENS[a.ordem] ?? 0, fila: a.fila === 1 || a.fila === true ? 1 : 0, ...(a.ordem === 'parar' || a.ordem === 'segurar' ? {} : destino(onde, a)) };
      case 'atacar':
        return { faz: 'atacar', grupo: grupo(`${onde}.grupo`, nomeDoGrupo(a)), alvo: grupo(`${onde}.alvo`, a.alvo) };
      case 'variavel':
        if ((a.valor === undefined) === (a.somar === undefined)) erros.push(`${onde}: valor ou somar`);
        return { faz: 'variavel', variavel: indiceDaVariavel(`${onde}.nome`, a.nome), valor: opcional(`${onde}.valor`, a.valor, 0), somar: a.somar === undefined ? null : numero(`${onde}.somar`, a.somar) };
      case 'cronometro':
        return { faz: 'cronometro', cronometro: indiceDoCronometro(a.nome), passos: a.parar ? 0 : segundos(`${onde}.segundos`, a.segundos) };
      case 'liberar':
      case 'bloquear':
        return { faz: a.faz, jogador: jogador(`${onde}.jogador`, a.jogador), tipos: listaDeTipos(`${onde}.tipos`, a.tipos) ?? new Uint8Array(tipos.length) };
      case 'revelar':
        return { faz: 'revelar', jogador: jogador(`${onde}.jogador`, a.jogador), area: area(`${onde}.area`, a.area) };
      case 'recursos':
        return { faz: 'recursos', jogador: jogador(`${onde}.jogador`, a.jogador), somar: numero(`${onde}.somar`, a.somar) };
      case 'dono':
        return { faz: 'dono', grupo: grupo(`${onde}.grupo`, nomeDoGrupo(a)), jogador: jogador(`${onde}.jogador`, a.jogador) };
      case 'destruir':
        return { faz: 'destruir', grupo: grupo(`${onde}.grupo`, nomeDoGrupo(a)) };
      case 'gatilho':
        return { faz: 'gatilho', gatilho: indiceDoGatilho(`${onde}.gatilho`, a.gatilho), ativo: a.ativo === false ? 0 : 1 };
      case 'religavel':
        if (a.por !== undefined && a.por !== 'religa' && a.por !== 'reparo') erros.push(`${onde}.por: religa ou reparo`);
        return { faz: 'religavel', grupo: grupo(`${onde}.grupo`, nomeDoGrupo(a)), passos: segundos(`${onde}.segundos`, a.segundos), por: a.por === 'reparo' ? POR.REPARO : POR.RELIGA };
      case 'pesquisa':
        return { faz: 'pesquisa', jogador: jogador(`${onde}.jogador`, a.jogador), pesquisa: indiceDaPesquisa(`${onde}.pesquisa`, a.pesquisa) };
      case 'veterania':
        return { faz: 'veterania', grupo: grupo(`${onde}.grupo`, nomeDoGrupo(a)), nivel: numero(`${onde}.nivel`, a.nivel, 0, 3) };
      case 'empacotar':
        return { faz: 'empacotar', grupo: grupo(`${onde}.grupo`, nomeDoGrupo(a)), tipo: indiceDoTipo(`${onde}.em`, a.em), passos: segundos(`${onde}.segundos`, a.segundos) };
      case 'desempacotar':
        return { faz: 'desempacotar', grupo: grupo(`${onde}.grupo`, nomeDoGrupo(a)), area: a.area === undefined ? null : area(`${onde}.area`, a.area), passos: segundos(`${onde}.segundos`, a.segundos) };
      case 'luz':
        return { faz: 'luz', cena: cenas.indexOf(a.cena) };
      case 'camera':
        return { faz: 'camera', ...(a.area !== undefined ? { area: area(`${onde}.area`, a.area) } : { ponto: ponto(`${onde}.ponto`, a.ponto) }) };
      case 'vitoria':
      case 'derrota':
        return { faz: a.faz, jogador: jogador(`${onde}.jogador`, a.jogador) };
      default:
        erros.push(`${onde}.faz: ação desconhecida ${a?.faz}`);
        return { faz: 'nada' };
    }
  };

  const gatilhos = listaGatilhos.map((g, k) => {
    const onde = `gatilhos[${k}]${typeof g?.id === 'string' ? ` (${g.id})` : ''}`;
    if (!Array.isArray(g?.faz) && !Array.isArray(g?.acoes)) erros.push(`${onde}.faz: esperava uma lista de ações`);
    for (const campo of Object.keys(g ?? {})) if (!['id', 'quando', 'faz', 'acoes', 'repete', 'intervaloSegundos', 'ativo'].includes(campo)) erros.push(`${onde}.${campo}: campo desconhecido`);
    return {
      id: g?.id,
      quando: compilarCondicao(`${onde}.quando`, g?.quando),
      acoes: acoesDe(g).map((a, j) => compilarAcao(`${onde}.faz[${j}]`, a)),
      repete: g?.repete === true || g?.repete === 1 ? 1 : 0,
      intervalo: g?.intervaloSegundos === undefined ? 0 : segundos(`${onde}.intervaloSegundos`, g.intervaloSegundos),
      ativo: g?.ativo === false || g?.ativo === 0 ? 0 : 1,
    };
  });
  for (const campo of Object.keys(missao)) if (!['versao', 'id', 'mapa', 'titulo', 'jogadores', 'objetivos', 'areas', 'pontos', 'rotas', 'grupos', 'variaveis', 'gatilhos'].includes(campo)) erros.push(`${campo}: campo desconhecido`);
  if (erros.length > 0) throw new Error(`missão ${missao.id ?? ''} inválida:\n${erros.join('\n')}`);
  return Object.freeze({ id: missao.id, gatilhos, objetivos, textos, rotulos, cenas, variaveis, valoresIniciais, cronometros });
}

/** The compiled mission of a simulation (opcoes.missao), or null; rebuilt from the saved options after a load. */
export function missaoDe(sim) {
  if (sim.missaoCompilada !== undefined) return sim.missaoCompilada;
  const missao = sim.opcoes?.missao;
  const { mapa } = sim;
  const lugares = sim.opcoes.lugares ?? mapa.lugares ?? { areas: mapa.areas, pontos: mapa.pontos, rotas: mapa.rotas };
  // off on any other map (a page that could not load the mission's map plays without it)
  const noMapa = missao && (!missao.mapa || lugares.mapa === missao.mapa);
  sim.missaoCompilada = noMapa
    ? compilarMissao(missao, { tipos: sim.tipos, lugares, dificuldade: sim.opcoes.dificuldade, times: sim.times, largura: mapa.largura, altura: mapa.altura, pesquisas: sim.pesquisas, nos: lugares.nos ?? mapa.nomesNos ?? (mapa.nos ?? []).map(no => no.id) })
    : null;
  return sim.missaoCompilada;
}

/**
 * Evaluator state, only typed arrays: per trigger (times fired, tick of the last firing, active), variables, timers
 * (tick they run out, 0 stopped), objective states, each slot's label (index + 1) with the generation it was given
 * to, and each player's result. Sized from the mission JSON alone.
 */
export function criarExtrasMissao(sim) {
  const f = formaDaMissao(sim.opcoes?.missao ?? null, sim.opcoes?.dificuldade);
  return {
    disparos: new Int32Array(f.gatilhos),
    ultimoDisparo: new Int32Array(f.gatilhos).fill(-1),
    ativo: Uint8Array.from(f.ativos),
    variaveis: Int32Array.from(f.variaveis),
    cronometros: new Int32Array(f.cronometros),
    objetivos: new Uint8Array(f.objetivos),
    rotulo: new Uint16Array(sim.capacidade),
    rotuloGeracao: new Uint16Array(sim.capacidade),
    resultado: new Uint8Array(sim.times),
  };
}
// saved, loaded and hashed with the state once the core keeps registered extras (estado.js)
estado.registrarExtras?.('missao', criarExtrasMissao);

/** The evaluator's state in sim.extras.missao, made on first use when the core did not make it. */
export function extrasMissao(sim) {
  sim.extras ??= {};
  sim.extras.missao ??= criarExtrasMissao(sim);
  return sim.extras.missao;
}

/**
 * Gives entity i the label `nome` (map entities with an etiqueta); names the mission never uses are ignored. Needs only
 * the mission JSON, so the map loader can call it before the places are in.
 */
export function rotular(sim, i, nome) {
  if (!sim.opcoes?.missao) return;
  sim.rotulosMissao ??= rotulosDaMissao(sim.opcoes.missao);
  const k = sim.rotulosMissao.indexOf(nome);
  if (k < 0) return;
  const ex = extrasMissao(sim);
  ex.rotulo[i] = k + 1;
  ex.rotuloGeracao[i] = sim.geracao[i];
}

/** DESISTIR: the player concedes, and its match ends in defeat. */
export function desistir(sim, jogador) {
  if (jogador >= sim.times) return;
  const ex = extrasMissao(sim);
  if (ex.resultado[jogador] !== RESULTADO.JOGANDO) return;
  ex.resultado[jogador] = RESULTADO.DERROTA;
  emitirMissao(sim, EVENTO.DERROTA, 0, 0, jogador);
}

/** Each player's RESULTADO.* so far. */
export const resultadoDaMissao = sim => extrasMissao(sim).resultado;

// ---------- evaluation ----------

// whether slot i is alive and carries one of the labels marked in `grupo`
function membro(sim, ex, grupo, i) {
  if (!sim.ativo[i] || ex.rotuloGeracao[i] !== sim.geracao[i]) return false;
  const r = ex.rotulo[i];
  return r > 0 && grupo[r - 1] === 1;
}

/** Live slots carrying one of the labels marked in `grupo`, in slot order. */
function membros(sim, ex, grupo) {
  const lista = [];
  for (let i = 0; i < sim.capacidade; i++) if (membro(sim, ex, grupo, i)) lista.push(i);
  return lista;
}

// whether cell (cx, cy) is in an area: its rectangle, or its disc
function celulaNaArea(a, cx, cy) {
  if (cx < a.cx0 || cx >= a.cx1 || cy < a.cy0 || cy >= a.cy1) return false;
  if (a.raio < 0) return true;
  const dx = cx - a.ccx;
  const dy = cy - a.ccy;
  return dx * dx + dy * dy <= a.raio * a.raio;
}

const dentroDaArea = (sim, i, a) => celulaNaArea(a, sim.x[i] >> FP_BITS, sim.y[i] >> FP_BITS);

// The economy's per-player arrays (economia.js: Carga and the tick of the last command); none in a match without it.
const carga = sim => sim.extras?.economia?.carga ?? sim.recursos ?? null;
const recursosDe = (sim, jogador) => carga(sim)?.[jogador] ?? 0;
function darRecursos(sim, jogador, quantidade) {
  const lista = carga(sim);
  if (lista) lista[jogador] = Math.max(0, Math.min(MAX_VALOR, lista[jogador] + quantidade));
}
const ultimoComando = (sim, jogador) => (sim.extras?.economia?.ultimoComando ?? sim.ultimoComando)?.[jogador] ?? 0;
// harvesters of the player at work: with a task of the economy (economia.js; a loading harvester stands still), or on
// the move without it
function coletoresAtivos(sim, jogador) {
  let n = 0;
  for (let i = 0; i < sim.capacidade; i++) {
    if (!sim.ativo[i] || sim.time[i] !== jogador || !sim.coletorPorTipo[sim.tipo[i]]) continue;
    if (sim.tarefa ? sim.tarefa[i] !== 0 : !sim.parada[i]) n++;
  }
  return n;
}
// units (not buildings) of the condition's player within its reach of some live member of its group
function unidadesPerto(sim, ex, c) {
  const lista = membros(sim, ex, c.grupo);
  if (lista.length === 0) return 0;
  const a = c.alcance >> 4;
  let n = 0;
  for (let j = 0; j < sim.capacidade; j++) {
    if (!sim.ativo[j] || sim.time[j] !== c.jogador || (sim.tipos[sim.tipo[j]].categoria ?? CATEGORIA.UNIDADE) !== CATEGORIA.UNIDADE) continue;
    for (const i of lista) {
      const dx = (sim.x[j] - sim.x[i]) >> 4;
      const dy = (sim.y[j] - sim.y[i]) >> 4;
      if (dx * dx + dy * dy <= a * a) {
        n++;
        break;
      }
    }
  }
  return n;
}

// what the piles of node k still hold
function cargaDoNo(sim, k) {
  if (!sim.no || !sim.carga) return 0;
  let total = 0;
  for (let i = 0; i < sim.capacidade; i++) if (sim.ativo[i] && sim.no[i] === k && sim.tipos[sim.tipo[i]].categoria === CATEGORIA.RECURSO) total += sim.carga[i];
  return total;
}

function avaliar(sim, ex, c) {
  switch (c.se) {
    case 'sempre':
      return true;
    case 'nunca':
      return false;
    case 'todas':
      return c.condicoes.every(x => avaliar(sim, ex, x));
    case 'alguma':
      return c.condicoes.some(x => avaliar(sim, ex, x));
    case 'nao':
      return !avaliar(sim, ex, c.condicao);
    case 'tempo':
      return sim.tick >= c.passos;
    case 'depoisDe':
      return ex.ultimoDisparo[c.gatilho] >= 0 && sim.tick - ex.ultimoDisparo[c.gatilho] >= c.passos;
    case 'cronometro':
      return ex.cronometros[c.cronometro] > 0 && sim.tick >= ex.cronometros[c.cronometro];
    case 'contagem': {
      let n = 0;
      for (let i = 0; i < sim.capacidade; i++) {
        if (!sim.ativo[i]) continue;
        if (c.jogador >= 0 && sim.time[i] !== c.jogador) continue;
        if (c.tipos && !c.tipos[sim.tipo[i]]) continue;
        if (c.area && !dentroDaArea(sim, i, c.area)) continue;
        if (c.grupo && !membro(sim, ex, c.grupo, i)) continue;
        n++;
      }
      return n >= c.minimo && n <= c.maximo;
    }
    case 'dono': {
      const lista = membros(sim, ex, c.grupo);
      return lista.length > 0 && lista.every(i => sim.time[i] === c.jogador);
    }
    case 'vida':
      return membros(sim, ex, c.grupo).some(i => sim.vida[i] * 100 <= c.porcento * sim.tipos[sim.tipo[i]].vida);
    case 'religando':
      return membros(sim, ex, c.grupo).some(i => sendoReligada(sim, i, c.jogador));
    case 'atingido':
      return membros(sim, ex, c.grupo).some(i => sim.tick - atingidoEm(sim, i) <= c.passos);
    case 'perto':
      return unidadesPerto(sim, ex, c) >= c.minimo;
    case 'religacao':
      return membros(sim, ex, c.grupo).some(i => {
        const p = progressoReligar(sim, i);
        if (p.time < 0 || (c.jogador >= 0 && p.time !== c.jogador)) return false;
        return c.porcento >= 0 ? p.passos * 100 >= c.porcento * p.total : p.total - p.passos <= c.faltam;
      });
    case 'recursos': {
      const r = recursosDe(sim, c.jogador);
      return r >= c.minimo && r <= c.maximo;
    }
    case 'recursosDoNo': {
      const r = cargaDoNo(sim, c.no);
      return r >= c.minimo && r <= c.maximo;
    }
    case 'coletores':
      return coletoresAtivos(sim, c.jogador) >= c.minimo;
    case 'coletoresPerdidos':
      return (sim.extras?.combate?.coletoresPerdidos[c.jogador] ?? 0) >= c.minimo;
    case 'objetivo':
      return ex.objetivos[c.objetivo] === c.estado;
    case 'disparou':
      return ex.disparos[c.gatilho] > 0;
    case 'variavel': {
      const v = ex.variaveis[c.variavel];
      return v >= c.minimo && v <= c.maximo;
    }
    case 'parado':
      return sim.tick - ultimoComando(sim, c.jogador) >= c.passos;
    case 'visto': {
      const { largura } = sim.mapa;
      for (let cy = c.area.cy0; cy < c.area.cy1; cy++) for (let cx = c.area.cx0; cx < c.area.cx1; cx++) if (celulaNaArea(c.area, cx, cy) && celulaVisivel(sim, c.jogador, cy * largura + cx)) return true;
      return false;
    }
    case 'pesquisa':
      return pesquisaFeita(sim, c.jogador, c.pesquisa);
    default:
      return false;
  }
}

// Open cells to spawn n units on: the area's cells in row order, or rings around the point, cycling when short.
function lugaresDeSurgimento(sim, a, n) {
  const { largura, altura, bloqueado } = sim.mapa;
  const celulas = [];
  if (a.area) {
    for (let cy = a.area.cy0; cy < a.area.cy1; cy++) for (let cx = a.area.cx0; cx < a.area.cx1; cx++) if (celulaNaArea(a.area, cx, cy) && !bloqueado[cy * largura + cx]) celulas.push(cy * largura + cx);
  } else if (a.ponto) {
    for (let r = 0; r < 12 && celulas.length < n; r++) {
      for (let cy = a.ponto.cy - r; cy <= a.ponto.cy + r; cy++) {
        for (let cx = a.ponto.cx - r; cx <= a.ponto.cx + r; cx++) {
          if (cx < 1 || cy < 1 || cx >= largura - 1 || cy >= altura - 1) continue;
          if (Math.max(Math.abs(cx - a.ponto.cx), Math.abs(cy - a.ponto.cy)) !== r) continue;
          if (!bloqueado[cy * largura + cx]) celulas.push(cy * largura + cx);
        }
      }
    }
  }
  return celulas;
}

const centro = a => (a.area ? a.area : a.ponto ?? { x: 0, y: 0 });

function emitirMissao(sim, tipo, x, y, arg) {
  emitirEventoNoPonto(sim, tipo, -1, x, y, arg);
}

function ordenar(sim, unidades, a) {
  if (unidades.length === 0) return;
  for (const i of unidades) sim.segurando[i] = 0;
  if (a.ordem === TIPO_COMANDO.PARAR || a.ordem === TIPO_COMANDO.SEGURAR_POSICAO) {
    for (const i of unidades) {
      limparOrdens(sim, i);
      sim.parada[i] = 1;
      sim.segurando[i] = a.ordem === TIPO_COMANDO.SEGURAR_POSICAO ? 1 : 0;
    }
    return;
  }
  const pontos = a.rota ?? [a.area ?? a.ponto];
  if (a.ordem === TIPO_COMANDO.PATRULHAR) {
    ordenarPatrulha(sim, unidades, pontos[0].x, pontos[0].y);
    return;
  }
  pontos.forEach((p, k) => ordenarGrupo(sim, unidades, a.ordem, p.x, p.y, { fila: k > 0 || a.fila ? 1 : 0 }));
}

function executar(sim, m, ex, a) {
  switch (a.faz) {
    case 'mensagem': {
      const p = a.area ?? { x: 0, y: 0 };
      emitirMissao(sim, EVENTO.MENSAGEM_MISSAO, p.x, p.y, a.texto);
      return;
    }
    case 'aviso':
      emitirMissao(sim, EVENTO.AVISO_ATAQUE, a.area.x, a.area.y, a.grupo);
      if (a.texto >= 0) emitirMissao(sim, EVENTO.MENSAGEM_MISSAO, a.area.x, a.area.y, a.texto);
      return;
    case 'objetivo':
      if (ex.objetivos[a.objetivo] === a.estado) return;
      ex.objetivos[a.objetivo] = a.estado;
      emitirMissao(sim, EVENTO.OBJETIVO, 0, 0, a.objetivo * 4 + a.estado);
      return;
    case 'criar': {
      const total = a.unidades.reduce((s, u) => s + u.quantos, 0);
      const celulas = lugaresDeSurgimento(sim, a, total);
      if (celulas.length === 0) return;
      const { largura } = sim.mapa;
      const c = centro(a);
      if (a.rotulo >= 0) emitirMissao(sim, EVENTO.ONDA, c.x, c.y, a.rotulo);
      let k = 0;
      for (const u of a.unidades) {
        for (let q = 0; q < u.quantos; q++, k++) {
          const celula = celulas[k % celulas.length];
          const i = criarEntidade(sim, u.tipo, a.jogador, (celula % largura) * FP + (FP >> 1), Math.trunc(celula / largura) * FP + (FP >> 1), 0);
          if (i < 0) return;
          if (a.rotulo >= 0) {
            ex.rotulo[i] = a.rotulo + 1;
            ex.rotuloGeracao[i] = sim.geracao[i];
          }
          if (a.veterania > 0) definirVeterania(sim, i, a.veterania);
          emitirEvento(sim, EVENTO.SURGIMENTO, i, -1, u.tipo);
        }
      }
      return;
    }
    case 'ordenar':
      ordenar(sim, membros(sim, ex, a.grupo), a);
      return;
    case 'atacar': {
      const alvos = membros(sim, ex, a.alvo);
      const unidades = membros(sim, ex, a.grupo);
      if (alvos.length === 0 || unidades.length === 0) return;
      const alvo = alvos[0];
      for (const i of unidades) sim.segurando[i] = 0;
      ordenarGrupo(sim, unidades, TIPO_COMANDO.ATACAR, sim.x[alvo], sim.y[alvo], { alvo: idDoSlot(sim, alvo) });
      return;
    }
    case 'variavel':
      ex.variaveis[a.variavel] = a.somar === null ? a.valor : Math.max(-MAX_VALOR, Math.min(MAX_VALOR, ex.variaveis[a.variavel] + a.somar));
      return;
    case 'cronometro':
      ex.cronometros[a.cronometro] = a.passos > 0 ? sim.tick + a.passos : 0;
      return;
    case 'liberar':
    case 'bloquear':
      liberarTipos(sim, a.jogador, a.tipos, a.faz === 'liberar' ? 1 : 0);
      return;
    case 'revelar': {
      const explorado = sim.neblina.explorado[a.jogador];
      const { largura } = sim.mapa;
      for (let cy = a.area.cy0; cy < a.area.cy1; cy++) for (let cx = a.area.cx0; cx < a.area.cx1; cx++) if (celulaNaArea(a.area, cx, cy)) explorado[cy * largura + cx] = 1;
      return;
    }
    case 'recursos':
      darRecursos(sim, a.jogador, a.somar);
      return;
    case 'dono':
      for (const i of membros(sim, ex, a.grupo)) trocarDono(sim, i, a.jogador);
      return;
    case 'destruir':
      for (const i of membros(sim, ex, a.grupo)) if (sim.ativo[i]) matar(sim, i, -1);
      return;
    case 'gatilho':
      ex.ativo[a.gatilho] = a.ativo;
      return;
    case 'religavel':
      for (const i of membros(sim, ex, a.grupo)) definirTempoReligar(sim, i, a.passos, a.por);
      return;
    case 'pesquisa':
      concluirPesquisa(sim, a.jogador, a.pesquisa);
      return;
    case 'veterania':
      for (const i of membros(sim, ex, a.grupo)) definirVeterania(sim, i, a.nivel);
      return;
    case 'empacotar':
      for (const i of membros(sim, ex, a.grupo)) iniciarEmpacotar(sim, i, a.tipo, a.passos);
      return;
    case 'desempacotar':
      for (const i of membros(sim, ex, a.grupo)) if (faseDe(sim, i) === FASE.EMPACOTADO && (!a.area || dentroDaArea(sim, i, a.area))) iniciarDesempacotar(sim, i, a.passos);
      return;
    case 'luz':
      emitirMissao(sim, EVENTO.LUZ, 0, 0, a.cena);
      return;
    case 'camera': {
      const c = centro(a);
      emitirMissao(sim, EVENTO.CAMERA, c.x, c.y, 0);
      return;
    }
    case 'vitoria':
    case 'derrota':
      if (ex.resultado[a.jogador] !== RESULTADO.JOGANDO) return;
      ex.resultado[a.jogador] = a.faz === 'vitoria' ? RESULTADO.VITORIA : RESULTADO.DERROTA;
      emitirMissao(sim, a.faz === 'vitoria' ? EVENTO.VITORIA : EVENTO.DERROTA, 0, 0, a.jogador);
      return;
    default:
      return;
  }
}

/**
 * Runs the mission's triggers in file order every INTERVALO_GATILHOS ticks: an active trigger whose condition holds
 * fires its actions in order (later triggers see their effects), counts the firing, and either turns off or, when it
 * repeats, waits its interval. A finished match (any player's result set) runs no more triggers.
 */
export function avaliarGatilhos(sim) {
  const m = missaoDe(sim);
  if (!m || (sim.tick - 1) % INTERVALO_GATILHOS !== 0) return;
  const ex = extrasMissao(sim);
  if (ex.resultado.some(r => r !== RESULTADO.JOGANDO)) return;
  for (let k = 0; k < m.gatilhos.length; k++) {
    const g = m.gatilhos[k];
    if (!ex.ativo[k]) continue;
    if (g.repete && ex.ultimoDisparo[k] >= 0 && sim.tick - ex.ultimoDisparo[k] < g.intervalo) continue;
    if (!avaliar(sim, ex, g.quando)) continue;
    ex.disparos[k]++;
    ex.ultimoDisparo[k] = sim.tick;
    if (!g.repete) ex.ativo[k] = 0;
    for (const a of g.acoes) executar(sim, m, ex, a);
    if (ex.resultado.some(r => r !== RESULTADO.JOGANDO)) return;
  }
}

/** The entity with id `id`, if it carries one of the labels of the union or label `nome` (tests and tools). */
export function temRotulo(sim, id, nome) {
  const m = missaoDe(sim);
  const i = slotVivo(sim, id);
  if (!m || i < 0) return false;
  const ex = extrasMissao(sim);
  return ex.rotuloGeracao[i] === sim.geracao[i] && m.rotulos[ex.rotulo[i] - 1] === nome;
}

// what packing reads and writes so a packed camp keeps its mission label
const ROTULOS = Object.freeze({
  ler(sim, i) {
    const ex = extrasMissao(sim);
    return ex.rotuloGeracao[i] === sim.geracao[i] ? ex.rotulo[i] : 0;
  },
  escrever(sim, i, rotulo) {
    const ex = extrasMissao(sim);
    ex.rotulo[i] = rotulo;
    ex.rotuloGeracao[i] = sim.geracao[i];
  },
});

/** The rules step of this front, right after the commands: mission triggers, packing, re-powering, repair, research. */
export function passoDaMissao(sim) {
  avaliarGatilhos(sim);
  avancarEmpacotar(sim, ROTULOS);
  avancarReligar(sim);
  avancarReparo(sim);
  avancarPesquisas(sim);
}
