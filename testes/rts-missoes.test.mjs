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
    const nos = new Set(mapa.nos.map(n => n.id));
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
        if (c.no) assert.ok(nos.has(c.no), `${g.id}: nó ${c.no}`);
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
  // the base is gone (headquarters, forward posts and the garage, which makes the crew) and the player cannot raise a
  // forward post in time: no crew, not enough charge for one, or 90 s after the base fell; the match always ends
  const [semBase, semSaida] = derrotas[0].quando.condicoes;
  assert.equal(semBase.se, 'contagem');
  assert.equal(semBase.maximo, 0);
  assert.deepEqual([...semBase.tipos].sort(), ['escritorio-regional', 'garagem', 'poste-avancado']);
  const custoPoste = predios.find(p => p.nome === 'poste-avancado').custo;
  assert.ok(semSaida.condicoes.some(c => c.se === 'contagem' && c.tipos.includes('equipe-de-manutencao') && c.maximo === 0));
  assert.ok(semSaida.condicoes.some(c => c.se === 'recursos' && c.maximo === custoPoste - 1));
  const prazo = semSaida.condicoes.find(c => c.se === 'depoisDe');
  assert.ok(prazo && prazo.segundos <= 120, 'a partida termina mesmo com uma Equipe escondida');
  const aviso = caixa.gatilhos.find(g => g.id === prazo.gatilho);
  assert.deepEqual(aviso.quando, semBase, 'o rádio avisa do prazo no instante em que a base cai');
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

test('the home yard is known from the first tick, so the first minute teaches collecting', () => {
  const mapa = mapaDe(caixa);
  const inicio = caixa.gatilhos.find(g => g.quando.se === 'tempo' && g.quando.segundos === 0);
  const reveladas = inicio.acoes.filter(a => a.faz === 'revelar' && a.jogador === 0).map(a => mapa.areas[a.area]);
  const casa = mapa.nos.findIndex(n => n.id === 'cemiterio-sudoeste');
  const pilhas = mapa.entidades.filter(e => e.tipo === 'pilha' && e.no === casa);
  assert.ok(pilhas.length > 0);
  for (const p of pilhas) {
    assert.ok(reveladas.some(a => p.x >= a.x && p.x < a.x + a.largura && p.y >= a.y && p.y < a.y + a.altura), `pilha em ${p.x},${p.y} começa escondida`);
  }
});

// ---------- "Morro Aceso", the first mission (stage E4) ----------

const morro = missoes.find(m => m.id === 'morro-aceso');
const gatilhoDe = id => morro.gatilhos.find(g => g.id === id);
const acoesDe = (id, faz) => gatilhoDe(id).acoes.filter(a => a.faz === faz);
const somaDaOnda = (id, dificuldade) => acoesDe(id, 'criar').reduce((s, a) => s + a.unidades.reduce((t, u) => t + valor(u.quantos, dificuldade), 0), 0);
// the first `tempo` a condition waits for, at a difficulty (its fallback clock)
const relogio = (c, dificuldade) => [...condicoes(c)].filter(x => x.se === 'tempo').map(x => valor(x.segundos, dificuldade)).sort((a, b) => b - a)[0];

test('morro-aceso: ten objectives, five main and five optional, the camp among the optional ones', () => {
  assert.equal(morro.objetivos.length, 10);
  assert.equal(morro.objetivos.filter(o => o.tipo === 'principal').length, 5);
  assert.ok(morro.objetivos.some(o => o.id === 'desmontar-acampamento' && o.tipo === 'opcional'));
  // every objective is shown by some trigger and closed by another
  for (const o of morro.objetivos) {
    const estados = morro.gatilhos.flatMap(g => g.acoes.filter(a => a.faz === 'objetivo' && a.objetivo === o.id).map(a => a.estado));
    assert.ok(estados.includes('ativo') && estados.includes('cumprido'), `${o.id}: ${estados.join(', ')}`);
  }
});

