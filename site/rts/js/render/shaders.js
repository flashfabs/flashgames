// GLSL ES 3.00 sources of the WebGL2 backend. Every program reads the per-pass uniform block Quadro, so the
// camera, the projection and the team colours are uploaded once per pass instead of once per program.
//
// Screen space is in pixels of the current render target, origin at the top-left, y down. A map point
// (x, y, height h in metres) lands at res/2 + ((x - cam.x) * px, (y - cam.y) * px * sin(e) - h * px * cos(e) / m).
//
// Terrain height comes from the fine height field (relevo.js) in uAltura. The terrain pass writes, per pixel, how close
// to the camera the terrain point it shows is (metres along the view); sprites, shadows, rings and effects test against
// it, so whatever stands behind a hill is hidden by it. Upright things (sprites, explosions) count as vertical cards
// over their anchor, flat things (shadows, rings, marks) as lying on the ground.

const CABECALHO = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DArray;
layout(std140) uniform Quadro {
  vec4 uCamPx;   // camera x, camera y (cells), px per cell, sin(elevation)
  vec4 uRes;     // target width, target height, cos(elevation), metres per cell
  vec4 uSol;     // towards the sun in map axes (x east, y south, z up), time in seconds
  vec4 uDimMapa; // map width, map height (cells), team tint factor, build area shown (1) or not (0)
  vec4 uRelevo;  // highest terrain (m), cells north per metre of height along the view ray, unused, unused
  vec4 uCores[8];
};
uniform sampler2D uAltura;
float alturaEm(vec2 w) { return textureLod(uAltura, w / uDimMapa.xy, 0.0).r * uRelevo.x; }
vec2 projetar(vec3 p) {
  return uRes.xy * 0.5 + vec2((p.x - uCamPx.x) * uCamPx.z, (p.y - uCamPx.y) * uCamPx.z * uCamPx.w - p.z * uCamPx.z * uRes.z / uRes.w);
}
// Closeness of a map point to the camera, in metres along the view direction (relative to the camera's ground point).
float proximidade(vec3 p) { return (p.y - uCamPx.y) * uRes.w * uRes.z + p.z * uCamPx.w; }
float profundidade(float c) { return clamp(0.5 - c / 2048.0, 0.0, 1.0); }
vec4 paraClip(vec2 tela) {
  return vec4(tela.x / uRes.x * 2.0 - 1.0, 1.0 - tela.y / uRes.y * 2.0, 0.0, 1.0);
}
vec4 paraClipEm(vec2 tela, float c) {
  return vec4(tela.x / uRes.x * 2.0 - 1.0, 1.0 - tela.y / uRes.y * 2.0, clamp(-c / 1024.0, -1.0, 1.0), 1.0);
}
// Metres of closeness gained per screen pixel up an upright card, and per pixel down the ground.
float cartaoPorPx() { return uRes.w / uCamPx.z * uCamPx.w / uRes.z; }
float chaoPorPx() { return uRes.w / uCamPx.z * uRes.z / uCamPx.w; }
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

