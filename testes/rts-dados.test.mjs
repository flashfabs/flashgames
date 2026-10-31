// Game data of the RTS (contract C5): the numbers the design front writes in site/rts/dados/, checked before the
// motor's own validator sees them. Every number is an integer, every reference resolves, every brief has its entry,
// and a crude duel model keeps the infantry fight inside the pace target of stage E3.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const lerJson = caminho => JSON.parse(readFileSync(raiz + caminho, 'utf8'));

const armas = lerJson('site/rts/dados/armas.json');
const unidades = lerJson('site/rts/dados/unidades.json');
const predios = lerJson('site/rts/dados/predios.json');
const economia = lerJson('site/rts/dados/economia.json');
const pesquisas = lerJson('site/rts/dados/pesquisas.json');
const indice = lerJson('site/rts/assets/indice.json');

const TIPOS_DANO = ['bala', 'perfurante', 'explosivo', 'pane'];
const BLINDAGENS = ['pessoal', 'leve', 'pesada', 'estrutura'];
const FACCOES = ['religadores', 'desligados'];
const CLASSES = ['infantaria', 'veiculo', 'veiculoGrande'];
const NOME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PASSOS_POR_SEGUNDO = 30;

// Every leaf number anywhere in a value, with its path.
function numeros(valor, caminho = '') {
  if (typeof valor === 'number') return [[caminho, valor]];
  if (Array.isArray(valor)) return valor.flatMap((v, i) => numeros(v, `${caminho}[${i}]`));
  if (valor && typeof valor === 'object') return Object.entries(valor).flatMap(([k, v]) => numeros(v, caminho ? `${caminho}.${k}` : k));
  return [];
}

const arquivos = { armas, unidades, predios, economia, pesquisas };

test('every data file has an integer version and only integer numbers', () => {
  for (const [nome, dados] of Object.entries(arquivos)) {
    assert.ok(Number.isInteger(dados.versao) && dados.versao >= 1, `${nome}: versao`);
    for (const [caminho, valor] of numeros(dados)) assert.ok(Number.isInteger(valor), `${nome}.${caminho} = ${valor} não é inteiro`);
  }
});

test('times in milliseconds land on whole simulation steps', () => {
  for (const [nome, dados] of Object.entries(arquivos)) {
    for (const [caminho, valor] of numeros(dados)) {
      if (!/Ms(\[\d+\])?$/.test(caminho)) continue;
      assert.equal((valor * PASSOS_POR_SEGUNDO) % 1000, 0, `${nome}.${caminho} = ${valor} ms não cai num passo inteiro`);
    }
  }
});

test('names are unique slugs across units and buildings, which share the kind index space', () => {
  const todos = [...unidades.unidades, ...predios.predios].map(t => t.nome);
  for (const nome of todos) assert.match(nome, NOME);
  assert.equal(new Set(todos).size, todos.length, 'nome repetido entre unidades e prédios');
  const nomesArmas = armas.armas.map(a => a.nome);
  for (const nome of nomesArmas) assert.match(nome, NOME);
  assert.equal(new Set(nomesArmas).size, nomesArmas.length, 'arma repetida');
});

test('damage matrix, cover and veterancy follow the plan', () => {
  assert.deepEqual(Object.keys(armas.matriz), TIPOS_DANO);
  for (const linha of Object.values(armas.matriz)) {
    assert.equal(linha.length, BLINDAGENS.length);
    // no counter is ever absolute: every unit stays useful
    for (const valor of linha) assert.ok(valor >= 25 && valor <= 200, `multiplicador ${valor}`);
  }
  for (const linha of Object.values(armas.cobertura)) {
    assert.equal(linha.length, TIPOS_DANO.length);
    for (const valor of linha) assert.ok(valor > 0 && valor <= 100);
  }
  // explosive ignores cover
  assert.equal(armas.cobertura.ruina[TIPOS_DANO.indexOf('explosivo')], 100);
  const { limiares, dano, resistencia, recarga, coletor, suporte } = armas.veterania;
  assert.equal(coletor.viagens.length, coletor.velocidade.length);
  assert.ok(suporte.vidaReparada.length >= 1);
  assert.equal(limiares.length, 3);
  for (const serie of [dano, resistencia, recarga]) assert.equal(serie.length, limiares.length + 1);
  for (let i = 1; i < limiares.length; i++) assert.ok(limiares[i] > limiares[i - 1]);
});

