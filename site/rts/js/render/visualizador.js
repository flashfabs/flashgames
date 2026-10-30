// Atlas viewer for the style gate (site/rts/ferramentas/visualizador.html): shows a sprite sheet with the game's own
// renderer, projection, team tint and shadow, over the procedural terrain with a cell ruler and the attachment
// points, and compares two versions side by side under the same controls (animation, direction, level, team, zoom).
// URL parameters mirror the controls: a, b (built-in id or manifest URL), anim, torre, dir, modo, nivel, time, zoom,
// sombra (alfa, camada, comparar or nenhuma; comparar puts the alpha-derived shadow on A and the rendered layer on B)
// and chao (a terrain manifest URL, or procedural). Light layers (camada "luzes") are added over the body.
import { carregarProjecao, mundoParaTela } from './projecao.js';
import { criarRenderizador } from './renderizador.js';
import { tamanhoNativo } from './resolucao.js';
import { quadroGlobal, pontoDeEncaixe } from './sprites.js';
import { FLOATS_INSTANCIA } from './backend-webgl2.js';

const MAPA = 96;
const REGUA = 10; // cells of ruler around the centre
const CENTRO = MAPA / 2;
const EMBUTIDAS = [
  { id: 'prototipo', nome: 'Tanque do protótipo' },
  { id: 'ficha-tanque', nome: 'Ficha: tanque' },
  { id: 'ficha-veiculo-leve', nome: 'Ficha: veículo leve' },
];
const CORES_PONTOS = { encaixe_torre: '#6dff8a', boca: '#ffcf7a', escape: '#9ab0ff', topo: '#ff7ae0' };
const COR_OUTROS_PONTOS = '#ffffff';
const ehTorre = a => a.camada.startsWith('torre');
const ehLuz = a => a.camada === 'luzes';
// non-looping animations restart after this pause, so explosions and deaths keep playing
const PAUSA_SEM_LACO_S = 0.6;

const $ = id => document.getElementById(id);
const parametros = new URLSearchParams(location.search);
const projecao = await carregarProjecao();
const controles = {
  animacao: parametros.get('anim') ?? '',
  animacaoTorre: parametros.get('torre') ?? 'torre',
  direcao: Number(parametros.get('dir') ?? 0),
  torre: 0,
  modo: parametros.get('modo') ?? 'uma',
  nivel: parametros.get('nivel') ?? 'uhd',
  time: Number(parametros.get('time') ?? 0),
  zoom: Number(parametros.get('zoom') ?? 1),
  girar: false,
  regua: true,
  pontos: true,
  luzes: true,
  chao: parametros.get('chao'),
  sombra: parametros.get('sombra') ?? 'alfa',
};

function criarLista(capacidade) {
  // chaves: depth of each instance (the unit's ground y), so a turret or a light keeps its body's place
  return { dados: new Float32Array(capacidade * FLOATS_INSTANCIA), n: 0, chaves: [] };
}

function criarLado(elemento) {
  const canvas = elemento.querySelector('.cena');
  const regua = elemento.querySelector('.regua');
  const camera = { x: CENTRO, y: CENTRO, zoom: controles.zoom };
  const render = criarRenderizador(canvas, projecao, { camera, visivel: () => true, escalaFixa: 1 });
  const relevo = new Uint8Array(MAPA * MAPA);
  for (let i = 0; i < relevo.length; i++) relevo[i] = 96 + ((i * 37) % 64);
  render.definirMapa({ largura: MAPA, altura: MAPA, bloqueado: new Uint8Array(MAPA * MAPA), relevo });
  render.atualizarNeblina(new Uint8Array(MAPA * MAPA).fill(255));
  return {
    elemento,
    canvas,
    regua,
    contexto: regua.getContext('2d'),
    legenda: elemento.querySelector('.legenda'),
    camera,
    render,
    fonte: '',
    folha: null,
    torre: null,
    erro: '',
    listas: { sprites: criarLista(64), sombras: criarLista(64), aneis: criarLista(1), barras: criarLista(64) },
    unidades: [],
  };
}

const lados = [criarLado($('lado-a')), criarLado($('lado-b'))];

// ---------- sources: built-ins, the art index and free URLs ----------

