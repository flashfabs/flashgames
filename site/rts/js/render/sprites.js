// Sprite sheets on the GPU: assigns texture layers to atlas pages, keeps the global frame table the sprite
// shader reads, and turns a manifest's animations and attachment points into lookups for the frame loop.
// Unit types without art get placeholder sheets drawn on the GPU, so everything goes through one sorted draw.
import { carregarImagem, nivelDisponivel, quadroDaAnimacao, direcaoDoAngulo } from '../ativos/manifesto.js';
import { FORMA_PREDIO } from './shaders.js';

const CAMPOS = 8;

// Placeholder shapes of the backend's FRAG_FICHA: body and, for vehicles, turret.
export const FICHAS = Object.freeze({
  'ficha-veiculo-leve': { corpo: 0, torre: 2 },
  'ficha-tanque': { corpo: 1, torre: 3 },
  'ficha-infantaria': { corpo: 4 },
  'ficha-faisca': { corpo: 5 },
});
const FICHA_DIRECOES = 16;
const FICHA_CELULA = 128;
const FICHA_PX_NIVEL = 96;
const MARGEM_PREDIO_PX = 8;

/**
 * Shape and height of a building kind's placeholder, from its category and name (the grey kit replaces it).
 * @param {{ nome: string, categoria: number, pegada: number[] }} tipo
 * @param {number} categoriaRecurso CATEGORIA.RECURSO
 */
export function formaDoPredio(tipo, categoriaRecurso) {
  const [largura, altura] = tipo.pegada;
  if (tipo.categoria === categoriaRecurso) return { forma: FORMA_PREDIO.PILHA, alturaMetros: 2 };
  if (/poste/.test(tipo.nome)) return { forma: FORMA_PREDIO.POSTE, alturaMetros: 8 };
  if (/cata-vento/.test(tipo.nome)) return { forma: FORMA_PREDIO.CATA_VENTO, alturaMetros: 9 };
  if (/torre/.test(tipo.nome)) return { forma: FORMA_PREDIO.TORRE, alturaMetros: 10 };
  if (/ponte|palicada/.test(tipo.nome)) return { forma: FORMA_PREDIO.PREDIO, alturaMetros: 2.4 };
  return { forma: FORMA_PREDIO.PREDIO, alturaMetros: Math.min(9, 3 + 1.2 * Math.min(largura, altura)) };
}

/**
 * @typedef {{
 *   asset: string, primeiroQuadro: number, direcoes: number, pxNivel: number,
 *   animacoes: Map<string, import('../ativos/manifesto.js').Animacao>,
 *   pontos: Record<string, Float32Array>, alturaBarraMetros: number, temSombra: boolean,
 * }} Folha
 */

/**
 * @param {ReturnType<typeof import('./backend-webgl2.js').criarBackendWebGL2>} backend
 * @param {ReturnType<typeof import('./projecao.js').criarProjecao>} projecao
 * @param {() => Float32Array} quadroComum uniform block with the projection filled in, for the placeholder pass
 */
