// Missions (contract C7) and interface texts (C11): every reference in the sandbox mission resolves against the map,
// the C5 kinds and the texts; every attack of 6 or more units comes after a warning of at least 10 s; the match has a
// defined win and loss; and the scripted timeline lands the first shot and the last wave inside the stage E3 targets.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const ler = caminho => JSON.parse(readFileSync(raiz + caminho, 'utf8'));
const unidades = ler('site/rts/dados/unidades.json').unidades;
const predios = ler('site/rts/dados/predios.json').predios;
const pesquisas = ler('site/rts/dados/pesquisas.json').pesquisas;
const { textos } = ler('site/rts/dados/textos/pt-BR.json');
const DIFICULDADES = ['facil', 'normal', 'dificil'];
const AVISO_MINIMO_S = 10;
const TAMANHO_COM_AVISO = 6;

const missoes = readdirSync(raiz + 'site/rts/dados/missoes').filter(f => f.endsWith('.json')).map(f => ler(`site/rts/dados/missoes/${f}`));
const caixa = missoes.find(m => m.id === 'caixa-de-areia');
const mapaDe = missao => ler(`site/rts/dados/mapas/${missao.mapa}/entidades.json`);

// A mission number is an integer or one integer per difficulty.
const valor = (v, dificuldade) => (typeof v === 'object' && v !== null && !Array.isArray(v) ? v[dificuldade] : v);
const ehNumeroDeMissao = v => Number.isInteger(v) || (v && typeof v === 'object' && !Array.isArray(v) && DIFICULDADES.every(d => Number.isInteger(v[d])) && Object.keys(v).length === 3);

function* condicoes(c) {
  yield c;
  for (const filha of c.condicoes ?? []) yield* condicoes(filha);
  if (c.condicao) yield* condicoes(c.condicao);
}

function* numerosSoltos(v, caminho = '') {
  if (typeof v === 'number') yield [caminho, v];
  else if (Array.isArray(v)) for (const [i, x] of v.entries()) yield* numerosSoltos(x, `${caminho}[${i}]`);
  else if (v && typeof v === 'object') {
    if (DIFICULDADES.some(d => d in v)) {
      if (!ehNumeroDeMissao(v)) yield [caminho, v];
      return;
    }
    for (const [k, x] of Object.entries(v)) yield* numerosSoltos(x, caminho ? `${caminho}.${k}` : k);
  }
}

test('every mission number is an integer, or one integer per difficulty', () => {
  for (const missao of missoes) {
    assert.ok(Number.isInteger(missao.versao) && missao.versao >= 1);
    for (const [caminho, v] of numerosSoltos(missao)) assert.ok(Number.isInteger(v), `${missao.id}.${caminho}: ${JSON.stringify(v)}`);
  }
});

