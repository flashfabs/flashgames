// Units for the renderer: matches entities between the last two snapshots by id with generation, interpolates
// position and facings, culls to the visible ground and to the fog, and writes the sprite (sorted back to front),
// shadow, selection ring and health bar instances into preallocated buffers. Nothing is allocated per frame.
import { FLOATS_INSTANCIA } from './backend-webgl2.js';
import { criarOrdenacao, chave16 } from './ordenacao.js';
import { quadroGlobal, pontoDeEncaixe } from './sprites.js';
import { FP, PASSOS_POR_SEGUNDO, slotDe } from '../sim/contratos.js';

const PASSO_MS = 1000 / PASSOS_POR_SEGUNDO;
const MARGEM_CELULAS = 2;
const VERDE_SELECAO = [0.35, 1.0, 0.45];

/**
 * Look of each unit kind: sheet variants in order of preference (the first whose body sheet is loaded wins; a
 * variant without turret has it drawn into the body), ring radius and shadow height. The data front will move
 * this into the unit data; until then the prototype's two kinds live here.
 * @typedef {{ variantes: { corpo: string, torre?: string }[], raio: number, sombraMetros: number }} Aparencia
 */
export const APARENCIAS_PADRAO = Object.freeze([
  { variantes: [{ corpo: 'ficha-veiculo-leve', torre: 'ficha-veiculo-leve' }], raio: 0.42, sombraMetros: 0.9 },
  { variantes: [{ corpo: 'prototipo-tanque' }, { corpo: 'ficha-tanque', torre: 'ficha-tanque' }], raio: 0.55, sombraMetros: 1.4 },
]);

// Angle 0..255 (float) between two integer facings, along the shortest turn.
function interpolarAngulo(a, b, alfa) {
  const d = ((b - a + 128) & 255) - 128;
  return (((a + d * alfa) % 256) + 256) % 256;
}

class Instancias {
  constructor(capacidade) {
    this.dados = new Float32Array(capacidade * FLOATS_INSTANCIA);
    this.n = 0;
  }

  // Grows the buffer to hold n instances (only when the unit count grows past the largest seen).
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
}

/**
 * @param {{ projecao: ReturnType<typeof import('./projecao.js').criarProjecao>, folhas: ReturnType<typeof import('./sprites.js').criarFolhas> }} deps
 */
