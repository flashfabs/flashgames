// GLSL ES 3.00 sources of the WebGL2 backend. Every program reads the per-pass uniform block Quadro, so the
// camera, the projection and the team colours are uploaded once per pass instead of once per program.
//
// Screen space is in pixels of the current render target, origin at the top-left, y down. A map point
// (x, y, height h in metres) lands at res/2 + ((x - cam.x) * px, (y - cam.y) * px * sin(e) - h * px * cos(e) / m).

const CABECALHO = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DArray;
layout(std140) uniform Quadro {
  vec4 uCamPx;   // camera x, camera y (cells), px per cell, sin(elevation)
  vec4 uRes;     // target width, target height, cos(elevation), metres per cell
  vec4 uSol;     // towards the sun in map axes (x east, y south, z up), time in seconds
  vec4 uDimMapa; // map width, map height (cells), team tint factor, unused
  vec4 uCores[8];
};
vec2 projetar(vec3 p) {
  return uRes.xy * 0.5 + vec2((p.x - uCamPx.x) * uCamPx.z, (p.y - uCamPx.y) * uCamPx.z * uCamPx.w - p.z * uCamPx.z * uRes.z / uRes.w);
}
vec4 paraClip(vec2 tela) {
  return vec4(tela.x / uRes.x * 2.0 - 1.0, 1.0 - tela.y / uRes.y * 2.0, 0.0, 1.0);
}
`;

const RUIDO = `
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
`;

export const VERT_TELA = `${CABECALHO}
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// Procedural desert terrain with fog of war, evaluated per pixel at the ground point under it.
export const FRAG_TERRENO = `${CABECALHO}${RUIDO}
uniform sampler2D uMapa;
uniform sampler2D uNeblina;
out vec4 cor;
float rocha(vec2 w) { return texture(uMapa, w / uDimMapa.xy).r; }
void main() {
  vec2 tela = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 w = uCamPx.xy + vec2((tela.x - uRes.x * 0.5) / uCamPx.z, (tela.y - uRes.y * 0.5) / (uCamPx.z * uCamPx.w));
  vec2 uv = w / uDimMapa.xy;
  float relevo = texture(uMapa, uv).g;

  float n1 = fbm(w * 0.18);
  float n2 = fbm(w * 1.1 + 5.3);
  float n3 = ruido(w * 11.0);
  vec3 solo = mix(vec3(0.76, 0.63, 0.44), vec3(0.50, 0.40, 0.29), smoothstep(0.30, 0.78, n1 + (relevo - 0.5) * 0.7));
  solo = mix(solo, vec3(0.66, 0.60, 0.48), smoothstep(0.55, 0.85, n2) * 0.45);
  float rachadura = 1.0 - smoothstep(0.0, 0.03, abs(fbm(w * 0.7 + 3.7) - 0.5));
  solo *= 1.0 - rachadura * 0.32 * smoothstep(0.42, 0.66, n1);
  solo *= 0.9 + n3 * 0.14;
  vec2 grao = fract(w * 5.0) - 0.5;
  float pedrinha = step(0.94, hash(floor(w * 5.0))) * smoothstep(0.32, 0.12, length(grao));
  solo = mix(solo, solo * 0.62, pedrinha);

  float r = rocha(w);
  float pedraMascara = smoothstep(0.40, 0.56, r + (fbm(w * 0.9) - 0.5) * 0.35);
  float e = 0.45;
  float gx = rocha(w + vec2(e, 0)) - rocha(w - vec2(e, 0));
  float gy = rocha(w + vec2(0, e)) - rocha(w - vec2(0, e));
  vec3 normal = normalize(vec3(-gx * 2.2, -gy * 2.2, 1.0));
  float difusa = clamp(dot(normal, uSol.xyz), 0.0, 1.0);
  vec3 pedra = mix(vec3(0.40, 0.34, 0.29), vec3(0.63, 0.56, 0.48), fbm(w * 0.9 + 9.1));
  pedra *= 0.5 + difusa * 0.75;
  pedra *= 0.82 + ruido(w * 6.0) * 0.3;
  pedra = mix(pedra, pedra * 0.7, smoothstep(0.55, 0.7, fbm(w * 2.6)) * 0.6);
  float sombra = smoothstep(0.35, 0.7, rocha(w + normalize(uSol.xy) * 1.2)) * (1.0 - pedraMascara);
  solo *= 1.0 - sombra * 0.42;
  vec3 c = mix(solo, pedra, pedraMascara);

  vec2 d = 0.75 / uDimMapa.xy;
  float f = texture(uNeblina, uv).r * 2.0
    + texture(uNeblina, uv + vec2(d.x, 0)).r + texture(uNeblina, uv - vec2(d.x, 0)).r
    + texture(uNeblina, uv + vec2(0, d.y)).r + texture(uNeblina, uv - vec2(0, d.y)).r;
  f /= 6.0;
  float vista = smoothstep(0.08, 0.42, f);
  float visivel = smoothstep(0.62, 0.95, f);
  vec3 cinza = vec3(dot(c, vec3(0.3, 0.59, 0.11)));
  vec3 comNeblina = mix(mix(cinza, c, 0.35) * 0.48, c, visivel);
  comNeblina = mix(vec3(0.025, 0.022, 0.02), comNeblina, vista);
  if (any(lessThan(w, vec2(0.0))) || any(greaterThan(w, uDimMapa.xy))) comNeblina = vec3(0.02);
  cor = vec4(comNeblina, 1.0);
}`;

