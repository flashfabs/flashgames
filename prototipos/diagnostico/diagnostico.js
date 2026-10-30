// Diagnostics for friends' machines: what the browser and GPU offer the RTS, the prototype benchmark and the determinism script in a Worker.
// Nothing is sent anywhere; the result is shown on the page and copied to the clipboard only when asked.

const resultado = { versao: 1, data: new Date().toISOString(), endereco: location.href };
window.__diagnostico = resultado;

const $ = (seletor) => document.querySelector(seletor);

function simNao(valor) {
  const celula = document.createElement('span');
  celula.className = valor ? 'sim' : 'nao';
  celula.textContent = valor ? 'sim' : 'não';
  return celula;
}

function preencherTabela(tabela, linhas) {
  tabela.replaceChildren(...linhas.map(([rotulo, valor]) => {
    const linha = document.createElement('tr');
    const cabeca = document.createElement('th');
    const dado = document.createElement('td');
    cabeca.textContent = rotulo;
    if (typeof valor === 'boolean') dado.append(simNao(valor));
    else dado.textContent = valor ?? '—';
    linha.append(cabeca, dado);
    return linha;
  }));
}

function mostrarJson() {
  $('#json').textContent = JSON.stringify(resultado, null, 2);
}

// ---------- screen ----------

// Median interval of requestAnimationFrame over about a second: the refresh rate the page actually gets.
// A page in the background gets no frames at all, so after 5 s it gives up with null.
function medirTaxaDeQuadros(quadros = 90) {
  return new Promise((resolve) => {
    const intervalos = [];
    let anterior = null;
    setTimeout(resolve, 5000, null);
    const passo = (agora) => {
      if (anterior !== null) intervalos.push(agora - anterior);
      anterior = agora;
      if (intervalos.length < quadros) requestAnimationFrame(passo);
      else {
        intervalos.sort((a, b) => a - b);
        resolve(Math.round(1000 / intervalos[intervalos.length >> 1]));
      }
    };
    requestAnimationFrame(passo);
  });
}

async function diagnosticarTela() {
  const dpr = window.devicePixelRatio || 1;
  resultado.tela = {
    tela: `${screen.width}×${screen.height}`,
    pixelsFisicos: `${Math.round(screen.width * dpr)}×${Math.round(screen.height * dpr)}`,
    devicePixelRatio: dpr,
    janela: `${innerWidth}×${innerHeight}`,
    areaUtil: `${screen.availWidth}×${screen.availHeight}`,
    profundidadeDeCor: screen.colorDepth,
    gamaP3: matchMedia('(color-gamut: p3)').matches,
    hdr: matchMedia('(dynamic-range: high)').matches,
    taxaDeQuadrosHz: await medirTaxaDeQuadros(),
  };
  const t = resultado.tela;
  preencherTabela($('#tabela-tela'), [
    ['Tela (pixels CSS)', t.tela],
    ['Pixels físicos', t.pixelsFisicos],
    ['devicePixelRatio', String(t.devicePixelRatio)],
    ['Janela agora', t.janela],
    ['Área útil', t.areaUtil],
    ['Profundidade de cor', `${t.profundidadeDeCor} bits`],
    ['Cores P3', t.gamaP3],
    ['HDR', t.hdr],
    ['Quadros por segundo da página', t.taxaDeQuadrosHz === null ? 'não mediu: a página estava em segundo plano' : `${t.taxaDeQuadrosHz} Hz`],
  ]);
}

// ---------- WebGL2 ----------

const FORMATOS_COMPRIMIDOS = {
  'BC1 a BC3 (S3TC)': 'WEBGL_compressed_texture_s3tc',
  'BC1 a BC3 sRGB': 'WEBGL_compressed_texture_s3tc_srgb',
  'BC4 e BC5 (RGTC)': 'EXT_texture_compression_rgtc',
  'BC6H e BC7 (BPTC)': 'EXT_texture_compression_bptc',
  'ETC2 e EAC': 'WEBGL_compressed_texture_etc',
  'ETC1': 'WEBGL_compressed_texture_etc1',
  'ASTC': 'WEBGL_compressed_texture_astc',
  'PVRTC': 'WEBGL_compressed_texture_pvrtc',
};