// Terrain with height, fog of war and the depth the instanced passes test against. Each pixel follows its view ray
// down from the highest terrain its column can meet to the first terrain point (seguirRaio in projecao.js does the
// same steps for clicks); flat ground skips the march. The ground is the art's tileable texture when one is loaded
// (uCelulasPorLadrilho > 0) or procedural noise otherwise; rock and cliff faces stay procedural. Slopes and faces
// are lit by the sun and shaded by terrain between them and the sun.
export const FRAG_TERRENO = `${CABECALHO}${RUIDO}
uniform sampler2D uMapa;   // R blocked, G relief, B highest level the view ray can meet here, A highest level that can shade here
uniform sampler2D uNeblina;
uniform sampler2D uLadrilho;
uniform sampler2D uArea;   // R = 1 where the local player may build
uniform float uCelulasPorLadrilho;
out vec4 cor;
float rocha(vec2 w) { return texture(uMapa, w / uDimMapa.xy).r; }
vec4 limites(vec2 w) { return texelFetch(uMapa, clamp(ivec2(floor(w)), ivec2(0), ivec2(uDimMapa.xy) - 1), 0); }

vec3 seguirRaio(vec2 w0, float topo) {
  float k = uRelevo.y;
  float passo = 0.125 / k;
  float hAnt = topo;
  float dAnt = hAnt - alturaEm(vec2(w0.x, w0.y + hAnt * k));
  if (dAnt <= 0.0) return vec3(w0.x, w0.y + hAnt * k, hAnt);
  for (int i = 1; i < 48; i++) {
    float h = max(0.0, topo - float(i) * passo);
    float d = h - alturaEm(vec2(w0.x, w0.y + h * k));
    if (d <= 0.0) {
      float hit = mix(hAnt, h, dAnt / (dAnt - d));
      return vec3(w0.x, w0.y + hit * k, hit);
    }
    if (h <= 0.0) break;
    hAnt = h;
    dAnt = d;
  }
  return vec3(w0, 0.0);
}

vec3 normalDoTerreno(vec2 w) {
  float e = 0.2;
  float hx = alturaEm(w + vec2(e, 0.0)) - alturaEm(w - vec2(e, 0.0));
  float hy = alturaEm(w + vec2(0.0, e)) - alturaEm(w - vec2(0.0, e));
  return normalize(vec3(-hx, -hy, 2.0 * e * uRes.w));
}

// 1 in full sun, down to 0 where terrain stands between the point and the sun.
float luzDoSol(vec3 p) {
  vec2 dir = normalize(uSol.xy);
  float subida = uSol.z / length(uSol.xy) * uRes.w;
  float luz = 1.0;
  for (int i = 1; i <= 8; i++) {
    float t = float(i) * 0.35;
    float acima = alturaEm(p.xy + dir * t) - (p.z + 0.15 + t * subida);
    luz = min(luz, 1.0 - smoothstep(0.0, 1.0, acima));
  }
  return luz;
}

void main() {
  vec2 tela = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 w0 = uCamPx.xy + vec2((tela.x - uRes.x * 0.5) / uCamPx.z, (tela.y - uRes.y * 0.5) / (uCamPx.z * uCamPx.w));
  vec4 lim = limites(w0);
  vec3 p = lim.b > 0.0 ? seguirRaio(w0, lim.b * uRelevo.x) : vec3(w0, 0.0);
  vec2 w = p.xy;
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
  if (uCelulasPorLadrilho > 0.0) solo = texture(uLadrilho, w / uCelulasPorLadrilho).rgb * (0.94 + (n1 - 0.5) * 0.16);
  // higher ground reads a little lighter, so the levels separate even under flat light
  solo *= 1.0 + p.z * 0.012;

  float r = rocha(w);
  float pedraMascara = smoothstep(0.40, 0.56, r + (fbm(w * 0.9) - 0.5) * 0.35);
  float e = 0.45;
  float gx = rocha(w + vec2(e, 0)) - rocha(w - vec2(e, 0));
  float gy = rocha(w + vec2(0, e)) - rocha(w - vec2(0, e));
  vec3 normalRocha = normalize(vec3(-gx * 2.2, -gy * 2.2, 1.0));
  float difusa = clamp(dot(normalRocha, uSol.xyz), 0.0, 1.0);
  vec3 pedra = mix(vec3(0.40, 0.34, 0.29), vec3(0.63, 0.56, 0.48), fbm(w * 0.9 + 9.1));
  pedra *= 0.5 + difusa * 0.75;
  pedra *= 0.82 + ruido(w * 6.0) * 0.3;
  pedra = mix(pedra, pedra * 0.7, smoothstep(0.55, 0.7, fbm(w * 2.6)) * 0.6);
  float sombraRocha = smoothstep(0.35, 0.7, rocha(w + normalize(uSol.xy) * 1.2)) * (1.0 - pedraMascara);
  solo *= 1.0 - sombraRocha * 0.42;
  vec3 c = mix(solo, pedra, pedraMascara);

  // slopes, cliff faces and the shade of higher ground, only where there is relief nearby
  vec4 limP = limites(w);
  if (lim.b > 0.0 || limP.a > 0.0) {
    vec3 n = normalDoTerreno(w);
    float ingreme = smoothstep(0.42, 0.72, 1.0 - n.z);
    vec3 face = mix(vec3(0.36, 0.31, 0.27), vec3(0.55, 0.49, 0.42), ruido(vec2(w.x * 2.3, p.z * 1.4)));
    face *= 0.85 + 0.3 * ruido(vec2(w.x * 7.0, p.z * 5.0));
    c = mix(c, face, ingreme);
    float luz = clamp(0.64 + 0.36 * clamp(dot(n, uSol.xyz), 0.0, 1.0) / uSol.z, 0.55, 1.12);
    if (limP.a * uRelevo.x > p.z + 0.2) luz *= mix(0.68, 1.0, luzDoSol(p));
    c *= luz;
  }

  if (uDimMapa.w > 0.5 && texture(uArea, uv).r < 0.5) c = mix(c * 0.55, vec3(0.32, 0.08, 0.06), 0.18);

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
  gl_FragDepth = profundidade(proximidade(p));
}`;

