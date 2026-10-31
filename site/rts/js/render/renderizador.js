// The game renderer: owns the WebGL2 backend, the projection, the dynamic render scale, the sprite sheets, the
// unit and effect instance builders, and the frame plan. The page gives it the camera once ({ x, y, zoom }, zoom
// being the factor of projecao.json, which the page moves) and, every frame, the simulation state and the selection.
//
// Frame plan: scene at the render scale (terrain with height and fog, ground decals and order markers, building
// footprints, selection rings, shadows, every sprite in one sorted draw, power cables, smoke, additive glow), upscale
// to the canvas, then health bars at native resolution so they stay crisp.
import { criarBackendWebGL2, FLOATS_QUADRO, INICIO_CORES_QUADRO } from './backend-webgl2.js';
import { pxPorCelula, escolherNivel, mundoParaTela, telaParaMundo, areaVisivel } from './projecao.js';
import { criarControleDeEscala, DEGRAUS } from './escala.js';
import { criarFolhas } from './sprites.js';
import { criarMontagemUnidades, aparenciasDosTipos, CATEGORIA } from './unidades.js';
import { criarEfeitos, EFEITO } from './efeitos.js';
import { criarRelevo, limitesPorCelula } from './relevo.js';
import { soloDoMapa, tabelaDeSolos, LADRILHO_BASE, prefixoLadrilho } from './solos.js';
import { carregarManifesto, lerManifestoTerreno, carregarImagem } from '../ativos/manifesto.js';
import { carregarPrototipo } from '../ativos/atlas.js';
import { carregarIndice } from '../ativos/indice.js';

export { EFEITO };

/**
 * @param {HTMLCanvasElement} canvas
 * @param {ReturnType<typeof import('./projecao.js').criarProjecao>} projecao
 * @param {{
 *   camera: { x: number, y: number, zoom: number }, visivel: (x: number, y: number) => boolean, escalaFixa?: number | null,
 *   terreno?: 'ladrilhos' | 'procedural',
 * }} opcoes terreno: ground splatted from the art's tiles by soil (the default, once a tile arrives) or procedural
 */
