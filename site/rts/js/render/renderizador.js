// The game renderer: owns the WebGL2 backend, the projection, the dynamic render scale, the sprite sheets, the
// unit and effect instance builders, and the frame plan. The page gives it the camera once ({ x, y, zoom }, zoom
// being the factor of projecao.json, which the page moves) and, every frame, the simulation state and the selection.
//
// Frame plan: scene at the render scale (terrain with fog, ground decals and order markers, selection rings,
// shadows, every sprite in one sorted draw, smoke, additive glow), upscale to the canvas, then health bars at
// native resolution so they stay crisp.
import { criarBackendWebGL2, FLOATS_QUADRO } from './backend-webgl2.js';
import { pxPorCelula, escolherNivel, mundoParaTela, telaParaMundo, areaVisivel } from './projecao.js';
import { criarControleDeEscala } from './escala.js';
import { criarFolhas } from './sprites.js';
import { criarMontagemUnidades } from './unidades.js';
import { criarEfeitos, EFEITO } from './efeitos.js';
import { carregarManifesto } from '../ativos/manifesto.js';
import { carregarPrototipo } from '../ativos/atlas.js';

export { EFEITO };

/**
 * @param {HTMLCanvasElement} canvas
 * @param {ReturnType<typeof import('./projecao.js').criarProjecao>} projecao
 * @param {{ camera: { x: number, y: number, zoom: number }, visivel: (x: number, y: number) => boolean, escalaFixa?: number | null }} opcoes
 */