async function lerIndice() {
  try {
    const url = new URL('../../assets/indice.json', import.meta.url);
    const resposta = await fetch(url);
    if (!resposta.ok) return [];
    const indice = await resposta.json();
    const entradas = [];
    const visitar = valor => {
      if (Array.isArray(valor)) valor.forEach(visitar);
      else if (valor && typeof valor === 'object') {
        const caminho = valor.manifesto ?? valor.url ?? valor.caminho;
        if (typeof caminho === 'string' && caminho.endsWith('.json')) {
          const id = new URL(caminho, url).href;
          entradas.push({ id, nome: valor.asset ?? caminho.split('/').pop().replace(/\.json$/, ''), tipo: valor.tipo ?? '' });
        }
        else Object.values(valor).forEach(visitar);
      }
    };
    visitar(indice);
    return entradas;
  } catch (erro) {
    console.warn('índice de assets ilegível', erro);
    return [];
  }
}

function preencherFontes(select, entradas, permitirNenhuma) {
  select.replaceChildren();
  if (permitirNenhuma) select.append(new Option('nenhuma', ''));
  for (const e of entradas) select.append(new Option(e.nome, e.id));
  select.append(new Option('URL do manifesto…', 'url'));
}

async function carregarFonte(lado, fonte) {
  lado.fonte = fonte;
  lado.folha = null;
  lado.torre = null;
  lado.erro = '';
  if (!fonte) return;
  try {
    if (fonte === 'prototipo') lado.folha = await lado.render.carregarPrototipo();
    else lado.folha = fonte.startsWith('ficha-') ? lado.render.folhas.folha(fonte) : await lado.render.carregarManifesto(fonte, controles.nivel);
    lado.torre = lado.folha && [...lado.folha.animacoes.values()].some(ehTorre) ? lado.folha : null;
    if (!lado.folha) throw new Error('asset não encontrado');
  } catch (erro) {
    lado.erro = erro.message;
    console.error(erro);
  }
  atualizarAnimacoes();
}

// ---------- controls ----------

function animacoesDoCorpo(folha) {
  return folha ? [...folha.animacoes.values()].filter(a => !ehTorre(a) && !ehLuz(a)) : [];
}

function animacoesDaTorre(folha) {
  return folha ? [...folha.animacoes.values()].filter(ehTorre) : [];
}

function atualizarAnimacoes() {
  const nomes = new Set(lados.flatMap(l => animacoesDoCorpo(l.folha).map(a => a.nome)));
  const select = $('animacao');
  select.replaceChildren(...[...nomes].map(n => new Option(n, n)));
  // the requested animation survives until every side has loaded (a side may bring it later)
  const prontos = lados.every(l => !l.fonte || l.folha || l.erro);
  if (!nomes.has(controles.animacao) && (prontos || !controles.animacao)) controles.animacao = nomes.values().next().value ?? '';
  select.value = controles.animacao;
  const torres = new Set(lados.flatMap(l => animacoesDaTorre(l.folha).map(a => a.nome)));
  const selectTorre = $('animacao-torre');
  selectTorre.replaceChildren(new Option('nenhuma', ''), ...[...torres].map(n => new Option(n, n)));
  if (controles.animacaoTorre && !torres.has(controles.animacaoTorre)) controles.animacaoTorre = torres.has('torre') ? 'torre' : '';
  selectTorre.value = controles.animacaoTorre;
  const direcoes = Math.max(1, ...lados.map(l => l.folha?.animacoes.get(controles.animacao)?.direcoes ?? l.folha?.direcoes ?? 1));
  $('direcao').max = String(direcoes - 1);
  controles.direcao = Math.min(controles.direcao, direcoes - 1);
  $('direcao').value = String(controles.direcao);
  $('direcao-valor').value = String(controles.direcao);
}