// Renderers that mean the page is drawn by the CPU, as happens over SSH or remote desktop.
const PLACA_POR_SOFTWARE = /swiftshader|llvmpipe|softpipe|basic render|software|microsoft basic/i;

function diagnosticarWebgl() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl) {
    resultado.webgl2 = { disponivel: false };
    preencherTabela($('#tabela-webgl'), [['WebGL2', false]]);
    return;
  }
  const depuracao = gl.getExtension('WEBGL_debug_renderer_info');
  const extensoes = gl.getSupportedExtensions() ?? [];
  const anisotropia = gl.getExtension('EXT_texture_filter_anisotropic');
  const semCaveat = document.createElement('canvas').getContext('webgl2', { failIfMajorPerformanceCaveat: true });
  const placa = depuracao ? gl.getParameter(depuracao.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
  resultado.webgl2 = {
    disponivel: true,
    versao: gl.getParameter(gl.VERSION),
    glsl: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
    fornecedor: depuracao ? gl.getParameter(depuracao.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    placa,
    porSoftware: PLACA_POR_SOFTWARE.test(placa) || !semCaveat,
    maxTextura: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    maxCamadasDeTextura: gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS),
    maxTextura3d: gl.getParameter(gl.MAX_3D_TEXTURE_SIZE),
    maxRenderbuffer: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
    maxViewport: `${viewport[0]}×${viewport[1]}`,
    maxAmostras: gl.getParameter(gl.MAX_SAMPLES),
    maxUnidadesDeTextura: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
    maxAnisotropia: anisotropia ? gl.getParameter(anisotropia.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : null,
    formatosComprimidos: Object.fromEntries(Object.entries(FORMATOS_COMPRIMIDOS).map(([nome, extensao]) => [nome, extensoes.includes(extensao)])),
    extensoes,
  };
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  const w = resultado.webgl2;
  preencherTabela($('#tabela-webgl'), [
    ['WebGL2', true],
    ['Placa', w.placa],
    ['Fornecedor', w.fornecedor],
    ['Desenho pela CPU (sem placa de vídeo)', w.porSoftware],
    ['Versão', w.versao],
    ['MAX_TEXTURE_SIZE', String(w.maxTextura)],
    ['MAX_ARRAY_TEXTURE_LAYERS', String(w.maxCamadasDeTextura)],
    ['MAX_RENDERBUFFER_SIZE', String(w.maxRenderbuffer)],
    ['MAX_VIEWPORT_DIMS', w.maxViewport],
    ['MAX_SAMPLES', String(w.maxAmostras)],
    ['Anisotropia máxima', w.maxAnisotropia === null ? 'não tem' : String(w.maxAnisotropia)],
    ...Object.entries(w.formatosComprimidos).map(([nome, tem]) => [`Textura comprimida ${nome}`, tem]),
  ]);
  $('#extensoes').textContent = extensoes.join('\n');
}

// ---------- WebGPU (only availability; the RTS uses WebGL2) ----------

async function diagnosticarWebgpu() {
  const webgpu = { presente: 'gpu' in navigator, adaptador: null };
  if (webgpu.presente) {
    try {
      const adaptador = await Promise.race([navigator.gpu.requestAdapter(), new Promise((resolve) => setTimeout(resolve, 3000, null))]);
      if (adaptador) {
        const info = adaptador.info ?? {};
        webgpu.adaptador = { fornecedor: info.vendor ?? '', arquitetura: info.architecture ?? '', dispositivo: info.device ?? '', descricao: info.description ?? '' };
      }
    } catch (erro) {
      webgpu.erro = String(erro?.message ?? erro);
    }
  }
  resultado.webgpu = webgpu;
  preencherTabela($('#tabela-webgpu'), [
    ['navigator.gpu', webgpu.presente],
    ['Adaptador', webgpu.adaptador ? Object.values(webgpu.adaptador).filter(Boolean).join(' · ') || 'sem detalhes' : webgpu.erro ?? 'nenhum'],
  ]);
}

// ---------- audio ----------

const FORMATOS_DE_AUDIO = {
  'Opus em Ogg': 'audio/ogg; codecs="opus"',
  'Opus em WebM': 'audio/webm; codecs="opus"',
  'AAC em MP4': 'audio/mp4; codecs="mp4a.40.2"',
  'Vorbis em Ogg': 'audio/ogg; codecs="vorbis"',
};

// Decodes a 0,2 s tone the way the game will load its sounds, with decodeAudioData, in an offline context that needs no click.
async function decodificar(arquivo) {
  try {
    const dados = await (await fetch(new URL(`amostras/${arquivo}`, import.meta.url))).arrayBuffer();
    const contexto = new OfflineAudioContext(1, 48000, 48000);
    const buffer = await contexto.decodeAudioData(dados);
    return { ok: true, segundos: +buffer.duration.toFixed(3), taxa: buffer.sampleRate };
  } catch (erro) {
    return { ok: false, erro: String(erro?.message ?? erro) };
  }
}

async function diagnosticarAudio() {
  const elemento = document.createElement('audio');
  const audio = {
    canPlayType: Object.fromEntries(Object.entries(FORMATOS_DE_AUDIO).map(([nome, tipo]) => [nome, elemento.canPlayType(tipo) || 'não'])),
    decodeAudioDataOpusOgg: await decodificar('tom-opus.ogg'),
    decodeAudioDataAacM4a: await decodificar('tom-aac.m4a'),
  };
  resultado.audio = audio;
  const decodificado = (r) => (r.ok ? `decodificou (${r.segundos} s a ${r.taxa} Hz)` : `falhou: ${r.erro}`);
  preencherTabela($('#tabela-audio'), [
    ...Object.entries(audio.canPlayType).map(([nome, resposta]) => [`canPlayType ${nome}`, resposta]),
    ['decodeAudioData de Opus em Ogg', decodificado(audio.decodeAudioDataOpusOgg)],
    ['decodeAudioData de AAC em MP4', decodificado(audio.decodeAudioDataAacM4a)],
  ]);
}

// ---------- browser and machine ----------

function diagnosticarNavegador() {
  resultado.navegador = {
    userAgent: navigator.userAgent,
    plataforma: navigator.userAgentData?.platform ?? navigator.platform,
    idioma: navigator.language,
    nucleos: navigator.hardwareConcurrency ?? null,
    memoriaGb: navigator.deviceMemory ?? null,
    toque: navigator.maxTouchPoints ?? 0,
    isolamentoDeOrigem: self.crossOriginIsolated,
  };
  const n = resultado.navegador;
  preencherTabela($('#tabela-navegador'), [
    ['Navegador', n.userAgent],
    ['Sistema', n.plataforma],
    ['Núcleos lógicos', n.nucleos === null ? null : String(n.nucleos)],
    ['Memória (aproximada, só Chrome e Edge)', n.memoriaGb === null ? 'o navegador não diz' : `${n.memoriaGb} GB`],
    ['Pontos de toque', String(n.toque)],
  ]);
}

// ---------- prototype benchmark ----------

// The prototype's zoom is in CSS pixels per cell, so the field of view depends on the window width.
// 1920 CSS pixels at zoom 46 is the reference of the measurements (about 42 cells across); the zoom is scaled to keep it.
const CELULAS_VISIVEIS = 1920 / 46;

function rodarBench() {
  const unidades = Number($('#unidades').value);
  const resolucao = $('#resolucao').value;
  const zoom = +((innerWidth || screen.width) / CELULAS_VISIVEIS).toFixed(2);
  const consulta = new URLSearchParams({ bench: '1', seg: '10', avancar: '1500', unidades: String(unidades), res: resolucao, zoom: String(zoom) });
  const palco = document.createElement('div');
  palco.id = 'palco-bench';
  const quadro = document.createElement('iframe');
  quadro.src = new URL(`../rts-4k/?${consulta}`, import.meta.url).href;
  quadro.title = 'Protótipo medindo';
  const cancelar = document.createElement('button');
  cancelar.type = 'button';
  cancelar.textContent = 'Cancelar';
  palco.append(quadro, cancelar);
  document.body.append(palco);
  $('#medir').disabled = true;
  $('#estado-bench').textContent = 'medindo…';

  const erros = [];
  quadro.addEventListener('load', () => {
    quadro.contentWindow.addEventListener('error', (evento) => erros.push(evento.message));
  });
  const inicio = performance.now();
  const terminar = (mensagem, medida) => {
    clearInterval(vigia);
    palco.remove();
    $('#medir').disabled = false;
    $('#estado-bench').textContent = mensagem;
    if (medida) {
      resultado.bench = [...(resultado.bench ?? []), { pedido: { unidades, resolucao, zoom, janela: `${innerWidth}×${innerHeight}` }, ...medida, erros }];
      mostrarBench();
      mostrarJson();
    }
  };
  const vigia = setInterval(() => {
    const medida = quadro.contentWindow?.__bench;
    if (medida) terminar('pronto', structuredClone(medida));
    else if (performance.now() - inicio > 150_000) terminar(`não terminou em 150 s${erros.length ? `: ${erros[0]}` : ''}`);
  }, 500);
  cancelar.addEventListener('click', () => terminar('cancelado'));
}

function mostrarBench() {
  preencherTabela($('#tabela-bench'), resultado.bench.flatMap((medida, i) => [
    [`Medida ${i + 1}`, `${medida.unidades} unidades em ${medida.resolucao}`],
    ['Quadros por segundo', String(medida.qpsMedio)],
    ['Quadro p50 / p95 / p99', `${medida.quadroP50} / ${medida.quadroP95} / ${medida.quadroP99} ms`],
    ['Quadros acima de 20 ms', `${medida.quadrosAcimaDe20ms} de ${medida.quadros}`],
    ['CPU do quadro p50 / p95', `${medida.cpuQuadroP50} / ${medida.cpuQuadroP95} ms`],
    ['Passo da simulação p50 / p95', `${medida.passoSimP50} / ${medida.passoSimP95} ms`],
    ['Sprites do Blender', medida.atlas],
  ]));
}

// ---------- determinism in a Worker ----------

function rodarDeterminismo() {
  $('#determinismo').disabled = true;
  $('#estado-determinismo').textContent = 'rodando 3.600 passos…';
  const trabalhador = new Worker(new URL('determinismo.js', import.meta.url), { type: 'module' });
  const terminar = (mensagem) => {
    trabalhador.terminate();
    $('#determinismo').disabled = false;
    $('#estado-determinismo').textContent = mensagem;
    mostrarJson();
  };
  trabalhador.onmessage = ({ data }) => {
    resultado.determinismo = { noWorker: true, ...data };
    preencherTabela($('#tabela-determinismo'), [
      ['Igual à referência', data.igualAReferencia],
      ['Somas a cada 600 passos', data.somas.join(' ')],
      ['Referência', data.referencia.join(' ')],
      ['Milissegundos por passo', String(data.msPorPasso)],
      ['Passo mais lento', `${data.passoMaisLentoMs} ms`],
    ]);
    terminar('pronto');
  };
  trabalhador.onerror = (evento) => {
    resultado.determinismo = { noWorker: true, erro: evento.message || 'o Worker não carregou' };
    terminar(`falhou: ${resultado.determinismo.erro}`);
  };
}

// ---------- copy ----------

async function copiar() {
  const texto = JSON.stringify(resultado, null, 2);
  try {
    await navigator.clipboard.writeText(texto);
  } catch {
    const area = document.createElement('textarea');
    area.value = texto;
    document.body.append(area);
    area.select();
    const copiou = document.execCommand('copy');
    area.remove();
    if (!copiou) {
      $('#estado-copia').textContent = 'não deu para copiar: selecione o texto em Resultado completo';
      return;
    }
  }
  $('#estado-copia').textContent = 'copiado; cole numa mensagem para o Victor';
}

$('#copiar').addEventListener('click', copiar);
$('#medir').addEventListener('click', rodarBench);
$('#determinismo').addEventListener('click', rodarDeterminismo);
$('#aviso-arquivo').hidden = location.protocol !== 'file:';

diagnosticarNavegador();
diagnosticarWebgl();
mostrarJson();
await Promise.all([diagnosticarTela(), diagnosticarWebgpu(), diagnosticarAudio()]);
mostrarJson();
resultado.pronto = true;
