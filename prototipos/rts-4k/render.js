// WebGL2 renderer for the 4K prototype: procedural terrain with fog of war in one full-screen pass,
// instanced vehicles (procedural SDF shapes or a pre-rendered Blender atlas), instanced effects.

export const FLOATS_UNIDADE = 8; // x, y, body angle, turret angle, team, type, health 0..1, selected
export const FLOATS_EFEITO = 8; // ax, ay, bx, by, kind, age 0..1, size, seed

export const EFEITO = { TRACADO: 0, CLARAO: 1, EXPLOSAO: 2, FUMACA: 3, MARCA: 4, ORDEM: 5 };

const CABECALHO = `#version 300 es
precision highp float;
`;

const VERT_TELA = `${CABECALHO}
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG_TERRENO = `${CABECALHO}
uniform vec2 uCam;
uniform float uZoom;
uniform vec2 uRes;
uniform vec2 uTamanho;
uniform sampler2D uMapa;
uniform sampler2D uNeblina;
out vec4 cor;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float ruido(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int k = 0; k < 5; k++) { s += a * ruido(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
float rocha(vec2 w) { return texture(uMapa, w / uTamanho).r; }

void main() {
  vec2 px = gl_FragCoord.xy - uRes * 0.5;
  vec2 w = uCam + vec2(px.x, -px.y) / uZoom;
  vec2 uv = w / uTamanho;
  float relevo = texture(uMapa, uv).g;

  float n1 = fbm(w * 0.18);
  float n2 = fbm(w * 1.1 + 5.3);
  float n3 = ruido(w * 11.0);
  vec3 areia = vec3(0.76, 0.63, 0.44);
  vec3 terra = vec3(0.50, 0.40, 0.29);
  vec3 seca = vec3(0.66, 0.60, 0.48);
  vec3 solo = mix(areia, terra, smoothstep(0.30, 0.78, n1 + (relevo - 0.5) * 0.7));
  solo = mix(solo, seca, smoothstep(0.55, 0.85, n2) * 0.45);
  float rachadura = 1.0 - smoothstep(0.0, 0.03, abs(fbm(w * 0.7 + 3.7) - 0.5));
  solo *= 1.0 - rachadura * 0.32 * smoothstep(0.42, 0.66, n1);
  solo *= 0.9 + n3 * 0.14;
  vec2 grao = fract(w * 5.0) - 0.5;
  float pedrinha = step(0.94, hash(floor(w * 5.0))) * smoothstep(0.32, 0.12, length(grao));
  solo = mix(solo, solo * 0.62, pedrinha);

  float r = rocha(w);
  float bordaRuido = (fbm(w * 0.9) - 0.5) * 0.35;
  float pedraMascara = smoothstep(0.40, 0.56, r + bordaRuido);
  float e = 0.45;
  float gx = rocha(w + vec2(e, 0)) - rocha(w - vec2(e, 0));
  float gy = rocha(w + vec2(0, e)) - rocha(w - vec2(0, e));
  vec3 normal = normalize(vec3(-gx * 2.2, -gy * 2.2, 1.0));
  vec3 luz = normalize(vec3(-0.55, -0.65, 0.75));
  float difusa = clamp(dot(normal, luz), 0.0, 1.0);
  vec3 pedra = mix(vec3(0.40, 0.34, 0.29), vec3(0.63, 0.56, 0.48), fbm(w * 0.9 + 9.1));
  pedra *= 0.5 + difusa * 0.75;
  pedra *= 0.82 + ruido(w * 6.0) * 0.3;
  pedra = mix(pedra, pedra * 0.7, smoothstep(0.55, 0.7, fbm(w * 2.6)) * 0.6);
  float sombra = smoothstep(0.35, 0.7, rocha(w + vec2(-0.55, -0.65) * 1.2)) * (1.0 - pedraMascara);
  solo *= 1.0 - sombra * 0.42;
  vec3 c = mix(solo, pedra, pedraMascara);

  vec2 d = 0.75 / uTamanho;
  float f = texture(uNeblina, uv).r * 2.0
    + texture(uNeblina, uv + vec2(d.x, 0)).r + texture(uNeblina, uv - vec2(d.x, 0)).r
    + texture(uNeblina, uv + vec2(0, d.y)).r + texture(uNeblina, uv - vec2(0, d.y)).r;
  f /= 6.0;
  float vista = smoothstep(0.08, 0.42, f);
  float visivel = smoothstep(0.62, 0.95, f);
  vec3 cinza = vec3(dot(c, vec3(0.3, 0.59, 0.11)));
  vec3 comNeblina = mix(mix(cinza, c, 0.35) * 0.48, c, visivel);
  comNeblina = mix(vec3(0.025, 0.022, 0.02), comNeblina, vista);
  if (any(lessThan(w, vec2(0.0))) || any(greaterThan(w, uTamanho))) comNeblina = vec3(0.02);
  cor = vec4(comNeblina, 1.0);
}`;

const VERT_UNIDADE = `${CABECALHO}
layout(location = 0) in vec2 aCanto;
layout(location = 1) in vec4 aUnidade;
layout(location = 2) in vec4 aDados;
uniform vec2 uCam;
uniform float uZoom;
uniform vec2 uRes;
uniform float uSombra;
out vec2 vLocal;
flat out vec4 vDados;
flat out vec2 vAngulo;
flat out float vMeio;
void main() {
  float meio = aDados.y > 0.5 ? 0.8 : 0.62;
  vec2 deslocamento = uSombra > 0.5 ? vec2(0.14, 0.18) : vec2(0.0);
  vec2 w = aUnidade.xy + deslocamento + aCanto * meio;
  vec2 p = (w - uCam) * uZoom;
  gl_Position = vec4(p.x / (uRes.x * 0.5), -p.y / (uRes.y * 0.5), 0.0, 1.0);
  vLocal = aCanto * meio;
  vDados = aDados;
  vAngulo = aUnidade.zw;
  vMeio = meio;
}`;

const FRAG_UNIDADE = `${CABECALHO}
in vec2 vLocal;
flat in vec4 vDados;
flat in vec2 vAngulo;
flat in float vMeio;
uniform float uSombra;
uniform float uZoom;
uniform float uTempo;
uniform float uUsaAtlas;
uniform float uDirecoes;
uniform float uAtlasEscala;
uniform sampler2D uAtlasCor;
uniform sampler2D uAtlasTime;
out vec4 cor;

float caixa(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
vec2 girar(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x + s * p.y, -s * p.x + c * p.y); }

vec3 corDoTime(float t) { return t < 0.5 ? vec3(0.16, 0.74, 0.80) : vec3(0.88, 0.34, 0.14); }

// Signed distance and colour of the procedural vehicle in its own frame.
vec4 veiculo(vec2 localTela, out float dist) {
  float escala = vDados.y > 0.5 ? 0.8 : 0.86;
  vec2 local = localTela / escala;
  vec2 p = girar(local, vAngulo.x);
  vec2 t = girar(local, vAngulo.y);
  vec3 time = corDoTime(vDados.x);
  vec3 c;
  if (vDados.y > 0.5) {
    float esquerda = caixa(p - vec2(0.0, 0.27), vec2(0.47, 0.1), 0.03);
    float direita = caixa(p + vec2(0.0, 0.27), vec2(0.47, 0.1), 0.03);
    float esteira = min(esquerda, direita);
    float casco = caixa(p, vec2(0.40, 0.24), 0.07);
    float torre = length(t + vec2(0.04, 0.0)) - 0.17;
    float cano = caixa(t - vec2(0.3, 0.0), vec2(0.22, 0.035), 0.012);
    dist = min(min(esteira, casco), min(torre, cano));
    float faixa = step(0.5, fract(p.x * 9.0));
    c = mix(vec3(0.16), vec3(0.24), faixa);
    if (casco < 0.0) c = mix(vec3(0.46, 0.42, 0.33), vec3(0.56, 0.5, 0.38), smoothstep(-0.2, 0.2, p.x)) * (1.0 + clamp(-casco * 2.5, 0.0, 0.25));
    if (casco < 0.0 && abs(p.y) < 0.07) c = time * 0.85;
    if (torre < 0.0 || cano < 0.0) c = cano < 0.0 && torre >= 0.0 ? vec3(0.2) : mix(time * 0.7, time, smoothstep(0.17, -0.05, length(t + vec2(0.08, 0.06))));
  } else {
    float chassi = caixa(p, vec2(0.30, 0.15), 0.07);
    float rodas = min(min(caixa(p - vec2(0.2, 0.19), vec2(0.09, 0.05), 0.02), caixa(p - vec2(-0.2, 0.19), vec2(0.09, 0.05), 0.02)),
                      min(caixa(p - vec2(0.2, -0.19), vec2(0.09, 0.05), 0.02), caixa(p - vec2(-0.2, -0.19), vec2(0.09, 0.05), 0.02)));
    float gaiola = abs(caixa(p + vec2(0.04, 0.0), vec2(0.13, 0.11), 0.03)) - 0.018;
    float arma = caixa(t - vec2(0.14, 0.0), vec2(0.15, 0.022), 0.01);
    dist = min(min(chassi, rodas), min(gaiola, arma));
    c = vec3(0.12);
    if (chassi < 0.0) c = mix(vec3(0.55, 0.36, 0.22), time, 0.55) * (0.9 + clamp(-chassi * 3.0, 0.0, 0.3));
    if (gaiola < 0.0) c = vec3(0.25, 0.22, 0.2);
    if (arma < 0.0) c = vec3(0.18);
  }
  // light from the top left and a dark outline for readability over sand
  c *= 0.85 + 0.25 * clamp(-(local.x + local.y) * 0.9, -0.5, 0.5);
  dist *= escala;
  float largura = 1.6 / uZoom;
  c = mix(c, vec3(0.05), smoothstep(-largura * 1.6, -largura * 0.2, dist));
  return vec4(c, 1.0 - smoothstep(-largura * 0.5, largura * 0.5, dist));
}

vec4 doAtlas(vec2 local) {
  vec2 uv = local / (vMeio * 2.0 * uAtlasEscala) + 0.5;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return vec4(0.0);
  float passoAngulo = 6.2831853 / uDirecoes;
  float quadro = mod(floor(vAngulo.x / passoAngulo + 0.5), uDirecoes);
  vec2 coordenada = vec2((quadro + uv.x) / uDirecoes, uv.y);
  vec4 base = texture(uAtlasCor, coordenada);
  float mascara = texture(uAtlasTime, coordenada).r;
  vec3 tingido = mix(base.rgb, base.rgb * corDoTime(vDados.x) * 1.8, mascara);
  return vec4(tingido, base.a);
}

void main() {
  float dist = 1.0;
  vec4 v = (uUsaAtlas > 0.5 && vDados.y > 0.5) ? doAtlas(vLocal) : veiculo(vLocal, dist);
  if (uSombra > 0.5) {
    float a = (uUsaAtlas > 0.5 && vDados.y > 0.5) ? v.a : 1.0 - smoothstep(-0.04, 0.08, dist);
    cor = vec4(0.0, 0.0, 0.0, a * 0.32);
    return;
  }
  vec4 resultado = vec4(v.rgb * v.a, v.a);
  float largura = 1.6 / uZoom;
  if (vDados.w > 0.5) {
    float anel = abs(length(vLocal * vec2(1.0, 1.25)) - vMeio * 0.86) - largura;
    float a = 1.0 - smoothstep(0.0, largura * 1.5, anel);
    resultado = mix(resultado, vec4(0.35, 1.0, 0.45, 1.0), a * (1.0 - resultado.a * 0.6));
  }
  if (vDados.w > 0.5 || vDados.z < 0.999) {
    vec2 barra = vLocal - vec2(0.0, -vMeio * 0.92);
    if (abs(barra.x) < vMeio * 0.62 && abs(barra.y) < 0.045) {
      float cheio = step(barra.x / (vMeio * 1.24) + 0.5, vDados.z);
      vec3 cb = mix(vec3(0.9, 0.2, 0.1), vec3(0.3, 0.95, 0.3), vDados.z);
      resultado = vec4(mix(vec3(0.08), cb, cheio), 1.0);
    }
  }
  cor = resultado;
}`;

const VERT_EFEITO = `${CABECALHO}
layout(location = 0) in vec2 aCanto;
layout(location = 1) in vec4 aPontos;
layout(location = 2) in vec4 aDados;
uniform vec2 uCam;
uniform float uZoom;
uniform vec2 uRes;
out vec2 vLocal;
flat out vec4 vDados;
void main() {
  vec2 w;
  if (aDados.x < 0.5) {
    vec2 a = aPontos.xy, b = aPontos.zw;
    vec2 eixo = b - a;
    float comprimento = max(length(eixo), 0.001);
    vec2 dir = eixo / comprimento;
    vec2 normal = vec2(-dir.y, dir.x);
    float largura = 0.07;
    w = a + eixo * (aCanto.x * 0.5 + 0.5) + normal * aCanto.y * largura;
  } else {
    vec2 centro = aPontos.xy + aPontos.zw * aDados.y;
    w = centro + aCanto * aDados.z;
  }
  vec2 p = (w - uCam) * uZoom;
  gl_Position = vec4(p.x / (uRes.x * 0.5), -p.y / (uRes.y * 0.5), 0.0, 1.0);
  vLocal = aCanto;
  vDados = aDados;
}`;

const FRAG_EFEITO = `${CABECALHO}
in vec2 vLocal;
flat in vec4 vDados;
out vec4 cor;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float ruido(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
void main() {
  float tipo = vDados.x, idade = vDados.y, semente = vDados.w;
  float r = length(vLocal);
  if (tipo < 0.5) {
    float a = (1.0 - abs(vLocal.y)) * (1.0 - idade) * smoothstep(0.0, 0.25, vLocal.x * 0.5 + 0.5);
    cor = vec4(vec3(1.0, 0.86, 0.45) * a, 0.0);
  } else if (tipo < 1.5) {
    float a = smoothstep(1.0, 0.0, r) * (1.0 - idade);
    cor = vec4(vec3(1.0, 0.9, 0.6) * a * 1.4, 0.0);
  } else if (tipo < 2.5) {
    float borda = 0.75 + 0.25 * ruido(vLocal * 3.0 + semente * 10.0 + idade * 4.0);
    float a = smoothstep(borda, borda * 0.5, r) * (1.0 - idade);
    vec3 c = mix(vec3(1.0, 0.95, 0.7), vec3(1.0, 0.45, 0.1), smoothstep(0.0, 0.5, idade + r * 0.4));
    c = mix(c, vec3(0.35, 0.08, 0.02), smoothstep(0.45, 1.0, idade));
    cor = vec4(c * a * 1.6, 0.0);
  } else if (tipo < 3.5) {
    float n = ruido(vLocal * 2.5 + semente * 7.0 + idade * 1.5);
    float a = smoothstep(1.0, 0.35, r + n * 0.35) * (1.0 - idade) * 0.55;
    vec3 c = mix(vec3(0.32, 0.29, 0.26), vec3(0.15, 0.14, 0.13), n);
    cor = vec4(c * a, a);
  } else if (tipo < 4.5) {
    float n = ruido(vLocal * 4.0 + semente * 13.0);
    float a = smoothstep(1.0, 0.25, r + n * 0.45) * (1.0 - idade) * 0.7;
    cor = vec4(vec3(0.08, 0.06, 0.05) * a, a);
  } else {
    float anel = abs(r - (1.0 - idade) * 0.9) - 0.06;
    float a = (1.0 - smoothstep(0.0, 0.05, anel)) * (1.0 - idade);
    cor = vec4(vec3(0.35, 1.0, 0.45) * a, a);
  }
}`;

function compilar(gl, tipo, fonte) {
  const shader = gl.createShader(tipo);
  gl.shaderSource(shader, fonte);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`shader: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

function programa(gl, vert, frag) {
  const p = gl.createProgram();
  gl.attachShader(p, compilar(gl, gl.VERTEX_SHADER, vert));
  gl.attachShader(p, compilar(gl, gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`programa: ${gl.getProgramInfoLog(p)}`);
  const uniformes = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const nome = gl.getActiveUniform(p, i).name;
    uniformes[nome] = gl.getUniformLocation(p, nome);
  }
  return { p, u: uniformes };
}

function texturaVazia(gl, filtro) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filtro);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filtro);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

// Instanced quad: a static corner buffer plus a dynamic per-instance buffer of 8 floats.
function criarLote(gl, capacidade) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const cantos = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cantos);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const instancias = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, instancias);
  gl.bufferData(gl.ARRAY_BUFFER, capacidade * 32, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0);
  gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
  gl.vertexAttribDivisor(2, 1);
  gl.bindVertexArray(null);
  return { vao, instancias, capacidade };
}