function ligarControles() {
  const cores = $('cores');
  for (let t = 0; t < 8; t++) {
    const botao = document.createElement('button');
    const [r, g, b] = projecao.dados.time.cores[t];
    botao.style.background = `rgb(${r} ${g} ${b})`;
    botao.setAttribute('aria-label', `cor de time ${t + 1}`);
    botao.setAttribute('aria-pressed', String(t === controles.time));
    botao.addEventListener('click', () => {
      controles.time = t;
      for (const b2 of cores.children) b2.setAttribute('aria-pressed', String(b2 === botao));
    });
    cores.append(botao);
  }
  $('animacao').addEventListener('change', e => {
    controles.animacao = e.target.value;
    atualizarAnimacoes();
  });
  $('direcao').addEventListener('input', e => {
    controles.direcao = Number(e.target.value);
    $('direcao-valor').value = e.target.value;
  });
  $('torre').addEventListener('input', e => (controles.torre = Number(e.target.value)));
  $('animacao-torre').addEventListener('change', e => (controles.animacaoTorre = e.target.value));
  $('modo').value = controles.modo;
  $('modo').addEventListener('change', e => (controles.modo = e.target.value));
  $('nivel').value = controles.nivel;
  $('nivel').addEventListener('change', e => {
    controles.nivel = e.target.value;
    lados.forEach(l => carregarFonte(l, l.fonte));
  });
  $('zoom').value = String(controles.zoom);
  $('zoom').addEventListener('change', e => (controles.zoom = Number(e.target.value)));
  $('sombra').value = controles.sombra;
  $('sombra').addEventListener('change', e => (controles.sombra = e.target.value));
  $('chao').addEventListener('change', e => trocarChao(e.target.value));
  for (const nome of ['girar', 'regua', 'pontos', 'luzes']) {
    $(nome).checked = controles[nome];
    $(nome).addEventListener('change', e => (controles[nome] = e.target.checked));
  }
  ['a', 'b'].forEach((letra, i) => {
    const select = $(`fonte-${letra}`);
    const url = $(`url-${letra}`);
    select.addEventListener('change', () => {
      url.hidden = select.value !== 'url';
      if (select.value !== 'url') escolherFonte(i, select.value);
    });
    url.addEventListener('change', () => escolherFonte(i, url.value.trim()));
  });
}

function escolherFonte(indice, fonte) {
  $('lados').classList.toggle('so-a', indice === 1 ? !fonte : !lados[1].fonte);
  redimensionar();
  carregarFonte(lados[indice], fonte);
}

function valorInicial(select, url, valor) {
  if (!valor) return '';
  if ([...select.options].some(o => o.value === valor)) {
    select.value = valor;
    return valor;
  }
  select.value = 'url';
  url.hidden = false;
  url.value = valor;
  return new URL(valor, location.href).href;
}

// ---------- frame ----------

function redimensionar() {
  for (const lado of lados) {
    const r = lado.elemento.getBoundingClientRect();
    const [largura, altura] = tamanhoNativo(r.width, r.height, window.devicePixelRatio || 1);
    lado.render.redimensionar(largura, altura);
    lado.regua.width = Math.round(r.width * (window.devicePixelRatio || 1));
    lado.regua.height = Math.round(r.height * (window.devicePixelRatio || 1));
  }
}

function escreverSprite(lista, x, y, z, quadro, sombraMetros, alfa = 1) {
  const o = lista.n++ * FLOATS_INSTANCIA;
  lista.dados.set([x, y, z, 1, quadro, controles.time, sombraMetros, alfa], o);
}

function tempoDe(anim, tempoS) {
  if (anim.laco || anim.fps <= 0) return tempoS;
  return tempoS % (anim.quadros / anim.fps + PAUSA_SEM_LACO_S);
}

async function trocarChao(url) {
  controles.chao = url;
  await Promise.all(lados.map(l => l.render.carregarTerreno(url || null).catch(erro => console.error(erro))));
}