test('weapons are well formed', () => {
  for (const arma of armas.armas) {
    assert.ok(TIPOS_DANO.includes(arma.tipoDano), `${arma.nome}: tipoDano`);
    assert.ok(arma.dano > 0 && arma.recargaMs > 0, `${arma.nome}: dano e recarga`);
    assert.ok(arma.alcance > arma.alcanceMinimo, `${arma.nome}: alcance mínimo`);
    assert.ok(arma.emArco === 0 || arma.emArco === 1);
    if (arma.tipoDano === 'explosivo') assert.ok(arma.raioArea > 0, `${arma.nome}: explosivo sempre tem área`);
  }
});

test('units reference existing weapons and are made by a building of their faction', () => {
  const nomesArmas = new Set(armas.armas.map(a => a.nome));
  const produzidas = new Map();
  for (const p of predios.predios) for (const u of p.produz) produzidas.set(u, [...(produzidas.get(u) ?? []), p]);
  for (const u of unidades.unidades) {
    assert.ok(FACCOES.includes(u.faccao), `${u.nome}: faccao`);
    assert.ok(CLASSES.includes(u.classe), `${u.nome}: classe`);
    assert.ok(BLINDAGENS.includes(u.blindagem) && u.blindagem !== 'estrutura', `${u.nome}: blindagem`);
    assert.ok(u.arma === null || nomesArmas.has(u.arma), `${u.nome}: arma ${u.arma}`);
    assert.ok(u.custo > 0 && u.tempoMs > 0 && u.vida > 0 && u.velocidade > 0 && u.lotacao >= 1, `${u.nome}: números básicos`);
    assert.ok(u.nivel === 1 || u.nivel === 2, `${u.nome}: nivel`);
    assert.ok(u.coletor === 0 || u.coletor === 1);
    if (u.coletor) assert.ok(u.coleta && u.coleta.carga > 0, `${u.nome}: coletor sem coleta`);
    const fabricas = produzidas.get(u.nome) ?? [];
    assert.ok(fabricas.length > 0, `${u.nome}: nenhum prédio produz`);
    for (const p of fabricas) assert.equal(p.faccao, u.faccao, `${u.nome} produzida por ${p.nome} de outra facção`);
  }
});