export function criarFolhas(backend, projecao, quadroComum) {
  let tabela = new Float32Array(1024 * CAMPOS);
  let totalQuadros = 0;
  let proximaCamada = 0;
  // pages shared by several manifests (the phase atlas) go up once: colour page URL -> promise of its layer
  const camadaDaPagina = new Map();

  // Layer of an atlas page, uploading it the first time any manifest asks for it.
  function camadaPara(pagina) {
    let pendente = camadaDaPagina.get(pagina.cor);
    if (pendente) return pendente;
    const camada = proximaCamada++;
    pendente = Promise.all([carregarImagem(pagina.cor, true), pagina.time ? carregarImagem(pagina.time, false) : null, pagina.sombra ? carregarImagem(pagina.sombra, false) : null]).then(([cor, time, sombra]) => {
      backend.garantirCamadas(pagina.largura, pagina.altura, proximaCamada);
      backend.enviarPagina(camada, cor, time, sombra, pagina.largura, pagina.altura);
      cor.close();
      time?.close();
      sombra?.close();
      return camada;
    });
    pendente.catch(() => camadaDaPagina.delete(pagina.cor));
    camadaDaPagina.set(pagina.cor, pendente);
    return pendente;
  }
  /** @type {Map<string, Folha>} */
  const porAsset = new Map();

  function reservarQuadros(n) {
    if ((totalQuadros + n) * CAMPOS > tabela.length) {
      let tamanho = tabela.length;
      while (tamanho < (totalQuadros + n) * CAMPOS) tamanho *= 2;
      const nova = new Float32Array(tamanho);
      nova.set(tabela);
      tabela = nova;
    }
    const primeiro = totalQuadros;
    totalQuadros += n;
    return primeiro;
  }

  // Height of the health bar in metres: the highest "topo" point over the frames of the idle body animation, so the
  // bar stays put while the unit turns; without the point, a default.
  function alturaDaBarra(pontos, animacao, pxNivel, padrao) {
    const topo = pontos.topo;
    if (!topo || !animacao) return padrao;
    let maior = -Infinity;
    for (let i = animacao.base; i < animacao.base + animacao.direcoes * animacao.quadros; i++) {
      if (!Number.isNaN(topo[i * 2 + 1])) maior = Math.max(maior, -topo[i * 2 + 1]);
    }
    // a topo at or below the anchor would bury the bar in the sprite: keep the default then
    return maior > 0 ? (maior / pxNivel) * (projecao.metrosPorCelula / projecao.cosseno) : padrao;
  }

  function publicar(folha) {
    porAsset.set(folha.asset, folha);
    backend.definirQuadros(tabela, totalQuadros);
    backend.terminarCamadas();
    return folha;
  }

  return {
    /**
     * Uploads a manifest's pages at the wanted level (or the one it has) and registers its frames. A page another
     * manifest already brought (same colour URL, as in a phase atlas) is not uploaded again.
     * @param {ReturnType<typeof import('../ativos/manifesto.js').lerManifesto>} manifesto
     * @param {'hd' | 'uhd'} nivelDesejado
     */
    async adicionarManifesto(manifesto, nivelDesejado) {
      const nivel = nivelDisponivel(manifesto, nivelDesejado);
      const n = manifesto.niveis[nivel];
      const camadas = await Promise.all(n.paginas.map(camadaPara));
      const pxNivel = n.pxPorCelula ?? projecao.pxNivel[nivel];
      const primeiro = reservarQuadros(manifesto.totalQuadros);
      for (let i = 0; i < manifesto.totalQuadros; i++) {
        const o = (primeiro + i) * CAMPOS;
        const q = i * 7;
        tabela[o] = camadas[n.quadros[q]];
        for (let k = 1; k < 7; k++) tabela[o + k] = n.quadros[q + k];
        tabela[o + 7] = pxNivel;
      }
      return publicar({
        asset: manifesto.asset,
        primeiroQuadro: primeiro,
        direcoes: manifesto.direcoes,
        pxNivel,
        nivel,
        animacoes: new Map(manifesto.animacoes.map(a => [a.nome, a])),
        pontos: n.pontos,
        alturaBarraMetros: alturaDaBarra(n.pontos, manifesto.animacao('parado') ?? manifesto.animacoes[0], pxNivel, 3),
        temSombra: n.paginas.some(p => p.sombra),
      });
    },

    /** Draws and registers the placeholder unit sheets (body, and turret for vehicles, in 16 directions). */
    adicionarFichas() {
      const largura = Math.min(4096, backend.info.maxTextura);
      const porLinha = Math.floor(largura / FICHA_CELULA);
      const nomes = Object.keys(FICHAS);
      const partes = nomes.flatMap(nome => (FICHAS[nome].torre === undefined ? [[nome, FICHAS[nome].corpo]] : [[nome, FICHAS[nome].corpo], [nome, FICHAS[nome].torre]]));
      const total = partes.length * FICHA_DIRECOES;
      const altura = Math.ceil(total / porLinha) * FICHA_CELULA;
      const camada = proximaCamada++;
      backend.garantirCamadas(largura, altura, proximaCamada);
      const desenhos = [];
      const primeiro = reservarQuadros(total);
      const metade = FICHA_CELULA / 2;
      for (let i = 0; i < total; i++) {
        const forma = partes[Math.floor(i / FICHA_DIRECOES)][1];
        const direcao = i % FICHA_DIRECOES;
        const x = (i % porLinha) * FICHA_CELULA;
        const y = Math.floor(i / porLinha) * FICHA_CELULA;
        desenhos.push({ x, y, celula: FICHA_CELULA, pxNivel: FICHA_PX_NIVEL, angulo: (direcao * 2 * Math.PI) / FICHA_DIRECOES, forma });
        tabela.set([camada, x, y, FICHA_CELULA, FICHA_CELULA, -metade, -metade, FICHA_PX_NIVEL], (primeiro + i) * CAMPOS);
      }
      backend.desenharFichas(camada, desenhos, quadroComum());
      let base = primeiro;
      for (const nome of nomes) {
        const animacoes = new Map([['parado', { nome: 'parado', camada: 'corpo', quadros: 1, fps: 0, laco: true, direcoes: FICHA_DIRECOES, base: 0 }]]);
        if (FICHAS[nome].torre !== undefined) animacoes.set('torre', { nome: 'torre', camada: 'torre', quadros: 1, fps: 0, laco: true, direcoes: FICHA_DIRECOES, base: FICHA_DIRECOES });
        porAsset.set(nome, {
          asset: nome,
          primeiroQuadro: base,
          direcoes: FICHA_DIRECOES,
          pxNivel: FICHA_PX_NIVEL,
          nivel: 'uhd',
          animacoes,
          pontos: {},
          alturaBarraMetros: nome === 'ficha-infantaria' ? 1.6 : 2.2,
          temSombra: false,
        });
        base += animacoes.size * FICHA_DIRECOES;
      }
      backend.definirQuadros(tabela, totalQuadros);
      backend.terminarCamadas();
    },

    /**
     * Draws and registers a placeholder sheet per building kind (one frame, the footprint centre as anchor), named
     * `ficha-<kind name>`, with a `cabo` point where power cables hang and a `topo` point for the health bar.
     * @param {{ nome: string, categoria: number, pegada: number[] }[]} tipos building, structure and resource kinds
     * @param {number} categoriaRecurso CATEGORIA.RECURSO
     */
    adicionarFichasPredios(tipos, categoriaRecurso) {
      if (tipos.length === 0) return;
      const larguraCamada = Math.min(4096, backend.info.maxTextura);
      const k = projecao.cosseno / projecao.metrosPorCelula;
      const px = FICHA_PX_NIVEL;
      // frames with the anchor inside, packed in shelves
      const quadros = tipos.map((tipo, i) => {
        const { forma, alturaMetros } = formaDoPredio(tipo, categoriaRecurso);
        const [l, a] = tipo.pegada;
        const meiaL = Math.max(l / 2, 0.85) * px + MARGEM_PREDIO_PX;
        const acima = ((a / 2) * projecao.seno + (alturaMetros + 2.4) * k) * px + MARGEM_PREDIO_PX;
        const abaixo = (a / 2) * projecao.seno * px + MARGEM_PREDIO_PX;
        return { tipo, forma, alturaMetros, largura: Math.ceil(2 * meiaL), altura: Math.ceil(acima + abaixo), ancoraX: Math.ceil(meiaL), ancoraY: Math.ceil(acima), semente: i * 1.37 };
      });
      let x = 0;
      let y = 0;
      let alturaPrateleira = 0;
      for (const q of quadros) {
        if (x + q.largura > larguraCamada) {
          x = 0;
          y += alturaPrateleira;
          alturaPrateleira = 0;
        }
        q.x = x;
        q.y = y;
        x += q.largura;
        alturaPrateleira = Math.max(alturaPrateleira, q.altura);
      }
      const camada = proximaCamada++;
      backend.garantirCamadas(larguraCamada, y + alturaPrateleira, proximaCamada);
      const primeiro = reservarQuadros(quadros.length);
      backend.desenharFichasPredio(
        camada,
        quadros.map(q => ({ ...q, pxNivel: px, pegada: q.tipo.pegada })),
        quadroComum(),
      );
      quadros.forEach((q, i) => {
        tabela.set([camada, q.x, q.y, q.largura, q.altura, -q.ancoraX, -q.ancoraY, px], (primeiro + i) * CAMPOS);
        const alturaCabo = q.forma === FORMA_PREDIO.POSTE ? q.alturaMetros - 0.4 : q.forma === FORMA_PREDIO.PILHA ? 0 : q.alturaMetros;
        const nome = `ficha-${q.tipo.nome}`;
        porAsset.set(nome, {
          asset: nome,
          primeiroQuadro: primeiro + i,
          direcoes: 1,
          pxNivel: px,
          nivel: 'uhd',
          animacoes: new Map([['parado', { nome: 'parado', camada: 'corpo', quadros: 1, fps: 0, laco: true, direcoes: 1, base: 0 }]]),
          pontos: { cabo: Float32Array.of(0, -alturaCabo * k * px), topo: Float32Array.of(0, -q.alturaMetros * k * px) },
          alturaBarraMetros: q.alturaMetros + 1,
          temSombra: false,
        });
      });
      backend.definirQuadros(tabela, totalQuadros);
      backend.terminarCamadas();
    },

    /** @param {string} asset */
    folha(asset) {
      return porAsset.get(asset) ?? null;
    },

    get totalQuadros() {
      return totalQuadros;
    },
  };
}