export function criarMontagemUnidades({ projecao, folhas }) {
  let aparencias = APARENCIAS_PADRAO;
  // resolved sheets per kind, refreshed when a sheet finishes loading
  let resolvidas = [];
  let versaoFolhas = -1;
  const brutos = new Instancias(4096);
  const sprites = new Instancias(4096);
  const sombras = new Instancias(4096);
  const aneis = new Instancias(512);
  const barras = new Instancias(1024);
  const ordenacao = criarOrdenacao(4096);
  const encaixe = new Float64Array(3);

  function resolver() {
    if (versaoFolhas === folhas.totalQuadros) return;
    versaoFolhas = folhas.totalQuadros;
    resolvidas = aparencias.map(a => {
      const variante = a.variantes.find(v => folhas.folha(v.corpo)) ?? null;
      const corpo = variante ? folhas.folha(variante.corpo) : null;
      const torre = variante?.torre ? folhas.folha(variante.torre) : null;
      return {
        ...a,
        corpo,
        animParado: corpo?.animacoes.get('parado') ?? corpo?.animacoes.values().next().value ?? null,
        animAndando: corpo?.animacoes.get('andando') ?? null,
        torre,
        animTorre: torre?.animacoes.get('torre') ?? null,
      };
    });
  }

  /**
   * @param {object} p
   * @param {{ anterior: any, atual: any, mapa: any, chegadaAtual: number, jogadorLocal: number }} p.estado
   * @param {Float64Array | number[]} p.area visible ground [x0, y0, x1, y1] in cells
   * @param {Set<number>} p.selecionadas ids with generation
   * @param {(x: number, y: number) => boolean} p.visivel
   * @param {number} p.agora
   */
  function montar({ estado, area, selecionadas, visivel, agora }) {
    brutos.n = sprites.n = sombras.n = aneis.n = barras.n = 0;
    const { anterior, atual } = estado;
    if (!atual) return;
    resolver();
    const alfa = Math.min(1, (agora - estado.chegadaAtual) / PASSO_MS);
    const x0 = area[0] - MARGEM_CELULAS;
    const y0 = area[1] - MARGEM_CELULAS;
    const x1 = area[2] + MARGEM_CELULAS;
    const y1 = area[3] + MARGEM_CELULAS;
    const tempoTick = atual.tick + alfa;
    let j = 0; // walks the previous snapshot alongside the current one, both in slot order
    for (let k = 0; k < atual.n; k++) {
      const id = atual.id[k];
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
          corpo = interpolarAngulo(anterior.dirCorpo[j], atual.dirCorpo[k], alfa);
          torre = interpolarAngulo(anterior.dirTorre[j], atual.dirTorre[k], alfa);
        }
      }
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const dono = atual.dono[k];
      if (dono !== estado.jogadorLocal && !visivel(x, y)) continue;
      const aparencia = resolvidas[atual.tipo[k]] ?? resolvidas[0];
      if (!aparencia?.corpo || !aparencia.animParado) continue;
      const time = dono & 7;
      const chave = chave16(y, y0, y1);
      const tempoS = (tempoTick - atual.inicioAnim[k]) / PASSOS_POR_SEGUNDO;
      const anim = andando && aparencia.animAndando ? aparencia.animAndando : aparencia.animParado;
      const quadro = quadroGlobal(aparencia.corpo, anim, corpo, tempoS);
      emitirSprite(x, y, 0, quadro, time, aparencia.sombraMetros, chave);
      if (aparencia.torre && aparencia.animTorre) {
        let tx = x;
        let ty = y;
        let tz = 0;
        if (pontoDeEncaixe(aparencia.corpo, 'encaixe_torre', quadro - aparencia.corpo.primeiroQuadro, projecao, encaixe)) {
          tx += encaixe[0];
          ty += encaixe[1];
          tz = encaixe[2];
        }
        emitirSprite(tx, ty, tz, quadroGlobal(aparencia.torre, aparencia.animTorre, torre, tempoS), time, aparencia.sombraMetros, chave);
      }
      const selecionada = selecionadas.has(id);
      if (selecionada) {
        const o = aneis.proxima();
        const a = aneis.dados;
        a[o] = x;
        a[o + 1] = y;
        a[o + 2] = aparencia.raio;
        a[o + 3] = 2;
        a[o + 4] = VERDE_SELECAO[0];
        a[o + 5] = VERDE_SELECAO[1];
        a[o + 6] = VERDE_SELECAO[2];
        a[o + 7] = 0.9;
      }
      if (selecionada || atual.vida[k] < 255) {
        const o = barras.proxima();
        const b = barras.dados;
        b[o] = x;
        b[o + 1] = y;
        b[o + 2] = aparencia.corpo.alturaBarraMetros;
        b[o + 3] = atual.vida[k] / 255;
        b[o + 4] = aparencia.raio * 1.5;
        b[o + 5] = time;
        b[o + 6] = selecionada ? 1 : 0.85;
        b[o + 7] = 0;
      }
    }
    ordenar();
  }

  function emitirSprite(x, y, z, quadro, time, sombraMetros, chave) {
    const i = brutos.n;
    const o = brutos.proxima();
    const d = brutos.dados;
    d[o] = x;
    d[o + 1] = y;
    d[o + 2] = z;
    d[o + 3] = 1;
    d[o + 4] = quadro;
    d[o + 5] = time;
    d[o + 6] = sombraMetros;
    d[o + 7] = 1;
    ordenacao.garantir(i + 1);
    ordenacao.chaves[i] = chave;
    const s = sombras.proxima();
    for (let c = 0; c < FLOATS_INSTANCIA; c++) sombras.dados[s + c] = d[o + c];
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
    sprites,
    sombras,
    aneis,
    barras,
  };
}