test('buildings reference existing kinds and the faction trees close', () => {
  const nomesUnidades = new Set(unidades.unidades.map(u => u.nome));
  const porNome = new Map(predios.predios.map(p => [p.nome, p]));
  const nomesArmas = new Set(armas.armas.map(a => a.nome));
  for (const p of predios.predios) {
    assert.ok([...FACCOES, 'neutro'].includes(p.faccao), `${p.nome}: faccao`);
    assert.equal(p.blindagem, 'estrutura');
    assert.ok(Array.isArray(p.pegada) && p.pegada.length === 2 && p.pegada.every(n => n >= 1 && n <= 8), `${p.nome}: pegada`);
    assert.ok(p.arma === null || nomesArmas.has(p.arma), `${p.nome}: arma`);
    for (const u of p.produz) assert.ok(nomesUnidades.has(u), `${p.nome} produz ${u}, que não existe`);
    for (const r of p.requer) assert.ok(porNome.has(r), `${p.nome} requer ${r}, que não existe`);
    for (const c of p.constroi) {
      assert.ok(porNome.has(c), `${p.nome} constrói ${c}, que não existe`);
      assert.equal(porNome.get(c).faccao, p.faccao);
      assert.equal(porNome.get(c).construidoPor, 'fila', `${c} está na fila de ${p.nome} mas não é construído pela fila`);
    }
    if (p.faccao === 'neutro') assert.equal(p.religavel, 1, `${p.nome}: estrutura neutra sem religar`);
    if (p.religavel) assert.ok(p.tempoReligarMs > 0);
    if (p.construidoPor === 'fila') {
      assert.ok(p.custo > 0 && p.tempoMs > 0, `${p.nome}: custo e tempo`);
      const qg = predios.predios.find(q => q.faccao === p.faccao && q.filaConstrucao);
      assert.ok(qg.constroi.includes(p.nome), `${p.nome}: fora da fila do QG`);
    }
  }
  for (const u of unidades.unidades) for (const e of u.ergue ?? []) assert.equal(porNome.get(e)?.construidoPor, 'unidade', `${u.nome} ergue ${e}`);
  for (const faccao of FACCOES) {
    const qgs = predios.predios.filter(p => p.faccao === faccao && p.papel === 'qg');
    assert.equal(qgs.length, 1, `${faccao}: um QG`);
    assert.ok(predios.predios.some(p => p.faccao === faccao && p.deposito), `${faccao}: sem depósito`);
    // every headquarters opens a building area: a network for one faction, a plain radius for the other
    assert.ok(qgs[0].raioRede > 0 || qgs[0].raioConstrucao > 0, `${faccao}: o QG não abre área de construção`);
  }
});

test('the network is reachable: something extends it and the headquarters roots it', () => {
  const qg = predios.predios.find(p => p.nome === 'escritorio-regional');
  assert.ok(qg.raioRede > 0);
  const poste = predios.predios.find(p => p.nome === 'poste');
  assert.ok(poste.raioRede > 0 && poste.custo <= 100, 'poste barato que estende a rede');
});

test('research points at real kinds and the technical building', () => {
  const nomesUnidades = new Set(unidades.unidades.map(u => u.nome));
  const porNome = new Map(predios.predios.map(p => [p.nome, p]));
  for (const pesquisa of pesquisas.pesquisas) {
    assert.match(pesquisa.nome, NOME);
    assert.ok(porNome.has(pesquisa.predio), `${pesquisa.nome}: predio`);
    for (const t of pesquisa.efeito.tipos ?? []) assert.ok(nomesUnidades.has(t), `${pesquisa.nome}: ${t}`);
  }
  // the second tier is unlocked by the technical building of the player faction
  assert.ok(pesquisas.pesquisas.some(p => p.efeito.automatica && p.efeito.efeito === 'nivel' && p.efeito.nivel === 2));
});

test('economy numbers stay in the ranges the plan argues for', () => {
  assert.equal(economia.lotacaoMaxima, 60);
  assert.ok(economia.saturacao >= 2 && economia.saturacao <= 4);
  assert.equal(economia.cargaDerramada.porcento, 100);
  // wind pays in announced gusts, about 40 C per minute per windmill on average
  const porMinuto = (economia.vento.lote * 60000) / economia.vento.intervaloMs;
  assert.ok(porMinuto >= 30 && porMinuto <= 50, `vento ${porMinuto} C/min`);
  assert.ok(economia.vento.avisoMs >= 10000, 'rajada anunciada com pelo menos 10 s');
  assert.ok(economia.distanciaMinimaPilha >= 3 && economia.distanciaMinimaPilha <= 8, 'depósito longe das pilhas, sem esconder o cemitério');
  for (const nome of ['torre-de-holofote', 'holofote-de-estrada']) {
    const { holofote } = predios.predios.find(p => p.nome === nome);
    assert.ok(holofote && holofote.alcance > 0 && holofote.abertura > 0 && holofote.revelaTocaia === 1, `${nome}: holofote`);
  }
});

