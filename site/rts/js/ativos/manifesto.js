// Sprite manifest reader (contract C9, written by the art pipeline): pages per level, frame rectangles,
// animation layout and attachment points per frame. No GL here; the renderer uploads what this returns.
//
// Frame entry: [page, x, y, width, height, offsetX, offsetY], where the offset goes from the anchor (the
// ground point under the model pivot) to the top-left corner of the trimmed frame, in pixels of the level.
// Frame index: base(animation) + direction * frames + frame, animations in the order they are listed.

export const NIVEIS = Object.freeze(['hd', 'uhd']);
export const PONTOS = Object.freeze(['encaixe_torre', 'boca', 'escape', 'topo']);
const CAMPOS_QUADRO = 7;

/**
 * @typedef {{ nome: string, camada: string, quadros: number, fps: number, laco: boolean, direcoes: number, base: number }} Animacao
 * @typedef {{ paginas: { cor: string, time: string | null, largura: number, altura: number }[], quadros: Float32Array, pontos: Record<string, Float32Array>, pxPorCelula: number | null }} Nivel
 */

/**
 * Validates a manifest and turns it into lookup tables.
 * @param {any} m parsed JSON
 * @param {string | URL} [base] URL the page file names are relative to
 */
export function lerManifesto(m, base) {
  const falha = mensagem => {
    throw new Error(`manifesto ${m?.asset ?? '?'}: ${mensagem}`);
  };
  if (!m || typeof m !== 'object') falha('não é um objeto');
  if (!Number.isInteger(m.versao) || m.versao < 1) falha('versao inválida');
  if (typeof m.asset !== 'string' || !/^[a-z0-9-]+$/.test(m.asset)) falha('asset precisa ser um id em minúsculas com hífens');
  if (!Number.isInteger(m.direcoes) || m.direcoes < 1 || m.direcoes > 64) falha('direcoes fora de 1..64');
  if ((m.angulo0 ?? 'leste') !== 'leste' || (m.sentido ?? 'horario-na-tela') !== 'horario-na-tela') falha('só leste e horario-na-tela são aceitos');
  if (!m.animacoes || typeof m.animacoes !== 'object') falha('animacoes ausente');

  /** @type {Animacao[]} */
  const animacoes = [];
  let total = 0;
  for (const [nome, a] of Object.entries(m.animacoes)) {
    const direcoes = a.direcoes ?? m.direcoes;
    if (!Number.isInteger(a.quadros) || a.quadros < 1) falha(`animação ${nome}: quadros inválido`);
    if (!Number.isInteger(direcoes) || direcoes < 1) falha(`animação ${nome}: direcoes inválido`);
    animacoes.push({ nome, camada: a.camada ?? 'corpo', quadros: a.quadros, fps: a.fps ?? 0, laco: a.laco ?? true, direcoes, base: total });
    total += direcoes * a.quadros;
  }
  if (total === 0) falha('nenhuma animação');

  const niveis = {};
  for (const nivel of NIVEIS) {
    const paginas = m.paginas?.[nivel];
    const quadros = m.quadros?.[nivel];
    if (!paginas && !quadros) continue;
    if (!Array.isArray(paginas) || paginas.length === 0) falha(`${nivel}: paginas ausente`);
    if (!Array.isArray(quadros) || quadros.length !== total) falha(`${nivel}: esperava ${total} quadros, veio ${quadros?.length}`);
    const tabela = new Float32Array(total * CAMPOS_QUADRO);
    quadros.forEach((q, i) => {
      if (!Array.isArray(q) || q.length !== CAMPOS_QUADRO || q.some(v => !Number.isFinite(v))) falha(`${nivel}: quadro ${i} malformado`);
      const pagina = paginas[q[0]];
      if (!pagina) falha(`${nivel}: quadro ${i} aponta para a página ${q[0]}, que não existe`);
      if (q[1] < 0 || q[2] < 0 || q[3] < 0 || q[4] < 0 || q[1] + q[3] > pagina.largura || q[2] + q[4] > pagina.altura) {
        falha(`${nivel}: quadro ${i} sai da página`);
      }
      tabela.set(q, i * CAMPOS_QUADRO);
    });
    const resolver = arquivo => (arquivo && base ? new URL(arquivo, base).href : arquivo ?? null);
    niveis[nivel] = {
      paginas: paginas.map((p, i) => {
        if (typeof p.cor !== 'string' || !(p.largura > 0) || !(p.altura > 0)) falha(`${nivel}: página ${i} malformada`);
        return { cor: resolver(p.cor), time: resolver(p.time), largura: p.largura, altura: p.altura };
      }),
      quadros: tabela,
      pontos: lerPontos(m, nivel, total, falha),
      // px per cell the frames were drawn at, when it differs from projecao.json (the prototype's tank)
      pxPorCelula: m.pxPorCelula?.[nivel] ?? null,
    };
  }
  if (Object.keys(niveis).length === 0) falha('nenhum nível (hd ou uhd)');

  const porNome = new Map(animacoes.map(a => [a.nome, a]));
  return {
    asset: m.asset,
    tipo: m.tipo ?? 'unidade',
    direcoes: m.direcoes,
    camadas: m.camadas ?? ['corpo'],
    animacoes,
    totalQuadros: total,
    niveis,
    /** @param {string} nome */
    animacao(nome) {
      return porNome.get(nome) ?? null;
    },
  };
}

