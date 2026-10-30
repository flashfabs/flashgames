// Page assembly and frame loop: reads the URL options, wires the simulation worker, renderer, input, interface and
// measurement together, and draws one frame per requestAnimationFrame.
// Options: unidades, res=nativa|4k|1080p, bench&seg (measurement), semente, zoom (CSS px per cell), atlas=0, avancar.
import { criarRenderizador } from './render/renderizador.js';
import { criarResolucao } from './render/resolucao.js';
import { criarMontagemUnidades } from './render/unidades.js';
import { criarEfeitos } from './render/efeitos.js';
import { criarMedicao } from './render/medicao.js';
import { carregarAtlas } from './ativos/atlas.js';
import { criarCamera } from './entrada/camera.js';
import { ligarControles } from './entrada/controles.js';
import { criarMinimapa } from './interface/minimapa.js';
import { criarPainel } from './interface/painel.js';
import { criarPonteSimulacao } from './ponte-simulacao.js';

const parametros = new URLSearchParams(location.search);
const opcoes = {
  unidades: Number(parametros.get('unidades') ?? 2000),
  resolucao: parametros.get('res') ?? 'nativa', // nativa | 4k | 1080p
  bench: parametros.has('bench'),
  segundos: Number(parametros.get('seg') ?? 12),
  semente: Number(parametros.get('semente') ?? 7),
  zoom: Number(parametros.get('zoom') ?? 46), // CSS pixels per cell
  atlas: parametros.get('atlas') !== '0',
  avancar: Number(parametros.get('avancar') ?? 0),
};

const canvas = document.getElementById('tela');
const palco = document.getElementById('palco');
const painelElemento = document.getElementById('painel');
const render = criarRenderizador(canvas);
const atlasInfo = { descricao: '' };

const camera = criarCamera(opcoes.zoom);
const selecionadas = new Set();
const { ajustarTamanho } = criarResolucao({ canvas, palco, camera, resolucao: opcoes.resolucao });

const simulacao = criarPonteSimulacao();
const { estado, visivel } = simulacao;
const unidades = criarMontagemUnidades({ estado, camera, canvas, selecionadas, visivel });
const efeitos = criarEfeitos({ visivel });
const minimapa = criarMinimapa({ minimapa: document.getElementById('minimapa'), canvas, camera, estado });
const painel = criarPainel({ painel: painelElemento, canvas, estado, resolucao: opcoes.resolucao, info: render.info, atlasInfo });
const medicao = criarMedicao({ ativa: opcoes.bench, segundos: opcoes.segundos, estado, camera, canvas, info: render.info, atlasInfo, saida: document.getElementById('resultado') });

simulacao.iniciar({
  semente: opcoes.semente,
  unidadesPorTime: opcoes.unidades >> 1,
  avancar: opcoes.avancar,
  aoReceberMapa(mapa) {
    render.definirMapa(mapa.largura, mapa.altura, mapa.bloqueado, mapa.relevo);
    camera.x = mapa.bases[0].x + 14;
    camera.y = mapa.bases[0].y - 10;
    minimapa.preparar();
  },
  aoReceberEstado(retrato) {
    render.atualizarNeblina(retrato.visao);
    efeitos.registrarEventos(retrato);
  },
});

if (opcoes.atlas) {
  carregarAtlas().then(atlas => {
    if (!atlas) return;
    render.definirAtlas(atlas.cor, atlas.time, atlas.manifesto);
    atlasInfo.descricao = `${atlas.manifesto.direcoes} direções, ${atlas.manifesto.quadro}px, Blender`;
  });
}

const controles = ligarControles({
  canvas,
  palco,
  caixaSelecao: document.getElementById('caixa-selecao'),
  painel: painelElemento,
  camera,
  estado,
  selecionadas,
  ajustarTamanho,
  simulacao,
  efeitos,
});

let ultimo = performance.now();
function quadro(agora) {
  const dt = Math.min(100, agora - ultimo);
  ultimo = agora;
  const inicio = performance.now();
  controles.moverCamera(dt);
  medicao.conduzir(agora);
  const nUnidades = unidades.montar(agora);
  const { nD, nF, nB } = efeitos.montar(agora);
  render.desenhar({
    camera,
    unidades: unidades.buffer,
    nUnidades,
    decalques: efeitos.decalques,
    nDecalques: nD,
    fumaca: efeitos.fumaca,
    nFumaca: nF,
    brilho: efeitos.brilho,
    nBrilho: nB,
    tempo: agora / 1000,
  });
  minimapa.desenhar(agora);
  const cpu = performance.now() - inicio;
  medicao.registrarQuadro(dt, cpu);
  painel.atualizar(agora, dt, cpu, nUnidades);
  requestAnimationFrame(quadro);
}
requestAnimationFrame(quadro);

window.__prototipo = { camera, estado, opcoes, info: render.info };
