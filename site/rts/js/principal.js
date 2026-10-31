// Page assembly and frame loop: reads the URL options, wires the simulation worker, renderer, input, HUD and
// measurement together, and draws one frame per requestAnimationFrame.
// Options: unidades, res=nativa|4k|1080p, bench&seg (measurement), escala=auto|1|0.85|0.75|0.67|0.5 (render scale; the
// benchmark pins 1 unless told otherwise), semente, zoom (factor of projecao.json, 0.75 to 1.25), atlas=0, avancar,
// roda=auto|zoom|arrastar (what a wheel without Ctrl does), painel=1 (measurement panel), inicio=0|1 (start screen;
// shown by default, skipped in tests and the benchmark), partida=<mission id>&dificuldade=facil|normal|dificil (a
// mission's match instead of the prototype's armies), terreno=ladrilhos|procedural (ground splatted from the art's
// tiles by soil, the default, or procedural noise), teste=1 (exposes window.__rts for the end-to-end tests).
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
import { criarColocacao, regraDaPagina, areaDaRede } from './entrada/colocacao.js';
import { ACAO } from './entrada/teclas.js';
import { aplicarSelecao } from './entrada/selecao.js';
import { criarMinimapa } from './interface/minimapa.js';
import { criarPainel } from './interface/painel.js';
import { criarBarraDeComandos } from './interface/comandos.js';
import { criarSobreposicao } from './interface/sobreposicao.js';
import { carregarTextos } from './interface/textos.js';
import { carregarPartida } from './interface/partida.js';
import { criarCatalogo, catalogoDoMapa } from './interface/catalogo.js';
import { montarCartao } from './interface/cartao.js';
import { criarLeitura } from './interface/leitura.js';
import { criarAlertas, ALERTA, ALERTAS_DE_PERIGO } from './interface/alertas.js';
import { criarAvisos } from './interface/avisos.js';
import { criarHud } from './interface/hud.js';
import { criarPainelDeSelecao } from './interface/selecao-painel.js';
import { criarMenu } from './interface/menu.js';
import { criarSomDaPartida } from './interface/som-da-partida.js';
import { criarFim } from './interface/fim.js';
import { criarObjetivos } from './interface/objetivos.js';
import { criarSomProvisorio, SOM } from './audio/provisorio.js';
import { criarRegistro, nomesDosGrupos } from './telemetria/registro.js';
import { criarPonteSimulacao } from './ponte-simulacao.js';
import { TIPO_COMANDO, SEM_ENTIDADE, MOTIVO, VERSAO_SIMULACAO, VERSAO_COMANDOS } from './sim/contratos.js';

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
  partida: parametros.get('partida'),
  dificuldade: parametros.get('dificuldade') ?? 'normal',
};
opcoes.painel = parametros.get('painel') === '1' || opcoes.teste || opcoes.bench;
opcoes.inicio = !opcoes.bench && (opcoes.teste ? parametros.get('inicio') === '1' : parametros.get('inicio') !== '0');

const canvas = document.getElementById('tela');
const palco = document.getElementById('palco');
const painelElemento = document.getElementById('painel');
painelElemento.hidden = !opcoes.painel;
const atlasInfo = { descricao: '' };

const [projecao, texto, arquivosDaPartida] = await Promise.all([carregarProjecao(), carregarTextos(), opcoes.partida ? carregarPartida(opcoes.partida) : null]);
// The kinds the match runs on, from the static map the worker sends first (MapaEstatico.tipos).
let catalogo = criarCatalogo([], texto);
const obterCatalogo = () => catalogo;
const camera = criarCamera(opcoes.zoom, projecao);
const selecionadas = new Set();
const simulacao = criarPonteSimulacao();
const { estado, visivel } = simulacao;
const escalaFixa = opcoes.escala === 'auto' ? null : Number(opcoes.escala);
const render = criarRenderizador(canvas, projecao, { camera, visivel, escalaFixa, terreno: parametros.get('terreno') === 'procedural' ? 'procedural' : 'ladrilhos' });
const efeitos = render.efeitos;
criarResolucao({ canvas, palco, modo: opcoes.resolucao, aoMudar: render.redimensionar });

