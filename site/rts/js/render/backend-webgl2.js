// WebGL2 backend: the only module that talks to GL. The renderer above it only fills typed arrays and calls
// this narrow interface, so another backend (or a headless one for tests) can replace it without touching
// interpolation, ordering or the frame plan.
//
// Sprites live in texture arrays (premultiplied colour RGBA8, team mask R8 and rendered shadow R8) whose layers all
// share one size, so every sprite of the scene goes in a single draw sorted back to front, whatever page it came from.
// The terrain pass fills the depth buffer with how close each terrain point is to the camera; the instanced passes
// test against it without writing, so the sorted sprites still blend in order but hide behind hills.
import * as F from './shaders.js';

export const FLOATS_INSTANCIA = 8;
// per-pass uniform block: 5 vec4 + 8 team colours
export const FLOATS_QUADRO = 52;
export const INICIO_CORES_QUADRO = 20;
const UNIDADE_ALTURA = 8;
const UNIDADE_AREA = 9;
const LARGURA_TABELA = 256; // texels per row of the frame table, two per frame

function compilar(gl, tipo, fonte) {
  const shader = gl.createShader(tipo);
  gl.shaderSource(shader, fonte);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`shader: ${gl.getShaderInfoLog(shader)}`);
  return shader;
}

function programa(gl, vert, frag, amostradores = {}) {
  const p = gl.createProgram();
  gl.attachShader(p, compilar(gl, gl.VERTEX_SHADER, vert));
  gl.attachShader(p, compilar(gl, gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`programa: ${gl.getProgramInfoLog(p)}`);
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const nome = gl.getActiveUniform(p, i).name;
    const local = gl.getUniformLocation(p, nome);
    if (local) u[nome] = local;
  }
  const bloco = gl.getUniformBlockIndex(p, 'Quadro');
  if (bloco !== gl.INVALID_INDEX) gl.uniformBlockBinding(p, bloco, 0);
  gl.useProgram(p);
  for (const [nome, unidade] of Object.entries({ ...amostradores, uAltura: UNIDADE_ALTURA, uArea: UNIDADE_AREA })) if (u[nome]) gl.uniform1i(u[nome], unidade);
  return { p, u };
}

function textura2D(gl, filtro) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filtro);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filtro);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

// Instanced quad: static corners in 0..1 plus a growable buffer of two vec4 per instance.
function criarLote(gl, capacidade) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const cantos = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cantos);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const instancias = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, instancias);
  gl.bufferData(gl.ARRAY_BUFFER, capacidade * FLOATS_INSTANCIA * 4, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0);
  gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
  gl.vertexAttribDivisor(2, 1);
  gl.bindVertexArray(null);
  return { vao, instancias, capacidade };
}

/**
 * @param {HTMLCanvasElement} canvas
 */
