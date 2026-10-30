// Page assembly and frame loop: reads the URL options, wires the simulation worker, renderer, input, interface and
// measurement together, and draws one frame per requestAnimationFrame.
// Options: unidades, res=nativa|4k|1080p, bench&seg (measurement), escala=auto|1|0.85|0.75|0.67|0.5 (render scale; the
// benchmark pins 1 unless told otherwise), semente, zoom (factor of projecao.json, 0.75 to 1.25), atlas=0, avancar.
import { criarRenderizador } from './render/renderizador.js';
import { carregarProjecao } from './render/projecao.js';
import { criarResolucao } from './render/resolucao.js';
import { criarMedicao } from './render/medicao.js';
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
  zoom: Number(parametros.get('zoom') ?? 1),
  escala: parametros.get('escala') ?? (parametros.has('bench') ? '1' : 'auto'),
  atlas: parametros.get('atlas') !== '0',
  avancar: Number(parametros.get('avancar') ?? 0),
};

const canvas = document.getElementById('tela');
const palco = document.getElementById('palco');
const painelElemento = document.getElementById('painel');
const atlasInfo = { descricao: '' };

const projecao = await carregarProjecao();
const camera = criarCamera(opcoes.zoom, projecao);
const selecionadas = new Set();
const simulacao = criarPonteSimulacao();
const { estado, visivel } = simulacao;
const escalaFixa = opcoes.escala === 'auto' ? null : Number(opcoes.escala);
const render = criarRenderizador(canvas, projecao, { camera, visivel, escalaFixa });
const efeitos = render.efeitos;
criarResolucao({ canvas, palco, modo: opcoes.resolucao, aoMudar: render.redimensionar });

const minimapa = criarMinimapa({ minimapa: document.getElementById('minimapa'), camera, estado, render });
const painel = criarPainel({ painel: painelElemento, canvas, estado, resolucao: opcoes.resolucao, info: render.info, atlasInfo });
const medicao = criarMedicao({ ativa: opcoes.bench, segundos: opcoes.segundos, estado, camera, canvas, render, modo: opcoes.resolucao, saida: document.getElementById('resultado') });

simulacao.iniciar({
  semente: opcoes.semente,
  unidadesPorTime: opcoes.unidades >> 1,
  avancar: opcoes.avancar,
  aoReceberMapa(mapa) {
    render.definirMapa(mapa);
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
  render.carregarPrototipo().then(folha => {
    if (folha) atlasInfo.descricao = `${folha.direcoes} direções, Blender`;
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
  const nUnidades = render.desenhar({ agora, dt, estado, selecionadas });
  minimapa.desenhar(agora);
  const cpu = performance.now() - inicio;
  medicao.registrarQuadro(dt, cpu);
  painel.atualizar(agora, dt, cpu, nUnidades);
  requestAnimationFrame(quadro);
}
requestAnimationFrame(quadro);

window.__prototipo = { camera, estado, opcoes, info: render.info, render };