test('every reference of a mission resolves', () => {
  // the motor's built-in kinds count too: the battery pile and the spark
  const tipos = new Set([...unidades, ...predios].map(t => t.nome).concat(['pilha', 'faisca']));
  for (const missao of missoes) {
    const mapa = mapaDe(missao);
    const areas = new Set([...Object.keys(missao.areas ?? {}), ...Object.keys(mapa.areas)]);
    const rotas = new Set([...Object.keys(missao.rotas ?? {}), ...Object.keys(mapa.rotas)]);
    const etiquetas = new Set(mapa.entidades.map(e => e.etiqueta).filter(Boolean));
    const objetivos = new Set(missao.objetivos.map(o => o.id));
    const gatilhos = new Set(missao.gatilhos.map(g => g.id));
    assert.equal(gatilhos.size, missao.gatilhos.length, 'gatilho repetido');
    const variaveis = new Set(Object.keys(missao.variaveis ?? {}));
    // a group is a union of labels, a label of the map or a label a create action gives
    const grupos = new Set([...Object.keys(missao.grupos ?? {}), ...etiquetas]);
    for (const g of missao.gatilhos) for (const a of g.acoes) if (a.faz === 'criar') grupos.add(a.grupo);
    for (const [nome, membros] of Object.entries(missao.grupos ?? {})) {
      assert.ok(!membros.includes(nome), `grupo ${nome} contém a si mesmo, e o avaliador não o rotula`);
      for (const e of membros) assert.ok(etiquetas.has(e), `grupo ${nome}: etiqueta ${e} fora do mapa`);
    }
    const texto = id => assert.ok(typeof textos[id] === 'string' && textos[id].length > 0, `${missao.id}: texto ${id} fora do pt-BR.json`);
    texto(missao.titulo);
    for (const o of missao.objetivos) texto(o.texto);
    for (const g of missao.gatilhos) {
      for (const c of condicoes(g.quando)) {
        if (c.gatilho) assert.ok(gatilhos.has(c.gatilho), `${g.id}: gatilho ${c.gatilho}`);
        if (c.grupo) assert.ok(grupos.has(c.grupo), `${g.id}: grupo ${c.grupo}`);
        if (c.area) assert.ok(areas.has(c.area), `${g.id}: área ${c.area}`);
        for (const t of c.tipos ?? []) assert.ok(tipos.has(t), `${g.id}: tipo ${t}`);
      }
      for (const a of g.acoes) {
        if (a.texto) texto(a.texto);
        if (a.objetivo) assert.ok(objetivos.has(a.objetivo), `${g.id}: objetivo ${a.objetivo}`);
        if (a.area) assert.ok(areas.has(a.area), `${g.id}: área ${a.area}`);
        if (a.rota) assert.ok(rotas.has(a.rota), `${g.id}: rota ${a.rota}`);
        if (a.grupo) assert.ok(grupos.has(a.grupo), `${g.id}: grupo ${a.grupo}`);
        if (a.nome && a.faz === 'variavel') assert.ok(variaveis.has(a.nome), `${g.id}: variável ${a.nome}`);
        for (const u of a.unidades ?? []) assert.ok(tipos.has(u.tipo), `${g.id}: tipo ${u.tipo}`);
      }
    }
  }
});

test('every attack of 6 or more units comes after a warning of at least 10 s, in every difficulty', () => {
  for (const missao of missoes) {
    const porId = new Map(missao.gatilhos.map(g => [g.id, g]));
    for (const g of missao.gatilhos) {
      for (const a of g.acoes) {
        if (a.faz !== 'criar' || a.jogador === 0) continue;
        const maior = Math.max(...DIFICULDADES.map(d => a.unidades.reduce((s, u) => s + valor(u.quantos, d), 0)));
        if (maior < TAMANHO_COM_AVISO) continue;
        const q = g.quando;
        assert.equal(q.se, 'depoisDe', `${g.id}: onda ${a.grupo} de até ${maior} sem aviso antes`);
        assert.ok(DIFICULDADES.every(d => valor(q.segundos, d) >= AVISO_MINIMO_S), `${g.id}: aviso de menos de ${AVISO_MINIMO_S} s`);
        const aviso = porId.get(q.gatilho);
        assert.ok(aviso.acoes.some(x => x.faz === 'aviso' && x.grupo === a.grupo), `${g.id}: ${q.gatilho} não avisa ${a.grupo}`);
      }
    }
  }
});

test('the sandbox ends: a win by surviving the waves or taking down the camp, a loss without a way to rebuild', () => {
  const vitorias = caixa.gatilhos.filter(g => g.acoes.some(a => a.faz === 'vitoria'));
  const derrotas = caixa.gatilhos.filter(g => g.acoes.some(a => a.faz === 'derrota'));
  assert.deepEqual(vitorias.map(g => g.id).sort(), ['vitoria-acampamento', 'vitoria-ondas']);
  assert.equal(derrotas.length, 1);
  const q = derrotas[0].quando;
  assert.equal(q.se, 'contagem');
  assert.equal(q.maximo, 0);
  assert.deepEqual([...q.tipos].sort(), ['equipe-de-manutencao', 'escritorio-regional', 'poste-avancado']);
  const camp = caixa.grupos.acampamento;
  const mapa = mapaDe(caixa);
  assert.deepEqual(mapa.entidades.filter(e => camp.includes(e.etiqueta)).map(e => e.tipo).sort(), ['barracao', 'carrocao-mae', 'ferraria-a-vapor']);
  // the final wave is every group created by the last wave trigger
  const ultima = caixa.gatilhos.find(g => g.id === 'onda-6');
  const gruposFinais = ultima.acoes.filter(a => a.faz === 'criar').map(a => a.grupo).sort();
  const exigidos = vitorias.find(g => g.id === 'vitoria-ondas').quando.condicoes.filter(c => c.se === 'vivos').map(c => c.grupo).sort();
  assert.deepEqual(exigidos, gruposFinais);
});