export function criarBackendWebGL2(canvas) {
  const gl = canvas.getContext('webgl2', {
    antialias: false,
    alpha: false,
    depth: true,
    stencil: false,
    premultipliedAlpha: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });
  if (!gl) throw new Error('WebGL2 indisponível neste navegador');
  const depuracao = gl.getExtension('WEBGL_debug_renderer_info');
  const temporizador = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const placa = depuracao ? gl.getParameter(depuracao.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  const info = {
    placa,
    // no GPU acceleration: the browser draws on the CPU (test runners, blocked drivers, remote sessions)
    software: /SwiftShader|llvmpipe|softpipe|Software|WARP|Basic Render/i.test(placa),
    maxTextura: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    maxCamadas: gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS),
    tempoDeGpu: Boolean(temporizador),
  };

  const terreno = programa(gl, F.VERT_TELA, F.FRAG_TERRENO, { uMapa: 0, uNeblina: 1, uLadrilhos: 7, uSolo: 10 });
  const pegada = programa(gl, F.VERT_PEGADA, F.FRAG_PEGADA);
  const cabo = programa(gl, F.VERT_CABO, F.FRAG_CABO);
  const sprite = programa(gl, F.VERT_SPRITE, F.FRAG_SPRITE, { uQuadros: 2, uCor: 3, uTime: 4 });
  const sombra = programa(gl, F.VERT_SOMBRA, F.FRAG_SOMBRA, { uQuadros: 2, uCor: 3, uSombra: 6 });
  const anel = programa(gl, F.VERT_ANEL, F.FRAG_ANEL);
  const barra = programa(gl, F.VERT_BARRA, F.FRAG_BARRA);
  const efeito = programa(gl, F.VERT_EFEITO, F.FRAG_EFEITO);
  const ampliar = programa(gl, F.VERT_TELA, F.FRAG_AMPLIAR, { uCena: 5 });
  const ficha = programa(gl, F.VERT_TELA, F.FRAG_FICHA);
  const fichaPredio = programa(gl, F.VERT_TELA, F.FRAG_FICHA_PREDIO);

  const blocoQuadro = gl.createBuffer();
  gl.bindBuffer(gl.UNIFORM_BUFFER, blocoQuadro);
  gl.bufferData(gl.UNIFORM_BUFFER, FLOATS_QUADRO * 4, gl.DYNAMIC_DRAW);
  gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, blocoQuadro);

  const vaoTela = gl.createVertexArray();
  const lotes = {
    sprites: criarLote(gl, 8192),
    sombras: criarLote(gl, 8192),
    aneis: criarLote(gl, 2048),
    barras: criarLote(gl, 2048),
    efeitos: criarLote(gl, 4096),
    pegadas: criarLote(gl, 64),
  };
  // cables are drawn from gl_VertexID alone, so their vertex array has only the per-instance attributes
  const cabos = criarLote(gl, 1024);
  gl.bindVertexArray(cabos.vao);
  gl.disableVertexAttribArray(0);
  gl.bindVertexArray(null);

  const texMapa = textura2D(gl, gl.LINEAR);
  const texAltura = textura2D(gl, gl.LINEAR);
  const texArea = textura2D(gl, gl.NEAREST);
  let areaVisivel = false;
  const texNeblina = textura2D(gl, gl.LINEAR);
  const texQuadros = textura2D(gl, gl.NEAREST);
  const texSolo = textura2D(gl, gl.NEAREST);
  // tileable ground textures, one layer per tile, created when the first tiles are known
  const ladrilhos = { textura: null, tamanho: 0, quantidade: 0 };
  let celulasPorLadrilho = 8;
  let modoSolo = 0;
  const solos = new Float32Array(F.MAX_SOLOS * 4);
  let mapaLargura = 1;
  let mapaAltura = 1;

  const camadas = { cor: null, time: null, sombra: null, largura: 0, altura: 0, quantidade: 0 };
  const leitura = gl.createFramebuffer();
  const escrita = gl.createFramebuffer();

  const cena = { fbo: gl.createFramebuffer(), textura: textura2D(gl, gl.LINEAR), profundidade: gl.createRenderbuffer(), largura: 0, altura: 0, ativa: false };
  let saidaLargura = canvas.width;
  let saidaAltura = canvas.height;

  // timer queries in a ring, so none is created per frame; results come back a few frames later
  const consultas = temporizador ? [gl.createQuery(), gl.createQuery(), gl.createQuery(), gl.createQuery()] : [];
  let consultaInicio = 0;
  let consultasPendentes = 0;
  let medindo = false;
  let ultimoGpuMs = -1;

  function criarArrays(largura, altura, quantidade) {
    const cor = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, cor);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, largura, altura, quantidade, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const time = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, time);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.R8, largura, altura, quantidade, 0, gl.RED, gl.UNSIGNED_BYTE, null);
    const sombra = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, sombra);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.R8, largura, altura, quantidade, 0, gl.RED, gl.UNSIGNED_BYTE, null);
    for (const t of [cor, time, sombra]) {
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    return { cor, time, sombra };
  }

  // Copies every layer of the old arrays into the new ones (same corner), so pixel coordinates stay valid.
  function copiarCamadas(antigas, novas) {
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, leitura);
    for (const nome of ['cor', 'time', 'sombra']) {
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, novas[nome]);
      for (let c = 0; c < camadas.quantidade; c++) {
        gl.framebufferTextureLayer(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, antigas[nome], 0, c);
        gl.copyTexSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, c, 0, 0, camadas.largura, camadas.altura);
      }
    }
    gl.framebufferTextureLayer(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, null, 0, 0);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
  }

  function escreverQuadro(dados) {
    gl.bindBuffer(gl.UNIFORM_BUFFER, blocoQuadro);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, dados, 0, FLOATS_QUADRO);
  }

  function encher(lote, dados, quantidade) {
    gl.bindBuffer(gl.ARRAY_BUFFER, lote.instancias);
    if (quantidade > lote.capacidade) {
      while (lote.capacidade < quantidade) lote.capacidade *= 2;
      gl.bufferData(gl.ARRAY_BUFFER, lote.capacidade * FLOATS_INSTANCIA * 4, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, dados, 0, quantidade * FLOATS_INSTANCIA);
  }

  function desenharLote(prog, lote, dados, quantidade, vertices = 4) {
    if (quantidade === 0) return;
    gl.useProgram(prog.p);
    encher(lote, dados, quantidade);
    gl.bindVertexArray(lote.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, vertices, quantidade);
  }

  // Instanced passes of the scene test against the terrain's depth without writing it; passes on the final image
  // (upscale, health bars) ignore it.
  function testarProfundidade(sim) {
    if (sim) {
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(false);
    } else gl.disable(gl.DEPTH_TEST);
  }

  function ligarSprites(prog) {
    gl.useProgram(prog.p);
    gl.uniform2f(prog.u.uTamanhoCamada, camadas.largura || 1, camadas.altura || 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, texQuadros);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, camadas.cor);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, camadas.time);
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, camadas.sombra);
  }

  function lerConsultas() {
    if (!temporizador) return;
    const disjunto = gl.getParameter(temporizador.GPU_DISJOINT_EXT);
    while (consultasPendentes > 0) {
      const q = consultas[consultaInicio];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      if (!disjunto) ultimoGpuMs = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
      consultaInicio = (consultaInicio + 1) % consultas.length;
      consultasPendentes--;
    }
  }

  return {
    gl,
    info,

    /**
     * Uploads the static map: per cell RGBA (blocked, relief, highest level a view ray can meet there, highest level
     * that can shade it, both scaled to 255 at the top level), and the fine height field (relevo.js).
     */
    definirMapa(largura, altura, rgba, fina, larguraFina, alturaFina) {
      if (larguraFina > info.maxTextura || alturaFina > info.maxTextura) throw new Error(`relevo além do limite da GPU: ${larguraFina}x${alturaFina}`);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.bindTexture(gl.TEXTURE_2D, texMapa);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, largura, altura, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      gl.bindTexture(gl.TEXTURE_2D, texAltura);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, larguraFina, alturaFina, 0, gl.RED, gl.UNSIGNED_BYTE, fina);
      gl.bindTexture(gl.TEXTURE_2D, texArea);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, largura, altura, 0, gl.RED, gl.UNSIGNED_BYTE, null);
      gl.bindTexture(gl.TEXTURE_2D, texSolo);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, largura, altura, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, new Uint8Array(largura * altura));
      areaVisivel = false;
      gl.bindTexture(gl.TEXTURE_2D, texNeblina);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, largura, altura, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(largura * altura));
      mapaLargura = largura;
      mapaAltura = altura;
    },

    /** Soil index per cell (0..MAX_SOLOS-1), for the splatted ground. */
    definirSolo(grade) {
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.bindTexture(gl.TEXTURE_2D, texSolo);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, mapaLargura, mapaAltura, gl.RED_INTEGER, gl.UNSIGNED_BYTE, grade);
    },

    /** Makes room for `quantidade` square ground tiles of `tamanho` px, dropping the ones there were. */
    prepararLadrilhos(tamanho, quantidade) {
      if (ladrilhos.textura && ladrilhos.tamanho === tamanho && ladrilhos.quantidade >= quantidade) return;
      if (ladrilhos.textura) gl.deleteTexture(ladrilhos.textura);
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
      const niveis = Math.floor(Math.log2(tamanho)) + 1;
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, niveis, gl.RGBA8, tamanho, tamanho, quantidade);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      Object.assign(ladrilhos, { textura: t, tamanho, quantidade });
    },

    /** Uploads a tile (premultiplied ImageBitmap of the prepared size) into a layer and rebuilds the mipmaps. */
    enviarLadrilho(camada, imagem) {
      if (!ladrilhos.textura || imagem.width !== ladrilhos.tamanho || imagem.height !== ladrilhos.tamanho || camada >= ladrilhos.quantidade) {
        throw new Error(`ladrilho ${imagem.width}x${imagem.height} não cabe nas camadas de ${ladrilhos.tamanho} px`);
      }
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, ladrilhos.textura);
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, camada, ladrilhos.tamanho, ladrilhos.tamanho, 1, gl.RGBA, gl.UNSIGNED_BYTE, imagem);
      gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    },

    /**
     * How each soil looks: per soil, a tint (rgb) and its tile layer, MAX_SOLOS entries of 4 floats; the tiles repeat
     * every `celulas` cells. modo 1 splats the tiles by soil, 0 draws the procedural ground.
     */
    definirSolos(tabela, celulas, modo) {
      solos.set(tabela.subarray(0, solos.length));
      celulasPorLadrilho = celulas;
      modoSolo = modo && ladrilhos.textura ? 1 : 0;
    },

    get modoSolo() {
      return modoSolo;
    },

    /** Where the local player may build (one byte per cell, 255 = yes), shaded while placing; null hides it. */
    definirArea(grade) {
      areaVisivel = Boolean(grade);
      if (!grade) return;
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.bindTexture(gl.TEXTURE_2D, texArea);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, mapaLargura, mapaAltura, gl.RED, gl.UNSIGNED_BYTE, grade);
    },

    get areaVisivel() {
      return areaVisivel;
    },

    /** Fog of war of the local player, one byte per cell. */
    atualizarNeblina(neblina) {
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.bindTexture(gl.TEXTURE_2D, texNeblina);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, mapaLargura, mapaAltura, gl.RED, gl.UNSIGNED_BYTE, neblina);
    },

    /**
     * Makes room for at least `quantidade` sprite layers of at least largura x altura, keeping what is there.
     * Not for the frame loop: it may reallocate and copy.
     */
    garantirCamadas(largura, altura, quantidade) {
      const l = Math.max(largura, camadas.largura);
      const a = Math.max(altura, camadas.altura);
      const q = Math.max(quantidade, camadas.quantidade);
      if (l > info.maxTextura || a > info.maxTextura || q > info.maxCamadas) {
        throw new Error(`camadas de sprite além do limite da GPU: ${l}x${a}x${q}`);
      }
      if (l === camadas.largura && a === camadas.altura && q === camadas.quantidade) return;
      const novas = criarArrays(l, a, q);
      if (camadas.cor) {
        copiarCamadas(camadas, novas);
        gl.deleteTexture(camadas.cor);
        gl.deleteTexture(camadas.time);
        gl.deleteTexture(camadas.sombra);
      }
      Object.assign(camadas, { cor: novas.cor, time: novas.time, sombra: novas.sombra, largura: l, altura: a, quantidade: q });
    },

    get camadas() {
      return { largura: camadas.largura, altura: camadas.altura, quantidade: camadas.quantidade };
    },

    /**
     * Uploads one atlas page into a layer at (0, 0). The colour must already be premultiplied
     * (ImageBitmap with premultiplyAlpha: 'premultiply'); the team mask and the shadow take the red channel of
     * their images, and a missing one clears its channel.
     */
    enviarPagina(camada, cor, time, sombraImagem, largura, altura) {
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, camadas.cor);
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, camada, largura, altura, 1, gl.RGBA, gl.UNSIGNED_BYTE, cor);
      const vazio = time && sombraImagem ? null : new Uint8Array(largura * altura);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, camadas.time);
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, camada, largura, altura, 1, gl.RED, gl.UNSIGNED_BYTE, time ?? vazio);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, camadas.sombra);
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, camada, largura, altura, 1, gl.RED, gl.UNSIGNED_BYTE, sombraImagem ?? vazio);
    },

    /**
     * Draws placeholder frames on the GPU into a layer (colour and mask together).
     * @param {number} camada
     * @param {{ x: number, y: number, celula: number, pxNivel: number, angulo: number, forma: number }[]} quadros
     * @param {Float32Array} quadroComum uniform block contents (only sin(elevation) is read)
     */
    desenharFichas(camada, quadros, quadroComum) {
      escreverQuadro(quadroComum);
      gl.bindFramebuffer(gl.FRAMEBUFFER, escrita);
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, camadas.cor, 0, camada);
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, camadas.time, 0, camada);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.SCISSOR_TEST);
      gl.useProgram(ficha.p);
      gl.bindVertexArray(vaoTela);
      for (const q of quadros) {
        gl.viewport(q.x, q.y, q.celula, q.celula);
        gl.scissor(q.x, q.y, q.celula, q.celula);
        gl.uniform2f(ficha.u.uOrigem, q.x, q.y);
        gl.uniform1f(ficha.u.uCelula, q.celula);
        gl.uniform1f(ficha.u.uPxNivel, q.pxNivel);
        gl.uniform1f(ficha.u.uAngulo, q.angulo);
        gl.uniform1i(ficha.u.uForma, q.forma);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.disable(gl.SCISSOR_TEST);
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, null, 0, 0);
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, null, 0, 0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    },

    /**
     * Draws placeholder buildings on the GPU into a layer (colour and mask together).
     * @param {number} camada
     * @param {{ x: number, y: number, largura: number, altura: number, ancoraX: number, ancoraY: number, pxNivel: number,
     *   pegada: number[], alturaMetros: number, forma: number, semente: number }[]} quadros
     * @param {Float32Array} quadroComum uniform block contents (the projection is read)
     */
    desenharFichasPredio(camada, quadros, quadroComum) {
      escreverQuadro(quadroComum);
      gl.bindFramebuffer(gl.FRAMEBUFFER, escrita);
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, camadas.cor, 0, camada);
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, camadas.time, 0, camada);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.SCISSOR_TEST);
      gl.useProgram(fichaPredio.p);
      gl.bindVertexArray(vaoTela);
      for (const q of quadros) {
        gl.viewport(q.x, q.y, q.largura, q.altura);
        gl.scissor(q.x, q.y, q.largura, q.altura);
        gl.uniform2f(fichaPredio.u.uOrigem, q.x, q.y);
        gl.uniform2f(fichaPredio.u.uAncora, q.ancoraX, q.ancoraY);
        gl.uniform1f(fichaPredio.u.uPxNivel, q.pxNivel);
        gl.uniform2f(fichaPredio.u.uPegada, q.pegada[0], q.pegada[1]);
        gl.uniform1f(fichaPredio.u.uAlturaPredio, q.alturaMetros);
        gl.uniform1i(fichaPredio.u.uForma, q.forma);
        gl.uniform1f(fichaPredio.u.uSemente, q.semente);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.disable(gl.SCISSOR_TEST);
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, null, 0, 0);
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, null, 0, 0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    },

    /** Rebuilds the mipmaps of the sprite layers after uploads. */
    terminarCamadas() {
      for (const t of [camadas.cor, camadas.time, camadas.sombra]) {
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
        gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      }
    },

    /** Frame table: 8 floats per frame (layer, x, y, width, height, offsetX, offsetY, px per cell). */
    definirQuadros(tabela, quantidade) {
      const texels = quantidade * 2;
      const linhas = Math.max(1, Math.ceil(texels / LARGURA_TABELA));
      const dados = new Float32Array(LARGURA_TABELA * linhas * 4);
      dados.set(tabela.subarray(0, quantidade * 8));
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      gl.bindTexture(gl.TEXTURE_2D, texQuadros);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, LARGURA_TABELA, linhas, 0, gl.RGBA, gl.FLOAT, dados);
    },

    /** Canvas backing size in device pixels. */
    redimensionar(largura, altura) {
      if (canvas.width !== largura) canvas.width = largura;
      if (canvas.height !== altura) canvas.height = altura;
      saidaLargura = largura;
      saidaAltura = altura;
    },

    /**
     * Starts the scene pass at a render scale: below 1 it draws into an offscreen target that terminarCena() upscales.
     * Returns the target size through `alvo` ([width, height]).
     */
    comecarCena(escala, alvo) {
      if (temporizador && consultasPendentes < consultas.length) {
        gl.beginQuery(temporizador.TIME_ELAPSED_EXT, consultas[(consultaInicio + consultasPendentes) % consultas.length]);
        medindo = true;
      }
      cena.ativa = escala < 1;
      let largura = saidaLargura;
      let altura = saidaAltura;
      if (cena.ativa) {
        largura = Math.max(1, Math.round(saidaLargura * escala));
        altura = Math.max(1, Math.round(saidaAltura * escala));
        if (largura !== cena.largura || altura !== cena.altura) {
          gl.bindTexture(gl.TEXTURE_2D, cena.textura);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, largura, altura, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
          gl.bindRenderbuffer(gl.RENDERBUFFER, cena.profundidade);
          gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, largura, altura);
          gl.bindFramebuffer(gl.FRAMEBUFFER, cena.fbo);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, cena.textura, 0);
          gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, cena.profundidade);
          cena.largura = largura;
          cena.altura = altura;
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, cena.fbo);
      } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
      gl.viewport(0, 0, largura, altura);
      alvo[0] = largura;
      alvo[1] = altura;
    },

    /** Sets the uniform block for the passes that follow. */
    definirQuadroComum: escreverQuadro,

    /** Terrain over the whole target; it writes every pixel's depth, so nothing needs clearing. */
    desenharTerreno() {
      gl.disable(gl.BLEND);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.ALWAYS);
      gl.depthMask(true);
      gl.useProgram(terreno.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texMapa);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, texNeblina);
      gl.activeTexture(gl.TEXTURE7);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, ladrilhos.textura);
      gl.activeTexture(gl.TEXTURE10);
      gl.bindTexture(gl.TEXTURE_2D, texSolo);
      gl.activeTexture(gl.TEXTURE0 + UNIDADE_ALTURA);
      gl.bindTexture(gl.TEXTURE_2D, texAltura);
      gl.activeTexture(gl.TEXTURE0 + UNIDADE_AREA);
      gl.bindTexture(gl.TEXTURE_2D, texArea);
      gl.uniform1f(terreno.u.uCelulasPorLadrilho, celulasPorLadrilho);
      gl.uniform1i(terreno.u.uModoSolo, modoSolo);
      gl.uniform4fv(terreno.u['uSolos[0]'], solos);
      gl.bindVertexArray(vaoTela);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.enable(gl.BLEND);
      testarProfundidade(true);
    },

    /** Building footprints on the ground (placement ghost): x, y, width, height in cells, then rgba. */
    desenharPegadas(dados, quantidade) {
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      desenharLote(pegada, lotes.pegadas, dados, quantidade);
    },

    /** Power cables between poles: ax, ay, bx, by in cells, then the two end heights, live and team. */
    desenharCabos(dados, quantidade) {
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      desenharLote(cabo, cabos, dados, quantidade, (F.SEGMENTOS_CABO + 1) * 2);
    },

    /** Ground decals and markers (premultiplied alpha), drawn between the terrain and the shadows. */
    desenharEfeitos(dados, quantidade, aditivo) {
      gl.blendFunc(gl.ONE, aditivo ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
      desenharLote(efeito, lotes.efeitos, dados, quantidade);
    },

    desenharAneis(dados, quantidade) {
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      desenharLote(anel, lotes.aneis, dados, quantidade);
    },

    desenharSombras(dados, quantidade) {
      if (quantidade === 0 || !camadas.cor) return;
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      ligarSprites(sombra);
      desenharLote(sombra, lotes.sombras, dados, quantidade);
    },

    /** All sprites of the scene in one draw; instances must already be sorted back to front. */
    desenharSprites(dados, quantidade) {
      if (quantidade === 0 || !camadas.cor) return;
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      ligarSprites(sprite);
      desenharLote(sprite, lotes.sprites, dados, quantidade);
    },

    /** Ends the scene pass; with a scaled target, upscales it into the canvas. */
    terminarCena(nitidez) {
      testarProfundidade(false);
      if (cena.ativa) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, saidaLargura, saidaAltura);
        gl.disable(gl.BLEND);
        gl.useProgram(ampliar.p);
        gl.uniform2f(ampliar.u.uSaida, saidaLargura, saidaAltura);
        gl.uniform1f(ampliar.u.uNitidez, nitidez);
        gl.activeTexture(gl.TEXTURE5);
        gl.bindTexture(gl.TEXTURE_2D, cena.textura);
        gl.bindVertexArray(vaoTela);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.enable(gl.BLEND);
      }
    },

    /** Health bars at native resolution, after the upscale. */
    desenharBarras(dados, quantidade) {
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      desenharLote(barra, lotes.barras, dados, quantidade);
    },

    terminarQuadro() {
      gl.bindVertexArray(null);
      if (medindo) {
        gl.endQuery(temporizador.TIME_ELAPSED_EXT);
        consultasPendentes++;
        medindo = false;
      }
      lerConsultas();
    },

    /** GPU time of a recent frame in ms, or -1 where timer queries are not exposed. */
    get tempoDeGpuMs() {
      return ultimoGpuMs;
    },
  };
}