function lerPontos(m, nivel, total, falha) {
  const pontos = {};
  const fonte = m.pontos?.[nivel];
  const fonteUhd = nivel === 'hd' && !fonte ? m.pontos?.uhd : null;
  for (const nome of PONTOS) {
    const lista = fonte?.[nome] ?? fonteUhd?.[nome];
    if (!lista) continue;
    if (!Array.isArray(lista) || lista.length !== total) falha(`${nivel}: pontos.${nome} precisa de um par por quadro`);
    const escala = fonteUhd ? 0.5 : 1;
    // NaN marks a frame without the point (the part is hidden in that frame)
    const tabela = new Float32Array(total * 2);
    lista.forEach((p, i) => {
      tabela[i * 2] = p ? p[0] * escala : NaN;
      tabela[i * 2 + 1] = p ? p[1] * escala : NaN;
    });
    pontos[nome] = tabela;
  }
  return pontos;
}

/**
 * Direction index for a map angle in 0..255 (0 east, clockwise on screen).
 * @param {number} angulo256
 * @param {number} direcoes
 */
export function direcaoDoAngulo(angulo256, direcoes) {
  return Math.round((angulo256 * direcoes) / 256) % direcoes;
}

/**
 * Frame index of an animation at a direction and a time.
 * @param {Animacao} a
 * @param {number} direcao
 * @param {number} tempoS seconds since the animation started
 */
export function quadroDaAnimacao(a, direcao, tempoS) {
  // an animation stamped in the future (snapshot ahead of the clock) holds its first frame
  let quadro = a.fps > 0 && tempoS > 0 ? Math.floor(tempoS * a.fps) : 0;
  quadro = a.laco ? quadro % a.quadros : Math.min(quadro, a.quadros - 1);
  return a.base + (direcao % a.direcoes) * a.quadros + quadro;
}

/** Fetches a manifest and reads it, resolving page names against the manifest URL. */
export async function carregarManifesto(url) {
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error(`manifesto ${url}: HTTP ${resposta.status}`);
  return lerManifesto(await resposta.json(), resposta.url || url);
}

/**
 * Decodes one atlas page for texSubImage3D without colour conversion. Colour pages are premultiplied here,
 * because WebGL ignores its own premultiply flag for ImageBitmap sources; masks are left as they are.
 * @param {string} url
 * @param {boolean} premultiplicar
 */
export async function carregarImagem(url, premultiplicar) {
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error(`imagem ${url}: HTTP ${resposta.status}`);
  return createImageBitmap(await resposta.blob(), { premultiplyAlpha: premultiplicar ? 'premultiply' : 'none', colorSpaceConversion: 'none' });
}

/**
 * Chooses the level to load: the wanted one when the manifest has it, otherwise the other one.
 * @param {ReturnType<typeof lerManifesto>} manifesto
 * @param {'hd' | 'uhd'} desejado
 */
export function nivelDisponivel(manifesto, desejado) {
  if (manifesto.niveis[desejado]) return desejado;
  return desejado === 'uhd' ? 'hd' : 'uhd';
}