// Sprite instance: aPosicao = (x, y, height in metres, scale), aDados = (frame, team, shadow height in metres, alpha).
// The frame table holds two texels per frame: (layer, x, y, width) and (height, offsetX, offsetY, px per cell of the level).
const SPRITE_VERT_COMUM = `
layout(location = 0) in vec2 aCanto;
layout(location = 1) in vec4 aPosicao;
layout(location = 2) in vec4 aDados;
uniform highp sampler2D uQuadros;
uniform vec2 uTamanhoCamada;
out vec3 vUV;
flat out int vTime;
flat out float vAlfa;
void quadroDoSprite(vec2 deslocamentoMundo, out vec2 tela) {
  int q = int(aDados.x) * 2;
  vec4 a = texelFetch(uQuadros, ivec2(q & 255, q >> 8), 0);
  vec4 b = texelFetch(uQuadros, ivec2((q & 255) + 1, q >> 8), 0);
  float k = uCamPx.z / b.w * aPosicao.w;
  vec2 ancora = projetar(vec3(aPosicao.xy + deslocamentoMundo, aPosicao.z));
  vec2 tamanho = vec2(a.w, b.x);
  tela = ancora + (b.yz + aCanto * tamanho) * k;
  vUV = vec3((a.yz + aCanto * tamanho) / uTamanhoCamada, a.x);
  vTime = int(aDados.y);
  vAlfa = aDados.w;
}
`;

export const VERT_SPRITE = `${CABECALHO}${SPRITE_VERT_COMUM}
void main() {
  vec2 tela;
  quadroDoSprite(vec2(0.0), tela);
  gl_Position = paraClip(tela);
}`;

export const FRAG_SPRITE = `${CABECALHO}
uniform sampler2DArray uCor;
uniform sampler2DArray uTime;
in vec3 vUV;
flat in int vTime;
flat in float vAlfa;
out vec4 cor;
void main() {
  vec4 c = texture(uCor, vUV);
  float m = texture(uTime, vUV).r;
  vec3 tingido = mix(c.rgb, c.rgb * uCores[vTime & 7].rgb * uDimMapa.z, m);
  cor = vec4(tingido, c.a) * vAlfa;
}`;

// Shadow derived from the sprite's alpha, slid along the ground away from the sun by the shadow height.
export const VERT_SOMBRA = `${CABECALHO}${SPRITE_VERT_COMUM}
void main() {
  vec2 longeDoSol = -normalize(uSol.xy) * (aDados.z / uRes.w) * length(uSol.xy) / max(uSol.z, 0.2);
  vec2 tela;
  quadroDoSprite(longeDoSol, tela);
  gl_Position = paraClip(tela);
}`;

export const FRAG_SOMBRA = `${CABECALHO}
uniform sampler2DArray uCor;
in vec3 vUV;
flat in int vTime;
flat in float vAlfa;
out vec4 cor;
void main() {
  cor = vec4(0.0, 0.0, 0.0, texture(uCor, vUV).a * 0.32 * vAlfa);
}`;

// Ground ring under a unit: aPosicao = (x, y, radius in cells, line width in px), aDados = rgba.
export const VERT_ANEL = `${CABECALHO}
layout(location = 0) in vec2 aCanto;
layout(location = 1) in vec4 aPosicao;
layout(location = 2) in vec4 aDados;
out vec2 vLocal;
flat out vec4 vCor;
flat out float vRaioPx;
flat out float vLinha;
void main() {
  float raio = aPosicao.z * 1.12;
  vec2 canto = aCanto * 2.0 - 1.0;
  vec2 tela = projetar(vec3(aPosicao.xy + canto * raio, 0.0));
  gl_Position = paraClip(tela);
  vLocal = canto * raio * uCamPx.z;
  vRaioPx = aPosicao.z * uCamPx.z;
  vLinha = aPosicao.w;
  vCor = aDados;
}`;