export function criarRenderizador(canvas, projecao, { camera, visivel, escalaFixa = null }) {
  const backend = criarBackendWebGL2(canvas);
  const quadro = new Float32Array(FLOATS_QUADRO);
  // team colours are RGB triplets in projecao; the block wants vec4
  for (let t = 0; t < 8; t++) {
    quadro[16 + t * 4] = projecao.coresTime[t * 3];
    quadro[17 + t * 4] = projecao.coresTime[t * 3 + 1];
    quadro[18 + t * 4] = projecao.coresTime[t * 3 + 2];
    quadro[19 + t * 4] = 1;
  }
  const vista = { largura: canvas.width, altura: canvas.height, px: 1 };
  const area = new Float64Array(4);
  const alvo = new Float64Array(2);
  const ponto = new Float64Array(2);
  const camera0 = { x: 0, y: 0, zoom: 1 };
  let mapaLargura = 1;
  let mapaAltura = 1;

  const escala = criarControleDeEscala();
  if (escalaFixa !== null) escala.fixar(escalaFixa);
  const folhas = criarFolhas(backend, projecao, () => preencherQuadro(camera0, 1, vista.largura, vista.altura, 0));
  const unidades = criarMontagemUnidades({ projecao, folhas });
  const efeitos = criarEfeitos({ visivel });
  const estatisticas = { escala: 1, alvoLargura: 0, alvoAltura: 0, sprites: 0, gpuMs: -1, nivel: '' };

  function preencherQuadro(camera, px, largura, altura, tempo) {
    quadro[0] = camera.x;
    quadro[1] = camera.y;
    quadro[2] = px;
    quadro[3] = projecao.seno;
    quadro[4] = largura;
    quadro[5] = altura;
    quadro[6] = projecao.cosseno;
    quadro[7] = projecao.metrosPorCelula;
    quadro[8] = projecao.sol[0];
    quadro[9] = projecao.sol[1];
    quadro[10] = projecao.sol[2];
    quadro[11] = tempo;
    quadro[12] = mapaLargura;
    quadro[13] = mapaAltura;
    quadro[14] = projecao.fatorTime;
    quadro[15] = 0;
    return quadro;
  }

  folhas.adicionarFichas();

  /** Level of art for the current canvas: uhd unless hd would barely be magnified at the default zoom. */
  function nivelDoCanvas() {
    return escolherNivel(projecao, pxPorCelula(projecao, canvas.width, canvas.height, 1));
  }

  return {
    info: backend.info,
    projecao,
    vista,
    escala,
    efeitos,
    unidades,
    estatisticas,

    redimensionar(largura, altura) {
      backend.redimensionar(largura, altura);
      vista.largura = largura;
      vista.altura = altura;
    },

    /** @param {{ largura: number, altura: number, bloqueado: Uint8Array, relevo: Uint8Array }} mapa static map */
    definirMapa(mapa) {
      const rg = new Uint8Array(mapa.largura * mapa.altura * 2);
      for (let i = 0; i < mapa.largura * mapa.altura; i++) {
        rg[i * 2] = mapa.bloqueado[i] ? 255 : 0;
        rg[i * 2 + 1] = mapa.relevo[i];
      }
      backend.definirMapa(mapa.largura, mapa.altura, rg);
      mapaLargura = mapa.largura;
      mapaAltura = mapa.altura;
    },

    atualizarNeblina(visao) {
      backend.atualizarNeblina(visao);
    },

    /** Loads a sprite manifest (C9) at the level that suits the canvas. */
    async carregarManifesto(url) {
      const manifesto = await carregarManifesto(url);
      const folha = await folhas.adicionarManifesto(manifesto, nivelDoCanvas());
      estatisticas.nivel = folha.nivel;
      return folha;
    },

    /** Loads the prototype's Blender tank; resolves to null when it is missing. */
    async carregarPrototipo() {
      const manifesto = await carregarPrototipo();
      return manifesto ? folhas.adicionarManifesto(manifesto, 'uhd') : null;
    },

    folhas,

    /**
     * Draws one frame.
     * @param {{ agora: number, dt: number, estado: any, selecionadas: Set<number> }} p
     */
    desenhar({ agora, dt, estado, selecionadas }) {
      const s = escala.registrar(agora, dt);
      escala.informarGpu(backend.tempoDeGpuMs);
      vista.px = pxPorCelula(projecao, vista.largura, vista.altura, camera.zoom);
      areaVisivel(projecao, camera, vista, 0, area);
      unidades.montar({ estado, area, selecionadas, visivel, agora });
      const { nD, nF, nB } = efeitos.montar(agora);
      const tempo = agora / 1000;

      backend.comecarCena(s, alvo);
      backend.definirQuadroComum(preencherQuadro(camera, vista.px * (alvo[0] / vista.largura), alvo[0], alvo[1], tempo));
      backend.desenharTerreno();
      backend.desenharEfeitos(efeitos.decalques, nD, false);
      backend.desenharAneis(unidades.aneis.dados, unidades.aneis.n);
      backend.desenharSombras(unidades.sombras.dados, unidades.sombras.n);
      backend.desenharSprites(unidades.sprites.dados, unidades.sprites.n);
      backend.desenharEfeitos(efeitos.fumaca, nF, false);
      backend.desenharEfeitos(efeitos.brilho, nB, true);
      backend.terminarCena(Math.min(0.25, (1 - s) * 0.6));
      backend.definirQuadroComum(preencherQuadro(camera, vista.px, vista.largura, vista.altura, tempo));
      backend.desenharBarras(unidades.barras.dados, unidades.barras.n);
      backend.terminarQuadro();

      estatisticas.escala = s;
      estatisticas.alvoLargura = alvo[0];
      estatisticas.alvoAltura = alvo[1];
      estatisticas.sprites = unidades.sprites.n;
      estatisticas.gpuMs = backend.tempoDeGpuMs;
      return unidades.sprites.n;
    },

    /** Ground point under a pointer (client CSS pixels), in map cells, written into saida ([x, y]). */
    paraMundo(clienteX, clienteY, saida = [0, 0]) {
      const r = canvas.getBoundingClientRect();
      const k = vista.largura / r.width;
      vista.px = pxPorCelula(projecao, vista.largura, vista.altura, camera.zoom);
      return telaParaMundo(projecao, camera, vista, (clienteX - r.left) * k, (clienteY - r.top) * k, saida);
    },

    /** Map point (cells, height in metres) to client CSS pixels, written into saida ([x, y]). */
    paraTela(x, y, alturaMetros, saida = [0, 0]) {
      const r = canvas.getBoundingClientRect();
      vista.px = pxPorCelula(projecao, vista.largura, vista.altura, camera.zoom);
      mundoParaTela(projecao, camera, vista, x, y, alturaMetros, ponto);
      saida[0] = r.left + (ponto[0] * r.width) / vista.largura;
      saida[1] = r.top + (ponto[1] * r.height) / vista.altura;
      return saida;
    },

    /** Visible ground rectangle [x0, y0, x1, y1] in cells (minimap frame, culling). */
    areaVisivel(saida = [0, 0, 0, 0]) {
      vista.px = pxPorCelula(projecao, vista.largura, vista.altura, camera.zoom);
      return areaVisivel(projecao, camera, vista, 0, saida);
    },
  };
}
