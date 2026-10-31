// Page assembly and frame loop: reads the URL options, wires the simulation worker, renderer, input, HUD and
// measurement together, and draws one frame per requestAnimationFrame.
// Options: unidades, res=nativa|4k|1080p, bench&seg (measurement), escala=auto|1|0.85|0.75|0.67|0.5 (render scale; the
// benchmark pins 1 unless told otherwise), semente, zoom (factor of projecao.json, 0.75 to 1.25), atlas=0, avancar,
// roda=auto|zoom|arrastar (what a wheel without Ctrl does), painel=1 (measurement panel), inicio=0|1 (start screen
// and, in a mission, the briefing; shown by default, skipped in tests and the benchmark), partida=<mission
// id>&dificuldade=facil|normal|dificil (a mission's match instead of the prototype's armies, the difficulty offered
// first on the start screen; carga=<n> starts every player with that Carga), terreno=ladrilhos|procedural (ground
// splatted from the art's tiles by soil, the default, or procedural noise), teste=1 (exposes window.__rts for the
// end-to-end tests; the mission's camera moves jump there unless camera=animar).
// A mission's match can be played again without reloading the page (Recomeçar on the end screen or the menu): the
// same worker starts it again and the page's parts forget the old one.
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
import { criarColocacao, areaDaRede } from './entrada/colocacao.js';
import { motivoPosicao } from './sim/construcao.js';
import { ACAO } from './entrada/teclas.js';
import { aplicarSelecao } from './entrada/selecao.js';
import { criarMinimapa } from './interface/minimapa.js';
import { criarPainel } from './interface/painel.js';
import { criarBarraDeComandos, RAZAO_DO_MOTIVO } from './interface/comandos.js';
import { criarSobreposicao } from './interface/sobreposicao.js';
import { carregarTextos } from './interface/textos.js';
import { carregarPartida } from './interface/partida.js';
import { criarCatalogo, catalogoDoMapa, estruturasPorReparo } from './interface/catalogo.js';
import { montarCartao } from './interface/cartao.js';
import { criarLeitura } from './interface/leitura.js';
import { criarAlertas, ALERTA, ALERTAS_DE_PERIGO } from './interface/alertas.js';
import { criarAvisos } from './interface/avisos.js';
import { criarHud } from './interface/hud.js';
import { criarPainelDeSelecao } from './interface/selecao-painel.js';
import { criarMenu, DIFICULDADES } from './interface/menu.js';
import { criarRadio } from './interface/radio.js';
import { criarBriefing, falasDoBriefing } from './interface/briefing.js';
import { criarContagem, temposDeReligar } from './interface/contagem.js';
import { criarSomDaPartida } from './interface/som-da-partida.js';
import { criarFim } from './interface/fim.js';
import { criarObjetivos } from './interface/objetivos.js';
import { criarSomProvisorio, SOM } from './audio/provisorio.js';
import { criarRegistro } from './telemetria/registro.js';
import { textosDaMissao, rotulosDaMissao } from './sim/gatilhos.js';
import { criarPonteSimulacao } from './ponte-simulacao.js';
import { TIPO_COMANDO, SEM_ENTIDADE, VERSAO_SIMULACAO, VERSAO_COMANDOS, EVENTO, TAMANHO_EVENTO, E_TIPO, E_X, E_Y, FP } from './sim/contratos.js';
import { contarObjetivos } from './interface/objetivos.js';

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
  dificuldade: DIFICULDADES.includes(parametros.get('dificuldade')) ? parametros.get('dificuldade') : 'normal',
  carga: parametros.has('carga') ? Number(parametros.get('carga')) : null,
};
opcoes.painel = parametros.get('painel') === '1' || opcoes.teste || opcoes.bench;
opcoes.inicio = !opcoes.bench && (opcoes.teste ? parametros.get('inicio') === '1' : parametros.get('inicio') !== '0');
// In the tests the mission's camera jumps, so a test that places the camera is not fought by an easing move.
opcoes.animarCamera = !opcoes.teste || parametros.get('camera') === 'animar';

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
// The difficulty being played: the URL's until the start screen or a restart picks another.
let dificuldadeAtual = opcoes.dificuldade;
// While the worker starts the match again (a restart, or another difficulty on the start screen): what the new log
// notes about the attempt before, and the page's entries made meanwhile, which go to the new log.
let reiniciando = null;
const pendentesDoRegistro = [];
let tentativa = 1;
/** Notes a page entry (briefing, restart) in the playtest log, or in the next one while the match restarts. */
function anotarNoRegistro(tipo, campos) {
  if (reiniciando) pendentesDoRegistro.push([tipo, campos]);
  else registro?.anotar(tipo, campos);
}
function comecarRegistro(mapa) {
  if (opcoes.bench) return;
  try {
    registro = criarRegistro({
      missao: arquivosDaPartida?.missao.id ?? 'prototipo',
      jogadorLocal: estado.jogadorLocal,
      dificuldade: dificuldadeAtual,
      tipos: mapa.tipos.map(t => ({ nome: t.nome, coletor: t.coletor })),
      mapa: arquivosDaPartida?.mapa.entidades,
      missaoDados: arquivosDaPartida?.missao,
      versoes: { simulacao: VERSAO_SIMULACAO, comandos: VERSAO_COMANDOS },
    });
  } catch (erro) {
    console.error('playtest log (C15) did not start; the match goes on without it', erro);
  }
  // A restarted phase says so at its first tick, with how far the attempt before went.
  if (reiniciando?.anterior) registro?.anotar('reiniciar', { passo: 0, ...reiniciando.anterior });
  for (const [tipo, campos] of pendentesDoRegistro.splice(0)) registro?.anotar(tipo, campos);
}