export const FRAG_ANEL = `${CABECALHO}
in vec2 vLocal;
flat in vec4 vCor;
flat in float vRaioPx;
flat in float vLinha;
out vec4 cor;
void main() {
  float d = abs(length(vLocal) - vRaioPx) - vLinha * 0.5;
  float a = 1.0 - smoothstep(-0.75, 0.75, d);
  cor = vec4(vCor.rgb, 1.0) * vCor.a * a;
}`;

// Health bar in screen space over a map point: aPosicao = (x, y, height in metres, health 0..1),
// aDados = (width in cells, team, alpha, unused). Drawn at native resolution after the upscale.
export const VERT_BARRA = `${CABECALHO}
layout(location = 0) in vec2 aCanto;
layout(location = 1) in vec4 aPosicao;
layout(location = 2) in vec4 aDados;
out vec2 vLocal;
flat out vec2 vTamanho;
flat out float vVida;
flat out float vAlfa;
void main() {
  vec2 ancora = projetar(aPosicao.xyz);
  vec2 tamanho = vec2(aDados.x * uCamPx.z, max(4.0, uCamPx.z * 0.07));
  tamanho = floor(tamanho + 0.5);
  vec2 inicio = floor(ancora - vec2(tamanho.x * 0.5, tamanho.y + uCamPx.z * 0.06) + 0.5);
  gl_Position = paraClip(inicio + aCanto * tamanho);
  vLocal = aCanto * tamanho;
  vTamanho = tamanho;
  vVida = aPosicao.w;
  vAlfa = aDados.z;
}`;

export const FRAG_BARRA = `${CABECALHO}
in vec2 vLocal;
flat in vec2 vTamanho;
flat in float vVida;
flat in float vAlfa;
out vec4 cor;
void main() {
  float borda = max(1.0, floor(vTamanho.y * 0.2));
  vec2 dentro = vLocal - borda;
  vec2 tamanhoDentro = vTamanho - 2.0 * borda;
  vec3 c = vec3(0.06);
  if (all(greaterThanEqual(dentro, vec2(0.0))) && all(lessThan(dentro, tamanhoDentro))) {
    vec3 cheio = vVida > 0.5 ? mix(vec3(0.95, 0.8, 0.15), vec3(0.3, 0.9, 0.3), (vVida - 0.5) * 2.0) : mix(vec3(0.9, 0.18, 0.1), vec3(0.95, 0.8, 0.15), vVida * 2.0);
    c = dentro.x < tamanhoDentro.x * vVida ? cheio : vec3(0.16, 0.14, 0.12);
  }
  cor = vec4(c, 1.0) * vAlfa;
}`;

// Presentation effects: aPosicao = (ax, ay, bx, by), aDados = (kind, age 0..1, size in cells, seed).
// Kinds: 0 tracer from a to b, 1 muzzle flash, 2 explosion, 3 smoke, 4 scorch mark, 5 order marker.
export const VERT_EFEITO = `${CABECALHO}
layout(location = 0) in vec2 aCanto;
layout(location = 1) in vec4 aPosicao;
layout(location = 2) in vec4 aDados;
out vec2 vLocal;
flat out vec4 vDados;
void main() {
  vec2 canto = aCanto * 2.0 - 1.0;
  float tipo = aDados.x;
  vec2 tela;
  if (tipo < 0.5) {
    vec2 a = projetar(vec3(aPosicao.xy, 1.0));
    vec2 b = projetar(vec3(aPosicao.zw, 1.0));
    vec2 eixo = b - a;
    vec2 dir = eixo / max(length(eixo), 0.001);
    tela = a + eixo * aCanto.x + vec2(-dir.y, dir.x) * canto.y * 0.07 * uCamPx.z;
  } else if (tipo > 3.5) {
    tela = projetar(vec3(aPosicao.xy + canto * aDados.z, 0.0));
  } else {
    vec2 centro = aPosicao.xy + aPosicao.zw * aDados.y;
    float altura = tipo < 1.5 ? 1.2 : tipo < 2.5 ? 0.8 : 1.5 + aDados.y * 4.0;
    tela = projetar(vec3(centro, altura)) + canto * aDados.z * uCamPx.z;
  }
  gl_Position = paraClip(tela);
  vLocal = canto;
  vDados = aDados;
}`;

