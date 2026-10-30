// Page assembly and frame loop: reads the URL options, wires the simulation worker, renderer, input, interface and
// measurement together, and draws one frame per requestAnimationFrame.
// Options: unidades, res=nativa|4k|1080p, bench&seg (measurement), escala=auto|1|0.85|0.75|0.67|0.5 (render scale; the
// benchmark pins 1 unless told otherwise), semente, zoom (factor of projecao.json, 0.75 to 1.25), atlas=0, avancar,
// roda=auto|zoom|arrastar (what a wheel without Ctrl does), teste=1 (exposes window.__rts for the end-to-end tests).
import { criarRenderizador } from './render/renderizador.js';
import { carregarProjecao } from './render/projecao.js';
import { criarResolucao } from './render/resolucao.js';
import { criarMedicao } from './render/medicao.js';
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
import { TIPO_COMANDO } from './sim/contratos.js';

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
  roda: parametros.get('roda') ?? 'auto',
  teste: parametros.get('teste') === '1',
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

const indice = criarIndice();
const grupos = criarGrupos();
const fila = criarFilaVisual({ repetem: new Set([TIPO_COMANDO.PATRULHAR]) });
const latencia = criarMedidorDeLatencia();
const som = criarSomProvisorio();
const { afastado, padrao, aproximado } = projecao.zooms;
const zoom = criarZoom({ canvas, camera, niveis: [afastado, padrao, aproximado], fatorInicial: opcoes.zoom });

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
    render.definirMapa(mapa);
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
  render.carregarPrototipo().then(folha => {
    if (folha) atlasInfo.descricao = `${folha.direcoes} direções, Blender`;
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
  const nUnidades = render.desenhar({ agora, dt, estado, selecionadas });
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

window.__prototipo = { camera, estado, opcoes, info: render.info, render };
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