// Units to show: one at the centre, or one per direction on a ring sized by the frame.
function montarLado(lado, tempoS, direcaoMostrada) {
  const { folha, listas } = lado;
  listas.sprites.n = listas.sombras.n = listas.barras.n = 0;
  listas.sprites.chaves.length = 0;
  lado.unidades.length = 0;
  if (!folha) return;
  const anim = folha.animacoes.get(controles.animacao) ?? animacoesDoCorpo(folha)[0];
  if (!anim) return;
  // a body animation of the combined layer already contains the turret
  const animTorre = anim.camada === 'completo' || !controles.animacaoTorre ? null : (lado.torre?.animacoes.get(controles.animacaoTorre) ?? null);
  const camada = controles.sombra === 'camada' || (controles.sombra === 'comparar' && lado === lados[1]);
  const sombraMetros = camada && folha.temSombra ? -1 : 1.2;
  const animLuzes = controles.luzes ? ([...folha.animacoes.values()].find(ehLuz) ?? null) : null;
  const total = controles.modo === 'todas' ? anim.direcoes : 1;
  // ring wide enough for one unit of about 1.7 cells per direction
  const raio = anim.direcoes === 1 ? 0 : Math.max(2.6, (anim.direcoes * 1.7) / (2 * Math.PI));
  const encaixe = new Float64Array(3);
  for (let k = 0; k < total; k++) {
    const direcao = controles.modo === 'todas' ? k : direcaoMostrada % anim.direcoes;
    const angulo = (direcao * 256) / anim.direcoes;
    const x = controles.modo === 'todas' ? CENTRO + Math.cos((angulo / 256) * 2 * Math.PI) * raio : CENTRO;
    const y = controles.modo === 'todas' ? CENTRO + Math.sin((angulo / 256) * 2 * Math.PI) * raio : CENTRO;
    const quadro = quadroGlobal(folha, anim, angulo, tempoDe(anim, tempoS));
    const local = quadro - folha.primeiroQuadro;
    lado.unidades.push({ x, y, local });
    const partes = [[x, y, 0, quadro]];
    if (animTorre) {
      const anguloTorre = (angulo + controles.torre * 8) % 256;
      let [tx, ty, tz] = [x, y, 0];
      if (pontoDeEncaixe(folha, 'encaixe_torre', local, projecao, encaixe)) [tx, ty, tz] = [x + encaixe[0], y + encaixe[1], encaixe[2]];
      partes.push([tx, ty, tz, quadroGlobal(lado.torre, animTorre, anguloTorre, tempoDe(animTorre, tempoS))]);
    }
    for (const [px, py, pz, q] of partes) {
      listas.sprites.chaves.push(y);
      escreverSprite(listas.sprites, px, py, pz, q, sombraMetros);
      if (controles.sombra !== 'nenhuma') escreverSprite(listas.sombras, px, py, pz, q, sombraMetros);
    }
    // lights go after the body with the same depth, added over it (negative alpha), and cast no shadow
    if (animLuzes && anim.camada === 'corpo') {
      listas.sprites.chaves.push(y);
      escreverSprite(listas.sprites, x, y, 0, quadroGlobal(folha, animLuzes, angulo, tempoDe(animLuzes, tempoS)), sombraMetros, -1);
    }
    if (controles.pontos) {
      const o = listas.barras.n++ * FLOATS_INSTANCIA;
      listas.barras.dados.set([x, y, folha.alturaBarraMetros, 0.7, 0.6, controles.time, 0.9, 0], o);
    }
  }
  ordenarPorY(listas.sprites);
}

function ordenarPorY(lista) {
  const linhas = [];
  for (let i = 0; i < lista.n; i++) linhas.push({ chave: lista.chaves[i], dados: lista.dados.slice(i * FLOATS_INSTANCIA, (i + 1) * FLOATS_INSTANCIA) });
  // Array.prototype.sort is stable, so parts of one unit keep their emission order
  linhas.sort((a, b) => a.chave - b.chave);
  linhas.forEach((linha, i) => lista.dados.set(linha.dados, i * FLOATS_INSTANCIA));
}

function desenharRegua(lado) {
  const { contexto: c, regua, render, camera } = lado;
  c.clearRect(0, 0, regua.width, regua.height);
  const vista = { largura: render.vista.largura, altura: render.vista.altura, px: render.vista.px };
  const k = regua.width / vista.largura;
  const p = [0, 0];
  const tela = (x, y, z = 0) => {
    mundoParaTela(projecao, camera, vista, x, y, z, p);
    return [p[0] * k, p[1] * k];
  };
  const dpr = window.devicePixelRatio || 1;
  if (controles.regua) {
    c.lineWidth = dpr;
    c.font = `${11 * dpr}px ui-monospace, Menlo, monospace`;
    c.fillStyle = 'rgba(255, 255, 255, 0.75)';
    for (let i = CENTRO - REGUA; i <= CENTRO + REGUA; i++) {
      c.strokeStyle = i === CENTRO ? 'rgba(255, 207, 122, 0.7)' : 'rgba(255, 255, 255, 0.18)';
      c.beginPath();
      c.moveTo(...tela(i, CENTRO - REGUA));
      c.lineTo(...tela(i, CENTRO + REGUA));
      c.moveTo(...tela(CENTRO - REGUA, i));
      c.lineTo(...tela(CENTRO + REGUA, i));
      c.stroke();
      if (i % 2 === 0) {
        const [lx, ly] = tela(i, CENTRO + 0.5);
        c.fillText(String(i - CENTRO), lx + 3 * dpr, ly);
      }
    }
  }
  if (controles.pontos && lado.folha) {
    const ponto = new Float64Array(3);
    for (const u of lado.unidades) {
      const [ax, ay] = tela(u.x, u.y);
      c.strokeStyle = '#fff';
      c.lineWidth = dpr;
      c.beginPath();
      c.moveTo(ax - 6 * dpr, ay);
      c.lineTo(ax + 6 * dpr, ay);
      c.moveTo(ax, ay - 6 * dpr);
      c.lineTo(ax, ay + 6 * dpr);
      c.stroke();
      for (const nome of Object.keys(lado.folha.pontos)) {
        if (!pontoDeEncaixe(lado.folha, nome, u.local, projecao, ponto)) continue;
        const [x, y] = tela(u.x + ponto[0], u.y + ponto[1], ponto[2]);
        c.fillStyle = CORES_PONTOS[nome] ?? COR_OUTROS_PONTOS;
        c.beginPath();
        c.arc(x, y, 4 * dpr, 0, 2 * Math.PI);
        c.fill();
      }
    }
  }
}