const indice = criarIndice();
const leitura = criarLeitura({ catalogo: obterCatalogo });
const alertas = criarAlertas({ jogador: estado.jogadorLocal, donoDe: indice.donoRecente, tipoDe: indice.tipoRecente, categoria: tipo => catalogo.categoria(tipo) });
const painel = criarPainel({ painel: painelElemento, canvas, estado, resolucao: opcoes.resolucao, info: render.info, atlasInfo });
const medicao = criarMedicao({ ativa: opcoes.bench, segundos: opcoes.segundos, estado, camera, canvas, render, modo: opcoes.resolucao, saida: document.getElementById('resultado') });

const grupos = criarGrupos();
const fila = criarFilaVisual({ repetem: new Set([TIPO_COMANDO.PATRULHAR]) });
const latencia = criarMedidorDeLatencia();
const som = criarSomProvisorio();
const somDaPartida = criarSomDaPartida({ som, camera, catalogo: obterCatalogo });
const { afastado, padrao, aproximado } = projecao.zooms;
const zoom = criarZoom({ canvas, camera, niveis: [afastado, padrao, aproximado], fatorInicial: opcoes.zoom });

// The playtest log (C15, telemetry front) gets every command the page sends and every snapshot; it starts when the
// static map tells the kinds.
let registro = null;
let controles = null;
function comecarRegistro(mapa) {
  if (opcoes.bench) return;
  try {
    registro = criarRegistro({
      missao: arquivosDaPartida?.missao.id ?? 'prototipo',
      jogadorLocal: estado.jogadorLocal,
      dificuldade: opcoes.dificuldade,
      tipos: mapa.tipos.map(t => ({ nome: t.nome, coletor: t.coletor })),
      mapa: arquivosDaPartida?.mapa.entidades,
      missaoDados: arquivosDaPartida?.missao,
      versoes: { simulacao: VERSAO_SIMULACAO, comandos: VERSAO_COMANDOS },
    });
  } catch (erro) {
    console.error('playtest log (C15) did not start; the match goes on without it', erro);
  }
}

// Attack warnings name their mission group by index (the log's order); the mission gives each warning its text.
const textosDosAvisos = new Map();
if (arquivosDaPartida) {
  const grupos = nomesDosGrupos(arquivosDaPartida.missao);
  for (const gatilho of arquivosDaPartida.missao.gatilhos ?? []) {
    for (const acao of gatilho.acoes ?? []) if (acao.faz === 'aviso' && acao.texto) textosDosAvisos.set(grupos.indexOf(acao.grupo), acao.texto);
  }
}

// With ?teste=1 every command sent is also kept, so the end-to-end tests can read what the input produced.
const comandosEnviados = [];
const fonteDeComandos = {
  ...simulacao,
  enviarComando(comando) {
    if (opcoes.teste) comandosEnviados.push(comando);
    registro?.anotarComando(comando, controles?.origem ?? 'mouse');
    return simulacao.enviarComando(comando);
  },
};
const ordens = criarOrdens({ simulacao: fonteDeComandos, estado, efeitos, fila, som, latencia });

// Building placement: the ghost goes to the renderer when it has one, else to the SVG layer; the network area is
// shaded while placing and follows the snapshots (poles built or cut).
let fantasma = null;
let areaDeConstrucao = null;
function atualizarArea() {
  areaDeConstrucao = colocacao.ativa ? areaDaRede(estado.mapa, estado.atual, catalogo, estado.jogadorLocal) : null;
  render.definirAreaDeConstrucao?.(areaDeConstrucao);
}
const colocacao = criarColocacao({
  validar: (tipo, cx, cy) => regraDaPagina({ mapa: estado.mapa, retrato: estado.atual, catalogo, area: areaDeConstrucao }, tipo, cx, cy),
  desenhar(novo) {
    const comecou = novo && !fantasma;
    fantasma = novo;
    render.definirFantasma?.(novo);
    if (comecou || !novo) atualizarArea();
  },
});

let cartaoAtual = { tipo: 'vazio', slots: new Array(8).fill(null), predios: [], tipoDoPredio: -1 };
function recalcularCartao() {
  const selecao = [];
  for (const id of selecionadas) {
    const tipo = indice.tipo(id);
    if (tipo >= 0) selecao.push({ id, tipo });
  }
  cartaoAtual = montarCartao({ selecao, catalogo, producao: leitura.producao, carga: leitura.carga, lotacao: leitura.lotacao });
  return cartaoAtual;
}