// Mission messages and attack warnings come by index (the trigger evaluator's own lists); the mission gives each
// warning its text.
const textosDaPartida = arquivosDaPartida ? textosDaMissao(arquivosDaPartida.missao) : [];
const textosDosAvisos = new Map();
if (arquivosDaPartida) {
  const grupos = rotulosDaMissao(arquivosDaPartida.missao);
  for (const gatilho of arquivosDaPartida.missao.gatilhos ?? []) {
    for (const acao of gatilho.acoes ?? gatilho.faz ?? []) if (acao.faz === 'aviso' && acao.texto) textosDosAvisos.set(grupos.indexOf(acao.grupo), acao.texto);
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

// Building placement: the renderer draws the ghost and shades the network area while placing (the page's reading of
// the network reach, for the eye; validity is the simulation's rule), which follows the snapshots (poles built or cut).
let fantasma = null;
let areaDeConstrucao = null;
function atualizarArea() {
  areaDeConstrucao = colocacao.ativa ? areaDaRede(estado.mapa, estado.atual, catalogo, estado.jogadorLocal) : null;
  render.definirAreaDeConstrucao(areaDeConstrucao);
}
const colocacao = criarColocacao({
  // The simulation's own placement rule, on the latest snapshot: the ghost says what CONSTRUIR will answer.
  validar(tipo, cx, cy) {
    if (!estado.mapa || !estado.atual) return 'fora_da_area';
    const motivo = motivoPosicao(estado.mapa, estado.atual, estado.jogadorLocal, tipo, cx, cy);
    return motivo === 0 ? null : (RAZAO_DO_MOTIVO[motivo] ?? 'posicao');
  },
  desenhar(novo) {
    const comecou = novo && !fantasma;
    fantasma = novo;
    render.definirFantasma(novo);
    if (comecou || !novo) atualizarArea();
  },
});

let cartaoAtual = { tipo: 'vazio', slots: new Array(8).fill(null), predios: [], tipoDoPredio: -1 };
// Page of a building card with more than eight items; back to the first when another kind of building is selected.
let paginaDoCartao = 0;
function virarPagina() {
  paginaDoCartao += 1;
  aoMudar();
}
function recalcularCartao() {
  const selecao = [];
  for (const id of selecionadas) {
    const k = indice.k(id);
    if (k >= 0) selecao.push({ id, tipo: estado.atual.tipo[k], bandeiras: estado.atual.bandeiras[k] });
  }
  const tipoAntes = cartaoAtual.tipoDoPredio;
  cartaoAtual = montarCartao({ selecao, catalogo, producao: leitura.producao, carga: leitura.carga, lotacao: leitura.lotacao, pagina: paginaDoCartao });
  if (cartaoAtual.tipoDoPredio !== tipoAntes && paginaDoCartao !== 0) {
    paginaDoCartao = 0;
    cartaoAtual = montarCartao({ selecao, catalogo, producao: leitura.producao, carga: leitura.carga, lotacao: leitura.lotacao, pagina: 0 });
  }
  return cartaoAtual;
}

// ---------- shortcuts: base, idle harvester, last alert ----------

function centrarEm(x, y) {
  render.pararCamera();
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
const idDaMissao = arquivosDaPartida?.missao.id ?? null;
const tituloDaMissao = idDaMissao && texto.tem(`missao.${idDaMissao}.titulo`) ? texto(`missao.${idDaMissao}.titulo`) : '';
const falasIniciais = idDaMissao ? falasDoBriefing(idDaMissao, texto.ids()) : [];
const objetivosDaMissao = arquivosDaPartida?.missao.objetivos ?? [];
// harvesters the player lost this attempt (the end screen's summary)
let coletoresPerdidos = 0;
const fim = criarFim({
  raiz: document.getElementById('fim'),
  texto,
  simulacao,
  estado,
  obterRegistro: () => registro,
  aoAbrir: () => controles?.cancelarModo(),
  subtitulo: tituloDaMissao,
  // a mission with a briefing is a phase of the campaign: the playtest asks about the next one
  proximaFase: falasIniciais.length > 0,
  resumo: () => ({ objetivos: objetivosDaMissao.length ? contarObjetivos(objetivosDaMissao, objetivos.estados) : null, veteranos: veteranosVivos(), coletoresPerdidos: arquivosDaPartida ? coletoresPerdidos : null }),
  aoRecomecar: () => reiniciarPartida(),
});
/** Units of the player alive with a veterancy level. */
function veteranosVivos() {
  const atual = estado.atual;
  let n = 0;
  if (atual) for (let k = 0; k < atual.n; k++) if (atual.dono[k] === estado.jogadorLocal && atual.veterania[k] > 0 && catalogo.ehUnidade(atual.tipo[k])) n += 1;
  return n;
}
// The briefing waits for Começar (the click that turns the sound on) and holds the match paused while it runs.
const briefing = criarBriefing({
  raiz: document.getElementById('briefing'),
  texto,
  falas: falasIniciais,
  aoTerminar({ pulado, segundos, vistas, total }) {
    anotarNoRegistro(pulado ? 'briefingPulado' : 'briefingVisto', { segundos, falas: vistas, total });
    simulacao.pausar(false, 'briefing');
    canvas.focus({ preventScroll: true });
  },
});
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
  titulo: tituloDaMissao,
  dificuldade: arquivosDaPartida ? dificuldadeAtual : null,
  aoComecar({ dificuldade }) {
    if (dificuldade && dificuldade !== dificuldadeAtual) reiniciarPartida({ dificuldade, comoReinicio: false });
    canvas.focus({ preventScroll: true });
    if (briefing.abrir()) simulacao.pausar(true, 'briefing');
  },
  aoEncerrar: () => fim.abrir('encerrada'),
  aoRecomecar: () => reiniciarPartida(),
  podeAbrir: () => !fim.aberto && !briefing.aberto,
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
  // keys and clicks act on the card of this very moment, not the one drawn up to a quarter second ago
  cartao: recalcularCartao,
  colocacao,
  acoes: { [ACAO.BASE]: irParaBase, [ACAO.COLETOR_OCIOSO]: irParaColetorOcioso, [ACAO.ULTIMO_ALERTA]: irParaUltimoAlerta },
  aoVirarPagina: virarPagina,
  bloqueado: () => menu.bloqueado || fim.aberto || briefing.aberto,
  roda: opcoes.roda,
  aoMudar,
  cameraTravada: () => render.cameraAnimando,
  soltarCamera: () => render.pararCamera(),
});
barra = criarBarraDeComandos({ raiz: document.getElementById('comandos'), utilidades: document.getElementById('utilidades'), controles, grupos, indice, selecionadas, canvasAlvo: canvas, telaCheia, texto, catalogo: obterCatalogo, cartao: () => cartaoAtual });
painelSelecao = criarPainelDeSelecao({ raiz: document.getElementById('selecao'), selecionadas, indice, estado, catalogo: obterCatalogo, leitura, texto, controles, ordens, canvasAlvo: canvas, aoMudar });
const hud = criarHud({ topo: document.getElementById('topo'), atalhos: document.getElementById('atalhos-mapa'), texto, controles, canvasAlvo: canvas, acoes: acoesDoMapa });
const avisos = criarAvisos({
  lista: document.getElementById('alertas'),
  texto,
  catalogo: obterCatalogo,
  aoEscolher: alerta => !alerta.semLugar && centrarEm(alerta.x, alerta.y),
  textoDoAviso: grupo => textosDosAvisos.get(grupo) ?? null,
  textoDaMensagem: indice => textosDaPartida[indice] ?? null,
});
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
const objetivos = criarObjetivos({ raiz: document.getElementById('objetivos'), objetivos: objetivosDaMissao, texto });
const radio = criarRadio({ raiz: document.getElementById('radio'), texto, aoEscolher: fala => centrarEm(fala.x, fala.y) });
const temposDaReligacao = () => temposDeReligar(arquivosDaPartida?.missao, arquivosDaPartida?.mapa.entidades, dificuldadeAtual, arquivosDaPartida?.dados.predios?.predios ?? []);
let tempos = temposDaReligacao();
const contagem = criarContagem({ raiz: document.getElementById('contagem'), texto, catalogo: obterCatalogo, tempos: () => tempos });
const sobreposicao = criarSobreposicao({ svg: document.getElementById('sobreposicao'), canvas, camera, fila, selecionadas, encontros });
const minimapa = criarMinimapa({
  minimapa: document.getElementById('minimapa'),
  camera,
  estado,
  render,
  catalogo: obterCatalogo,
  alertas,
  soltarCamera: () => render.pararCamera(),
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
  [ALERTA.PROMOCAO]: SOM.PRODUCAO,
  [ALERTA.RELIGADO]: SOM.CONSTRUCAO,
  [ALERTA.MENSAGEM]: SOM.ALERTA,
  [ALERTA.RECURSO_ESGOTADO]: SOM.ALERTA,
};

// The mission may move the camera (CAMERA, at the event's point): an eased move by the renderer, slower the farther it
// goes, during which edges, arrows and drag leave the camera alone; a jump of the player's lets go of it.
function seguirCameraDaMissao(eventos) {
  for (let o = 0; o + TAMANHO_EVENTO <= eventos.length; o += TAMANHO_EVENTO) {
    if (eventos[o + E_TIPO] !== EVENTO.CAMERA) continue;
    const x = eventos[o + E_X] / FP;
    const y = eventos[o + E_Y] / FP;
    if (!opcoes.animarCamera) {
      centrarEm(x, y);
      continue;
    }
    const distancia = Math.hypot(x - camera.x, y - camera.y);
    render.animarCamera({ x, y, duracaoMs: Math.min(2600, Math.max(900, 600 + distancia * 22)) });
  }
}

function tratarAlerta(alerta) {
  if (alerta.tipo === ALERTA.RECUSA) {
    barra.atualizar(RAZAO_DO_MOTIVO[alerta.arg] ?? 'bloqueado');
    som.tocar(SOM.RECUSA);
    return;
  }
  if (alerta.tipo === ALERTA.COLETOR_PERDIDO) coletoresPerdidos += 1;
  // A line somebody speaks goes on the radio, one at a time; other mission texts stay in the alert list.
  const fala = alerta.tipo === ALERTA.MENSAGEM ? textosDaPartida[alerta.arg] : null;
  if (fala && radio.falar({ id: fala, x: alerta.x, y: alerta.y, semLugar: alerta.semLugar })) {
    som.tocar(SOM.ALERTA);
    return;
  }
  avisos.mostrar(alerta);
  som.tocar(ALERTAS_DE_PERIGO.has(alerta.tipo) ? SOM.SOB_ATAQUE : SOM_DO_ALERTA[alerta.tipo]);
}

/** Starts the match in the worker (again, on a restart: the bridge reuses the same worker). */
function iniciarPartida() {
  simulacao.iniciar({
    semente: opcoes.semente,
    // a mission brings its own units; the prototype's armies are only for ?unidades and the benchmarks
    unidadesPorTime: arquivosDaPartida && !parametros.has('unidades') ? 0 : opcoes.unidades >> 1,
    avancar: opcoes.avancar,
    teste: opcoes.teste,
    // A mission's match: the raw files go to the worker, which compiles and validates them (the format is being agreed
    // with the simulation front; until the worker reads `partida`, the prototype's armies still play).
    ...(arquivosDaPartida && { dados: arquivosDaPartida.dados, partida: { missao: arquivosDaPartida.missao, ...arquivosDaPartida.mapa }, dificuldade: dificuldadeAtual }),
    ...(Number.isInteger(opcoes.carga) && { cargaInicial: opcoes.carga }),
    aoReceberMapa(mapa) {
      // nothing of the match before the restart is drawn once the new one's map is here
      if (reiniciando) {
        estado.anterior = null;
        estado.atual = null;
      }
      catalogo = catalogoDoMapa(mapa, texto, arquivosDaPartida?.dados.unidades.unidades ?? [], { porReparo: estruturasPorReparo(arquivosDaPartida?.missao, arquivosDaPartida?.mapa.entidades) });
      comecarRegistro(mapa);
      reiniciando = null;
      menu.marcarPronto();
      render.definirMapa(mapa);
      // A mission opens on the player's base; the prototype a little ahead of it, on the army.
      const base = mapa.bases[estado.jogadorLocal] ?? mapa.bases[0];
      camera.x = base.x + (arquivosDaPartida ? 0 : 14);
      camera.y = base.y - (arquivosDaPartida ? 0 : 10);
      minimapa.preparar();
    },
    aoReceberEstado(retrato) {
      if (reiniciando) return;
      render.atualizarNeblina(retrato.visao);
      efeitos.registrarEventos(retrato);
      indice.atualizar(retrato);
      leitura.atualizar(retrato, estado.jogadorLocal);
      fila.atualizar(retrato.tick, indice.posicao, indice.parada);
      for (const alerta of alertas.registrar(retrato.eventos, performance.now())) tratarAlerta(alerta);
      seguirCameraDaMissao(retrato.eventos);
      somDaPartida.tocarEventos(retrato.eventos);
      if (colocacao.ativa) atualizarArea();
      colocacao.revalidar();
      registro?.anotarRetrato(retrato);
      objetivos.registrar(retrato.eventos);
      if (arquivosDaPartida) contagem.atualizar(retrato);
      fim.verificar(retrato.eventos);
    },
  });
}
iniciarPartida();
menu.segurarNoInicio();

/**
 * Plays the phase again without reloading the page: the worker starts the match over (in `dificuldade`), the page's
 * parts forget the old one, and the new playtest log says it is a restart (comoReinicio false: the start screen only
 * changed the difficulty before anything ran). Anything that fails falls back to reloading the page.
 */
function reiniciarPartida({ dificuldade = dificuldadeAtual, comoReinicio = true } = {}) {
  try {
    if (comoReinicio) {
      registro?.anotar('reiniciar', { tick: estado.tick });
      tentativa += 1;
    }
    reiniciando = { anterior: comoReinicio ? { tickAnterior: estado.tick, resultadoAnterior: fim.resultado ?? 'em-andamento', tentativa } : null };
    if (dificuldade !== dificuldadeAtual) {
      dificuldadeAtual = dificuldade;
      tempos = temposDaReligacao();
      // a reload keeps the difficulty chosen
      const url = new URL(location.href);
      url.searchParams.set('dificuldade', dificuldade);
      history.replaceState(history.state, '', url);
    }
    esquecerPartida();
    iniciarPartida();
    // the worker keeps its pause reasons across a new start: the end screen's and the menu's go only now, after it
    fim.fechar();
    menu.fechar();
    if (controles.pausado) controles.alternarPausa(false);
  } catch (erro) {
    console.error('restart without reloading failed; reloading the page', erro);
    location.reload();
  }
}

/** What the page keeps about the match being left: selection, groups, queues, alerts, radio, objectives, camera, light. */
function esquecerPartida() {
  render.pararCamera();
  render.definirLuz?.('dia');
  controles.cancelarModo();
  selecionadas.clear();
  grupos.limpar();
  fila.esvaziar();
  alertas.limpar();
  avisos.limpar();
  radio.limpar();
  contagem.limpar();
  objetivos.reiniciar();
  paginaDoCartao = 0;
  coletoresPerdidos = 0;
  // the old match's snapshots go now; the page waits for the new one's map as it did at the start
  estado.anterior = null;
  estado.atual = null;
  aoMudar();
}

// the prototype tank only serves the prototype armies; its 4096 px strip would widen every sprite layer of a mission
if (opcoes.atlas && !opcoes.partida) {
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
  briefing.atualizar(dt);
  radio.atualizar(dt, menu.bloqueado || fim.aberto || briefing.aberto || controles.pausado);
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
    radio,
    briefing,
    render,
    /** Plays the phase again, as Recomeçar does. */
    reiniciar: () => reiniciarPartida(),
    get dificuldade() {
      return dificuldadeAtual;
    },
    get tentativa() {
      return tentativa;
    },
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
