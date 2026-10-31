// Entities for the renderer: matches them between the last two snapshots by id with generation, interpolates
// position and facings, culls to the visible ground and to the fog, and writes the sprite (sorted back to front),
// shadow, selection ring or footprint, health bar and power cable instances into preallocated buffers. Buildings,
// resource piles and map structures stand on their footprint (centre anchor, sorted by their front edge), rise out of
// scaffolding while under construction, and are remembered grey under the fog; the placement ghost of the building
// being placed goes through the same sorted draw. Nothing is allocated per frame.
import { FLOATS_INSTANCIA } from './backend-webgl2.js';
import { criarOrdenacao } from './ordenacao.js';
import { pontoDeEncaixe, empacotar } from './sprites.js';
import { FLAGS_SPRITE } from './shaders.js';
import * as contratos from '../sim/contratos.js';

const { FP, PASSOS_POR_SEGUNDO, VISAO, MAX_SLOTS, SEM_ENTIDADE, slotDe } = contratos;
// C2 v3 (kinds by category, construction and power bits); the fallbacks mirror it until v3 reaches rts/base
export const CATEGORIA = contratos.CATEGORIA ?? Object.freeze({ UNIDADE: 0, PREDIO: 1, RECURSO: 2, FAISCA: 3, ESTRUTURA: 4 });
const BANDEIRA = { EM_OBRA: 8, ENERGIZADO: 16, PRODUZINDO: 256, ...contratos.BANDEIRA };

const PASSO_MS = 1000 / PASSOS_POR_SEGUNDO;
const MARGEM_CELULAS = 2;
const VERDE_SELECAO = [0.35, 1.0, 0.45];
// how far in front of its anchor a unit reaches, in quarter cells, for the depth test against the terrain
const VIES_UNIDADE = 1;
const CABO_PADRAO_METROS = 6;
const COR_VALIDO = [0.3, 1.0, 0.42, 0.32];
const COR_INVALIDO = [1.0, 0.22, 0.16, 0.42];

/**
 * Look of each kind: sheet variants in order of preference (the first whose body sheet is loaded wins; a variant
 * without turret has it drawn into the body), ring radius and shadow height; buildings add their footprint.
 * @typedef {{
 *   variantes: { corpo: string, torre?: string }[], raio: number, sombraMetros: number,
 *   predio?: boolean, pegada?: number[], aditivo?: boolean,
 * }} Aparencia
 */
export const APARENCIAS_PADRAO = Object.freeze([
  { variantes: [{ corpo: 'ficha-veiculo-leve', torre: 'ficha-veiculo-leve' }], raio: 0.42, sombraMetros: 0.9 },
  { variantes: [{ corpo: 'prototipo-tanque' }, { corpo: 'ficha-tanque', torre: 'ficha-tanque' }], raio: 0.55, sombraMetros: 1.4 },
]);

/**
 * Looks of the match's kinds (MapaEstatico.tipos): the kind's art first, then a placeholder by category.
 * @param {{ nome: string, categoria: number, asset: string, pegada: number[], lotacao?: number }[]} tipos
 * @returns {Aparencia[]}
 */
export function aparenciasDosTipos(tipos) {
  return tipos.map(tipo => {
    const arte = tipo.asset ? [{ corpo: tipo.asset }] : [];
    if (tipo.categoria === CATEGORIA.UNIDADE) {
      if (/infantaria/.test(tipo.asset) || /infantaria/.test(tipo.nome)) return { variantes: [...arte, { corpo: 'ficha-infantaria' }], raio: 0.28, sombraMetros: 0.6 };
      if ((tipo.lotacao ?? 1) >= 2) return { variantes: [...arte, { corpo: 'ficha-tanque', torre: 'ficha-tanque' }], raio: 0.55, sombraMetros: 1.4 };
      return { variantes: [...arte, { corpo: 'ficha-veiculo-leve', torre: 'ficha-veiculo-leve' }], raio: 0.42, sombraMetros: 0.9 };
    }
    if (tipo.categoria === CATEGORIA.FAISCA) return { variantes: [{ corpo: 'ficha-faisca' }], raio: 0.2, sombraMetros: 0, aditivo: true };
    const [l, a] = tipo.pegada;
    return { variantes: [...arte, { corpo: `ficha-${tipo.nome}` }], raio: Math.max(l, a) * 0.5, sombraMetros: 2.5, predio: true, pegada: [l, a] };
  });
}