// ---------- shortcuts: base, idle harvester, last alert ----------

function centrarEm(x, y) {
  camera.x = x;
  camera.y = y;
}

function irParaBase() {
  if (leitura.qg >= 0) {
    const centro = indice.centro([leitura.qg]);
    if (centro) centrarEm(centro.x, centro.y);
    aplicarSelecao(selecionadas, [leitura.qg], 'trocar');
    som.tocar(SOM.SELECAO);
  } else if (estado.mapa) {
    const base = estado.mapa.bases[estado.jogadorLocal] ?? estado.mapa.bases[0];
    centrarEm(base.x, base.y);
  }
  aoMudar();
}

let proximoOcioso = 0;
function irParaColetorOcioso() {
  const ociosos = leitura.ociosos;
  if (ociosos.length === 0) {
    som.tocar(SOM.RECUSA);
    return;
  }
  const id = ociosos[proximoOcioso++ % ociosos.length];
  aplicarSelecao(selecionadas, [id], 'trocar');
  const centro = indice.centro([id]);
  if (centro) centrarEm(centro.x, centro.y);
  som.tocar(SOM.SELECAO);
  aoMudar();
}

function irParaUltimoAlerta() {
  const alerta = alertas.ultimo;
  if (!alerta) {
    som.tocar(SOM.RECUSA);
    return;
  }
  centrarEm(alerta.x, alerta.y);
}

const acoesDoMapa = { base: irParaBase, ocioso: irParaColetorOcioso, alerta: irParaUltimoAlerta };

// ---------- HUD ----------

let barra = null;
let painelSelecao = null;
/** Selection or mode changed: the card and the panels follow at once; a refusal reason shows on the status line. */
function aoMudar(motivo) {
  recalcularCartao();
  barra?.atualizar(motivo);
  painelSelecao?.atualizar();
}

const telaCheia = () => document.documentElement.requestFullscreen?.().catch(erro => console.warn('full screen refused', erro));
const fim = criarFim({ raiz: document.getElementById('fim'), texto, simulacao, estado, obterRegistro: () => registro, aoAbrir: () => controles?.cancelarModo() });
const menu = criarMenu({
  inicio: document.getElementById('inicio'),
  menu: document.getElementById('menu'),
  avisoCentro: document.getElementById('aviso-centro'),
  botaoMenu: document.getElementById('botao-menu'),
  botaoComecar: document.getElementById('botao-comecar'),
  texto,
  simulacao,
  som,
  telaCheia,
  obterRegistro: () => registro,
  mostrarInicio: opcoes.inicio,
  aoComecar: () => canvas.focus({ preventScroll: true }),
  aoEncerrar: () => fim.abrir('encerrada'),
  podeAbrir: () => !fim.aberto,
});