/**
 * Global frame index of an animation of a sheet at a map angle (0..255) and a time.
 * @param {Folha} folha
 * @param {import('../ativos/manifesto.js').Animacao} animacao
 * @param {number} angulo256
 * @param {number} tempoS
 */
export function quadroGlobal(folha, animacao, angulo256, tempoS) {
  return folha.primeiroQuadro + quadroDaAnimacao(animacao, direcaoDoAngulo(angulo256, animacao.direcoes), tempoS);
}

/**
 * Second field of a sprite instance (aDados.y): team, build progress (0 finished, 1..255 rising), FLAGS_SPRITE and how
 * far the object reaches in front of its anchor in quarter cells (0..63), for the depth test against the terrain.
 * All integers, so the float holds them exactly.
 */
export function empacotar(time, progresso, bandeiras, viesQuartos) {
  return (time & 7) | ((progresso & 255) << 3) | ((bandeiras & 15) << 11) | ((viesQuartos & 63) << 15);
}

// Points that lie on the ground (the turret axis meets the hull there); every other point is read as a height
// above the anchor, which lands on the same screen pixel.
const PONTOS_NO_CHAO = new Set(['encaixe_torre']);

/**
 * Attachment point of a frame relative to the anchor, written into saida as [dx cells, dy cells, height metres];
 * false when the frame has no such point.
 * @param {Folha} folha
 * @param {string} nome
 * @param {number} quadroLocal frame index within the sheet
 * @param {ReturnType<typeof import('./projecao.js').criarProjecao>} projecao
 * @param {Float64Array} saida
 */
export function pontoDeEncaixe(folha, nome, quadroLocal, projecao, saida) {
  const tabela = folha.pontos[nome];
  if (!tabela) return false;
  const px = tabela[quadroLocal * 2];
  const py = tabela[quadroLocal * 2 + 1];
  if (Number.isNaN(px)) return false;
  saida[0] = px / folha.pxNivel;
  if (PONTOS_NO_CHAO.has(nome)) {
    saida[1] = py / (folha.pxNivel * projecao.seno);
    saida[2] = 0;
  } else {
    saida[1] = 0;
    saida[2] = (-py / folha.pxNivel) * (projecao.metrosPorCelula / projecao.cosseno);
  }
  return true;
}