class Instancias {
  constructor(capacidade) {
    this.dados = new Float32Array(capacidade * FLOATS_INSTANCIA);
    this.n = 0;
  }

  // Grows the buffer to hold n instances (only when the count grows past the largest seen).
  garantir(n) {
    if (n * FLOATS_INSTANCIA <= this.dados.length) return;
    let tamanho = this.dados.length;
    while (tamanho < n * FLOATS_INSTANCIA) tamanho *= 2;
    const novos = new Float32Array(tamanho);
    novos.set(this.dados);
    this.dados = novos;
  }

  // Offset of the next free instance.
  proxima() {
    this.garantir(this.n + 1);
    return this.n++ * FLOATS_INSTANCIA;
  }

  // Writes one instance of eight values.
  escrever(a, b, c, d, e, f, g, h) {
    const o = this.proxima();
    const v = this.dados;
    v[o] = a;
    v[o + 1] = b;
    v[o + 2] = c;
    v[o + 3] = d;
    v[o + 4] = e;
    v[o + 5] = f;
    v[o + 6] = g;
    v[o + 7] = h;
  }
}

/**
 * @param {{
 *   projecao: ReturnType<typeof import('./projecao.js').criarProjecao>,
 *   folhas: ReturnType<typeof import('./sprites.js').criarFolhas>,
 *   alturaEm?: (x: number, y: number) => number,
 * }} deps alturaEm gives the terrain height in metres (flat ground without it)
 */