function descreverSombra(lado) {
  if (controles.sombra === 'nenhuma') return 'nenhuma';
  const camada = controles.sombra === 'camada' || (controles.sombra === 'comparar' && lado === lados[1]);
  if (!camada) return 'derivada do alfa';
  return lado.folha.temSombra ? 'camada renderizada' : 'derivada do alfa (o asset não tem camada)';
}

function escreverLegenda(lado) {
  if (!lado.fonte) return;
  if (lado.erro) {
    lado.legenda.innerHTML = `<span class="erro">${lado.erro.replace(/[<&]/g, ch => (ch === '<' ? '&lt;' : '&amp;'))}</span>`;
    return;
  }
  const f = lado.folha;
  if (!f) {
    lado.legenda.textContent = 'carregando…';
    return;
  }
  const px = lado.render.vista.px;
  const anim = f.animacoes.get(controles.animacao);
  const direcoes = anim?.direcoes ?? f.direcoes;
  lado.legenda.innerHTML =
    `<b>${f.asset}</b> · nível ${f.nivel} · ${direcoes} direções · ${anim ? `${anim.quadros} quadros a ${anim.fps} q/s` : ''}\n` +
    `${px.toFixed(1)} px por célula na tela, ${f.pxNivel.toFixed(1)} no atlas (${(px / f.pxNivel).toFixed(2)}×) · zoom ${controles.zoom}\n` +
    `1 célula = ${projecao.metrosPorCelula} m · elevação ${projecao.dados.camera.elevacaoGraus}° · sombra: ${descreverSombra(lado)}\n` +
    `pontos: ${Object.keys(f.pontos).join(', ') || 'nenhum'} (verde encaixe_torre, amarelo boca, azul escape, rosa topo, branco outros)`;
}

let ultimoGiro = 0;
let ultimaLegenda = 0;
let ultimo = performance.now();
function quadro(agora) {
  const dt = Math.min(100, agora - ultimo);
  ultimo = agora;
  if (controles.girar && agora - ultimoGiro > 250) {
    ultimoGiro = agora;
    controles.direcao = (controles.direcao + 1) % (Number($('direcao').max) + 1);
    $('direcao').value = String(controles.direcao);
    $('direcao-valor').value = String(controles.direcao);
  }
  for (const lado of lados) {
    if (lado !== lados[0] && !lado.fonte) continue;
    lado.camera.zoom = controles.zoom;
    montarLado(lado, agora / 1000, controles.direcao);
    lado.render.desenharInstancias(agora, dt, lado.listas);
    desenharRegua(lado);
  }
  if (agora - ultimaLegenda > 300) {
    ultimaLegenda = agora;
    lados.forEach(escreverLegenda);
  }
  requestAnimationFrame(quadro);
}

const indice = await lerIndice();
const entradas = [...EMBUTIDAS, ...indice.filter(e => e.tipo !== 'terreno')];
const chaos = indice.filter(e => e.tipo === 'terreno');
preencherFontes($('fonte-a'), entradas, false);
preencherFontes($('fonte-b'), entradas, true);
$('chao').replaceChildren(...chaos.map(e => new Option(e.nome, e.id)), new Option('procedural', ''));
controles.chao = controles.chao === null ? (chaos[0]?.id ?? '') : controles.chao && new URL(controles.chao, location.href).href;
$('chao').value = controles.chao;
ligarControles();
const fonteA = valorInicial($('fonte-a'), $('url-a'), parametros.get('a') ?? 'prototipo');
const fonteB = valorInicial($('fonte-b'), $('url-b'), parametros.get('b') ?? '');
$('lados').classList.toggle('so-a', !fonteB);
new ResizeObserver(redimensionar).observe($('lados'));
redimensionar();
await Promise.all([carregarFonte(lados[0], fonteA), carregarFonte(lados[1], fonteB), trocarChao(controles.chao)]);
window.__visualizador = { lados, controles, projecao };
requestAnimationFrame(quadro);