export function criarRenderizador(canvas, projecao, { camera, visivel, escalaFixa = null, terreno = 'ladrilhos' }) {
  const backend = criarBackendWebGL2(canvas);
  const quadro = new Float32Array(FLOATS_QUADRO);
  // team colours are RGB triplets in projecao; the block wants vec4
  for (let t = 0; t < 8; t++) {
    quadro[INICIO_CORES_QUADRO + t * 4] = projecao.coresTime[t * 3];
    quadro[INICIO_CORES_QUADRO + 1 + t * 4] = projecao.coresTime[t * 3 + 1];
    quadro[INICIO_CORES_QUADRO + 2 + t * 4] = projecao.coresTime[t * 3 + 2];
    quadro[INICIO_CORES_QUADRO + 3 + t * 4] = 1;
  }
  const vista = { largura: canvas.width, altura: canvas.height, px: 1 };
  const area = new Float64Array(4);
  const alvo = new Float64Array(2);
  const ponto = new Float64Array(2);
  const camera0 = { x: 0, y: 0, zoom: 1 };
  let mapaLargura = 1;
  let mapaAltura = 1;
  /** @type {ReturnType<typeof criarRelevo> | null} */
  let relevo = null;
  // cells the view of a raised point can come from south of the visible ground
  const margemDoRelevo = () => (relevo ? relevo.alturaMaxima * projecao.celulasPorMetroDeAltura : 0);
  /** @type {Uint8Array | null} build area scaled for the texture */
  let areaConstrucao = null;
  let tiposAtuais = null;
  // soil names of the map, the tile layer of each soil that has its own tile, and how many tiles repeat per cell
  let nomesSolos = [LADRILHO_BASE];
  let camadasLadrilho = new Map();
  let celulasPorLadrilho = 8;
  let modoTerreno = terreno;
  let ladrilhosPedidos = false;

  function atualizarSolos() {
    backend.definirSolos(tabelaDeSolos(nomesSolos, camadasLadrilho), celulasPorLadrilho, modoTerreno === 'ladrilhos' && camadasLadrilho.size > 0 ? 1 : 0);
  }

  /**
   * Ground tiles for the map's soils, from the art index: the base tile and every `terreno-<soil>` it lists, all of
   * the base tile's size, in one texture array. Until they arrive the ground stays procedural.
   * @param {Map<string, string | URL>} urls tile manifest URL by soil name
   */
  async function carregarLadrilhos(urls, nivel) {
    const lidos = [];
    for (const [nome, url] of urls) {
      try {
        const resposta = await fetch(url);
        if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
        const manifesto = lerManifestoTerreno(await resposta.json(), resposta.url || url);
        const pagina = manifesto.niveis[nivel] ?? manifesto.niveis.uhd ?? manifesto.niveis.hd;
        lidos.push({ nome, manifesto, imagem: await carregarImagem(pagina.cor, true) });
      } catch (erro) {
        console.warn(`ladrilho de ${nome} indisponível`, erro);
      }
    }
    if (lidos.length === 0) return;
    const tamanho = lidos[0].imagem.width;
    const cabem = lidos.filter(l => l.imagem.width === tamanho && l.imagem.height === tamanho && l.manifesto.celulasPorLadrilho === lidos[0].manifesto.celulasPorLadrilho);
    backend.prepararLadrilhos(tamanho, cabem.length);
    camadasLadrilho = new Map();
    cabem.forEach((l, i) => {
      backend.enviarLadrilho(i, l.imagem);
      camadasLadrilho.set(l.nome, i);
    });
    for (const l of lidos) l.imagem.close();
    celulasPorLadrilho = lidos[0].manifesto.celulasPorLadrilho;
    atualizarSolos();
  }

  function pedirLadrilhos() {
    if (ladrilhosPedidos) return;
    ladrilhosPedidos = true;
    const nivel = nivelDoCanvas();
    carregarIndice()
      .then(indice => {
        const urls = new Map();
        for (const nome of [LADRILHO_BASE, ...nomesSolos]) {
          const url = indice.urlDo(prefixoLadrilho(nome));
          if (url && !urls.has(nome)) urls.set(nome, url);
        }
        return carregarLadrilhos(urls, nivel);
      })
      .catch(erro => console.warn('ladrilhos de terreno indisponíveis', erro));
  }

  /**
   * Kinds of the match (MapaEstatico.tipos): placeholders for the buildings, then the art of every kind the art
   * index lists, loaded in the background (each kind switches to its art as its sheet arrives).
   */
  function definirTipos(tipos) {
    if (tiposAtuais === tipos) return;
    tiposAtuais = tipos;
    const fixos = tipos.filter(t => t.categoria === CATEGORIA.PREDIO || t.categoria === CATEGORIA.ESTRUTURA || t.categoria === CATEGORIA.RECURSO);
    folhas.adicionarFichasPredios(fixos.filter(t => !folhas.folha(`ficha-${t.nome}`)), CATEGORIA.RECURSO);
    unidades.definirAparencias(aparenciasDosTipos(tipos));
    const nivel = nivelDoCanvas();
    carregarIndice()
      .then(indice =>
        Promise.all(
          [...new Set(tipos.map(t => t.asset).filter(Boolean))]
            .filter(asset => !folhas.folha(asset) && indice.urlDo(asset))
            .map(asset =>
              carregarManifesto(indice.urlDo(asset))
                .then(manifesto => folhas.adicionarManifesto(manifesto, nivel))
                .catch(erro => console.warn(`arte de ${asset} indisponível, fica a ficha`, erro)),
            ),
        ),
      )
      .catch(erro => console.warn('arte dos tipos indisponível', erro));
  }

  // drawing on the CPU, the scene starts at the lowest step and probes up only if the frames allow
  const escala = criarControleDeEscala({ degrauInicial: backend.info.software ? DEGRAUS.length - 1 : 0 });
  if (escalaFixa !== null) escala.fixar(escalaFixa);
  const folhas = criarFolhas(backend, projecao, () => preencherQuadro(camera0, 1, vista.largura, vista.altura, 0));
  const unidades = criarMontagemUnidades({ projecao, folhas, alturaEm: (x, y) => (relevo ? relevo.alturaEm(x, y) : 0) });
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
    quadro[15] = backend.areaVisivel ? 1 : 0;
    quadro[16] = relevo ? relevo.alturaMaxima : 0;
    quadro[17] = projecao.celulasPorMetroDeAltura;
    return quadro;
  }

  folhas.adicionarFichas();

  /** Level of art for the current canvas: uhd unless hd would barely be magnified at the default zoom. */
  function nivelDoCanvas() {
    return escolherNivel(projecao, pxPorCelula(projecao, canvas.width, canvas.height, 1));
  }

  // Frame plan shared by the game and the atlas viewer; listas holds sprites, sombras, aneis and barras.
  function desenharCena(agora, dt, listas) {
    const s = escala.registrar(agora, dt);
    const { nD, nF, nB } = efeitos.contagem;
    const tempo = agora / 1000;
    backend.comecarCena(s, alvo);
    backend.definirQuadroComum(preencherQuadro(camera, vista.px * (alvo[0] / vista.largura), alvo[0], alvo[1], tempo));
    backend.desenharTerreno();
    backend.desenharEfeitos(efeitos.decalques, nD, false);
    if (listas.pegadas) backend.desenharPegadas(listas.pegadas.dados, listas.pegadas.n);
    backend.desenharAneis(listas.aneis.dados, listas.aneis.n);
    backend.desenharSombras(listas.sombras.dados, listas.sombras.n);
    backend.desenharSprites(listas.sprites.dados, listas.sprites.n);
    if (listas.cabos) backend.desenharCabos(listas.cabos.dados, listas.cabos.n);
    backend.desenharEfeitos(efeitos.fumaca, nF, false);
    backend.desenharEfeitos(efeitos.brilho, nB, true);
    backend.terminarCena(Math.min(0.25, (1 - s) * 0.6));
    backend.definirQuadroComum(preencherQuadro(camera, vista.px, vista.largura, vista.altura, tempo));
    backend.desenharBarras(listas.barras.dados, listas.barras.n);
    backend.terminarQuadro();

    estatisticas.escala = s;
    estatisticas.alvoLargura = alvo[0];
    estatisticas.alvoAltura = alvo[1];
    estatisticas.sprites = listas.sprites.n;
    estatisticas.gpuMs = backend.tempoDeGpuMs;
    return listas.sprites.n;
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

    /**
     * Static map: blocked cells, visual relief and height levels (missing levels are flat). The camera gets the
     * height field (camera.relevo), so the screen and map conversions of projecao.js follow the terrain.
     * @param {{ largura: number, altura: number, bloqueado: Uint8Array, relevo: Uint8Array, nivel?: Uint8Array }} mapa
     */
    definirMapa(mapa) {
      relevo = criarRelevo(mapa, projecao);
      const k = projecao.celulasPorMetroDeAltura;
      const alcanceSol = projecao.sol[2] > 0 ? relevo.alturaMaxima / ((projecao.sol[2] / Math.hypot(projecao.sol[0], projecao.sol[1])) * projecao.metrosPorCelula) : 0;
      const limites = limitesPorCelula(mapa, relevo.niveis, Math.ceil(relevo.alturaMaxima * k) + 1, Math.ceil(alcanceSol) + 1);
      const total = mapa.largura * mapa.altura;
      const rgba = new Uint8Array(total * 4);
      const escalaNivel = 255 / projecao.nivelMaximo;
      for (let i = 0; i < total; i++) {
        rgba[i * 4] = mapa.bloqueado[i] ? 255 : 0;
        rgba[i * 4 + 1] = mapa.relevo[i];
        rgba[i * 4 + 2] = Math.round(limites.coluna[i] * escalaNivel);
        rgba[i * 4 + 3] = Math.round(limites.sol[i] * escalaNivel);
      }
      backend.definirMapa(mapa.largura, mapa.altura, rgba, relevo.fina, relevo.larguraFina, relevo.alturaFina);
      mapaLargura = mapa.largura;
      mapaAltura = mapa.altura;
      areaConstrucao = null;
      camera.relevo = relevo;
      const solo = soloDoMapa(mapa);
      nomesSolos = solo.nomes;
      backend.definirSolo(solo.grade);
      atualizarSolos();
      if (modoTerreno === 'ladrilhos') pedirLadrilhos();
      if (mapa.tipos) definirTipos(mapa.tipos);
    },

    /** Ground splatted from the tiles by soil ('ladrilhos') or procedural; the measurement compares the two. */
    definirModoTerreno(modo) {
      modoTerreno = modo;
      if (modo === 'ladrilhos') pedirLadrilhos();
      atualizarSolos();
    },

    get modoTerreno() {
      return backend.modoSolo === 1 ? 'ladrilhos' : 'procedural';
    },

    /**
     * Placement ghost of the building being placed: kind, top-left cell, footprint in cells, validity and,
     * optionally, `celulas` (one byte per footprint cell, 1 = a cell that makes it invalid); null removes it.
     * @param {{ tipo: number, cx: number, cy: number, largura: number, altura: number, valido: boolean, celulas?: Uint8Array } | null} fantasma
     */
    definirFantasma(fantasma) {
      unidades.definirFantasma(fantasma);
    },

    /**
     * Where the local player may build (one byte per map cell, nonzero = yes), shaded while placing; null hides it.
     * @param {Uint8Array | null} grade
     */
    definirAreaDeConstrucao(grade) {
      if (!grade) {
        backend.definirArea(null);
        return;
      }
      if (!areaConstrucao || areaConstrucao.length !== mapaLargura * mapaAltura) areaConstrucao = new Uint8Array(mapaLargura * mapaAltura);
      for (let i = 0; i < areaConstrucao.length; i++) areaConstrucao[i] = grade[i] ? 255 : 0;
      backend.definirArea(areaConstrucao);
    },

    /** Height field of the current map (relevo.js), or null before the map arrives. */
    get relevo() {
      return relevo;
    },

    atualizarNeblina(visao) {
      backend.atualizarNeblina(visao);
    },

    /** Loads a sprite manifest (C9) at a level (by default the one that suits the canvas). */
    async carregarManifesto(url, nivel = nivelDoCanvas()) {
      const manifesto = await carregarManifesto(url);
      const folha = await folhas.adicionarManifesto(manifesto, nivel);
      estatisticas.nivel = folha.nivel;
      return folha;
    },

    /**
     * Shows one terrain manifest as the whole ground, every soil on that tile untinted (the atlas viewer); null goes
     * back to the procedural ground.
     */
    async carregarTerreno(url, nivel = nivelDoCanvas()) {
      ladrilhosPedidos = true;
      if (!url) {
        modoTerreno = 'procedural';
        atualizarSolos();
        return null;
      }
      modoTerreno = 'ladrilhos';
      await carregarLadrilhos(new Map([[LADRILHO_BASE, url]]), nivel);
      nomesSolos = [LADRILHO_BASE];
      atualizarSolos();
      return { url };
    },

    /** Loads the prototype's Blender tank; resolves to null when it is missing. */
    async carregarPrototipo() {
      const manifesto = await carregarPrototipo();
      return manifesto ? folhas.adicionarManifesto(manifesto, 'uhd') : null;
    },

    folhas,

    /** Kinds of the match, when they do not come with the static map (MapaEstatico.tipos). */
    definirTipos,

    /**
     * Shadows: 'recomendado' (the default until the style gate decides: derived from the sprite alpha on units, the
     * rendered layer on buildings that have it), 'alfa' or 'camada' for every sheet.
     */
    definirModoSombra(modo) {
      unidades.definirModoSombra(modo);
    },

    /**
     * Draws one frame.
     * @param {{ agora: number, dt: number, estado: any, selecionadas: Set<number> }} p
     */
    desenhar({ agora, dt, estado, selecionadas }) {
      vista.px = pxPorCelula(projecao, vista.largura, vista.altura, camera.zoom);
      areaVisivel(projecao, camera, vista, 0, area);
      area[3] += margemDoRelevo();
      unidades.montar({ estado, area, selecionadas, agora });
      efeitos.montar(agora);
      return desenharCena(agora, dt, unidades);
    },

    /**
     * Draws a frame from instance lists built elsewhere (the atlas viewer): { sprites, sombras, aneis, barras },
     * each { dados: Float32Array, n }, sprites already sorted back to front; the game's effects are drawn too.
     */
    desenharInstancias(agora, dt, listas) {
      vista.px = pxPorCelula(projecao, vista.largura, vista.altura, camera.zoom);
      efeitos.montar(agora);
      return desenharCena(agora, dt, listas);
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