function encherLote(gl, lote, dados, quantidade) {
  gl.bindBuffer(gl.ARRAY_BUFFER, lote.instancias);
  if (quantidade > lote.capacidade) {
    lote.capacidade = quantidade * 2;
    gl.bufferData(gl.ARRAY_BUFFER, lote.capacidade * 32, gl.DYNAMIC_DRAW);
  }
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, dados, 0, quantidade * 8);
}

export function criarRenderizador(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  if (!gl) throw new Error('WebGL2 indisponível neste navegador');
  const depuracao = gl.getExtension('WEBGL_debug_renderer_info');
  const info = {
    placa: depuracao ? gl.getParameter(depuracao.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    maxTextura: gl.getParameter(gl.MAX_TEXTURE_SIZE),
  };
  const terreno = programa(gl, VERT_TELA, FRAG_TERRENO);
  const unidade = programa(gl, VERT_UNIDADE, FRAG_UNIDADE);
  const efeito = programa(gl, VERT_EFEITO, FRAG_EFEITO);
  const vaoTela = gl.createVertexArray();
  const loteUnidades = criarLote(gl, 8192);
  const loteEfeitos = criarLote(gl, 4096);
  const texMapa = texturaVazia(gl, gl.LINEAR);
  const texNeblina = texturaVazia(gl, gl.LINEAR);
  const atlas = { cor: texturaVazia(gl, gl.LINEAR), time: texturaVazia(gl, gl.LINEAR), ativo: false, direcoes: 16, escala: 1 };
  let tamanho = [1, 1];

  function definirMapa(largura, altura, bloqueado, relevo) {
    const dados = new Uint8Array(largura * altura * 2);
    for (let i = 0; i < largura * altura; i++) {
      dados[i * 2] = bloqueado[i] ? 255 : 0;
      dados[i * 2 + 1] = relevo[i];
    }
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.bindTexture(gl.TEXTURE_2D, texMapa);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, largura, altura, 0, gl.RG, gl.UNSIGNED_BYTE, dados);
    gl.bindTexture(gl.TEXTURE_2D, texNeblina);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, largura, altura, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(largura * altura));
    tamanho = [largura, altura];
  }

  function atualizarNeblina(neblina) {
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.bindTexture(gl.TEXTURE_2D, texNeblina);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, tamanho[0], tamanho[1], gl.RED, gl.UNSIGNED_BYTE, neblina);
  }

  function definirAtlas(imagemCor, imagemTime, { direcoes, escala }) {
    for (const [tex, imagem] of [[atlas.cor, imagemCor], [atlas.time, imagemTime]]) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, imagem);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    }
    Object.assign(atlas, { ativo: true, direcoes, escala });
  }

  function comuns(prog, camera) {
    gl.uniform2f(prog.u.uCam, camera.x, camera.y);
    gl.uniform1f(prog.u.uZoom, camera.zoom);
    gl.uniform2f(prog.u.uRes, canvas.width, canvas.height);
  }

  function desenharEfeitos(camera, dados, quantidade, aditivo) {
    if (quantidade === 0) return;
    gl.useProgram(efeito.p);
    comuns(efeito, camera);
    gl.blendFunc(gl.ONE, aditivo ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
    encherLote(gl, loteEfeitos, dados, quantidade);
    gl.bindVertexArray(loteEfeitos.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, quantidade);
  }

  function desenhar({ camera, unidades, nUnidades, decalques, nDecalques, fumaca, nFumaca, brilho, nBrilho, tempo }) {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.BLEND);
    gl.useProgram(terreno.p);
    comuns(terreno, camera);
    gl.uniform2f(terreno.u.uTamanho, tamanho[0], tamanho[1]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texMapa);
    gl.uniform1i(terreno.u.uMapa, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texNeblina);
    gl.uniform1i(terreno.u.uNeblina, 1);
    gl.bindVertexArray(vaoTela);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.BLEND);
    desenharEfeitos(camera, decalques, nDecalques, false);

    gl.useProgram(unidade.p);
    comuns(unidade, camera);
    gl.uniform1f(unidade.u.uTempo, tempo);
    gl.uniform1f(unidade.u.uUsaAtlas, atlas.ativo ? 1 : 0);
    gl.uniform1f(unidade.u.uDirecoes, atlas.direcoes);
    gl.uniform1f(unidade.u.uAtlasEscala, atlas.escala);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, atlas.cor);
    gl.uniform1i(unidade.u.uAtlasCor, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, atlas.time);
    gl.uniform1i(unidade.u.uAtlasTime, 3);
    encherLote(gl, loteUnidades, unidades, nUnidades);
    gl.bindVertexArray(loteUnidades.vao);
    gl.uniform1f(unidade.u.uSombra, 1);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nUnidades);
    gl.uniform1f(unidade.u.uSombra, 0);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nUnidades);

    desenharEfeitos(camera, fumaca, nFumaca, false);
    desenharEfeitos(camera, brilho, nBrilho, true);
    gl.bindVertexArray(null);
  }

  return { gl, info, definirMapa, atualizarNeblina, definirAtlas, desenhar };
}
