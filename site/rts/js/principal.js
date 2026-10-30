// Page assembly and frame loop: reads the URL options, wires the simulation worker, renderer, input, interface and
// measurement together, and draws one frame per requestAnimationFrame.
// Options: unidades, res=nativa|4k|1080p, bench&seg (measurement), semente, zoom (CSS px per cell), atlas=0, avancar,
// roda=auto|zoom|arrastar (what a wheel without Ctrl does), teste=1 (exposes window.__rts for the end-to-end tests).
import { criarRenderizador } from './render/renderizador.js';
import { criarResolucao } from './render/resolucao.js';
import { criarMontagemUnidades } from './render/unidades.js';
import { criarEfeitos } from './render/efeitos.js';
import { criarMedicao } from './render/medicao.js';
import { carregarAtlas } from './ativos/atlas.js';
import { criarCamera, paraMundo, paraTela } from './entrada/camera.js';
import { criarZoom } from './entrada/zoom.js';
import { ligarControles } from './entrada/controles.js';
import { criarGrupos } from './entrada/grupos.js';
import { criarFilaVisual } from './entrada/fila.js';
import { criarIndice } from './entrada/indice.js';
import { criarOrdens } from './entrada/ordens.js';
import { criarMedidorDeLatencia } from './entrada/latencia.js';
import { criarMinimapa } from './interface/minimapa.js';
import { criarPainel } from './interface/painel.js';
import { criarBarraDeComandos } from './interface/comandos.js';
import { criarSobreposicao } from './interface/sobreposicao.js';
import { criarSomProvisorio } from './interface/som-provisorio.js';
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
  roda: parametros.get('roda') ?? 'auto',
  teste: parametros.get('teste') === '1',
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

const indice = criarIndice();
const grupos = criarGrupos();
const fila = criarFilaVisual();
const latencia = criarMedidorDeLatencia();
const som = criarSomProvisorio();
const zoom = criarZoom({ canvas, camera, reajustar: ajustarTamanho });

// With ?teste=1 every command sent is also kept, so the end-to-end tests can read what the input produced.
const comandosEnviados = [];
const fonteDeComandos = opcoes.teste
  ? { ...simulacao, enviarComando: comando => (comandosEnviados.push(comando), simulacao.enviarComando(comando)) }
  : simulacao;
const ordens = criarOrdens({ simulacao: fonteDeComandos, estado, efeitos, fila, som, latencia });

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
    indice.atualizar(retrato);
    fila.atualizar(retrato.tick, indice.posicao, indice.parada);
  },
});

if (opcoes.atlas) {
  carregarAtlas().then(atlas => {
    if (!atlas) return;
    render.definirAtlas(atlas.cor, atlas.time, atlas.manifesto);
    atlasInfo.descricao = `${atlas.manifesto.direcoes} direções, ${atlas.manifesto.quadro}px, Blender`;
  });
}

let barra = null;
const controles = ligarControles({
  canvas,
  palco,
  caixaSelecao: document.getElementById('caixa-selecao'),
  camera,
  estado,
  selecionadas,
  indice,
  zoom,
  grupos,
  ordens,
  som,
  latencia,
  simulacao,
  visivel,
  roda: opcoes.roda,
  aoMudar: () => barra?.atualizar(),
});
// Full screen covers the whole page, so the command bar and the minimap stay; Esc (the browser's) leaves it.
const telaCheia = () => document.documentElement.requestFullscreen?.().catch(erro => console.warn('full screen refused', erro));
barra = criarBarraDeComandos({ raiz: document.getElementById('comandos'), controles, grupos, indice, selecionadas, canvasAlvo: canvas, telaCheia });
const sobreposicao = criarSobreposicao({ svg: document.getElementById('sobreposicao'), canvas, camera, fila, selecionadas });

let ultimo = performance.now();
let ultimaBarra = 0;
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
  sobreposicao.desenhar();
  latencia.aoDesenhar(performance.now());
  minimapa.desenhar(agora);
  // Group sizes change as units die; the bar refreshes on its own a few times a second.
  if (agora - ultimaBarra > 250) {
    ultimaBarra = agora;
    barra.atualizar();
  }
  const cpu = performance.now() - inicio;
  medicao.registrarQuadro(dt, cpu);
  painel.atualizar(agora, dt, cpu, nUnidades, latencia.resumo());
  requestAnimationFrame(quadro);
}
requestAnimationFrame(quadro);

window.__prototipo = { camera, estado, opcoes, info: render.info };
if (opcoes.teste) {
  window.__rts = {
    estado,
    camera,
    selecionadas,
    grupos,
    fila,
    indice,
    controles,
    latencia,
    comandos: comandosEnviados,
    get nivelZoom() {
      return zoom.nivel;
    },
    paraMundo: (clienteX, clienteY) => paraMundo(canvas, camera, clienteX, clienteY),
    /** Client pixel of a unit of the latest snapshot, by id; null when it is gone. */
    naTela(id) {
      const posicao = { x: 0, y: 0 };
      if (!indice.posicao(id, posicao)) return null;
      return paraTela(canvas, camera, posicao.x, posicao.y);
    },
  };
}