controles = ligarControles({
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
  catalogo: obterCatalogo,
  cartao: () => cartaoAtual,
  producao: leitura.producao,
  colocacao,
  acoes: { [ACAO.BASE]: irParaBase, [ACAO.COLETOR_OCIOSO]: irParaColetorOcioso, [ACAO.ULTIMO_ALERTA]: irParaUltimoAlerta },
  bloqueado: () => menu.bloqueado || fim.aberto,
  roda: opcoes.roda,
  aoMudar,
});
barra = criarBarraDeComandos({ raiz: document.getElementById('comandos'), utilidades: document.getElementById('utilidades'), controles, grupos, indice, selecionadas, canvasAlvo: canvas, telaCheia, texto, catalogo: obterCatalogo, cartao: () => cartaoAtual });
painelSelecao = criarPainelDeSelecao({ raiz: document.getElementById('selecao'), selecionadas, indice, estado, catalogo: obterCatalogo, leitura, texto, controles, ordens, canvasAlvo: canvas, aoMudar });
const hud = criarHud({ topo: document.getElementById('topo'), atalhos: document.getElementById('atalhos-mapa'), texto, controles, canvasAlvo: canvas, acoes: acoesDoMapa });
const avisos = criarAvisos({ lista: document.getElementById('alertas'), texto, catalogo: obterCatalogo, aoEscolher: alerta => centrarEm(alerta.x, alerta.y), textoDoAviso: grupo => textosDosAvisos.get(grupo) ?? null });
// Rally points of the selected buildings, drawn from the building to the point.
function encontros() {
  const linhas = [];
  for (const id of selecionadas) {
    const ponto = leitura.producao(id)?.encontro;
    if (!ponto || ponto.x < 0) continue;
    const de = indice.centro([id]);
    if (de) linhas.push({ de, para: ponto });
  }
  return linhas;
}
const objetivos = criarObjetivos({ raiz: document.getElementById('objetivos'), objetivos: arquivosDaPartida?.missao.objetivos ?? [], texto });
const sobreposicao = criarSobreposicao({ svg: document.getElementById('sobreposicao'), canvas, camera, fila, selecionadas, fantasma: () => (render.definirFantasma ? null : fantasma), encontros });
const minimapa = criarMinimapa({
  minimapa: document.getElementById('minimapa'),
  camera,
  estado,
  render,
  catalogo: obterCatalogo,
  alertas,
  aoOrdenar(ponto, e) {
    controles.marcarBotao();
    const ids = [...selecionadas].filter(id => catalogo.ehUnidade(indice.tipo(id)));
    if (ids.length) ordens.deContexto(ids, ponto, SEM_ENTIDADE, e.shiftKey, e.timeStamp);
  },
});

const SOM_DO_ALERTA = {
  [ALERTA.PRODUCAO]: SOM.PRODUCAO,
  [ALERTA.CONSTRUCAO]: SOM.CONSTRUCAO,
  [ALERTA.PREDIO_PRONTO]: SOM.PRODUCAO,
  [ALERTA.SEM_ENERGIA]: SOM.ALERTA,
  [ALERTA.COLETOR_PERDIDO]: SOM.ALERTA,
  [ALERTA.RAJADA]: SOM.ALERTA,
  [ALERTA.RAJADA_PAGA]: SOM.PRODUCAO,
  [ALERTA.RECURSO_ESGOTADO]: SOM.ALERTA,
};
// COMANDO_RECUSADO.arg (MOTIVO) as the status line's reasons (interface/comandos.js MOTIVOS).
const MOTIVOS_DA_RECUSA = {
  [MOTIVO.SEM_CARGA]: 'carga',
  [MOTIVO.LOTACAO_CHEIA]: 'lotacao',
  [MOTIVO.FILA_CHEIA]: 'fila',
  [MOTIVO.NAO_PRODUZ]: 'bloqueado',
  [MOTIVO.BLOQUEADO]: 'bloqueado',
  [MOTIVO.NADA_PRONTO]: 'nada_pronto',
  [MOTIVO.FORA_DA_AREA]: 'fora_da_area',
  [MOTIVO.TERRENO_OCUPADO]: 'terreno_ocupado',
  [MOTIVO.TERRENO_IMPROPRIO]: 'terreno_improprio',
  [MOTIVO.CELULA_NAO_VENTOSA]: 'celula_nao_ventosa',
  [MOTIVO.FORA_DO_MAPA]: 'fora_da_area',
  [MOTIVO.LIMITE]: 'limite',
};

function tratarAlerta(alerta) {
  if (alerta.tipo === ALERTA.RECUSA) {
    barra.atualizar(MOTIVOS_DA_RECUSA[alerta.arg] ?? 'bloqueado');
    som.tocar(SOM.RECUSA);
    return;
  }
  avisos.mostrar(alerta);
  som.tocar(ALERTAS_DE_PERIGO.has(alerta.tipo) ? SOM.SOB_ATAQUE : SOM_DO_ALERTA[alerta.tipo]);
}

