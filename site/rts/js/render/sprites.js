// Sprite sheets on the GPU: assigns texture layers to atlas pages, keeps the global frame table the sprite
// shader reads, and turns a manifest's animations and attachment points into lookups for the frame loop.
// Unit types without art get placeholder sheets drawn on the GPU, so everything goes through one sorted draw.
import { carregarImagem, nivelDisponivel, quadroDaAnimacao, direcaoDoAngulo } from '../ativos/manifesto.js';

const CAMPOS = 8;

// Placeholder shapes of the backend's FRAG_FICHA: body and turret per prototype unit type.
export const FICHAS = Object.freeze({
  'ficha-veiculo-leve': { corpo: 0, torre: 2 },
  'ficha-tanque': { corpo: 1, torre: 3 },
});
const FICHA_DIRECOES = 16;
const FICHA_CELULA = 128;
const FICHA_PX_NIVEL = 96;

/**
 * @typedef {{
 *   asset: string, primeiroQuadro: number, direcoes: number, pxNivel: number,
 *   animacoes: Map<string, import('../ativos/manifesto.js').Animacao>,
 *   pontos: Record<string, Float32Array>, alturaBarraMetros: number,
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

  // Height of the health bar in metres, from the "topo" point of the first frame when the art provides it.
  function alturaDaBarra(pontos, pxNivel, padrao) {
    const topo = pontos.topo;
    if (!topo || Number.isNaN(topo[1])) return padrao;
    return (-topo[1] / pxNivel) * (projecao.metrosPorCelula / projecao.cosseno);
  }

  function publicar(folha) {
    porAsset.set(folha.asset, folha);
    backend.definirQuadros(tabela, totalQuadros);
    backend.terminarCamadas();
    return folha;
  }

  return {
    /**
     * Uploads a manifest's pages at the wanted level (or the one it has) and registers its frames.
     * @param {ReturnType<typeof import('../ativos/manifesto.js').lerManifesto>} manifesto
     * @param {'hd' | 'uhd'} nivelDesejado
     */
    async adicionarManifesto(manifesto, nivelDesejado) {
      const nivel = nivelDisponivel(manifesto, nivelDesejado);
      const n = manifesto.niveis[nivel];
      const imagens = await Promise.all(n.paginas.map(p => Promise.all([carregarImagem(p.cor, true), p.time ? carregarImagem(p.time, false) : null])));
      const largura = Math.max(...n.paginas.map(p => p.largura));
      const altura = Math.max(...n.paginas.map(p => p.altura));
      const camadaBase = proximaCamada;
      proximaCamada += n.paginas.length;
      backend.garantirCamadas(largura, altura, proximaCamada);
      imagens.forEach(([cor, time], i) => {
        backend.enviarPagina(camadaBase + i, cor, time, n.paginas[i].largura, n.paginas[i].altura);
        cor.close();
        time?.close();
      });
      const pxNivel = n.pxPorCelula ?? projecao.pxNivel[nivel];
      const primeiro = reservarQuadros(manifesto.totalQuadros);
      for (let i = 0; i < manifesto.totalQuadros; i++) {
        const o = (primeiro + i) * CAMPOS;
        const q = i * 7;
        tabela[o] = camadaBase + n.quadros[q];
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
        alturaBarraMetros: alturaDaBarra(n.pontos, pxNivel, 3),
      });
    },

    /** Draws and registers the placeholder sheets (body and turret in 16 directions per prototype type). */
    adicionarFichas() {
      const largura = Math.min(4096, backend.info.maxTextura);
      const porLinha = Math.floor(largura / FICHA_CELULA);
      const nomes = Object.keys(FICHAS);
      const total = nomes.length * 2 * FICHA_DIRECOES;
      const altura = Math.ceil(total / porLinha) * FICHA_CELULA;
      const camada = proximaCamada++;
      backend.garantirCamadas(largura, altura, proximaCamada);
      const desenhos = [];
      const primeiro = reservarQuadros(total);
      const metade = FICHA_CELULA / 2;
      for (let i = 0; i < total; i++) {
        const nome = nomes[Math.floor(i / (2 * FICHA_DIRECOES))];
        const torre = Math.floor(i / FICHA_DIRECOES) % 2 === 1;
        const direcao = i % FICHA_DIRECOES;
        const x = (i % porLinha) * FICHA_CELULA;
        const y = Math.floor(i / porLinha) * FICHA_CELULA;
        desenhos.push({ x, y, celula: FICHA_CELULA, pxNivel: FICHA_PX_NIVEL, angulo: (direcao * 2 * Math.PI) / FICHA_DIRECOES, forma: torre ? FICHAS[nome].torre : FICHAS[nome].corpo });
        tabela.set([camada, x, y, FICHA_CELULA, FICHA_CELULA, -metade, -metade, FICHA_PX_NIVEL], (primeiro + i) * CAMPOS);
      }
      backend.desenharFichas(camada, desenhos, quadroComum());
      for (const [k, nome] of nomes.entries()) {
        const base = primeiro + k * 2 * FICHA_DIRECOES;
        porAsset.set(nome, {
          asset: nome,
          primeiroQuadro: base,
          direcoes: FICHA_DIRECOES,
          pxNivel: FICHA_PX_NIVEL,
          nivel: 'uhd',
          animacoes: new Map([
            ['parado', { nome: 'parado', camada: 'corpo', quadros: 1, fps: 0, laco: true, direcoes: FICHA_DIRECOES, base: 0 }],
            ['torre', { nome: 'torre', camada: 'torre', quadros: 1, fps: 0, laco: true, direcoes: FICHA_DIRECOES, base: FICHA_DIRECOES }],
          ]),
          pontos: {},
          alturaBarraMetros: 2.2,
        });
      }
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
 * Attachment point of a frame in map cells relative to the anchor, as a ground offset plus a height,
 * written into saida as [dx cells, dy cells, height metres]; false when the frame has no such point.
 * Screen offsets are taken as height (the point is above the anchor on the model's vertical axis).
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
  saida[1] = 0;
  saida[2] = (-py / folha.pxNivel) * (projecao.metrosPorCelula / projecao.cosseno);
  return true;
}