export const FRAG_EFEITO = `${CABECALHO}${RUIDO}
in vec2 vLocal;
flat in vec4 vDados;
out vec4 cor;
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

// Upscale of the scaled scene to the canvas: bilinear plus a light 5-tap sharpen that grows as the scale drops.
export const FRAG_AMPLIAR = `${CABECALHO}
uniform sampler2D uCena;
uniform vec2 uSaida;
uniform float uNitidez;
out vec4 cor;
void main() {
  vec2 uv = gl_FragCoord.xy / uSaida;
  vec2 t = 1.0 / vec2(textureSize(uCena, 0));
  vec3 c = texture(uCena, uv).rgb;
  vec3 vizinhos = texture(uCena, uv + vec2(t.x, 0)).rgb + texture(uCena, uv - vec2(t.x, 0)).rgb
    + texture(uCena, uv + vec2(0, t.y)).rgb + texture(uCena, uv - vec2(0, t.y)).rgb;
  cor = vec4(clamp(c + (c * 4.0 - vizinhos) * uNitidez, 0.0, 1.0), 1.0);
}`;

// Placeholder sprites drawn on the GPU into the sprite layers (colour and team mask at once) for unit types
// that have no art yet: the prototype's top-down shapes, rotated in map space and foreshortened like the camera.
// Each frame cell is uCelula px wide and shows uCelula / uPxNivel cells; the anchor is the cell centre.
export const FRAG_FICHA = `${CABECALHO}
uniform vec2 uOrigem;      // top-left pixel of the frame cell in the layer
uniform float uCelula;     // frame cell size in px
uniform float uPxNivel;    // px per cell the frames are drawn at
uniform float uAngulo;     // map angle of this frame, radians clockwise on screen from east
uniform int uForma;        // 0 light vehicle body, 1 tank body, 2 light vehicle gun, 3 tank turret
layout(location = 0) out vec4 cor;
layout(location = 1) out vec4 time;
float caixa(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main() {
  vec2 local = (gl_FragCoord.xy - uOrigem - uCelula * 0.5) / uPxNivel;
  local.y = local.y / uCamPx.w;
  float c0 = cos(uAngulo), s0 = sin(uAngulo);
  vec2 p = vec2(c0 * local.x + s0 * local.y, -s0 * local.x + c0 * local.y);
  float dist;
  vec3 c = vec3(0.16);
  float mascara = 0.0;
  if (uForma == 1) {
    float esteira = min(caixa(p - vec2(0.0, 0.27), vec2(0.47, 0.1), 0.03), caixa(p + vec2(0.0, 0.27), vec2(0.47, 0.1), 0.03));
    float casco = caixa(p, vec2(0.40, 0.24), 0.07);
    dist = min(esteira, casco);
    c = mix(vec3(0.16), vec3(0.24), step(0.5, fract(p.x * 9.0)));
    if (casco < 0.0) c = mix(vec3(0.46, 0.42, 0.33), vec3(0.56, 0.5, 0.38), smoothstep(-0.2, 0.2, p.x));
    if (casco < 0.0 && abs(p.y) < 0.07) mascara = 1.0;
  } else if (uForma == 3) {
    float torre = length(p + vec2(0.04, 0.0)) - 0.17;
    float cano = caixa(p - vec2(0.3, 0.0), vec2(0.22, 0.035), 0.012);
    dist = min(torre, cano);
    c = torre < 0.0 ? vec3(0.55) : vec3(0.2);
    mascara = torre < 0.0 ? smoothstep(0.17, -0.05, length(p + vec2(0.08, 0.06))) : 0.0;
  } else if (uForma == 0) {
    float chassi = caixa(p, vec2(0.30, 0.15), 0.07);
    float rodas = min(min(caixa(p - vec2(0.2, 0.19), vec2(0.09, 0.05), 0.02), caixa(p - vec2(-0.2, 0.19), vec2(0.09, 0.05), 0.02)),
                      min(caixa(p - vec2(0.2, -0.19), vec2(0.09, 0.05), 0.02), caixa(p - vec2(-0.2, -0.19), vec2(0.09, 0.05), 0.02)));
    float gaiola = abs(caixa(p + vec2(0.04, 0.0), vec2(0.13, 0.11), 0.03)) - 0.018;
    dist = min(min(chassi, rodas), gaiola);
    c = vec3(0.12);
    if (chassi < 0.0) { c = vec3(0.55); mascara = 0.55; }
    if (gaiola < 0.0) { c = vec3(0.25, 0.22, 0.2); mascara = 0.0; }
  } else {
    dist = caixa(p - vec2(0.14, 0.0), vec2(0.15, 0.022), 0.01);
    c = vec3(0.18);
  }
  c *= 0.85 + 0.25 * clamp(-(local.x + local.y) * 0.9, -0.5, 0.5);
  float largura = 1.2 / uPxNivel;
  c = mix(c, vec3(0.05), smoothstep(-largura * 1.6, -largura * 0.2, dist));
  float a = 1.0 - smoothstep(-largura * 0.5, largura * 0.5, dist);
  cor = vec4(c * a, a);
  time = vec4(mascara * a, 0.0, 0.0, 1.0);
}`;