test('morro-aceso: taking the camp down pays a clear reward, and the camp packs up and runs to its refuge first', () => {
  const desmontado = gatilhoDe('acampamento-desmontado');
  assert.deepEqual(desmontado.quando, { se: 'vivos', grupo: 'acampamento', maximo: 0 });
  assert.ok(desmontado.acoes.some(a => a.faz === 'recursos' && a.jogador === 0 && a.somar > 0), 'Carga na conta');
  // the second half of the reward: the attack through the gorge at the climax only comes while the camp stands
  assert.deepEqual(gatilhoDe('aviso-final-desfiladeiro').quando.condicoes[1], { se: 'nao', condicao: { se: 'objetivo', objetivo: 'desmontar-acampamento', estado: 'cumprido' } });
  // every building of the camp has its packed kind, and the threat packs them
  for (const etiqueta of morro.grupos.acampamento) {
    const tipo = mapaDe(morro).entidades.find(e => e.etiqueta === etiqueta).tipo;
    assert.ok(unidades.some(u => u.nome === `${tipo}-empacotado`), `${tipo}-empacotado`);
  }
  assert.ok(acoesDe('acampamento-ameacado', 'empacotar').length === 1);
  assert.equal(acoesDe('acampamento-foge', 'ordenar')[0].rota, 'rota-fuga');
  assert.equal(acoesDe('acampamento-na-grota', 'desempacotar')[0].area, 'refugio-grota');
});

test('morro-aceso: difficulty in data, as the phase table asks', () => {
  for (const [dificuldade, carga, ponte, aviso, religacao, final] of [['facil', 2000, 3, 25, 60, 8], ['normal', 1500, 5, 15, 90, 12], ['dificil', 1200, 7, 10, 120, 16]]) {
    assert.equal(valor(acoesDe('inicio', 'recursos').find(a => a.jogador === 0).somar, dificuldade), carga, `${dificuldade}: Carga inicial`);
    assert.equal(somaDaOnda('onda-ponte', dificuldade), ponte, `${dificuldade}: onda da Ponte Velha`);
    for (const g of morro.gatilhos.filter(x => acoesDe(x.id, 'criar').some(a => a.jogador === 1) && x.quando.se === 'depoisDe')) assert.equal(valor(g.quando.segundos, dificuldade), aviso, `${dificuldade}: aviso de ${g.id}`);
    assert.equal(valor(acoesDe('inicio', 'religavel').find(a => a.grupo === 'subestacao-do-morro').segundos, dificuldade), religacao, `${dificuldade}: religação final`);
    assert.equal(somaDaOnda('onda-final-varzea', dificuldade) + somaDaOnda('onda-final-desfiladeiro', dificuldade), final, `${dificuldade}: onda final`);
  }
  const locomoveis = dificuldade => ['onda-final-varzea', 'onda-final-desfiladeiro'].reduce((s, id) => s + acoesDe(id, 'criar').reduce((t, a) => t + a.unidades.filter(u => u.tipo === 'locomovel').reduce((q, u) => q + valor(u.quantos, dificuldade), 0), 0), 0);
  assert.deepEqual(DIFICULDADES.map(locomoveis), [1, 1, 2], 'o primeiro Locomóvel no clímax, e um segundo no Difícil');
});

test('morro-aceso: the moments follow each other, each with a fallback clock, and night ends a match that drags', () => {
  for (const dificuldade of DIFICULDADES) {
    const m2 = relogio(gatilhoDe('rolimas').quando, dificuldade);
    const m3 = relogio(gatilhoDe('aviso-ponte').quando, dificuldade);
    const m4 = relogio(gatilhoDe('m4-rota').quando, dificuldade);
    const noite = relogio(gatilhoDe('anoitecer').quando, dificuldade);
    assert.ok(m2 >= 4 * 60 && m2 <= 7 * 60, `${dificuldade}: primeiro tiro previsto aos ${m2} s`);
    assert.ok(m2 < m3 && m3 < m4 && m4 + 10 * 60 < noite, `${dificuldade}: ${m2}, ${m3}, ${m4}, ${noite}`);
    assert.ok(noite >= 35 * 60, `${dificuldade}: a noite chega aos ${noite} s, longe da mediana de 20 a 25 min`);
    // the radio warns ten and three minutes ahead
    assert.equal(relogio(gatilhoDe('faltam-10').quando, dificuldade), noite - 600);
    assert.equal(relogio(gatilhoDe('faltam-3').quando, dificuldade), noite - 180);
  }
  // the climax starts when the player starts re-powering the substation; the win comes after the close
  assert.deepEqual(gatilhoDe('climax').quando, { se: 'religando', grupo: 'subestacao-do-morro', jogador: 0 });
  assert.deepEqual(gatilhoDe('vitoria').quando, { se: 'depoisDe', gatilho: 'subestacao-religada', segundos: 20 });
  assert.ok(acoesDe('subestacao-religada', 'luz').some(a => a.cena === 'entardecer' && a.ponto === 'subestacao'));
  const fins = morro.gatilhos.filter(g => g.acoes.some(a => a.faz === 'vitoria' || a.faz === 'derrota')).map(g => g.id).sort();
  assert.deepEqual(fins, ['anoitecer', 'derrota', 'vitoria']);
});