test('every brief has exactly one data entry, and every entry a brief', () => {
  const briefs = readdirSync(raiz + 'arte/briefs').filter(f => /^(religadores|desligados|neutro)-(unidade|construcao|estrutura)-.+\.md$/.test(f));
  const esperados = briefs.map(f => {
    const [, faccao, , nome] = f.match(/^(religadores|desligados|neutro)-(unidade|construcao|estrutura)-(.+)\.md$/);
    return `${faccao}/${nome}`;
  });
  const dados = [...unidades.unidades, ...predios.predios].map(t => `${t.faccao}/${t.nome}`);
  assert.deepEqual([...dados].sort(), [...esperados].sort());
});

test('asset ids follow the art naming and match the index where the art exists', () => {
  const categoriaUnidade = u => (u.classe === 'infantaria' ? 'infantaria' : 'veiculo');
  for (const u of unidades.unidades) assert.equal(u.asset, `${u.faccao}-${categoriaUnidade(u)}-${u.nome}`);
  for (const p of predios.predios) assert.equal(p.asset, `${p.faccao}-${p.faccao === 'neutro' ? 'estrutura' : 'construcao'}-${p.nome}`);
  for (const t of [...unidades.unidades, ...predios.predios]) {
    const asset = indice.assets[t.asset];
    if (asset) assert.equal(asset.manifesto.split('/')[1], t.asset.split('-')[1], `${t.asset}: categoria diferente no índice`);
  }
});

// Crude fight model: everyone in range, fire spread over the living enemies, integer damage. Real fights add the
// approach and focus fire; the target band for 10 against 10 in stage E3 is 8 to 20 s.
function duelo(a, b, n) {
  const linha = (tipo, alvo) => {
    const arma = armas.armas.find(x => x.nome === tipo.arma);
    return { vida: tipo.vida, dano: Math.trunc((arma.dano * armas.matriz[arma.tipoDano][BLINDAGENS.indexOf(alvo.blindagem)]) / 100), recarga: (arma.recargaMs * PASSOS_POR_SEGUNDO) / 1000 };
  };
  const lados = [linha(a, b), linha(b, a)].map((l, k) => ({ ...l, vidas: Array(n).fill(l.vida), espera: Array.from({ length: n }, (_, i) => (i + k) % 3) }));
  for (let passo = 1; passo < 120 * PASSOS_POR_SEGUNDO; passo++) {
    const vivos = lados.map(l => l.vidas.flatMap((v, i) => (v > 0 ? [i] : [])));
    if (vivos[0].length === 0 || vivos[1].length === 0) return passo / PASSOS_POR_SEGUNDO;
    const danos = lados.map((l, k) => vivos[k].flatMap((i, j) => (--l.espera[i] <= 0 ? ((l.espera[i] = l.recarga), [[vivos[1 - k][j % vivos[1 - k].length], l.dano]]) : [])));
    danos.forEach((lista, k) => lista.forEach(([i, d]) => (lados[1 - k].vidas[i] -= d)));
  }
  return Infinity;
}

test('10 against 10 of basic infantry resolves inside the E3 band', () => {
  const turma = unidades.unidades.find(u => u.nome === 'turma-de-linha');
  const chapa = unidades.unidades.find(u => u.nome === 'chapa');
  const segundos = duelo(turma, chapa, 10);
  assert.ok(segundos >= 8 && segundos <= 20, `10 contra 10 em ${segundos} s`);
});

test('two scouts kill an unescorted harvester in under 30 s, so harassment matters but leaves time to answer', () => {
  const rolima = unidades.unidades.find(u => u.nome === 'rolima');
  const guincho = unidades.unidades.find(u => u.nome === 'guincho-de-celulas');
  const arma = armas.armas.find(x => x.nome === rolima.arma);
  const porTiro = Math.trunc((arma.dano * armas.matriz[arma.tipoDano][BLINDAGENS.indexOf(guincho.blindagem)]) / 100);
  const segundos = Math.ceil(guincho.vida / (2 * porTiro)) * (arma.recargaMs / 1000);
  assert.ok(segundos >= 12 && segundos <= 30, `dois batedores matam um coletor em ${segundos} s`);
});