// Sprite instance: aPosicao = (x, y, height in metres over the ground plane, scale), aDados = (frame, packed, shadow
// height in metres, alpha). packed = team | build progress << 3 | flags << 11 | depth bias in quarter cells << 15
// (empacotar() in sprites.js): progress 0 is a finished sprite, 1..255 shows it rising out of scaffolding; flags are
// FLAGS_SPRITE. A negative alpha draws the sprite additively (lights, glow) in the same sorted draw: premultiplied
// colour with zero alpha adds to what is behind.
// The frame table holds two texels per frame: (layer, x, y, width) and (height, offsetX, offsetY, px per cell of the level).
const SPRITE_VERT_COMUM = `
layout(location = 0) in vec2 aCanto;
layout(location = 1) in vec4 aPosicao;
layout(location = 2) in vec4 aDados;
uniform highp sampler2D uQuadros;
uniform vec2 uTamanhoCamada;
out vec3 vUV;
out float vAcima;      // screen px above the anchor (negative below)
out float vLocalY;     // 0 at the top of the frame, 1 at the bottom
flat out int vTime;
flat out int vBandeiras;
flat out float vProgresso;
flat out float vAlfa;
flat out float vProx;  // closeness of the anchor plus the bias, metres
void quadroDoSprite(vec2 deslocamentoMundo, out vec2 tela) {
  int q = int(aDados.x) * 2;
  vec4 a = texelFetch(uQuadros, ivec2(q & 255, q >> 8), 0);
  vec4 b = texelFetch(uQuadros, ivec2((q & 255) + 1, q >> 8), 0);
  float k = uCamPx.z / b.w * aPosicao.w;
  vec3 ancora3 = vec3(aPosicao.xy + deslocamentoMundo, aPosicao.z);
  vec2 ancora = projetar(ancora3);
  vec2 tamanho = vec2(a.w, b.x);
  tela = ancora + (b.yz + aCanto * tamanho) * k;
  vUV = vec3((a.yz + aCanto * tamanho) / uTamanhoCamada, a.x);
  int empacotado = int(aDados.y + 0.5);
  vTime = empacotado & 7;
  int progresso = (empacotado >> 3) & 255;
  vProgresso = progresso == 0 ? 1.0 : float(progresso) / 255.0;
  vBandeiras = (empacotado >> 11) & 15;
  float vies = (float((empacotado >> 15) & 63) * 0.25 + 0.25) * uRes.w * uRes.z;
  vAlfa = aDados.w;
  vAcima = ancora.y - tela.y;
  vLocalY = aCanto.y;
  vProx = proximidade(ancora3) + vies;
}
`;