// Timeline of the sandbox waves: warnings fire at the later of their minimum time and either the previous wave dying
// (fast player) or the fallback clock (slow player); each wave is created its warning delay later.
function linhaDoTempo(dificuldade, rapido) {
  const ondas = [];
  let anterior = null;
  for (const g of caixa.gatilhos.filter(x => /^onda-\d$/.test(x.id))) {
    let nasce;
    if (g.quando.se === 'tempo') nasce = valor(g.quando.segundos, dificuldade);
    else {
      const aviso = caixa.gatilhos.find(x => x.id === g.quando.gatilho);
      const [minimo, alguma] = aviso.quando.condicoes;
      const folga = alguma.condicoes.find(c => c.se === 'tempo').segundos;
      // a fast player clears the previous wave within a minute and a half of its creation
      const avisa = rapido ? Math.max(minimo.segundos, Math.min(folga, anterior + 90)) : folga;
      nasce = avisa + valor(g.quando.segundos, dificuldade);
    }
    const tamanho = g.acoes.filter(a => a.faz === 'criar').reduce((s, a) => s + a.unidades.reduce((t, u) => t + valor(u.quantos, dificuldade), 0), 0);
    ondas.push({ id: g.id, nasce, tamanho });
    anterior = nasce;
  }
  return ondas;
}

test('the scripted pace lands inside the E3 targets', () => {
  const mapa = mapaDe(caixa);
  const rolima = unidades.find(u => u.nome === 'rolima');
  const primeira = caixa.gatilhos.find(g => g.id === 'onda-1');
  const rota = mapa.rotas[primeira.acoes.find(a => a.faz === 'ordenar').rota];
  let comprimento = 0;
  for (let k = 1; k < rota.length; k++) comprimento += Math.hypot(rota[k][0] - rota[k - 1][0], rota[k][1] - rota[k - 1][1]);
  // from the end of the route to the harvesters is a few more cells; first shot = creation + walk
  const primeiroTiroS = valor(primeira.quando.segundos, 'normal') + (comprimento + 8) / (rolima.velocidade / 100);
  assert.ok(primeiroTiroS >= 150 && primeiroTiroS <= 240, `primeiro tiro estimado em ${primeiroTiroS.toFixed(0)} s`);
  for (const dificuldade of DIFICULDADES) {
    for (const rapido of [true, false]) {
      const ondas = linhaDoTempo(dificuldade, rapido);
      assert.equal(ondas.length, 6);
      for (let k = 1; k < ondas.length; k++) assert.ok(ondas[k].nasce - ondas[k - 1].nasce >= 120, `${dificuldade}: ${ondas[k].id} cola na anterior`);
      const ultima = ondas.at(-1).nasce;
      // the last wave walks about a minute and fights another; the match lands between 15 and 25 minutes
      assert.ok(ultima + 120 >= 15 * 60 && ultima + 120 <= 25 * 60, `${dificuldade}${rapido ? ' rápido' : ''}: última onda aos ${ultima} s`);
    }
  }
  // waves grow along the match in Normal
  const tamanhos = linhaDoTempo('normal', false).map(o => o.tamanho);
  for (let k = 1; k < tamanhos.length; k++) assert.ok(tamanhos[k] >= tamanhos[k - 1], `ondas ${tamanhos.join(', ')}`);
});

test('the interface texts name every kind and research and have no empty entry', () => {
  for (const [id, texto] of Object.entries(textos)) {
    assert.match(id, /^[a-z0-9_-]+(\.[a-z0-9_-]+)+$/, `id ${id}`);
    assert.ok(typeof texto === 'string' && texto.trim().length > 0, `texto vazio em ${id}`);
    assert.ok(!/\n/.test(texto), `quebra de linha em ${id}`);
  }
  for (const u of unidades) assert.ok(textos[`unidade.${u.nome}.nome`], `unidade.${u.nome}.nome`);
  for (const p of predios) assert.ok(textos[`predio.${p.nome}.nome`], `predio.${p.nome}.nome`);
  for (const p of pesquisas) assert.ok(textos[`pesquisa.${p.nome}.nome`], `pesquisa.${p.nome}.nome`);
});