simulacao.iniciar({
  semente: opcoes.semente,
  // a mission brings its own units; the prototype's armies are only for ?unidades and the benchmarks
  unidadesPorTime: arquivosDaPartida && !parametros.has('unidades') ? 0 : opcoes.unidades >> 1,
  avancar: opcoes.avancar,
  teste: opcoes.teste,
  // A mission's match: the raw files go to the worker, which compiles and validates them (the format is being agreed
  // with the simulation front; until the worker reads `partida`, the prototype's armies still play).
  ...(arquivosDaPartida && { dados: arquivosDaPartida.dados, partida: { missao: arquivosDaPartida.missao, ...arquivosDaPartida.mapa }, dificuldade: opcoes.dificuldade }),
  aoReceberMapa(mapa) {
    catalogo = catalogoDoMapa(mapa, texto);
    comecarRegistro(mapa);
    menu.marcarPronto();
    render.definirMapa(mapa);
    camera.x = mapa.bases[0].x + 14;
    camera.y = mapa.bases[0].y - 10;
    minimapa.preparar();
  },
  aoReceberEstado(retrato) {
    render.atualizarNeblina(retrato.visao);
    efeitos.registrarEventos(retrato);
    indice.atualizar(retrato);
    leitura.atualizar(retrato, estado.jogadorLocal);
    fila.atualizar(retrato.tick, indice.posicao, indice.parada);
    for (const alerta of alertas.registrar(retrato.eventos, performance.now())) tratarAlerta(alerta);
    somDaPartida.tocarEventos(retrato.eventos);
    if (colocacao.ativa) atualizarArea();
    colocacao.revalidar();
    registro?.anotarRetrato(retrato);
    objetivos.registrar(retrato.eventos);
    fim.verificar(retrato.eventos);
  },
});
menu.segurarNoInicio();

if (opcoes.atlas) {
  render.carregarPrototipo().then(folha => {
    if (folha) atlasInfo.descricao = `${folha.direcoes} direções, Blender`;
  });
}

let ultimo = performance.now();
let ultimoHud = 0;
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
  // Queues, groups and resources change on their own; the HUD refreshes a few times a second.
  if (agora - ultimoHud > 250) {
    ultimoHud = agora;
    recalcularCartao();
    barra.atualizar();
    painelSelecao.atualizar();
    hud.atualizar({ carga: leitura.carga, lotacao: leitura.lotacao, ociosos: leitura.ociosos, temAlerta: alertas.ultimo !== null, tick: estado.tick, proximaRajada: estado.atual?.proximaRajada ?? 0 });
    menu.atualizarAviso(controles.pausado);
  }
  const cpu = performance.now() - inicio;
  medicao.registrarQuadro(dt, cpu);
  if (opcoes.painel) painel.atualizar(agora, dt, cpu, nUnidades, latencia.resumo());
  requestAnimationFrame(quadro);
}
requestAnimationFrame(quadro);

window.__prototipo = { camera, estado, opcoes, info: render.info, render };
if (opcoes.teste) {
  /** What the HUD is showing, read from the page, for the end-to-end tests. */
  const hudNaTela = {
    get carga() {
      return Number(document.querySelector('[data-recurso="carga"] [data-valor]').textContent);
    },
    get lotacao() {
      const [usada, teto] = document.querySelector('[data-recurso="lotacao"] [data-valor]').textContent.split('/').map(Number);
      return { usada, teto };
    },
    /** Queue of the first selected building, as the simulation reports it, or null. */
    get filaDoSelecionado() {
      const predio = [...selecionadas].find(id => catalogo.ehPredio(indice.tipo(id)));
      return predio === undefined ? null : leitura.producao(predio);
    },
    get coletoresOciosos() {
      return leitura.ociosos.length;
    },
    get avisoDeOcioso() {
      return !document.querySelector('[data-atalho="ocioso"]').disabled;
    },
    get alertas() {
      return [...document.querySelectorAll('#alertas li')].map(li => li.textContent);
    },
    get cartao() {
      return cartaoAtual;
    },
  };
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
    hud: hudNaTela,
    alertas,
    menu,
    fim,
    objetivos,
    colocacao,
    /** The playtest log (C15) once it loaded, or null. */
    obterRegistro: () => registro,
    get catalogo() {
      return catalogo;
    },
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
  // The quality front's test hook extends window.__rts (site/rts/js/teste/gancho.js); the game runs without it.
  import('./teste/gancho.js')
    .then(m => m.ligarGancho(window.__rts, { simulacao, estado, opcoes, dados: null, hud: hudNaTela, obterRegistro: () => registro }))
    .catch(erro => console.warn('test hook not loaded', erro));
}