// Flags of a sprite (packed into aDados.y): remembered under the fog (grey), placement ghost (valid, invalid).
export const FLAGS_SPRITE = Object.freeze({ MEMORIA: 1, FANTASMA: 2, INVALIDO: 4 });

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
in float vAcima;
in float vLocalY;
flat in int vTime;
flat in int vBandeiras;
flat in float vProgresso;
flat in float vAlfa;
flat in float vProx;
out vec4 cor;
void main() {
  vec4 c = texture(uCor, vUV);
  float m = texture(uTime, vUV).r;
  vec4 s = vec4(mix(c.rgb, c.rgb * uCores[vTime].rgb * uDimMapa.z, m), c.a);
  if (vProgresso < 1.0 && 1.0 - vLocalY > vProgresso) {
    // above the rising line only the scaffolding shows, over the building's silhouette
    vec2 g = gl_FragCoord.xy / max(uCamPx.z * 0.16, 3.0);
    float barra = max(step(0.82, fract(g.x)), step(0.88, fract(g.y + 0.5 * floor(g.x))));
    s = vec4(vec3(0.66, 0.6, 0.5), 1.0) * c.a * barra * 0.7 + s * 0.1;
  }
  if ((vBandeiras & 1) != 0) s.rgb = vec3(dot(s.rgb, vec3(0.3, 0.59, 0.11))) * 0.55;
  if ((vBandeiras & 6) != 0) s.rgb = mix(s.rgb, ((vBandeiras & 4) != 0 ? vec3(1.0, 0.22, 0.16) : vec3(0.3, 1.0, 0.42)) * s.a, 0.5);
  cor = vAlfa < 0.0 ? vec4(s.rgb * -vAlfa, 0.0) : s * vAlfa;
  // upright above the anchor, lying on the ground below it
  gl_FragDepth = profundidade(vProx + (vAcima > 0.0 ? vAcima * cartaoPorPx() : -vAcima * chaoPorPx()));
}`;

// Shadow of a sprite. With a shadow height (aDados.z >= 0) it is derived from the sprite's alpha, slid along the
// ground away from the sun by that height; with aDados.z < 0 it is the rendered shadow layer of the sheet, drawn
// in place (the art renders it from the same camera, so it already lies on the ground). Either way it lies flat.
export const VERT_SOMBRA = `${CABECALHO}${SPRITE_VERT_COMUM}
flat out float vCamada;
void main() {
  float altura = max(aDados.z, 0.0);
  vec2 longeDoSol = -normalize(uSol.xy) * (altura / uRes.w) * length(uSol.xy) / max(uSol.z, 0.2);
  vec2 tela;
  quadroDoSprite(longeDoSol, tela);
  gl_Position = paraClipEm(tela, vProx - vAcima * chaoPorPx());
  vCamada = aDados.z < 0.0 ? 1.0 : 0.0;
}`;

export const FRAG_SOMBRA = `${CABECALHO}
uniform sampler2DArray uCor;
uniform sampler2DArray uSombra;
in vec3 vUV;
in float vLocalY;
flat in float vProgresso;
flat in float vAlfa;
flat in float vCamada;
out vec4 cor;
void main() {
  float a = vCamada > 0.5 ? texture(uSombra, vUV).r * 0.6 : texture(uCor, vUV).a * 0.32;
  // a building going up casts only the part already built
  if (vProgresso < 1.0 && 1.0 - vLocalY > vProgresso) a *= 0.25;
  cor = vec4(0.0, 0.0, 0.0, a * vAlfa);
}`;

// Ground ring under a unit: aPosicao = (x, y, radius in cells, line width in px), aDados = rgba. It lies flat at the
// terrain height under its centre.
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
  vec3 p = vec3(aPosicao.xy + canto * raio, alturaEm(aPosicao.xy));
  gl_Position = paraClipEm(projetar(p), proximidade(p) + uRes.w * 0.5);
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

// Footprint of a building on the ground (placement ghost): aPosicao = (x, y of the north-west corner, width, height in
// cells), aDados = rgba. Filled with a darker border and a cell grid, lying on the terrain.
export const VERT_PEGADA = `${CABECALHO}
layout(location = 0) in vec2 aCanto;
layout(location = 1) in vec4 aPosicao;
layout(location = 2) in vec4 aDados;
out vec2 vCelulas;
flat out vec2 vTamanho;
flat out vec4 vCor;
void main() {
  vec2 w = aPosicao.xy + aCanto * aPosicao.zw;
  vec3 p = vec3(w, alturaEm(aPosicao.xy + aPosicao.zw * 0.5));
  gl_Position = paraClipEm(projetar(p), proximidade(p) + uRes.w * 0.5);
  vCelulas = aCanto * aPosicao.zw;
  vTamanho = aPosicao.zw;
  vCor = aDados;
}`;

export const FRAG_PEGADA = `${CABECALHO}
in vec2 vCelulas;
flat in vec2 vTamanho;
flat in vec4 vCor;
out vec4 cor;
void main() {
  vec2 borda = min(vCelulas, vTamanho - vCelulas);
  float linha = 1.0 - smoothstep(0.03, 0.07, min(borda.x, borda.y));
  vec2 f = abs(fract(vCelulas) - 0.5);
  float grade = 1.0 - smoothstep(0.46, 0.49, max(f.x, f.y));
  float a = vCor.a * (0.45 + 0.55 * linha) * (0.8 + 0.2 * grade);
  cor = vec4(vCor.rgb * a, a);
}`;

// Power cable hanging between two poles: aPosicao = (ax, ay, bx, by) in cells, aDados = (height of a, height of b in
// metres over the ground plane, live (1) or dead (0), team). A strip of SEGMENTOS_CABO segments along a sagging curve,
// a little over a pixel wide; live cables carry a slow glint.
export const SEGMENTOS_CABO = 12;
export const VERT_CABO = `${CABECALHO}
layout(location = 1) in vec4 aPosicao;
layout(location = 2) in vec4 aDados;
out float vLado;
flat out vec2 vEstado;
out float vAo;
vec3 pontoDoCabo(float t) {
  vec3 a = vec3(aPosicao.xy, aDados.x);
  vec3 b = vec3(aPosicao.zw, aDados.y);
  float vao = length(b.xy - a.xy) * uRes.w;
  vec3 p = mix(a, b, t);
  p.z -= 4.0 * t * (1.0 - t) * min(2.2, 0.035 * vao + 0.25);
  return p;
}
void main() {
  float t = float(gl_VertexID >> 1) / ${SEGMENTOS_CABO}.0;
  float lado = float(gl_VertexID & 1) * 2.0 - 1.0;
  vec3 p = pontoDoCabo(t);
  vec2 tela = projetar(p);
  vec2 eixo = projetar(pontoDoCabo(min(1.0, t + 0.02))) - projetar(pontoDoCabo(max(0.0, t - 0.02)));
  vec2 normal = normalize(vec2(-eixo.y, eixo.x) + 1e-6);
  float largura = max(1.1, uCamPx.z * 0.012);
  gl_Position = paraClipEm(tela + normal * lado * largura, proximidade(p) + uRes.w * 0.3);
  vLado = lado;
  vEstado = aDados.zw;
  vAo = t * length(aPosicao.zw - aPosicao.xy);
}`;

export const FRAG_CABO = `${CABECALHO}
in float vLado;
flat in vec2 vEstado;
in float vAo;
out vec4 cor;
void main() {
  float a = 1.0 - smoothstep(0.35, 1.0, abs(vLado));
  vec3 c = vec3(0.07, 0.07, 0.08);
  if (vEstado.x > 0.5) {
    float brilho = smoothstep(0.92, 1.0, fract(vAo * 0.25 - uSol.w * 0.6));
    c = mix(vec3(0.16, 0.15, 0.12), uCores[int(vEstado.y) & 7].rgb, 0.25) + vec3(1.0, 0.9, 0.55) * brilho * 0.8;
  }
  cor = vec4(c * a, a);
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

// Presentation effects: aPosicao = (ax, ay, bx, by), aDados = (kind, age 0..1, size in cells, seed); heights are over
// the terrain under each effect.
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
  float c;
  if (tipo < 0.5) {
    vec3 a = vec3(aPosicao.xy, alturaEm(aPosicao.xy) + 1.0);
    vec3 b = vec3(aPosicao.zw, alturaEm(aPosicao.zw) + 1.0);
    vec2 ta = projetar(a);
    vec2 eixo = projetar(b) - ta;
    vec2 dir = eixo / max(length(eixo), 0.001);
    tela = ta + eixo * aCanto.x + vec2(-dir.y, dir.x) * canto.y * 0.07 * uCamPx.z;
    c = proximidade(mix(a, b, aCanto.x));
  } else if (tipo > 3.5) {
    vec3 p = vec3(aPosicao.xy + canto * aDados.z, alturaEm(aPosicao.xy));
    tela = projetar(p);
    c = proximidade(p);
  } else {
    vec2 centro = aPosicao.xy + aPosicao.zw * aDados.y;
    float altura = tipo < 1.5 ? 1.2 : tipo < 2.5 ? 0.8 : 1.5 + aDados.y * 4.0;
    vec3 p = vec3(centro, alturaEm(centro) + altura);
    tela = projetar(p) + canto * aDados.z * uCamPx.z;
    // an upright card over its centre
    c = proximidade(p) - canto.y * aDados.z * uCamPx.z * cartaoPorPx();
  }
  gl_Position = paraClipEm(tela, c + uRes.w * 0.4);
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