export function criarMontagemUnidades({ projecao, folhas, alturaEm = () => 0 }) {
  let aparencias = APARENCIAS_PADRAO;
  // 'recomendado' derives unit shadows from the sprite alpha and uses the rendered layer on buildings that have it;
  // 'alfa' and 'camada' force one way for every sheet (the style gate compares them)
  let modoSombra = 'recomendado';
  // resolved sheets per kind, refreshed when a sheet finishes loading
  let resolvidas = [];
  let versaoFolhas = -1;
  /** @type {{ tipo: number, cx: number, cy: number, largura: number, altura: number, valido: boolean, celulas?: Uint8Array } | null} */
  let fantasma = null;
  const brutos = new Instancias(4096);
  const sprites = new Instancias(4096);
  const sombras = new Instancias(4096);
  const aneis = new Instancias(512);
  const barras = new Instancias(1024);
  const pegadas = new Instancias(64);
  const cabos = new Instancias(256);
  const ordenacao = criarOrdenacao(4096);
  const encaixe = new Float64Array(3);
  // snapshot index of each slot this frame (checked against the id, so stale entries never match)
  const indicePorSlot = new Int32Array(MAX_SLOTS);
  // entities with a cable to their network node: snapshot index, x, y, attachment height
  let pendentes = new Float64Array(256 * 4);
  let nPendentes = 0;

  function resolver() {
    if (versaoFolhas === folhas.totalQuadros) return;
    versaoFolhas = folhas.totalQuadros;
    resolvidas = aparencias.map(a => {
      const variante = a.variantes.find(v => folhas.folha(v.corpo)) ?? null;
      const corpo = variante ? folhas.folha(variante.corpo) : null;
      const torre = variante?.torre ? folhas.folha(variante.torre) : null;
      // where cables hang: the sheet's `cabo` point, else its top, else a default height over the anchor
      let alturaCabo = CABO_PADRAO_METROS;
      let caboDx = 0;
      if (corpo && (pontoDeEncaixe(corpo, 'cabo', 0, projecao, encaixe) || pontoDeEncaixe(corpo, 'topo', 0, projecao, encaixe))) {
        alturaCabo = encaixe[2];
        caboDx = encaixe[0];
      }
      const animacoes = corpo ? [...corpo.animacoes.values()] : [];
      const doCorpo = animacoes.filter(x => x.camada !== 'luzes' && !x.camada.startsWith('torre'));
      return {
        ...a,
        corpo,
        animParado: corpo?.animacoes.get('parado') ?? corpo?.animacoes.get('pronta') ?? doCorpo[0] ?? null,
        animAndando: corpo?.animacoes.get('andando') ?? null,
        animAtividade: corpo?.animacoes.get('atividade') ?? corpo?.animacoes.get('produzindo') ?? null,
        animDanificado: corpo?.animacoes.get('danificada') ?? corpo?.animacoes.get('danificado') ?? null,
        animLuzes: animacoes.find(x => x.camada === 'luzes') ?? null,
        caboDx,
        torre,
        animTorre: torre?.animacoes.get('torre') ?? null,
        alturaCabo,
        // buildings reach their front edge, in quarter cells
        vies: a.predio ? Math.min(63, Math.round(a.pegada[1] * 2)) : VIES_UNIDADE,
      };
    });
  }

  // Per-entity doubles travel through this scratch array: passing a fractional number to a function that is not
  // inlined boxes it on the heap, so the hot loop only ever passes integers and objects. Fields: x, y, height.
  const posicao = new Float64Array(3);
  // visible ground of this frame and the sort scale, for the helpers below: x0, y0, x1, y1, scale
  const quadroArea = new Float64Array(5);

  /**
   * @param {object} p
   * @param {{ anterior: any, atual: any, mapa: any, chegadaAtual: number, jogadorLocal: number, extras?: any }} p.estado
   *   extras: still entities in the snapshot's layout drawn as well (the benchmark's buildings)
   * @param {Float64Array | number[]} p.area visible ground [x0, y0, x1, y1] in cells
   * @param {Set<number>} p.selecionadas ids with generation
   * @param {number} p.agora
   */
  function montar({ estado, area, selecionadas, agora }) {
    brutos.n = sprites.n = sombras.n = aneis.n = barras.n = pegadas.n = cabos.n = 0;
    const { anterior, atual } = estado;
    if (!atual) return;
    resolver();
    const alfa = Math.min(1, (agora - estado.chegadaAtual) / PASSO_MS);
    quadroArea[0] = area[0] - MARGEM_CELULAS;
    quadroArea[1] = area[1] - MARGEM_CELULAS;
    quadroArea[2] = area[2] + MARGEM_CELULAS;
    quadroArea[3] = area[3] + MARGEM_CELULAS;
    quadroArea[4] = 65535 / (quadroArea[3] - quadroArea[1]);
    percorrer(estado, atual, anterior, atual.tick + alfa, alfa, selecionadas);
    if (estado.extras) percorrer(estado, estado.extras, null, atual.tick + alfa, alfa, selecionadas);
    montarMemorias(atual.fantasmas);
    montarFantasma();
    ordenar();
  }

  // Every entity of one snapshot-like source (the snapshot, or the benchmark's still extras), then its cables.
  function percorrer(estado, atual, anterior, tempoTick, alfa, selecionadas) {
    nPendentes = 0;
    const x0 = quadroArea[0];
    const y0 = quadroArea[1];
    const x1 = quadroArea[2];
    const y1 = quadroArea[3];
    const visao = estado.atual.visao;
    const largura = estado.mapa ? estado.mapa.largura : 0;
    const altura = estado.mapa ? estado.mapa.altura : 0;
    const bandeiras = atual.bandeiras ?? null;
    const progresso = atual.progresso ?? null;
    const ligacao = atual.ligacao ?? null;
    let j = 0; // walks the previous snapshot alongside the current one, both in slot order
    for (let k = 0; k < atual.n; k++) {
      const id = atual.id[k];
      indicePorSlot[slotDe(id)] = k;
      const aparencia = resolvidas[atual.tipo[k]] ?? resolvidas[0];
      if (!aparencia?.corpo || !aparencia.animParado) continue;
      let x = atual.x[k] / FP;
      let y = atual.y[k] / FP;
      let corpo = atual.dirCorpo[k];
      let torre = atual.dirTorre[k];
      let andando = false;
      if (anterior) {
        const slot = slotDe(id);
        while (j < anterior.n && slotDe(anterior.id[j]) < slot) j++;
        if (j < anterior.n && anterior.id[j] === id) {
          const px = anterior.x[j] / FP;
          const py = anterior.y[j] / FP;
          if (Math.abs(x - px) < 3 && Math.abs(y - py) < 3) {
            andando = x !== px || y !== py;
            x = px + (x - px) * alfa;
            y = py + (y - py) * alfa;
          }
          // facings along the shortest turn, as angles 0..256
          const dc = ((atual.dirCorpo[k] - anterior.dirCorpo[j] + 128) & 255) - 128;
          corpo = anterior.dirCorpo[j] + dc * alfa;
          const dt = ((atual.dirTorre[k] - anterior.dirTorre[j] + 128) & 255) - 128;
          torre = anterior.dirTorre[j] + dt * alfa;
        }
      }
      const dono = atual.dono[k];
      const time = dono & 7;
      const selecionada = selecionadas.has(id);
      const b = bandeiras ? bandeiras[k] : 0;
      posicao[0] = x;
      posicao[1] = y;
      if (aparencia.predio) {
        if (!dentro(aparencia)) continue;
        if (dono !== estado.jogadorLocal && !visivelNaPegada(visao, largura, altura, aparencia)) continue;
        const chao = alturaEm(x, y);
        posicao[2] = chao;
        const obra = (b & BANDEIRA.EM_OBRA) !== 0 && progresso ? Math.max(1, Math.min(254, progresso[k])) : 0;
        let anim = aparencia.animParado;
        if (obra === 0 && atual.vida[k] < 128 && aparencia.animDanificado) anim = aparencia.animDanificado;
        else if (obra === 0 && (b & BANDEIRA.PRODUZINDO) !== 0 && aparencia.animAtividade) anim = aparencia.animAtividade;
        const tempoS = (tempoTick - atual.inicioAnim[k]) / PASSOS_POR_SEGUNDO;
        const passo = anim.fps > 0 && tempoS > 0 ? Math.floor(tempoS * anim.fps) : 0;
        const chavePredio = chaveDe(y + aparencia.pegada[1] * 0.5);
        emitirSprite(quadroDe(aparencia.corpo, anim, 0, passo), empacotar(time, obra, 0, aparencia.vies), aparencia, chavePredio, 1);
        // lights add over the body with the same depth, while the building has power
        const luzes = aparencia.animLuzes;
        if (luzes && obra === 0 && (!bandeiras || (b & BANDEIRA.ENERGIZADO) !== 0)) {
          const passoLuz = luzes.fps > 0 && tempoS > 0 ? Math.floor(tempoS * luzes.fps) : 0;
          emitirSprite(quadroDe(aparencia.corpo, luzes, 0, passoLuz), empacotar(time, 0, 0, aparencia.vies), aparencia, chavePredio, -1);
        }
        if (selecionada) emitirPegada(x, y, aparencia.pegada, VERDE_SELECAO[0], VERDE_SELECAO[1], VERDE_SELECAO[2], 0.5);
        if (selecionada || atual.vida[k] < 255) emitirBarra(x, y, chao + aparencia.corpo.alturaBarraMetros, atual.vida[k] / 255, aparencia.pegada[0] * 0.6, time, selecionada);
        if (ligacao && ligacao[k] !== SEM_ENTIDADE) anotarCabo(k, x + aparencia.caboDx, y, chao + aparencia.alturaCabo);
        continue;
      }
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      if (dono !== estado.jogadorLocal) {
        const cx = x | 0;
        const cy = y | 0;
        if (cx < 0 || cy < 0 || cx >= largura || cy >= altura || visao[cy * largura + cx] !== VISAO.VISIVEL) continue;
      }
      const chave = chaveDe(y);
      const tempoS = (tempoTick - atual.inicioAnim[k]) / PASSOS_POR_SEGUNDO;
      const anim = andando && aparencia.animAndando ? aparencia.animAndando : aparencia.animParado;
      const passo = anim.fps > 0 && tempoS > 0 ? Math.floor(tempoS * anim.fps) : 0;
      const quadro = quadroDe(aparencia.corpo, anim, Math.round((corpo * anim.direcoes) / 256), passo);
      const chao = alturaEm(x, y);
      posicao[2] = chao;
      const empacotado = empacotar(time, 0, 0, aparencia.vies);
      emitirSprite(quadro, empacotado, aparencia, chave, aparencia.aditivo ? -1 : 1);
      const animTorre = aparencia.animTorre;
      if (aparencia.torre && animTorre) {
        if (pontoDeEncaixe(aparencia.corpo, 'encaixe_torre', quadro - aparencia.corpo.primeiroQuadro, projecao, encaixe)) {
          posicao[0] = x + encaixe[0];
          posicao[1] = y + encaixe[1];
          posicao[2] = chao + encaixe[2];
        }
        const passoTorre = animTorre.fps > 0 && tempoS > 0 ? Math.floor(tempoS * animTorre.fps) : 0;
        emitirSprite(quadroDe(aparencia.torre, animTorre, Math.round((torre * animTorre.direcoes) / 256), passoTorre), empacotado, aparencia, chave, 1);
      }
      if (selecionada) aneis.escrever(x, y, aparencia.raio, 2, VERDE_SELECAO[0], VERDE_SELECAO[1], VERDE_SELECAO[2], 0.9);
      if (selecionada || atual.vida[k] < 255) emitirBarra(x, y, chao + aparencia.corpo.alturaBarraMetros, atual.vida[k] / 255, aparencia.raio * 1.5, time, selecionada);
    }
    resolverCabos(atual);
  }

  // Sort key of a ground y (cells) in the frame's visible band: integer 0..65535.
  function chaveDe(y) {
    const t = (y - quadroArea[1]) * quadroArea[4];
    return t <= 0 ? 0 : t >= 65535 ? 65535 : t | 0;
  }

  // Whether the footprint at posicao reaches the visible ground (plus the margin).
  function dentro(aparencia) {
    const ml = aparencia.pegada[0] * 0.5;
    const ma = aparencia.pegada[1] * 0.5;
    return posicao[0] + ml >= quadroArea[0] && posicao[0] - ml <= quadroArea[2] && posicao[1] + ma >= quadroArea[1] && posicao[1] - ma <= quadroArea[3];
  }

  // Whether the local team sees any of the footprint at posicao (centre and the four corner cells).
  function visivelNaPegada(visao, largura, altura, aparencia) {
    const ml = aparencia.pegada[0] * 0.5 - 0.5;
    const ma = aparencia.pegada[1] * 0.5 - 0.5;
    for (let p = 0; p < 5; p++) {
      const cx = (posicao[0] + (p === 0 ? 0 : p & 1 ? ml : -ml)) | 0;
      const cy = (posicao[1] + (p === 0 ? 0 : p & 2 ? ma : -ma)) | 0;
      if (cx >= 0 && cy >= 0 && cx < largura && cy < altura && visao[cy * largura + cx] === VISAO.VISIVEL) return true;
    }
    return false;
  }

  // Global frame of an animation for a direction step and a time step (both integers, any range).
  function quadroDe(folha, anim, direcao, passo) {
    const d = ((direcao % anim.direcoes) + anim.direcoes) % anim.direcoes;
    const q = anim.laco ? passo % anim.quadros : Math.min(passo, anim.quadros - 1);
    return folha.primeiroQuadro + anim.base + d * anim.quadros + q;
  }

  // Writes one sprite at posicao (and its shadow); quadro, empacotado and chave are integers, alfa is 1 or -1.
  function emitirSprite(quadro, empacotado, aparencia, chave, alfa) {
    const i = brutos.n;
    const camada = aparencia.corpo.temSombra && (modoSombra === 'camada' || (modoSombra === 'recomendado' && aparencia.predio));
    brutos.escrever(posicao[0], posicao[1], posicao[2], 1, quadro, empacotado, camada ? -1 : aparencia.sombraMetros, alfa);
    ordenacao.garantir(i + 1);
    ordenacao.chaves[i] = chave;
    if (alfa > 0 && aparencia.sombraMetros > 0) sombras.escrever(posicao[0], posicao[1], posicao[2], 1, quadro, empacotado, camada ? -1 : aparencia.sombraMetros, alfa);
  }

  function emitirBarra(x, y, z, vida, larguraCelulas, time, selecionada) {
    barras.escrever(x, y, z, vida, larguraCelulas, time, selecionada ? 1 : 0.85, 0);
  }

  // Footprint outline on the ground, centred at (x, y).
  function emitirPegada(x, y, pegada, r, g, b, a) {
    pegadas.escrever(x - pegada[0] * 0.5, y - pegada[1] * 0.5, pegada[0], pegada[1], r, g, b, a);
  }

  function anotarCabo(k, x, y, z) {
    if ((nPendentes + 1) * 4 > pendentes.length) {
      const novos = new Float64Array(pendentes.length * 2);
      novos.set(pendentes);
      pendentes = novos;
    }
    const o = nPendentes++ * 4;
    pendentes[o] = k;
    pendentes[o + 1] = x;
    pendentes[o + 2] = y;
    pendentes[o + 3] = z;
  }

  // Cables from each noted entity to its network node, once every entity of the frame is indexed by slot.
  function resolverCabos(atual) {
    const bandeiras = atual.bandeiras;
    for (let p = 0; p < nPendentes; p++) {
      const o = p * 4;
      const k = pendentes[o];
      const alvo = atual.ligacao[k];
      const j = indicePorSlot[slotDe(alvo)];
      if (j >= atual.n || atual.id[j] !== alvo) continue;
      const aparencia = resolvidas[atual.tipo[j]];
      if (!aparencia) continue;
      const bx = atual.x[j] / FP;
      const by = atual.y[j] / FP;
      const vivo = bandeiras && (bandeiras[k] & BANDEIRA.ENERGIZADO) !== 0 ? 1 : 0;
      cabos.escrever(pendentes[o + 1], pendentes[o + 2], bx + aparencia.caboDx, by, pendentes[o + 3], alturaEm(bx, by) + aparencia.alturaCabo, vivo, atual.dono[k] & 7);
    }
  }

  // Buildings and nodes of others last seen where the local team cannot see now: grey, still, without bars.
  function montarMemorias(fantasmas) {
    if (!fantasmas) return;
    for (let k = 0; k < fantasmas.n; k++) {
      const aparencia = resolvidas[fantasmas.tipo[k]];
      if (!aparencia?.corpo || !aparencia.animParado || !aparencia.predio) continue;
      posicao[0] = fantasmas.x[k] / FP;
      posicao[1] = fantasmas.y[k] / FP;
      if (!dentro(aparencia)) continue;
      posicao[2] = alturaEm(posicao[0], posicao[1]);
      const quadro = quadroDe(aparencia.corpo, aparencia.animParado, 0, 0);
      emitirSprite(quadro, empacotar(fantasmas.dono[k] & 7, 0, FLAGS_SPRITE.MEMORIA, aparencia.vies), aparencia, chaveDe(posicao[1] + aparencia.pegada[1] * 0.5), 1);
    }
  }

  // The building the local player is placing: its footprint (bad cells in red) and its sprite, tinted.
  function montarFantasma() {
    if (!fantasma) return;
    const aparencia = resolvidas[fantasma.tipo];
    const { cx, cy, largura, altura, valido, celulas } = fantasma;
    const cor = valido ? COR_VALIDO : COR_INVALIDO;
    pegadas.escrever(cx, cy, largura, altura, cor[0], cor[1], cor[2], cor[3]);
    if (celulas) {
      for (let i = 0; i < largura * altura; i++) {
        if (celulas[i]) pegadas.escrever(cx + (i % largura), cy + Math.floor(i / largura), 1, 1, COR_INVALIDO[0], COR_INVALIDO[1], COR_INVALIDO[2], 0.55);
      }
    }
    if (!aparencia?.corpo || !aparencia.animParado) return;
    posicao[0] = cx + largura * 0.5;
    posicao[1] = cy + altura * 0.5;
    posicao[2] = alturaEm(posicao[0], posicao[1]);
    const bandeiras = FLAGS_SPRITE.FANTASMA | (valido ? 0 : FLAGS_SPRITE.INVALIDO);
    const i = brutos.n;
    brutos.escrever(posicao[0], posicao[1], posicao[2], 1, quadroDe(aparencia.corpo, aparencia.animParado, 0, 0), empacotar(0, 0, bandeiras, 63), 0, 0.62);
    ordenacao.garantir(i + 1);
    ordenacao.chaves[i] = chaveDe(posicao[1] + altura * 0.5);
  }

  function ordenar() {
    const n = brutos.n;
    const indices = ordenacao.ordenar(n);
    sprites.garantir(n);
    sprites.n = n;
    const origem = brutos.dados;
    const destino = sprites.dados;
    for (let i = 0; i < n; i++) {
      const de = indices[i] * FLOATS_INSTANCIA;
      const para = i * FLOATS_INSTANCIA;
      for (let c = 0; c < FLOATS_INSTANCIA; c++) destino[para + c] = origem[de + c];
    }
  }

  return {
    montar,
    /** @param {Aparencia[]} lista */
    definirAparencias(lista) {
      aparencias = lista;
      versaoFolhas = -1;
    },
    /** @param {'recomendado' | 'alfa' | 'camada'} modo */
    definirModoSombra(modo) {
      modoSombra = modo;
    },
    /**
     * Placement ghost: kind, top-left cell, footprint in cells, validity and, optionally, one byte per footprint cell
     * (1 = this cell is why it is invalid); null removes it.
     * @param {{ tipo: number, cx: number, cy: number, largura: number, altura: number, valido: boolean, celulas?: Uint8Array } | null} f
     */
    definirFantasma(f) {
      fantasma = f;
    },
    sprites,
    sombras,
    aneis,
    barras,
    pegadas,
    cabos,
  };
}