test('morro-aceso: every enemy wave the triggers create has a team that drives it, and the Religador always comes back', () => {
  const equipes = new Map(morro.equipes.map(e => [e.grupo, e]));
  for (const g of morro.gatilhos) {
    for (const a of g.acoes.filter(x => x.faz === 'criar' && x.jogador === 1)) {
      const equipe = equipes.get(a.grupo);
      assert.ok(equipe && equipe.faz === 'atacar' && equipe.desde === g.id, `${a.grupo}: equipe que ataca desde ${g.id}`);
      assert.equal(equipe.aviso, 0, `${a.grupo}: o aviso é do gatilho`);
    }
  }
  for (const nome of ['posto-guarda', 'guarnicao-acampamento', 'guarnicao-desfiladeiro', 'patrulha-varzea', 'acampamento']) assert.ok(equipes.has(nome), nome);
  assert.deepEqual([...new Set(morro.equipes.map(e => e.faz))].sort(), ['atacar', 'guardar', 'patrulhar', 'reconstruir']);
  // the Religador comes with the North Yard, without it after a while, and again whenever it falls
  for (const id of ['cemiterio-tomado', 'religador-sem-cemiterio', 'religador-reposto']) assert.ok(acoesDe(id, 'criar').some(a => a.jogador === 0 && a.unidades.some(u => u.tipo === 'religador')), id);
  assert.ok(acoesDe('inicio', 'bloquear')[0].tipos.includes('religador'), 'the player never trains one');
});

test('morro-aceso: briefing, about forty radio lines, and the lessons read events the play-test log writes', () => {
  const briefing = Object.keys(textos).filter(id => id.startsWith('briefing.morro-aceso.'));
  assert.ok(briefing.length >= 4 && briefing.length <= 8, `${briefing.length} falas de briefing`);
  briefing.forEach((id, k) => assert.match(id, new RegExp(`^briefing\\.morro-aceso\\.${k + 1}\\.(supervisora|locutor)$`)));
  const falas = new Set(morro.gatilhos.flatMap(g => g.acoes.filter(a => a.faz === 'mensagem' && a.texto.startsWith('radio.')).map(a => a.texto)));
  assert.ok(falas.size >= 35 && falas.size <= 55, `${falas.size} falas de rádio`);
  // the C15 entries the log writes (site/rts/js/telemetria/registro.js) and the page notes
  const EVENTOS = new Set(['comando', 'construcao', 'producao', 'religado', 'promocao', 'area', 'tiro', 'morte', 'aviso', 'onda', 'fim', 'noEsgotado', 'lutaInicio', 'lutaFim', 'briefingPulado', 'reiniciar']);
  const nomes = new Set([...unidades, ...predios].map(t => t.nome).concat(['pilha', 'faisca']));
  const areas = new Set(Object.keys(mapaDe(morro).areas));
  const folhas = c => (c.todas ?? c.alguma ?? [c]).flatMap(x => (x.todas || x.alguma ? folhas(x) : [x]));
  assert.ok(morro.licoes.length >= 10);
  for (const licao of morro.licoes) {
    assert.match(licao.momento, /^M[0-6]$/);
    for (const c of folhas(licao.se)) {
      assert.ok(EVENTOS.has(c.evento), `${licao.id}: evento ${c.evento}`);
      for (const campo of ['tipoUnidade', 'alvoTipo']) if (c.campos?.[campo]) assert.ok(nomes.has(c.campos[campo]), `${licao.id}: ${c.campos[campo]}`);
      if (c.campos?.area) assert.ok(areas.has(c.campos.area), `${licao.id}: área ${c.campos.area}`);
    }
  }
  assert.deepEqual([...new Set(morro.licoes.map(l => l.momento))].sort(), ['M0', 'M1', 'M2', 'M3', 'M4', 'M5']);
});
